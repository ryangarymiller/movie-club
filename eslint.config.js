import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Fast-Refresh advisory only (no runtime impact). Several files intentionally
      // co-locate hooks/helpers with their component (and the test suite imports those
      // helpers, e.g. compute fns from Awards.jsx and prediction helpers from Films.jsx),
      // so splitting them would be churn for a dev-HMR nicety. Keep it visible as a warning.
      'react-refresh/only-export-components': 'warn',
      // Idiomatic async data-loader effects (setLoading(true) then await/fetch). A new,
      // opinionated React-19 rule; these patterns are intentional and have no runtime issue.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Vitest test files run with globals: true (see vite.config.js), so teach
    // ESLint about the injected test globals to avoid false no-undef errors.
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        // Node globals: test files run under Vitest in Node (e.g. reading source
        // with node:fs + process.cwd() in adminMoviesSchema.test.js).
        ...globals.node,
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        vi: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly',
      },
    },
  },
])
