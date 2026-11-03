'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, twoBoxes } = require('./helpers');

const { AsciiRenderer, AsciiStorage, SAMPLE_TEMPLATES } = loadApp();

function render(diagram, mode) {
  const r = new AsciiRenderer();
  r.setMode(mode);
  return r.render(diagram);
}

test('two connected boxes render as expected in unicode mode', () => {
  assert.equal(render(twoBoxes(), 'unicode'), [
    '',
    ' ┌──────────┐          ┌──────────┐',
    ' │          │          │          │',
    ' │  Alpha   ├─────────►│   Beta   │',
    ' │          │          │          │',
    ' └──────────┘          └──────────┘',
    ''
  ].join('\n'));
});

test('two connected boxes render as expected in ascii mode', () => {
  assert.equal(render(twoBoxes(), 'ascii'), [
    '',
    ' +----------+          +----------+',
    ' |          |          |          |',
    ' |  Alpha   +--------->|   Beta   |',
    ' |          |          |          |',
    ' +----------+          +----------+',
    ''
  ].join('\n'));
});

// The junction where a connector leaves a box has its stem on the side the
// connector goes: ┬ on a bottom border, ┴ on a top border (these were swapped).
test('connector junctions point the way the connector leaves', () => {
  const box = (id, y) => ({ id, type: 'rectangle', x: 2, y, w: 12, h: 5, text: id });
  const down = {
    shapes: [box('A', 2), box('B', 12)],
    connectors: [{ id: 'c', fromShapeId: 'A', fromAnchor: 'bottom', toShapeId: 'B', toAnchor: 'top' }]
  };
  const up = {
    shapes: [box('A', 2), box('B', 12)],
    connectors: [{ id: 'c', fromShapeId: 'B', fromAnchor: 'top', toShapeId: 'A', toAnchor: 'bottom' }]
  };
  assert.match(render(down, 'unicode'), /└────┬─────┘/);
  assert.match(render(up, 'unicode'), /┌────┴─────┐/);
  assert.match(render(down, 'ascii'), /\+----\+-----\+/);
});

// Free-floating connectors: a horizontal line, a vertical line crossing it,
// and a second vertical line that starts on it.
function meetingLines() {
  const line = (id, from, to) => ({ id, fromPoint: from, toPoint: to, arrowEnd: 'none' });
  return {
    shapes: [],
    connectors: [
      line('h', { x: 0, y: 3 }, { x: 10, y: 3 }),
      line('v', { x: 5, y: 0 }, { x: 5, y: 6 }),
      line('t', { x: 8, y: 3 }, { x: 8, y: 6 })
    ]
  };
}

test('connectors that cross or meet get junctions instead of overwriting each other', () => {
  const unicode = render(meetingLines(), 'unicode').split('\n');
  const row = unicode.find(l => l.includes('┼'));
  assert.ok(row, 'crossing becomes ┼');
  assert.match(row, /─┼──┬─/, 'line starting on another becomes ┬');

  const ascii = render(meetingLines(), 'ascii').split('\n');
  assert.ok(ascii.some(l => /-\+--\+-/.test(l)), 'ascii uses + for both');
});

test("a connector starting on another's arrowhead does not erase it", () => {
  const box = (id, y) => ({ id, type: 'rectangle', x: 2, y, w: 12, h: 5, text: id });
  const d = {
    shapes: [box('A', 2), box('B', 12)],
    connectors: [
      { id: 'in', fromShapeId: 'A', fromAnchor: 'bottom', toShapeId: 'B', toAnchor: 'top' },
      { id: 'out', fromShapeId: 'B', fromAnchor: 'top', toPoint: { x: 30, y: 9 } }
    ]
  };
  assert.match(render(d, 'unicode'), /▼─+┘/);
  assert.match(render(d, 'ascii'), /v-+\+/);
});

for (const key of Object.keys(SAMPLE_TEMPLATES)) {
  test(`template "${key}" renders in both modes`, () => {
    const d = AsciiStorage.getSample(key);
    const ascii = render(d, 'ascii');
    const unicode = render(d, 'unicode');

    assert.ok(ascii.trim().length > 0);
    assert.doesNotMatch(ascii, /[^\x00-\x7f]/, 'ascii mode must emit only ASCII');
    assert.match(unicode, /[─│┌┐└┘╭╮╰╯]/, 'unicode mode uses box-drawing characters');

    for (const out of [ascii, unicode]) {
      for (const line of out.split('\n')) {
        assert.equal(line, line.trimEnd(), 'trailing whitespace is trimmed');
      }
      for (const shape of d.shapes) {
        const firstLine = String(shape.text || '').split('\n')[0];
        if (firstLine) assert.ok(out.includes(firstLine), `text "${firstLine}" is not overwritten`);
      }
    }
  });
}

test('a diagram at the clamped limits still renders', () => {
  const d = AsciiStorage.normalizeDiagram({
    shapes: [
      { id: 'a', type: 'rectangle', x: -1e9, y: -1e9, w: 4, h: 3 },
      { id: 'b', type: 'rectangle', x: 1e9, y: 1e9, w: 4, h: 3 }
    ]
  });
  const lines = render(d, 'ascii').split('\n');
  assert.ok(lines.length <= 2100);
});
