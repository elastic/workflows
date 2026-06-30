import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/'],
  },
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Aligned with Kibana's JS baseline where it applies to Node scripts.
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'allow-null'],
      'no-debugger': 'error',
    },
  },
];
