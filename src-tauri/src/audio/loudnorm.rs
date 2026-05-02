use serde::{Deserialize, Serialize};

/// EBU R128 loudness normalization parameters. The defaults match the
/// platform-recommended targets:
/// - Reels / TikTok: -16 LUFS integrated, -1.0 dBTP, 11 LU range
/// - YouTube:        -14 LUFS integrated, -1.0 dBTP, 11 LU range
#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct LoudnormTarget {
    pub integrated_lufs: f64,
    pub true_peak_db: f64,
    pub range_lu: f64,
}

impl LoudnormTarget {
    pub const REEL: Self = Self {
        integrated_lufs: -16.0,
        true_peak_db: -1.0,
        range_lu: 11.0,
    };
    pub const YOUTUBE: Self = Self {
        integrated_lufs: -14.0,
        true_peak_db: -1.0,
        range_lu: 11.0,
    };

    /// Single-pass loudnorm filter spec — slightly less accurate than
    /// two-pass but usable as a baked-in render filter without a probing
    /// pass. Good enough for the Wave 2 demo; Wave 5 can wire two-pass via
    /// a separate analyse → encode pipeline.
    pub fn ffmpeg_filter(&self) -> String {
        format!(
            "loudnorm=I={}:TP={}:LRA={}:print_format=summary",
            self.integrated_lufs, self.true_peak_db, self.range_lu
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reel_defaults_serialise_correctly() {
        let f = LoudnormTarget::REEL.ffmpeg_filter();
        assert!(f.contains("I=-16"), "filter: {f}");
        assert!(f.contains("TP=-1"), "filter: {f}");
        assert!(f.contains("LRA=11"), "filter: {f}");
    }

    #[test]
    fn youtube_target_is_minus_14() {
        assert_eq!(LoudnormTarget::YOUTUBE.integrated_lufs, -14.0);
    }
}
