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

test('labels never hide arrowheads, junctions or other labels', () => {
  const flow = render(AsciiStorage.getSample('flowchart'), 'unicode');
  assert.match(flow, /─►│Issue JWT Token/, 'arrow into Grant Access is visible');
  assert.match(flow, /Yes/);

  const arch = render(AsciiStorage.getSample('architecture'), 'unicode');
  for (const label of ['HTTPS', 'gRPC', 'REST']) assert.ok(arch.includes(label), label);
  assert.match(arch, /├─────┤/, 'the split junction is visible');
});

test('labels that already fit on their line stay where they were', () => {
  const decision = render(AsciiStorage.getSample('decision'), 'unicode');
  assert.match(decision, />── Yes ─►</);
  assert.match(decision, /\n {40}No\n/);
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

// --- Routing around shapes ---------------------------------------------------

const { AsciiParser } = loadApp();
const plainJSON = (v) => JSON.parse(JSON.stringify(v));

function routeCheck(d) {
  const r = new AsciiRenderer();
  const map = new Map([...d.shapes, ...(d.notes || [])].map(s => [s.id, s]));
  const obstacles = r.routeObstacles(map);
  return d.connectors.filter(c => r.routeCrossesShapes(
    r.resolveConnectorPoints(c, map, d.connectors), obstacles, map.get(c.fromShapeId), map.get(c.toShapeId)));
}

test('a connector whose direct route would cross a shape goes around it', () => {
  const box = (id, x) => ({ id, type: 'rectangle', x, y: 2, w: 10, h: 5, text: id });
  const d = {
    shapes: [box('A', 2), box('Mid', 20), box('C', 40)],
    connectors: [{ id: 'c', fromShapeId: 'A', fromAnchor: 'auto', toShapeId: 'C', toAnchor: 'auto' }]
  };
  assert.equal(routeCheck(d).length, 0);
  for (const mode of ['unicode', 'ascii']) {
    const out = render(d, mode);
    assert.match(out, /Mid/, `${mode}: the middle box is intact`);
    assert.match(out, mode === 'unicode' ? /│ +Mid +│/ : /\| +Mid +\|/);
  }
});

test('an auto-anchored chain of every shape type avoids all shapes and shared sides', () => {
  const types = ['rectangle', 'rounded-rectangle', 'circle', 'diamond', 'parallelogram',
    'hexagon', 'triangle', 'database', 'cloud', 'queue'];
  const shapes = types.map((type, i) => ({
    id: type, type, x: 2 + (i % 4) * 30, y: 2 + Math.floor(i / 4) * 14, w: 20, h: 7, text: type.slice(0, 8)
  }));
  const connectors = [];
  for (let i = 0; i + 1 < types.length; i++) {
    connectors.push({ id: `c${i}`, fromShapeId: types[i], toShapeId: types[i + 1],
      fromAnchor: 'auto', toAnchor: 'auto', label: i % 3 === 0 ? `L${i}` : '' });
  }
  const d = { shapes, connectors, texts: [], notes: [] };
  assert.deepEqual(routeCheck(d).map(c => c.id), []);

  // No two connectors leave or enter a shape through the same cell
  const r = new AsciiRenderer();
  const map = new Map(shapes.map(s => [s.id, s]));
  const ends = connectors.flatMap(c => {
    const p = r.resolveConnectorPoints(c, map, connectors);
    return [`${p[0].x},${p[0].y}`, `${p[p.length - 1].x},${p[p.length - 1].y}`];
  });
  assert.equal(new Set(ends).size, ends.length);

  // And it re-imports to the same diagram
  for (const mode of ['unicode', 'ascii']) {
    r.setMode(mode);
    const first = r.render(d);
    const back = plainJSON(AsciiParser.parseAsciiToDiagram(first));
    assert.equal(back.connectors.filter(c => c.fromShapeId && c.toShapeId).length, connectors.length, mode);
    assert.equal(r.render(back), first, mode);
  }
});
