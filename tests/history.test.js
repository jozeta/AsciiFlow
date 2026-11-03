'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers');

const { AsciiHistory } = loadApp();

// The canvas records a snapshot after every change, so the top of the undo
// stack is always the current state.
function session() {
  const h = new AsciiHistory();
  let state = { n: 0 };
  h.push(state);
  const change = (n) => { state = { n }; h.push(state); };
  const undo = () => { const s = h.undo(state); if (s) state = s; return plain(state).n; };
  const redo = () => { const s = h.redo(state); if (s) state = s; return plain(state).n; };
  return { h, change, undo, redo, get n() { return state.n; } };
}

test('nothing to undo right after loading', () => {
  const s = session();
  assert.equal(s.h.canUndo(), false);
  assert.equal(s.undo(), 0);
});

test('one undo reverts one change', () => {
  const s = session();
  s.change(1);
  s.change(2);
  assert.equal(s.undo(), 1);
  assert.equal(s.undo(), 0);
  assert.equal(s.h.canUndo(), false);
});

test('redo walks forward again, and a new change clears redo', () => {
  const s = session();
  s.change(1);
  s.change(2);
  s.undo();
  s.undo();
  assert.equal(s.redo(), 1);
  assert.equal(s.redo(), 2);
  assert.equal(s.h.canRedo(), false);

  s.undo();
  s.change(5);
  assert.equal(s.h.canRedo(), false);
  assert.equal(s.undo(), 1);
});

test('unrecorded changes are undone first and can be redone', () => {
  const h = new AsciiHistory();
  h.push({ n: 0 });
  h.push({ n: 1 });
  // Live state changed without a snapshot
  assert.equal(plain(h.undo({ n: 9 })).n, 1);
  assert.equal(plain(h.redo()).n, 9);
});
