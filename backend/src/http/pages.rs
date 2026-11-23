use std::{io, sync::Arc};

use axum::{
    extract::{Query, State, rejection::QueryRejection},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{App, download, error::HttpError, storage_work};

const TEMPLATE: &str = include_str!(concat!(env!("OUT_DIR"), "/pigeon.html"));
const MARKER: &str = "__PIGEON_BOOTSTRAP__";
const EMPTY_FRONTEND: &str = r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="pigeon-bootstrap" content="__PIGEON_BOOTSTRAP__">
  <title>Pigeon 信鸽</title>
</head>
<body><p>启动 Vite 开发服务, 或构建前端后重新编译 Pigeon。</p></body>
</html>"#;
const DEV_HTML: &str = include_str!("vite.html");

pub struct Frontend {
    template: String,
    csp: Option<HeaderValue>,
}

impl Frontend {
    pub fn new() -> io::Result<Self> {
        if cfg!(debug_assertions)
            && let Ok(origin) = std::env::var("PIGEON_VITE_ORIGIN")
        {
            let uri = origin
                .parse::<axum::http::Uri>()
                .map_err(io::Error::other)?;
            if uri.scheme_str() != Some("http")
                || !matches!(uri.host(), Some("localhost" | "127.0.0.1"))
                || uri.port_u16().is_none()
                || uri.path() != "/"
                || uri.query().is_some()
            {
                return Err(io::Error::other(
                    "PIGEON_VITE_ORIGIN must be a local HTTP origin with a port",
                ));
            }

            return Ok(Self {
                template: DEV_HTML.replace("__PIGEON_VITE_ORIGIN__", origin.trim_end_matches('/')),
                csp: None,
            });
        }

        let template = if TEMPLATE.is_empty() {
            EMPTY_FRONTEND
        } else {
            TEMPLATE
        };
        let scripts = script_hashes(template)?;
        let source = if scripts.is_empty() {
            "'none'"
        } else {
            &scripts
        };
        let policy = format!(
            "default-src 'none'; script-src {source}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"
        );
        Ok(Self {
            template: template.to_owned(),
            csp: Some(policy.parse().map_err(io::Error::other)?),
        })
    }

    fn render(&self, bootstrap: Bootstrap<'_>) -> Result<Response, HttpError> {
        // Base64url keeps dynamic data out of the HTML and script grammars.
        let data = serde_json::to_vec(&bootstrap).map_err(|_| HttpError::internal())?;
        let html = self
            .template
            .replacen(MARKER, &URL_SAFE_NO_PAD.encode(data), 1);
        let mut response = Html(html).into_response();
        if let Some(csp) = &self.csp {
            response
                .headers_mut()
                .insert(header::CONTENT_SECURITY_POLICY, csp.clone());
        }
        Ok(response)
    }
}

fn script_hashes(mut html: &str) -> io::Result<String> {
    let mut hashes = Vec::new();
    while let Some((_, script)) = html.split_once("<script") {
        let (tag, script) = script
            .split_once('>')
            .ok_or_else(|| io::Error::other("Invalid script tag"))?;
        let (body, rest) = script
            .split_once("</script>")
            .ok_or_else(|| io::Error::other("Missing script end tag"))?;
        if tag
            .split_ascii_whitespace()
            .any(|attribute| attribute.starts_with("src="))
        {
            return Err(io::Error::other("The frontend must embed its scripts"));
        }
        // HTML parsing normalizes line endings before applying an inline hash.
        let body = body.replace("\r\n", "\n").replace('\r', "\n");
        hashes.push(format!(
            "'sha256-{}'",
            STANDARD.encode(Sha256::digest(body.as_bytes()))
        ));
        html = rest;
    }
    Ok(hashes.join(" "))
}

#[derive(Serialize)]
struct Bootstrap<'a> {
    base_path: &'a str,
    page: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    share: Option<ShareBootstrap>,
}

#[derive(Serialize)]
struct ShareBootstrap {
    id: String,
    requires_password: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SharingQuery {
    id: Option<String>,
    download: Option<String>,
    password: Option<String>,
}

pub async fn home(State(app): State<Arc<App>>) -> Result<Response, HttpError> {
    app.frontend.render(Bootstrap {
        base_path: app.base.home(),
        page: "home",
        share: None,
    })
}

pub async fn sharing(
    State(app): State<Arc<App>>,
    method: Method,
    headers: HeaderMap,
    query: Result<Query<SharingQuery>, QueryRejection>,
) -> Result<Response, HttpError> {
    let Query(query) = query.map_err(|_| HttpError::missing())?;
    match (query.id, query.download, query.password) {
        // The browser reads this parameter. The extraction API checks the password.
        (Some(id), None, _) => {
            let store = app.store.clone();
            let share = match storage_work(move || store.share(&id)).await {
                Ok(share) => share,
                Err(error) if error.0 == StatusCode::NOT_FOUND => return unavailable(&app),
                Err(error) => return Err(error),
            };
            let is_public = !share.requires_password;
            app.frontend.render(Bootstrap {
                base_path: app.base.home(),
                page: "sharing",
                share: Some(ShareBootstrap {
                    id: share.id,
                    requires_password: share.requires_password,
                    filename: is_public.then_some(share.filename),
                    size_bytes: is_public.then_some(share.size_bytes),
                }),
            })
        }
        (None, Some(token), None) => download::download(app, method, headers, token).await,
        (None, None, None) => unavailable(&app),
        _ => Err(HttpError::missing()),
    }
}

pub async fn robots() -> &'static str {
    "User-agent: *\nDisallow: /\n"
}

fn unavailable(app: &App) -> Result<Response, HttpError> {
    let mut response = app.frontend.render(Bootstrap {
        base_path: app.base.home(),
        page: "sharing",
        share: None,
    })?;
    *response.status_mut() = StatusCode::NOT_FOUND;
    Ok(response)
}
