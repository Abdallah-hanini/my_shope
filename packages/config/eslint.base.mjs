// Shared flat ESLint config. Apps and packages extend it from their own eslint.config.mjs.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: [
    '**/dist/**',
    '**/.next/**',
    '**/.expo/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/generated.ts',
  ],
};

export default tseslint.config(
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // Silent failures are forbidden by the engineering charter.
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // CommonJS tool configs (jest, babel, metro).
    files: ['**/*.cjs', '**/*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
