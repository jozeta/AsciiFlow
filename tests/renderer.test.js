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
