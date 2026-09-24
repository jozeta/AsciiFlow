/**
 * AsciiFlow - Shapes Module
 * Shape factories, geometry math, hit-testing, and anchor calculation.
 */

(function (global) {
  'use strict';

  let nextIdCounter = 1;

  function generateId(prefix = 'shape') {
    return `${prefix}_${Date.now().toString(36)}_${(nextIdCounter++).toString(36)}`;
  }

  // Minimum and default dimensions per shape type (in character cells)
  const SHAPE_CONFIGS = {
    'rectangle': { defaultW: 18, defaultH: 5, minW: 4, minH: 3 },
    'rounded-rectangle': { defaultW: 18, defaultH: 5, minW: 4, minH: 3 },
    'circle': { defaultW: 18, defaultH: 5, minW: 6, minH: 3 },
    'diamond': { defaultW: 17, defaultH: 7, minW: 7, minH: 5 },
    'parallelogram': { defaultW: 20, defaultH: 5, minW: 8, minH: 3 },
    'hexagon': { defaultW: 20, defaultH: 5, minW: 8, minH: 3 },
    'triangle': { defaultW: 17, defaultH: 6, minW: 5, minH: 3 },
    'database': { defaultW: 18, defaultH: 6, minW: 8, minH: 4 },
    'cloud': { defaultW: 22, defaultH: 6, minW: 10, minH: 4 },
    'queue': { defaultW: 20, defaultH: 4, minW: 8, minH: 3 },
    'container': { defaultW: 32, defaultH: 12, minW: 12, minH: 6 },
    'note': { defaultW: 22, defaultH: 6, minW: 6, minH: 4 },
    'text': { defaultW: 12, defaultH: 1, minW: 1, minH: 1 },
    'line': { defaultW: 14, defaultH: 1, minW: 2, minH: 1 },
    'arrow': { defaultW: 14, defaultH: 1, minW: 2, minH: 1 }
  };

  /**
   * Factory function to create a new shape object
   */
  function createShape(type, x, y, w = null, h = null, text = '', options = {}) {
    const config = SHAPE_CONFIGS[type] || SHAPE_CONFIGS['rectangle'];
    const finalW = w !== null ? Math.max(config.minW, Math.round(w)) : config.defaultW;
    const finalH = h !== null ? Math.max(config.minH, Math.round(h)) : config.defaultH;

    return {
      id: options.id || generateId(type),
      type: type || 'rectangle',
      x: Math.round(x),
      y: Math.round(y),
      w: finalW,
      h: finalH,
      text: text || '',
      textAlign: options.textAlign || (type === 'container' ? 'left' : 'center'), // 'left' | 'center' | 'right'
      textValign: options.textValign || (type === 'container' ? 'top' : 'middle'), // 'top' | 'middle' | 'bottom'
      style: options.style || 'default', // 'default' | 'dashed' | 'double'
      groupId: options.groupId || null,
      ...options
    };
  }

  /**
   * Create a standalone note
   */
  function createNote(x, y, w = 22, h = 6, text = 'Note:\n', options = {}) {
    return createShape('note', x, y, w, h, text, {
      textAlign: 'left',
      textValign: 'top',
      ...options
    });
  }

  /**
   * Create standalone text label
   */
  function createText(x, y, text = 'Text Label', options = {}) {
    const lines = String(text).split('\n');
    const maxLineLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
    return {
      id: options.id || generateId('text'),
      type: 'text',
      x: Math.round(x),
      y: Math.round(y),
      w: Math.max(1, maxLineLen),
      h: Math.max(1, lines.length),
      text: text,
      textAlign: options.textAlign || 'left',
      ...options
    };
  }

  /**
   * Get the four standard border anchor points for a shape
   */
  function getAnchorPoints(shape) {
    const x = Math.round(shape.x);
    const y = Math.round(shape.y);
    const w = Math.round(shape.w);
    const h = Math.round(shape.h);

    if (shape.type === 'parallelogram') {
      const slant = Math.max(1, Math.min(Math.floor(w / 4), Math.floor((h - 1) / 2), 3));
      const midR = Math.floor((h - 1) / 2);
      const shift = Math.round(slant * (h - 1 - midR) / (h - 1));
      return {
        top: { x: x + Math.floor((w - 1) / 2), y: y, anchor: 'top' },
        bottom: { x: x + Math.floor((w - 1) / 2), y: y + h - 1, anchor: 'bottom' },
        left: { x: x + shift, y: y + midR, anchor: 'left' },
        right: { x: x + w - 1 - slant + shift, y: y + midR, anchor: 'right' }
      };
    }

    return {
      top: { x: x + Math.floor((w - 1) / 2), y: y, anchor: 'top' },
      bottom: { x: x + Math.floor((w - 1) / 2), y: y + h - 1, anchor: 'bottom' },
      left: { x: x, y: y + Math.floor((h - 1) / 2), anchor: 'left' },
      right: { x: x + w - 1, y: y + Math.floor((h - 1) / 2), anchor: 'right' }
    };
  }

  /**
   * Check if a grid point (col, row) hits a shape
   */
  function hitTestShape(shape, col, row) {
    const x = shape.x;
    const y = shape.y;
    const w = shape.w;
    const h = shape.h;

    if (shape.type === 'line' || shape.type === 'arrow') {
      const minX = Math.min(x, x + w - 1);
      const maxX = Math.max(x, x + w - 1);
      const minY = Math.min(y, y + h - 1);
      const maxY = Math.max(y, y + h - 1);

      if (minY === maxY) {
        return row === minY && col >= minX - 1 && col <= maxX + 1;
      }
      if (minX === maxX) {
        return col === minX && row >= minY - 1 && row <= maxY + 1;
      }
      return col >= minX && col <= maxX && row >= minY && row <= maxY;
    }

    return col >= x && col < x + w && row >= y && row < y + h;
  }

  /**
   * Check if (col, row) hits any of the shape's anchor points
   */
  function hitTestAnchors(shape, col, row, tolerance = 1) {
    if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'text') {
      return null;
    }

    const anchors = getAnchorPoints(shape);
    for (const key of ['top', 'bottom', 'left', 'right']) {
      const pt = anchors[key];
      const dist = Math.hypot(pt.x - col, pt.y - row);
      if (dist <= tolerance) {
        return { anchor: key, ...pt };
      }
    }
    return null;
  }

  /**
   * Auto-fit shape width and height to fit its multiline text content
   */
  function autoFitShape(shape) {
    if (!shape.text || shape.type === 'line' || shape.type === 'arrow') {
      return;
    }

    const lines = String(shape.text).split('\n');
    const maxLineLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const lineCount = lines.length;

    let paddingW = 4; // 1 border + 1 space on each side
    let paddingH = 2; // 1 top border + 1 bottom border

    if (shape.type === 'diamond' || shape.type === 'hexagon') {
      paddingW = 8;
      paddingH = 4;
    } else if (shape.type === 'circle') {
      paddingW = 6;
      paddingH = 2;
    } else if (shape.type === 'note') {
      paddingW = 4;
      paddingH = 3;
    }

    const newW = Math.max(shape.w, maxLineLen + paddingW);
    const newH = Math.max(shape.h, lineCount + paddingH);

    shape.w = newW;
    shape.h = newH;
  }

  /**
   * Duplicate a shape with offset
   */
  function duplicateShape(shape, offsetCol = 2, offsetRow = 2) {
    return {
      ...JSON.parse(JSON.stringify(shape)),
      id: generateId(shape.type || 'shape'),
      x: shape.x + offsetCol,
      y: shape.y + offsetRow
    };
  }

  /**
   * Group a set of shapes together
   */
  function groupShapes(shapes) {
    if (!shapes || shapes.length < 2) return null;
    const groupId = `grp_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    shapes.forEach(s => { s.groupId = groupId; });
    return groupId;
  }

  /**
   * Ungroup a set of shapes
   */
  function ungroupShapes(shapes) {
    if (!shapes) return;
    shapes.forEach(s => { s.groupId = null; });
  }

  // Export to global
  global.AsciiShapes = {
    generateId,
    createShape,
    createNote,
    createText,
    getAnchorPoints,
    hitTestShape,
    hitTestAnchors,
    autoFitShape,
    duplicateShape,
    groupShapes,
    ungroupShapes,
    SHAPE_CONFIGS
  };

})(typeof window !== 'undefined' ? window : this);
