'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain, twoBoxes } = require('./helpers');

const { AsciiRenderer, AsciiParser } = loadApp();

function roundTrip(diagram, mode) {
  const r = new AsciiRenderer();
  r.setMode(mode);
  return plain(AsciiParser.parseAsciiToDiagram(r.render(diagram)));
}

const boxesOf = (d) => d.shapes.map(s => [s.type, s.x, s.y, s.w, s.h, s.text]);

// Three boxes with connectors leaving through the bottom, right and top
// borders, so every T-junction orientation ends up in a box border.
function threeBoxes() {
  return {
    shapes: [
      { id: 'a', type: 'rectangle', x: 2, y: 2, w: 12, h: 5, text: 'Alpha' },
      { id: 'b', type: 'rectangle', x: 2, y: 12, w: 12, h: 5, text: 'Beta' },
      { id: 'g', type: 'rectangle', x: 24, y: 12, w: 12, h: 5, text: 'Gamma' }
    ],
    connectors: [
      { id: 'c1', fromShapeId: 'a', fromAnchor: 'bottom', toShapeId: 'b', toAnchor: 'top' },
      { id: 'c2', fromShapeId: 'b', fromAnchor: 'right', toShapeId: 'g', toAnchor: 'left' },
      { id: 'c3', fromShapeId: 'g', fromAnchor: 'top', toShapeId: 'a', toAnchor: 'right' }
    ],
    texts: [],
    notes: []
  };
}

for (const mode of ['ascii', 'unicode', 'unicode-curved']) {
  const type = mode === 'unicode-curved' ? 'rounded-rectangle' : 'rectangle';

  test(`${mode} output re-imports as the same two boxes and a connector`, () => {
    const back = roundTrip(twoBoxes(), mode);
    assert.deepEqual(back.shapes.map(s => [s.type, s.w, s.h, s.text]),
      [[type, 12, 5, 'Alpha'], [type, 12, 5, 'Beta']]);
    assert.equal(back.connectors.length, 1);
  });

  // Regression: unicode borders with a connector attached contain T-junctions
  // (├ ┤ ┬ ┴) and those boxes used to be dropped on import.
  test(`${mode} output keeps boxes whose borders carry T-junctions`, () => {
    const back = roundTrip(threeBoxes(), mode);
    assert.deepEqual(back.shapes.map(s => s.text), ['Alpha', 'Beta', 'Gamma']);
  });
}

test('unicode and ascii output re-import to the same boxes', () => {
  const ascii = roundTrip(threeBoxes(), 'ascii');
  const unicode = roundTrip(threeBoxes(), 'unicode');
  assert.deepEqual(boxesOf(unicode), boxesOf(ascii));
  assert.equal(unicode.connectors.length, ascii.connectors.length);
});

test('boxes with dashed unicode borders are recognised as containers', () => {
  const back = plain(AsciiParser.parseAsciiToDiagram([
    '┌┄┄┄┄┄┄┐',
    '┆ Edge ├───',
    '└┄┄┄┄┄┄┘'
  ].join('\n')));
  assert.deepEqual(back.shapes.map(s => [s.type, s.w, s.h]), [['container', 8, 3]]);
  assert.deepEqual(back.texts.map(t => t.text), ['Edge']);
  assert.equal(back.connectors[0].fromShapeId, back.shapes[0].id);
});

test('mermaid graph TD import builds shapes and labelled edges', () => {
  const d = plain(AsciiParser.parseMermaidToDiagram([
    'graph TD',
    '  A[Start] --> B{Ok?}',
    '  B -->|yes| C[Done]'
  ].join('\n')));

  const byId = Object.fromEntries(d.shapes.map(s => [s.id, s]));
  assert.equal(byId.A.type, 'rectangle');
  assert.equal(byId.A.text, 'Start');
  assert.equal(byId.B.type, 'diamond');
  assert.equal(byId.C.text, 'Done');

  assert.equal(d.connectors.length, 2);
  const yes = d.connectors.find(c => c.fromShapeId === 'B' && c.toShapeId === 'C');
  assert.ok(yes, 'B --> C edge exists');
  assert.equal(yes.label, 'yes');

  assert.ok(byId.A.y < byId.B.y && byId.B.y < byId.C.y, 'TD layout stacks top to bottom');
});

// --- Shapes, bent connectors, labels and text ------------------------------

const { AsciiStorage, SAMPLE_TEMPLATES } = loadApp();
const parse = (text) => plain(AsciiParser.parseAsciiToDiagram(text));
const shapeSummary = (d) => [...plain(d.shapes), ...plain(d.notes || [])]
  .map(s => `${s.type}:${s.text}`).sort();
const labelsOf = (d) => plain(d.connectors).map(c => c.label).filter(Boolean).sort();

