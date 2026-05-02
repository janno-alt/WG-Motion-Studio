use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::ipc::Channel;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

use crate::assets::Asset;
use crate::audio::loudnorm::LoudnormTarget;
use crate::error::{AppError, AppResult};
use crate::ipc::RenderProgress;
use crate::timeline::{Clip, Timeline, Track};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderPreset {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_codec: String,
    pub video_bitrate: String,
    pub audio_codec: String,
    pub audio_bitrate: String,
    /// Optional EBU R128 target — when set, a loudnorm filter is appended to
    /// the final audio chain before encoding.
    #[serde(default)]
    pub loudnorm_lufs: Option<f64>,
}

pub fn reel_9_16() -> RenderPreset {
    RenderPreset {
        id: "reel-9-16".into(),
        width: 1080,
        height: 1920,
        fps: 30,
        video_codec: "h264_videotoolbox".into(),
        video_bitrate: "8M".into(),
        audio_codec: "aac".into(),
        audio_bitrate: "192k".into(),
        loudnorm_lufs: Some(LoudnormTarget::REEL.integrated_lufs),
    }
}

#[allow(dead_code)]
pub fn youtube_16_9() -> RenderPreset {
    RenderPreset {
        id: "youtube-16-9".into(),
        width: 1920,
        height: 1080,
        fps: 30,
        video_codec: "h264_videotoolbox".into(),
        video_bitrate: "12M".into(),
        audio_codec: "aac".into(),
        audio_bitrate: "192k".into(),
        loudnorm_lufs: Some(LoudnormTarget::YOUTUBE.integrated_lufs),
    }
}

#[allow(dead_code)]
pub fn prores_master() -> RenderPreset {
    RenderPreset {
        id: "prores-master".into(),
        width: 1920,
        height: 1080,
        fps: 30,
        video_codec: "prores_videotoolbox".into(),
        video_bitrate: "0".into(),
        audio_codec: "pcm_s16le".into(),
        audio_bitrate: "1536k".into(),
        loudnorm_lufs: None,
    }
}

/// Subset of BrandKit the renderer needs. Frontend extracts this from the
/// full BrandKit before issuing the render command.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RenderBrandKit {
    pub primary: String,
    pub secondary: String,
    pub accent: String,
    pub background: String,
    pub headline_font: String,
    pub body_font: String,
}

impl RenderBrandKit {
    pub fn fallback() -> Self {
        Self {
            primary: "#A8E544".into(),
            secondary: "#1A1A1A".into(),
            accent: "#FF7F50".into(),
            background: "#0B0C0F".into(),
            headline_font: "Inter".into(),
            body_font: "Inter".into(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub render_id: String,
    pub project_id: String,
    pub timeline: Timeline,
    pub assets: Vec<Asset>,
    pub preset: RenderPreset,
    pub output_path: String,
    #[serde(default)]
    pub brand_kit: Option<RenderBrandKit>,
}

#[tauri::command]
pub async fn render_timeline(
    app: AppHandle,
    request: RenderRequest,
    progress: Channel<RenderProgress>,
) -> AppResult<String> {
    let _ = progress.send(RenderProgress::Starting {
        render_id: request.render_id.clone(),
    });

    let plan = build_render_plan(&request)?;

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Other(format!("ffmpeg sidecar not registered: {e}")))?
        .args(&plan.args);

    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("ffmpeg spawn failed: {e}")))?;

