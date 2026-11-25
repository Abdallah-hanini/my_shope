module.exports = {
  ...require('@erp/config/jest-ts'),
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int.test.ts'],
  testTimeout: 30000,
};
