import { describe, expect, test } from '@jest/globals';
import { computeLpsArray, searchKmp } from '../Kmp';
describe('computeLpsArray', () => {
  test('it works', () => {
    expect(computeLpsArray('AAAA')).toEqual([0, 1, 2, 3]);
    expect(computeLpsArray('ABCDE')).toEqual([0, 0, 0, 0, 0]);
    expect(computeLpsArray('AABAACAABAA')).toEqual([0, 1, 0, 1, 2, 0, 1, 2, 3, 4, 5]);
    expect(computeLpsArray('AAACAAAAAC')).toEqual([0, 1, 2, 0, 1, 2, 3, 3, 3, 4]);
    expect(computeLpsArray('AAABAAA')).toEqual([0, 1, 2, 0, 1, 2, 3]);
  });
});
describe('searchKmp', () => {
  const makeStringArgs = (searchText: string, pattern: string): Parameters<typeof searchKmp> => [
    (i) => searchText[i],
    searchText.length,
    pattern,
    computeLpsArray(pattern),
  ];
  test('throws when needle is empty', () => {
    expect(() => searchKmp(...makeStringArgs('', ''))).toThrow();
    expect(() => searchKmp(...makeStringArgs('a', ''))).toThrow();
  });
  test('does not throw when haystack is empty', () => {
    expect(() => searchKmp(...makeStringArgs('', 'a'))).not.toThrow();
  });
  test('matches equal string', () => {
    expect(searchKmp(...makeStringArgs('text', 'text'))).toEqual([0]);
  });
  test('matches single substring', () => {
    expect(searchKmp(...makeStringArgs('this is a sentence', 'is a'))).toEqual([5]);
  });
  test('matches two substrings', () => {
    expect(searchKmp(...makeStringArgs('my favorite color is the color red', 'color'))).toEqual([12, 25]);
  });
  test('matches at end of string', () => {
    expect(searchKmp(...makeStringArgs('the full project gutenberg license', 'license'))).toEqual([27]);
  });
  test('matches do not overlap', () => {
    expect(searchKmp(...makeStringArgs('eeeeeeeeeeeee', 'eee'))).toEqual([0, 3, 6, 9]);
  });
});
