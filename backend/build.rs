use std::{
    env,
    fmt::Write as _,
    fs,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
};

const EMPTY_ASSETS: &str = "const ASSETS: &[(&str, &[u8])] = &[];\n";

fn main() {
    let frontend = Path::new("../frontend/dist");
    // Cargo scans the directory so a changed, added, or rebuilt chunk refreshes the table.
    println!("cargo:rerun-if-changed={}", frontend.display());
    let (html, assets) = match pack_frontend(frontend) {
        Ok(frontend) => frontend,
        Err(error)
            if error.kind() == ErrorKind::NotFound
                && env::var("PROFILE").as_deref() == Ok("debug") =>
        {
            (String::new(), EMPTY_ASSETS.to_owned())
        }
        Err(error) => panic!("Build the frontend before packaging Pigeon: {error}"),
    };

    let output = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    fs::write(output.join("pigeon.html"), html).expect("write embedded frontend HTML");
    fs::write(output.join("pigeon_assets.rs"), assets).expect("write embedded asset table");
}

fn pack_frontend(frontend: &Path) -> io::Result<(String, String)> {
    let html = fs::read_to_string(frontend.join("index.html"))?;
    let mut entries = fs::read_dir(frontend.join("assets"))?.collect::<io::Result<Vec<_>>>()?;
    if entries.is_empty()
        || !html.contains("__PIGEON_BOOTSTRAP__")
        || !html.contains("src=\"__PIGEON_ASSETS__/")
    {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "missing frontend bootstrap or entry assets",
        ));
    }

    entries.sort_unstable_by_key(|entry| entry.file_name());
    let mut source = String::from("const ASSETS: &[(&str, &[u8])] = &[\n");
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| io::Error::new(ErrorKind::InvalidData, "asset filename must be UTF-8"))?;
        if !entry.file_type()?.is_file() {
            return Err(io::Error::new(
                ErrorKind::InvalidData,
                format!("expected a flat frontend asset file: {name}"),
            ));
        }

        // Resolve relative to the checkout so generated Rust need not encode an OS path.
        writeln!(
            source,
            "    ({name:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/../frontend/dist/assets/\", {name:?}))),",
        )
        .expect("write asset table entry");
    }
    source.push_str("];\n");
    Ok((html, source))
}
