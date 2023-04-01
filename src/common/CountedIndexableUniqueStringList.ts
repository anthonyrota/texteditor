import { assert, assertIsNotNullish } from '../common/util';
class CountedIndexableUniqueStringList {
  #valueToNode = Object.create(null) as Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  #root: AvlTreeCountedIndexableUniqueStringListNode = new AvlTreeCountedIndexableUniqueStringListLeafNode(null, this.#valueToNode);
  constructor(valuesAndCounts: Iterable<[value: string, count: number]>) {
    let i = 0;
    for (const valueAndCount of valuesAndCounts) {
      this.#root = this.#root.insertBefore(i++, valueAndCount[0], valueAndCount[1]);
    }
  }
  getLength(): number {
    return this.#root.size;
  }
  access(index: number): [value: string, count: number] {
    assert(0 <= index && index < this.#root.size);
    const node = (this.#root as AvlTreeCountedIndexableUniqueStringListInternalNode).getNodeAt(index);
    return [node.value, node.count];
  }
  insertBefore(index: number, valuesAndCounts: [value: string, count: number][]): void {
    assert(0 <= index && index <= this.#root.size);
    for (let i = 0; i < valuesAndCounts.length; i++) {
      const valueAndCount = valuesAndCounts[i];
      this.#root = this.#root.insertBefore(index + i, valueAndCount[0], valueAndCount[1]);
    }
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 < fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.#root.size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.#root = (this.#root as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(fromIndex);
    }
  }
  indexOf(value: string): number {
    if (!(value in this.#valueToNode)) {
      return -1;
    }
    let node = this.#valueToNode[value];
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
    return this.#root.totalCount;
  }
  getCount(value: string): number {
    return this.#valueToNode[value].count;
  }
  setCount(value: string, count: number): void {
    const node = this.#valueToNode[value];
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
    let node = this.#valueToNode[value];
    assertIsNotNullish(node);
    let prefixSum = node.left.totalCount;
    while (node.parent !== null) {
      if (node === node.parent.right) {
        prefixSum += node.parent.left.totalCount;
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
    if (this.#root.size !== 0) {
      (this.#root as AvlTreeCountedIndexableUniqueStringListInternalNode).assertStructure();
    }
  }
}
interface AvlTreeCountedIndexableUniqueStringListNode {
  parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  height: number;
  size: number;
  totalCount: number;
  insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode;
}
class AvlTreeCountedIndexableUniqueStringListLeafNode implements AvlTreeCountedIndexableUniqueStringListNode {
  parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null;
  height = 0;
  size = 0;
  totalCount = 0;
  #valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
  constructor(
    parent: AvlTreeCountedIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>,
  ) {
    this.parent = parent;
    this.#valueToNode = valueToNode;
  }
  insertBefore(_index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    return new AvlTreeCountedIndexableUniqueStringListInternalNode(value, count, this.parent, this.#valueToNode);
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
  #valueToNode: Record<string, AvlTreeCountedIndexableUniqueStringListInternalNode>;
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
    this.#valueToNode = valueToNode;
    this.#valueToNode[this.value] = this;
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
  insertBefore(index: number, value: string, count: number): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index <= leftSize) {
      this.left = this.left.insertBefore(index, value, count);
    } else {
      this.right = this.right.insertBefore(index - leftSize - 1, value, count);
    }
    this.#recalculate();
    return this.#balance();
  }
  removeAt(index: number): AvlTreeCountedIndexableUniqueStringListNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      this.left = (this.left as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(index);
    } else if (index > leftSize) {
      this.right = (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(index - leftSize - 1);
    } else {
      delete this.#valueToNode[this.value];
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
      this.right = (this.right as AvlTreeCountedIndexableUniqueStringListInternalNode).removeAt(0);
      this.#valueToNode[this.value] = this;
    }
    this.#recalculate();
    return this.#balance();
  }
  #balance(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const parent = this.parent;
    const balance: number = this.#getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeCountedIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.left as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (left.#getBalance() === +1) {
        this.left = left.#rotateLeft();
      }
      result = this.#rotateRight();
    } else if (balance === +2) {
      const right = this.right as AvlTreeCountedIndexableUniqueStringListInternalNode;
      if (right.#getBalance() === -1) {
        this.right = right.#rotateRight();
      }
      result = this.#rotateLeft();
    }
    result.parent = parent;
    return result;
  }
  #rotateLeft(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.right as AvlTreeCountedIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.right = root.left;
    this.right.parent = this;
    root.left = this;
    root.left.parent = root;
    this.#recalculate();
    root.#recalculate();
    return root;
  }
  #rotateRight(): AvlTreeCountedIndexableUniqueStringListInternalNode {
    const root = this.left as AvlTreeCountedIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.left = root.right;
    this.left.parent = this;
    root.right = this;
    root.right.parent = root;
    this.#recalculate();
    root.#recalculate();
    return root;
  }
  #recalculate(): void {
    this.height = Math.max(this.left.height, this.right.height) + 1;
    this.size = this.left.size + this.right.size + 1;
    this.totalCount = this.left.totalCount + this.right.totalCount + this.count;
  }
  recalculateTotalCount(): void {
    this.totalCount = this.left.totalCount + this.right.totalCount + this.count;
  }
  #getBalance(): number {
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
    assert(Math.abs(this.#getBalance()) <= 1);
  }
}
export { CountedIndexableUniqueStringList };
