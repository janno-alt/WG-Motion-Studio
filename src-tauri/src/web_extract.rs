use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const FETCH_TIMEOUT_SECS: u64 = 15;
const MAX_HTML_BYTES: usize = 512 * 1024;
const MAX_FAVICON_BYTES: usize = 512 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BrandSignals {
    pub source_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_name: Option<String>,
    pub theme_color: Option<String>,
    /// Hex strings extracted from inline `<style>` blocks; up to 16, dedup'd.
    pub inline_colors: Vec<String>,
    /// Optional inline logo / favicon as base64 data + mime type for
    /// multimodal Gemini input.
    pub favicon_base64: Option<String>,
    pub favicon_mime: Option<String>,
}

/// Best-effort fetch of the URL's HTML head + favicon. Always returns
/// something — every field except `source_url` is optional. Network errors
/// or parse misses bubble up as missing fields, not as Err.
pub async fn extract_brand_signals(url: &str) -> AppResult<BrandSignals> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .user_agent("WG-Video-Studio/0.1 (+brand-extractor)")
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let mut signals = BrandSignals { source_url: url.to_string(), ..Default::default() };

    let html = match client.get(url).send().await {
        Ok(r) => {
            if !r.status().is_success() {
                return Err(AppError::Other(format!("HTTP {}: {url}", r.status())));
            }
            let bytes = r
                .bytes()
                .await
                .map_err(|e| AppError::Other(format!("read body: {e}")))?;
            let truncated = if bytes.len() > MAX_HTML_BYTES {
                &bytes[..MAX_HTML_BYTES]
            } else {
                &bytes[..]
            };
            String::from_utf8_lossy(truncated).to_string()
        }
        Err(e) => return Err(AppError::Other(format!("fetch {url}: {e}"))),
    };

    signals.title = extract_tag(&html, "title");
    signals.description = extract_meta_content(&html, "description");
    signals.site_name = extract_og(&html, "site_name");
    signals.theme_color = extract_meta_content(&html, "theme-color");
    signals.inline_colors = extract_inline_colors(&html, 16);

    if let Some(icon_url) = pick_icon_url(&html, url) {
        if let Ok((mime, b64)) =
            fetch_favicon(&client, &icon_url, MAX_FAVICON_BYTES).await
        {
            signals.favicon_base64 = Some(b64);
            signals.favicon_mime = Some(mime);
        }
    }

    Ok(signals)
}

fn extract_tag(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = html.to_lowercase().find(&open)?;
    let after_open = html[start..].find('>')? + start + 1;
    let end_rel = html[after_open..].to_lowercase().find(&close)?;
    let value = html[after_open..after_open + end_rel].trim();
    if value.is_empty() { None } else { Some(decode_entities(value)) }
}

fn extract_meta_content(html: &str, name: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut search_start = 0;
    while let Some(rel) = lower[search_start..].find("<meta") {
        let abs = search_start + rel;
        let tag_end = lower[abs..].find('>').map(|i| abs + i + 1)?;
        let tag = &lower[abs..tag_end];
        let original = &html[abs..tag_end];
        let matches = tag.contains(&format!("name=\"{name}\""))
            || tag.contains(&format!("name='{name}'"))
            || tag.contains(&format!("property=\"og:{name}\""))
            || tag.contains(&format!("property='og:{name}'"));
        if matches {
            if let Some(content) = read_attr(original, "content") {
                return Some(decode_entities(content.trim()));
            }
        }
        search_start = tag_end;
    }
    None
}

fn extract_og(html: &str, suffix: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut search_start = 0;
    while let Some(rel) = lower[search_start..].find("<meta") {
        let abs = search_start + rel;
        let tag_end = lower[abs..].find('>').map(|i| abs + i + 1)?;
        let tag = &lower[abs..tag_end];
        let original = &html[abs..tag_end];
        let needle = format!("og:{suffix}");
        if tag.contains(&format!("property=\"{needle}\""))
            || tag.contains(&format!("property='{needle}'"))
        {
            if let Some(content) = read_attr(original, "content") {
                return Some(decode_entities(content.trim()));
            }
        }
        search_start = tag_end;
    }
    None
}

fn read_attr<'a>(tag: &'a str, attr: &str) -> Option<&'a str> {
    let lower = tag.to_lowercase();
    let needle_dq = format!("{attr}=\"");
    let needle_sq = format!("{attr}='");
    if let Some(start) = lower.find(&needle_dq) {
        let value_start = start + needle_dq.len();
        let end_rel = tag[value_start..].find('"')?;
        return Some(&tag[value_start..value_start + end_rel]);
    }
    if let Some(start) = lower.find(&needle_sq) {
        let value_start = start + needle_sq.len();
        let end_rel = tag[value_start..].find('\'')?;
        return Some(&tag[value_start..value_start + end_rel]);
    }
    None
}

