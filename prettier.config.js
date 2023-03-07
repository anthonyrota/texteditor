module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  printWidth: 160,
  overrides: [
    {
      files: '*.ts',
      options: {
        parser: 'typescript',
      },
    },
  ],
};
