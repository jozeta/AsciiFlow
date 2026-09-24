/**
 * AsciiFlow - Parser Module
 * Bidirectional conversion:
 * 1. Plain-text ASCII / Unicode diagrams -> structured diagram models
 * 2. Mermaid flowchart syntax -> structured diagram models with auto-layout
 */

(function (global) {
  'use strict';

  // ==========================================
  // 1. ASCII / Unicode -> Diagram Model Parser
  // ==========================================

  function parseAsciiToDiagram(text) {
    if (!text || typeof text !== 'string') {
      return { version: 1, name: 'Imported ASCII', mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] };
    }

    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
      return { version: 1, name: 'Imported ASCII', mode: 'unicode', shapes: [], connectors: [], texts: [], notes: [] };
    }

    const maxLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const grid = lines.map(line => line.padEnd(maxLen, ' ').split(''));
    const H = grid.length;
    const W = maxLen;

    // Track visited cells so we do not double-parse
    const visited = Array.from({ length: H }, () => Array(W).fill(false));

    const shapes = [];
    const connectors = [];
    const texts = [];

    // Helper: is box corner character
    function isCorner(char, type) {
      if (type === 'tl') return ['+', '┌', '╭', '.', '╔'].includes(char);
      if (type === 'tr') return ['+', '┐', '╮', '.', '╗'].includes(char);
      if (type === 'bl') return ['+', '└', '╰', '\'', '`', '╚'].includes(char);
      if (type === 'br') return ['+', '┘', '╯', '\'', '`', '╝'].includes(char);
      return false;
    }

    function isHBorder(char) {
      return ['-', '─', '═', '~'].includes(char);
    }

    function isVBorder(char) {
      return ['|', '│', '║', '┆', '┊'].includes(char);
    }

    // Detect rectangles and boxes
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = grid[r][c];

        if (isCorner(ch, 'tl') && !visited[r][c]) {
          // Look for matching top-right corner on row r
          for (let cEnd = c + 3; cEnd < W; cEnd++) {
            if (isCorner(grid[r][cEnd], 'tr')) {
              // Verify horizontal border between c and cEnd
              let isTopH = true;
              for (let k = c + 1; k < cEnd; k++) {
                if (!isHBorder(grid[r][k]) && grid[r][k] !== '+') {
                  isTopH = false;
                  break;
                }
              }
              if (!isTopH) continue;

              // Look for matching bottom row
              for (let rEnd = r + 2; rEnd < H; rEnd++) {
                if (isCorner(grid[rEnd][c], 'bl') && isCorner(grid[rEnd][cEnd], 'br')) {
                  // Verify bottom horizontal border
                  let isBottomH = true;
                  for (let k = c + 1; k < cEnd; k++) {
                    if (!isHBorder(grid[rEnd][k]) && grid[rEnd][k] !== '+') {
                      isBottomH = false;
                      break;
                    }
                  }
                  if (!isBottomH) continue;

                  // Verify left vertical border
                  let isLeftV = true;
                  for (let k = r + 1; k < rEnd; k++) {
                    if (!isVBorder(grid[k][c]) && grid[k][c] !== '+') {
                      isLeftV = false;
                      break;
                    }
                  }
                  if (!isLeftV) continue;

                  // Verify right vertical border
                  let isRightV = true;
                  for (let k = r + 1; k < rEnd; k++) {
                    if (!isVBorder(grid[k][cEnd]) && grid[k][cEnd] !== '+') {
                      isRightV = false;
                      break;
                    }
                  }
                  if (!isRightV) continue;

                  // Found a valid box!
                  const boxW = cEnd - c + 1;
                  const boxH = rEnd - r + 1;

                  // Extract interior text
                  const textLines = [];
                  for (let rowIdx = r + 1; rowIdx < rEnd; rowIdx++) {
                    const rowChars = [];
                    for (let colIdx = c + 1; colIdx < cEnd; colIdx++) {
                      rowChars.push(grid[rowIdx][colIdx]);
                    }
                    textLines.push(rowChars.join('').trim());
                  }

                  // Trim empty lines from top and bottom
                  while (textLines.length > 0 && textLines[0] === '') textLines.shift();
                  while (textLines.length > 0 && textLines[textLines.length - 1] === '') textLines.pop();
                  const innerText = textLines.join('\n');

                  // Mark box cells as visited
                  for (let ri = r; ri <= rEnd; ri++) {
                    for (let ci = c; ci <= cEnd; ci++) {
                      visited[ri][ci] = true;
                    }
                  }

                  const isRounded = ['╭', '.'].includes(ch);
                  const isDouble = ['╔', '═'].includes(ch);
                  const shapeType = isRounded ? 'rounded-rectangle' : 'rectangle';

                  shapes.push({
                    id: `shape_${shapes.length + 1}`,
                    type: shapeType,
                    x: c,
                    y: r,
                    w: boxW,
                    h: boxH,
                    text: innerText,
                    style: isDouble ? 'double' : 'default',
                    textAlign: 'center'
                  });
                  break; // Move to next
                }
              }
            }
          }
        }
      }
    }

    // Detect arrows and connecting lines outside shapes
    // Scan for arrows pointing right, left, down, up
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (visited[r][c]) continue;

        const ch = grid[r][c];

        // Horizontal line/arrow
        if ((ch === '-' || ch === '─' || ch === '►' || ch === '>' || ch === '◄' || ch === '<') && !visited[r][c]) {
          let startC = c;
          while (startC > 0 && ['-', '─', '◄', '<'].includes(grid[r][startC - 1]) && !visited[r][startC - 1]) {
            startC--;
          }
          let endC = c;
          while (endC < W - 1 && ['-', '─', '►', '>'].includes(grid[r][endC + 1]) && !visited[r][endC + 1]) {
            endC++;
          }

          if (endC - startC >= 2) {
            for (let k = startC; k <= endC; k++) visited[r][k] = true;

            const hasStartArrow = ['◄', '<'].includes(grid[r][startC]);
            const hasEndArrow = ['►', '>'].includes(grid[r][endC]);

            connectors.push({
              id: `conn_${connectors.length + 1}`,
              type: 'connector',
              fromShapeId: null,
              toShapeId: null,
              fromPoint: { x: startC, y: r },
              toPoint: { x: endC, y: r },
              arrowStart: hasStartArrow ? 'triangle' : 'none',
              arrowEnd: hasEndArrow ? 'triangle' : 'none'
            });
            continue;
          }
        }

        // Vertical line/arrow
        if ((ch === '|' || ch === '│' || ch === '▼' || ch === 'v' || ch === '▲' || ch === '^') && !visited[r][c]) {
          let startR = r;
          while (startR > 0 && ['|', '│', '▲', '^'].includes(grid[startR - 1][c]) && !visited[startR - 1][c]) {
            startR--;
          }
          let endR = r;
          while (endR < H - 1 && ['|', '│', '▼', 'v'].includes(grid[endR + 1][c]) && !visited[endR + 1][c]) {
            endR++;
          }

          if (endR - startR >= 2) {
            for (let k = startR; k <= endR; k++) visited[k][c] = true;

            const hasStartArrow = ['▲', '^'].includes(grid[startR][c]);
            const hasEndArrow = ['▼', 'v'].includes(grid[endR][c]);

            connectors.push({
              id: `conn_${connectors.length + 1}`,
              type: 'connector',
              fromShapeId: null,
              toShapeId: null,
              fromPoint: { x: c, y: startR },
              toPoint: { x: c, y: endR },
              arrowStart: hasStartArrow ? 'triangle' : 'none',
              arrowEnd: hasEndArrow ? 'triangle' : 'none'
            });
            continue;
          }
        }
      }
    }

    // Try linking connectors to adjacent shapes
    for (const conn of connectors) {
      if (conn.fromPoint) {
        for (const s of shapes) {
          if (Math.abs(conn.fromPoint.x - (s.x + s.w)) <= 1 && conn.fromPoint.y >= s.y && conn.fromPoint.y <= s.y + s.h) {
            conn.fromShapeId = s.id;
            conn.fromAnchor = 'right';
            conn.fromPoint = null;
            break;
          } else if (Math.abs(conn.fromPoint.x - s.x) <= 1 && conn.fromPoint.y >= s.y && conn.fromPoint.y <= s.y + s.h) {
            conn.fromShapeId = s.id;
            conn.fromAnchor = 'left';
            conn.fromPoint = null;
            break;
          } else if (Math.abs(conn.fromPoint.y - (s.y + s.h)) <= 1 && conn.fromPoint.x >= s.x && conn.fromPoint.x <= s.x + s.w) {
            conn.fromShapeId = s.id;
            conn.fromAnchor = 'bottom';
            conn.fromPoint = null;
            break;
          } else if (Math.abs(conn.fromPoint.y - s.y) <= 1 && conn.fromPoint.x >= s.x && conn.fromPoint.x <= s.x + s.w) {
            conn.fromShapeId = s.id;
            conn.fromAnchor = 'top';
            conn.fromPoint = null;
            break;
          }
        }
      }

      if (conn.toPoint) {
        for (const s of shapes) {
          if (Math.abs(conn.toPoint.x - s.x) <= 1 && conn.toPoint.y >= s.y && conn.toPoint.y <= s.y + s.h) {
            conn.toShapeId = s.id;
            conn.toAnchor = 'left';
            conn.toPoint = null;
            break;
          } else if (Math.abs(conn.toPoint.x - (s.x + s.w)) <= 1 && conn.toPoint.y >= s.y && conn.toPoint.y <= s.y + s.h) {
            conn.toShapeId = s.id;
            conn.toAnchor = 'right';
            conn.toPoint = null;
            break;
          } else if (Math.abs(conn.toPoint.y - s.y) <= 1 && conn.toPoint.x >= s.x && conn.toPoint.x <= s.x + s.w) {
            conn.toShapeId = s.id;
            conn.toAnchor = 'top';
            conn.toPoint = null;
            break;
          } else if (Math.abs(conn.toPoint.y - (s.y + s.h)) <= 1 && conn.toPoint.x >= s.x && conn.toPoint.x <= s.x + s.w) {
            conn.toShapeId = s.id;
            conn.toAnchor = 'bottom';
            conn.toPoint = null;
            break;
          }
        }
      }
    }

    return {
      version: 1,
      name: 'Imported ASCII Diagram',
      mode: text.includes('─') || text.includes('┌') ? 'unicode' : 'ascii',
      shapes,
      connectors,
      texts,
      notes: []
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
