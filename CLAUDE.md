# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AsciiFlow is a browser-based ASCII/Unicode diagram and flowchart editor: draw shapes and
orthogonal connectors visually, then copy the result as text (or export SVG/PNG/Markdown/JSON).
It can also import raw ASCII diagrams and Mermaid `graph TD/LR`. Plain HTML/CSS/vanilla JS, no
build step, no runtime dependencies. Live at https://jozeta.github.io/AsciiFlow/ (GitHub Pages).

## Commands

```sh
python3 -m http.server 8000      # then open http://localhost:8000/
```

Opening `index.html` directly also works.

```sh
node --test tests/*.test.js               # unit tests: Node 18+, nothing to install
npm ci && npx playwright install chromium # once, for the browser tests
npx playwright test                       # browser tests (tests/e2e), serves the app on :8123
```

`package.json` holds test tooling only (Playwright, axe-core); the app itself stays
dependency-free and is never built. In browser tests use `ControlOrMeta` for shortcuts (the app
uses Cmd on macOS), and start from `about:blank` before opening a `#diagram=` link, or the page
will not reload. `tests/e2e/accessibility.spec.js` fails on any new WCAG A/AA violation.

The tests load the browser scripts into a `vm` context (`tests/helpers.js`) and cover the
renderer (both modes), ASCII/Mermaid import and `normalizeDiagram()` validation. Wrap vm results
in `plain()` before `deepEqual` (cross-realm prototypes). There is no linter; also verify UI
changes in the browser (draw, connect, export, re-import).
- CI (`.github/workflows/ci.yml`) runs `node --check` on `js/` and `tests/` plus the test suite.
- **ASCII import (`parseAsciiToDiagram`) mirrors the renderer.** Shapes: boxes/containers/notes
  and circles, diamonds and parallelograms have hand-written detectors; databases, queues,
  hexagons, triangles and clouds are guessed from a landmark (`<…>`, `^` over a base, `(…)`) and
  confirmed by `verifyShape()`, which renders that shape type at the guessed box with the real
  renderer and compares outlines, so their geometry never needs copying. Connectors are traced
  through `LINE_GLYPHS` as pieces between ends and T-junctions (straight through crossings,
  turning at corners, stepping over labels), pieces are joined at junctions (arrowhead side =
  target) into fan-out/fan-in connectors, ends attach to the shape they touch (`owner`, or its
  bounding box), labels beside a line are attached to it, and leftover words become `texts`.
  The template round-trip tests require an identical re-render: if you change how the renderer
  draws a shape, junction or label, keep them passing.
- **Mermaid** (`parseMermaidToDiagram` / `diagramToMermaid` in `js/parser.js`): statements split
  on newlines and `;` (not inside quotes or `#quot;`), node shapes from `MERMAID_SHAPES` (the
  opener whose closer comes first wins), edges with `EDGE_RE`/`EDGE_TEXT_RE`. Layout ranks nodes
  along the flow and packs each rank from one edge; a subgraph claims a rectangle over the ranks
  it covers. Exported text must import back to the same shapes, edges and labels (tested).
