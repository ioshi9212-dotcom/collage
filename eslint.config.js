// Check correctness without enforcing a project-wide formatting style.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const recommendedRules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['warn', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
  }],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/fonts/**',
      'public/template-assets/**',
      'public/templates/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: recommendedRules,
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: [
      'server.js',
      'server/**/*.{js,mjs}',
      '**/*.test.mjs',
      'e2e/**/*.mjs',
      'playwright.config.mjs',
      'vite.config.js',
      'eslint.config.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
