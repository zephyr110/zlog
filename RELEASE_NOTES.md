# Zlog Desktop — Release Notes

## desktop-v0.1.0

First desktop release (unsigned).

- Full blog + admin CMS on your machine; local SQLite with optional
  two-way sync to Turso (embedded replica).
- Platforms: macOS (dmg/zip), Windows (nsis), Linux (AppImage/deb).
- Known limitations: sync is row-level last-write-wins; edit the same
  post from only one end at a time. Media uploads without a GitHub token
  stay database-only (no jsdelivr CDN copy).
