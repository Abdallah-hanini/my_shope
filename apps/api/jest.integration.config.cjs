// Integration tests run against real PostgreSQL and Redis (docs/SECURITY_QA.md). They fail, not skip,
// when the services are unavailable: start them with `pnpm db:up` and `pnpm db:migrate` first.
module.exports = {
  ...require('@erp/config/jest-ts'),
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int.test.ts'],
  testTimeout: 30000,
};
