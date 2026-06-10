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
    'js/app.js': {
      statements: 30,
      branches: 20,
      functions: 30,
      lines: 30,
    },
  },
};
