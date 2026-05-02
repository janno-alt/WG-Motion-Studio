use serde::{Deserialize, Serialize};

/// Wraps FFmpeg's `arnndn` (noise reduction) filter. By default we omit the
/// `m=` model parameter so FFmpeg uses its built-in RNN. Wave 4+ can ship a
/// custom RNN model file in resources/ and pass its path here.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoiseReductionParams {
    /// Mix ratio, 0.0 (dry) … 1.0 (fully cleaned).
    pub mix: f64,
    /// Optional path to a custom .rnnn model file.
    pub model_path: Option<String>,
}

impl Default for NoiseReductionParams {
    fn default() -> Self {
        Self {
            mix: 1.0,
            model_path: None,
        }
    }
}

impl NoiseReductionParams {
    pub fn ffmpeg_filter(&self) -> String {
        match &self.model_path {
            Some(p) => format!("arnndn=m={p}:mix={}", self.mix.clamp(0.0, 1.0)),
            None => format!("arnndn:mix={}", self.mix.clamp(0.0, 1.0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_filter_clamps_mix() {
        let mut p = NoiseReductionParams::default();
        p.mix = 1.5;
        assert!(p.ffmpeg_filter().contains("mix=1"));
    }

    #[test]
    fn model_path_included_when_set() {
        let p = NoiseReductionParams {
            mix: 0.8,
            model_path: Some("/tmp/cb.rnnn".into()),
        };
        let f = p.ffmpeg_filter();
        assert!(f.contains("m=/tmp/cb.rnnn"), "filter: {f}");
        assert!(f.contains("mix=0.8"), "filter: {f}");
    }
}