- **Theme:** `theme.js` sets both `data-theme` (app tokens in `css/app.css`) and `data-bs-theme`
  (Bootstrap's own colours); keep new UI readable in both, the axe test checks contrast.
- **Keyboard drawing** (`handleKeyboardDrawing` in `js/canvas.js`): Tab/Shift+Tab select shapes
  in reading order while the canvas has focus and let focus leave after the last one (never trap
  Tab); a shape tool + Enter adds a connected shape; Enter/F2 edit text; K, Tab, Enter connects.
  Status goes to the `#canvasAnnouncer` live region via `announce()`. Shortcuts are ignored while
  typing in inputs or with a dialog open; keep it that way for new shortcuts.
- **Undo history:** the canvas records a snapshot after every change, so the top of the undo
  stack is the current state and `undo()` returns the entry below it. `loadDiagram(data,
  { undoable: true })` replaces the diagram as one undo step (New, Templates); without it,
  history starts afresh (imports, share links, startup).

## Architecture

| File | Role |
|---|---|
| `index.html` | App shell, toolbars, modals |
| `css/app.css` | Design system, light/dark themes |
| `js/shapes.js` | Shape model/types (rectangle, diamond, cylinder, cloud, queue, container, …) |
| `js/connectors.js` | Connector model, anchors, Manhattan/straight routing |
| `js/renderer.js` | Model → character grid → text (the core algorithm) |
| `js/parser.js` | ASCII and Mermaid import back into shapes |
| `js/canvas.js` | Interactive canvas: hit-testing, snapping, alignment, auto-layout |
| `js/history.js` | Undo/redo |
| `js/storage.js` | Persistence, import validation (`normalizeDiagram`), exports, `#diagram=…` share links |
| `js/theme.js` | Light/dark theme |
| `js/app.js` | Wires everything together |
| `vendor/` | Self-hosted Bootstrap 5.3.3 + Bootstrap Icons 1.11.3 (unmodified npm dist files) |
| `tests/` | `node:test` suite |

- **The model is the source of truth.** Diagrams are JSON (`shapes`, `connectors`, `texts`,
  `notes`, `mode: "unicode"|"ascii"|"unicode-curved"`); text output is always re-rendered from it, never edited.
- **Renderer passes, in order:** shape interiors and borders → connector routing (corners,
  crossings become junctions, border T-junctions, arrowheads) → text placement. Text cells have
  priority: lines never overwrite text, and arrowheads have priority over other connectors'
  lines. Trailing whitespace is trimmed per row.
- **Connector cells are drawn from direction masks** (`DIR_*`, `AsciiGrid.lineDirs`): each
  orthogonal connector records which directions it occupies per cell and `mergeLine()` ORs them
  with what is already there, so corners, T-junctions and crossings (including where a connector
  meets a straight shape border) come from `getLineGlyph()`. Junction names describe the stem:
  `t_down` is `┬`, `t_up` is `┴`.
- **Routing around shapes:** a connector between two shapes keeps the standard route from
  `calculateOptimalRouteInfo()` unless it runs through another shape (containers excluded);
  then `routeAroundShapes()` searches the grid (uniform cost: length + turn penalty + a penalty
  for a shape side another connector already uses, see `sidesInUse()`), trying every side for
  `auto` anchors. For each pair of sides the clear, well-formed standard route is preferred, so
  re-imported diagrams (explicit anchors) route identically. Performance: `createRouteContext()`
  builds the obstacle list and side usage once per pass (and is reused while nothing changed, so
  canvas hit-testing gets the drawn routes for free; pass it through new call sites), the search
  runs in a window around the two shapes before widening, and each detour is kept between passes
  until its own inputs change (`_detourMemo`, keyed by `obstacleKey()` of the searched area). A
  test compares reused routes with routing from scratch over a simulated drag.
- **Second routing step** (`separateOverlappingDetours`, run inside `createRouteContext`): a
  searched detour that runs along another connector's line is searched again, paying per cell
  on other connectors' lines (along costs more than crossing). Re-routes run in an order fixed
  by shape positions, never connector ids or list order, so re-imported diagrams (new ids, new
  order) route the same; a test checks that. The canvas passes the diagram's
  connectors and a shape map that includes notes (`AsciiCanvas.shapeMap()`), so hit-testing
  follows the drawn routes.
- **Labels are placed after all connectors are drawn** (`renderConnectorLabel`): on the line
  where only that connector's own straight line is covered and its line, junction or arrow stays
  visible on both sides; otherwise slid along the line, on another segment, or beside the line;
  the old mid-segment spot is only the last resort.
- **Grid geometry:** canvas cell is 10×18 px; screen → cell via
  `col = floor((x - panX) / (cellWidth * zoom))`. Keep renderer and canvas in agreement.
- Every renderer change must work in both `unicode` and `ascii` modes.
- Share links store the URL-encoded JSON model in the hash; keep the format backward compatible
  so old links still open.
- **Every diagram load goes through `AsciiStorage.normalizeDiagram()`** (share links, JSON
  import/drop, localStorage, undo/redo). It sanitizes untrusted input but must return valid
  diagrams unchanged. If you add a model field that holds an object or array, add a rule for it
  in `SHAPE_FIELDS`/`CONNECTOR_FIELDS`, or it will be dropped on load.
- No CDNs or third-party requests: add front-end libraries under `vendor/<name>-<version>/`.
