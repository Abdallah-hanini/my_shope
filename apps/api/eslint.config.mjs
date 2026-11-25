import base from '@erp/config/eslint';

export default [
  ...base,
  {
    // Nest injects by constructor parameter type, so "type-only" imports would break DI.
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
