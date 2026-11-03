// WCAG 2.1 A/AA checks with axe-core, in both themes and with every dialog
// open. Each dialog is checked on its own (the backdrop dims the page behind).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DIALOGS = ['#settingsModal', '#helpModal', '#importAsciiModal', '#importMermaidModal'];

async function violations(page, include) {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  return result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
}

async function setTheme(page, theme) {
  if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
    await page.locator('#themeToggleBtn').click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', theme);
  await page.waitForTimeout(400); // let colour transitions finish
}

for (const theme of ['light', 'dark']) {
  test(`no WCAG A/AA violations in the ${theme} theme`, async ({ page }) => {
    await page.goto('index.html');
    await setTheme(page, theme);
    expect(await violations(page)).toEqual([]);

    // With a shape selected, the property bar is showing
    await page.locator('#editorCanvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+a');
    await expect(page.locator('#propertyBar')).not.toHaveClass(/hidden/);
    await page.waitForTimeout(400); // the bar fades in
    expect(await violations(page)).toEqual([]);

    for (const dialog of DIALOGS) {
      await page.evaluate((sel) => window.bootstrap.Modal.getOrCreateInstance(document.querySelector(sel)).show(), dialog);
      await expect(page.locator(dialog)).toBeVisible();
      await page.waitForTimeout(300);
      expect(await violations(page, dialog), dialog).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(dialog)).toBeHidden();
    }
  });
}

test('toggle buttons announce their state and the preview is reachable by keyboard', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('.tool-btn[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.tool-btn[data-tool="rectangle"]').click();
  await expect(page.locator('.tool-btn[data-tool="rectangle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tool-btn[data-tool="select"]')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('.mode-btn[data-mode="ascii"]').click();
  await expect(page.locator('.mode-btn[data-mode="ascii"]')).toHaveAttribute('aria-pressed', 'true');

  const preview = page.getByRole('region', { name: 'ASCII preview of the diagram' });
  await preview.focus();
  await expect(preview).toBeFocused();
  await expect(preview).toContainText('Login Request');
});

test('a flowchart can be drawn with the keyboard alone', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#btnNew').click();
  await expect(page.locator('body')).toContainText('0 objects');

  // Tab to the canvas, add a box and type its label
  await page.locator('#editorCanvas').focus();
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  await expect(page.locator('#canvasTextEditor')).toBeVisible();
  await page.keyboard.type('Start');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#editorCanvas')).toBeFocused();

  // A connected diamond to the right, then a box below it
  await page.keyboard.press('d');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ok?');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('r');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Done');
  await page.keyboard.press('ControlOrMeta+Enter');

  const preview = page.locator('#asciiPreviewCode');
  await expect(preview).toContainText('Start');
  await expect(preview).toContainText('Ok?');
  await expect(preview).toContainText('Done');
  await page.keyboard.press('Escape'); // clear the selection; the status bar then counts objects
  await expect(page.locator('#statusSelection')).toHaveText('5 objects'); // 3 shapes, 2 connectors

  // Tab through the shapes; the live region announces each one
  await page.keyboard.press('Tab');
  await expect(page.locator('#canvasAnnouncer')).toContainText('rectangle "Start", 1 of 3');
  await page.keyboard.press('Tab');
  await expect(page.locator('#canvasAnnouncer')).toContainText('diamond "Ok?", 2 of 3');

  // Connect "Start" straight to "Done": K, Tab to the target, Enter
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('k');
  await expect(page.locator('#canvasAnnouncer')).toContainText('Connecting from rectangle "Start"');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#canvasAnnouncer')).toContainText('Connected rectangle "Start" to rectangle "Done"');
  await page.keyboard.press('Escape');
  await expect(page.locator('#statusSelection')).toHaveText('6 objects');

  // Past the last shape, Tab leaves the canvas (no keyboard trap)
  await expect(page.locator('#editorCanvas')).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await expect(page.locator('#editorCanvas')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#editorCanvas')).not.toBeFocused();
});

test('typing in a dialog does not trigger canvas shortcuts', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#editorCanvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+a');
  const before = await page.locator('#statusSelection').textContent();
  await page.locator('[data-bs-toggle="dropdown"]', { hasText: 'Import' }).click();
  await page.locator('[data-bs-target="#importAsciiModal"]').click();
  await expect(page.locator('#importAsciiModal')).toBeVisible();
  await page.waitForTimeout(400); // Bootstrap ignores Escape while the dialog fades in
  await page.locator('#importAsciiText').fill('abc');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('r');
  await expect(page.locator('#importAsciiText')).toHaveValue('abr');
  await page.keyboard.press('Escape');
  await expect(page.locator('#importAsciiModal')).toBeHidden();
  await expect(page.locator('#statusSelection')).toHaveText(before); // nothing was deleted
  await expect(page.locator('.tool-btn[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
});