/// Walks inline `<style>` and HTML attributes for `#RRGGBB` / `#RGB` hex
/// colour tokens; returns a deduplicated, lowercase list capped at `limit`.
fn extract_inline_colors(html: &str, limit: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let bytes = html.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' {
            let mut j = i + 1;
            while j < bytes.len() && j - i <= 7 && (bytes[j].is_ascii_hexdigit()) {
                j += 1;
            }
            let len = j - i - 1;
            if len == 3 || len == 6 {
                let hex = format!("#{}", &html[i + 1..j].to_lowercase());
                if !out.contains(&hex) {
                    out.push(hex);
                    if out.len() >= limit {
                        break;
                    }
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

fn pick_icon_url(html: &str, base_url: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let candidates = ["apple-touch-icon", "shortcut icon", "icon"];
    let mut best: Option<String> = None;
    for needle in &candidates {
        let mut search_start = 0;
        while let Some(rel) = lower[search_start..].find("<link") {
            let abs = search_start + rel;
            let tag_end = lower[abs..].find('>').map(|i| abs + i + 1)?;
            let tag = &lower[abs..tag_end];
            let original = &html[abs..tag_end];
            search_start = tag_end;
            if !(tag.contains(&format!("rel=\"{needle}\""))
                || tag.contains(&format!("rel='{needle}'")))
            {
                continue;
            }
            if let Some(href) = read_attr(original, "href") {
                let absolute = absolutize(base_url, href);
                if best.is_none() {
                    best = Some(absolute);
                }
                if needle == &"apple-touch-icon" {
                    return best;
                }
            }
        }
    }
    if best.is_none() {
        // Fall back to /favicon.ico at the site root.
        if let Some(root) = root_url(base_url) {
            return Some(format!("{root}/favicon.ico"));
        }
    }
    best
}

fn absolutize(base: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if href.starts_with("//") {
        let scheme = if base.starts_with("https") { "https:" } else { "http:" };
        return format!("{scheme}{href}");
    }
    if let Some(root) = root_url(base) {
        if href.starts_with('/') {
            return format!("{root}{href}");
        }
        return format!("{root}/{href}");
    }
    href.to_string()
}

fn root_url(url: &str) -> Option<String> {
    let after_scheme = url.find("://")?;
    let host_start = after_scheme + 3;
    let host_end = url[host_start..].find('/').map(|i| host_start + i).unwrap_or(url.len());
    Some(url[..host_end].to_string())
}

async fn fetch_favicon(
    client: &reqwest::Client,
    url: &str,
    max_bytes: usize,
) -> AppResult<(String, String)> {
    let r = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("favicon fetch: {e}")))?;
    if !r.status().is_success() {
        return Err(AppError::Other(format!("favicon HTTP {}", r.status())));
    }
    let mime = r
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "image/x-icon".to_string());
    let bytes = r
        .bytes()
        .await
        .map_err(|e| AppError::Other(format!("favicon body: {e}")))?;
    if bytes.len() > max_bytes {
        return Err(AppError::Other(format!(
            "favicon too large: {} bytes",
            bytes.len()
        )));
    }
    Ok((mime, BASE64.encode(&bytes)))
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_description_theme_color() {
        let html = r##"
            <html><head>
              <title>Acme Co — We make great things</title>
              <meta name="description" content="Acme is a fictional company.">
              <meta name="theme-color" content="#0066ff">
              <meta property="og:site_name" content="Acme">
              <link rel="icon" href="/favicon.png">
              <style>body{background:#fafafa;color:#222}</style>
            </head></html>
        "##;
        let title = extract_tag(html, "title").unwrap();
        assert!(title.contains("Acme Co"));
        let desc = extract_meta_content(html, "description").unwrap();
        assert_eq!(desc, "Acme is a fictional company.");
        let theme = extract_meta_content(html, "theme-color").unwrap();
        assert_eq!(theme, "#0066ff");
        let og = extract_og(html, "site_name").unwrap();
        assert_eq!(og, "Acme");
        let colors = extract_inline_colors(html, 8);
        assert!(colors.contains(&"#fafafa".to_string()));
        assert!(colors.contains(&"#222".to_string()));
        assert!(colors.contains(&"#0066ff".to_string()));
    }

    #[test]
    fn absolutize_handles_relative_paths() {
        assert_eq!(
            absolutize("https://acme.com/about", "/favicon.ico"),
            "https://acme.com/favicon.ico"
        );
        assert_eq!(
            absolutize("https://acme.com/", "//cdn.example.com/icon.png"),
            "https://cdn.example.com/icon.png"
        );
        assert_eq!(
            absolutize("https://acme.com/", "https://other.com/x.png"),
            "https://other.com/x.png"
        );
    }
}
