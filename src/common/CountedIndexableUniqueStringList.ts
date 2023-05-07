import { assert, assertIsNotNullish } from '../common/util';
import { LeftRightCompareWithFunction, LeftRightComparisonResult } from './LeftRightCompare';
class CountedIndexableUniqueStringList {
  private $p_valueToNode = Object.create(null) as Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  private $p_root: AvlTreeCountedIndexableUniqueStringListNode = new AvlTreeCountedIndexableUniqueStringListLeafNode(null, this.$p_valueToNode);
  constructor(valuesAndCounts: Iterable<readonly [value: string, count: number]>) {
    let i = 0;
    for (const valueAndCount of valuesAndCounts) {
      this.$p_root = this.$p_root.insertBefore(i++, valueAndCount[0], valueAndCount[1]);
    }
  }
  getLength(): number {
    return this.$p_root.size;
  }
  access(index: number): [value: string, count: number] {
    assert(0 <= index && index < this.$p_root.size);
    const node = (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).getNodeAt(index);
    return [node.value, node.count];
  }
  insertBefore(index: number, valuesAndCounts: (readonly [value: string, count: number])[]): void {
    assert(0 <= index && index <= this.$p_root.size);
    for (let i = 0; i < valuesAndCounts.length; i++) {
      const valueAndCount = valuesAndCounts[i];
      this.$p_root = this.$p_root.insertBefore(index + i, valueAndCount[0], valueAndCount[1]);
    }
  }
  insertValueAndCountUsingComparisonFunction(value: string, count: number, compareWithFn: LeftRightCompareWithFunction<string>): void {
    assert(!(value in this.$p_valueToNode));
    this.$p_root = this.$p_root.insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 <= fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.$p_root.size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.$p_root = (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(fromIndex);
    }
  }
  has(value: string): boolean {
    return value in this.$p_valueToNode;
  }
  indexOf(value: string): number {
    if (!(value in this.$p_valueToNode)) {
      return -1;
    }
    let node = this.$p_valueToNode[value];
    let index = node.left.size;
    while (node.parent !== null) {
      if (node === node.parent.right) {
        index += node.parent.left.size + 1;
      }
      node = node.parent;
    }
    return index;
  }
  getTotalCount(): number {
    return this.$p_root.totalCount;
  }
  getCount(value: string): number {
    return this.$p_valueToNode[value].count;
  }
  setCount(value: string, count: number): void {
    const node = this.$p_valueToNode[value];
    if (node.count === count) {
      return;
    }
    node.count = count;
    node.recalculateTotalCount();
    let parentNode: AvlTreeCountedIndexableUniqueStringListInternalNode | null = node;
    while ((parentNode = parentNode.parent)) {
      parentNode.recalculateTotalCount();
    }
  }
  calculatePrefixSumBefore(value: string): number {
    let node = this.$p_valueToNode[value];
    assertIsNotNullish(node);
    let prefixSum = node.left.totalCount;
    while (node.parent !== null) {
      if (node === node.parent.right) {
        prefixSum += node.parent.left.totalCount + node.parent.count;
      }
      node = node.parent;
    }
    return prefixSum;
  }
  *iterBetween(start: number, endInclusive: number): IterableIterator<[value: string, count: number]> {
    for (let i = start; i <= endInclusive; i++) {
      yield this.access(i);
    }
  }
  toArray(): [value: string, count: number][] {
    return this.getLength() === 0 ? [] : [...this.iterBetween(0, this.getLength() - 1)];
  }
  assertStructure(): void {
    if (this.$p_root.size !== 0) {
      (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).assertStructure();
    }
  }
}
interface AvlTreeCountedIndexableUniqueStringListNode {
  parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  height: number;
  size: number;
  totalCount: number;
  insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    compareWithFn: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode;
  insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode;
}
class AvlTreeCountedIndexableUniqueStringListLeafNode implements AvlTreeCountedIndexableUniqueStringListNode {
  parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  height = 0;
  size = 0;
  totalCount = 0;
  private $p_valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  constructor(
    parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>,
  ) {
    this.parent = parent;
    this.$p_valueToNode = valueToNode;
  }
  insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    _compare: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode {
    return new AvlTreeCountedIndexableUniqueStringListInternalNode(value, count, this.parent, this.$p_valueToNode);
  }
  insertBefore(_index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    return new AvlTreeCountedIndexableUniqueStringListInternalNode(value, count, this.parent, this.$p_valueToNode);
  }
}
class AvlTreeCountedIndexableUniqueStringListInternalNode implements AvlTreeCountedIndexableUniqueStringListNode {
  value: string;
  parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  height = 1;
  size = 1;
  count: number;
  totalCount: number;
  left: AvlTreeCountedIndexableUniqueStringListNode;
  right: AvlTreeCountedIndexableUniqueStringListNode;
  private $p_valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  constructor(
    value: string,
    count: number,
    parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>,
  ) {
    this.value = value;
    this.count = count;
    this.totalCount = count;
    this.parent = parent;
    this.left = new AvlTreeCountedIndexableUniqueStringListLeafNode(this, valueToNode);
    this.right = new AvlTreeCountedIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$p_valueToNode = valueToNode;
    this.$p_valueToNode[this.value] = this;
  }
  getNodeAt(index: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      return (this.left as AvlTreeCountedIndexableUniqueStringListInternalNode).getNodeAt(index);
    }
    if (index > leftSize) {
      return (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).getNodeAt(index - leftSize - 1);
    }
    return this;
  }
  insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    compareWithFn: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const comparisonResultWithMyValue = compareWithFn(this.value);
    if (comparisonResultWithMyValue === LeftRightComparisonResult.IsLeft) {
      this.left = this.left.insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
    } else {
      this.right = this.right.insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index <= leftSize) {
      this.left = this.left.insertBefore(index, value, count);
    } else {
      this.right = this.right.insertBefore(index - leftSize - 1, value, count);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  removeAt(index: number): AvlTreeCountedIndexableUniqueStringListNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      this.left = (this.left as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(index);
    } else if (index > leftSize) {
      this.right = (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(index - leftSize - 1);
    } else {
      delete this.$p_valueToNode[this.value];
      if (this.right.size === 0) {
        const newNode = this.left;
        newNode.parent = this.parent;
        return newNode;
      }
      if (this.left.size === 0) {
        const newNode = this.right;
        newNode.parent = this.parent;
        return newNode;
      }
      let temp = this.right as AvlTreeCountedIndexableUniqueStringListInternalNode;
      while (temp.left.size !== 0) {
        temp = temp.left as AvlTreeCountedIndexableUniqueStringListInternalNode;
      }
      this.value = temp.value;
      this.count = temp.count;
      this.right = (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(0);
      this.$p_valueToNode[this.value] = this;
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  private $p_balance(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const parent = this.parent;
    const balance: number = this.$p_getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeCountedIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.left as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (left.$p_getBalance() === +1) {
        this.left = left.$p_rotateLeft();
      }
      result = this.$p_rotateRight();
    } else if (balance === +2) {
      const right = this.right as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (right.$p_getBalance() === -1) {
        this.right = right.$p_rotateRight();
      }
      result = this.$p_rotateLeft();
    }
    result.parent = parent;
    return result;
  }
  private $p_rotateLeft(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.right as AvlTreeCountedIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.right = root.left;
    this.right.parent = this;
    root.left = this;
    root.left.parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_rotateRight(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.left as AvlTreeCountedIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.left = root.right;
    this.left.parent = this;
    root.right = this;
    root.right.parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_recalculate(): void {
    this.height = Math.max(this.left.height, this.right.height) + 1;
    this.size = this.left.size + this.right.size + 1;
    this.totalCount = this.left.totalCount + this.right.totalCount + this.count;
  }
  recalculateTotalCount(): void {
    this.totalCount = this.left.totalCount + this.right.totalCount + this.count;
  }
  private $p_getBalance(): number {
    return this.right.height - this.left.height;
  }
  assertStructure(): void {
    if (this.left.size !== 0) {
      (this.left as AvlTreeCountedIndexableUniqueStringListInternalNode).assertStructure();
    }
    if (this.right.size !== 0) {
      (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).assertStructure();
    }
    assert(this.height === Math.max(this.left.height, this.right.height) + 1);
    assert(this.size === this.left.size + this.right.size + 1);
    assert(this.totalCount === this.left.totalCount + this.right.totalCount + this.count);
    assert(Math.abs(this.$p_getBalance()) <= 1);
  }
}
export { CountedIndexableUniqueStringList };
