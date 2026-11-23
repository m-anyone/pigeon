use std::{
    collections::HashMap,
    hash::Hash,
    time::{Duration, Instant},
};

const INTERVAL: Duration = Duration::from_secs(3);
const MAX_TRACKED_KEYS: usize = 8192;

/// Keeps a monotonic deadline for each credential being verified.
pub struct PasswordCooldown<K> {
    allowed_at: HashMap<K, Instant>,
    next_cleanup: Option<Instant>,
}

impl<K> Default for PasswordCooldown<K> {
    fn default() -> Self {
        Self {
            allowed_at: HashMap::new(),
            next_cleanup: None,
        }
    }
}

impl<K: Eq + Hash> PasswordCooldown<K> {
    pub fn check(&mut self, key: K, now: Instant) -> Result<(), Duration> {
        let deadline = now + INTERVAL;
        if self.next_cleanup.is_none_or(|cleanup| now >= cleanup) {
            self.allowed_at.retain(|_, until| *until > now);
            self.next_cleanup = Some(deadline);
        }

        if let Some(allowed_at) = self.allowed_at.get_mut(&key) {
            if *allowed_at > now {
                // Rejected attempts preserve the original deadline.
                return Err(*allowed_at - now);
            }
            *allowed_at = deadline;
        } else {
            // Claimed usernames can come from unauthenticated requests.
            if self.allowed_at.len() >= MAX_TRACKED_KEYS {
                return Err(INTERVAL);
            }
            self.allowed_at.insert(key, deadline);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spaces_checks_and_keeps_each_key_independent() {
        let start = Instant::now();
        let mut cooldown = PasswordCooldown::default();
        assert_eq!(cooldown.check("alice", start), Ok(()));
        assert_eq!(cooldown.check("bob", start), Ok(()));
        assert_eq!(
            cooldown.check("alice", start + Duration::from_secs(2)),
            Err(Duration::from_secs(1)),
        );
        assert_eq!(cooldown.check("alice", start + INTERVAL), Ok(()));
        assert_eq!(cooldown.check("alice", start + INTERVAL), Err(INTERVAL),);
    }
}
