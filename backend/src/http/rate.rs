use std::{
    collections::HashMap,
    hash::Hash,
    sync::Mutex,
    time::{Duration, Instant},
};

const WINDOW: Duration = Duration::from_secs(60);
const MAX_KEYS: usize = 8192;

pub struct RateLimit<K> {
    limit: u16,
    inner: Mutex<Entries<K>>,
}

struct Entries<K> {
    reset: Instant,
    counts: HashMap<K, u16>,
}

impl<K: Eq + Hash> RateLimit<K> {
    pub fn new(limit: u16) -> Self {
        Self {
            limit,
            inner: Mutex::new(Entries {
                reset: Instant::now() + WINDOW,
                counts: HashMap::new(),
            }),
        }
    }

    pub fn attempt(&self, key: K) -> bool {
        let now = Instant::now();
        let mut entries = self.inner.lock().expect("rate limit mutex");
        if now >= entries.reset {
            entries.counts.clear();
            entries.reset = now + WINDOW;
        }
        if entries.counts.len() >= MAX_KEYS && !entries.counts.contains_key(&key) {
            return false;
        }
        let count = entries.counts.entry(key).or_default();
        if *count >= self.limit {
            return false;
        }
        *count += 1;
        true
    }
}