    let mut last_frame: u64 = 0;
    let mut had_error: Option<String> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line);
                for kv in s.split('\n') {
                    if let Some(n) = kv.trim().strip_prefix("frame=") {
                        if let Ok(f) = n.parse::<u64>() {
                            last_frame = f;
                            let _ = progress.send(RenderProgress::Encoding {
                                render_id: request.render_id.clone(),
                                frame: f,
                                total_frames: plan.total_frames,
                                fps: None,
                            });
                        }
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                let s = String::from_utf8_lossy(&line).to_string();
                if s.contains("Error") || s.contains("error") {
                    had_error.get_or_insert(s);
                }
            }
            CommandEvent::Error(err) => {
                had_error.get_or_insert(err);
            }
            CommandEvent::Terminated(payload) => {
                if !matches!(payload.code, Some(0)) {
                    let msg = had_error
                        .clone()
                        .unwrap_or_else(|| format!("ffmpeg exited with code {:?}", payload.code));
                    let _ = progress.send(RenderProgress::Error {
                        render_id: request.render_id.clone(),
                        message: msg.clone(),
                    });
                    return Err(AppError::Other(msg));
                }
                break;
            }
            _ => {}
        }
    }

    let _ = last_frame;

    let _ = progress.send(RenderProgress::Done {
        render_id: request.render_id.clone(),
        output_path: request.output_path.clone(),
    });

    Ok(request.output_path)
}

pub struct RenderPlan {
    pub args: Vec<String>,
    pub total_frames: Option<u64>,
}

