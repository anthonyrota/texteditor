import fs from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';
import { UniqueStringQueue } from '../UniqueStringQueue';
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
type Op = { type: 'queue'; char: string } | { type: 'dequeue'; char: string } | { type: 'shift' };
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
      if (op.type === 'queue') {
        return newFailOp.type === 'queue' && op.char === newFailOp.char;
      }
      if (op.type === 'dequeue') {
        return newFailOp.type === 'dequeue' && op.char === newFailOp.char;
      }
      return newFailOp.type === 'shift';
    })
  );
}
describe('UniqueStringQueue', () => {
  const checkSame = (array: string[], impl: UniqueStringQueue) => {
    expect(impl.getQueueLength()).toBe(array.length);
    expect(impl.toArray()).toEqual(array);
  };
  const failPath = path.join(__dirname, `UniqueStringQueue.fails.json`);
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
      const impl = new UniqueStringQueue(initialValues);
      checkSame(array, impl);
      ops.forEach((op) => {
        if (op.type === 'queue') {
          impl.queue(op.char);
          const index = array.indexOf(op.char);
          if (index !== -1) {
            array.splice(index, 1);
          }
          array.unshift(op.char);
        } else if (op.type === 'dequeue') {
          impl.dequeue(op.char);
          const index = array.indexOf(op.char);
          if (index !== -1) {
            array.splice(index, 1);
          }
        } else {
          expect(impl.shift()).toBe(array.shift() ?? null);
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
    const impl = new UniqueStringQueue(initialValues);
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
    const ops: Op[] = [];
    checkSameAndPersistIfFail();
    const queue = (char: string): void => {
      impl.queue(char);
      const index = array.indexOf(char);
      if (index !== -1) {
        array.splice(index, 1);
      }
      array.unshift(char);
      ops.push({ type: 'queue', char });
    };
    const dequeue = (char: string): void => {
      impl.dequeue(char);
      const index = array.indexOf(char);
      if (index !== -1) {
        array.splice(index, 1);
      }
      ops.push({ type: 'dequeue', char });
    };
    const shift = (): void => {
      expect(impl.shift()).toBe(array.shift() ?? null);
      ops.push({ type: 'shift' });
    };
    while (charIndex < chars.length || array.length > 0) {
      const r = random();
      if (r < 0.15 && charIndex < chars.length) {
        queue(chars[charIndex++]);
      } else if (r < 0.3 && charIndex < chars.length) {
        dequeue(chars[charIndex + 1]);
      } else if (r < 0.45 && array.length > 0) {
        queue(array[Math.floor(random() * array.length)]);
      } else if (r < 0.6 && array.length > 0) {
        dequeue(array[Math.floor(random() * array.length)]);
      } else {
        shift();
      }
      checkSameAndPersistIfFail();
    }
  });
});
