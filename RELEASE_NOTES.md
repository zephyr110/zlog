# Zlog Desktop — Release Notes

## v1.0.0

First stable release (unsigned).

- Full blog + admin CMS on your machine; local SQLite with optional
  two-way sync to Turso (embedded replica).
- Platforms: macOS (dmg/zip, **arm64 + x64**), Windows (nsis), Linux
  (AppImage/deb). x64 macOS builds run on the macos-15-intel runner
  (GitHub's last Intel runner; EOL 2027-08).
- First-run wizard, settings window, and tray app polished since beta;
  initial-sync reliability fixes.
- Versioning now follows SemVer with annotated `v`-prefixed tags
  (see CLAUDE.md); desktop CI triggers only on `v[0-9]*` tags.
- Known limitations: sync is row-level last-write-wins; edit the same
  post from only one end at a time. Media uploads without a GitHub token
  stay database-only (no jsdelivr CDN copy). Binaries are unsigned —
  macOS Gatekeeper / Windows SmartScreen will warn on first launch.

## v0.1.0-beta.3

Beta (unsigned). Same feature set; first-run sync fixes.
