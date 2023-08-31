import { assert } from '../common/util';
import { LeftRightCompareWithFunction, LeftRightComparisonResult } from './LeftRightCompare';
class IndexableUniqueStringList {
  private $p_valueToNode = Object.create(null) as Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  private $p_root: AvlTreeIndexableUniqueStringListNode = new AvlTreeIndexableUniqueStringListLeafNode(null, this.$p_valueToNode);
  constructor(values: Iterable<string>) {
    let i = 0;
    for (const value of values) {
      this.$p_root = this.$p_root.$m_insertBefore(i++, value);
    }
  }
  $m_getLength(): number {
    return this.$p_root.$m_size;
  }
  $m_access(index: number): string {
    assert(0 <= index && index < this.$p_root.$m_size);
    return (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).$m_getNodeAt(index).$m_value;
  }
  $m_insertBefore(index: number, values: string[]): void {
    assert(0 <= index && index <= this.$p_root.$m_size);
    for (let i = 0; i < values.length; i++) {
      this.$p_root = this.$p_root.$m_insertBefore(index + i, values[i]);
    }
  }
  $m_insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): void {
    assert(!(value in this.$p_valueToNode));
    this.$p_root = this.$p_root.$m_insertValueUsingComparisonFunction(value, compareWithFn);
  }
  $m_remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 <= fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.$p_root.$m_size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.$p_root = (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).$m_removeAt(fromIndex);
    }
  }
  $m_indexOf(value: string): number {
    if (!(value in this.$p_valueToNode)) {
      return -1;
    }
    let node = this.$p_valueToNode[value];
    let index = node.$m_left.$m_size;
    while (node.$m_parent !== null) {
      if (node === node.$m_parent.$m_right) {
        index += node.$m_parent.$m_left.$m_size + 1;
      }
      node = node.$m_parent;
    }
    return index;
  }
  $m_has(value: string): boolean {
    return value in this.$p_valueToNode;
  }
  *$m_iterBetween(start: number, endInclusive: number): IterableIterator<string> {
    for (let i = start; i <= endInclusive; i++) {
      yield this.$m_access(i);
    }
  }
  $m_toArray(): string[] {
    return this.$m_getLength() === 0 ? [] : [...this.$m_iterBetween(0, this.$m_getLength() - 1)];
  }
  $m_assertStructure(): void {
    if (this.$p_root.$m_size !== 0) {
      (this.$p_root as AvlTreeIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
  }
}
interface AvlTreeIndexableUniqueStringListNode {
  $m_parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  $m_height: number;
  $m_size: number;
  $m_insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode;
  $m_insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode;
}
class AvlTreeIndexableUniqueStringListLeafNode implements AvlTreeIndexableUniqueStringListNode {
  $m_parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  $m_height = 0;
  $m_size = 0;
  private $p_valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(parent: AvlTreeIndexableUniqueStringListInternalNode | null, valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>) {
    this.$m_parent = parent;
    this.$p_valueToNode = valueToNode;
  }
  $m_insertValueUsingComparisonFunction(value: string, _compare: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode {
    return new AvlTreeIndexableUniqueStringListInternalNode(value, this.$m_parent, this.$p_valueToNode);
  }
  $m_insertBefore(_index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    return new AvlTreeIndexableUniqueStringListInternalNode(value, this.$m_parent, this.$p_valueToNode);
  }
}
class AvlTreeIndexableUniqueStringListInternalNode implements AvlTreeIndexableUniqueStringListNode {
  $m_value: string;
  $m_parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  $m_height = 1;
  $m_size = 1;
  $m_left: AvlTreeIndexableUniqueStringListNode;
  $m_right: AvlTreeIndexableUniqueStringListNode;
  private $p_valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(
    value: string,
    parent: AvlTreeIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>,
  ) {
    this.$m_value = value;
    this.$m_parent = parent;
    this.$m_left = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$m_right = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$p_valueToNode = valueToNode;
    this.$p_valueToNode[this.$m_value] = this;
  }
  $m_getNodeAt(index: number): AvlTreeIndexableUniqueStringListInternalNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index < leftSize) {
      return (this.$m_left as AvlTreeIndexableUniqueStringListInternalNode).$m_getNodeAt(index);
    }
    if (index > leftSize) {
      return (this.$m_right as AvlTreeIndexableUniqueStringListInternalNode).$m_getNodeAt(index - leftSize - 1);
    }
    return this;
  }
  $m_insertValueUsingComparisonFunction(value: string, compareWithFn: LeftRightCompareWithFunction<string>): AvlTreeIndexableUniqueStringListInternalNode {
    const comparisonResultWithMyValue = compareWithFn(this.$m_value);
    if (comparisonResultWithMyValue === LeftRightComparisonResult.IsLeft) {
      this.$m_left = this.$m_left.$m_insertValueUsingComparisonFunction(value, compareWithFn);
    } else {
      this.$m_right = this.$m_right.$m_insertValueUsingComparisonFunction(value, compareWithFn);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  $m_insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index <= leftSize) {
      this.$m_left = this.$m_left.$m_insertBefore(index, value);
    } else {
      this.$m_right = this.$m_right.$m_insertBefore(index - leftSize - 1, value);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  $m_removeAt(index: number): AvlTreeIndexableUniqueStringListNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index < leftSize) {
      this.$m_left = (this.$m_left as AvlTreeIndexableUniqueStringListInternalNode).$m_removeAt(index);
    } else if (index > leftSize) {
      this.$m_right = (this.$m_right as AvlTreeIndexableUniqueStringListInternalNode).$m_removeAt(index - leftSize - 1);
    } else {
      delete this.$p_valueToNode[this.$m_value];
      if (this.$m_right.$m_size === 0) {
        const newNode = this.$m_left;
        newNode.$m_parent = this.$m_parent;
        return newNode;
      }
      if (this.$m_left.$m_size === 0) {
        const newNode = this.$m_right;
        newNode.$m_parent = this.$m_parent;
        return newNode;
      }
      let temp = this.$m_right as AvlTreeIndexableUniqueStringListInternalNode;
      while (temp.$m_left.$m_size !== 0) {
        temp = temp.$m_left as AvlTreeIndexableUniqueStringListInternalNode;
      }
      this.$m_value = temp.$m_value;
      this.$m_right = (this.$m_right as AvlTreeIndexableUniqueStringListInternalNode).$m_removeAt(0);
      this.$p_valueToNode[this.$m_value] = this;
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  private $p_balance(): AvlTreeIndexableUniqueStringListInternalNode {
    const parent = this.$m_parent;
    const balance: number = this.$p_getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.$m_left as AvlTreeIndexableUniqueStringListInternalNode;
      if (left.$p_getBalance() === 1) {
        this.$m_left = left.$p_rotateLeft();
      }
      result = this.$p_rotateRight();
    } else if (balance === 2) {
      const right = this.$m_right as AvlTreeIndexableUniqueStringListInternalNode;
      if (right.$p_getBalance() === -1) {
        this.$m_right = right.$p_rotateRight();
      }
      result = this.$p_rotateLeft();
    }
    result.$m_parent = parent;
    return result;
  }
  private $p_rotateLeft(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.$m_right as AvlTreeIndexableUniqueStringListInternalNode;
    root.$m_parent = this.$m_parent;
    this.$m_right = root.$m_left;
    this.$m_right.$m_parent = this;
    root.$m_left = this;
    root.$m_left.$m_parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_rotateRight(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.$m_left as AvlTreeIndexableUniqueStringListInternalNode;
    root.$m_parent = this.$m_parent;
    this.$m_left = root.$m_right;
    this.$m_left.$m_parent = this;
    root.$m_right = this;
    root.$m_right.$m_parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_recalculate(): void {
    this.$m_height = Math.max(this.$m_left.$m_height, this.$m_right.$m_height) + 1;
    this.$m_size = this.$m_left.$m_size + this.$m_right.$m_size + 1;
  }
  private $p_getBalance(): number {
    return this.$m_right.$m_height - this.$m_left.$m_height;
  }
  $m_assertStructure(): void {
    if (this.$m_left.$m_size !== 0) {
      (this.$m_left as AvlTreeIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
    if (this.$m_right.$m_size !== 0) {
      (this.$m_right as AvlTreeIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
    assert(this.$m_height === Math.max(this.$m_left.$m_height, this.$m_right.$m_height) + 1);
    assert(this.$m_size === this.$m_left.$m_size + this.$m_right.$m_size + 1);
    assert(Math.abs(this.$p_getBalance()) <= 1);
  }
}
export { IndexableUniqueStringList };
