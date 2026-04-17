import manufacturingAudit from './eslint-rules/manufacturing-audit.mjs'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'frontend/**',
      'mobile-rn/**',
      'vite-modules/**',
      'coverage/**',
      '**/*.min.js'
    ]
  },
  {
    files: [
      'api/manufacturing.js',
      'api/sales-orders.js',
      'api/purchase-orders.js',
      'api/jobcards.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable'
      }
    },
    plugins: {
      'mfg-audit': manufacturingAudit
    },
    rules: {
      'mfg-audit/require-audit-before-mutation-success': 'error'
    }
  }
]
