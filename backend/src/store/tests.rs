use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::Instant;

use super::{
    Duration, NewShare, SHARE_ID_BYTES, Share, Store, StoreError, link_digest, random_hex,
    unix_seconds,
};

const PAYLOAD: &[u8] = b"file for sharing";

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("pigeon-test-{}", random_hex::<16>().unwrap()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn make_share(
    store: &Store,
    limit: Option<u64>,
    expiry: Option<Duration>,
    password: Option<&str>,
) -> Share {
    let mut stage = store.start_upload().unwrap();
    stage.take_file().write_all(PAYLOAD).unwrap();
    store
        .finish_upload(
            stage,
            NewShare {
                filename: "例子.txt".into(),
                size_bytes: PAYLOAD.len() as u64,
                uploaded_by: "original-uploader".into(),
                expires_in: expiry,
                download_limit: limit,
                password: password.map(str::to_owned),
            },
        )
        .unwrap()
}

#[test]
fn one_remaining_slot_yields_exactly_one_persistent_link() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, Some(1), None, None);
    let start = Arc::new(Barrier::new(3));
    let workers = (0..2)
        .map(|_| {
            let store = store.clone();
            let id = share.id.clone();
            let start = Arc::clone(&start);
            thread::spawn(move || {
                start.wait();
                store.issue_link(&id, None)
            })
        })
        .collect::<Vec<_>>();
    start.wait();
    let mut issued = Vec::new();
    for worker in workers {
        match worker.join().unwrap() {
            Ok(link) => issued.push(link),
            Err(StoreError::NotFound) => (),
            Err(error) => panic!("{error}"),
        }
    }
    assert_eq!(issued.len(), 1);
    assert!(matches!(store.share(&share.id), Err(StoreError::NotFound)));
    drop(store);

    let reopened = Store::open(dir.path()).unwrap();
    let token = &issued[0].token;
    for _ in 0..2 {
        let mut download = reopened.open_download(token).unwrap();
        let mut data = Vec::new();
        download.file.read_to_end(&mut data).unwrap();
        assert_eq!(data, PAYLOAD);
        assert_eq!(download.filename, "例子.txt");
    }
    let state = reopened.inner.lock();
    let username: String = state
        .conn
        .query_row(
            "SELECT uploaded_by FROM shares WHERE id = ?1",
            [&share.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(username, "original-uploader");
}

#[test]
fn invalid_password_leaves_slot_available_and_link_uses_share_deadline() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(
        &store,
        Some(1),
        Some(Duration::from_secs(60)),
        Some("abc123"),
    );
    assert!(share.requires_password);
    let now = Instant::now();
    assert!(matches!(
        store.issue_link_with_clock(&share.id, Some("wrong"), || now),
        Err(StoreError::InvalidPassword)
    ));
    assert_eq!(store.share(&share.id).unwrap().remaining_downloads, Some(1));
    let link = store
        .issue_link_with_clock(&share.id, Some("abc123"), || now + Duration::from_secs(3))
        .unwrap();
    assert_eq!(Some(link.expires_at), share.expires_at);
    let state = store.inner.lock();
    let stored_digest: Vec<u8> = state
        .conn
        .query_row("SELECT token_hash FROM download_links", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(
        stored_digest.as_slice(),
        link_digest(&link.token).as_slice()
    );
}

#[test]
fn cleanup_waits_for_link_expiry_and_for_the_last_reader() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, Some(1), None, None);
    let link = store.issue_link(&share.id, None).unwrap();
    let mut download = store.open_download(&link.token).unwrap();
    let path = store.inner.files_dir.join(&share.id);
    store.cleanup_at(link.expires_at - 1).unwrap();
    assert!(path.exists());
    store.cleanup_at(link.expires_at).unwrap();
    assert!(matches!(
        store.open_download(&link.token),
        Err(StoreError::NotFound)
    ));
    assert!(path.exists());
    let mut data = Vec::new();
    download.file.read_to_end(&mut data).unwrap();
    assert_eq!(data, PAYLOAD);
    drop(download);
    store.cleanup_at(link.expires_at).unwrap();
    assert!(!path.exists());
    let exists: bool = store
        .inner
        .lock()
        .conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM shares WHERE id = ?1)",
            [&share.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!exists);
}

