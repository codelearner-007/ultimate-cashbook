// Flat ESLint config (SDK 54 / ESLint 9). Run with `npm run lint` (expo lint).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'web-build/*', 'assets/*'],
  },
]);
