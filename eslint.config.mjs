import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'build/**',
    'artifacts/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'next-env.d.ts',
    'public/**',
    'packages/*/dist/**',
    'content/.proof-cache/**',
    'content/.proof-results/**',
    '.proof-build/**',
    'tests/fixtures/sources/**',
  ]),
  {
    // README §3.14: multi-page navigation with plain <a> and cross-document View Transitions.
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  {
    // Legacy debt measured on 2026-11-24. Do not add new occurrences: `npm run lint` fails above the ratchet.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
