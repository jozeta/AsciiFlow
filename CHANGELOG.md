# Changelog

All notable changes to AsciiFlow are listed here, newest first.

The project has no tagged releases yet, so changes are grouped by date. Entries before November 2026 were reconstructed from the commit history.

## Unreleased

- ASCII import now recognises diamonds, parallelograms, circles, notes and titled or dashed
  containers (keeping nested shapes), traces bent connectors as one connector through corners
  and crossings, keeps connector labels and arrowheads, and keeps other text as text items; all
  three templates now re-import with every shape, note and connector
- Fix the Import ASCII dialog shifting the first line when it started with spaces
- Connectors that meet, cross or end on each other or on a shape border now get the right
  junction (`├ ┤ ┬ ┴ ┼`) instead of overwriting one another, and a connector no longer erases
  another connector's arrowhead
- Show import and clipboard errors as a toast instead of a blocking `alert()`
- Add a favicon, and Bootstrap's source maps so the browser's developer tools stop reporting 404s
- Run the syntax check and test suite on GitHub Actions for every push and pull request
- Refresh the README screenshot
- Fix the Unicode junction where a connector leaves the top or bottom of a box: it was drawn
  upside down (`┴` on a bottom border, `┬` on a top border)
- Fix ASCII import of Unicode diagrams: boxes with a connector attached (a `├ ┤ ┬ ┴` junction
  in the border) and boxes with dashed Unicode borders were dropped; Unicode output now
  re-imports the same as ASCII output
- Serve Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 from `vendor/` instead of jsDelivr, so the
  app makes no third-party requests and works offline
- Validate diagrams from share links, imported or dropped JSON and localStorage: unknown modes,
  oversized coordinates/sizes, huge lists and wrongly typed values are clamped or dropped; valid
  diagrams load unchanged
- Add a dependency-free Node test suite (`node --test tests/*.test.js`) for the renderer, the importers
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
