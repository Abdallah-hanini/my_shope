import base from '@erp/config/eslint';

export default [
  ...base,
  { ignores: ['babel.config.js', 'metro.config.js', 'jest.config.js', 'dist/**', '.expo/**'] },
];
