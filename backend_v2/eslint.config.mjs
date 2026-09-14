import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig({
  files: ['*-service/src/**/*.ts', 'shared/**/*.ts', 'ws-authorizer/*.mjs'],
  extends: [js.configs.recommended, tseslint.configs.recommended],
  languageOptions: { globals: globals.node },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  },
});
