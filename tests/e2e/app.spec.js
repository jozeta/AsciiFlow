// End-to-end tests: the real app in Chromium, driven like a user would.
const { test, expect } = require('@playwright/test');

const objectCount = async (page) =>
  Number((await page.locator('body').textContent()).match(/(\d+) objects?/)[1]);

const preview = (page) => page.locator('#asciiPreview, pre').first();

function shareLink(diagram) {
  return `index.html#diagram=${encodeURIComponent(JSON.stringify(diagram))}`;
}

// Move the mouse onto a grid cell, using the status bar's Col/Row readout to
// land exactly on it whatever the current pan and zoom are.
async function pointAtCell(page, col, row) {
  const box = await page.locator('#editorCanvas').boundingBox();
  const zoom = parseInt(await page.locator('#zoomDisplay').textContent(), 10) / 100;
  const cw = 10 * zoom;
  const ch = 18 * zoom;
  const read = async (x, y) => {
    await page.mouse.move(x, y);
    const m = (await page.locator('#cursorCoord').textContent()).match(/Col: (-?\d+), Row: (-?\d+)/);
    return [Number(m[1]), Number(m[2])];
  };
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  for (let i = 0; i < 6; i++) {
    const [c, r] = await read(x, y);
    if (c === col && r === row) return { x, y };
    x += (col - c) * cw;
    y += (row - r) * ch;
  }
  throw new Error(`could not point at cell ${col},${row}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate(() => localStorage.clear());
  // Start each test from a blank page, so a following goto() to a
  // #diagram= link really loads the app instead of only changing the hash
  await page.goto('about:blank');
});

test('loads without errors or third-party requests', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:')) external.push(r.url()); });

  await page.goto('index.html');
  await expect(page.locator('#editorCanvas')).toBeVisible();
  await expect(preview(page)).toContainText('Login Request');
  expect(await page.evaluate(() => document.fonts.check('16px bootstrap-icons'))).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('undo and redo move exactly one step', async ({ page }) => {
  await page.goto('index.html');
  const undo = page.locator('#btnUndo');
  const redo = page.locator('#btnRedo');
  await expect(undo).toBeDisabled();
  const start = await objectCount(page);

  await page.locator('#editorCanvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  expect(await objectCount(page)).toBe(0);

  await undo.click();
  expect(await objectCount(page)).toBe(start);
  await expect(undo).toBeDisabled();
  await redo.click();
  expect(await objectCount(page)).toBe(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await objectCount(page)).toBe(start);
});

test('New and Templates replace the diagram without a dialog and can be undone', async ({ page }) => {
  page.on('dialog', d => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await page.goto('index.html');
  const start = await objectCount(page);

  await page.locator('#btnNew').click();
  expect(await objectCount(page)).toBe(0);
  await expect(page.locator('#toastBody')).toContainText('Started a new diagram');
  await page.locator('#toastBody .toast-action').click();
  expect(await objectCount(page)).toBe(start);

  await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Templates' }).click();
  await page.locator('[data-template="decision"]').click();
  await expect(preview(page)).toContainText('DELEGATE');
  await page.locator('#btnUndo').click();
  await expect(preview(page)).toContainText('Login Request');
});

test('pasting the preview into Import ASCII gives back the same diagram', async ({ page }) => {
  await page.goto('index.html');
  for (const template of ['flowchart', 'architecture', 'decision']) {
    await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Templates' }).click();
    await page.locator(`[data-template="${template}"]`).click();
    const before = await preview(page).textContent();

    await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Import' }).click();
    await page.locator('[data-bs-target="#importAsciiModal"]').click();
    await page.locator('#importAsciiText').fill(before);
    await page.locator('#btnSubmitImportAscii').click();
    await expect(page.locator('#importAsciiModal')).toBeHidden();
    await expect(page.locator('#toastBody')).toContainText('Imported');
    expect(await preview(page).textContent(), template).toBe(before);
  }
});

test('a broken JSON file shows an error toast, not an alert', async ({ page }) => {
  page.on('dialog', d => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await page.goto('index.html');
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not json')
  });
  await expect(page.locator('#toastBody')).toContainText('Could not import JSON file');
  await expect(page.locator('#toastBody i')).toHaveClass(/text-danger/);
});

test('a hostile share link is clamped and the page stays responsive', async ({ page }) => {
  await page.goto(shareLink({
    mode: '<img src=x onerror=alert(1)>',
    shapes: [
      { id: 'a', type: 'rectangle', x: 2, y: 2, w: 12, h: 5, text: 'Alpha' },
      { id: 'b', type: 'rectangle', x: 1e9, y: 1e9, w: 1e9, h: 5, text: 'Far', __proto__: { polluted: 1 } }
    ]
  }));
  await expect(page.locator('#toastBody')).toContainText('Loaded shared diagram');
  const shapes = await page.evaluate(() => window.AsciiStorage.loadDiagramFromURLHash().shapes.map(s => [s.x, s.y, s.w]));
  expect(shapes).toEqual([[2, 2, 12], [1000, 1000, 500]]);
  // Fit shows the diagram from its top-left corner, where "Alpha" is
  await expect(page.locator('#zoomDisplay')).toHaveText('50%');
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
});

test('clicking a connector that was routed around a shape selects it', async ({ page }) => {
  const box = (id, x) => ({ id, type: 'rectangle', x, y: 2, w: 10, h: 5, text: id });
  const diagram = {
    mode: 'unicode',
    shapes: [box('A', 2), box('Mid', 20), box('C', 40)],
    connectors: [{ id: 'c', fromShapeId: 'A', fromAnchor: 'auto', toShapeId: 'C', toAnchor: 'auto' }]
  };
  await page.goto(shareLink(diagram));
  // The route runs underneath the middle box
  const points = await page.evaluate((d) => {
    const map = new Map(d.shapes.map(s => [s.id, s]));
    return new window.AsciiRenderer().resolveConnectorPoints(d.connectors[0], map, d.connectors);
  }, diagram);
  const below = points.find((p, i) => i > 0 && points[i - 1].y === p.y && p.y > 6);
  expect(below).toBeTruthy();

  const target = await pointAtCell(page, 25, below.y);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#propConnectorControls')).toBeVisible();
});

test('Mermaid: import a flowchart with a subgraph, then copy it back out', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('index.html');
  await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Import' }).click();
  await page.locator('[data-bs-target="#importMermaidModal"]').click();
  await page.locator('#importMermaidText').fill([
    'flowchart LR',
    '  user((User)) -->|HTTPS| api[API]',
    '  subgraph backend [Backend]',
    '    api --> db[(Postgres)]',
    '  end'
  ].join('\n'));
  await page.locator('#btnSubmitImportMermaid').click();
  await expect(page.locator('#importMermaidModal')).toBeHidden();
  await expect(preview(page)).toContainText('[ Backend ]');
  await expect(preview(page)).toContainText('HTTPS');

  await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Export' }).click();
  await page.locator('#btnCopyMermaid').click();
  await expect(page.locator('#toastBody')).toContainText('Mermaid flowchart copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^flowchart LR\n/);
  expect(copied).toContain('subgraph backend["Backend"]');
  expect(copied).toContain('user -->|"HTTPS"| api');
});