#[test]
fn store_lock_is_held_by_in_flight_downloads() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, None, None, None);
    let link = store.issue_link(&share.id, None).unwrap();
    let download = store.open_download(&link.token).unwrap();
    assert!(matches!(
        Store::open(dir.path()),
        Err(StoreError::DataDirLocked)
    ));
    drop(store);
    assert!(matches!(
        Store::open(dir.path()),
        Err(StoreError::DataDirLocked)
    ));
    drop(download);
    assert!(Store::open(dir.path()).is_ok());
}

#[test]
fn restart_completes_interrupted_publishes_and_deletions() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, Some(1), None, None);
    store.issue_link(&share.id, None).unwrap();
    store
        .inner
        .lock()
        .conn
        .execute(
            "UPDATE download_links SET expires_at = ?1",
            [unix_seconds().unwrap()],
        )
        .unwrap();
    fs::remove_file(store.inner.files_dir.join(&share.id)).unwrap();
    let orphan = store
        .inner
        .files_dir
        .join(random_hex::<SHARE_ID_BYTES>().unwrap());
    let partial = store
        .inner
        .tmp_dir
        .join(random_hex::<SHARE_ID_BYTES>().unwrap());
    let unrelated = store.inner.files_dir.join("notes.txt");
    for path in [&orphan, &partial, &unrelated] {
        fs::write(path, PAYLOAD).unwrap();
    }
    drop(store);

    let reopened = Store::open(dir.path()).unwrap();
    assert!(unrelated.exists());
    assert!(!orphan.exists());
    assert!(!partial.exists());
    let count: usize = reopened
        .inner
        .lock()
        .conn
        .query_row("SELECT count(*) FROM shares", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn wrong_sized_or_missing_files_cannot_expose_shares_or_consume_slots() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, Some(2), None, Some("abc123"));
    let link = store.issue_link(&share.id, Some("abc123")).unwrap();
    let path = store.inner.files_dir.join(&share.id);
    fs::write(&path, b"truncated").unwrap();
    assert!(matches!(store.share(&share.id), Err(StoreError::NotFound)));
    assert!(matches!(
        store.issue_link(&share.id, Some("wrong")),
        Err(StoreError::NotFound)
    ));
    assert!(matches!(
        store.issue_link(&share.id, Some("abc123")),
        Err(StoreError::NotFound)
    ));
    assert!(matches!(
        store.open_download(&link.token),
        Err(StoreError::NotFound)
    ));

    fs::remove_file(path).unwrap();
    assert!(matches!(store.share(&share.id), Err(StoreError::NotFound)));
    assert!(matches!(
        store.issue_link(&share.id, Some("wrong")),
        Err(StoreError::NotFound)
    ));
    assert!(matches!(
        store.open_download(&link.token),
        Err(StoreError::NotFound)
    ));
    let remaining: u64 = store
        .inner
        .lock()
        .conn
        .query_row(
            "SELECT remaining_downloads FROM shares WHERE id = ?1",
            [&share.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 1);
}

