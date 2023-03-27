import fs from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';
import { ArrayIndexableUniqueStringList, AvlTreeIndexableUniqueStringList, IndexableUniqueStringList } from '../IndexableUniqueStringList';
let mw = 123456789;
let mz = 987654321;
const mask = 0xffffffff;
function seed(i: number) {
  mw = (123456789 + i) & mask;
  mz = (987654321 - i) & mask;
}
function random() {
  mw = (18000 * (mw & 65535) + (mw >> 16)) & mask;
  mz = (36969 * (mz & 65535) + (mz >> 16)) & mask;
  return (((mz << 16) + (mw & 65535)) >>> 0) / 4294967296;
}
type Op = { type: 'insert'; at: number; chars: string[] } | { type: 'remove'; from: number; to: number };
interface Fail {
  mySeed: number;
  initialValues: string[];
  ops: Op[];
}
function areFailsEqual(fail1: Fail, fail2: Fail): boolean {
  return (
    fail1.initialValues.length === fail2.initialValues.length &&
    fail1.initialValues.every((value, i) => value === fail2.initialValues[i]) &&
    fail1.mySeed === fail2.mySeed &&
    fail1.ops.length === fail2.ops.length &&
    fail1.ops.every((op, i) => {
      const newFailOp = fail2.ops[i];
      if (op.type === 'insert') {
        return (
          newFailOp.type === 'insert' &&
          op.at === newFailOp.at &&
          op.chars.length === newFailOp.chars.length &&
          op.chars.every((char, i) => char === newFailOp.chars[i])
        );
      }
      return newFailOp.type === 'remove' && op.from === newFailOp.from && op.to === newFailOp.to;
    })
  );
}
describe.each([
  ['ArrayIndexableUniqueStringList', (values: string[]) => new ArrayIndexableUniqueStringList(values)],
  ['AvlTreeIndexableUniqueStringList', (values: string[]) => new AvlTreeIndexableUniqueStringList(values)],
])('%s', (name, makeImpl) => {
  const checkSame = (array: string[], impl: IndexableUniqueStringList) => {
    expect(impl.getLength()).toBe(array.length);
    expect(impl.toArray()).toEqual(array);
    if (impl instanceof AvlTreeIndexableUniqueStringList) {
      impl.assertStructure();
    }
    for (let i = 0; i < array.length; i++) {
      const value = array[i];
      expect(impl.access(i)).toBe(value);
      expect(impl.indexOf(value)).toBe(i);
    }
  };
  const failPath = path.join(__dirname, `${name}.fails.json`);
  const readFails = (): Fail[] => {
    if (fs.existsSync(failPath)) {
      return (JSON.parse(fs.readFileSync(failPath, 'utf8')) as { fails: Fail[] }).fails;
    }
    return [];
  };
  describe('previous fails', () => {
    const fails = readFails();
    if (fails.length === 0) {
      return;
    }
    test.each(fails.map((fail, i) => [i, fail] as const))('fail #%i', (_index, { mySeed, initialValues, ops }) => {
      seed(mySeed);
      const array = initialValues.slice();
      const impl = makeImpl(initialValues);
      checkSame(array, impl);
      ops.forEach((op) => {
        if (op.type === 'insert') {
          impl.insertBefore(op.at, op.chars);
          array.splice(op.at, 0, ...op.chars);
        } else {
          impl.remove(op.from, op.to);
          array.splice(op.from, op.to - op.from + 1);
        }
        checkSame(array, impl);
      });
    });
  });
  test('testing random operations against array', () => {
    const mySeed = 0;
    seed(mySeed);
    const chars: string[] = [];
    for (let i = 0; i < 1000; i++) {
      chars.push(String(i));
    }
    let charIndex = 100;
    const initialValues = chars.slice(0, charIndex);
    const array = initialValues.slice();
    const impl = makeImpl(initialValues);
    const multiOpCount = 50;
    const checkSameAndPersistIfFail = (): void => {
      try {
        checkSame(array, impl);
      } catch (error) {
        const fails = readFails();
        const newFail: Fail = { mySeed, initialValues, ops };
        if (!fails.some((fail) => areFailsEqual(fail, newFail))) {
          const newFails: Fail[] = [...fails, newFail];
          fs.writeFileSync(failPath, JSON.stringify({ fails: newFails }, undefined, 2), 'utf8');
        }
        throw error;
      }
    };
    checkSameAndPersistIfFail();
    const ops: Op[] = [];
    while (charIndex < chars.length) {
      const r = random();
      if (r < 0.05 && charIndex <= chars.length - multiOpCount) {
        const i = Math.floor(random() * (chars.length - multiOpCount + 1));
        const charsToInsert = chars.slice(charIndex, charIndex + multiOpCount);
        charIndex += multiOpCount;
        impl.insertBefore(i, charsToInsert);
        array.splice(i, 0, ...charsToInsert);
        ops.push({ type: 'insert', at: i, chars: charsToInsert });
      } else if (r < 0.5) {
        const i = Math.floor(random() * chars.length);
        const charToInsert = chars[charIndex++];
        impl.insertBefore(i, [charToInsert]);
        array.splice(i, 0, charToInsert);
        ops.push({ type: 'insert', at: i, chars: [charToInsert] });
      } else if (r < 0.55 && array.length >= multiOpCount) {
        const i = Math.floor(random() * (array.length - multiOpCount + 1));
        impl.remove(i, i + multiOpCount - 1);
        array.splice(i, multiOpCount);
        ops.push({ type: 'remove', from: i, to: i + multiOpCount - 1 });
      } else if (array.length > 0) {
        const i = Math.floor(random() * array.length);
        impl.remove(i, i);
        array.splice(i, 1);
        ops.push({ type: 'remove', from: i, to: i });
      }
      checkSameAndPersistIfFail();
    }
  });
});
