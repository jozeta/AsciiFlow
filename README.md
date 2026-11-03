# AsciiFlow

**AsciiFlow** is a modern, elegant ASCII diagram and flowchart editor inspired by visual diagramming tools such as Microsoft Visio, diagrams.net, and Monodraw. It combines the visual fluidity of a vector diagram editor with the timeless portability of plain-text monospace ASCII and Unicode art.

Diagrams can be designed visually with drag-and-drop shapes, orthogonal connectors, and inline text editing, and then exported or copied to the clipboard with one click to paste directly into GitHub markdown, terminal environments, code comments, Slack, Discord, Jira, or technical documentation — remaining visually intact and aligned.

**🔗 [Try it live](https://jozeta.github.io/AsciiFlow/)**

![The AsciiFlow editor: shape toolbar on the left, a flowchart on the dotted canvas, and the live ASCII preview panel on the right](docs/screenshots/editor.png)

---

## Key Features

- **Bidirectional Text & Code Import**:
  - **ASCII Reverse Engineering**: Paste raw ASCII / Unicode text diagrams. AsciiFlow turns them back into editable shapes: every shape type it can draw (rectangles, rounded boxes, circles, diamonds, parallelograms, hexagons, triangles, databases, clouds, queues, notes and titled containers with the shapes nested inside them), plus connectors traced around corners, through crossings and across junctions where they split or merge, attached to the shapes they touch, with their arrowheads and labels. Any other text becomes free text labels. A diagram copied out of AsciiFlow re-imports to the same diagram.
  - **Mermaid Flowchart Import & Export**: Paste a Mermaid flowchart (`graph`/`flowchart`, any direction). Every node shape, edge style and label, `&` groups, chains and subgraphs (as containers) are parsed and laid out automatically. **Copy as Mermaid Flowchart** turns any diagram back into Mermaid.
  - **Shareable URL Hash**: Generate instant shareable links with the diagram data URL-encoded into `#diagram=...` for frictionless collaboration without a backend database.
- **Smart Alignment & Auto-Layout**:
  - **Align Tools**: One-click alignment across multi-selections (Align Left, Center, Right, Top, Middle, Bottom).
  - **Distribute Tools**: Distribute 3+ shapes evenly across horizontal or vertical space.
  - **Magnetic Alignment Guides**: Snaps shapes to adjacent centers, borders, and midpoints as you drag, displaying cyan guide lines.
  - **Hierarchical Auto-Layout**: Automatic DAG / topological ranking layout that arranges complex flowcharts cleanly in either Top-to-Bottom or Left-to-Right hierarchies.
- **Extended Architecture & Cloud Shapes**:
  - **Database Cylinder**: Top elliptical cap, mid-cylinder rim, and centered body text.
  - **Cloud VPC / Network**: Scalloped arches and rounded lobes.
  - **Message Queue**: Horizontal FIFO buffer slots with vertical dividers.
  - **Subsystem Container / Boundary**: Dashed boundary box with embedded top title that preserves nested child shapes.
  - **Shape Grouping**: Group (`Ctrl+G`) and ungroup (`Ctrl+Shift+G`) multiple shapes to move and manipulate them as a cohesive unit.
- **Dual-End Customizable Arrowheads & Line Styles**:
  - Dual terminals: Customize **Start Arrowhead** and **End Arrowhead** independently.
  - Arrowhead shapes: Solid Triangle (`►`), Open Chevron (`▷`), Dot (`●`), Diamond (`◆`), and Bar/Tee (`│`).
  - Line Styles: Solid (`─`), Dashed (`╌`), Dotted (`┈`), and Double Border (`═`).
  - Routing Modes: Smart Manhattan **Orthogonal** routing or Direct **Straight** line routing.
- **Multi-Format Export Options**:
  - **Export as SVG**: Vector graphics with monospace font stacks and clean background containers.
  - **Export as PNG**: High-DPI rasterized PNG image download.
  - **Copy as Markdown**: Instant clipboard copy formatted as ```` ```text ... ``` ```` for documentation and PR descriptions.
  - **Copy as Mermaid**: The diagram as a Mermaid flowchart (containers become subgraphs).
  - **Save as JSON**: Full diagram model persistence.
  - **Download ASCII (.txt)**: Plain text ASCII art file.

```
/
├── index.html          # Application shell, layout, modals, and toolbars
├── README.md
├── CHANGELOG.md        # Notable changes, newest first
├── CLAUDE.md           # Guidance for Claude Code
├── SECURITY.md         # How to report vulnerabilities
├── LICENSE             # MIT License
├── css/
│   └── app.css         # Nordic design system, light/dark themes, monospace styles
├── js/
│   ├── parser.js       # ASCII reverse-parser and Mermaid flowchart syntax converter
│   ├── renderer.js     # 2D character matrix engine, line styles, arrowheads, and SVG rasterizer
│   ├── shapes.js       # Shape definitions, geometry math, anchors, auto-fit, and grouping
│   ├── connectors.js   # Connector models, segment hit-testing, styles, and terminal definitions
│   ├── history.js      # Undo/Redo stack manager with snapshot cloning
│   ├── storage.js      # Persistence, import validation, exports (SVG, PNG, MD), and URL hash sharing
│   ├── theme.js        # Light/Dark theme manager and reactive canvas updates
│   ├── canvas.js       # Interactive canvas controller, magnetic snap, alignment, auto-layout
│   └── app.js          # Main application orchestrator and event wiring
├── vendor/             # Self-hosted Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 (MIT)
├── favicon.svg
├── .github/workflows/  # CI: syntax check and tests on every push and pull request
├── tests/              # Unit tests (node --test) and browser tests (tests/e2e, Playwright)
├── package.json        # Test tooling only; the app has no dependencies
└── docs/screenshots/   # README images
```

## Running and testing

There is no build step and nothing to install. Serve the folder and open it in a browser:

```sh
python3 -m http.server 8000      # then open http://localhost:8000/
```

The app makes no third-party network requests: Bootstrap and its icon font are served from
`vendor/`.

The unit tests use Node's built-in test runner (Node 18 or newer, nothing to install). They load
the browser scripts in a `vm` sandbox and cover rendering, routing, ASCII and Mermaid import and
export, diagram validation and undo history:

```sh
node --test tests/*.test.js
```

The browser tests drive the real app in Chromium with Playwright: loading without third-party
requests, undo/redo, imports, error toasts, hostile share links, selecting connectors, and a
WCAG 2.1 A/AA check with axe-core in both themes and every dialog. They need the dev tooling:

```sh
npm ci && npx playwright install chromium
npx playwright test
```

GitHub Actions runs both on every push and pull request.

## Phones, tablets and pens

The canvas uses pointer events, so mouse, pen and touch all work: drag shapes and connectors with
a finger, double-tap to edit text, pinch to zoom and drag with two fingers to pan. On narrow
screens the header wraps and turns icon-only, the property bar wraps, and on phones the ASCII
preview starts closed and opens as a full-width panel.

## Accessibility

The interface passes automated WCAG 2.1 A/AA checks (axe-core) in the light and dark themes: text
contrast, named controls, toggle buttons that announce their state (`aria-pressed`), and a
keyboard-focusable ASCII preview that gives screen-reader users the whole diagram as text.

Diagrams can be drawn without a mouse: Tab into the canvas and between shapes, press a shape key
(R, D, C, …) and Enter to add a shape connected to the selected one (Shift+Enter places it below),
type its label and finish with Ctrl+Enter, and connect any two shapes with K, Tab to the target,
Enter. Each step is announced to screen readers, and Tab leaves the canvas after the last shape.
All keys are listed under Help.

## Security

Diagrams loaded from share links, imported or dropped JSON files and browser storage are treated as
untrusted. `normalizeDiagram()` in `js/storage.js` validates every item before it reaches the
editor: unknown modes fall back to `unicode`, coordinates are clamped to ±1000 cells and shape
sizes to 500, list lengths, waypoints and strings are capped, and values of unexpected types are
dropped. Valid diagrams pass through unchanged, so existing share links keep working. See
[SECURITY.md](SECURITY.md) to report a vulnerability.

### 1. Internal Diagram Representation

Diagrams are stored as clean JSON data structures that describe objects semantically rather than as pre-baked text strings:

```json
{
  "version": 1,
  "name": "Authentication Flow",
  "mode": "unicode",
  "shapes": [
    {
      "id": "shape_1",
      "type": "rounded-rectangle",
      "x": 4,
      "y": 3,
      "w": 16,
      "h": 5,
      "text": "Start\nLogin Request",
      "textAlign": "center"
    }
  ],
  "connectors": [
    {
      "id": "conn_1",
      "type": "connector",
      "fromShapeId": "shape_1",
      "fromAnchor": "right",
      "toShapeId": "shape_2",
      "toAnchor": "left",
      "arrowEnd": "end",
      "label": "HTTPS"
    }
  ],
  "texts": [],
  "notes": []
}
```

### 2. The ASCII Rendering Algorithm (`renderer.js`)

The rendering engine operates on a 2D discrete character grid:

1. **Bounding Box Calculation**:
   Calculates the minimum and maximum column and row bounds across all shapes, notes, connectors, and labels, adding configurable margins.
2. **Matrix Allocation**:
   Creates an `AsciiGrid` instance with dimensions `[height][width]`. Each cell contains a character (`char`), a collision type (`'space'`, `'border'`, `'line'`, `'junction'`, `'arrow'`, `'text'`), and an `ownerId`.
3. **Pass 1 — Shape Interior & Borders**:
   - Shapes clear their interior bounding boxes with spaces to prevent background bleed.
   - Borders are rasterized using coordinate math for rectangles, single-step diagonal calculations for diamonds and hexagons, and rounded corners for circles and rounded boxes.
4. **Pass 2 — Orthogonal Connector Routing**:
   - Computes Manhattan waypoints `[p0, p1, ..., pn]` between source and target anchors.
   - Draws horizontal segments (`─` or `-`) and vertical segments (`│` or `|`).
   - Places corner turns (`┌`, `┐`, `└`, `┘` or `+`).
   - Resolves intersections: when a horizontal connector crosses a vertical connector, it creates a junction (`┼` or `+`).
   - Resolves border junctions: when a connector leaves a rectangle border, it renders appropriate T-junctions (`├`, `┴`, `┤`, `┬`).
   - Places directional arrowheads (`►`, `◄`, `▼`, `▲` or `>`, `<`, `v`, `^`) pointing cleanly at the target border.
5. **Pass 3 — Text Placement**:
   - Centers or aligns multiline text strings within shapes.
   - Text cells have priority: connectors and lines will never overwrite text characters.
6. **String Export & Trimming**:
   - Rows are mapped to strings.
   - Trailing whitespace is stripped from each line so clipboard payloads remain minimal.

### 3. Visual Canvas & Monospace Geometry (`canvas.js`)

- Operates on a monospace character cell coordinate system (`cellWidth: 10px`, `cellHeight: 18px`).
- Mouse screen coordinates are mapped to grid cells via:
  ```javascript
  col = Math.floor((screenX - panX) / (cellWidth * zoom));
  row = Math.floor((screenY - panY) / (cellHeight * zoom));
  ```
- HiDPI (Retina) canvas scaling with smooth hardware-accelerated drawing.
- 8-point interactive resize handles (NW, N, NE, E, SE, S, SW, W).
- Glowing anchor points on shape borders for visual connector creation.
- Floating in-place `<textarea>` overlay on double-click with identical monospace font and line-height.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl / Cmd + Z` | Undo |
| `Ctrl / Cmd + Shift + Z` (or `Ctrl + Y`) | Redo |
| `Ctrl / Cmd + C` | Copy ASCII diagram / selected object |
| `Ctrl / Cmd + D` | Duplicate selected shapes |
| `Ctrl / Cmd + A` | Select all shapes and connectors |
| `Delete` / `Backspace` | Delete selected shapes and connectors |
| `Arrow Keys` | Nudge selected shape(s) by 1 character cell |
| `Shift + Arrow Keys` | Nudge selected shape(s) by 5 character cells |
| `Space + Drag` (or Middle Click) | Pan canvas |
| Pinch / two-finger drag | Zoom / pan on touch screens |
| Double-tap | Edit shape text on touch screens |
| `Ctrl / Cmd + Mouse Wheel` | Zoom in / out relative to cursor |
| `Double Click` / `Enter` / `F2` | Edit shape text in-place (finish with `Ctrl + Enter`) |
| `Tab` / `Shift + Tab` (canvas focused) | Select the next / previous shape |
| Shape key, then `Enter` / `Shift + Enter` | Add that shape right of / below the selected one, connected to it |
| `K`, `Tab` to a target, `Enter` | Connect the selected shape to another |
| `Escape` | Cancel current tool / Deselect |
| `V` | Select tool |
| `H` | Hand / Pan tool |
| `R` | Rectangle tool |
| `U` | Rounded Rectangle tool |
| `D` | Diamond (Decision) tool |
| `P` | Parallelogram (I/O) tool |
| `X` | Hexagon (Preparation) tool |
| `C` | Circle / Ellipse tool |
| `K` / `W` | Connector tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `T` | Text Label tool |
| `N` | Note Box tool |

---

## Example Diagrams

AsciiFlow includes three built-in templates accessible directly from the **Templates** header dropdown:

1. **Authentication Flow**:
   User login request $\rightarrow$ input credentials $\rightarrow$ decision diamond $\rightarrow$ success token / failure retry.
2. **System Architecture**:
   Web/mobile client $\rightarrow$ API gateway $\rightarrow$ microservices (Auth, Orders) $\rightarrow$ PostgreSQL/Redis cluster with security notes.
3. **Decision Tree**:
   Urgency vs importance matrix with actionable routing.

---

## License

MIT License. Free to use for personal and commercial documentation, projects, and diagrams.
