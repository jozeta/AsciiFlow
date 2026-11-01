# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AsciiFlow is a browser-based ASCII/Unicode diagram and flowchart editor: draw shapes and
orthogonal connectors visually, then copy the result as text (or export SVG/PNG/Markdown/JSON).
It can also import raw ASCII diagrams and Mermaid `graph TD/LR`. Plain HTML/CSS/vanilla JS, no
build step, no dependencies. Live at https://jozeta.github.io/AsciiFlow/ (GitHub Pages).

## Commands

```sh
python3 -m http.server 8000      # then open http://localhost:8000/
```

Opening `index.html` directly also works. There is no test suite or linter; verify changes in
the browser (draw, connect, export, re-import).

## Architecture

| File | Role |
|---|---|
| `index.html` | App shell, toolbars, modals |
| `js/shapes.js` | Shape model/types (rectangle, diamond, cylinder, cloud, queue, container, …) |
| `js/connectors.js` | Connector model, anchors, Manhattan/straight routing |
| `js/renderer.js` | Model → character grid → text (the core algorithm) |
| `js/parser.js` | ASCII and Mermaid import back into shapes |
| `js/canvas.js` | Interactive canvas: hit-testing, snapping, alignment, auto-layout |
| `js/history.js` | Undo/redo |
| `js/storage.js` | Persistence, exports, `#diagram=…` share links |
| `js/theme.js` | Light/dark theme |
| `js/app.js` | Wires everything together |

- **The model is the source of truth.** Diagrams are JSON (`shapes`, `connectors`, `texts`,
  `notes`, `mode: "unicode"|"ascii"`); text output is always re-rendered from it, never edited.
- **Renderer passes, in order:** shape interiors and borders → connector routing (corners,
  crossings become junctions, border T-junctions, arrowheads) → text placement. Text cells have
  priority: lines never overwrite text. Trailing whitespace is trimmed per row.
- **Grid geometry:** canvas cell is 10×18 px; screen → cell via
  `col = floor((x - panX) / (cellWidth * zoom))`. Keep renderer and canvas in agreement.
- Every renderer change must work in both `unicode` and `ascii` modes.
- Share links compress the JSON model into the URL hash; keep the format backward compatible
  so old links still open.