for (const key of Object.keys(SAMPLE_TEMPLATES)) {
  for (const mode of ['unicode', 'ascii']) {
    test(`template "${key}" (${mode}) re-imports with every shape, note and connector`, () => {
      const r = new AsciiRenderer();
      r.setMode(mode);
      const src = AsciiStorage.getSample(key);
      const back = parse(r.render(src));
      assert.deepEqual(shapeSummary(back), shapeSummary(src));
      assert.equal(back.connectors.length, src.connectors.length);
      // Every connector is attached at both ends
      for (const c of back.connectors) {
        assert.ok(c.fromShapeId || c.fromPoint, 'has a start');
        assert.ok(c.toShapeId, `${c.id} ends on a shape`);
      }
    });
  }
}

test('templates whose labels survive rendering keep them on re-import', () => {
  for (const key of ['flowchart', 'decision']) {
    const r = new AsciiRenderer();
    r.setMode('unicode');
    const src = AsciiStorage.getSample(key);
    assert.deepEqual(labelsOf(parse(r.render(src))), labelsOf(src), key);
  }
});

test('the decision template re-renders identically after re-import', () => {
  for (const mode of ['unicode', 'ascii']) {
    const r = new AsciiRenderer();
    r.setMode(mode);
    const first = r.render(AsciiStorage.getSample('decision'));
    assert.equal(r.render(parse(first)), first, mode);
  }
});

test('a bent connector between two boxes is one connector', () => {
  const d = parse([
    '+-------+',
    '| Start |',
    '+---+---+',
    '    |',
    '    +--------+',
    '             |',
    '             v',
    '         +-------+',
    '         |  End  |',
    '         +-------+'
  ].join('\n'));
  assert.deepEqual(d.shapes.map(s => s.text), ['Start', 'End']);
  assert.equal(d.connectors.length, 1);
  const [c] = d.connectors;
  assert.equal(c.fromShapeId, d.shapes[0].id);
  assert.equal(c.fromAnchor, 'bottom');
  assert.equal(c.toShapeId, d.shapes[1].id);
  assert.equal(c.toAnchor, 'top');
  assert.equal(c.arrowEnd, 'triangle');
});

test('a bent connector with a free end keeps its corners as waypoints', () => {
  const d = parse([
    '┌────┐',
    '│ A  ├────┐',
    '└────┘    │',
    '          ▼'
  ].join('\n'));
  assert.equal(d.connectors.length, 1);
  const [c] = d.connectors;
  assert.equal(c.fromShapeId, d.shapes[0].id);
  assert.equal(c.fromAnchor, 'right');
  assert.deepEqual(c.toPoint, { x: 10, y: 3 });
  assert.deepEqual(c.waypoints, [{ x: 10, y: 1 }]);
  assert.equal(c.arrowEnd, 'triangle');
});

test('crossing connectors are traced straight through the crossing', () => {
  const d = parse([
    '      │',
    '──────┼──────►',
    '      │',
    '      ▼'
  ].join('\n'));
  assert.equal(d.connectors.length, 2);
  assert.deepEqual(d.connectors.map(c => c.waypoints.length), [0, 0]);
});

test('diamonds, parallelograms, circles and notes are recognised', () => {
  const r = new AsciiRenderer();
  const src = {
    shapes: [
      { id: 'd', type: 'diamond', x: 2, y: 2, w: 17, h: 7, text: 'Ok?' },
      { id: 'p', type: 'parallelogram', x: 24, y: 3, w: 20, h: 5, text: 'Input' },
      { id: 'c', type: 'circle', x: 50, y: 3, w: 18, h: 5, text: 'DB' }
    ],
    notes: [{ id: 'n', type: 'note', x: 2, y: 12, w: 22, h: 6, text: 'Remember' }],
    connectors: [],
    texts: []
  };
  for (const mode of ['unicode', 'ascii']) {
    r.setMode(mode);
    const back = parse(r.render(src));
    assert.deepEqual(shapeSummary(back), shapeSummary(src), mode);
    // Geometry matches (offset by the renderer's one-cell margin)
    const dx = src.shapes[0].x - back.shapes.find(s => s.type === 'diamond').x;
    for (const s of [...src.shapes, ...src.notes]) {
      const b = [...back.shapes, ...back.notes].find(x => x.type === s.type);
      assert.deepEqual([b.x + dx, b.w, b.h], [s.x, s.w, s.h], `${mode} ${s.type}`);
    }
  }
});

test('a titled container keeps its title and the shapes nested inside it', () => {
  const r = new AsciiRenderer();
  r.setMode('unicode');
  const back = parse(r.render({
    shapes: [
      { id: 'vpc', type: 'container', x: 1, y: 1, w: 30, h: 9, text: 'VPC' },
      { id: 'api', type: 'rectangle', x: 5, y: 3, w: 12, h: 4, text: 'API' }
    ],
    connectors: [], texts: [], notes: []
  }));
  assert.deepEqual(back.shapes.map(s => [s.type, s.text]), [['container', 'VPC'], ['rectangle', 'API']]);
});

test('text outside shapes is kept as text items', () => {
  const d = parse([
    'Legend: dashed = async',
    '',
    '┌────┐',
    '│ A  │',
    '└────┘'
  ].join('\n'));
  assert.deepEqual(d.texts.map(t => [t.x, t.y, t.text]), [[0, 0, 'Legend: dashed = async']]);
});
