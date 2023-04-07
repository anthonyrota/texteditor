import { assert } from './util';
type LpsArray = number[];
function computeLpsArray(pattern: string): number[] {
  assert(pattern.length > 0);
  const lps: number[] = [];
  const M = pattern.length;
  let len = 0;
  let i = 1;
  lps[0] = 0;
  while (i < M) {
    if (pattern.charAt(i) === pattern.charAt(len)) {
      len++;
      lps[i] = len;
      i++;
    } else {
      if (len !== 0) {
        len = lps[len - 1];
      } else {
        lps[i] = len;
        i++;
      }
    }
  }
  return lps;
}
function searchKmp(accessChar: (i: number) => string, N: number, pattern: string, lps: LpsArray): number[] {
  const M = pattern.length;
  let j = 0;
  let i = 0;
  const startIndices: number[] = [];
  while (N - i >= M - j) {
    if (pattern[j] === accessChar(i)) {
      j++;
      i++;
    }
    if (j === M) {
      const k = i - j;
      startIndices.push(k);
      i = k + M;
      j = 0;
    } else if (i < N && pattern[j] !== accessChar(i)) {
      if (j !== 0) {
        j = lps[j - 1];
      } else {
        i++;
      }
    }
  }
  return startIndices;
}
export { type LpsArray, computeLpsArray, searchKmp };
