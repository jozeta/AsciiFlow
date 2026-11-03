/**
 * AsciiFlow - Parser Module
 * Bidirectional conversion:
 * 1. Plain-text ASCII / Unicode diagrams -> structured diagram models
 * 2. Mermaid flowchart syntax -> structured diagram models with auto-layout
 */

(function (global) {
  'use strict';

  // ------------------------------------------------------------------
  // Character classes shared by the ASCII importer
  // ------------------------------------------------------------------

  // Directions a line glyph connects to, as a bitmask
  const L = 1, R = 2, U = 4, D = 8;
  const STEP = { [L]: [-1, 0], [R]: [1, 0], [U]: [0, -1], [D]: [0, 1] };
  const OPPOSITE = { [L]: R, [R]: L, [U]: D, [D]: U };
  const ALL_DIRS = [L, R, U, D];

  // Where a connector meets a box, the renderer replaces that border cell
  // with a junction: '+' in ascii mode, a T-piece like '├' or '┴' in unicode
  // mode. Junctions are valid on any side, so a box with connectors attached
  // is still recognised.
  const BORDER_JUNCTIONS = [
    '+', '┼', '├', '┤', '┬', '┴',
    '╬', '╠', '╣', '╦', '╩', '╪', '╫', '╞', '╡', '╥', '╨', '╤', '╧', '╟', '╢'
  ];
  const DASHED_BORDER = ['┄', '┆', '╌', '╎', '┈', '┊'];

  function isHBorder(char) {
    return ['-', '─', '═', '~', '┄', '╌', '┈'].includes(char) || BORDER_JUNCTIONS.includes(char);
  }

  function isVBorder(char) {
    return ['|', '│', '║', '┆', '┊', '╎'].includes(char) || BORDER_JUNCTIONS.includes(char);
  }

  // Corner families: a box's four corners come from the same family, so an
  // ascii '.' box closes on ' or ` (not on a '+' rim inside it)
  const CORNER_FAMILY = {
    '+': 'plus', '.': 'ascii-round', '\'': 'ascii-round', '`': 'ascii-round',
    '┌': 'square', '┐': 'square', '└': 'square', '┘': 'square',
    '╭': 'round', '╮': 'round', '╰': 'round', '╯': 'round',
    '╔': 'double', '╗': 'double', '╚': 'double', '╝': 'double'
  };

  function isCorner(char, type) {
    if (type === 'tl') return ['+', '┌', '╭', '.', '╔'].includes(char);
    if (type === 'tr') return ['+', '┐', '╮', '.', '╗'].includes(char);
    if (type === 'bl') return ['+', '└', '╰', '\'', '`', '╚'].includes(char);
    if (type === 'br') return ['+', '┘', '╯', '\'', '`', '╝'].includes(char);
    return false;
  }

  // Connector glyphs and the directions they connect to
  const LINE_GLYPHS = {
    '-': L | R, '─': L | R, '╌': L | R, '┈': L | R, '═': L | R, '=': L | R,
    '|': U | D, '│': U | D, '╎': U | D, '┊': U | D, '║': U | D,
    '┌': R | D, '╭': R | D, '┐': L | D, '╮': L | D,
    '└': R | U, '╰': R | U, '┘': L | U, '╯': L | U,
    '├': U | D | R, '┤': U | D | L, '┬': L | R | D, '┴': L | R | U,
    '┼': L | R | U | D, '╬': L | R | U | D, '+': L | R | U | D
  };

  // Arrowheads: the direction the line comes from, and the terminal style
  const ARROW_GLYPHS = {
    '►': [L, 'triangle'], '>': [L, 'triangle'], '▷': [L, 'open'],
    '◄': [R, 'triangle'], '<': [R, 'triangle'], '◁': [R, 'open'],
    '▼': [U, 'triangle'], 'v': [U, 'triangle'], '▽': [U, 'open'],
    '▲': [D, 'triangle'], '^': [D, 'triangle'], '△': [D, 'open']
  };

  function emptyDiagram(name) {
    return { version: 1, name, mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] };
  }

  // ==========================================
  // 1. ASCII / Unicode -> Diagram Model Parser
  // ==========================================

  function parseAsciiToDiagram(text) {
    if (!text || typeof text !== 'string') return emptyDiagram('Imported ASCII');

    const lines = text.split(/\r?\n/);
    const W = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const H = lines.length;
    if (W === 0) return emptyDiagram('Imported ASCII');
    const grid = lines.map(line => line.padEnd(W, ' ').split(''));

    const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] : ' ');
    // visited: cell belongs to a shape or has been consumed as a label/text
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    // owner: shape whose outline runs through the cell (for connector attachment)
    const owner = Array.from({ length: H }, () => Array(W).fill(null));

    const shapes = [];
    const notes = [];
    const connectors = [];
    const texts = [];
    let shapeCount = 0;

    function newShape(props) {
      shapeCount++;
      return { id: `shape_${shapeCount}`, ...props, textAlign: 'center' };
    }

    function markBox(x0, y0, x1, y1, shape, interiorToo) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const onEdge = y === y0 || y === y1 || x === x0 || x === x1;
          if (onEdge) owner[y][x] = shape;
          if (onEdge || interiorToo) visited[y][x] = true;
        }
      }
    }

    function cleanLines(rows) {
      const out = rows.map(r => r.trim());
      while (out.length && out[0] === '') out.shift();
      while (out.length && out[out.length - 1] === '') out.pop();
      return out.join('\n');
    }

    // Check a guessed shape against the input by asking the renderer to draw
    // that shape type at that position, so import always matches how shapes
    // are actually drawn. Returns the outline cells and per-row text, or null.
    const verifyRenderers = {};
    function verifyShape(type, x, y, w, h) {
      // The box may reach past the end of a line (trailing spaces are
      // trimmed), so cells outside the text count as blank
      if (!global.AsciiRenderer || w < 3 || h < 2 || x < -2 || y < 0 || x + w > W + 2 || y + h > H) return null;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) if (visited[yy]?.[xx]) return null;
      }
      for (const mode of ['unicode', 'ascii', 'unicode-curved']) {
        if (!verifyRenderers[mode]) {
          verifyRenderers[mode] = new global.AsciiRenderer();
          verifyRenderers[mode].setMode(mode);
        }
        const g = verifyRenderers[mode].renderToGrid(
          { shapes: [{ id: 'probe', type, x, y, w, h, text: '' }], connectors: [], texts: [], notes: [] },
          { minCol: x, minRow: y, maxCol: x + w - 1, maxRow: y + h - 1 }
        );
        const outline = [];
        let match = 0;
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            if (g.getType(xx, yy) !== 'border') continue;
            outline.push([xx, yy]);
            const want = g.get(xx, yy);
            const got = at(xx, yy);
            // A connector attached to the outline turns it into a junction
            if (got === want || (BORDER_JUNCTIONS.includes(got) && (isHBorder(want) || isVBorder(want)))) match++;
          }
        }
        if (outline.length < 4 || match / outline.length < 0.85) continue;

        // Text: everything inside the outline, plus letters that overwrote it
        const inOutline = new Set(outline.map(([a, b]) => `${a},${b}`));
        const rows = [];
        for (let yy = y; yy < y + h; yy++) {
          let row = '';
          for (let xx = x; xx < x + w; xx++) {
            const ch = at(xx, yy);
            const isOutline = inOutline.has(`${xx},${yy}`);
            row += !isOutline || (/[A-Za-z0-9]/.test(ch) && ch !== g.get(xx, yy)) ? ch : ' ';
          }
          rows.push(row);
        }
        return { outline, text: cleanLines(rows) };
      }
      return null;
    }

    function addVerifiedShape(type, x, y, w, h, result) {
      const shape = newShape({ type, x, y, w, h, text: result.text });
      shapes.push(shape);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) visited[yy][xx] = true;
      }
      for (const [ox, oy] of result.outline) if (ox >= 0 && ox < W) owner[oy][ox] = shape;
      return shape;
    }

    // --- Rectangles, rounded boxes, containers and notes ---------------
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = grid[r][c];
        if (!isCorner(ch, 'tl') || visited[r][c]) continue;

        let found = false;
        for (let cEnd = c + 3; cEnd < W && !found; cEnd++) {
          if (!isCorner(grid[r][cEnd], 'tr') || CORNER_FAMILY[grid[r][cEnd]] !== CORNER_FAMILY[ch]) continue;

          // Top border, allowing a container title like "┌┄[ VPC ]┄┄┐"
          let title = null;
          let topOk = true;
          for (let k = c + 1; k < cEnd; k++) {
            if (grid[r][k] === '[' && title === null) {
              const close = grid[r].indexOf(']', k + 1);
              if (close > k && close < cEnd) {
                title = grid[r].slice(k + 1, close).join('').trim();
                k = close;
                continue;
              }
            }
            if (!isHBorder(grid[r][k])) { topOk = false; break; }
          }
          if (!topOk) continue;

          for (let rEnd = r + 2; rEnd < H; rEnd++) {
            if (!isCorner(grid[rEnd][c], 'bl') || !isCorner(grid[rEnd][cEnd], 'br')) continue;
            if (CORNER_FAMILY[grid[rEnd][c]] !== CORNER_FAMILY[ch] || CORNER_FAMILY[grid[rEnd][cEnd]] !== CORNER_FAMILY[ch]) continue;
            let ok = true;
            for (let k = c + 1; k < cEnd && ok; k++) ok = isHBorder(grid[rEnd][k]);
            for (let k = r + 1; k < rEnd && ok; k++) ok = isVBorder(grid[k][c]) && isVBorder(grid[k][cEnd]);
            if (!ok) continue;

            // In ascii a queue's slot dividers are '+' too, so the first '+'
            // along the top may be a divider: prefer a wider box that
            // verifies as a queue
            if (ch === '+' && isHBorder(at(cEnd + 1, r))) {
              let widest = cEnd;
              for (let wide = cEnd + 2; wide < W && isHBorder(grid[r][wide]); wide++) {
                if (grid[r][wide] === '+' && verifyShape('queue', c, r, wide - c + 1, rEnd - r + 1)) widest = wide;
              }
              cEnd = widest;
            }

            const w = cEnd - c + 1;
            const h = rEnd - r + 1;
            const dashed = DASHED_BORDER.includes(grid[r][c + 1]) || DASHED_BORDER.includes(grid[r + 1][c]);
            const isContainer = title !== null || dashed;

            // Note: folded bottom-right corner, drawn as a ┴ in the bottom
            // border and a ┤ in the right border joined by an inner corner.
            // (Connectors leaving a box use ┬ and ├ there instead.)
            let fold = null;
            if (!isContainer) {
              for (let fx = cEnd - 2; fx > c && fx >= cEnd - 6 && !fold; fx--) {
                if (!['┴', '+'].includes(grid[rEnd][fx])) continue;
                for (let fy = rEnd - 1; fy > r && fy >= rEnd - 3; fy--) {
                  if (!['┤', '+'].includes(grid[fy][cEnd])) continue;
                  let stem = true;
                  for (let k = fy + 1; k < rEnd && stem; k++) stem = isVBorder(grid[k][fx]);
                  let lid = true;
                  for (let k = fx + 1; k < cEnd && lid; k++) lid = isHBorder(grid[fy][k]);
                  if (stem && lid) { fold = { fx, fy }; break; }
                }
              }
            }

            // Interior text (fold strokes blanked out first)
            const rows = [];
            for (let y = r + 1; y < rEnd; y++) {
              const row = grid[y].slice(c + 1, cEnd);
              if (fold && y >= fold.fy) {
                for (let x = fold.fx; x < cEnd; x++) {
                  const i = x - c - 1;
                  const isFoldStroke = y === fold.fy
                    ? (isHBorder(row[i]) || ['┌', '╭'].includes(row[i]))
                    : (x === fold.fx && isVBorder(row[i]));
                  if (isFoldStroke) row[i] = ' ';
                }
              }
              rows.push(row.join(''));
            }

            let shape;
            if (isContainer) {
              shape = newShape({ type: 'container', x: c, y: r, w, h, text: title || '' });
              shape.textAlign = 'left';
              shapes.push(shape);
              markBox(c, r, cEnd, rEnd, shape, false); // nested shapes stay importable
            } else if (!fold && (shape = ['database', 'queue']
              .map(type => ({ type, result: verifyShape(type, c, r, w, h) }))
              .find(v => v.result))) {
              // A box with a rim (database) or slot dividers (queue)
              addVerifiedShape(shape.type, c, r, w, h, shape.result);
            } else {
              const rounded = ['╭', '.'].includes(ch);
              const double = ['╔', '═'].includes(ch);
              shape = newShape({
                type: fold ? 'note' : (rounded ? 'rounded-rectangle' : 'rectangle'),
                x: c, y: r, w, h,
                text: cleanLines(rows),
                style: double ? 'double' : 'default'
              });
              (fold ? notes : shapes).push(shape);
              markBox(c, r, cEnd, rEnd, shape, true);
            }
            found = true;
            break;
          }
        }
      }
    }

    // --- Circles: a rounded top and bottom with the sides one column
    // further out than the corners --------------------------------------
    for (let r = 0; r < H; r++) {
      for (let c = 1; c < W; c++) {
        if (!['╭', '.'].includes(grid[r][c]) || visited[r][c]) continue;
        const closeTop = grid[r][c] === '╭' ? '╮' : '.';
        let cEnd = c + 1;
        while (cEnd < W && ['─', '-'].includes(grid[r][cEnd])) cEnd++;
        if (cEnd - c < 3 || grid[r][cEnd] !== closeTop) continue;

        let rEnd = r + 1;
        while (rEnd < H && isVBorder(at(c - 1, rEnd)) && isVBorder(at(cEnd + 1, rEnd))) rEnd++;
        if (rEnd === r + 1 || rEnd >= H) continue;
        const openBottom = closeTop === '╮' ? '╰' : '\'';
        const closeBottom = closeTop === '╮' ? '╯' : '\'';
        if (grid[rEnd][c] !== openBottom || grid[rEnd][cEnd] !== closeBottom) continue;
        let bottomOk = true;
        for (let k = c + 1; k < cEnd && bottomOk; k++) bottomOk = ['─', '-'].includes(grid[rEnd][k]);
        if (!bottomOk) continue;

        const x = c - 1;
        const rows = [];
        for (let y = r + 1; y < rEnd; y++) rows.push(grid[y].slice(c, cEnd + 1).join(''));
        const shape = newShape({ type: 'circle', x, y: r, w: cEnd - c + 3, h: rEnd - r + 1, text: cleanLines(rows) });
        shapes.push(shape);
        markBox(x, r, cEnd + 1, rEnd, shape, true);
        for (const k of [c, cEnd]) { owner[r][k] = shape; owner[rEnd][k] = shape; }
      }
    }

    // --- Diamonds:  ^ / \ < > \ / v  -----------------------------------
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (grid[r][c] !== '^' || visited[r][c]) continue;

        for (let rEnd = r + 2; rEnd < H && rEnd <= r + 40; rEnd++) {
          if (grid[rEnd][c] !== 'v' || visited[rEnd][c]) continue;
          const cy = r + Math.floor((rEnd - r) / 2);
          if (LINE_GLYPHS[grid[cy][c]]) break; // a vertical line, not a diamond

          const left = grid[cy].lastIndexOf('<', c - 1);
          const right = grid[cy].indexOf('>', c + 1);
          if (left < 0 || right < 0) break;
          const x = left;
          const w = right - left + 1;
          if (Math.abs(x + Math.floor((w - 1) / 2) - c) > 1) break;

          // Slopes must be there when the diamond is tall enough to have them
          if (cy - r >= 2) {
            const upper = grid[r + 1].slice(x, c).join('');
            const lower = grid[rEnd - 1].slice(x, c).join('');
            if (!upper.includes('/') || !lower.includes('\\')) break;
          }

          const h = rEnd - r + 1;
          const rows = [];
          for (let y = r + 1; y < rEnd; y++) {
            rows.push(grid[y].slice(x, right + 1).join('').replace(/^[\s/\\<]+|[\s/\\>]+$/g, ''));
          }
          const shape = newShape({ type: 'diamond', x, y: r, w, h, text: cleanLines(rows) });
          shapes.push(shape);
          markBox(x, r, right, rEnd, shape, true);
          for (let y = r; y <= rEnd; y++) {
            for (let k = x; k <= right; k++) {
              if (['^', 'v', '<', '>', '/', '\\'].includes(grid[y][k])) owner[y][k] = shape;
            }
          }
          break;
        }
      }
    }

    // --- Parallelograms:  /‾‾‾‾/  slanting right -----------------------
    const isRun = (y, x0, x1) => {
      if (x1 - x0 < 3 || at(x0, y) !== '/' || at(x1, y) !== '/') return false;
      for (let k = x0 + 1; k < x1; k++) if (!['-', '─', '═'].includes(at(k, y))) return false;
      return true;
    };
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (grid[r][c] !== '/' || visited[r][c]) continue;
        const topRight = grid[r].indexOf('/', c + 1);
        if (topRight < 0 || !isRun(r, c, topRight)) continue;
        const run = topRight - c;

        for (let rEnd = r + 2; rEnd < H && rEnd <= r + 30; rEnd++) {
          let x = -1;
          for (let k = c - 1; k >= 0 && k >= c - 8; k--) {
            if (isRun(rEnd, k, k + run)) { x = k; break; }
          }
          if (x < 0) continue;

          const slant = c - x;
          const w = topRight - x + 1;
          const h = rEnd - r + 1;
          const shape = newShape({ type: 'parallelogram', x, y: r, w, h, text: '' });
          const rows = [];
          for (let y = r; y <= rEnd; y++) {
            const shift = Math.round(slant * (rEnd - y) / (h - 1));
            const lc = x + shift;
            const rc = x + w - 1 - slant + shift;
            owner[y][lc] = shape;
            owner[y][rc] = shape;
            // Text wider than the shape may overwrite or overhang a side
            let s = lc;
            let e = rc;
            if (y > r && y < rEnd) {
              while (s - 1 >= 0 && !visited[y][s - 1] && /[^\s\-─│|►◄▼▲<>]/.test(at(s - 1, y)) && at(s - 1, y) !== '/') s--;
              while (e + 1 < W && !visited[y][e + 1] && /[^\s\-─│|►◄▼▲<>]/.test(at(e + 1, y)) && at(e + 1, y) !== '/') e++;
              let row = grid[y].slice(s, e + 1);
              if (row[lc - s] === '/') row[lc - s] = ' ';
              if (row[rc - s] === '/') row[rc - s] = ' ';
              rows.push(row.join(''));
            } else {
              for (let k = lc; k <= rc; k++) owner[y][k] = shape;
            }
            for (let k = s; k <= e; k++) visited[y][k] = true;
          }
          shape.text = cleanLines(rows);
          shapes.push(shape);
          break;
        }
      }
    }

    // --- Hexagons: < … > with flat top and bottom runs -------------------
    for (let cy = 0; cy < H; cy++) {
      for (let x = 0; x < W; x++) {
        if (grid[cy][x] !== '<' || visited[cy][x]) continue;
        const xr = grid[cy].indexOf('>', x + 2);
        if (xr < 0) continue;
        let found = false;
        for (let y = cy - 1; y >= 0 && y >= cy - 8 && !found; y--) {
          for (const h of [2 * (cy - y) + 1, 2 * (cy - y) + 2]) {
            const result = verifyShape('hexagon', x, y, xr - x + 1, h);
            if (result) { addVerifiedShape('hexagon', x, y, xr - x + 1, h, result); found = true; break; }
          }
        }
      }
    }

    // --- Triangles: ^ apex over a flat base -------------------------------
    for (let y = 0; y < H; y++) {
      for (let c = 0; c < W; c++) {
        if (grid[y][c] !== '^' || visited[y][c]) continue;
        for (let yb = y + 2; yb < H && yb <= y + 30; yb++) {
          if (!isHBorder(grid[yb][c])) continue;
          let x = c, e = c;
          while (x - 1 >= 0 && isHBorder(grid[yb][x - 1])) x--;
          while (e + 1 < W && isHBorder(grid[yb][e + 1])) e++;
          const result = verifyShape('triangle', x, y, e - x + 1, yb - y + 1);
          if (result) { addVerifiedShape('triangle', x, y, e - x + 1, yb - y + 1, result); break; }
        }
      }
    }

    // --- Clouds: ( … ) sides under scalloped tops ------------------------
    for (let my = 1; my < H; my++) {
      for (let x = 0; x < W; x++) {
        if (grid[my][x] !== '(' || visited[my][x]) continue;
        const xr = grid[my].indexOf(')', x + 3);
        if (xr < 0) continue;
        let found = false;
        for (let y = my - 1; y >= 0 && y >= my - 3 && !found; y--) {
          for (let yb = my + 1; yb < H && yb <= my + 12 && !found; yb++) {
            // The sides sit on the bounding box, or one column inside it
            for (const inset of [0, 1]) {
              const cx = x - inset;
              const cw = xr - x + 1 + 2 * inset;
              const result = verifyShape('cloud', cx, y, cw, yb - y + 1);
              if (result) { addVerifiedShape('cloud', cx, y, cw, yb - y + 1, result); found = true; break; }
            }
          }
        }
      }
    }

    // --- Connectors -----------------------------------------------------
    const isLineCell = (x, y) => !visited[y]?.[x] && (LINE_GLYPHS[at(x, y)] !== undefined || ARROW_GLYPHS[at(x, y)] !== undefined);
    const glyphDirs = (x, y) => {
      const ch = at(x, y);
      if (LINE_GLYPHS[ch] !== undefined) return LINE_GLYPHS[ch];
      if (ARROW_GLYPHS[ch]) return ARROW_GLYPHS[ch][0];
      return 0;
    };
    // A link needs both cells to point at each other
    const linked = (x, y, d) => {
      if (!(glyphDirs(x, y) & d)) return false;
      const [dx, dy] = STEP[d];
      return isLineCell(x + dx, y + dy) && (glyphDirs(x + dx, y + dy) & OPPOSITE[d]) !== 0;
    };
    const linksOf = (x, y) => ALL_DIRS.filter(d => linked(x, y, d));

    const usedEdges = new Set();
    const edgeKey = (x, y, d) => {
      const [dx, dy] = STEP[d];
      const a = `${x},${y}`, b = `${x + dx},${y + dy}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    const lineCellsUsed = new Set();

    const isTexty = (ch) => ch !== ' ' && !LINE_GLYPHS[ch] && !ARROW_GLYPHS[ch];

    // A label drawn on top of a line (" Yes " on a horizontal run, "No" on a
    // vertical one). Returns the label and what comes after it, or null.
    function bridgeLabel(x, y, d) {
      const [dx, dy] = STEP[d];
      let nx = x + dx, ny = y + dy;
      if (dy === 0) {
        if (at(nx, ny) === ' ') nx += dx;
        if (!isTexty(at(nx, ny)) || visited[ny]?.[nx]) return null;
        const cells = [];
        while (nx >= 0 && nx < W && (isTexty(at(nx, ny)) || (at(nx, ny) === ' ' && isTexty(at(nx + dx, ny)))) && !visited[ny][nx]) {
          cells.push(nx);
          nx += dx;
        }
        if (at(nx, ny) === ' ') nx += dx;
        if (cells.length > 40) return null;
        const after = isLineCell(nx, ny) && (glyphDirs(nx, ny) & OPPOSITE[d]) ? { x: nx, y: ny } : null;
        const shape = owner[ny]?.[nx] || null;
        if (!after && !shape) return null;
        const xs = cells.slice().sort((a, b) => a - b);
        const label = grid[ny].slice(xs[0], xs[xs.length - 1] + 1).join('').trim();
        return { label, cells: xs.map(cx => [cx, ny]), after, shape };
      }
      // Vertical: one row of text crossing the line
      if (!isTexty(at(nx, ny)) || visited[ny]?.[nx]) return null;
      let s = nx, e = nx;
      while (isTexty(at(s - 1, ny)) && !visited[ny][s - 1]) s--;
      while (isTexty(at(e + 1, ny)) && !visited[ny][e + 1]) e++;
      const ax = nx, ay = ny + dy;
      const after = isLineCell(ax, ay) && (glyphDirs(ax, ay) & OPPOSITE[d]) ? { x: ax, y: ay } : null;
      const shape = owner[ay]?.[ax] || null;
      if (!after && !shape) return null;
      const cells = [];
      for (let k = s; k <= e; k++) cells.push([k, ny]);
      return { label: grid[ny].slice(s, e + 1).join('').trim(), cells, after, shape };
    }

    // The shape an open line end touches (allowing one blank cell)
    function shapeBeyond(x, y, d) {
      const [dx, dy] = STEP[d];
      const first = owner[y + dy]?.[x + dx];
      if (first) return first;
      if (at(x + dx, y + dy) === ' ' && owner[y + 2 * dy]?.[x + 2 * dx]) return owner[y + 2 * dy][x + 2 * dx];
      // Anchors of sloped shapes (triangles) sit on the bounding box, which
      // can be blank space beside the outline
      const nx = x + dx, ny = y + dy;
      return [...shapes, ...notes].find(s => s.type !== 'container' &&
        nx >= s.x && nx < s.x + s.w && ny >= s.y && ny < s.y + s.h) || null;
    }

    const ANCHOR_FOR_ENTRY = { [R]: 'left', [L]: 'right', [D]: 'top', [U]: 'bottom' };

    function trace(sx, sy, firstDir) {
      const cells = [[sx, sy]];
      const corners = [];
      const labels = [];
      let x = sx, y = sy, d = firstDir;
      let endShape = null;
      lineCellsUsed.add(`${x},${y}`);

      for (let guard = 0; guard < W * H; guard++) {
        if (linked(x, y, d) && !usedEdges.has(edgeKey(x, y, d))) {
          usedEdges.add(edgeKey(x, y, d));
          const [dx, dy] = STEP[d];
          x += dx; y += dy;
        } else {
          const bridge = !linked(x, y, d) ? bridgeLabel(x, y, d) : null;
          if (!bridge) break;
          labels.push(bridge.label);
          for (const [bx, by] of bridge.cells) visited[by][bx] = true;
          if (!bridge.after) { endShape = bridge.shape; break; }
          x = bridge.after.x; y = bridge.after.y;
        }
        cells.push([x, y]);
        lineCellsUsed.add(`${x},${y}`);

        // Stop at T-junctions (pieces are joined up afterwards), go straight
        // through crossings, turn at corners.
        const links = linksOf(x, y);
        if (links.length === 3) break;
        const options = links.filter(o => o !== OPPOSITE[d]);
        if (options.includes(d)) continue;
        if (options.length === 1) { d = options[0]; corners.push({ x, y }); continue; }
        if (options.length === 0 && !ARROW_GLYPHS[at(x, y)]) {
          // Nothing linked onwards, but the line may carry on through a label
          // just past a corner: turn towards the one direction that bridges
          // a label (an ascii '+' connects every way, so test each)
          const onward = ALL_DIRS.filter(o => o !== OPPOSITE[d] && (glyphDirs(x, y) & o) && bridgeLabel(x, y, o));
          if (onward.length === 1 && onward[0] !== d) { d = onward[0]; corners.push({ x, y }); }
          continue;
        }
        break;
      }

      return { cells, corners, labels, startOpen: OPPOSITE[firstDir], endOpen: d, endShape };
    }

    // A traced piece of line between two ends. An end is a shape it touches,
    // a T-junction where it meets other pieces, or a free point.
    function makePiece(path) {
      const endOf = (cell, open, forcedShape) => {
        const [x, y] = cell;
        const arrow = ARROW_GLYPHS[at(x, y)];
        // A corner at a line's end bends into the shape it touches (e.g. a
        // ┘ right under a diamond's tip): look along its other arm too
        if (!forcedShape && !arrow && !shapeBeyond(x, y, open)) {
          const into = OPPOSITE[open];
          const other = ALL_DIRS.find(o => o !== into && o !== open && (glyphDirs(x, y) & o) &&
            !linked(x, y, o) && shapeBeyond(x, y, o));
          if (other !== undefined) open = other;
        }
        const [dx, dy] = STEP[open];
        return {
          point: { x, y },
          // The renderer marks where a connector leaves a box with a
          // junction in its border: a hint for which end is the source
          atBorderJunction: BORDER_JUNCTIONS.includes(at(x + dx, y + dy)) && !!owner[y + dy]?.[x + dx],
          shape: forcedShape || shapeBeyond(x, y, open),
          anchor: ANCHOR_FOR_ENTRY[open],
          arrow: arrow && (arrow[0] & OPPOSITE[open]) ? arrow[1] : 'none',
          junction: linksOf(x, y).length === 3
        };
      };
      return {
        ends: [
          endOf(path.cells[0], path.startOpen, null),
          endOf(path.cells[path.cells.length - 1], path.endOpen, path.endShape)
        ],
        corners: path.corners,
        cells: path.cells,
        labels: path.labels.filter(Boolean)
      };
    }

    // Join pieces that meet at a T-junction: pieces whose far end carries an
    // arrowhead are targets, the others sources, and every source-target
    // pair becomes one connector (a fan-out or fan-in).
    function joinAtJunctions(pieces) {
      for (let round = 0; round < 20; round++) {
        const byJunction = new Map();
        pieces.forEach((piece, i) => piece.ends.forEach((end, e) => {
          if (!end.junction) return;
          const key = `${end.point.x},${end.point.y}`;
          if (!byJunction.has(key)) byJunction.set(key, []);
          byJunction.get(key).push({ piece, i, e });
        }));

        let joined = false;
        for (const entries of byJunction.values()) {
          const far = (en) => en.piece.ends[1 - en.e];
          const targets = entries.filter(en => far(en).arrow !== 'none');
          const sources = entries.filter(en => far(en).arrow === 'none');
          if (!targets.length || !sources.length) continue;

          const created = [];
          for (const s of sources) {
            for (const t of targets) {
              // Corners ordered source end -> junction -> target end
              const sCorners = s.e === 1 ? s.piece.corners : s.piece.corners.slice().reverse();
              const tCorners = t.e === 0 ? t.piece.corners : t.piece.corners.slice().reverse();
              const j = far(s) === s.piece.ends[0] ? s.piece.ends[1].point : s.piece.ends[0].point;
              const sCells = s.e === 1 ? s.piece.cells : s.piece.cells.slice().reverse();
              const tCells = t.e === 0 ? t.piece.cells : t.piece.cells.slice().reverse();
              const before = sCells[sCells.length - 2];
              const after = tCells[1];
              const turns = before && after && (before[0] === j.x) !== (after[0] === j.x);
              const labels = sources.length === 1 && targets.length > 1
                ? (t.piece.labels.length ? t.piece.labels : s.piece.labels)
                : targets.length === 1 && sources.length > 1
                  ? (s.piece.labels.length ? s.piece.labels : t.piece.labels)
                  : [...s.piece.labels, ...t.piece.labels];
              created.push({
                ends: [far(s), far(t)],
                corners: [...sCorners, ...(turns ? [j] : []), ...tCorners],
                cells: [...sCells, ...tCells],
                labels
              });
            }
          }
          const used = new Set(entries.map(en => en.piece));
          pieces = pieces.filter(p => !used.has(p)).concat(created);
          joined = true;
          break;
        }
        if (!joined) break;
      }
      return pieces;
    }

    const connectorCells = new Map(); // connector -> traced cells

    function addConnector(piece) {
      let [from, to] = piece.ends;
      let corners = piece.corners;
      // Point the connector at its arrowhead; without arrowheads, start
      // from the end that leaves a box through a border junction
      const flip = (from.arrow !== 'none' && to.arrow === 'none') ||
        (from.arrow === 'none' && to.arrow === 'none' && to.atBorderJunction && !from.atBorderJunction);
      if (flip) {
        [from, to] = [to, from];
        corners = corners.slice().reverse();
      }
      if (piece.cells.length < 2 && !piece.labels.length) return;
      if (!from.shape && !to.shape && piece.cells.length < 3) return; // stray mark

      const conn = {
        id: `conn_${connectors.length + 1}`,
        type: 'connector',
        fromShapeId: from.shape ? from.shape.id : null,
        fromAnchor: from.shape ? from.anchor : 'auto',
        toShapeId: to.shape ? to.shape.id : null,
        toAnchor: to.shape ? to.anchor : 'auto',
        fromPoint: from.shape ? null : from.point,
        toPoint: to.shape ? null : to.point,
        // Both ends attached: let the router choose the path, as it did originally
        waypoints: from.shape && to.shape ? [] : corners.map(p => ({ x: p.x, y: p.y })),
        arrowStart: from.arrow,
        arrowEnd: to.arrow
      };
      const label = piece.labels.join(' ');
      if (label) conn.label = label;
      connectors.push(conn);
      connectorCells.set(conn, piece.cells);
    }

    // Start from line ends (degree 0 or 1), then pick up anything left over
    // (pieces between junctions, loops) from cells with unused links.
    let pieces = [];
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isLineCell(x, y)) continue;
          const links = linksOf(x, y);
          if (pass === 0) {
            if (links.length > 1 || lineCellsUsed.has(`${x},${y}`)) continue;
            // Not a real end if the line carries on through a label here
            // (e.g. a corner with a label just past it) and no shape is beside it
            if (links.length === 1) {
              const open = ALL_DIRS.filter(o => o !== links[0] && (glyphDirs(x, y) & o));
              if (open.some(o => bridgeLabel(x, y, o)) && !open.some(o => shapeBeyond(x, y, o))) continue;
            }
            let dir = links[0];
            if (dir === undefined) {
              // A lone stub: head away from the shape it touches, towards a label
              dir = ALL_DIRS.find(d => (glyphDirs(x, y) & d) && !shapeBeyond(x, y, d) && bridgeLabel(x, y, d));
              if (dir === undefined) continue;
            } else if (usedEdges.has(edgeKey(x, y, dir))) {
              continue;
            }
            pieces.push(makePiece(trace(x, y, dir)));
          } else {
            for (const d of links) {
              if (!usedEdges.has(edgeKey(x, y, d))) pieces.push(makePiece(trace(x, y, d)));
            }
          }
        }
      }
    }
    joinAtJunctions(pieces).forEach(addConnector);

    // A label placed beside its line (above/below a horizontal run, left or
    // right of a vertical one) belongs to the connector it touches
    function connectorBeside(x0, x1, y) {
      for (const conn of connectors) {
        if (conn.label) continue;
        for (const [cx, cy] of connectorCells.get(conn)) {
          const g = LINE_GLYPHS[at(cx, cy)];
          if (g === undefined) continue;
          const horizontal = (g & (L | R)) && !(g & (U | D));
          const vertical = (g & (U | D)) && !(g & (L | R));
          if (horizontal && Math.abs(cy - y) === 1 && cx >= x0 && cx <= x1) return conn;
          if (vertical && cy === y && (cx === x0 - 2 || cx === x0 - 1 || cx === x1 + 1 || cx === x1 + 2)) return conn;
        }
      }
      return null;
    }

    // --- Free text --------------------------------------------------------
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const free = (k) => !visited[y][k] && !lineCellsUsed.has(`${k},${y}`) && grid[y][k] !== ' ';
        if (!free(x)) { x++; continue; }
        let e = x;
        while (e + 1 < W && (free(e + 1) || (grid[y][e + 1] === ' ' && e + 2 < W && free(e + 2)))) e++;
        const words = grid[y].slice(x, e + 1).join('');
        const owner = /[A-Za-z0-9]/.test(words) ? connectorBeside(x, e, y) : null;
        if (owner) {
          owner.label = words.trim();
        } else if (/[A-Za-z0-9]/.test(words)) {
          texts.push({
            id: `text_${texts.length + 1}`,
            type: 'text',
            x, y, w: words.length, h: 1,
            text: words,
            textAlign: 'left'
          });
        }
        x = e + 1;
      }
    }

    return {
      version: 1,
      name: 'Imported ASCII Diagram',
      mode: /[─│┌┐└┘╭╮╰╯]/.test(text) ? 'unicode' : 'ascii',
      shapes,
      connectors,
      texts,
      notes
    };
  }

  // ==========================================
  // 2. Mermaid Flowchart <-> Diagram Model
  // ==========================================

  // Node shapes: Mermaid brackets -> AsciiFlow shape type. Longest openers
  // first so "((" is not read as "(".
  const MERMAID_SHAPES = [
    ['(((', ')))', 'circle'],
    ['([', '])', 'rounded-rectangle'],
    ['[[', ']]', 'queue'],
    ['[(', ')]', 'database'],
    ['((', '))', 'circle'],
    ['{{', '}}', 'hexagon'],
    ['[/', '\\]', 'triangle'],
    ['[\\', '/]', 'triangle'],
    ['[/', '/]', 'parallelogram'],
    ['[\\', '\\]', 'parallelogram'],
    ['>', ']', 'rectangle'],
    ['[', ']', 'rectangle'],
    ['(', ')', 'rounded-rectangle'],
    ['{', '}', 'diamond']
  ];

  // The bracket pair used when exporting each shape type
  const MERMAID_BRACKETS = {
    'rectangle': ['[', ']'],
    'rounded-rectangle': ['(', ')'],
    'circle': ['((', '))'],
    'diamond': ['{', '}'],
    'hexagon': ['{{', '}}'],
    'parallelogram': ['[/', '/]'],
    'triangle': ['[/', '\\]'],
    'database': ['[(', ')]'],
    'queue': ['[[', ']]'],
    'cloud': ['(', ')'],
    'note': ['[', ']']
  };

  // Edge operators: the link body between two nodes, e.g. --> -.-> ==> --o
  // <--> ---- and labelled forms -- text --> / -. text .-> / == text ==>
  const EDGE_RE = /^\s*(<|o|x)?(-{2,}|-\.+-|={2,})(>|o|x)?(?:\|([^|]*)\|)?/;
  const EDGE_TEXT_RE = /^\s*(<|o|x)?(--|-\.|==)\s+(.+?)\s+(-{2,}|\.+-|={2,})(>|o|x)?/;
  const ID_RE = /^\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)/;

  function cleanMermaidText(text) {
    let t = text.trim();
    if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') t = t.slice(1, -1);
    return t.replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').trim();
  }

  function parseMermaidToDiagram(mermaidText) {
    const empty = (name) => ({ version: 1, name, mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] });
    if (!mermaidText || typeof mermaidText !== 'string') return empty('Imported Mermaid');

    // Statements: one per line or separated by ';'; %% starts a comment
    // (a ';' inside quotes or ending an entity like #quot; does not split)
    const statements = [];
    for (const raw of mermaidText.split(/\r?\n/)) {
      const line = raw.replace(/%%.*$/, '');
      let current = '';
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        if (ch === ';' && !quoted && !/#[A-Za-z0-9]+$/.test(current)) {
          if (current.trim()) statements.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      if (current.trim()) statements.push(current.trim());
    }

    let direction = 'TB';
    const nodeMap = new Map(); // id -> { id, text, type, group }
    const order = [];
    const edges = [];
    const groups = []; // subgraphs: { id, title, parent, members: [] }
    const groupStack = [];

    const touch = (id) => {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, text: id, type: 'rectangle', group: groupStack.length ? groupStack[groupStack.length - 1] : null });
        order.push(id);
      }
      return nodeMap.get(id);
    };

    // Read one node reference at the start of s: id plus optional shape
    function readNode(s) {
      const m = s.match(ID_RE);
      if (!m) return null;
      const id = m[1];
      let rest = s.slice(m[0].length);
      const node = touch(id);
      // Of the shapes whose opener matches, the one that closes first wins
      // ([/a/] is a parallelogram even if a later node uses \]); quoted
      // text may contain brackets
      let pick = null;
      for (const [open, close, type] of MERMAID_SHAPES) {
        if (!rest.startsWith(open)) continue;
        let i = open.length;
        if (rest[i] === '"') {
          const q = rest.indexOf('"', i + 1);
          if (q < 0) continue;
          i = q + 1;
        }
        const end = rest.indexOf(close, i);
        if (end < 0) continue;
        if (!pick || end < pick.end || (end === pick.end && open.length > pick.open.length)) {
          pick = { open, close, type, end };
        }
      }
      if (pick) {
        node.text = cleanMermaidText(rest.slice(pick.open.length, pick.end)) || id;
        node.type = pick.type;
        rest = rest.slice(pick.end + pick.close.length);
      }
      rest = rest.replace(/^:::[A-Za-z0-9_-]+/, '');
      return { ids: [id], rest };
    }

    // A group of nodes joined with &
    function readNodes(s) {
      const first = readNode(s);
      if (!first) return null;
      const ids = [...first.ids];
      let rest = first.rest;
      for (;;) {
        const amp = rest.match(/^\s*&\s*/);
        if (!amp) break;
        const next = readNode(rest.slice(amp[0].length));
        if (!next) break;
        ids.push(...next.ids);
        rest = next.rest;
      }
      return { ids, rest };
    }

    function readEdge(s) {
      let m = s.match(EDGE_TEXT_RE);
      if (m) {
        return { start: m[1], body: m[2] + m[4], end: m[5], label: cleanMermaidText(m[3]), rest: s.slice(m[0].length) };
      }
      m = s.match(EDGE_RE);
      if (m) {
        return { start: m[1], body: m[2], end: m[3], label: m[4] ? cleanMermaidText(m[4]) : '', rest: s.slice(m[0].length) };
      }
      return null;
    }

    const TERMINAL = { '>': 'triangle', '<': 'triangle', 'o': 'dot', 'x': 'bar' };

    for (const st of statements) {
      let m;
      if ((m = st.match(/^(?:graph|flowchart)\b\s*(TB|TD|BT|LR|RL)?/i))) {
        direction = (m[1] || 'TB').toUpperCase();
        if (direction === 'TD') direction = 'TB';
        continue;
      }
      if ((m = st.match(/^subgraph\s+(.*)$/i))) {
        // subgraph id [Title] | subgraph "Title" | subgraph Title words
        const spec = m[1].trim();
        let id, title;
        const withTitle = spec.match(/^([A-Za-z0-9_.-]+)\s*\[(.*)\]$/);
        if (withTitle) { id = withTitle[1]; title = cleanMermaidText(withTitle[2]); }
        else if (/^[A-Za-z0-9_.-]+$/.test(spec)) { id = spec; title = spec; }
        else { title = cleanMermaidText(spec); id = `subgraph_${groups.length + 1}`; }
        groups.push({ id, title, parent: groupStack.length ? groupStack[groupStack.length - 1] : null });
        groupStack.push(id);
        continue;
      }
      if (/^end$/i.test(st)) { groupStack.pop(); continue; }
      if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/i.test(st)) continue;

      // node (edge node)*
      let left = readNodes(st);
      if (!left) continue;
      let rest = left.rest;
      for (;;) {
        const edge = readEdge(rest);
        if (!edge) break;
        const right = readNodes(edge.rest);
        if (!right) break;
        const style = edge.body.startsWith('=') ? 'double' : (edge.body.includes('.') ? 'dashed' : 'solid');
        for (const from of left.ids) {
          for (const to of right.ids) {
            edges.push({
              from, to, label: edge.label, style,
              arrowStart: TERMINAL[edge.start] || 'none',
              arrowEnd: TERMINAL[edge.end] || 'none'
            });
          }
        }
        left = right;
        rest = right.rest;
      }
    }

    // Edges may point at a subgraph: treat those as the container
    const groupIds = new Set(groups.map(g => g.id));
    for (const id of groupIds) {
      if (nodeMap.has(id) && !edges.some(e => e.from === id || e.to === id)) continue;
      if (nodeMap.has(id)) { nodeMap.delete(id); order.splice(order.indexOf(id), 1); }
    }

    const nodes = order.map(id => nodeMap.get(id));
    if (nodes.length === 0) return empty('Empty Mermaid');

    // --- Rank nodes (longest path from sources, cycles broken) -------------
    const ranks = new Map(nodes.map(n => [n.id, 0]));
    const nodeEdges = edges.filter(e => nodeMap.has(e.from) && nodeMap.has(e.to) && e.from !== e.to);
    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    nodeEdges.forEach(e => inDegree.set(e.to, inDegree.get(e.to) + 1));
    const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
    const done = new Set();
    for (;;) {
      while (queue.length) {
        const id = queue.shift();
        done.add(id);
        for (const e of nodeEdges) {
          if (e.from !== id || done.has(e.to)) continue;
          ranks.set(e.to, Math.max(ranks.get(e.to), ranks.get(id) + 1));
          inDegree.set(e.to, inDegree.get(e.to) - 1);
          if (inDegree.get(e.to) === 0) queue.push(e.to);
        }
      }
      // A cycle: start again from the first node not yet placed
      const next = nodes.find(n => !done.has(n.id));
      if (!next) break;
      inDegree.set(next.id, 0);
      queue.push(next.id);
    }

    // --- Size nodes --------------------------------------------------------
    for (const n of nodes) {
      const lines = String(n.text).split('\n');
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      let w = Math.max(14, Math.min(34, longest + 6));
      let h = Math.max(5, lines.length + 4);
      if (n.type === 'diamond') { w += 6; h = Math.max(7, lines.length + 6); }
      else if (n.type === 'hexagon' || n.type === 'parallelogram' || n.type === 'triangle') w += 4;
      else if (n.type === 'circle') w += 2;
      else if (n.type === 'database') h += 1;
      else if (n.type === 'queue') w += 6;
      if (n.type === 'triangle') h = Math.max(6, lines.length + 4);
      n.w = w;
      n.h = h;
    }

    // --- Lay out ---------------------------------------------------------
    // Ranks run along the flow (down for TB, right for LR). Across the flow
    // each rank fills up from the same edge; a subgraph claims a rectangle
    // over the ranks it covers, so it only pushes aside nodes at those ranks
    const isHorizontal = direction === 'LR' || direction === 'RL';
    const reverse = direction === 'BT' || direction === 'RL';
    const maxRank = Math.max(0, ...ranks.values());
    const childrenOf = (parent) => groups.filter(g => g.parent === parent);
    const PAD = 2;
    const ACROSS = isHorizontal ? 3 : 4; // gap between neighbours within a rank
    const ALONG = isHorizontal ? 8 : 4;  // gap between ranks

    const rankSize = Array(maxRank + 1).fill(0);
    nodes.forEach(n => {
      const r = ranks.get(n.id);
      rankSize[r] = Math.max(rankSize[r], isHorizontal ? n.w : n.h);
    });
    const descendants = (gid) => nodes.filter(n => {
      for (let g = n.group; g; g = (groups.find(x => x.id === g) || {}).parent) if (g === gid) return true;
      return false;
    });

    // Room for container borders and titles only next to the ranks where a
    // subgraph starts or ends (more for nested ones)
    const before = Array(maxRank + 1).fill(0);
    const after = Array(maxRank + 1).fill(0);
    for (const g of groups) {
      const inside = descendants(g.id).map(n => ranks.get(n.id));
      if (!inside.length) continue;
      const lo = Math.min(...inside), hi = Math.max(...inside);
      const [first, last] = reverse ? [hi, lo] : [lo, hi];
      before[first] += PAD + 2;
      after[last] += PAD + 1;
    }
    const rankStart = [];
    let pos = 3;
    for (let r = 0; r <= maxRank; r++) {
      const rr = reverse ? maxRank - r : r;
      pos += before[rr];
      rankStart[rr] = pos;
      pos += rankSize[rr] + ALONG + after[rr];
    }
    const shapes = [];
    const containers = [];
    const sizeAcross = (s) => (isHorizontal ? s.h : s.w);
    const farEdge = (s) => (isHorizontal ? s.y + s.h - 1 : s.x + s.w - 1);

    function layoutGroup(gid, fill) {
      let local = fill;
      let r0 = 0, r1 = maxRank;
      if (gid !== null) {
        const inside = descendants(gid);
        if (!inside.length) return;
        r0 = Math.min(...inside.map(n => ranks.get(n.id)));
        r1 = Math.max(...inside.map(n => ranks.get(n.id)));
        const start = Math.max(...fill.slice(r0, r1 + 1)) + PAD + 2;
        local = fill.map(() => start);
      }
      const placed = [];
      for (const child of childrenOf(gid)) {
        const box = layoutGroup(child.id, local);
        if (box) placed.push(box);
      }
      for (const n of nodes.filter(m => m.group === gid)) {
        const r = ranks.get(n.id);
        const a = local[r];
        const along = rankStart[r] + Math.floor((rankSize[r] - (isHorizontal ? n.w : n.h)) / 2);
        const shape = {
          id: n.id, type: n.type,
          x: isHorizontal ? along : a,
          y: isHorizontal ? a : along,
          w: n.w, h: n.h, text: n.text, textAlign: 'center'
        };
        shapes.push(shape);
        placed.push(shape);
        local[r] = a + sizeAcross(shape) + ACROSS;
      }
      if (gid === null) return null;

      // The container around everything placed inside it
      const g = groups.find(x => x.id === gid);
      const x0 = Math.min(...placed.map(s => s.x)) - PAD;
      const y0 = Math.min(...placed.map(s => s.y)) - PAD - 1;
      const x1 = Math.max(...placed.map(s => s.x + s.w - 1)) + PAD;
      const y1 = Math.max(...placed.map(s => s.y + s.h - 1)) + PAD;
      const box = {
        id: gid, type: 'container', x: x0, y: y0,
        w: Math.max(x1 - x0 + 1, String(g.title).length + 8), h: y1 - y0 + 1,
        text: g.title, textAlign: 'left'
      };
      containers.push(box);
      for (let r = r0; r <= r1; r++) fill[r] = farEdge(box) + 1 + ACROSS;
      return box;
    }
    layoutGroup(null, Array(maxRank + 1).fill(4));

    // Connectors: along the flow use the matching sides, anything else auto
    const SIDES = { TB: ['bottom', 'top'], BT: ['top', 'bottom'], LR: ['right', 'left'], RL: ['left', 'right'] };
    const [fromSide, toSide] = SIDES[direction] || SIDES.TB;
    const allIds = new Set([...shapes.map(s => s.id), ...containers.map(c => c.id)]);
    const connectors = edges
      .filter(e => allIds.has(e.from) && allIds.has(e.to) && e.from !== e.to)
      .map((e, i) => {
        const forward = nodeMap.has(e.from) && nodeMap.has(e.to) && ranks.get(e.to) > ranks.get(e.from);
        const conn = {
          id: `conn_${i + 1}`,
          type: 'connector',
          fromShapeId: e.from,
          toShapeId: e.to,
          fromAnchor: forward ? fromSide : 'auto',
          toAnchor: forward ? toSide : 'auto',
          arrowStart: e.arrowStart,
          arrowEnd: e.arrowEnd,
          style: e.style
        };
        if (e.label) conn.label = e.label;
        return conn;
      });

    return {
      version: 1,
      name: 'Imported Mermaid Flowchart',
      mode: 'unicode',
      // Outer containers first, so nested ones draw on top of them
      shapes: [...containers.reverse(), ...shapes],
      connectors,
      texts: [],
      notes: []
    };
  }

  /**
   * Export a diagram as a Mermaid flowchart. Containers become subgraphs
   * holding the shapes inside them; notes and free text become comments;
   * connectors with a loose end are left out (Mermaid edges need two nodes).
   */
  function diagramToMermaid(diagram) {
    const shapes = [...(diagram.shapes || []), ...(diagram.notes || [])];
    const used = new Set();
    const ids = new Map();
    for (const s of shapes) {
      let base = String(s.id || 'node').replace(/[^A-Za-z0-9_]/g, '_');
      if (!/^[A-Za-z_]/.test(base)) base = `n_${base}`;
      // Keywords Mermaid would misread as node ids
      if (/^(end|graph|flowchart|subgraph|style|class|classDef|click|linkStyle|direction)$/i.test(base)) base = `${base}_node`;
      let id = base;
      for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
      used.add(id);
      ids.set(s.id, id);
    }

    const label = (text) => {
      const t = String(text || '').trim().replace(/"/g, '#quot;').replace(/\n/g, '<br>');
      return `"${t}"`;
    };
    const nodeLine = (s) => {
      const [open, close] = MERMAID_BRACKETS[s.type] || MERMAID_BRACKETS.rectangle;
      return `${ids.get(s.id)}${open}${label(s.text || s.id)}${close}`;
    };

    // Flow direction: whichever way most attached connectors run
    let horizontal = 0, vertical = 0;
    for (const c of diagram.connectors || []) {
      for (const a of [c.fromAnchor, c.toAnchor]) {
        if (a === 'left' || a === 'right') horizontal++;
        if (a === 'top' || a === 'bottom') vertical++;
      }
    }
    const lines = [`flowchart ${horizontal > vertical ? 'LR' : 'TD'}`];

    // Nest shapes in the smallest container that holds them
    const containers = shapes.filter(s => s.type === 'container');
    const inside = (s, c) => s !== c && s.x >= c.x && s.y >= c.y && s.x + s.w <= c.x + c.w && s.y + s.h <= c.y + c.h;
    const parentOf = new Map();
    for (const s of shapes) {
      const holders = containers.filter(c => inside(s, c)).sort((a, b) => a.w * a.h - b.w * b.h);
      parentOf.set(s, holders[0] || null);
    }
    const emit = (parent, indent) => {
      for (const s of shapes) {
        if (parentOf.get(s) !== parent) continue;
        if (s.type === 'container') {
          lines.push(`${indent}subgraph ${ids.get(s.id)}[${label(s.text || s.id)}]`);
          emit(s, indent + '  ');
          lines.push(`${indent}end`);
        } else if (s.type === 'note') {
          lines.push(`${indent}%% note: ${String(s.text || '').replace(/\n/g, ' ')}`);
        } else {
          lines.push(indent + nodeLine(s));
        }
      }
    };
    emit(null, '  ');

    const ARROW = { triangle: '>', open: '>', dot: 'o', bar: 'x', diamond: '>' };
    for (const c of diagram.connectors || []) {
      const from = ids.get(c.fromShapeId);
      const to = ids.get(c.toShapeId);
      const fromShape = shapes.find(s => s.id === c.fromShapeId);
      const toShape = shapes.find(s => s.id === c.toShapeId);
      if (!from || !to || fromShape.type === 'note' || toShape.type === 'note') {
        lines.push(`  %% connector ${c.id || ''} has a loose end and is not exported`);
        continue;
      }
      let arrowEnd = c.arrowEnd === undefined ? 'triangle' : c.arrowEnd;
      if (arrowEnd === 'end' || arrowEnd === 'both') arrowEnd = 'triangle';
      const arrowStart = c.arrowEnd === 'both' ? 'triangle' : (c.arrowStart || 'none');
      const start = arrowStart !== 'none' ? (ARROW[arrowStart] === '>' ? '<' : ARROW[arrowStart]) : '';
      const end = arrowEnd !== 'none' ? ARROW[arrowEnd] || '>' : '';
      let body;
      if (c.style === 'double') body = end || start ? '==' : '===';
      else if (c.style === 'dashed' || c.style === 'dotted') body = end || start ? '-.-' : '-.-';
      else body = end || start ? '--' : '---';
      const text = c.label ? `|${label(c.label)}|` : '';
      lines.push(`  ${from} ${start}${body}${end}${text} ${to}`);
    }

    for (const t of diagram.texts || []) {
      lines.push(`  %% text: ${String(t.text || '').replace(/\n/g, ' ')}`);
    }
    return lines.join('\n') + '\n';
  }

  // Export to global
  global.AsciiParser = {
    parseAsciiToDiagram,
    parseMermaidToDiagram,
    diagramToMermaid
  };

})(typeof window !== 'undefined' ? window : this);
