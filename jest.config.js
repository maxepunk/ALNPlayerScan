module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  resetMocks: false,  // We manage mocks manually (constructor side effects)
  restoreMocks: true,
  verbose: true,
};
