/**
 * ESLint flat config — permissive baseline (F-TOOL: Batch 2 Task 0).
 *
 * Goal: catch real errors (undefined globals, syntax) without imposing
 * style churn on a no-build vanilla-JS codebase. Tighten incrementally.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'qr-codes/**', 'assets/**', 'data/**'],
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        module: 'writable', // CJS export guard for Jest
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  {
    files: ['tests/**/*.js', 'jest.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.jest,
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
];
