use std::{env, fs, io::ErrorKind, path::PathBuf};

fn main() {
    let source = "../frontend/dist/index.html";
    println!("cargo:rerun-if-changed={source}");
    let html = match fs::read_to_string(source) {
        Ok(html) => {
            assert!(
                html.contains("__PIGEON_BOOTSTRAP__"),
                "missing frontend bootstrap"
            );
            html
        }
        Err(error)
            if error.kind() == ErrorKind::NotFound
                && env::var("PROFILE").as_deref() == Ok("debug") =>
        {
            String::new()
        }
        Err(error) => panic!("Build the frontend before packaging Pigeon: {error}"),
    };
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    fs::write(output.join("pigeon.html"), html).expect("write embedded frontend");
}
