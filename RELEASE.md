# Release process

This app uses Tauri's signed-update mechanism. Each tagged commit on
`main` triggers a GitHub Actions build (`.github/workflows/release.yml`)
that produces a signed `.app.tar.gz`, generates `latest.json`, and uploads
both as assets on the GitHub Release. The shipped app pings that
`latest.json` on startup (and on demand from Settings → Updates) and
self-installs newer versions.

## One-time setup (you do this once, locally)

### 1. Generate the signing keypair

```bash
npm run tauri signer generate -- -w ~/.tauri/wg-video-studio.key
```

This produces:

- `~/.tauri/wg-video-studio.key` — **private**, never commit, never
  share. Keep on your dev machine + GitHub Secrets only.
- `~/.tauri/wg-video-studio.key.pub` — **public**, paste into
  `src-tauri/tauri.conf.json` (see step 2).

When prompted for a password, pick something memorable. You'll need it
again as a GitHub secret.

### 2. Paste the public key into `tauri.conf.json`

Open `src-tauri/tauri.conf.json` and replace the placeholder:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/janno-alt/wg-motion-studio/releases/latest/download/latest.json"
    ],
    "pubkey": "REPLACE_WITH_YOUR_PUBKEY_FROM_TAURI_SIGNER_GENERATE",
    ...
```

Paste the entire content of `~/.tauri/wg-video-studio.key.pub` as a
single string (copy with `cat ~/.tauri/wg-video-studio.key.pub | pbcopy`
on macOS). Commit that change.

### 3. Add GitHub Secrets

Go to repo settings → Secrets and variables → Actions → New
repository secret. Add **two** secrets:

| Name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Output of `cat ~/.tauri/wg-video-studio.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you typed in step 1 |

The CI job uses these to sign the `.app.tar.gz` so your shipped app can
verify it before installing.

## Cutting a release

```bash
# Bump the version in 3 places:
#   - package.json
#   - src-tauri/Cargo.toml
#   - src-tauri/tauri.conf.json
#   - src/lib/version.ts
# Commit + push, then tag:
git tag v0.2.0
git push origin v0.2.0
```

That kicks off `.github/workflows/release.yml` which:

1. Spins up a `macos-14` runner (arm64).
2. Builds the sidecar binaries (ffmpeg + ffprobe via Homebrew, whisper
   from source — `cmake --build … --target whisper-cli`).
3. Runs `tauri build --target aarch64-apple-darwin`, signing with
   `TAURI_SIGNING_PRIVATE_KEY`.
4. Creates the GitHub Release `v0.2.0` and uploads:
   - `wg-video-studio_0.2.0_aarch64.app.tar.gz`
   - `wg-video-studio_0.2.0_aarch64.app.tar.gz.sig`
   - `latest.json` (the manifest the app polls)

## How users get the update

- **Auto on startup**: 4s after launch the app silently calls `check()`
  against the `latest.json` URL. If the version is newer, a sticky
  Sonner toast appears in the bottom-right with an Install button. One
  click downloads + verifies + relaunches.
- **Manual from Settings**: Settings → Updates → Check now. Same flow,
  surfaces the underlying error if the pubkey is wrong or the manifest
  is unreachable.

The startup check runs at most once per 6 hours (tracked in
localStorage) so the user isn't pinged on every relaunch during heavy
editing sessions.

## Troubleshooting

**"Updater pubkey may not be configured yet"** in the Settings card
means the `pubkey` field in `tauri.conf.json` is still the placeholder
or doesn't match the key the release was signed with. Re-check step 2.

**`latest.json` 404** means the release didn't include the manifest as
an asset. The workflow has `includeUpdaterJson: true`, but if you
released manually without `tauri-action`, you have to upload it
yourself. The simplest fix is to delete the release and re-tag.

**Update downloads but install fails** typically means the bundle and
the signature don't match — i.e. the bundle was rebuilt without
re-signing. Re-run the release workflow.

## Local dry-run (without publishing)

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

This produces `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/wg-video-studio.app`
which you can run directly. To test the updater path locally, point
`tauri.conf.json` `endpoints` at a local file URL containing your own
test manifest, then bump the local version to be lower than the manifest's.
