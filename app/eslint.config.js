const { defineConfig } = require('eslint/config')
const expo = require('eslint-config-expo/flat')

module.exports = defineConfig([expo, {
  ignores: ['dist/**'],
  // The existing app has not adopted React Compiler constraints. Keep these
  // diagnostics visible without blocking conventional hooks-based components.
  rules: {
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/refs': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
  },
}])
