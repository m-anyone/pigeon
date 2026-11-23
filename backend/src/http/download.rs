use std::{fmt::Write, sync::Arc};

use axum::{
    body::Body,
    extract::{Query, State, rejection::QueryRejection},
    http::{HeaderMap, Method, StatusCode, header},
    response::Response,
};
use futures_util::StreamExt;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
};
use tokio_util::io::ReaderStream;

use crate::store::OpenDownload;

use super::{App, error::HttpError, storage_work};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct DownloadQuery {
    download: String,
}

pub(super) async fn download(
    State(app): State<Arc<App>>,
    method: Method,
    headers: HeaderMap,
    query: Result<Query<DownloadQuery>, QueryRejection>,
) -> Result<Response, HttpError> {
    let Query(DownloadQuery { download: token }) = query.map_err(|_| HttpError::missing())?;
    // The validator is stable for this URL and does not disclose the bearer token.
    let etag = format!("\"{:x}\"", Sha256::digest(token.as_bytes()));
    let store = app.store.clone();
    let OpenDownload {
        file,
        lease,
        filename,
        size_bytes,
    } = storage_work(move || store.open_download(&token)).await?;
    let mut builder = Response::builder()
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ETAG, &etag)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, attachment(&filename));

    if method == Method::HEAD {
        return builder
            .header(header::CONTENT_LENGTH, size_bytes)
            .body(Body::empty())
            .map_err(|_| HttpError::internal());
    }

    let mut file = File::from_std(file);
    let mut length = size_bytes;
    match select_range(&headers, &etag, size_bytes) {
        SelectedRange::Full => {}
        SelectedRange::Partial { start, end } => {
            length = end - start + 1;
            file.seek(SeekFrom::Start(start)).await?;
            tracing::debug!(
                range_start = start,
                range_end = end,
                "Download range selected"
            );
            builder = builder.status(StatusCode::PARTIAL_CONTENT).header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{size_bytes}"),
            );
        }
        SelectedRange::Unsatisfiable => {
            return builder
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{size_bytes}"))
                .body(Body::empty())
                .map_err(|_| HttpError::internal());
        }
    }

    tracing::debug!(
        response_bytes = length,
        total_bytes = size_bytes,
        "Download prepared"
    );

    // Retain the download lease until the body and its reader are dropped,
    // including a disconnected client.
    let stream = ReaderStream::with_capacity(file.take(length), 64 * 1024).map(move |chunk| {
        let _keep_alive = &lease;
        chunk
    });
    builder
        .header(header::CONTENT_LENGTH, length)
        .body(Body::from_stream(stream))
        .map_err(|_| HttpError::internal())
}

#[derive(Debug, PartialEq, Eq)]
enum SelectedRange {
    Full,
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

fn select_range(headers: &HeaderMap, etag: &str, size: u64) -> SelectedRange {
    if headers
        .get(header::IF_RANGE)
        .is_some_and(|value| value.as_bytes() != etag.as_bytes())
    {
        return SelectedRange::Full;
    }
    let Some(value) = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
    else {
        return SelectedRange::Full;
    };
    let Some((unit, interval)) = value.split_once('=') else {
        return SelectedRange::Full;
    };
    if !unit.eq_ignore_ascii_case("bytes") || interval.contains(',') {
        // A full response is valid when a server chooses not to serve multipart ranges.
        return SelectedRange::Full;
    }
    let Some((start, end)) = interval.trim().split_once('-') else {
        return SelectedRange::Full;
    };
    if start.is_empty() {
        let Some(count) = decimal(end) else {
            return SelectedRange::Full;
        };
        if count == 0 || size == 0 {
            return SelectedRange::Unsatisfiable;
        }
        return SelectedRange::Partial {
            start: size.saturating_sub(count),
            end: size - 1,
        };
    }

    let Some(start) = decimal(start) else {
        return SelectedRange::Full;
    };
    let end = if end.is_empty() {
        u64::MAX
    } else if let Some(end) = decimal(end) {
        end
    } else {
        return SelectedRange::Full;
    };
    if start > end || start >= size {
        return SelectedRange::Unsatisfiable;
    }
    SelectedRange::Partial {
        start,
        end: end.min(size - 1),
    }
}

fn decimal(value: &str) -> Option<u64> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    // An excessively large decimal offset is outside all supported file sizes.
    Some(value.parse().unwrap_or(u64::MAX))
}

fn attachment(filename: &str) -> String {
    let fallback: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || " ._-".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    let mut utf8 = String::new();
    for byte in filename.bytes() {
        if byte.is_ascii_alphanumeric() || b"._~-".contains(&byte) {
            utf8.push(char::from(byte));
        } else {
            write!(utf8, "%{byte:02X}").expect("string write");
        }
    }
    format!("attachment; filename=\"{fallback}\"; filename*=UTF-8''{utf8}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chooses_requested_range_and_enforces_validator() {
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, "bytes=2-40".parse().unwrap());
        assert_eq!(
            select_range(&headers, "\"tag\"", 10),
            SelectedRange::Partial { start: 2, end: 9 }
        );
        headers.insert(header::IF_RANGE, "\"different\"".parse().unwrap());
        assert_eq!(select_range(&headers, "\"tag\"", 10), SelectedRange::Full);
        headers.insert(header::IF_RANGE, "\"tag\"".parse().unwrap());
        headers.insert(header::RANGE, "bytes=-3".parse().unwrap());
        assert_eq!(
            select_range(&headers, "\"tag\"", 10),
            SelectedRange::Partial { start: 7, end: 9 }
        );
        assert_eq!(
            select_range(&headers, "\"tag\"", 0),
            SelectedRange::Unsatisfiable
        );
        headers.insert(header::RANGE, "bytes=10-".parse().unwrap());
        assert_eq!(
            select_range(&headers, "\"tag\"", 10),
            SelectedRange::Unsatisfiable
        );
    }

    #[test]
    fn encodes_filename_as_a_safe_header() {
        assert_eq!(
            attachment("文件.txt"),
            "attachment; filename=\"__.txt\"; filename*=UTF-8''%E6%96%87%E4%BB%B6.txt"
        );
        assert!(!attachment("a\"\r\n").contains(['\r', '\n']));
    }
}
