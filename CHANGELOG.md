# Changelog

All notable changes to AsciiFlow are listed here, newest first.

Releases are tagged on GitHub (`vX.Y.Z`). Changes before 1.0.0 are grouped by date; entries before November 2026 were reconstructed from the commit history.

## Unreleased

- Dependabot: monthly update PRs for the GitHub Actions and the npm test tooling, only for
  versions at least 14 days old
- Much faster routing on big diagrams: dragging a shape in a diagram with 100 shapes now keeps up
  with the screen (16.7 ms per move, was 64 ms; 400 shapes: was 535 ms). Routes are shared
  between drawing and hit-testing, searched in a window around the shapes first, and kept between
  frames until something they depend on changes; output is unchanged

## 1.0.0 - 2026-11-03

First tagged release.

- Mermaid: import every flowchart node shape, edge style and end (`o`, `x`), both label forms,
  chains and `&` groups, `BT`/`RL`, subgraphs (as containers, nested too) and ignore styling
  lines; new **Copy as Mermaid Flowchart** export
- Browser tests (Playwright) for the real app in CI, including a WCAG 2.1 A/AA check with
  axe-core in both themes and every dialog
- Accessibility: readable contrast in both themes (dark dialogs were nearly unreadable), named
  property controls, `aria-pressed` on toggle buttons, a keyboard-focusable and labelled ASCII
  preview, and a labelled canvas
- Fix undo after redo doing nothing (a fresh `updatedAt` stamp looked like an unsaved change)
- Routing: a standard route is only kept when it really enters the target from the right side,
  a re-routed connector leaves its shape straight out, and lines no longer erase a diamond's tip
- ASCII import: corner ends attach to the shape they bend into, and arrowless connectors keep
  their direction when one end leaves a box through a junction
- Connectors no longer run through other shapes: when the standard route would cross one, a
  route around it is found (trying other sides for auto anchors and avoiding sides other
  connectors already use); routes that were already clear are unchanged
- Canvas hit-testing now uses the same routes as the drawing, including connectors to notes
- Connector labels no longer hide arrowheads, junctions or each other: they are placed after
  all connectors are drawn, on the line where they fit and beside it where they don't
- ASCII import recognises every shape type (adding hexagons, triangles, databases, clouds and
  queues), joins connectors that split or merge at a junction, and attaches labels placed
  beside a line; all three templates now re-import to an identical diagram
- Fix undo: one Undo now reverts one change (the first Undo after a change did nothing), and
  Undo is disabled when there is nothing to undo
- New and Templates no longer ask for confirmation in a browser dialog: replacing the diagram is
  one undo step, and the toast offers an Undo button
- Fit to view zooms out to the canvas minimum and, for diagrams still larger than the view,
  shows them from the top-left instead of centring on what may be empty space
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
