use crate::error::{AppError, AppResult};

/// Reject SVGs that fail basic sanity checks. Returns the (possibly
/// lightly-normalized) source on success.
pub fn sanitize(source: &str) -> AppResult<String> {
    let s = source.trim();
    if !s.starts_with("<svg") {
        return Err(AppError::Other("SVG must start with <svg".into()));
    }
    if !s.ends_with("</svg>") {
        return Err(AppError::Other("SVG must end with </svg>".into()));
    }
    // Security blocklist — strip-out requests always fail here; Claude is
    // instructed to never emit these, so their presence is a strong signal
    // something went wrong.
    for banned in ["<script", "<iframe", "<foreignObject", "<image", "xlink:href"] {
        if s.to_ascii_lowercase().contains(banned) {
            return Err(AppError::Other(format!("SVG contains forbidden tag/attr: {banned}")));
        }
    }
    if !s.contains("viewBox") {
        return Err(AppError::Other("SVG missing viewBox".into()));
    }
    // Silly-dimension guard — if someone hard-codes width="10000" we bail.
    for attr in ["width=\"10000", "height=\"10000", "width=\"1\"", "height=\"1\""] {
        if s.contains(attr) {
            return Err(AppError::Other("SVG has absurd dimensions".into()));
        }
    }
    Ok(s.to_string())
}
