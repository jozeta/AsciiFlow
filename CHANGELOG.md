# Changelog

All notable changes to AsciiFlow are listed here, newest first.

The project has no tagged releases yet, so changes are grouped by date. Entries before November 2026 were reconstructed from the commit history.

## Unreleased

- Serve Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 from `vendor/` instead of jsDelivr, so the
  app makes no third-party requests and works offline
- Validate diagrams from share links, imported or dropped JSON and localStorage: unknown modes,
  oversized coordinates/sizes, huge lists and wrongly typed values are clamped or dropped; valid
  diagrams load unchanged
- Add a dependency-free Node test suite (`node --test tests/`) for the renderer, the importers
  and diagram validation
- Move the README screenshot to `docs/screenshots/editor.png` with descriptive alt text; document
  the file layout, how to run and test, and the security model

## 2026-11-02

- Add security policy

## 2026-11-01

- Ignore macOS, Claude Code and secret files
- Add CLAUDE.md with project guidance for Claude Code

## 2026-09-24

- Add GitHub Pages live demo link to README
