use std::{fs, path::PathBuf, time::Duration};

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::*;

const FILE_BYTES: &[u8] = b"pigeon testing";

struct TestData(PathBuf);

impl TestData {
    fn new() -> Self {
        let mut random = [0; 8];
        getrandom::fill(&mut random).unwrap();
        let name = format!("pigeon-http-{:016x}", u64::from_ne_bytes(random));
        let path = std::env::temp_dir().join(name);
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn router(&self, prefix: &str) -> Router {
        router(Arc::new(
            App::new(
                prefix.parse().unwrap(),
                HashMap::from([("test".to_owned(), "password".to_owned())]),
                Store::open(&self.0).unwrap(),
            )
            .unwrap(),
        ))
        .layer(axum::Extension(ConnectInfo(
            "127.0.0.1:40000".parse::<SocketAddr>().unwrap(),
        )))
    }
}

impl Drop for TestData {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn applies_exact_root_paths_and_requires_session() {
    let data = TestData::new();
    let app = data.router("/");
    for path in ["/", "/robots.txt"] {
        assert_eq!(
            call(&app, "GET", path, &[], Body::empty()).await.status(),
            StatusCode::OK
        );
    }
    for path in [
        "/missing",
        "/robots.txt/",
        "/sharing",
        "/sharing?id=bad",
        "/sharing?download=bad",
        "/api/missing",
    ] {
        assert_eq!(
            call(&app, "GET", path, &[], Body::empty()).await.status(),
            StatusCode::NOT_FOUND
        );
    }
    let response = call(
        &app,
        "GET",
        "/api/storage",
        &[("Authorization", "Basic example")],
        Body::empty(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn anonymous_download_survives_last_extraction_and_same_data_restart() {
    let data = TestData::new();
    let app = data.router("/pigeon");
    let session = post_json(
        &app,
        "/pigeon/api/sessions",
        json!({"username": "test", "password": "password"}),
    )
    .await;
    assert_eq!(session.status(), StatusCode::OK);
    let session = read_json(session).await;
    let token = session["token"].as_str().unwrap();

    let login_retry = post_json(
        &app,
        "/pigeon/api/sessions",
        json!({"username": "test", "password": "wrong"}),
    )
    .await;
    assert_eq!(login_retry.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(login_retry.headers().contains_key("retry-after"));
    assert_eq!(read_json(login_retry).await["error"], "password_cooldown");

    let mut payload =
        b"--pigeon\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\r\n"
            .to_vec();
    payload.extend(FILE_BYTES);
    payload.extend(b"\r\n--pigeon\r\nContent-Disposition: form-data; name=\"max_downloads\"\r\n\r\n1\r\n--pigeon\r\nContent-Disposition: form-data; name=\"password\"\r\n\r\nP1GEON\r\n--pigeon--\r\n");
    let upload = call(
        &app,
        "POST",
        "/pigeon/api/shares",
        &[
            ("Content-Type", "multipart/form-data; boundary=pigeon"),
            ("X-Pigeon-Token", token),
        ],
        Body::from(payload),
    )
    .await;
    assert_eq!(upload.status(), StatusCode::CREATED);
    let upload = read_json(upload).await;
    assert!(upload["expires_at"].is_null());
    let share = upload["share_url"].as_str().unwrap();
    let id = share.split_once("?id=").unwrap().1;
    let extract = format!("/pigeon/api/shares/{id}/download-links");

    let password_link = format!("{share}&password=P1GEON");
    for path in [share, &password_link] {
        let response = call(&app, "GET", path, &[], Body::empty()).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let (_, meta) = std::str::from_utf8(&body)
            .unwrap()
            .split_once("name=\"pigeon-bootstrap\" content=\"")
            .unwrap();
        let (encoded, _) = meta.split_once('"').unwrap();
        let bootstrap: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(encoded).unwrap()).unwrap();
        assert_eq!(bootstrap["share"]["requires_password"], true);
        assert!(bootstrap["share"].get("filename").is_none());
        assert!(bootstrap["share"].get("size_bytes").is_none());
    }

    let wrong = post_json(&app, &extract, json!({"password": "wrong"})).await;
    assert_eq!(wrong.status(), StatusCode::FORBIDDEN);
    assert_eq!(read_json(wrong).await, json!({"error": "invalid_password"}));

    let retry = post_json(&app, &extract, json!({"password": "P1GEON"})).await;
    assert_eq!(retry.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(matches!(
        retry.headers()["retry-after"].to_str().unwrap(),
        "1" | "2" | "3"
    ));
    assert_eq!(read_json(retry).await["error"], "password_cooldown");

    tokio::time::sleep(Duration::from_secs(3)).await;
    let direct = post_json(&app, &extract, json!({"password": "P1GEON"})).await;
    assert_eq!(direct.status(), StatusCode::CREATED);
    let direct = read_json(direct).await;
    assert_eq!(direct["filename"], "test.txt");
    assert_eq!(direct["size_bytes"], FILE_BYTES.len());
    let direct = direct["download_url"].as_str().unwrap();
    let direct_with_password = format!("{direct}&password=P1GEON");
    assert_eq!(
        call(&app, "GET", &direct_with_password, &[], Body::empty())
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "GET", share, &[], Body::empty()).await.status(),
        StatusCode::NOT_FOUND
    );

    let logout = call(
        &app,
        "DELETE",
        "/pigeon/api/sessions",
        &[("X-Pigeon-Token", token)],
        Body::empty(),
    )
    .await;
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
    let after_logout = call(
        &app,
        "GET",
        "/pigeon/api/storage",
        &[("X-Pigeon-Token", token)],
        Body::empty(),
    )
    .await;
    assert_eq!(after_logout.status(), StatusCode::UNAUTHORIZED);
    let fresh = post_json(
        &app,
        "/pigeon/api/sessions",
        json!({"username": "test", "password": "password"}),
    )
    .await;
    let fresh = read_json(fresh).await;
    let token = fresh["token"].as_str().unwrap();

    // A new application instance must use the persisted direct link, but a
    // session created before restart belongs to the previous process.
    drop(app);
    let app = data.router("/pigeon");
    let response = call(
        &app,
        "GET",
        "/pigeon/api/storage",
        &[("X-Pigeon-Token", token)],
        Body::empty(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let response = call(
        &app,
        "GET",
        direct,
        &[("Range", "bytes=2-6")],
        Body::empty(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()["content-range"], "bytes 2-6/14");
    assert_eq!(
        to_bytes(response.into_body(), 100).await.unwrap(),
        &FILE_BYTES[2..=6]
    );
    let response = call(&app, "HEAD", direct, &[], Body::empty()).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-length"], "14");
}

async fn post_json(app: &Router, path: &str, value: Value) -> Response {
    call(
        app,
        "POST",
        path,
        &[("Content-Type", "application/json")],
        Body::from(value.to_string()),
    )
    .await
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: Body,
) -> Response {
    let mut request = Request::builder().method(method).uri(path);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    app.clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap()
}

async fn read_json(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap()
}