#[test]
fn listing_returns_only_the_owners_active_shares_in_order() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    store
        .inner
        .lock()
        .conn
        .execute_batch(
            "INSERT INTO shares (id, filename, size_bytes, uploaded_by, created_at, expires_at,
                             remaining_downloads, password) VALUES
             ('a', 'old-note.txt', 11, 'alice', 10, NULL, NULL, NULL),
             ('b', 'Photo100%_New.png', 22, 'alice', 20, NULL, 2, 'abc123'),
             ('c', 'photo100ab.png', 33, 'alice', 20, NULL, NULL, NULL),
             ('d', 'photo-expired.png', 44, 'alice', 30, 40, 1, NULL),
             ('e', 'photo-exhausted.png', 55, 'alice', 50, NULL, 0, NULL),
             ('f', 'photo-colleague.png', 66, 'bob', 60, NULL, NULL, NULL);",
        )
        .unwrap();

    let defaults = store.list_shares("alice", "", 1, 20).unwrap();
    assert_eq!(
        (defaults.page, defaults.page_size, defaults.total),
        (1, 20, 3)
    );
    let ids: Vec<_> = defaults.items.iter().map(|item| item.id.as_str()).collect();
    assert_eq!(ids, ["c", "b", "a"]);
    let protected = &defaults.items[1];
    assert_eq!(protected.filename, "Photo100%_New.png");
    assert_eq!(protected.size_bytes, 22);
    assert_eq!(protected.created_at, 20);
    assert_eq!(protected.expires_at, None);
    assert_eq!(protected.remaining_downloads, Some(2));
    assert!(protected.requires_password);

    let literal = store.list_shares("alice", "pHOTo100%_", 1, 20).unwrap();
    assert_eq!(literal.total, 1);
    assert_eq!(literal.items[0].id, "b");
    let case_insensitive = store.list_shares("alice", "pHOTo", 1, 20).unwrap();
    assert_eq!(case_insensitive.total, 2);
    let colleague = store.list_shares("bob", "photo", 1, 20).unwrap();
    assert_eq!(colleague.total, 1);
    assert_eq!(colleague.items[0].id, "f");
    assert_eq!(
        store
            .list_shares("alice", "removed-user", 1, 20)
            .unwrap()
            .total,
        0
    );
    assert_eq!(
        store
            .list_shares("alice", "' OR 1=1 --", 1, 20)
            .unwrap()
            .total,
        0
    );

    let first = store.list_shares("alice", "", 1, 2).unwrap();
    let ids: Vec<_> = first.items.iter().map(|item| item.id.as_str()).collect();
    assert_eq!(ids, ["c", "b"]);
    let clamped = store.list_shares("alice", "", i64::MAX as u64, 2).unwrap();
    assert_eq!((clamped.page, clamped.page_size, clamped.total), (2, 2, 3));
    assert_eq!(clamped.items.len(), 1);
    assert_eq!(clamped.items[0].id, "a");
}

#[test]
fn listing_validates_pagination_and_clamps_empty_results_to_first_page() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let too_large = i64::MAX as u64 + 1;
    for (page, size) in [(0, 1), (1, 0), (too_large, 1), (1, too_large)] {
        assert!(matches!(
            store.list_shares("alice", "", page, size),
            Err(StoreError::InvalidInput)
        ));
    }
    let empty = store.list_shares("alice", "missing", 9, 20).unwrap();
    assert_eq!((empty.page, empty.page_size, empty.total), (1, 20, 0));
    assert!(empty.items.is_empty());
}

#[test]
fn extraction_cooldown_is_independent_by_share_and_leaves_quota_available() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let protected = make_share(&store, Some(3), None, Some("abc123"));
    let other = make_share(&store, Some(3), None, Some("abc123"));
    let public = make_share(&store, Some(3), None, None);
    let now = Instant::now();
    let later = |seconds| now + Duration::from_secs(seconds);

    assert!(matches!(
        store.issue_link_with_clock(&protected.id, Some("wrong"), || now),
        Err(StoreError::InvalidPassword)
    ));
    assert!(matches!(
        store.clone().issue_link_with_clock(&protected.id, Some("abc123"), || later(1)),
        Err(StoreError::PasswordCooldown(wait)) if wait == Duration::from_secs(2)
    ));
    assert_eq!(
        store.share(&protected.id).unwrap().remaining_downloads,
        Some(3)
    );
    assert!(
        store
            .issue_link_with_clock(&other.id, Some("abc123"), || later(1))
            .is_ok()
    );

    for _ in 0..2 {
        assert!(
            store
                .issue_link_with_clock(&public.id, None, || panic!(
                    "public share checked a password"
                ))
                .is_ok()
        );
    }
    assert_eq!(
        store.share(&public.id).unwrap().remaining_downloads,
        Some(1)
    );

    assert!(matches!(
        store.issue_link_with_clock(&protected.id, None, || later(2)),
        Err(StoreError::PasswordCooldown(wait)) if wait == Duration::from_secs(1)
    ));
    assert!(
        store
            .issue_link_with_clock(&protected.id, Some("abc123"), || later(3))
            .is_ok()
    );
    assert!(matches!(
        store.issue_link_with_clock(&protected.id, Some("abc123"), || later(4)),
        Err(StoreError::PasswordCooldown(wait)) if wait == Duration::from_secs(2)
    ));
    assert_eq!(
        store.share(&protected.id).unwrap().remaining_downloads,
        Some(2)
    );
}

