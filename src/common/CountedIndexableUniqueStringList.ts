import { assert, assertIsNotNullish } from '../common/util';
import { LeftRightCompareWithFunction, LeftRightComparisonResult } from './LeftRightCompare';
class CountedIndexableUniqueStringList {
  private $p_valueToNode = Object.create(null) as Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  private $p_root: AvlTreeCountedIndexableUniqueStringListNode = new AvlTreeCountedIndexableUniqueStringListLeafNode(null, this.$p_valueToNode);
  constructor(valuesAndCounts: Iterable<readonly [value: string, count: number]>) {
    let i = 0;
    for (const valueAndCount of valuesAndCounts) {
      this.$p_root = this.$p_root.$m_insertBefore(i++, valueAndCount[0], valueAndCount[1]);
    }
  }
  $m_getLength(): number {
    return this.$p_root.$m_size;
  }
  $m_access(index: number): [value: string, count: number] {
    assert(0 <= index && index < this.$p_root.$m_size);
    const node = (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_getNodeAt(index);
    return [node.$m_value, node.$m_count];
  }
  $m_insertBefore(index: number, valuesAndCounts: (readonly [value: string, count: number])[]): void {
    assert(0 <= index && index <= this.$p_root.$m_size);
    for (let i = 0; i < valuesAndCounts.length; i++) {
      const valueAndCount = valuesAndCounts[i];
      this.$p_root = this.$p_root.$m_insertBefore(index + i, valueAndCount[0], valueAndCount[1]);
    }
  }
  $m_insertValueAndCountUsingComparisonFunction(value: string, count: number, compareWithFn: LeftRightCompareWithFunction<string>): void {
    assert(!(value in this.$p_valueToNode));
    this.$p_root = this.$p_root.$m_insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
  }
  $m_remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 <= fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.$p_root.$m_size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.$p_root = (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_removeAt(fromIndex);
    }
  }
  $m_has(value: string): boolean {
    return value in this.$p_valueToNode;
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
  $m_getTotalCount(): number {
    return this.$p_root.$m_totalCount;
  }
  $m_getCount(value: string): number {
    return this.$p_valueToNode[value].$m_count;
  }
  $m_setCount(value: string, count: number): void {
    const node = this.$p_valueToNode[value];
    if (node.$m_count === count) {
      return;
    }
    node.$m_count = count;
    node.$m_recalculateTotalCount();
    let parentNode: AvlTreeCountedIndexableUniqueStringListInternalNode | null = node;
    while ((parentNode = parentNode.$m_parent)) {
      parentNode.$m_recalculateTotalCount();
    }
  }
  $m_calculatePrefixSumBefore(value: string): number {
    let node = this.$p_valueToNode[value];
    assertIsNotNullish(node);
    let prefixSum = node.$m_left.$m_totalCount;
    while (node.$m_parent !== null) {
      if (node === node.$m_parent.$m_right) {
        prefixSum += node.$m_parent.$m_left.$m_totalCount + node.$m_parent.$m_count;
      }
      node = node.$m_parent;
    }
    return prefixSum;
  }
  *$m_iterBetween(start: number, endInclusive: number): IterableIterator<[value: string, count: number]> {
    for (let i = start; i <= endInclusive; i++) {
      yield this.$m_access(i);
    }
  }
  $m_toArray(): [value: string, count: number][] {
    return this.$m_getLength() === 0 ? [] : [...this.$m_iterBetween(0, this.$m_getLength() - 1)];
  }
  $m_assertStructure(): void {
    if (this.$p_root.$m_size !== 0) {
      (this.$p_root as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
  }
}
interface AvlTreeCountedIndexableUniqueStringListNode {
  $m_parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  $m_height: number;
  $m_size: number;
  $m_totalCount: number;
  $m_insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    compareWithFn: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode;
  $m_insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode;
}
class AvlTreeCountedIndexableUniqueStringListLeafNode implements AvlTreeCountedIndexableUniqueStringListNode {
  $m_parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  $m_height = 0;
  $m_size = 0;
  $m_totalCount = 0;
  private $p_valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  constructor(
    parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>,
  ) {
    this.$m_parent = parent;
    this.$p_valueToNode = valueToNode;
  }
  $m_insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    _compare: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode {
    return new AvlTreeCountedIndexableUniqueStringListInternalNode(value, count, this.$m_parent, this.$p_valueToNode);
  }
  $m_insertBefore(_index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    return new AvlTreeCountedIndexableUniqueStringListInternalNode(value, count, this.$m_parent, this.$p_valueToNode);
  }
}
class AvlTreeCountedIndexableUniqueStringListInternalNode implements AvlTreeCountedIndexableUniqueStringListNode {
  $m_value: string;
  $m_parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  $m_height = 1;
  $m_size = 1;
  $m_count: number;
  $m_totalCount: number;
  $m_left: AvlTreeCountedIndexableUniqueStringListNode;
  $m_right: AvlTreeCountedIndexableUniqueStringListNode;
  private $p_valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  constructor(
    value: string,
    count: number,
    parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>,
  ) {
    this.$m_value = value;
    this.$m_count = count;
    this.$m_totalCount = count;
    this.$m_parent = parent;
    this.$m_left = new AvlTreeCountedIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$m_right = new AvlTreeCountedIndexableUniqueStringListLeafNode(this, valueToNode);
    this.$p_valueToNode = valueToNode;
    this.$p_valueToNode[this.$m_value] = this;
  }
  $m_getNodeAt(index: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index < leftSize) {
      return (this.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_getNodeAt(index);
    }
    if (index > leftSize) {
      return (this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_getNodeAt(index - leftSize - 1);
    }
    return this;
  }
  $m_insertValueAndCountUsingComparisonFunction(
    value: string,
    count: number,
    compareWithFn: LeftRightCompareWithFunction<string>,
  ): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const comparisonResultWithMyValue = compareWithFn(this.$m_value);
    if (comparisonResultWithMyValue === LeftRightComparisonResult.IsLeft) {
      this.$m_left = this.$m_left.$m_insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
    } else {
      this.$m_right = this.$m_right.$m_insertValueAndCountUsingComparisonFunction(value, count, compareWithFn);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  $m_insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index <= leftSize) {
      this.$m_left = this.$m_left.$m_insertBefore(index, value, count);
    } else {
      this.$m_right = this.$m_right.$m_insertBefore(index - leftSize - 1, value, count);
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  $m_removeAt(index: number): AvlTreeCountedIndexableUniqueStringListNode {
    const leftSize: number = this.$m_left.$m_size;
    if (index < leftSize) {
      this.$m_left = (this.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_removeAt(index);
    } else if (index > leftSize) {
      this.$m_right = (this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_removeAt(index - leftSize - 1);
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
      let temp = this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode;
      while (temp.$m_left.$m_size !== 0) {
        temp = temp.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode;
      }
      this.$m_value = temp.$m_value;
      this.$m_count = temp.$m_count;
      this.$m_right = (this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_removeAt(0);
      this.$p_valueToNode[this.$m_value] = this;
    }
    this.$p_recalculate();
    return this.$p_balance();
  }
  private $p_balance(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const parent = this.$m_parent;
    const balance: number = this.$p_getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeCountedIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (left.$p_getBalance() === 1) {
        this.$m_left = left.$p_rotateLeft();
      }
      result = this.$p_rotateRight();
    } else if (balance === 2) {
      const right = this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (right.$p_getBalance() === -1) {
        this.$m_right = right.$p_rotateRight();
      }
      result = this.$p_rotateLeft();
    }
    result.$m_parent = parent;
    return result;
  }
  private $p_rotateLeft(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode;
    root.$m_parent = this.$m_parent;
    this.$m_right = root.$m_left;
    this.$m_right.$m_parent = this;
    root.$m_left = this;
    root.$m_left.$m_parent = root;
    this.$p_recalculate();
    root.$p_recalculate();
    return root;
  }
  private $p_rotateRight(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode;
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
    this.$m_totalCount = this.$m_left.$m_totalCount + this.$m_right.$m_totalCount + this.$m_count;
  }
  $m_recalculateTotalCount(): void {
    this.$m_totalCount = this.$m_left.$m_totalCount + this.$m_right.$m_totalCount + this.$m_count;
  }
  private $p_getBalance(): number {
    return this.$m_right.$m_height - this.$m_left.$m_height;
  }
  $m_assertStructure(): void {
    if (this.$m_left.$m_size !== 0) {
      (this.$m_left as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
    if (this.$m_right.$m_size !== 0) {
      (this.$m_right as AvlTreeCountedIndexableUniqueStringListInternalNode).$m_assertStructure();
    }
    assert(this.$m_height === Math.max(this.$m_left.$m_height, this.$m_right.$m_height) + 1);
    assert(this.$m_size === this.$m_left.$m_size + this.$m_right.$m_size + 1);
    assert(this.$m_totalCount === this.$m_left.$m_totalCount + this.$m_right.$m_totalCount + this.$m_count);
    assert(Math.abs(this.$p_getBalance()) <= 1);
  }
}
export { CountedIndexableUniqueStringList };
