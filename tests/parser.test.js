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

test('boxes with dashed unicode borders are recognised', () => {
  const back = plain(AsciiParser.parseAsciiToDiagram([
    '┌┄┄┄┄┄┄┐',
    '┆ Edge ├───',
    '└┄┄┄┄┄┄┘'
  ].join('\n')));
  assert.deepEqual(back.shapes.map(s => [s.w, s.h, s.text]), [[8, 3, 'Edge']]);
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
