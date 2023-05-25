import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFolderPaths = [
  join(__dirname, 'EnglishAustralia'),
  join(__dirname, 'EnglishAmerica'),
  join(__dirname, 'EnglishBritain'),
  join(__dirname, 'EnglishCanada'),
];
const additionalWords = readFileSync(join(__dirname, 'additionalEnglishWords.txt'), 'utf8');
sourceFolderPaths.forEach((sourceFolderPath) => {
  const originalDictionaryTxt = readFileSync(join(sourceFolderPath, 'dic.original.txt'), 'utf8');
  const originalDictionaryTxtWithoutNoSuggest = originalDictionaryTxt.replace(/\/!$/gm, '').replace(/!/g, '');
  writeFileSync(join(sourceFolderPath, 'dic.txt'), originalDictionaryTxtWithoutNoSuggest + additionalWords);
});
