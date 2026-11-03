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

test('every template keeps its connector labels on re-import', () => {
  for (const key of Object.keys(SAMPLE_TEMPLATES)) {
    const r = new AsciiRenderer();
    r.setMode('unicode');
    const src = AsciiStorage.getSample(key);
    assert.deepEqual(labelsOf(parse(r.render(src))), labelsOf(src), key);
  }
});

test('every template re-renders identically after re-import', () => {
  for (const key of Object.keys(SAMPLE_TEMPLATES)) {
    for (const mode of ['unicode', 'ascii']) {
      const r = new AsciiRenderer();
      r.setMode(mode);
      const first = r.render(AsciiStorage.getSample(key));
      assert.equal(r.render(parse(first)), first, `${key} ${mode}`);
    }
  }
});

test('a connector that splits at a junction comes back as one connector per branch', () => {
  const r = new AsciiRenderer();
  r.setMode('unicode');
  const back = parse(r.render(AsciiStorage.getSample('architecture')));
  const name = (id) => back.shapes.find(s => s.id === id).text.split('\n')[0];
  const fromGateway = back.connectors
    .filter(c => c.fromShapeId && name(c.fromShapeId) === 'API Gateway')
    .map(c => [name(c.toShapeId), c.label]).sort();
  assert.deepEqual(fromGateway, [['Auth Service', 'gRPC'], ['Order Service', 'REST']]);
});

const MORE_SHAPES = ['hexagon', 'triangle', 'database', 'cloud', 'queue'];
const SIZES = [[10, 3], [12, 4], [14, 4], [16, 5], [18, 6], [20, 5], [22, 6], [24, 7], [30, 9]];

test('hexagons, triangles, databases, clouds and queues are recognised at every size', () => {
  const r = new AsciiRenderer();
  for (const mode of ['unicode', 'ascii', 'unicode-curved']) {
    r.setMode(mode);
    for (const type of MORE_SHAPES) {
      for (const [w, h] of SIZES) {
        const back = parse(r.render({ shapes: [{ id: 's', type, x: 0, y: 2, w, h, text: 'Ab' }], connectors: [], texts: [], notes: [] }));
        const where = `${mode} ${type} ${w}x${h}`;
        assert.deepEqual(back.shapes.map(s => [s.type, s.w, s.h]), [[type, w, h]], where);
        // A 3-row database has no room for text
        if (!(type === 'database' && h === 3)) assert.equal(back.shapes[0].text, 'Ab', where);
      }
    }
  }
});

