use rusqlite::params;

use super::{Result, Store, StoreError, unix_seconds};

const ACTIVE_MATCH: &str = "WHERE uploaded_by = ?1
    AND (expires_at IS NULL OR expires_at > ?2)
    AND (remaining_downloads IS NULL OR remaining_downloads > 0)
    AND (?3 = '' OR instr(lower(filename), lower(?3)) > 0)";

#[derive(Debug)]
pub struct ListedShare {
    pub id: String,
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub remaining_downloads: Option<u64>,
    pub requires_password: bool,
}

#[derive(Debug)]
pub struct SharePage {
    pub items: Vec<ListedShare>,
    pub page: u64,
    pub page_size: u64,
    pub total: u64,
}

impl Store {
    pub fn list_shares(
        &self,
        owner: &str,
        search: &str,
        page: u64,
        page_size: u64,
    ) -> Result<SharePage> {
        if page == 0 || page_size == 0 {
            return Err(StoreError::InvalidInput);
        }
        i64::try_from(page).map_err(|_| StoreError::InvalidInput)?;
        let limit = i64::try_from(page_size).map_err(|_| StoreError::InvalidInput)?;

        // Use a single timestamp and SQLite read snapshot for both pagination queries.
        let mut state = self.inner.lock();
        let now = unix_seconds()?;
        let tx = state.conn.transaction()?;
        let total: u64 = tx.query_row(
            &format!("SELECT count(*) FROM shares {ACTIVE_MATCH}"),
            params![owner, now, search],
            |row| row.get(0),
        )?;
        let page = page.min(total.div_ceil(page_size).max(1));
        let offset = (page - 1)
            .checked_mul(page_size)
            .and_then(|offset| i64::try_from(offset).ok())
            .ok_or(StoreError::InvalidInput)?;

        let items = {
            let mut query = tx.prepare_cached(&format!(
                "SELECT id, filename, size_bytes, created_at, expires_at,
                        remaining_downloads, password IS NOT NULL
                 FROM shares {ACTIVE_MATCH}
                 ORDER BY created_at DESC, id DESC LIMIT ?4 OFFSET ?5"
            ))?;
            let rows = query.query_map(params![owner, now, search, limit, offset], |row| {
                Ok(ListedShare {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    size_bytes: row.get(2)?,
                    created_at: row.get(3)?,
                    expires_at: row.get(4)?,
                    remaining_downloads: row.get(5)?,
                    requires_password: row.get(6)?,
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        tx.commit()?;

        Ok(SharePage {
            items,
            page,
            page_size,
            total,
        })
    }
}
