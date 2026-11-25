module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  extends: ['eslint:recommended', 'prettier'],
  plugins: ['react'],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react/jsx-uses-react': 'off',
    'react/jsx-uses-vars': 'error',
  },
  ignorePatterns: ['node_modules/', '.next/', '.expo/', 'dist/', 'coverage/', 'apps/ai/.venv/'],
};
