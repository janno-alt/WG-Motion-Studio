#!/usr/bin/env node
// Renders either a single plan item or a full project composition as a
// WebM-alpha / ProRes-4444 clip. Invoked by the Tauri backend with one
// argument: the path to a JSON file containing `mode` (default "item"),
// the render inputs, and output config. Progress is NDJSON on stdout.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function emit(type, extra = {}) {
  process.stdout.write(JSON.stringify({ type, ...extra }) + "\n");
}

async function main() {
  const [, , inputPath] = process.argv;
  if (!inputPath) {
    emit("error", { message: "no input file path" });
    process.exit(2);
  }

  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const { outputPath, format, mode = "item" } = input;

  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  emit("progress", { phase: "bundling" });
  const bundleLocation = await bundle({
    entryPoint: path.resolve(ROOT, "remotion/entry.ts"),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...(config.resolve ?? {}),
        alias: {
          ...((config.resolve && config.resolve.alias) ?? {}),
          "@": path.resolve(ROOT, "src"),
          "@remotion-project": path.resolve(ROOT, "remotion"),
        },
      },
    }),
  });

  const compositionId = mode === "project" ? "MotionStudioProject" : "SingleGraphicPreview";
  const inputProps =
    mode === "project"
      ? { project: input.project, theme: input.theme, presets: input.presets, videoSrc: null }
      : { item: input.item, theme: input.theme, presets: input.presets };

  emit("progress", { phase: "selecting" });
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  const codec = format === "prores" ? "prores" : "vp9";
  const proResProfile = format === "prores" ? "4444" : undefined;

  emit("progress", { phase: "rendering", frame: 0, total: composition.durationInFrames });
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec,
    proResProfile,
    outputLocation: outputPath,
    pixelFormat: format === "prores" ? "yuva444p10le" : "yuva420p",
    imageFormat: "png",
    inputProps,
    onProgress: ({ renderedFrames }) => {
      emit("progress", {
        phase: "rendering",
        frame: renderedFrames,
        total: composition.durationInFrames,
      });
    },
  });

  emit("done", { outputPath });
}

main().catch((err) => {
  emit("error", { message: err?.message ?? String(err) });
  process.exit(1);
});
