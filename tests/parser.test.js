'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain, twoBoxes } = require('./helpers');

const { AsciiRenderer, AsciiParser } = loadApp();

function roundTrip(mode) {
  const r = new AsciiRenderer();
  r.setMode(mode);
  return plain(AsciiParser.parseAsciiToDiagram(r.render(twoBoxes())));
}

test('ascii output re-imports as the same two boxes and a connector', () => {
  const back = roundTrip('ascii');
  const boxes = back.shapes.map(s => [s.type, s.w, s.h, s.text]);
  assert.deepEqual(boxes, [['rectangle', 12, 5, 'Alpha'], ['rectangle', 12, 5, 'Beta']]);
  assert.equal(back.connectors.length, 1);
});

// Known bug: in unicode mode the box the connector leaves from has a "├"
// T-junction in its border, and the importer then fails to recognise it as a
// box (only "Beta" comes back, plus stray connectors). Remove `todo` once fixed.
test('unicode output re-imports as the same two boxes and a connector', { todo: 'parser drops boxes with T-junction borders' }, () => {
  const back = roundTrip('unicode');
  assert.deepEqual(back.shapes.map(s => s.text), ['Alpha', 'Beta']);
  assert.equal(back.connectors.length, 1);
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