test('a diagram with every shape type and connectors between them round-trips exactly', () => {
  const types = ['rectangle', 'rounded-rectangle', 'circle', 'diamond', 'parallelogram',
    'hexagon', 'triangle', 'database', 'cloud', 'queue'];
  const shapes = types.map((type, i) => ({
    id: type, type, x: 2 + (i % 4) * 30, y: 2 + Math.floor(i / 4) * 14, w: 20, h: 7, text: type.slice(0, 8)
  }));
  const connectors = [];
  for (let i = 0; i + 1 < types.length; i++) {
    if (Math.floor(i / 4) === Math.floor((i + 1) / 4)) {
      connectors.push({ id: `h${i}`, fromShapeId: types[i], toShapeId: types[i + 1],
        fromAnchor: 'right', toAnchor: 'left', label: i % 3 === 0 ? `L${i}` : '' });
    }
  }
  for (let i = 0; i + 4 < types.length; i += 4) {
    connectors.push({ id: `v${i}`, fromShapeId: types[i], toShapeId: types[i + 4],
      fromAnchor: 'bottom', toAnchor: 'top', label: 'down' });
  }
  const d = { shapes, connectors, texts: [], notes: [] };
  const r = new AsciiRenderer();
  for (const mode of ['unicode', 'ascii']) {
    r.setMode(mode);
    const first = r.render(d);
    const back = parse(first);
    assert.deepEqual(back.shapes.map(s => s.type).sort(), types.slice().sort(), mode);
    assert.equal(back.connectors.length, connectors.length, mode);
    assert.ok(back.connectors.every(c => c.fromShapeId && c.toShapeId), `${mode}: all attached`);
    assert.equal(r.render(back), first, mode);
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

// --- Mermaid ------------------------------------------------------------------

const mermaid = (text) => plain(AsciiParser.parseMermaidToDiagram(text));
const typeOf = (d) => Object.fromEntries(d.shapes.map(s => [s.id, s.type]));

test('mermaid: every flowchart node shape maps to a shape type', () => {
  const d = mermaid([
    'flowchart TD',
    'a[Rect] --> b(Round) --> c([Stadium]) --> d[[Sub]] --> e[(DB)]',
    'e --> f((Circle)) --> g{Choice} --> h{{Hex}} --> i[/In/] --> j[/Trap\\]',
    'j --> k>Flag]'
  ].join('\n'));
  assert.deepEqual(typeOf(d), {
    a: 'rectangle', b: 'rounded-rectangle', c: 'rounded-rectangle', d: 'queue', e: 'database',
    f: 'circle', g: 'diamond', h: 'hexagon', i: 'parallelogram', j: 'triangle', k: 'rectangle'
  });
  assert.equal(d.connectors.length, 10, 'chains create one edge per hop');
});

test('mermaid: edge styles, ends, both label forms, & groups and quoted text', () => {
  const d = mermaid([
    'graph LR; A["Say \\"hi\\"<br>twice"] -.-> B',
    'B ==> C',
    'C -- writes --> D',
    'D -->|reads| E',
    'E --o F & G',
    'G <--> H',
    'H --- I',
    'classDef hot fill:#f00',
    'class I hot'
  ].join('\n'));
  const edge = (from, to) => d.connectors.find(c => c.fromShapeId === from && c.toShapeId === to);
  assert.equal(edge('A', 'B').style, 'dashed');
  assert.equal(edge('B', 'C').style, 'double');
  assert.equal(edge('C', 'D').label, 'writes');
  assert.equal(edge('D', 'E').label, 'reads');
  assert.equal(edge('E', 'F').arrowEnd, 'dot');
  assert.equal(edge('E', 'G').arrowEnd, 'dot');
  assert.deepEqual([edge('G', 'H').arrowStart, edge('G', 'H').arrowEnd], ['triangle', 'triangle']);
  assert.deepEqual([edge('H', 'I').arrowStart, edge('H', 'I').arrowEnd], ['none', 'none']);
  assert.equal(d.shapes.find(s => s.id === 'A').text, 'Say \\"hi\\"\ntwice');
  // LR: edges run left to right
  assert.deepEqual([edge('B', 'C').fromAnchor, edge('B', 'C').toAnchor], ['right', 'left']);
});

test('mermaid: subgraphs become containers around their nodes, nested too', () => {
  const d = mermaid([
    'flowchart TD',
    'subgraph outer [Outer]',
    '  subgraph inner [Inner]',
    '    E[E1]',
    '  end',
    '  F[F1]',
    'end',
    'A --> E & F',
    'G[Outside]'
  ].join('\n'));
  const byId = Object.fromEntries(d.shapes.map(s => [s.id, s]));
  const within = (s, c) => s.x > c.x && s.y > c.y && s.x + s.w < c.x + c.w && s.y + s.h < c.y + c.h;
  assert.equal(byId.outer.type, 'container');
  assert.equal(byId.outer.text, 'Outer');
  assert.ok(within(byId.inner, byId.outer));
  assert.ok(within(byId.E, byId.inner));
  assert.ok(within(byId.F, byId.outer) && !within(byId.F, byId.inner));
  for (const id of ['A', 'G']) assert.ok(!within(byId[id], byId.outer), `${id} is outside`);
});

test('mermaid: BT and RL flip the flow, cycles still lay out', () => {
  const bt = mermaid('graph BT\nA --> B --> C --> A');
  const y = Object.fromEntries(bt.shapes.map(s => [s.id, s.y]));
  assert.ok(y.A > y.B && y.B > y.C, 'BT stacks upwards');
  const rl = mermaid('flowchart RL\nA --> B');
  const x = Object.fromEntries(rl.shapes.map(s => [s.id, s.x]));
  assert.ok(x.A > x.B, 'RL runs right to left');
});

test('mermaid: exported templates import back with the same shapes, edges and labels', () => {
  const summary = (d) => plain(d.shapes).filter(s => s.type !== 'note')
    .map(s => `${s.type === 'cloud' ? 'rounded-rectangle' : s.type}:${s.text}`).sort();
  const edges = (d) => plain(d.connectors).map(c => `${c.label || ''}/${c.style || 'solid'}`).sort();
  for (const key of Object.keys(SAMPLE_TEMPLATES)) {
    const src = AsciiStorage.getSample(key);
    const text = AsciiParser.diagramToMermaid(src);
    assert.match(text, /^flowchart (TD|LR)\n/);
    const back = mermaid(text);
    assert.deepEqual(summary(back), summary(src), key);
    assert.deepEqual(edges(back), edges(src), key);
  }
});

test('mermaid export: containers become subgraphs, odd ids are made safe', () => {
  const text = AsciiParser.diagramToMermaid({
    shapes: [
      { id: 'vpc', type: 'container', x: 0, y: 0, w: 40, h: 12, text: 'VPC' },
      { id: 'end', type: 'rectangle', x: 4, y: 3, w: 12, h: 5, text: 'Say "hi"' },
      { id: '9 lives', type: 'circle', x: 60, y: 3, w: 12, h: 5, text: 'Cat' }
    ],
    connectors: [{ id: 'c', fromShapeId: 'end', toShapeId: '9 lives', arrowEnd: 'triangle', style: 'dashed' }]
  });
  assert.match(text, /subgraph vpc\["VPC"\]\n {4}end_node\["Say #quot;hi#quot;"\]\n {2}end/);
  assert.match(text, /n_9_lives\(\("Cat"\)\)/);
  assert.match(text, /end_node -\.-> n_9_lives/);
  const back = mermaid(text);
  assert.equal(back.shapes.find(s => s.id === 'end_node').text, 'Say "hi"');
});

// --- Messier layouts -------------------------------------------------------------

test('arrowless connectors and diamond tips survive a round trip', () => {
  const box = (id, x, y, w, h) => ({ id, type: 'rectangle', x, y, w, h, text: id });
  const diamond = (id, x, y, w, h) => ({ id, type: 'diamond', x, y, w, h, text: id });
  const cases = [
    // A connector ending on a diamond's < tip, and one routed around a box
    { shapes: [box('N0', 10, 12, 10, 7), diamond('N1', 36, 12, 10, 7), box('N2', 28, 4, 10, 5)],
      connectors: [
        { id: 'c0', fromShapeId: 'N1', toShapeId: 'N0', fromAnchor: 'auto', toAnchor: 'top', arrowEnd: 'none' },
        { id: 'c2', fromShapeId: 'N0', toShapeId: 'N1', fromAnchor: 'auto', toAnchor: 'left', arrowEnd: 'none' }
      ] },
    // A labelled arrowless connector leaving a box and ending under a diamond's v tip
    { shapes: [box('N0', 14, 28, 10, 6), { id: 'N1', type: 'database', x: 56, y: 26, w: 10, h: 6, text: 'N1' },
      diamond('N2', 56, 4, 10, 5)],
      connectors: [{ id: 'c0', fromShapeId: 'N0', toShapeId: 'N2', fromAnchor: 'left', toAnchor: 'bottom', arrowEnd: 'none', label: 'L0' }] }
  ];
  const r = new AsciiRenderer();
  for (const [i, d] of cases.entries()) {
    for (const mode of ['unicode', 'ascii']) {
      r.setMode(mode);
      const first = r.render({ ...d, texts: [], notes: [] });
      assert.match(first, /</, `case ${i} ${mode}: the diamond tip is drawn`);
      const back = parse(first);
      assert.ok(back.connectors.every(c => c.fromShapeId && c.toShapeId), `case ${i} ${mode}: attached`);
      assert.equal(r.render(back), first, `case ${i} ${mode}`);
    }
  }
});
