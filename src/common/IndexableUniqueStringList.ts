import { assert } from '../common/util';
import { LeftRightCompareWithFunction, LeftRightComparisonResult } from './LeftRightCompare';
class IndexableUniqueStringList {
  private $p_valueToNode = Object.create(null) as Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  private $p_root: AvlTreeIndexableUniqueStringListNode = new AvlTreeIndexableUniqueStringListLeafNode(null, this.$p_valueToNode);
  constructor(values: Iterable<string>) {
    let i = 0;
    for (const value of values) {
      this.$p_root = this.$p_root.insertBefore(i++, value);
    }
  }
  getLength(): number {
    return this.$p_root.size;
  }
  access(index: number): string {
    assert(0 <= index && index < this.$p_root.size);
    return (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).getNodeAt(index).value;
  }
  insertBefore(index: number, values: string[]): void {
    assert(0 <= index && index <= this.$p_root.size);
    for (let i = 0; i < values.length; i++) {
      this.$p_root = this.$p_root.insertBefore(index + i, values[i]);
    }
  }
  insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): void {
    assert(!(value in this.$p_valueToNode));
    this.$p_root = this.$p_root.insertValueUsingComparisonFunction(value, compareWithFn);
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 <= fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.$p_root.size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.$p_root = (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).removeAt(fromIndex);
    }
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
  has(value: string): boolean {
    return value in this.$p_valueToNode;
  }
  *iterBetween(start: number, endInclusive: number): IterableIterator<string> {
    for (let i = start; i <= endInclusive; i++) {
      yield this.access(i);
    }
  }
  toArray(): string[] {
    return this.getLength() === 0 ? [] : [...this.iterBetween(0, this.getLength() - 1)];
  }
  assertStructure(): void {
    if (this.$p_root.size !== 0) {
      (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).assertStructure();
    }
  }
}
interface AvlTreeIndexableUniqueStringListNode {
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height: number;
  size: number;
  insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode;
  insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode;
}
class AvlTreeIndexableUniqueStringListLeafNode implements AvlTreeIndexableUniqueStringListNode {
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height = 0;
  size = 0;
  private $p_valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(parent: AvlTreeIndexableUniqueStringListInternalNode | null, valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>) {
    this.parent = parent;
    this.$p_valueToNode = valueToNode;
  }
  insertValueUsingComparisonFunction(value: string, _compare: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode {
    return new AvlTreeIndexableUniqueStringListInternalNode(value, this.parent, this.$p_valueToNode);
  }
  insertBefore(_index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    return new AvlTreeIndexableUniqueStringListInternalNode(value, this.parent, this.$p_valueToNode);
  }
}
class AvlTreeIndexableUniqueStringListInternalNode implements AvlTreeIndexableUniqueStringListNode {
  value: string;
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height = 1;
  size = 1;
  left: AvlTreeIndexableUniqueStringListNode;
  right: AvlTreeIndexableUniqueStringListNode;
  private $p_valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(
    value: string,
    parent: AvlTreeIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>,
  ) {
    this.value = value;
    this.parent = parent;
    this.left = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.right = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$p_valueToNode = valueToNode;
    this.$p_valueToNode[this.value] = this;
  }
  getNodeAt(index: number): AvlTreeIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      return (this.left as AvlTreeIndexableUniqueStringListInternalNode).getNodeAt(index);
    }
    if (index > leftSize) {
      return (this.right as AvlTreeIndexableUniqueStringListInternalNode).getNodeAt(index - leftSize - 1);
    }
    return this;
  }
  insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode {
    const comparisonResultWithMyValue = compareWithFn(this.value);
    if (comparisonResultWithMyValue === LeftRightComparisonResult.IsLeft) {
      this.left = this.left.insertValueUsingComparisonFunction(value, compareWithFn);
    } else {
      this.right = this.right.insertValueUsingComparisonFunction(value, compareWithFn);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index <= leftSize) {
      this.left = this.left.insertBefore(index, value);
    } else {
      this.right = this.right.insertBefore(index - leftSize - 1, value);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  removeAt(index: number): AvlTreeIndexableUniqueStringListNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      this.left = (this.left as AvlTreeIndexableUniqueStringListInternalNode).removeAt(index);
    } else if (index > leftSize) {
      this.right = (this.right as AvlTreeIndexableUniqueStringListInternalNode).removeAt(index - leftSize - 1);
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
      let temp = this.right as AvlTreeIndexableUniqueStringListInternalNode;
      while (temp.left.size !== 0) {
        temp = temp.left as AvlTreeIndexableUniqueStringListInternalNode;
      }
      this.value = temp.value;
      this.right = (this.right as AvlTreeIndexableUniqueStringListInternalNode).removeAt(0);
      this.$p_valueToNode[this.value] = this;
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  private $p_balance(): AvlTreeIndexableUniqueStringListInternalNode {
    const parent = this.parent;
    const balance: number = this.$p_getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.left as AvlTreeIndexableUniqueStringListInternalNode;
      if (left.$p_getBalance() === +1) {
        this.left = left.$p_rotateLeft();
      }
      result = this.$p_rotateRight();
    } else if (balance === +2) {
      const right = this.right as AvlTreeIndexableUniqueStringListInternalNode;
      if (right.$p_getBalance() === -1) {
        this.right = right.$p_rotateRight();
      }
      result = this.$p_rotateLeft();
    }
    result.parent = parent;
    return result;
  }
  private $p_rotateLeft(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.right as AvlTreeIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.right = root.left;
    this.right.parent = this;
    root.left = this;
    root.left.parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_rotateRight(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.left as AvlTreeIndexableUniqueStringListInternalNode;
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
  }
  private $p_getBalance(): number {
    return this.right.height - this.left.height;
  }
  assertStructure(): void {
    if (this.left.size !== 0) {
      (this.left as AvlTreeIndexableUniqueStringListInternalNode).assertStructure();
    }
    if (this.right.size !== 0) {
      (this.right as AvlTreeIndexableUniqueStringListInternalNode).assertStructure();
    }
    assert(this.height === Math.max(this.left.height, this.right.height) + 1);
    assert(this.size === this.left.size + this.right.size + 1);
    assert(Math.abs(this.$p_getBalance()) <= 1);
  }
}
export { IndexableUniqueStringList };
