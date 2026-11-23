use std::{collections::HashMap, path::PathBuf};

use clap::Parser;

#[derive(Parser)]
#[command(version, about = "Pigeon / 信鸽 — self-hosted file sharing")]
pub struct Arguments {
    #[arg(
        long = "user",
        value_name = "USERNAME:PASSWORD",
        help = "Login account; repeat to add users"
    )]
    users: Vec<String>,

    #[arg(long, default_value_t = 3000, help = "HTTP port")]
    pub port: u16,

    #[arg(long, default_value = "/", help = "Public deployment path")]
    base_path: String,

    #[arg(
        long,
        default_value = "./pigeon-data",
        help = "Persistent files and SQLite database"
    )]
    pub data: PathBuf,
}

impl Arguments {
    pub fn accounts(&self) -> Result<HashMap<String, String>, &'static str> {
        let mut accounts = HashMap::new();
        for account in &self.users {
            let (name, password) = account
                .split_once(':')
                .ok_or("--user must be USERNAME:PASSWORD")?;
            if !valid_username(name) || password.is_empty() || password.len() > 1024 {
                return Err("Invalid username or password in --user");
            }
            if accounts
                .insert(name.to_owned(), password.to_owned())
                .is_some()
            {
                return Err("Duplicate username in --user");
            }
        }
        Ok(accounts)
    }

    pub fn base_path(&self) -> Result<BasePath, &'static str> {
        self.base_path.parse()
    }
}

fn valid_username(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && !name.chars().any(char::is_control)
        && name.trim() == name
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BasePath(String);

impl std::str::FromStr for BasePath {
    type Err = &'static str;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let Some(rest) = value.strip_prefix('/') else {
            return Err("--base-path must start with /");
        };
        let rest = rest.strip_suffix('/').unwrap_or(rest);
        if value == "/" {
            return Ok(Self(String::new()));
        }
        if rest.is_empty()
            || rest.split('/').any(|part| {
                part.is_empty()
                    || part == "."
                    || part == ".."
                    || !part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
            })
        {
            return Err("--base-path must contain ordinary URL path segments");
        }
        Ok(Self(format!("/{rest}")))
    }
}

impl BasePath {
    pub fn home(&self) -> &str {
        if self.0.is_empty() { "/" } else { &self.0 }
    }

    pub fn path(&self, suffix: &str) -> String {
        format!("{}{suffix}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_configuration_into_exact_routes() {
        assert_eq!(
            "/".parse::<BasePath>().unwrap().path("/sharing"),
            "/sharing"
        );
        assert_eq!(
            "/pigeon/sub/".parse::<BasePath>().unwrap().home(),
            "/pigeon/sub"
        );
        for path in ["pigeon", "//", "/a//b", "/a//", "/../a", "/a?b", "/a%2fb"] {
            assert!(path.parse::<BasePath>().is_err(), "{path}");
        }
    }

    #[test]
    fn splits_credentials_on_first_colon() {
        let args = Arguments::try_parse_from(["pigeon", "--user", "alice:p:a", "--user", "bob:p"])
            .unwrap();
        assert_eq!(args.accounts().unwrap()["alice"], "p:a");
        let args = Arguments::try_parse_from(["pigeon", "--user", "alice:p", "--user", "alice:q"])
            .unwrap();
        assert!(args.accounts().is_err());
    }
}
