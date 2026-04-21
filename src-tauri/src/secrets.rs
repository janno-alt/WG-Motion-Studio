use keyring::Entry;

use crate::error::AppResult;

const SERVICE: &str = "wg-motion-studio";

fn entry(provider: &str) -> AppResult<Entry> {
    let key = format!("api-key.{provider}");
    Ok(Entry::new(SERVICE, &key)?)
}

pub fn get(provider: &str) -> AppResult<Option<String>> {
    match entry(provider)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set(provider: &str, value: &str) -> AppResult<()> {
    entry(provider)?.set_password(value)?;
    Ok(())
}

pub fn clear(provider: &str) -> AppResult<()> {
    match entry(provider)?.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
