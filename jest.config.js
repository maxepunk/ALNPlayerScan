module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  resetMocks: false,  // We manage mocks manually (constructor side effects)
  restoreMocks: true,
  verbose: true,
  collectCoverageFrom: ['js/**/*.js'],
  // Coverage ratchet — baseline recorded 2026-06-10 (per-file %s rounded down).
  // Raise when coverage improves; never lower.
  coverageThreshold: {
    'js/orchestratorIntegration.js': {
      statements: 71,
      branches: 71,
      functions: 73,
      lines: 72,
    },
    'js/scannerCore.js': {
      statements: 100,
      branches: 88,
      functions: 100,
      lines: 100,
    },
    'js/tokenDisplay.js': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    // js/app.js has NO threshold (PS-3): app.test.js loads it via
    // fs.readFileSync + eval (it's a non-module browser script), so istanbul
    // never instruments it and jest has no coverage data for it — a
    // threshold entry made every `--coverage` run fail. Re-add a threshold
    // if/when app.js becomes require()-able.
  },
};
