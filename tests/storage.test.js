'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers');

const { AsciiStorage, SAMPLE_TEMPLATES, AsciiShapes, AsciiConnectors } = loadApp();
const normalize = (d) => plain(AsciiStorage.normalizeDiagram(d));
const LISTS = ['shapes', 'connectors', 'texts', 'notes'];

test('valid diagrams pass through unchanged (old share links keep working)', () => {
  for (const [key, sample] of Object.entries(SAMPLE_TEMPLATES)) {
    const out = normalize(sample);
    for (const list of LISTS) {
      assert.equal(JSON.stringify(out[list]), JSON.stringify(sample[list]), `${key}.${list}`);
    }
    assert.equal(out.mode, sample.mode || 'unicode');
  }
});

test('items made by the shape and connector factories pass through unchanged', () => {
  const shape = plain(AsciiShapes.createShape('container', 3, 4, 30, 10, 'VPC'));
  const note = plain(AsciiShapes.createNote(1, 1));
  const text = plain(AsciiShapes.createText(5, 5, 'two\nlines'));
  const conn = plain(AsciiConnectors.createConnector(shape.id, note.id, 'right', 'left', {
    waypoints: [{ x: 10, y: 2 }], label: 'calls', style: 'dashed', fromPoint: { x: 1, y: 2 }
  }));
  const d = { shapes: [shape], notes: [note], texts: [text], connectors: [conn] };
  const out = normalize(d);
  for (const list of LISTS) assert.deepEqual(out[list], d[list], list);
});

test('rejects input that is not a diagram object', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.throws(() => AsciiStorage.normalizeDiagram(bad), /Invalid diagram data/);
  }
});

test('non-array lists and non-object items are dropped', () => {
  const out = normalize({ shapes: 'nope', connectors: [null, 3, 'x', [], { id: 'c1' }] });
  assert.deepEqual(out.shapes, []);
  assert.deepEqual(out.connectors, [{ id: 'c1' }]);
  assert.deepEqual(out.texts, []);
});

test('unknown mode falls back to unicode', () => {
  assert.equal(normalize({ mode: '<script>' }).mode, 'unicode');
  assert.equal(normalize({ mode: 'ascii' }).mode, 'ascii');
});

test('huge or invalid geometry is clamped so the render grid stays bounded', () => {
  const out = normalize({
    shapes: [{ id: 's', type: 'rectangle', x: 1e9, y: -1e9, w: 1e7, h: 'NaN' }]
  });
  assert.deepEqual(out.shapes[0], { id: 's', type: 'rectangle', x: 1000, y: -1000, w: 500, h: 1 });

  const missing = normalize({ shapes: [{ id: 's', type: 'rectangle' }] });
  assert.equal(missing.shapes[0].x, 0);
  assert.equal(missing.shapes[0].y, 0);
});

test('connector points and waypoints are validated and capped', () => {
  const waypoints = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i }));
  waypoints[0] = { x: 'a', y: 1 };
  const out = normalize({
    connectors: [{ id: 'c', fromPoint: { x: 5e6, y: 2 }, toPoint: 'nope', waypoints }]
  }).connectors[0];
  assert.deepEqual(out.fromPoint, { x: 1000, y: 2 });
  assert.equal(out.toPoint, null);
  assert.equal(out.waypoints.length, 199); // first 200 kept, the invalid one removed
  assert.deepEqual(out.waypoints[0], { x: 1, y: 1 });
});

test('unexpected value types are dropped and strings are length-limited', () => {
  const out = normalize({
    name: 'n'.repeat(1000),
    shapes: [{
      id: { evil: true }, type: 'rectangle', x: 1, y: 1, style: ['dashed'],
      onclick: () => 1, nested: { a: 1 }, groupId: null, flag: true,
      text: 't'.repeat(10000)
    }]
  });
  const s = out.shapes[0];
  assert.equal(out.name.length, 200);
  assert.equal(s.id, 'shape_imported_0');
  assert.equal('style' in s, false);
  assert.equal('nested' in s, false);
  assert.equal(s.groupId, null);
  assert.equal(s.flag, true);
  assert.equal(s.text.length, 5000);
});

test('prototype keys from JSON.parse are not copied', () => {
  const parsed = JSON.parse('{"shapes":[{"id":"s","x":1,"y":1,"__proto__":{"polluted":1}}]}');
  const out = AsciiStorage.normalizeDiagram(parsed);
  assert.equal(Object.prototype.hasOwnProperty.call(out.shapes[0], '__proto__'), false);
  assert.equal({}.polluted, undefined);
});

test('item and waypoint counts are capped', () => {
  const shapes = Array.from({ length: 2500 }, (_, i) => ({ id: `s${i}`, x: 0, y: 0 }));
  assert.equal(normalize({ shapes }).shapes.length, 2000);
});