pub fn build_render_plan(req: &RenderRequest) -> AppResult<RenderPlan> {
    let preset = &req.preset;

    let mut video_tracks: Vec<&Track> = req
        .timeline
        .tracks
        .iter()
        .filter(|t| t.kind == "video" && !t.hidden)
        .collect();
    video_tracks.sort_by_key(|t| t.sort_order);

    let mut audio_tracks: Vec<&Track> = req
        .timeline
        .tracks
        .iter()
        .filter(|t| t.kind == "audio" && !t.muted)
        .collect();
    audio_tracks.sort_by_key(|t| t.sort_order);

    let captions_track = req.timeline.tracks.iter().find(|t| t.kind == "captions");

    let mut asset_inputs: HashMap<String, usize> = HashMap::new();
    let mut input_paths: Vec<String> = Vec::new();
    for clip in &req.timeline.clips {
        if let Some(aid) = &clip.asset_id {
            if !asset_inputs.contains_key(aid) {
                let asset = req
                    .assets
                    .iter()
                    .find(|a| &a.id == aid)
                    .ok_or_else(|| AppError::Other(format!("asset {aid} not provided")))?;
                asset_inputs.insert(aid.clone(), input_paths.len());
                input_paths.push(asset.path.clone());
            }
        }
    }

    let mut filter_parts: Vec<String> = Vec::new();

    let mut video_track_outputs: Vec<String> = Vec::new();
    for (ti, track) in video_tracks.iter().enumerate() {
        let mut clips: Vec<&Clip> = req
            .timeline
            .clips
            .iter()
            .filter(|c| c.track_id == track.id && (c.kind == "video" || c.kind == "image"))
            .collect();
        clips.sort_by(|a, b| {
            a.start_sec
                .partial_cmp(&b.start_sec)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        if clips.is_empty() {
            continue;
        }

        for (ci, clip) in clips.iter().enumerate() {
            let aid = clip
                .asset_id
                .as_ref()
                .ok_or_else(|| AppError::Other(format!("video clip {} missing asset_id", clip.id)))?;
            let in_idx = asset_inputs[aid];
            filter_parts.push(format!(
                "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS[vt{}c{}]",
                in_idx, clip.in_point_sec, clip.out_point_sec, ti, ci
            ));
        }

        let after_concat_label = if clips.len() == 1 {
            format!("vt{}c0", ti)
        } else {
            let inputs: String = (0..clips.len()).map(|i| format!("[vt{}c{}]", ti, i)).collect();
            let label = format!("vt{}cat", ti);
            filter_parts.push(format!(
                "{}concat=n={}:v=1:a=0[{}]",
                inputs,
                clips.len(),
                label
            ));
            label
        };

        let scaled_label = format!("v{}", ti);
        filter_parts.push(format!(
            "[{}]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[{}]",
            after_concat_label, preset.width, preset.height, preset.width, preset.height, scaled_label
        ));
        video_track_outputs.push(scaled_label);
    }

    let video_after_overlay = if video_track_outputs.is_empty() {
        let label = "vbase";
        filter_parts.push(format!(
            "color=black:size={}x{}:rate={},setsar=1[{}]",
            preset.width, preset.height, preset.fps, label
        ));
        label.to_string()
    } else if video_track_outputs.len() == 1 {
        video_track_outputs[0].clone()
    } else {
        let mut current = video_track_outputs[0].clone();
        for (i, next) in video_track_outputs.iter().enumerate().skip(1) {
            let new_label = format!("vovl{}", i);
            filter_parts.push(format!("[{}][{}]overlay=0:0[{}]", current, next, new_label));
            current = new_label;
        }
        current
    };

    let video_after_captions = match captions_track {
        Some(t) => burn_captions(&mut filter_parts, &req.timeline.clips, t, &video_after_overlay),
        None => video_after_overlay,
    };

    let brand_kit = req.brand_kit.clone().unwrap_or_else(RenderBrandKit::fallback);
    let final_video_label = burn_graphic_clips(
        &mut filter_parts,
        &req.timeline.clips,
        &brand_kit,
        preset,
        &video_after_captions,
    );

    let mut audio_track_outputs: Vec<String> = Vec::new();
    for (ti, track) in audio_tracks.iter().enumerate() {
        let mut clips: Vec<&Clip> = req
            .timeline
            .clips
            .iter()
            .filter(|c| c.track_id == track.id && c.kind == "audio")
            .collect();
        clips.sort_by(|a, b| {
            a.start_sec
                .partial_cmp(&b.start_sec)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        if clips.is_empty() {
            continue;
        }

        for (ci, clip) in clips.iter().enumerate() {
            let aid = clip
                .asset_id
                .as_ref()
                .ok_or_else(|| AppError::Other(format!("audio clip {} missing asset_id", clip.id)))?;
            let in_idx = asset_inputs[aid];
            let delay_ms = (clip.start_sec * 1000.0).round() as i64;
            let delay_part = if delay_ms > 0 {
                format!(",adelay={delay_ms}|{delay_ms}")
            } else {
                String::new()
            };
            filter_parts.push(format!(
                "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS{},volume={}[at{}c{}]",
                in_idx, clip.in_point_sec, clip.out_point_sec, delay_part, track.volume, ti, ci
            ));
        }

        let track_label = if clips.len() == 1 {
            format!("at{}c0", ti)
        } else {
            let inputs: String = (0..clips.len()).map(|i| format!("[at{}c{}]", ti, i)).collect();
            let label = format!("amix{}", ti);
            filter_parts.push(format!(
                "{}amix=inputs={}:dropout_transition=0:normalize=0[{}]",
                inputs,
                clips.len(),
                label
            ));
            label
        };
        audio_track_outputs.push(track_label);
    }

    let mixed_audio_label = if audio_track_outputs.is_empty() {
        let label = "asilence";
        filter_parts.push(format!(
            "anullsrc=channel_layout=stereo:sample_rate=48000[{}]",
            label
        ));
        label.to_string()
    } else if audio_track_outputs.len() == 1 {
        audio_track_outputs[0].clone()
    } else {
        let inputs: String = audio_track_outputs.iter().map(|l| format!("[{}]", l)).collect();
        let label = "aout";
        filter_parts.push(format!(
            "{}amix=inputs={}:dropout_transition=0:normalize=0[{}]",
            inputs,
            audio_track_outputs.len(),
            label
        ));
        label.to_string()
    };

    let final_audio_label = match preset.loudnorm_lufs {
        Some(lufs) => {
            let target = LoudnormTarget {
                integrated_lufs: lufs,
                true_peak_db: -1.0,
                range_lu: 11.0,
            };
            let label = "aloud";
            filter_parts.push(format!(
                "[{}]{}[{}]",
                mixed_audio_label,
                target.ffmpeg_filter(),
                label
            ));
            label.to_string()
        }
        None => mixed_audio_label,
    };

    let total_duration_sec = req
        .timeline
        .clips
        .iter()
        .map(|c| c.start_sec + c.duration_sec)
        .fold(0.0_f64, f64::max);
    let total_frames = if total_duration_sec > 0.0 {
        Some((total_duration_sec * preset.fps as f64).round() as u64)
    } else {
        None
    };

    let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into()];

    let needs_lavfi = video_track_outputs.is_empty() || audio_track_outputs.is_empty();
    if needs_lavfi {
        args.push("-f".into());
        args.push("lavfi".into());
        args.push("-i".into());
        args.push("anullsrc=channel_layout=stereo:sample_rate=48000".into());
    }

    for path in &input_paths {
        args.push("-i".into());
        args.push(path.clone());
    }

    args.push("-filter_complex".into());
    args.push(filter_parts.join(";"));

    args.push("-map".into());
    args.push(format!("[{}]", final_video_label));
    args.push("-map".into());
    args.push(format!("[{}]", final_audio_label));

    args.push("-c:v".into());
    args.push(preset.video_codec.clone());
    let is_prores = preset.video_codec.contains("prores");
    if is_prores {
        // ProRes: profile 4 = 4444 (alpha-capable, master quality). Skip
        // -b:v since ProRes is profile-driven, not bitrate-driven. Use
        // yuv422p10le since 4444 supports 10-bit + alpha.
        args.push("-profile:v".into());
        args.push("4".into());
    } else {
        args.push("-b:v".into());
        args.push(preset.video_bitrate.clone());
    }
    args.push("-c:a".into());
    args.push(preset.audio_codec.clone());
    if !is_prores {
        args.push("-b:a".into());
        args.push(preset.audio_bitrate.clone());
    }
    args.push("-r".into());
    args.push(preset.fps.to_string());
    args.push("-pix_fmt".into());
    args.push(if is_prores { "yuv422p10le".into() } else { "yuv420p".into() });

    if total_duration_sec > 0.0 {
        args.push("-t".into());
        args.push(format!("{total_duration_sec}"));
    }

    args.push("-progress".into());
    args.push("pipe:1".into());
    args.push("-nostats".into());

    args.push(req.output_path.clone());

    Ok(RenderPlan { args, total_frames })
}

fn burn_captions(
    filter_parts: &mut Vec<String>,
    clips: &[Clip],
    captions_track: &Track,
    video_in: &str,
) -> String {
    let cap_clips: Vec<&Clip> = clips
        .iter()
        .filter(|c| c.track_id == captions_track.id && c.kind == "caption")
        .collect();
    if cap_clips.is_empty() {
        return video_in.to_string();
    }

    let mut current = video_in.to_string();
    for (ci, c) in cap_clips.iter().enumerate() {
        let text = c
            .data
            .as_ref()
            .and_then(|v| v.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if text.is_empty() {
            continue;
        }
        let safe = escape_drawtext(text);
        let new_label = format!("vcap{}", ci);
        filter_parts.push(format!(
            "[{}]drawtext=text='{}':fontsize=48:fontcolor=white:bordercolor=black:borderw=4:x=(w-text_w)/2:y=h-th-100:enable='between(t\\,{}\\,{})'[{}]",
            current,
            safe,
            c.start_sec,
            c.start_sec + c.duration_sec,
            new_label
        ));
        current = new_label;
    }
    current
}

fn escape_drawtext(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('%', "\\%")
}

/// Convert "#RRGGBB" or "#RGB" to FFmpeg's "0xRRGGBB" form. Returns the
/// fallback unchanged if the input doesn't match.
fn hex_to_ffmpeg_color(hex: &str) -> String {
    let h = hex.trim();
    let rest = h.strip_prefix('#').unwrap_or(h);
    if rest.len() == 6 && rest.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("0x{rest}")
    } else if rest.len() == 3 && rest.chars().all(|c| c.is_ascii_hexdigit()) {
        let r: String = rest.chars().nth(0).unwrap().to_string().repeat(2);
        let g: String = rest.chars().nth(1).unwrap().to_string().repeat(2);
        let b: String = rest.chars().nth(2).unwrap().to_string().repeat(2);
        format!("0x{r}{g}{b}")
    } else {
        h.to_string()
    }
}

/// Burns titleCard / lowerThird / outro / lottie clips on top of the video
/// chain via drawbox + drawtext filters. Each clip is rendered exclusively
/// during its [start, start+duration] window via `enable=between(t,...)`.
fn burn_graphic_clips(
    filter_parts: &mut Vec<String>,
    clips: &[Clip],
    bk: &RenderBrandKit,
    preset: &RenderPreset,
    video_in: &str,
) -> String {
    let graphics: Vec<&Clip> = clips
        .iter()
        .filter(|c| matches!(c.kind.as_str(), "titleCard" | "lowerThird" | "outro" | "lottie"))
        .collect();
    if graphics.is_empty() {
        return video_in.to_string();
    }

    let bg = hex_to_ffmpeg_color(&bk.background);
    let primary = hex_to_ffmpeg_color(&bk.primary);
    let accent = hex_to_ffmpeg_color(&bk.accent);
    let head_font = bk.headline_font.replace('\'', "");
    let body_font = bk.body_font.replace('\'', "");

    let mut current = video_in.to_string();
    for (gi, c) in graphics.iter().enumerate() {
        let t0 = c.start_sec;
        let t1 = c.start_sec + c.duration_sec;
        let enable = format!("enable='between(t\\,{}\\,{})'", t0, t1);

        match c.kind.as_str() {
            "titleCard" => {
                let title = c.data.as_ref().and_then(|v| v.get("title")).and_then(|v| v.as_str()).unwrap_or("Headline");
                let subtitle = c.data.as_ref().and_then(|v| v.get("subtitle")).and_then(|v| v.as_str()).unwrap_or("");
                let anchor = c.data.as_ref().and_then(|v| v.get("anchor")).and_then(|v| v.as_str()).unwrap_or("center");

                let title_y = match anchor {
                    "top" => format!("h*0.18"),
                    "bottom" => format!("h*0.74"),
                    _ => format!("(h-text_h)/2-h*0.04"),
                };
                let subtitle_y = match anchor {
                    "top" => format!("h*0.18+h*0.10"),
                    "bottom" => format!("h*0.74+h*0.10"),
                    _ => format!("(h-text_h)/2+h*0.06"),
                };

                // Background veil
                let label = format!("vg{}", gi);
                filter_parts.push(format!(
                    "[{}]drawbox=x=0:y=0:w=iw:h=ih:color={}@0.82:t=fill:{}[{}]",
                    current, bg, enable, label
                ));
                current = label;

                // Title
                let label = format!("vgt{}", gi);
                filter_parts.push(format!(
                    "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x=(w-text_w)/2:y={}:{}[{}]",
                    current,
                    escape_drawtext(title),
                    head_font,
                    (preset.width as f64 / 13.5) as u32,
                    primary,
                    title_y,
                    enable,
                    label
                ));
                current = label;

                if !subtitle.is_empty() {
                    let label = format!("vgs{}", gi);
                    filter_parts.push(format!(
                        "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x=(w-text_w)/2:y={}:{}[{}]",
                        current,
                        escape_drawtext(subtitle),
                        body_font,
                        (preset.width as f64 / 25.0) as u32,
                        accent,
                        subtitle_y,
                        enable,
                        label
                    ));
                    current = label;
                }
            }
            "lowerThird" => {
                let name = c.data.as_ref().and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("Speaker");
                let subtitle = c.data.as_ref().and_then(|v| v.get("subtitle")).and_then(|v| v.as_str()).unwrap_or("");
                let anchor = c.data.as_ref().and_then(|v| v.get("anchor")).and_then(|v| v.as_str()).unwrap_or("left");

                // Box: positioned bottom-left or bottom-right
                let box_x = if anchor == "right" {
                    "iw-w-iw*0.05".to_string()
                } else {
                    "iw*0.05".to_string()
                };
                let box_y = "ih*0.78".to_string();
                let box_w = "iw*0.55";
                let box_h = if subtitle.is_empty() { "ih*0.08" } else { "ih*0.13" };

                // For drawbox we need width/height as static expressions.
                // FFmpeg supports expressions via `w=iw*0.55:h=ih*0.13`.
                let label = format!("vg{}", gi);
                filter_parts.push(format!(
                    "[{}]drawbox=x={}:y={}:w={}:h={}:color={}:t=fill:{}[{}]",
                    current, box_x, box_y, box_w, box_h, primary, enable, label
                ));
                current = label;

                // Text inside box. We approximate the box position with
                // simple offsets — drawtext expressions reference the FRAME,
                // not the box, so we anchor relative to canvas.
                let text_x = if anchor == "right" {
                    "iw-text_w-iw*0.07".to_string()
                } else {
                    "iw*0.07".to_string()
                };
                let name_y = "ih*0.80";
                let label = format!("vgn{}", gi);
                filter_parts.push(format!(
                    "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x={}:y={}:{}[{}]",
                    current,
                    escape_drawtext(name),
                    body_font,
                    (preset.width as f64 / 24.0) as u32,
                    bg,
                    text_x,
                    name_y,
                    enable,
                    label
                ));
                current = label;

                if !subtitle.is_empty() {
                    let label = format!("vgsub{}", gi);
                    filter_parts.push(format!(
                        "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x={}:y={}:{}[{}]",
                        current,
                        escape_drawtext(subtitle),
                        body_font,
                        (preset.width as f64 / 36.0) as u32,
                        bg,
                        text_x,
                        "ih*0.85",
                        enable,
                        label
                    ));
                    current = label;
                }
            }
            "outro" => {
                let headline = c.data.as_ref().and_then(|v| v.get("headline")).and_then(|v| v.as_str()).unwrap_or("Thanks");
                let cta = c.data.as_ref().and_then(|v| v.get("cta")).and_then(|v| v.as_str()).unwrap_or("");

                let label = format!("vg{}", gi);
                filter_parts.push(format!(
                    "[{}]drawbox=x=0:y=0:w=iw:h=ih:color={}:t=fill:{}[{}]",
                    current, bg, enable, label
                ));
                current = label;

                let label = format!("vgh{}", gi);
                filter_parts.push(format!(
                    "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x=(w-text_w)/2:y=(h-text_h)/2-h*0.05:{}[{}]",
                    current,
                    escape_drawtext(headline),
                    head_font,
                    (preset.width as f64 / 12.0) as u32,
                    primary,
                    enable,
                    label
                ));
                current = label;

                if !cta.is_empty() {
                    let label = format!("vgc{}", gi);
                    filter_parts.push(format!(
                        "[{}]drawtext=text='{}':font='{}':fontsize={}:fontcolor={}:x=(w-text_w)/2:y=(h-text_h)/2+h*0.05:{}[{}]",
                        current,
                        escape_drawtext(cta),
                        body_font,
                        (preset.width as f64 / 22.0) as u32,
                        accent,
                        enable,
                        label
                    ));
                    current = label;
                }
            }
            "lottie" => {
                // Wave 4 placeholder: render a small "Lottie clip" tag.
                // True Lottie rendering is Wave 5 territory.
                let label = format!("vg{}", gi);
                filter_parts.push(format!(
                    "[{}]drawbox=x=iw*0.4:y=ih*0.45:w=iw*0.2:h=ih*0.10:color={}:t=fill:{}[{}]",
                    current, primary, enable, label
                ));
                current = label;
                let label = format!("vgL{}", gi);
                filter_parts.push(format!(
                    "[{}]drawtext=text='Lottie clip':font='{}':fontsize={}:fontcolor={}:x=(w-text_w)/2:y=(h-text_h)/2:{}[{}]",
                    current,
                    body_font,
                    (preset.width as f64 / 30.0) as u32,
                    bg,
                    enable,
                    label
                ));
                current = label;
            }
            _ => {}
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_probe::AssetKind;

    fn mk_asset(id: &str, path: &str, dur: f64) -> Asset {
        Asset {
            id: id.into(),
            project_id: "p1".into(),
            kind: AssetKind::Video.as_str().into(),
            name: format!("{id}.mp4"),
            path: path.into(),
            thumbnail_path: None,
            duration_sec: Some(dur),
            width: Some(1920),
            height: Some(1080),
            fps: Some(30.0),
            audio_channels: Some(2),
            audio_sample_rate: Some(48000),
            size_bytes: 1024,
            imported_at: 0,
        }
    }

    fn mk_track(id: &str, kind: &str, order: i64) -> Track {
        Track {
            id: id.into(),
            project_id: "p1".into(),
            kind: kind.into(),
            name: id.into(),
            sort_order: order,
            muted: false,
            hidden: false,
            volume: 1.0,
            pan: 0.0,
        }
    }

    fn mk_clip(id: &str, track: &str, asset: Option<&str>, kind: &str, start: f64, dur: f64) -> Clip {
        Clip {
            id: id.into(),
            track_id: track.into(),
            asset_id: asset.map(String::from),
            kind: kind.into(),
            start_sec: start,
            duration_sec: dur,
            in_point_sec: 0.0,
            out_point_sec: dur,
            data: None,
            sort_order: 0,
        }
    }

    #[test]
    fn single_video_clip_filter_graph() {
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![mk_track("v1", "video", 0)],
                clips: vec![mk_clip("c1", "v1", Some("a1"), "video", 0.0, 5.0)],
            },
            assets: vec![mk_asset("a1", "/tmp/a1.mp4", 10.0)],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: None,
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc_idx = plan.args.iter().position(|s| s == "-filter_complex").expect("fc");
        let fc = &plan.args[fc_idx + 1];

        assert!(fc.contains("[0:v]trim=start=0:end=5"), "fc: {fc}");
        assert!(fc.contains("scale=1080:1920"), "fc: {fc}");
        assert!(fc.contains("h264_videotoolbox") == false, "codec is in args, not fc");
        assert!(plan.args.iter().any(|s| s == "h264_videotoolbox"));
    }

    #[test]
    fn split_clip_concat() {
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![mk_track("v1", "video", 0)],
                clips: vec![
                    mk_clip("c1", "v1", Some("a1"), "video", 0.0, 3.0),
                    Clip {
                        id: "c2".into(),
                        track_id: "v1".into(),
                        asset_id: Some("a1".into()),
                        kind: "video".into(),
                        start_sec: 3.0,
                        duration_sec: 4.0,
                        in_point_sec: 5.0,
                        out_point_sec: 9.0,
                        data: None,
                        sort_order: 1,
                    },
                ],
            },
            assets: vec![mk_asset("a1", "/tmp/a1.mp4", 10.0)],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: None,
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc = &plan.args[plan.args.iter().position(|s| s == "-filter_complex").unwrap() + 1];
        assert!(fc.contains("concat=n=2:v=1:a=0"), "fc: {fc}");
        assert!(fc.contains("[vt0c0][vt0c1]"), "fc: {fc}");
    }

    #[test]
    fn audio_with_delay() {
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![mk_track("a1", "audio", 0)],
                clips: vec![Clip {
                    id: "ac1".into(),
                    track_id: "a1".into(),
                    asset_id: Some("ast1".into()),
                    kind: "audio".into(),
                    start_sec: 2.5,
                    duration_sec: 3.0,
                    in_point_sec: 0.0,
                    out_point_sec: 3.0,
                    data: None,
                    sort_order: 0,
                }],
            },
            assets: vec![mk_asset("ast1", "/tmp/song.mp3", 60.0)],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: None,
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc = &plan.args[plan.args.iter().position(|s| s == "-filter_complex").unwrap() + 1];
        assert!(fc.contains("adelay=2500|2500"), "fc: {fc}");
    }

    #[test]
    fn hex_color_conversion() {
        assert_eq!(hex_to_ffmpeg_color("#A8E544"), "0xA8E544");
        assert_eq!(hex_to_ffmpeg_color("a8e544"), "0xa8e544");
        assert_eq!(hex_to_ffmpeg_color("#fff"), "0xffffff");
        assert_eq!(hex_to_ffmpeg_color("not-a-color"), "not-a-color");
    }

    #[test]
    fn title_card_burns_drawbox_and_drawtext() {
        use serde_json::json;
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![mk_track("v1", "video", 0)],
                clips: vec![Clip {
                    id: "tc1".into(),
                    track_id: "v1".into(),
                    asset_id: None,
                    kind: "titleCard".into(),
                    start_sec: 0.0,
                    duration_sec: 3.0,
                    in_point_sec: 0.0,
                    out_point_sec: 3.0,
                    data: Some(json!({
                        "title": "Hello",
                        "subtitle": "World",
                        "anchor": "center"
                    })),
                    sort_order: 0,
                }],
            },
            assets: vec![],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: None,
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc = &plan.args[plan.args.iter().position(|s| s == "-filter_complex").unwrap() + 1];
        assert!(fc.contains("drawbox"), "fc: {fc}");
        assert!(fc.contains("drawtext=text='Hello'"), "fc: {fc}");
        assert!(fc.contains("drawtext=text='World'"), "fc: {fc}");
        assert!(fc.contains("between(t\\,0\\,3)"), "fc: {fc}");
    }

    #[test]
    fn lower_third_uses_brand_kit_primary_for_box() {
        use serde_json::json;
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![mk_track("v1", "video", 0)],
                clips: vec![Clip {
                    id: "lt1".into(),
                    track_id: "v1".into(),
                    asset_id: None,
                    kind: "lowerThird".into(),
                    start_sec: 1.0,
                    duration_sec: 4.0,
                    in_point_sec: 0.0,
                    out_point_sec: 4.0,
                    data: Some(json!({
                        "name": "Janno",
                        "subtitle": "Founder",
                        "anchor": "left"
                    })),
                    sort_order: 0,
                }],
            },
            assets: vec![],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: Some(RenderBrandKit {
                primary: "#A8E544".into(),
                secondary: "#1A1A1A".into(),
                accent: "#FF7F50".into(),
                background: "#0B0C0F".into(),
                headline_font: "Inter".into(),
                body_font: "Inter".into(),
            }),
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc = &plan.args[plan.args.iter().position(|s| s == "-filter_complex").unwrap() + 1];
        assert!(fc.contains("color=0xA8E544"), "fc: {fc}");
        assert!(fc.contains("text='Janno'"), "fc: {fc}");
        assert!(fc.contains("text='Founder'"), "fc: {fc}");
    }

    #[test]
    fn captions_burn_in() {
        use serde_json::json;
        let request = RenderRequest {
            render_id: "r1".into(),
            project_id: "p1".into(),
            timeline: Timeline {
                project_id: "p1".into(),
                tracks: vec![
                    mk_track("v1", "video", 0),
                    mk_track("cap", "captions", 5),
                ],
                clips: vec![
                    mk_clip("vc1", "v1", Some("a1"), "video", 0.0, 5.0),
                    Clip {
                        id: "cap1".into(),
                        track_id: "cap".into(),
                        asset_id: None,
                        kind: "caption".into(),
                        start_sec: 1.0,
                        duration_sec: 2.0,
                        in_point_sec: 0.0,
                        out_point_sec: 2.0,
                        data: Some(json!({ "text": "Hello world" })),
                        sort_order: 0,
                    },
                ],
            },
            assets: vec![mk_asset("a1", "/tmp/a1.mp4", 10.0)],
            preset: reel_9_16(),
            output_path: "/tmp/out.mp4".into(),
            brand_kit: None,
        };

        let plan = build_render_plan(&request).expect("plan");
        let fc = &plan.args[plan.args.iter().position(|s| s == "-filter_complex").unwrap() + 1];
        assert!(fc.contains("drawtext=text='Hello world'"), "fc: {fc}");
        assert!(fc.contains("between(t\\,1\\,3)"), "fc: {fc}");
    }
}
