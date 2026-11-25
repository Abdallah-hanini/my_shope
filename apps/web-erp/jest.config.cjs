module.exports = {
  ...require('@erp/config/jest-ts'),
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true } }],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
