/**
 * AsciiFlow - ASCII & Unicode Rendering Engine
 * Converts diagram models into a 2D character matrix and renders monospace text.
 */

(function (global) {
  'use strict';

  // Character sets for different rendering modes
  const CHAR_SETS = {
    'unicode': {
      h: '─',
      v: '│',
      tl: '┌',
      tr: '┐',
      bl: '└',
      br: '┘',
      rounded_tl: '╭',
      rounded_tr: '╮',
      rounded_bl: '╰',
      rounded_br: '╯',
      cross: '┼',
      t_down: '┬',
      t_up: '┴',
      t_right: '├',
      t_left: '┤',
      arrow_right: '►',
      arrow_left: '◄',
      arrow_down: '▼',
      arrow_up: '▲',
      diag_forward: '/',
      diag_back: '\\',
      dash_h: '┄',
      dash_v: '┆'
    },
    'unicode-curved': {
      h: '─',
      v: '│',
      tl: '╭',
      tr: '╮',
      bl: '╰',
      br: '╯',
      rounded_tl: '╭',
      rounded_tr: '╮',
      rounded_bl: '╰',
      rounded_br: '╯',
      cross: '┼',
      t_down: '┬',
      t_up: '┴',
      t_right: '├',
      t_left: '┤',
      arrow_right: '►',
      arrow_left: '◄',
      arrow_down: '▼',
      arrow_up: '▲',
      diag_forward: '/',
      diag_back: '\\',
      dash_h: '┄',
      dash_v: '┆'
    },
    'ascii': {
      h: '-',
      v: '|',
      tl: '+',
      tr: '+',
      bl: '+',
      br: '+',
      rounded_tl: '.',
      rounded_tr: '.',
      rounded_bl: "'",
      rounded_br: "'",
      cross: '+',
      t_down: '+',
      t_up: '+',
      t_right: '+',
      t_left: '+',
      arrow_right: '>',
      arrow_left: '<',
      arrow_down: 'v',
      arrow_up: '^',
      diag_forward: '/',
      diag_back: '\\',
      dash_h: '-',
      dash_v: '|'
    }
  };

  const ARROW_HEADS = {
    unicode: {
      triangle: { right: '►', left: '◄', down: '▼', up: '▲' },
      open:     { right: '▷', left: '◁', down: '▽', up: '△' },
      dot:      { right: '●', left: '●', down: '●', up: '●' },
      diamond:  { right: '◆', left: '◆', down: '◆', up: '◆' },
      bar:      { right: '│', left: '│', down: '─', up: '─' }
    },
    'unicode-curved': {
      triangle: { right: '►', left: '◄', down: '▼', up: '▲' },
      open:     { right: '▷', left: '◁', down: '▽', up: '△' },
      dot:      { right: '●', left: '●', down: '●', up: '●' },
      diamond:  { right: '◇', left: '◇', down: '◇', up: '◇' },
      bar:      { right: '│', left: '│', down: '─', up: '─' }
    },
    ascii: {
      triangle: { right: '>', left: '<', down: 'v', up: '^' },
      open:     { right: '>', left: '<', down: 'v', up: '^' },
      dot:      { right: 'o', left: 'o', down: 'o', up: 'o' },
      diamond:  { right: '<>', left: '<>', down: 'v', up: '^' },
      bar:      { right: '|', left: '|', down: '-', up: '-' }
    }
  };

  const LINE_STYLES = {
    unicode: {
      solid:  { h: '─', v: '│', cross: '┼' },
      dashed: { h: '╌', v: '╎', cross: '┼' },
      dotted: { h: '┈', v: '┊', cross: '┼' },
      double: { h: '═', v: '║', cross: '╬' }
    },
    'unicode-curved': {
      solid:  { h: '─', v: '│', cross: '┼' },
      dashed: { h: '╌', v: '╎', cross: '┼' },
      dotted: { h: '┈', v: '┊', cross: '┼' },
      double: { h: '═', v: '║', cross: '╬' }
    },
    ascii: {
      solid:  { h: '-', v: '|', cross: '+' },
      dashed: { h: '-', v: '|', cross: '+' },
      dotted: { h: '.', v: ':', cross: '+' },
      double: { h: '=', v: '#', cross: '+' }
    }
  };

  /**
   * 2D Character Matrix representing the rendered canvas
   */
  class AsciiGrid {
    constructor(minCol = 0, minRow = 0, maxCol = 80, maxRow = 40) {
      this.minCol = minCol;
      this.minRow = minRow;
      this.maxCol = maxCol;
      this.maxRow = maxRow;
      this.width = Math.max(1, maxCol - minCol + 1);
      this.height = Math.max(1, maxRow - minRow + 1);

      // 2D Array of characters
      this.cells = Array.from({ length: this.height }, () =>
        Array(this.width).fill(' ')
      );

      // Metadata for collision handling: null, 'space', 'border', 'line', 'junction', 'arrow', 'text'
      this.cellTypes = Array.from({ length: this.height }, () =>
        Array(this.width).fill(null)
      );

      // Track shape ownership
      this.cellOwners = Array.from({ length: this.height }, () =>
        Array(this.width).fill(null)
      );
    }

    /**
     * Check if a position is within the allocated grid bounds
     */
    isInBounds(col, row) {
      return (
        col >= this.minCol &&
        col <= this.maxCol &&
        row >= this.minRow &&
        row <= this.maxRow
      );
    }

    /**
     * Get character at (col, row)
     */
    get(col, row) {
      if (!this.isInBounds(col, row)) return ' ';
      return this.cells[row - this.minRow][col - this.minCol];
    }

    /**
     * Get cell type at (col, row)
     */
    getType(col, row) {
      if (!this.isInBounds(col, row)) return null;
      return this.cellTypes[row - this.minRow][col - this.minCol];
    }

    /**
     * Set character at (col, row) with collision rules
     */
    set(col, row, char, type = 'border', ownerId = null) {
      if (!this.isInBounds(col, row)) return;

      const r = row - this.minRow;
      const c = col - this.minCol;
      const currentType = this.cellTypes[r][c];
      const currentChar = this.cells[r][c];

      // Never overwrite text with line or border
      if (currentType === 'text' && type !== 'text') {
        return;
      }

      // Handle intersection between horizontal and vertical lines
      if ((currentType === 'line' || currentType === 'border') && type === 'line') {
        const isCurrentH = currentChar === '─' || currentChar === '-';
        const isCurrentV = currentChar === '│' || currentChar === '|';
        const isNewH = char === '─' || char === '-';
        const isNewV = char === '│' || char === '|';

        if ((isCurrentH && isNewV) || (isCurrentV && isNewH)) {
          char = (char === '-' || currentChar === '-') ? '+' : '┼';
          type = 'junction';
        }
      }

      this.cells[r][c] = char;
      this.cellTypes[r][c] = type;
      if (ownerId) this.cellOwners[r][c] = ownerId;
    }

    /**
     * Export the grid to a multiline string
     * @param {Object} options { trimTrailing: true, trimCanvas: true, minMargin: 1 }
     */
    toString(options = {}) {
      const {
        trimTrailing = true,
        trimCanvas = true,
        minMargin = 1
      } = options;

      if (!trimCanvas) {
        return this.cells
          .map(row => (trimTrailing ? row.join('').trimEnd() : row.join('')))
          .join('\n');
      }

      // Find actual content bounding box
      let contentMinRow = this.height;
      let contentMaxRow = -1;
      let contentMinCol = this.width;
      let contentMaxCol = -1;

      for (let r = 0; r < this.height; r++) {
        for (let c = 0; c < this.width; c++) {
          if (this.cells[r][c] !== ' ') {
            if (r < contentMinRow) contentMinRow = r;
            if (r > contentMaxRow) contentMaxRow = r;
            if (c < contentMinCol) contentMinCol = c;
            if (c > contentMaxCol) contentMaxCol = c;
          }
        }
      }

      // If diagram is completely empty
      if (contentMaxRow === -1) {
        return '';
      }

      // Add minimum margin
      const rStart = Math.max(0, contentMinRow - minMargin);
      const rEnd = Math.min(this.height - 1, contentMaxRow + minMargin);
      const cStart = Math.max(0, contentMinCol - minMargin);
      const cEnd = Math.min(this.width - 1, contentMaxCol + minMargin);

      const lines = [];
      for (let r = rStart; r <= rEnd; r++) {
        const rowSlice = this.cells[r].slice(cStart, cEnd + 1);
        const line = rowSlice.join('');
        lines.push(trimTrailing ? line.trimEnd() : line);
      }

      return lines.join('\n');
    }
  }

  /**
   * Core AsciiRenderer Engine
   */
  class AsciiRenderer {
    constructor(options = {}) {
      this.mode = options.mode || 'unicode'; // 'unicode' | 'ascii' | 'unicode-curved'
    }

    setMode(mode) {
      if (CHAR_SETS[mode]) {
        this.mode = mode;
      }
    }

    getCharSet() {
      return CHAR_SETS[this.mode] || CHAR_SETS['unicode'];
    }

    /**
     * Compute bounding box for all diagram elements
     */
    calculateBounds(diagram, padding = 4) {
      let minCol = Infinity;
      let minRow = Infinity;
      let maxCol = -Infinity;
      let maxRow = -Infinity;

      const elements = [
        ...(diagram.shapes || []),
        ...(diagram.texts || []),
        ...(diagram.notes || [])
      ];

      if (elements.length === 0 && (!diagram.connectors || diagram.connectors.length === 0)) {
        return { minCol: 0, minRow: 0, maxCol: 40, maxRow: 20 };
      }

      for (const el of elements) {
        const x = el.x !== undefined ? el.x : 0;
        const y = el.y !== undefined ? el.y : 0;
        const w = el.w !== undefined ? el.w : 1;
        const h = el.h !== undefined ? el.h : 1;

        if (x < minCol) minCol = x;
        if (y < minRow) minRow = y;
        if (x + w - 1 > maxCol) maxCol = x + w - 1;
        if (y + h - 1 > maxRow) maxRow = y + h - 1;
      }

      // Check connectors
      if (diagram.connectors) {
        for (const conn of diagram.connectors) {
          if (conn.points) {
            for (const pt of conn.points) {
              if (pt.x < minCol) minCol = pt.x;
              if (pt.y < minRow) minRow = pt.y;
              if (pt.x > maxCol) maxCol = pt.x;
              if (pt.y > maxRow) maxRow = pt.y;
            }
          }
          if (conn.waypoints) {
            for (const pt of conn.waypoints) {
              if (pt.x < minCol) minCol = pt.x;
              if (pt.y < minRow) minRow = pt.y;
              if (pt.x > maxCol) maxCol = pt.x;
              if (pt.y > maxRow) maxRow = pt.y;
            }
          }
          if (conn.fromPoint) {
            if (conn.fromPoint.x < minCol) minCol = conn.fromPoint.x;
            if (conn.fromPoint.y < minRow) minRow = conn.fromPoint.y;
            if (conn.fromPoint.x > maxCol) maxCol = conn.fromPoint.x;
            if (conn.fromPoint.y > maxRow) maxRow = conn.fromPoint.y;
          }
          if (conn.toPoint) {
            if (conn.toPoint.x < minCol) minCol = conn.toPoint.x;
            if (conn.toPoint.y < minRow) minRow = conn.toPoint.y;
            if (conn.toPoint.x > maxCol) maxCol = conn.toPoint.x;
            if (conn.toPoint.y > maxRow) maxRow = conn.toPoint.y;
          }
        }
      }

      if (minCol === Infinity) {
        minCol = 0; minRow = 0; maxCol = 50; maxRow = 25;
      }

      return {
        minCol: minCol - padding,
        minRow: minRow - padding,
        maxCol: maxCol + padding,
        maxRow: maxRow + padding
      };
    }

    /**
     * Render the diagram into an AsciiGrid instance
     */
    renderToGrid(diagram, bounds = null) {
      if (!bounds) {
        bounds = this.calculateBounds(diagram, 2);
      }

      const grid = new AsciiGrid(bounds.minCol, bounds.minRow, bounds.maxCol, bounds.maxRow);
      const chars = this.getCharSet();

      // Index shapes by ID for connector lookup
      const shapeMap = new Map();
      if (diagram.shapes) {
        diagram.shapes.forEach(s => shapeMap.set(s.id, s));
      }
      if (diagram.notes) {
        diagram.notes.forEach(n => shapeMap.set(n.id, n));
      }

      // Pass 1: Draw containers first so nested shapes are preserved
      if (diagram.shapes) {
        for (const shape of diagram.shapes) {
          if (shape.type === 'container') {
            this.renderShape(grid, shape, chars);
          }
        }
        for (const shape of diagram.shapes) {
          if (shape.type !== 'container') {
            this.renderShape(grid, shape, chars);
          }
        }
      }

      // Pass 2: Draw standalone notes
      if (diagram.notes) {
        for (const note of diagram.notes) {
          this.renderNote(grid, note, chars);
        }
      }

      // Pass 3: Draw connectors (with border junctions and arrowheads)
      if (diagram.connectors) {
        for (const conn of diagram.connectors) {
          this.renderConnector(grid, conn, shapeMap, chars);
        }
      }

      // Pass 4: Draw standalone texts
      if (diagram.texts) {
        for (const textItem of diagram.texts) {
          this.renderTextItem(grid, textItem);
        }
      }

      return grid;
    }

    /**
     * Render full diagram to string
     */
    render(diagram, options = {}) {
      const grid = this.renderToGrid(diagram);
      return grid.toString({
        trimTrailing: options.trimTrailing !== false,
        trimCanvas: options.trimCanvas !== false,
        minMargin: options.minMargin !== undefined ? options.minMargin : 1
      });
    }

    /**
     * Render a single shape onto the grid
     */
    renderShape(grid, shape, chars) {
      const type = shape.type || 'rectangle';
      const x = Math.round(shape.x);
      const y = Math.round(shape.y);
      const w = Math.max(2, Math.round(shape.w));
      const h = Math.max(2, Math.round(shape.h));
      const id = shape.id;

      switch (type) {
        case 'rectangle':
          this.drawRectangle(grid, x, y, w, h, chars, id, false);
          break;
        case 'rounded-rectangle':
          this.drawRectangle(grid, x, y, w, h, chars, id, true);
          break;
        case 'diamond':
          this.drawDiamond(grid, x, y, w, h, chars, id);
          break;
        case 'parallelogram':
          this.drawParallelogram(grid, x, y, w, h, chars, id);
          break;
        case 'hexagon':
          this.drawHexagon(grid, x, y, w, h, chars, id);
          break;
        case 'circle':
          this.drawCircle(grid, x, y, w, h, chars, id);
          break;
        case 'triangle':
          this.drawTriangle(grid, x, y, w, h, chars, id);
          break;
        case 'database':
          this.drawDatabase(grid, x, y, w, h, chars, id);
          break;
        case 'cloud':
          this.drawCloud(grid, x, y, w, h, chars, id);
          break;
        case 'queue':
          this.drawQueue(grid, x, y, w, h, chars, id);
          break;
        case 'container':
          this.drawContainer(grid, x, y, w, h, chars, id);
          break;
        case 'line':
          this.drawLine(grid, x, y, x + w - 1, y + h - 1, chars, id, false);
          break;
        case 'arrow':
          this.drawLine(grid, x, y, x + w - 1, y + h - 1, chars, id, true);
          break;
        default:
          this.drawRectangle(grid, x, y, w, h, chars, id, false);
      }

      // Render shape label/text
      if (shape.text) {
        this.renderShapeText(grid, shape);
      }
    }

    /**
     * Draw standard or rounded rectangle
     */
    drawRectangle(grid, x, y, w, h, chars, id, rounded = false) {
      // Clear interior
      for (let r = 1; r < h - 1; r++) {
        for (let c = 1; c < w - 1; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const tl = rounded ? chars.rounded_tl : chars.tl;
      const tr = rounded ? chars.rounded_tr : chars.tr;
      const bl = rounded ? chars.rounded_bl : chars.bl;
      const br = rounded ? chars.rounded_br : chars.br;

      // Corners
      grid.set(x, y, tl, 'border', id);
      grid.set(x + w - 1, y, tr, 'border', id);
      grid.set(x, y + h - 1, bl, 'border', id);
      grid.set(x + w - 1, y + h - 1, br, 'border', id);

      // Horizontal borders
      for (let c = 1; c < w - 1; c++) {
        grid.set(x + c, y, chars.h, 'border', id);
        grid.set(x + c, y + h - 1, chars.h, 'border', id);
      }

      // Vertical borders
      for (let r = 1; r < h - 1; r++) {
        grid.set(x, y + r, chars.v, 'border', id);
        grid.set(x + w - 1, y + r, chars.v, 'border', id);
      }
    }

    /**
     * Draw Diamond (Decision) with clean single-boundary diagonal slopes
     */
    drawDiamond(grid, x, y, w, h, chars, id) {
      // Clear bounding interior
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const cx = x + Math.floor((w - 1) / 2);
      const cy = y + Math.floor((h - 1) / 2);
      const rightX = x + w - 1;
      const bottomY = y + h - 1;

      // Vertices
      grid.set(cx, y, '^', 'border', id);
      grid.set(cx, bottomY, 'v', 'border', id);
      grid.set(x, cy, '<', 'border', id);
      grid.set(rightX, cy, '>', 'border', id);

      const slash = chars.diag_forward;
      const backslash = chars.diag_back;

      // Top half slopes
      for (let r = 1; r < cy - y; r++) {
        const ratio = r / (cy - y);
        const cLeft = Math.round(cx - (cx - x) * ratio);
        const cRight = Math.round(cx + (rightX - cx) * ratio);
        grid.set(cLeft, y + r, slash, 'border', id);
        grid.set(cRight, y + r, backslash, 'border', id);
      }

      // Bottom half slopes
      for (let r = 1; r < bottomY - cy; r++) {
        const ratio = r / (bottomY - cy);
        const cLeft = Math.round(x + (cx - x) * ratio);
        const cRight = Math.round(rightX - (rightX - cx) * ratio);
        grid.set(cLeft, cy + r, backslash, 'border', id);
        grid.set(cRight, cy + r, slash, 'border', id);
      }
    }

    /**
     * Draw Parallelogram (Data / Input-Output)
     */
    drawParallelogram(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const slant = Math.max(1, Math.min(Math.floor(w / 4), Math.floor((h - 1) / 2), 3));
      const slash = chars.diag_forward;
      const hChar = chars.h;

      // Top line
      grid.set(x + slant, y, slash, 'border', id);
      for (let c = x + slant + 1; c < x + w - 1; c++) {
        grid.set(c, y, hChar, 'border', id);
      }
      grid.set(x + w - 1, y, slash, 'border', id);

      // Intermediate rows
      for (let r = 1; r < h - 1; r++) {
        const shift = Math.round(slant * (h - 1 - r) / (h - 1));
        grid.set(x + shift, y + r, slash, 'border', id);
        grid.set(x + w - 1 - slant + shift, y + r, slash, 'border', id);
      }

      // Bottom line
      grid.set(x, y + h - 1, slash, 'border', id);
      for (let c = x + 1; c < x + w - 1 - slant; c++) {
        grid.set(c, y + h - 1, hChar, 'border', id);
      }
      grid.set(x + w - 1 - slant, y + h - 1, slash, 'border', id);
    }

    /**
     * Draw Hexagon (Preparation)
     */
    drawHexagon(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const apexW = Math.max(1, Math.min(Math.floor(w / 4), 3));
      const cy = y + Math.floor((h - 1) / 2);
      const rightX = x + w - 1;
      const bottomY = y + h - 1;

      // Top horizontal
      for (let c = x + apexW; c <= rightX - apexW; c++) {
        grid.set(c, y, chars.h, 'border', id);
      }
      // Bottom horizontal
      for (let c = x + apexW; c <= rightX - apexW; c++) {
        grid.set(c, bottomY, chars.h, 'border', id);
      }

      // Left and right apex points
      grid.set(x, cy, '<', 'border', id);
      grid.set(rightX, cy, '>', 'border', id);

      const slash = chars.diag_forward;
      const backslash = chars.diag_back;

      // Top-left and bottom-left slopes
      for (let r = 1; r < cy - y; r++) {
        const ratio = r / (cy - y);
        const c = Math.round(x + apexW * (1 - ratio));
        grid.set(c, cy - r, slash, 'border', id);
        grid.set(c, cy + r, backslash, 'border', id);
      }

      // Top-right and bottom-right slopes
      for (let r = 1; r < cy - y; r++) {
        const ratio = r / (cy - y);
        const c = Math.round(rightX - apexW * (1 - ratio));
        grid.set(c, cy - r, backslash, 'border', id);
        grid.set(c, cy + r, slash, 'border', id);
      }
    }

    /**
     * Draw Circle / Ellipse
     */
    drawCircle(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const rightX = x + w - 1;
      const bottomY = y + h - 1;
      const shoulderX = Math.max(1, Math.min(Math.floor(w / 4), 2));

      // Top horizontal
      for (let c = x + shoulderX; c <= rightX - shoulderX; c++) {
        grid.set(c, y, chars.h, 'border', id);
      }
      // Bottom horizontal
      for (let c = x + shoulderX; c <= rightX - shoulderX; c++) {
        grid.set(c, bottomY, chars.h, 'border', id);
      }

      // Shoulders / Corners
      grid.set(x + shoulderX - 1, y, chars.rounded_tl, 'border', id);
      grid.set(rightX - shoulderX + 1, y, chars.rounded_tr, 'border', id);
      grid.set(x + shoulderX - 1, bottomY, chars.rounded_bl, 'border', id);
      grid.set(rightX - shoulderX + 1, bottomY, chars.rounded_br, 'border', id);

      // Vertical sides
      for (let r = y + 1; r < bottomY; r++) {
        grid.set(x, r, chars.v, 'border', id);
        grid.set(rightX, r, chars.v, 'border', id);
      }
    }

    /**
     * Draw Triangle
     */
    drawTriangle(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const cx = x + Math.floor((w - 1) / 2);
      const bottomY = y + h - 1;
      const rightX = x + w - 1;

      // Base
      for (let c = x; c <= rightX; c++) {
        grid.set(c, bottomY, chars.h, 'border', id);
      }

      // Slopes
      for (let r = 1; r < h - 1; r++) {
        const ratio = r / (h - 1);
        const cLeft = Math.round(cx - (cx - x) * ratio);
        const cRight = Math.round(cx + (rightX - cx) * ratio);
        grid.set(cLeft, y + r, chars.diag_forward, 'border', id);
        grid.set(cRight, y + r, chars.diag_back, 'border', id);
      }

      // Peak
      grid.set(cx, y, '^', 'border', id);
    }

    /**
     * Draw Database Cylinder
     */
    drawDatabase(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const rightX = x + w - 1;
      const bottomY = y + h - 1;
      const tl = chars.rounded_tl || chars.tl;
      const tr = chars.rounded_tr || chars.tr;
      const bl = chars.rounded_bl || chars.bl;
      const br = chars.rounded_br || chars.br;

      // Top cylinder cap
      grid.set(x, y, tl, 'border', id);
      grid.set(rightX, y, tr, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        grid.set(c, y, chars.h, 'border', id);
      }

      // Mid-rim line (row 2 if h >= 5, else row 1)
      const rimY = h >= 5 ? y + 2 : y + 1;
      grid.set(x, rimY, chars.t_right, 'border', id);
      grid.set(rightX, rimY, chars.t_left, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        grid.set(c, rimY, chars.h, 'border', id);
      }

      // Vertical sides
      for (let r = y + 1; r < bottomY; r++) {
        if (r !== rimY) {
          grid.set(x, r, chars.v, 'border', id);
          grid.set(rightX, r, chars.v, 'border', id);
        }
      }

      // Bottom cylinder base
      grid.set(x, bottomY, bl, 'border', id);
      grid.set(rightX, bottomY, br, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        grid.set(c, bottomY, chars.h, 'border', id);
      }
    }

    /**
     * Draw Cloud shape with scalloped borders
     */
    drawCloud(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const rightX = x + w - 1;
      const bottomY = y + h - 1;
      const bump1End = x + Math.floor(w * 0.45);
      const bump2Start = bump1End;

      // Top arches
      grid.set(x + 2, y, chars.rounded_tl, 'border', id);
      for (let c = x + 3; c < bump1End - 1; c++) grid.set(c, y, chars.h, 'border', id);
      grid.set(bump1End - 1, y, chars.rounded_tr, 'border', id);

      grid.set(bump2Start + 1, y, chars.rounded_tl, 'border', id);
      for (let c = bump2Start + 2; c < rightX - 2; c++) grid.set(c, y, chars.h, 'border', id);
      grid.set(rightX - 2, y, chars.rounded_tr, 'border', id);

      // Sides: left and right lobes
      grid.set(x + 1, y + 1, '(', 'border', id);
      grid.set(rightX - 1, y + 1, ')', 'border', id);

      for (let r = y + 2; r < bottomY - 1; r++) {
        grid.set(x, r, '(', 'border', id);
        grid.set(rightX, r, ')', 'border', id);
      }

      grid.set(x + 1, bottomY - 1, '(', 'border', id);
      grid.set(rightX - 1, bottomY - 1, ')', 'border', id);

      // Bottom arches
      grid.set(x + 2, bottomY, chars.rounded_bl, 'border', id);
      for (let c = x + 3; c < bump1End - 1; c++) grid.set(c, bottomY, chars.h, 'border', id);
      grid.set(bump1End - 1, bottomY, chars.rounded_br, 'border', id);

      grid.set(bump2Start + 1, bottomY, chars.rounded_bl, 'border', id);
      for (let c = bump2Start + 2; c < rightX - 2; c++) grid.set(c, bottomY, chars.h, 'border', id);
      grid.set(rightX - 2, bottomY, chars.rounded_br, 'border', id);
    }

    /**
     * Draw Queue / Message Buffer with slots
     */
    drawQueue(grid, x, y, w, h, chars, id) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const rightX = x + w - 1;
      const bottomY = y + h - 1;
      const slotCols = [rightX - 6, rightX - 4, rightX - 2].filter(c => c > x + 3);

      // Top border
      grid.set(x, y, chars.tl, 'border', id);
      grid.set(rightX, y, chars.tr, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        if (slotCols.includes(c)) {
          grid.set(c, y, chars.t_down, 'border', id);
        } else {
          grid.set(c, y, chars.h, 'border', id);
        }
      }

      // Vertical sides and internal dividers
      for (let r = y + 1; r < bottomY; r++) {
        grid.set(x, r, chars.v, 'border', id);
        grid.set(rightX, r, chars.v, 'border', id);
        for (const sc of slotCols) {
          grid.set(sc, r, chars.v, 'border', id);
        }
      }

      // Bottom border
      grid.set(x, bottomY, chars.bl, 'border', id);
      grid.set(rightX, bottomY, chars.br, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        if (slotCols.includes(c)) {
          grid.set(c, bottomY, chars.t_up, 'border', id);
        } else {
          grid.set(c, bottomY, chars.h, 'border', id);
        }
      }
    }

    /**
     * Draw Subsystem Container / Boundary Box (preserves nested contents)
     */
    drawContainer(grid, x, y, w, h, chars, id) {
      const rightX = x + w - 1;
      const bottomY = y + h - 1;
      const dashH = chars.dash_h || '╌';
      const dashV = chars.dash_v || '╎';

      // Top edge
      grid.set(x, y, chars.tl, 'border', id);
      grid.set(rightX, y, chars.tr, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        grid.set(c, y, dashH, 'border', id);
      }

      // Left and right edges
      for (let r = y + 1; r < bottomY; r++) {
        grid.set(x, r, dashV, 'border', id);
        grid.set(rightX, r, dashV, 'border', id);
      }

      // Bottom edge
      grid.set(x, bottomY, chars.bl, 'border', id);
      grid.set(rightX, bottomY, chars.br, 'border', id);
      for (let c = x + 1; c < rightX; c++) {
        grid.set(c, bottomY, dashH, 'border', id);
      }
    }

    /**
     * Draw Note with clean dog-ear folded corner
     */
    renderNote(grid, note, chars) {
      const x = Math.round(note.x);
      const y = Math.round(note.y);
      const w = Math.max(4, Math.round(note.w));
      const h = Math.max(3, Math.round(note.h));
      const id = note.id;

      // Clear interior
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          grid.set(x + c, y + r, ' ', 'space', id);
        }
      }

      const foldW = Math.min(4, Math.max(2, Math.floor(w / 4)));
      const foldH = Math.min(2, Math.max(1, Math.floor(h / 3)));
      const foldX = x + w - 1 - foldW;
      const foldY = y + h - 1 - foldH;

      // Top edge
      grid.set(x, y, chars.tl, 'border', id);
      grid.set(x + w - 1, y, chars.tr, 'border', id);
      for (let c = 1; c < w - 1; c++) {
        grid.set(x + c, y, chars.h, 'border', id);
      }

      // Left edge
      for (let r = 1; r < h - 1; r++) {
        grid.set(x, y + r, chars.v, 'border', id);
      }
      grid.set(x, y + h - 1, chars.bl, 'border', id);

      // Bottom edge
      for (let c = x + 1; c < foldX; c++) {
        grid.set(c, y + h - 1, chars.h, 'border', id);
      }
      grid.set(foldX, y + h - 1, chars.t_up, 'border', id);
      for (let c = foldX + 1; c < x + w - 1; c++) {
        grid.set(c, y + h - 1, chars.h, 'border', id);
      }
      grid.set(x + w - 1, y + h - 1, chars.br, 'border', id);

      // Right edge
      for (let r = y + 1; r < foldY; r++) {
        grid.set(x + w - 1, r, chars.v, 'border', id);
      }

      // Dog-ear tab
      grid.set(foldX, foldY, chars.tl, 'border', id);
      for (let c = foldX + 1; c < x + w - 1; c++) {
        grid.set(c, foldY, chars.h, 'border', id);
      }
      grid.set(x + w - 1, foldY, chars.t_left, 'border', id);

      for (let r = foldY + 1; r < y + h - 1; r++) {
        grid.set(foldX, r, chars.v, 'border', id);
        grid.set(x + w - 1, r, chars.v, 'border', id);
      }

      // Render note text
      if (note.text) {
        this.renderShapeText(grid, note);
      }
    }

    /**
     * Render standalone text label
     */
    renderTextItem(grid, item) {
      const x = Math.round(item.x);
      const y = Math.round(item.y);
      const lines = String(item.text || '').split('\n');

      for (let r = 0; r < lines.length; r++) {
        const line = lines[r];
        for (let c = 0; c < line.length; c++) {
          grid.set(x + c, y + r, line[c], 'text', item.id);
        }
      }
    }

    /**
     * Draw a direct line (Horizontal, Vertical, or Diagonal)
     */
    drawLine(grid, x1, y1, x2, y2, chars, id, hasArrow = false) {
      if (y1 === y2) {
        // Horizontal
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        for (let c = minX; c <= maxX; c++) {
          grid.set(c, y1, chars.h, 'line', id);
        }
        if (hasArrow) {
          if (x2 > x1) grid.set(maxX, y1, chars.arrow_right, 'arrow', id);
          else grid.set(minX, y1, chars.arrow_left, 'arrow', id);
        }
      } else if (x1 === x2) {
        // Vertical
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        for (let r = minY; r <= maxY; r++) {
          grid.set(x1, r, chars.v, 'line', id);
        }
        if (hasArrow) {
          if (y2 > y1) grid.set(x1, maxY, chars.arrow_down, 'arrow', id);
          else grid.set(x1, minY, chars.arrow_up, 'arrow', id);
        }
      } else {
        // Diagonal line via Bresenham algorithm
        this.drawBresenhamLine(grid, x1, y1, x2, y2, chars, id, hasArrow);
      }
    }

    /**
     * Bresenham Line Drawing
     */
    drawBresenhamLine(grid, x0, y0, x1, y1, chars, id, hasArrow = false) {
      let dx = Math.abs(x1 - x0);
      let dy = Math.abs(y1 - y0);
      let sx = (x0 < x1) ? 1 : -1;
      let sy = (y0 < y1) ? 1 : -1;
      let err = dx - dy;

      let curX = x0;
      let curY = y0;

      while (true) {
        let charToUse = (sx * sy > 0) ? chars.diag_back : chars.diag_forward;
        if (curX === x1 && curY === y1 && hasArrow) {
          if (dx >= dy) {
            charToUse = (sx > 0) ? chars.arrow_right : chars.arrow_left;
          } else {
            charToUse = (sy > 0) ? chars.arrow_down : chars.arrow_up;
          }
        }
        grid.set(curX, curY, charToUse, 'line', id);

        if (curX === x1 && curY === y1) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; curX += sx; }
        if (e2 < dx) { err += dx; curY += sy; }
      }
    }

    /**
     * Render Orthogonal or Straight Connector with clean border junctions and customizable arrows
     */
    renderConnector(grid, conn, shapeMap, chars) {
      const routeInfo = this.resolveConnectorRouteInfo(conn, shapeMap);
      if (!routeInfo || !routeInfo.points || routeInfo.points.length < 2) return;

      const points = routeInfo.points;
      const id = conn.id;

      // Normalize arrow terminals
      let arrowStart = conn.arrowStart || 'none';
      let arrowEnd = conn.arrowEnd !== undefined ? conn.arrowEnd : 'triangle';
      if (arrowEnd === 'end') arrowEnd = 'triangle';
      else if (arrowEnd === 'both') { arrowEnd = 'triangle'; arrowStart = 'triangle'; }
      else if (arrowEnd === 'start') { arrowStart = 'triangle'; arrowEnd = 'none'; }

      // Get line characters based on line style
      const lineStyles = (LINE_STYLES[this.mode] || LINE_STYLES.unicode);
      const styleChars = (conn.style && lineStyles[conn.style]) ? lineStyles[conn.style] : { h: chars.h, v: chars.v, cross: chars.cross };
      const hChar = styleChars.h;
      const vChar = styleChars.v;

      // 1. Draw border junction at source shape if attached
      if (routeInfo.sourceJunction && conn.routing !== 'straight') {
        const j = routeInfo.sourceJunction;
        grid.set(j.x, j.y, j.char(chars), 'border', id);
      }

      // 2. Draw connector line segments
      if (conn.routing === 'straight') {
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          this.drawBresenhamLine(grid, p1.x, p1.y, p2.x, p2.y, { ...chars, h: hChar, v: vChar }, id, false);
        }
      } else {
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          if (p1.y === p2.y) {
            // Horizontal line
            const startX = Math.min(p1.x, p2.x);
            const endX = Math.max(p1.x, p2.x);
            for (let col = startX; col <= endX; col++) {
              grid.set(col, p1.y, hChar, 'line', id);
            }
          } else if (p1.x === p2.x) {
            // Vertical line
            const startY = Math.min(p1.y, p2.y);
            const endY = Math.max(p1.y, p2.y);
            for (let row = startY; row <= endY; row++) {
              grid.set(p1.x, row, vChar, 'line', id);
            }
          }
        }

        // 3. Draw corner turns
        for (let i = 1; i < points.length - 1; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const next = points[i + 1];

          const cornerChar = this.getCornerChar(prev, curr, next, chars);
          if (cornerChar) {
            grid.set(curr.x, curr.y, cornerChar, 'junction', id);
          }
        }
      }

      // 4. Place arrowheads (End and Start)
      if (arrowEnd && arrowEnd !== 'none' && points.length >= 2) {
        const lastPt = points[points.length - 1];
        const secondLastPt = points[points.length - 2];
        const arrowChar = this.getArrowheadChar(secondLastPt, lastPt, chars, arrowEnd);
        grid.set(lastPt.x, lastPt.y, arrowChar, 'arrow', id);
      }

      if (arrowStart && arrowStart !== 'none' && points.length >= 2) {
        const firstPt = points[0];
        const secondPt = points[1];
        const arrowChar = this.getArrowheadChar(secondPt, firstPt, chars, arrowStart);
        grid.set(firstPt.x, firstPt.y, arrowChar, 'arrow', id);
      }

      // 5. Render connector label if present
      if (conn.label && points.length >= 2) {
        this.renderConnectorLabel(grid, conn, points);
      }
    }

    /**
     * Determine corner character when changing direction
     */
    getCornerChar(pPrev, pCurr, pNext, chars) {
      const dInX = pCurr.x - pPrev.x;
      const dInY = pCurr.y - pPrev.y;
      const dOutX = pNext.x - pCurr.x;
      const dOutY = pNext.y - pCurr.y;

      const goingRight = dInX > 0;
      const goingLeft = dInX < 0;
      const goingDown = dInY > 0;
      const goingUp = dInY < 0;

      const turningDown = dOutY > 0;
      const turningUp = dOutY < 0;
      const turningRight = dOutX > 0;
      const turningLeft = dOutX < 0;

      if (this.mode === 'ascii') {
        return chars.cross; // '+'
      }

      // Unicode corner selection
      if (goingRight && turningDown) return chars.tr; // ┐
      if (goingRight && turningUp) return chars.br;   // ┘
      if (goingLeft && turningDown) return chars.tl;  // ┌
      if (goingLeft && turningUp) return chars.bl;    // └

      if (goingDown && turningRight) return chars.bl; // └
      if (goingDown && turningLeft) return chars.br;  // ┘
      if (goingUp && turningRight) return chars.tl;   // ┌
      if (goingUp && turningLeft) return chars.tr;    // ┐

      return chars.cross;
    }

    /**
     * Determine arrowhead character pointing towards pTarget with custom style
     */
    getArrowheadChar(pFrom, pTarget, chars, arrowType = 'triangle') {
      const modeKey = ARROW_HEADS[this.mode] ? this.mode : 'unicode';
      const shapeMap = ARROW_HEADS[modeKey] || ARROW_HEADS.unicode;
      const heads = shapeMap[arrowType] || shapeMap.triangle || { right: '►', left: '◄', down: '▼', up: '▲' };

      if (pTarget.x > pFrom.x) return heads.right;
      if (pTarget.x < pFrom.x) return heads.left;
      if (pTarget.y > pFrom.y) return heads.down;
      if (pTarget.y < pFrom.y) return heads.up;
      return heads.right;
    }

    /**
     * Resolve connector route, border junctions, and waypoints
     */
    resolveConnectorRouteInfo(conn, shapeMap) {
      const shapeFrom = conn.fromShapeId ? shapeMap.get(conn.fromShapeId) : null;
      const shapeTo = conn.toShapeId ? shapeMap.get(conn.toShapeId) : null;
      const hasArrow = conn.arrowEnd !== 'none';

      // 0. Straight direct line routing
      if (conn.routing === 'straight') {
        const pStart = shapeFrom ? this.getShapeAnchorPoint(shapeFrom, conn.fromAnchor || 'auto') : (conn.fromPoint ? { ...conn.fromPoint } : { x: 0, y: 0 });
        const pEnd = shapeTo ? this.getShapeAnchorPoint(shapeTo, conn.toAnchor || 'auto') : (conn.toPoint ? { ...conn.toPoint } : { x: 10, y: 10 });
        const points = (conn.waypoints && conn.waypoints.length > 0)
          ? [pStart, ...conn.waypoints, pEnd]
          : [pStart, pEnd];
        return { points, sourceJunction: null };
      }

      // 1. If connector has custom waypoints, route through them!
      if (conn.waypoints && conn.waypoints.length > 0) {
        let pStart = null;
        let sourceJunction = null;
        let chosenFrom = conn.fromAnchor || 'auto';

        if (shapeFrom) {
          if (chosenFrom === 'auto') {
            const firstWp = conn.waypoints[0];
            const sCenter = { x: shapeFrom.x + shapeFrom.w / 2, y: shapeFrom.y + shapeFrom.h / 2 };
            const dx = firstWp.x - sCenter.x;
            const dy = firstWp.y - sCenter.y;
            if (Math.abs(dx) >= Math.abs(dy)) chosenFrom = dx > 0 ? 'right' : 'left';
            else chosenFrom = dy > 0 ? 'bottom' : 'top';
          }
          const pBorder = this.getShapeAnchorPoint(shapeFrom, chosenFrom);
          pStart = { ...pBorder };
          const canJunc = (shapeFrom.type === 'rectangle' || shapeFrom.type === 'rounded-rectangle' || shapeFrom.type === 'note');
          if (chosenFrom === 'right') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_right }; pStart.x += 1; }
          else if (chosenFrom === 'bottom') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_up }; pStart.y += 1; }
          else if (chosenFrom === 'left') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_left }; pStart.x -= 1; }
          else if (chosenFrom === 'top') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_down }; pStart.y -= 1; }
        } else if (conn.fromPoint) {
          pStart = { ...conn.fromPoint };
        } else {
          pStart = { ...conn.waypoints[0] };
        }

        let pEnd = null;
        let chosenTo = conn.toAnchor || 'auto';

        if (shapeTo) {
          if (chosenTo === 'auto') {
            const lastWp = conn.waypoints[conn.waypoints.length - 1];
            const tCenter = { x: shapeTo.x + shapeTo.w / 2, y: shapeTo.y + shapeTo.h / 2 };
            const dx = lastWp.x - tCenter.x;
            const dy = lastWp.y - tCenter.y;
            if (Math.abs(dx) >= Math.abs(dy)) chosenTo = dx > 0 ? 'right' : 'left';
            else chosenTo = dy > 0 ? 'bottom' : 'top';
          }
          const pBorder = this.getShapeAnchorPoint(shapeTo, chosenTo);
          pEnd = { ...pBorder };
          if (hasArrow) {
            if (chosenTo === 'left') pEnd.x -= 1;
            else if (chosenTo === 'right') pEnd.x += 1;
            else if (chosenTo === 'top') pEnd.y -= 1;
            else if (chosenTo === 'bottom') pEnd.y += 1;
          }
        } else if (conn.toPoint) {
          pEnd = { ...conn.toPoint };
        } else {
          pEnd = { ...conn.waypoints[conn.waypoints.length - 1] };
        }

        const points = this.buildPathThroughWaypoints(pStart, conn.waypoints, pEnd);
        return { points, sourceJunction };
      }

      // 2. Both ends attached to shapes (Standard Auto Route)
      if (shapeFrom && shapeTo) {
        return this.calculateOptimalRouteInfo(shapeFrom, shapeTo, conn.fromAnchor || 'auto', conn.toAnchor || 'auto', hasArrow);
      }

      // 3. ShapeFrom attached, To is free point
      if (shapeFrom && conn.toPoint) {
        let chosenFrom = conn.fromAnchor || 'auto';
        if (chosenFrom === 'auto') {
          const sCenter = { x: shapeFrom.x + shapeFrom.w / 2, y: shapeFrom.y + shapeFrom.h / 2 };
          const dx = conn.toPoint.x - sCenter.x;
          const dy = conn.toPoint.y - sCenter.y;
          if (Math.abs(dx) >= Math.abs(dy)) chosenFrom = dx > 0 ? 'right' : 'left';
          else chosenFrom = dy > 0 ? 'bottom' : 'top';
        }
        const pBorder = this.getShapeAnchorPoint(shapeFrom, chosenFrom);
        const pStart = { ...pBorder };
        let sourceJunction = null;
        const canJunc = (shapeFrom.type === 'rectangle' || shapeFrom.type === 'rounded-rectangle' || shapeFrom.type === 'note');
        if (chosenFrom === 'right') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_right }; pStart.x += 1; }
        else if (chosenFrom === 'bottom') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_up }; pStart.y += 1; }
        else if (chosenFrom === 'left') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_left }; pStart.x -= 1; }
        else if (chosenFrom === 'top') { if (canJunc) sourceJunction = { x: pBorder.x, y: pBorder.y, char: (ch) => ch.t_down }; pStart.y -= 1; }

        const points = this.computeOrthogonalPath(pStart, conn.toPoint);
        return { points, sourceJunction };
      }

      // 4. ShapeTo attached, From is free point
      if (conn.fromPoint && shapeTo) {
        let chosenTo = conn.toAnchor || 'auto';
        if (chosenTo === 'auto') {
          const tCenter = { x: shapeTo.x + shapeTo.w / 2, y: shapeTo.y + shapeTo.h / 2 };
          const dx = conn.fromPoint.x - tCenter.x;
          const dy = conn.fromPoint.y - tCenter.y;
          if (Math.abs(dx) >= Math.abs(dy)) chosenTo = dx > 0 ? 'right' : 'left';
          else chosenTo = dy > 0 ? 'bottom' : 'top';
        }
        const pBorder = this.getShapeAnchorPoint(shapeTo, chosenTo);
        const pEnd = { ...pBorder };
        if (hasArrow) {
          if (chosenTo === 'left') pEnd.x -= 1;
          else if (chosenTo === 'right') pEnd.x += 1;
          else if (chosenTo === 'top') pEnd.y -= 1;
          else if (chosenTo === 'bottom') pEnd.y += 1;
        }

        const points = this.computeOrthogonalPath(conn.fromPoint, pEnd);
        return { points, sourceJunction: null };
      }

      // 5. Free line between two points
      if (conn.fromPoint && conn.toPoint) {
        const points = this.computeOrthogonalPath(conn.fromPoint, conn.toPoint);
        return { points, sourceJunction: null };
      }

      const points = conn.points || [];
      return { points, sourceJunction: null };
    }

    /**
     * Build an orthogonal path through a series of waypoints
     */
    buildPathThroughWaypoints(pStart, waypoints, pEnd) {
      const allPoints = [pStart, ...(waypoints || []), pEnd];
      const result = [allPoints[0]];

      for (let i = 0; i < allPoints.length - 1; i++) {
        const p1 = allPoints[i];
        const p2 = allPoints[i + 1];

        if (p1.x === p2.x || p1.y === p2.y) {
          result.push(p2);
        } else {
          result.push({ x: p2.x, y: p1.y });
          result.push(p2);
        }
      }

      return this.simplifyWaypoints(result);
    }

    /**
     * Calculate optimal route with clean start/end points outside shape borders
     */
    calculateOptimalRouteInfo(fromShape, toShape, fromAnchor, toAnchor, hasArrow = true) {
      const fX = Math.round(fromShape.x);
      const fY = Math.round(fromShape.y);
      const fW = Math.round(fromShape.w);
      const fH = Math.round(fromShape.h);

      const tX = Math.round(toShape.x);
      const tY = Math.round(toShape.y);
      const tW = Math.round(toShape.w);
      const tH = Math.round(toShape.h);

      const fRight = fX + fW - 1;
      const fBottom = fY + fH - 1;
      const tRight = tX + tW - 1;
      const tBottom = tY + tH - 1;

      const fCenter = { x: fX + Math.floor(fW / 2), y: fY + Math.floor(fH / 2) };
      const tCenter = { x: tX + Math.floor(tW / 2), y: tY + Math.floor(tH / 2) };

      // Auto-detect optimal anchors
      let chosenFrom = fromAnchor;
      let chosenTo = toAnchor;

      if (chosenFrom === 'auto' || chosenTo === 'auto') {
        const dx = tCenter.x - fCenter.x;
        const dy = tCenter.y - fCenter.y;

        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx > 0) {
            if (chosenFrom === 'auto') chosenFrom = 'right';
            if (chosenTo === 'auto') chosenTo = 'left';
          } else {
            if (chosenFrom === 'auto') chosenFrom = 'left';
            if (chosenTo === 'auto') chosenTo = 'right';
          }
        } else {
          if (dy > 0) {
            if (chosenFrom === 'auto') chosenFrom = 'bottom';
            if (chosenTo === 'auto') chosenTo = 'top';
          } else {
            if (chosenFrom === 'auto') chosenFrom = 'top';
            if (chosenTo === 'auto') chosenTo = 'bottom';
          }
        }
      }

      // Calculate anchor on border
      const pFromBorder = this.getShapeAnchorPoint(fromShape, chosenFrom);
      const pToBorder = this.getShapeAnchorPoint(toShape, chosenTo);

      // Determine junction on source shape border
      let sourceJunction = null;
      let pStart = { ...pFromBorder };
      const canHaveJunction = (fromShape.type === 'rectangle' || fromShape.type === 'rounded-rectangle' || fromShape.type === 'note');

      if (chosenFrom === 'right') {
        if (canHaveJunction) {
          sourceJunction = { x: pFromBorder.x, y: pFromBorder.y, char: (ch) => ch.t_right };
        }
        pStart.x += 1; // start outside border
      } else if (chosenFrom === 'bottom') {
        if (canHaveJunction) {
          sourceJunction = { x: pFromBorder.x, y: pFromBorder.y, char: (ch) => ch.t_up };
        }
        pStart.y += 1;
      } else if (chosenFrom === 'left') {
        if (canHaveJunction) {
          sourceJunction = { x: pFromBorder.x, y: pFromBorder.y, char: (ch) => ch.t_left };
        }
        pStart.x -= 1;
      } else if (chosenFrom === 'top') {
        if (canHaveJunction) {
          sourceJunction = { x: pFromBorder.x, y: pFromBorder.y, char: (ch) => ch.t_down };
        }
        pStart.y -= 1;
      }

      // Determine end point (arrowhead placed just before border)
      let pEnd = { ...pToBorder };
      if (hasArrow) {
        if (chosenTo === 'left') pEnd.x -= 1;
        else if (chosenTo === 'right') pEnd.x += 1;
        else if (chosenTo === 'top') pEnd.y -= 1;
        else if (chosenTo === 'bottom') pEnd.y += 1;
      }

      // Compute waypoints
      const waypoints = [pStart];

      if (chosenFrom === 'right' && chosenTo === 'left') {
        if (pEnd.x >= pStart.x) {
          const midX = Math.round((pStart.x + pEnd.x) / 2);
          if (pStart.y !== pEnd.y) {
            waypoints.push({ x: midX, y: pStart.y });
            waypoints.push({ x: midX, y: pEnd.y });
          }
        } else {
          const escapeX = pStart.x + 1;
          const avoidY = (pStart.y <= pEnd.y)
            ? Math.min(fY - 2, tY - 2)
            : Math.max(fBottom + 2, tBottom + 2);
          const approachX = pEnd.x - 1;

          waypoints.push({ x: escapeX, y: pStart.y });
          waypoints.push({ x: escapeX, y: avoidY });
          waypoints.push({ x: approachX, y: avoidY });
          waypoints.push({ x: approachX, y: pEnd.y });
        }
      } else if (chosenFrom === 'bottom' && chosenTo === 'top') {
        if (pEnd.y >= pStart.y) {
          const midY = Math.round((pStart.y + pEnd.y) / 2);
          if (pStart.x !== pEnd.x) {
            waypoints.push({ x: pStart.x, y: midY });
            waypoints.push({ x: pEnd.x, y: midY });
          }
        } else {
          const escapeY = pStart.y + 1;
          const avoidX = (pStart.x <= pEnd.x)
            ? Math.max(fRight + 2, tRight + 2)
            : Math.min(fX - 2, tX - 2);
          const approachY = pEnd.y - 1;

          waypoints.push({ x: pStart.x, y: escapeY });
          waypoints.push({ x: avoidX, y: escapeY });
          waypoints.push({ x: avoidX, y: approachY });
          waypoints.push({ x: pEnd.x, y: approachY });
        }
      } else if (chosenFrom === 'left' && chosenTo === 'right') {
        if (pEnd.x <= pStart.x) {
          const midX = Math.round((pStart.x + pEnd.x) / 2);
          if (pStart.y !== pEnd.y) {
            waypoints.push({ x: midX, y: pStart.y });
            waypoints.push({ x: midX, y: pEnd.y });
          }
        } else {
          const escapeX = pStart.x - 1;
          const avoidY = (pStart.y <= pEnd.y)
            ? Math.min(fY - 2, tY - 2)
            : Math.max(fBottom + 2, tBottom + 2);
          const approachX = pEnd.x + 1;

          waypoints.push({ x: escapeX, y: pStart.y });
          waypoints.push({ x: escapeX, y: avoidY });
          waypoints.push({ x: approachX, y: avoidY });
          waypoints.push({ x: approachX, y: pEnd.y });
        }
      } else if (chosenFrom === 'top' && chosenTo === 'bottom') {
        if (pEnd.y <= pStart.y) {
          const midY = Math.round((pStart.y + pEnd.y) / 2);
          if (pStart.x !== pEnd.x) {
            waypoints.push({ x: pStart.x, y: midY });
            waypoints.push({ x: pEnd.x, y: midY });
          }
        } else {
          const escapeY = pStart.y - 1;
          const avoidX = (pStart.x <= pEnd.x)
            ? Math.max(fRight + 2, tRight + 2)
            : Math.min(fX - 2, tX - 2);
          const approachY = pEnd.y + 1;

          waypoints.push({ x: pStart.x, y: escapeY });
          waypoints.push({ x: avoidX, y: escapeY });
          waypoints.push({ x: avoidX, y: approachY });
          waypoints.push({ x: pEnd.x, y: approachY });
        }
      } else if (chosenFrom === 'right' && chosenTo === 'top') {
        waypoints.push({ x: pEnd.x, y: pStart.y });
      } else if (chosenFrom === 'bottom' && chosenTo === 'left') {
        waypoints.push({ x: pStart.x, y: pEnd.y });
      } else if (chosenFrom === 'left' && chosenTo === 'bottom') {
        waypoints.push({ x: pEnd.x, y: pStart.y });
      } else if (chosenFrom === 'top' && chosenTo === 'right') {
        waypoints.push({ x: pStart.x, y: pEnd.y });
      } else {
        const midX = Math.round((pStart.x + pEnd.x) / 2);
        waypoints.push({ x: midX, y: pStart.y });
        waypoints.push({ x: midX, y: pEnd.y });
      }

      waypoints.push(pEnd);
      return {
        points: this.simplifyWaypoints(waypoints),
        sourceJunction
      };
    }

    /**
     * Compute waypoints for connector based on connected shapes or free points
     */
    resolveConnectorPoints(conn, shapeMap) {
      const info = this.resolveConnectorRouteInfo(conn, shapeMap);
      return info && info.points ? info.points : (conn.points || []);
    }

    /**
     * Get anchor point coordinates on shape border
     */
    getShapeAnchorPoint(shape, anchor) {
      const x = Math.round(shape.x);
      const y = Math.round(shape.y);
      const w = Math.round(shape.w);
      const h = Math.round(shape.h);

      if (shape.type === 'parallelogram') {
        const slant = Math.max(1, Math.min(Math.floor(w / 4), Math.floor((h - 1) / 2), 3));
        const midR = Math.floor((h - 1) / 2);
        const shift = Math.round(slant * (h - 1 - midR) / (h - 1));
        if (anchor === 'left') {
          return { x: x + shift, y: y + midR };
        }
        if (anchor === 'right') {
          return { x: x + w - 1 - slant + shift, y: y + midR };
        }
      }

      switch (anchor) {
        case 'top':
          return { x: x + Math.floor((w - 1) / 2), y: y };
        case 'bottom':
          return { x: x + Math.floor((w - 1) / 2), y: y + h - 1 };
        case 'left':
          return { x: x, y: y + Math.floor((h - 1) / 2) };
        case 'right':
        default:
          return { x: x + w - 1, y: y + Math.floor((h - 1) / 2) };
      }
    }

    /**
     * Compute standard orthogonal path between two free points
     */
    computeOrthogonalPath(p1, p2) {
      if (p1.x === p2.x || p1.y === p2.y) {
        return [p1, p2];
      }
      const midX = Math.round((p1.x + p2.x) / 2);
      return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
    }

    /**
     * Remove redundant collinear waypoints
     */
    simplifyWaypoints(pts) {
      if (pts.length <= 2) return pts;
      const result = [pts[0]];

      for (let i = 1; i < pts.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = pts[i];
        const next = pts[i + 1];

        if (curr.x === prev.x && curr.y === prev.y) continue;

        const isCollinearX = prev.x === curr.x && curr.x === next.x;
        const isCollinearY = prev.y === curr.y && curr.y === next.y;

        if (!isCollinearX && !isCollinearY) {
          result.push(curr);
        }
      }

      result.push(pts[pts.length - 1]);
      return result;
    }

    /**
     * Render connector label in the center of the longest segment
     */
    renderConnectorLabel(grid, conn, points) {
      let longestIndex = 0;
      let maxDist = -1;

      for (let i = 0; i < points.length - 1; i++) {
        const dist = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
        if (dist > maxDist) {
          maxDist = dist;
          longestIndex = i;
        }
      }

      const p1 = points[longestIndex];
      const p2 = points[longestIndex + 1];
      const midX = Math.round((p1.x + p2.x) / 2);
      const midY = Math.round((p1.y + p2.y) / 2);

      const label = ` ${conn.label.trim()} `;
      const startX = midX - Math.floor(label.length / 2);

      for (let i = 0; i < label.length; i++) {
        grid.set(startX + i, midY, label[i], 'text', conn.id);
      }
    }

    /**
     * Render multiline text centered/aligned inside a shape
     */
    renderShapeText(grid, shape) {
      if (!shape.text) return;

      const lines = String(shape.text).split('\n');
      const x = Math.round(shape.x);
      const y = Math.round(shape.y);
      const w = Math.round(shape.w);
      const h = Math.round(shape.h);

      let innerX = x + 1;
      let innerY = y + 1;
      let innerW = Math.max(1, w - 2);
      let innerH = Math.max(1, h - 2);

      if (shape.type === 'container') {
        const title = `[ ${shape.text.trim()} ]`;
        const startCol = x + 2;
        for (let c = 0; c < title.length && (startCol + c) < x + w - 2; c++) {
          grid.set(startCol + c, y, title[c], 'text', shape.id);
        }
        return;
      }

      if (shape.type === 'diamond' || shape.type === 'triangle') {
        innerW = Math.max(1, w - 6);
        innerX = x + 3;
      } else if (shape.type === 'database') {
        innerY = y + (h >= 5 ? 3 : 2);
        innerH = Math.max(1, h - (h >= 5 ? 4 : 3));
      } else if (shape.type === 'queue') {
        innerW = Math.max(1, w - 8);
      } else if (shape.type === 'cloud') {
        innerX = x + 2;
        innerW = Math.max(1, w - 4);
        innerY = y + 1;
        innerH = Math.max(1, h - 2);
      }

      const align = shape.textAlign || 'center';
      const valign = shape.textValign || 'middle';

      let startRow = innerY;
      if (valign === 'middle') {
        startRow = innerY + Math.max(0, Math.floor((innerH - lines.length) / 2));
      } else if (valign === 'bottom') {
        startRow = innerY + Math.max(0, innerH - lines.length);
      }

      for (let i = 0; i < lines.length; i++) {
        const targetRow = startRow + i;
        if (targetRow >= y + h - 1 && shape.type !== 'text') break;

        const line = lines[i];
        let startCol = innerX;

        if (align === 'center') {
          startCol = innerX + Math.max(0, Math.floor((innerW - line.length) / 2));
        } else if (align === 'right') {
          startCol = innerX + Math.max(0, innerW - line.length);
        }

        for (let c = 0; c < line.length; c++) {
          const targetCol = startCol + c;
          if (targetCol >= x + w - 1 && shape.type !== 'text') break;
          grid.set(targetCol, targetRow, line[c], 'text', shape.id);
        }
      }
    }

    /**
     * Render the diagram to a standalone SVG string
     */
    renderToSVG(diagram, options = {}) {
      const text = this.render(diagram, options);
      const lines = text.split('\n');
      const numRows = lines.length;
      let maxCols = 0;
      for (const line of lines) {
        if (line.length > maxCols) maxCols = line.length;
      }

      const fontSize = options.fontSize || 14;
      const charWidth = options.charWidth || (fontSize * 0.6);
      const lineHeight = options.lineHeight || (fontSize * 1.35);
      const padding = options.padding !== undefined ? options.padding : 20;

      const width = Math.max(120, Math.ceil(maxCols * charWidth + padding * 2));
      const height = Math.max(60, Math.ceil(numRows * lineHeight + padding * 2));

      const isDark = options.theme === 'dark';
      const bgColor = isDark ? '#1e1e24' : '#ffffff';
      const textColor = isDark ? '#eceff4' : '#2e3440';

      const escapeXml = (str) => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      let tspans = '';
      for (let r = 0; r < lines.length; r++) {
        const y = padding + (r + 1) * lineHeight - (lineHeight - fontSize) / 2;
        tspans += `    <tspan x="${padding}" y="${y.toFixed(1)}">${escapeXml(lines[r])}</tspan>\n`;
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .ascii-art {
      font-family: "SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", "Liberation Mono", monospace;
      font-size: ${fontSize}px;
      fill: ${textColor};
      white-space: pre;
    }
  </style>
  <rect width="100%" height="100%" fill="${bgColor}" rx="6" />
  <text class="ascii-art" xml:space="preserve">
${tspans}  </text>
</svg>`;
    }
  }

  // Export to global scope
  global.AsciiGrid = AsciiGrid;
  global.AsciiRenderer = AsciiRenderer;
  global.ASCII_CHAR_SETS = CHAR_SETS;

})(typeof window !== 'undefined' ? window : this);
