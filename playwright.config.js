// Browser tests for the real app (tests/e2e). The unit tests in tests/*.test.js
// run with plain `node --test` and need none of this.
const { defineConfig } = require('@playwright/test');

const PORT = 8123;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  // One browser at a time: python's http.server struggles with parallel
  // browsers, and the whole suite takes a few seconds anyway
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 }
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