#[test]
fn only_the_owner_can_delete_and_inactive_files_are_removed_immediately() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, None, None, None);
    let link = store.issue_link(&share.id, None).unwrap();
    let path = store.inner.files_dir.join(&share.id);

    assert!(matches!(
        store.delete_share(&share.id, "another-user"),
        Err(StoreError::NotFound)
    ));
    assert!(store.share(&share.id).is_ok());
    assert!(store.open_download(&link.token).is_ok());
    assert!(path.exists());

    let owner = "original-uploader";
    store.delete_share(&share.id, owner).unwrap();
    assert!(matches!(store.share(&share.id), Err(StoreError::NotFound)));
    assert!(matches!(
        store.open_download(&link.token),
        Err(StoreError::NotFound)
    ));
    assert!(matches!(
        store.delete_share(&share.id, owner),
        Err(StoreError::NotFound)
    ));
    assert!(!path.exists());
}

#[test]
fn deletion_revokes_every_ticket_and_pins_an_open_stream_until_cleanup() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, Some(3), None, None);
    let first = store.issue_link(&share.id, None).unwrap();
    let second = store.issue_link(&share.id, None).unwrap();
    let mut download = store.open_download(&first.token).unwrap();
    let path = store.inner.files_dir.join(&share.id);
    let owner = "original-uploader";

    store.delete_share(&share.id, owner).unwrap();
    assert_eq!(store.list_shares(owner, "", 1, 20).unwrap().total, 0);
    assert!(matches!(
        store.issue_link(&share.id, None),
        Err(StoreError::NotFound)
    ));
    for link in [first, second] {
        assert!(matches!(
            store.open_download(&link.token),
            Err(StoreError::NotFound)
        ));
    }
    store.cleanup().unwrap();
    assert!(path.exists());
    let mut data = Vec::new();
    download.file.read_to_end(&mut data).unwrap();
    assert_eq!(data, PAYLOAD);

    drop(download);
    store.cleanup().unwrap();
    assert!(!path.exists());
    assert!(matches!(
        store.delete_share(&share.id, owner),
        Err(StoreError::NotFound)
    ));
}

#[test]
fn deletion_stays_revoked_when_file_cleanup_is_retried() {
    let dir = TestDir::new();
    let store = Store::open(dir.path()).unwrap();
    let share = make_share(&store, None, None, None);
    let link = store.issue_link(&share.id, None).unwrap();
    let path = store.inner.files_dir.join(&share.id);
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    fs::write(path.join("blocking-file"), PAYLOAD).unwrap();

    let owner = "original-uploader";
    store.delete_share(&share.id, owner).unwrap();
    assert!(path.exists());
    assert_eq!(store.list_shares(owner, "", 1, 20).unwrap().total, 0);
    assert!(matches!(
        store.issue_link(&share.id, None),
        Err(StoreError::NotFound)
    ));
    assert!(matches!(
        store.open_download(&link.token),
        Err(StoreError::NotFound)
    ));

    drop(store);
    let reopened = Store::open(dir.path()).unwrap();
    assert!(matches!(
        reopened.open_download(&link.token),
        Err(StoreError::NotFound)
    ));
    assert!(path.exists());
    fs::remove_dir_all(path).unwrap();
    reopened.cleanup().unwrap();
    assert!(matches!(
        reopened.delete_share(&share.id, owner),
        Err(StoreError::NotFound)
    ));
}
