# WG Motion Studio

Lokales Desktop-Tool (Tauri v2 + React + TypeScript), das aus SRT-Dateien
KI-gestützte Motion-Graphics-Pläne erzeugt, diese generiert und als Overlays
für DaVinci Resolve exportiert. Rendering: Remotion.

## Status

Phase 1 — Foundation. Tauri-App-Skelett, SQLite-Schema, Routing, Theme-Tokens.

## Dev

```bash
npm install
npm run tauri dev
```

## Stack

- Frontend: React 18, TypeScript strict, Vite, Tailwind, Zustand (+zundo), React Router, TanStack Query
- Desktop: Tauri v2, rusqlite, keyring (macOS Keychain)
- Motion: Remotion 4.x, `@remotion/player`
- AI: `@anthropic-ai/sdk` (Claude Opus), `@google/genai` (Nano Banana 2)

## Projektstruktur

```
src-tauri/     # Rust backend (Tauri commands, SQLite, secrets)
src/           # React frontend
  app/         # Router + shell layout
  features/    # Feature modules (dashboard, editor, …)
  state/       # Zustand stores
  types/       # Shared TypeScript types
  lib/         # Tauri invoke wrappers + utilities
remotion/      # Remotion project (compositions, components, presets)
```
