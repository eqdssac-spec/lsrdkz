module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['*.js', '!jest.config.js', '!*.test.js'],
  coverageDirectory: 'coverage',
  verbose: true
};
