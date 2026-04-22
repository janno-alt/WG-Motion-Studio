#!/usr/bin/env node
// Renders a single plan item as a WebM-alpha or ProRes-4444 clip.
// Invoked by the Tauri backend with one argument: the path to a JSON
// file containing all render inputs. Progress events are written to
// stdout as NDJSON. Errors exit non-zero after writing an error event.

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
  const { item, theme, presets, outputPath, format } = input;

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

  emit("progress", { phase: "selecting" });
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "SingleGraphicPreview",
    inputProps: { item, theme, presets },
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
    inputProps: { item, theme, presets },
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
