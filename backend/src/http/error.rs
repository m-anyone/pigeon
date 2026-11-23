use std::time::Duration;

use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::store::StoreError;

pub struct HttpError(pub StatusCode, &'static str, Option<u64>);

impl HttpError {
    pub const fn new(status: StatusCode, code: &'static str) -> Self {
        Self(status, code, None)
    }

    pub fn password_cooldown(wait: Duration) -> Self {
        let seconds = wait.as_secs() + u64::from(wait.subsec_nanos() != 0);
        Self(
            StatusCode::TOO_MANY_REQUESTS,
            "password_cooldown",
            Some(seconds),
        )
    }

    pub const fn invalid() -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_request")
    }

    pub const fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized")
    }

    pub const fn missing() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found")
    }

    pub const fn limited() -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "rate_limited")
    }

    pub const fn disk_full() -> Self {
        Self::new(StatusCode::INSUFFICIENT_STORAGE, "insufficient_space")
    }

    pub fn internal() -> Self {
        tracing::error!("Internal request failure");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
    }
}

impl From<std::io::Error> for HttpError {
    fn from(error: std::io::Error) -> Self {
        tracing::debug!(
            kind = ?error.kind(),
            os_code = ?error.raw_os_error(),
            "File I/O error"
        );
        if error.kind() == std::io::ErrorKind::StorageFull {
            Self::disk_full()
        } else {
            Self::internal()
        }
    }
}

impl From<StoreError> for HttpError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound => Self::missing(),
            StoreError::InvalidPassword => Self::new(StatusCode::FORBIDDEN, "invalid_password"),
            StoreError::InvalidInput => Self::invalid(),
            StoreError::PasswordCooldown(wait) => Self::password_cooldown(wait),
            StoreError::Io(error) => error.into(),
            StoreError::Sql(error) => {
                tracing::debug!(code = ?error.sqlite_error_code(), "SQLite operation failed");
                Self::internal()
            }
            _ => Self::internal(),
        }
    }
}

impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        tracing::debug!(error_code = self.1, "Request rejected");
        let mut response = (self.0, Json(json!({ "error": self.1 }))).into_response();
        if let Some(seconds) = self.2 {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from(seconds));
        }
        response
    }
}

pub async fn not_found() -> HttpError {
    HttpError::missing()
}
