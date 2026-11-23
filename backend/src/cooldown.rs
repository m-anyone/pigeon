use std::{
    collections::HashMap,
    hash::Hash,
    time::{Duration, Instant},
};

const INTERVAL: Duration = Duration::from_secs(3);

/// Keeps a monotonic deadline for each credential being verified.
pub struct PasswordCooldown<K> {
    allowed_at: HashMap<K, Instant>,
    next_cleanup: Option<Instant>,
    key_limit: Option<usize>,
}

impl<K: Eq + Hash> PasswordCooldown<K> {
    pub fn new(key_limit: Option<usize>) -> Self {
        Self {
            allowed_at: HashMap::new(),
            next_cleanup: None,
            key_limit,
        }
    }

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
            if self
                .key_limit
                .is_some_and(|limit| self.allowed_at.len() >= limit)
            {
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
        let mut cooldown = PasswordCooldown::new(None);
        assert_eq!(cooldown.check("alice", start), Ok(()));
        assert_eq!(cooldown.check("bob", start), Ok(()));
        assert_eq!(
            cooldown.check("alice", start + Duration::from_secs(2)),
            Err(Duration::from_secs(1)),
        );
        assert_eq!(cooldown.check("alice", start + INTERVAL), Ok(()));
        assert_eq!(cooldown.check("alice", start + INTERVAL), Err(INTERVAL),);
    }

    #[test]
    fn applies_a_key_limit_only_when_configured() {
        let start = Instant::now();
        let mut bounded = PasswordCooldown::new(Some(1));
        assert_eq!(bounded.check("alice", start), Ok(()));
        assert_eq!(bounded.check("bob", start), Err(INTERVAL));
        assert_eq!(bounded.check("bob", start + INTERVAL), Ok(()));
    }
}
