module.exports = {
  root: true,
  env: { es2021: true, jest: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended', 'prettier'],
  parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  rules: { 'react/react-in-jsx-scope': 'off', 'react/prop-types': 'off' }
};
