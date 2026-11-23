use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::cooldown::PasswordCooldown;

const SESSION_LIFETIME: Duration = Duration::from_secs(180 * 24 * 60 * 60);
const MAX_SESSIONS: usize = 4096;

pub struct Auth {
    accounts: HashMap<String, [u8; 32]>,
    attempts: Mutex<PasswordCooldown<[u8; 32]>>,
    sessions: Mutex<HashMap<[u8; 32], Session>>,
}

struct Session {
    username: String,
    expires_at: Instant,
}

pub enum LoginError {
    Invalid,
    PasswordCooldown(Duration),
    Capacity,
    Entropy,
}

impl Auth {
    pub fn new(accounts: HashMap<String, String>) -> Self {
        let accounts = accounts
            .into_iter()
            .map(|(name, password)| (name, digest(&password)))
            .collect();
        Self {
            accounts,
            attempts: Mutex::new(PasswordCooldown::default()),
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn login(&self, username: &str, password: &str) -> Result<String, LoginError> {
        self.login_at(username, password, Instant::now())
    }

    fn login_at(&self, username: &str, password: &str, now: Instant) -> Result<String, LoginError> {
        // Share one deadline for each claimed username regardless of the source IP.
        self.attempts
            .lock()
            .expect("login cooldown mutex")
            .check(digest(username), now)
            .map_err(LoginError::PasswordCooldown)?;

        let stored = self.accounts.get(username);
        let valid = digest(password).ct_eq(stored.unwrap_or(&[0; 32]));
        if !bool::from(valid) || stored.is_none() {
            return Err(LoginError::Invalid);
        }

        let mut bytes = [0_u8; 32];
        getrandom::fill(&mut bytes).map_err(|_| LoginError::Entropy)?;
        let token = URL_SAFE_NO_PAD.encode(bytes);
        let mut sessions = self.sessions.lock().expect("session mutex");
        sessions.retain(|_, session| session.expires_at > now);
        if sessions.len() >= MAX_SESSIONS {
            return Err(LoginError::Capacity);
        }
        sessions.insert(
            digest(&token),
            Session {
                username: username.to_owned(),
                expires_at: now + SESSION_LIFETIME,
            },
        );
        Ok(token)
    }

    pub fn username(&self, token: &str) -> Option<String> {
        self.username_at(token, Instant::now())
    }

    pub fn logout(&self, token: &str) {
        self.sessions
            .lock()
            .expect("session mutex")
            .remove(&digest(token));
    }

    fn username_at(&self, token: &str, now: Instant) -> Option<String> {
        if token.len() != 43 {
            return None;
        }
        let hash = digest(token);
        let mut sessions = self.sessions.lock().expect("session mutex");
        let session = sessions.get(&hash)?;
        if session.expires_at <= now {
            sessions.remove(&hash);
            return None;
        }
        Some(session.username.clone())
    }
}

fn digest(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limits_each_claimed_username_after_valid_or_invalid_passwords() {
        let auth = Auth::new(HashMap::from([
            ("alice".into(), "password".into()),
            ("bob".into(), "secret".into()),
        ]));
        let start = Instant::now();
        assert!(matches!(
            auth.login_at("alice", "wrong", start),
            Err(LoginError::Invalid)
        ));
        assert!(matches!(
            auth.login_at("alice", "password", start + Duration::from_secs(2)),
            Err(LoginError::PasswordCooldown(wait)) if wait == Duration::from_secs(1)
        ));
        assert!(auth.login_at("bob", "secret", start).is_ok());
        assert!(
            auth.login_at("alice", "password", start + Duration::from_secs(3))
                .is_ok()
        );
        assert!(matches!(
            auth.login_at("alice", "wrong", start + Duration::from_secs(3)),
            Err(LoginError::PasswordCooldown(wait)) if wait == Duration::from_secs(3)
        ));
        assert!(matches!(
            auth.login_at("unknown", "wrong", start),
            Err(LoginError::Invalid)
        ));
        assert!(matches!(
            auth.login_at("unknown", "wrong", start),
            Err(LoginError::PasswordCooldown(_))
        ));
    }

    #[test]
    fn uses_absolute_session_expiry() {
        let auth = Auth::new(HashMap::from([("alice".into(), "password".into())]));
        let start = Instant::now();
        let token = auth.login_at("alice", "password", start).ok().unwrap();
        let expiry = start + Duration::from_secs(180 * 24 * 60 * 60);
        assert_eq!(
            auth.username_at(&token, expiry - Duration::from_secs(1))
                .as_deref(),
            Some("alice")
        );
        assert!(auth.username_at(&token, expiry).is_none());
        assert!(Auth::new(HashMap::new()).username(&token).is_none());
    }
}
