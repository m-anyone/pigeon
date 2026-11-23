use std::{io, sync::Arc};

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderValue, header},
    response::{Html, IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;

use crate::config::BasePath;

use super::{App, error::HttpError};

const TEMPLATE: &str = include_str!(concat!(env!("OUT_DIR"), "/pigeon.html"));
include!(concat!(env!("OUT_DIR"), "/pigeon_assets.rs"));
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
const PRODUCTION_CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'";

pub struct Frontend {
    html: Bytes,
    csp: Option<HeaderValue>,
}

impl Frontend {
    pub fn new(base: &BasePath) -> io::Result<Self> {
        let (template, csp) = if cfg!(debug_assertions)
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

            (
                DEV_HTML.replace("__PIGEON_VITE_ORIGIN__", origin.trim_end_matches('/')),
                None,
            )
        } else {
            let template = if TEMPLATE.is_empty() {
                EMPTY_FRONTEND
            } else {
                TEMPLATE
            };
            (
                template.replace("__PIGEON_ASSETS__", &base.path("/assets")),
                Some(HeaderValue::from_static(PRODUCTION_CSP)),
            )
        };

        // Base64url keeps dynamic data out of the HTML and script grammars.
        let data = serde_json::to_vec(&Bootstrap {
            base_path: base.home(),
        })
        .map_err(io::Error::other)?;
        let html = template.replacen("__PIGEON_BOOTSTRAP__", &URL_SAFE_NO_PAD.encode(data), 1);
        Ok(Self {
            html: Bytes::from(html),
            csp,
        })
    }

    fn render(&self) -> Response {
        let mut response = Html(self.html.clone()).into_response();
        if let Some(csp) = &self.csp {
            response
                .headers_mut()
                .insert(header::CONTENT_SECURITY_POLICY, csp.clone());
        }
        response
    }
}

#[derive(Serialize)]
struct Bootstrap<'a> {
    base_path: &'a str,
}

pub async fn home(State(app): State<Arc<App>>) -> Response {
    app.frontend.render()
}

pub async fn asset(Path(name): Path<String>) -> Result<impl IntoResponse, HttpError> {
    // Only the asset names captured at build time are available over HTTP.
    let (_, bytes) = ASSETS
        .iter()
        .find(|(asset_name, _)| *asset_name == name)
        .ok_or_else(HttpError::missing)?;
    let content_type = match name.rsplit_once('.').map(|(_, suffix)| suffix) {
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        _ => return Err(HttpError::missing()),
    };
    Ok(([(header::CONTENT_TYPE, content_type)], *bytes))
}

pub async fn robots() -> &'static str {
    "User-agent: *\nDisallow: /\n"
}
