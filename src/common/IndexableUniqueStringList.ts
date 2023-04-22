import { assert } from '../common/util';
class IndexableUniqueStringList {
  #valueToNode = Object.create(null) as Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  #root: AvlTreeIndexableUniqueStringListNode = new AvlTreeIndexableUniqueStringListLeafNode(null, this.#valueToNode);
  constructor(values: Iterable<string>) {
    let i = 0;
    for (const value of values) {
      this.#root = this.#root.insertBefore(i++, value);
    }
  }
  getLength(): number {
    return this.#root.size;
  }
  access(index: number): string {
    assert(0 <= index && index < this.#root.size);
    return (this.#root as AvlTreeIndexableUniqueStringListInternalNode).getNodeAt(index).value;
  }
  insertBefore(index: number, values: string[]): void {
    assert(0 <= index && index <= this.#root.size);
    for (let i = 0; i < values.length; i++) {
      this.#root = this.#root.insertBefore(index + i, values[i]);
    }
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    assert(0 <= fromIndex && fromIndex <= toIndexInclusive && toIndexInclusive < this.#root.size);
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.#root = (this.#root as AvlTreeIndexableUniqueStringListInternalNode).removeAt(fromIndex);
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
  has(value: string): boolean {
    return value in this.#valueToNode;
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
    if (this.#root.size !== 0) {
      (this.#root as AvlTreeIndexableUniqueStringListInternalNode).assertStructure();
    }
  }
}
interface AvlTreeIndexableUniqueStringListNode {
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height: number;
  size: number;
  insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode;
}
class AvlTreeIndexableUniqueStringListLeafNode implements AvlTreeIndexableUniqueStringListNode {
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height = 0;
  size = 0;
  #valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(parent: AvlTreeIndexableUniqueStringListInternalNode | null, valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>) {
    this.parent = parent;
    this.#valueToNode = valueToNode;
  }
  insertBefore(_index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    return new AvlTreeIndexableUniqueStringListInternalNode(value, this.parent, this.#valueToNode);
  }
}
class AvlTreeIndexableUniqueStringListInternalNode implements AvlTreeIndexableUniqueStringListNode {
  value: string;
  parent: AvlTreeIndexableUniqueStringListInternalNode | null;
  height = 1;
  size = 1;
  left: AvlTreeIndexableUniqueStringListNode;
  right: AvlTreeIndexableUniqueStringListNode;
  #valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>;
  constructor(
    value: string,
    parent: AvlTreeIndexableUniqueStringListInternalNode | null,
    valueToNode: Record<string, AvlTreeIndexableUniqueStringListInternalNode>,
  ) {
    this.value = value;
    this.parent = parent;
    this.left = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.right = new AvlTreeIndexableUniqueStringListLeafNode(this, valueToNode);
    this.#valueToNode = valueToNode;
    this.#valueToNode[this.value] = this;
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
  insertBefore(index: number, value: string): AvlTreeIndexableUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index <= leftSize) {
      this.left = this.left.insertBefore(index, value);
    } else {
      this.right = this.right.insertBefore(index - leftSize - 1, value);
    }
    this.#recalculate();
    return this.#balance();
  }
  removeAt(index: number): AvlTreeIndexableUniqueStringListNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      this.left = (this.left as AvlTreeIndexableUniqueStringListInternalNode).removeAt(index);
    } else if (index > leftSize) {
      this.right = (this.right as AvlTreeIndexableUniqueStringListInternalNode).removeAt(index - leftSize - 1);
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
      let temp = this.right as AvlTreeIndexableUniqueStringListInternalNode;
      while (temp.left.size !== 0) {
        temp = temp.left as AvlTreeIndexableUniqueStringListInternalNode;
      }
      this.value = temp.value;
      this.right = (this.right as AvlTreeIndexableUniqueStringListInternalNode).removeAt(0);
      this.#valueToNode[this.value] = this;
    }
    this.#recalculate();
    return this.#balance();
  }
  #balance(): AvlTreeIndexableUniqueStringListInternalNode {
    const parent = this.parent;
    const balance: number = this.#getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeIndexableUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.left as AvlTreeIndexableUniqueStringListInternalNode;
      if (left.#getBalance() === +1) {
        this.left = left.#rotateLeft();
      }
      result = this.#rotateRight();
    } else if (balance === +2) {
      const right = this.right as AvlTreeIndexableUniqueStringListInternalNode;
      if (right.#getBalance() === -1) {
        this.right = right.#rotateRight();
      }
      result = this.#rotateLeft();
    }
    result.parent = parent;
    return result;
  }
  #rotateLeft(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.right as AvlTreeIndexableUniqueStringListInternalNode;
    root.parent = this.parent;
    this.right = root.left;
    this.right.parent = this;
    root.left = this;
    root.left.parent = root;
    this.#recalculate();
    root.#recalculate();
    return root;
  }
  #rotateRight(): AvlTreeIndexableUniqueStringListInternalNode {
    const root = this.left as AvlTreeIndexableUniqueStringListInternalNode;
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
  }
  #getBalance(): number {
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
    assert(Math.abs(this.#getBalance()) <= 1);
  }
}
export { IndexableUniqueStringList };
