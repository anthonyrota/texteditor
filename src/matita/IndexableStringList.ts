import { assert } from '../util';
// TODO: Implement using RB Tree.
class ArrayIndexableStringList {
  values: string[] = [];
  constructor(values: string[]) {
    this.values = values.slice();
  }
  insertAfter(index: number, values: string[]): void {
    this.values.splice(index + 1, 0, ...values);
  }
  insertAtEnd(values: string[]): void {
    this.values.push(...values);
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    assert(toIndexInclusive >= fromIndex);
    this.values.splice(fromIndex, toIndexInclusive - fromIndex + 1);
  }
  access(index: number): string {
    return this.values[index];
  }
  indexOf(value: string): number {
    return this.values.indexOf(value);
  }
  *iterBetween(fromIndex: number, toIndexInclusive: number): IterableIterator<string> {
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      yield this.values[i];
    }
  }
  getLength(): number {
    return this.values.length;
  }
  clone(): ArrayIndexableStringList {
    return new ArrayIndexableStringList(this.toArray());
  }
  toArray(): string[] {
    return this.values.slice();
  }
}
export { ArrayIndexableStringList as IndexableStringList };
