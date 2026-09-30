const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    workers: 1,
    reporter: 'list',
});
