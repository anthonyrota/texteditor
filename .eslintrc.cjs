module.exports = {
  env: {
    browser: true,
    amd: true,
    node: true,
  },
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'prettier', 'plugin:import/recommended', 'plugin:import/errors', 'plugin:import/warnings'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/recommended', 'plugin:@typescript-eslint/recommended-requiring-type-checking', 'plugin:import/typescript'],
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
  ],
  rules: {
    curly: 'error',
    'max-len': ['warn', { code: 160 }],
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-unused-vars': 'off',
    'no-else-return': ['error', { allowElseIf: false }],
    'no-warning-comments': 'warn',
    'no-fallthrough': 'off',
    'no-empty-function': 'off',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-empty-interface': ['warn', { allowSingleExtends: true }],
    '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
    'import/order': [
      'error',
      {
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
  },
};
