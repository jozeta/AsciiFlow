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
