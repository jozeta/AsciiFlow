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

    // --- Rectangles, rounded boxes, containers and notes ---------------
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = grid[r][c];
        if (!isCorner(ch, 'tl') || visited[r][c]) continue;

        let found = false;
        for (let cEnd = c + 3; cEnd < W && !found; cEnd++) {
          if (!isCorner(grid[r][cEnd], 'tr')) continue;

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
            let ok = true;
            for (let k = c + 1; k < cEnd && ok; k++) ok = isHBorder(grid[rEnd][k]);
            for (let k = r + 1; k < rEnd && ok; k++) ok = isVBorder(grid[k][c]) && isVBorder(grid[k][cEnd]);
            if (!ok) continue;

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
      if (at(x + dx, y + dy) === ' ') return owner[y + 2 * dy]?.[x + 2 * dx] || null;
      return null;
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

        // Keep going straight where possible (through crossings and along
        // the trunk of a T); turn at corners; stop on the stem of a T.
        const options = linksOf(x, y).filter(o => o !== OPPOSITE[d]);
        if (options.includes(d)) continue;
        if (options.length === 1) { d = options[0]; corners.push({ x, y }); continue; }
        if (options.length === 0 && !ARROW_GLYPHS[at(x, y)]) continue; // may still bridge a label
        break;
      }

      return { cells, corners, labels, startOpen: OPPOSITE[firstDir], endOpen: d, endShape };
    }

    function addConnector(path) {
      if (path.cells.length < 2 && !path.labels.length) return;
      const [sx, sy] = path.cells[0];
      const [ex, ey] = path.cells[path.cells.length - 1];
      const startArrow = ARROW_GLYPHS[at(sx, sy)];
      const endArrow = ARROW_GLYPHS[at(ex, ey)];

      let from = {
        point: { x: sx, y: sy },
        shape: shapeBeyond(sx, sy, path.startOpen),
        anchor: ANCHOR_FOR_ENTRY[path.startOpen],
        arrow: startArrow && (startArrow[0] & OPPOSITE[path.startOpen]) ? startArrow[1] : 'none'
      };
      let to = {
        point: { x: ex, y: ey },
        shape: path.endShape || shapeBeyond(ex, ey, path.endOpen),
        anchor: ANCHOR_FOR_ENTRY[path.endOpen],
        arrow: endArrow && (endArrow[0] & OPPOSITE[path.endOpen]) ? endArrow[1] : 'none'
      };
      let corners = path.corners;
      // Point the connector at its arrowhead
      if (from.arrow !== 'none' && to.arrow === 'none') {
        [from, to] = [to, from];
        corners = corners.slice().reverse();
      }
      if (!from.shape && !to.shape && path.cells.length < 3) return; // stray mark

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
      const label = path.labels.filter(Boolean).join(' ');
      if (label) conn.label = label;
      connectors.push(conn);
    }

    // Start from line ends (degree 0 or 1), then pick up anything left over
    // (segments between junctions, loops) from cells with unused links.
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isLineCell(x, y)) continue;
          const links = linksOf(x, y);
          if (pass === 0) {
            if (links.length > 1 || lineCellsUsed.has(`${x},${y}`)) continue;
            let dir = links[0];
            if (dir === undefined) {
              // A lone stub: head away from the shape it touches, towards a label
              dir = ALL_DIRS.find(d => (glyphDirs(x, y) & d) && !shapeBeyond(x, y, d) && bridgeLabel(x, y, d));
              if (dir === undefined) continue;
            } else if (usedEdges.has(edgeKey(x, y, dir))) {
              continue;
            }
            addConnector(trace(x, y, dir));
          } else {
            for (const d of links) {
              if (!usedEdges.has(edgeKey(x, y, d))) addConnector(trace(x, y, d));
            }
          }
        }
      }
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
        if (/[A-Za-z0-9]/.test(words)) {
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
  // 2. Mermaid Flowchart -> Diagram Model Parser
  // ==========================================

  function parseMermaidToDiagram(mermaidText) {
    if (!mermaidText || typeof mermaidText !== 'string') {
      return { version: 1, name: 'Imported Mermaid', mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] };
    }

    const lines = mermaidText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('%%'));
    let direction = 'TB'; // 'TB' | 'LR' | 'TD' | 'BT' | 'RL'

    const nodeMap = new Map(); // id -> { id, text, type }
    const rawEdges = []; // { from, to, label, arrowStart, arrowEnd, style }

    for (const line of lines) {
      if (/^(graph|flowchart)\s+/i.test(line)) {
        const matchDir = line.match(/^(?:graph|flowchart)\s+(TB|TD|LR|BT|RL)/i);
        if (matchDir) {
          direction = matchDir[1].toUpperCase();
          if (direction === 'TD') direction = 'TB';
        }
        continue;
      }

      // Check for connection patterns: A --> B, A[Start] --> B(End), etc.
      // Connection regex matches: (fromNodePart)\s*(-->|---|==>|-\.->)\s*(\|label\|)?\s*(toNodePart)
      const edgeRegex = /^([a-zA-Z0-9_-]+(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\}|\[\([^)]+\)\])?)?\s*(-->|---|==>|-\.->|<-->)\s*(?:\|([^|]+)\|)?\s*([a-zA-Z0-9_-]+(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\}|\[\([^)]+\)\])?)$/;
      const edgeMatch = line.match(edgeRegex);

      if (edgeMatch) {
        const fromPart = edgeMatch[1];
        const arrowType = edgeMatch[2];
        const label = edgeMatch[3] ? edgeMatch[3].trim() : '';
        const toPart = edgeMatch[4];

        const fromNode = parseMermaidNode(fromPart, nodeMap);
        const toNode = parseMermaidNode(toPart, nodeMap);

        if (fromNode && toNode) {
          const isDashed = arrowType === '-.->';
          const isDouble = arrowType === '==>';
          const isBoth = arrowType === '<-->';
          const isArrow = arrowType.includes('>');

          rawEdges.push({
            from: fromNode.id,
            to: toNode.id,
            label,
            arrowStart: isBoth ? 'triangle' : 'none',
            arrowEnd: isArrow ? 'triangle' : 'none',
            style: isDouble ? 'double' : (isDashed ? 'dashed' : 'solid')
          });
        }
        continue;
      }

      // Standalone node line: A[My Node Text]
      parseMermaidNode(line, nodeMap);
    }

    function parseMermaidNode(part, map) {
      if (!part) return null;
      part = part.trim();

      // Database: id[(Text)]
      let m = part.match(/^([a-zA-Z0-9_-]+)\[\((.*?)\)\]$/);
      if (m) {
        const node = { id: m[1], text: m[2] || m[1], type: 'database' };
        map.set(node.id, node);
        return node;
      }

      // Rounded: id(Text)
      m = part.match(/^([a-zA-Z0-9_-]+)\((.*?)\)$/);
      if (m) {
        const node = { id: m[1], text: m[2] || m[1], type: 'rounded-rectangle' };
        map.set(node.id, node);
        return node;
      }

      // Diamond: id{Text}
      m = part.match(/^([a-zA-Z0-9_-]+)\{(.*?)\}$/);
      if (m) {
        const node = { id: m[1], text: m[2] || m[1], type: 'diamond' };
        map.set(node.id, node);
        return node;
      }

      // Rectangle: id[Text]
      m = part.match(/^([a-zA-Z0-9_-]+)\[(.*?)\]$/);
      if (m) {
        const node = { id: m[1], text: m[2] || m[1], type: 'rectangle' };
        map.set(node.id, node);
        return node;
      }

      // Plain ID without brackets
      m = part.match(/^([a-zA-Z0-9_-]+)$/);
      if (m) {
        const id = m[1];
        if (!map.has(id)) {
          map.set(id, { id, text: id, type: 'rectangle' });
        }
        return map.get(id);
      }

      return null;
    }

    // Layout nodes into clean coordinates (DAG rank ordering)
    const nodes = Array.from(nodeMap.values());
    if (nodes.length === 0) {
      return { version: 1, name: 'Empty Mermaid', mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] };
    }

    // Topological / BFS rank assignment
    const ranks = new Map(); // id -> rank (0, 1, 2, ...)
    const inDegree = new Map();
    nodes.forEach(n => { inDegree.set(n.id, 0); ranks.set(n.id, 0); });

    rawEdges.forEach(e => {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    });

    // BFS queue
    const queue = [];
    nodes.forEach(n => {
      if (inDegree.get(n.id) === 0) queue.push(n.id);
    });
    if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id);

    while (queue.length > 0) {
      const currId = queue.shift();
      const currRank = ranks.get(currId) || 0;

      rawEdges.filter(e => e.from === currId).forEach(e => {
        const nextId = e.to;
        const newRank = currRank + 1;
        if (newRank > (ranks.get(nextId) || 0)) {
          ranks.set(nextId, newRank);
        }
        inDegree.set(nextId, inDegree.get(nextId) - 1);
        if (inDegree.get(nextId) === 0) {
          queue.push(nextId);
        }
      });
    }

    // Group nodes by rank
    const maxRank = Math.max(0, ...Array.from(ranks.values()));
    const levels = Array.from({ length: maxRank + 1 }, () => []);
    nodes.forEach(n => {
      const r = ranks.get(n.id) || 0;
      levels[r].push(n);
    });

    const isLR = direction === 'LR';
    const shapes = [];
    const colSpacing = isLR ? 28 : 22;
    const rowSpacing = isLR ? 8 : 7;
    const startX = 4;
    const startY = 3;

    levels.forEach((levelNodes, levelIdx) => {
      levelNodes.forEach((node, nodeIdx) => {
        const w = Math.max(16, Math.min(26, (node.text || '').length + 6));
        const h = node.type === 'diamond' ? 7 : (node.type === 'database' ? 6 : 5);

        let x, y;
        if (isLR) {
          x = startX + levelIdx * colSpacing;
          y = startY + nodeIdx * rowSpacing;
        } else {
          x = startX + nodeIdx * colSpacing;
          y = startY + levelIdx * rowSpacing;
        }

        shapes.push({
          id: node.id,
          type: node.type,
          x,
          y,
          w,
          h,
          text: node.text,
          textAlign: 'center'
        });
      });
    });

    // Create connectors
    const connectors = rawEdges.map((e, idx) => {
      return {
        id: `conn_${idx + 1}`,
        type: 'connector',
        fromShapeId: e.from,
        toShapeId: e.to,
        fromAnchor: isLR ? 'right' : 'bottom',
        toAnchor: isLR ? 'left' : 'top',
        label: e.label || '',
        arrowStart: e.arrowStart || 'none',
        arrowEnd: e.arrowEnd || 'end',
        style: e.style || 'solid'
      };
    });

    return {
      version: 1,
      name: 'Imported Mermaid Flowchart',
      mode: 'unicode',
      shapes,
      connectors,
      texts: [],
      notes: []
    };
  }

  // Export to global
  global.AsciiParser = {
    parseAsciiToDiagram,
    parseMermaidToDiagram
  };

})(typeof window !== 'undefined' ? window : this);
