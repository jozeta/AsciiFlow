// Phones and tablets: the layout fits, and the canvas works with touch.
// Touch input goes through Chromium's DevTools protocol, which supports
// multi-touch (pinch) and real touch drags.
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(([x, y], id) => ({ x, y, id }))
  });
  return {
    async drag(from, to, steps = 8) {
      await send('touchStart', [from]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]);
      }
      await send('touchEnd', []);
    },
    async tap(point) {
      await send('touchStart', [point]);
      await send('touchEnd', []);
    },
    async pinch(centre, fromGap, toGap, steps = 8) {
      const at = (gap) => [[centre[0] - gap / 2, centre[1]], [centre[0] + gap / 2, centre[1]]];
      await send('touchStart', at(fromGap));
      for (let i = 1; i <= steps; i++) await send('touchMove', at(fromGap + (toGap - fromGap) * i / steps));
      await send('touchEnd', []);
    }
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('asciiflow_diagram_data', JSON.stringify({
      version: 1, mode: 'unicode', texts: [], notes: [], connectors: [],
      shapes: [{ id: 'a', type: 'rectangle', x: 4, y: 4, w: 14, h: 5, text: 'Touch me' }]
    }));
  });
  await page.goto('index.html');
});

test('every control fits on a phone screen', async ({ page }) => {
  const offscreen = await page.evaluate(() => [...document.querySelectorAll('.app-header button, .app-header a, .app-toolbar button, .app-statusbar button')]
    .filter(el => el.offsetParent !== null)
    .filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1; })
    .map(el => el.id || el.title));
  expect(offscreen).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The preview starts closed so the canvas is usable, and opens on demand
  await expect(page.locator('#previewPanel')).toHaveClass(/collapsed/);
  await page.locator('#btnTogglePreview').click();
  await expect(page.locator('#previewPanel')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#asciiPreviewCode')).toContainText('Touch me');
});

test('drag a shape with a finger, double-tap to edit, pinch to zoom', async ({ page }) => {
  const t = await touch(page);
  const zoom = async () => parseInt(await page.locator('#zoomDisplay').textContent(), 10) / 100;

  // Fit the view, which centres the only shape in the canvas
  const box = await page.locator('#editorCanvas').boundingBox();
  await page.locator('#btnZoomFit').click();
  const z = await zoom();
  const middle = [box.x + box.width / 2, box.y + box.height / 2];

  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('asciiflow_diagram_data')).shapes[0]);
  await t.drag(middle, [middle[0] + 10 * z * 6, middle[1] + 18 * z * 3]);
  // Moved about 6 cells right and 3 down (±1 for where in a cell the finger started)
  const position = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('asciiflow_diagram_data')).shapes[0];
    return [s.x, s.y];
  });
  await expect.poll(async () => {
    const [x, y] = await position();
    return Math.abs(x - before.x - 6) <= 1 && Math.abs(y - before.y - 3) <= 1;
  }).toBe(true);
  const dragged = await position();

  // Double-tap opens the text editor on the shape
  const moved = [middle[0] + 10 * z * 6, middle[1] + 18 * z * 3];
  await t.tap(moved);
  await page.waitForTimeout(100);
  await t.tap(moved);
  await expect(page.locator('#canvasTextEditor')).toBeVisible();
  await page.locator('#canvasTextEditor').press('Escape');

  // Two fingers moving apart zoom in
  const zoomBefore = await zoom();
  await t.pinch(middle, 80, 200);
  expect(await zoom()).toBeGreaterThan(zoomBefore * 1.5);
  // and the diagram did not move or change
  await page.waitForTimeout(700); // autosave
  expect(await position()).toEqual(dragged);
});

test('the property bar fits on a phone when a shape is selected', async ({ page }) => {
  const t = await touch(page);
  const box = await page.locator('#editorCanvas').boundingBox();
  await page.locator('#btnZoomFit').click();
  await t.tap([box.x + box.width / 2, box.y + box.height / 2]);
  await expect(page.locator('#propertyBar')).not.toHaveClass(/hidden/);
  await page.waitForTimeout(400);
  const offscreen = await page.evaluate(() => [...document.querySelectorAll('#propertyBar button, #propertyBar select')]
    .filter(el => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
    .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1); })
    .map(el => el.id || el.title));
  expect(offscreen).toEqual([]);
});
