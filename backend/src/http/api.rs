use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json,
    extract::{ConnectInfo, Path, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::auth::LoginError;

use super::{App, error::HttpError, peer, storage_work};

#[derive(Deserialize)]
pub struct Credentials {
    username: String,
    password: String,
}

#[derive(Deserialize)]
pub struct Extraction {
    password: Option<String>,
}

pub async fn login(
    State(app): State<Arc<App>>,
    connect: ConnectInfo<SocketAddr>,
    payload: Result<Json<Credentials>, JsonRejection>,
) -> Result<Json<Value>, HttpError> {
    if !app.login_limit.attempt(peer(connect)) {
        return Err(HttpError::limited());
    }
    let Json(credentials) = payload.map_err(|_| HttpError::invalid())?;
    let token = app
        .auth
        .login(&credentials.username, &credentials.password)
        .map_err(|error| match error {
            LoginError::Invalid => HttpError::new(StatusCode::UNAUTHORIZED, "invalid_credentials"),
            LoginError::PasswordCooldown(wait) => HttpError::password_cooldown(wait),
            LoginError::Capacity => HttpError::limited(),
            LoginError::Entropy => HttpError::internal(),
        })?;
    tracing::debug!("Login session issued");
    Ok(Json(json!({ "token": token })))
}

pub async fn logout(State(app): State<Arc<App>>, headers: HeaderMap) -> StatusCode {
    if let Some(token) = token(&headers) {
        app.auth.logout(token);
    }
    StatusCode::NO_CONTENT
}

fn token(headers: &HeaderMap) -> Option<&str> {
    headers.get("x-pigeon-token")?.to_str().ok()
}

pub fn authenticated(app: &App, headers: &HeaderMap) -> Result<String, HttpError> {
    token(headers)
        .and_then(|token| app.auth.username(token))
        .ok_or_else(HttpError::unauthorized)
}

pub async fn storage(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
) -> Result<Json<Value>, HttpError> {
    authenticated(&app, &headers)?;
    let store = app.store.clone();
    let bytes = storage_work(move || store.available_bytes()).await?;
    Ok(Json(json!({ "available_bytes": bytes })))
}

pub async fn extract_link(
    State(app): State<Arc<App>>,
    connect: ConnectInfo<SocketAddr>,
    Path(id): Path<String>,
    payload: Result<Json<Extraction>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), HttpError> {
    if id.len() != 32
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(HttpError::missing());
    }
    if !app.extraction_limit.attempt((peer(connect), id.clone())) {
        return Err(HttpError::limited());
    }
    let Json(extraction) = payload.map_err(|_| HttpError::invalid())?;
    let store = app.store.clone();
    let link = storage_work(move || store.issue_link(&id, extraction.password.as_deref())).await?;
    tracing::debug!(expires_at = link.expires_at, "Download link issued");
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "download_url": app.sharing_path("download", &link.token),
            "expires_at": link.expires_at,
            "filename": link.filename,
            "size_bytes": link.size_bytes,
        })),
    ))
}
