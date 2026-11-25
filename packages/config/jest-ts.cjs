/** Shared ts-jest preset for Node/TypeScript packages. */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: true }] },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
