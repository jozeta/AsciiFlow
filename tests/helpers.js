// Loads the browser scripts into a Node vm context, the same way index.html
// loads them into window. Each call returns a fresh, isolated context.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPTS = ['parser', 'renderer', 'shapes', 'connectors', 'history', 'storage'];

function loadApp() {
  const ctx = vm.createContext({ console });
  for (const name of SCRIPTS) {
    const file = path.join(__dirname, '..', 'js', `${name}.js`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

// Objects created inside the vm have that context's prototypes, which makes
// assert.deepStrictEqual fail on otherwise identical values. Compare as JSON.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Two boxes joined by one connector: the smallest diagram that exercises
// borders, routing, a border T-junction, an arrowhead and text.
function twoBoxes() {
  return {
    shapes: [
      { id: 'a', type: 'rectangle', x: 2, y: 2, w: 12, h: 5, text: 'Alpha' },
      { id: 'b', type: 'rectangle', x: 24, y: 2, w: 12, h: 5, text: 'Beta' }
    ],
    connectors: [
      { id: 'c', type: 'connector', fromShapeId: 'a', fromAnchor: 'right',
        toShapeId: 'b', toAnchor: 'left', arrowEnd: 'triangle' }
    ],
    texts: [],
    notes: []
  };
}

module.exports = { loadApp, plain, twoBoxes };
