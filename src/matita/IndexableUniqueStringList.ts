import { assert } from '../util';
interface IndexableUniqueStringList {
  insertBefore(index: number, values: string[]): void;
  remove(fromIndex: number, toIndexInclusive: number): void;
  access(index: number): string;
  indexOf(value: string): number;
  iterBetween(fromIndex: number, toIndexInclusive: number): IterableIterator<string>;
  getLength(): number;
  toArray(): string[];
}
class ArrayIndexableUniqueStringList implements IndexableUniqueStringList {
  values: string[] = [];
  constructor(values: string[]) {
    this.values = values.slice();
  }
  insertBefore(index: number, values: string[]): void {
    this.values.splice(index, 0, ...values);
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
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
  toArray(): string[] {
    return this.values.slice();
  }
}
class AvlTreeIndexableUniqueStringList implements IndexableUniqueStringList {
  #valueToNode: Record<string, AvlTreeUniqueStringListInternalNode> = {};
  #root: AvlTreeUniqueStringListNode = new AvlTreeUniqueStringListLeafNode(null, this.#valueToNode);
  constructor(values: string[]) {
    this.insertBefore(0, values);
  }
  getLength(): number {
    return this.#root.size;
  }
  access(index: number): string {
    return (this.#root as AvlTreeUniqueStringListInternalNode).getNodeAt(index).value;
  }
  insertBefore(index: number, values: string[]): void {
    for (let i = 0; i < values.length; i++) {
      this.#root = this.#root.insertBefore(index + i, values[i]);
    }
  }
  remove(fromIndex: number, toIndexInclusive: number): void {
    for (let i = fromIndex; i <= toIndexInclusive; i++) {
      this.#root = (this.#root as AvlTreeUniqueStringListInternalNode).removeAt(fromIndex);
    }
  }
  indexOf(value: string): number {
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
  *iterBetween(start: number, endInclusive: number): IterableIterator<string> {
    for (let i = start; i <= endInclusive; i++) {
      yield this.access(i);
    }
  }
  toArray(): string[] {
    return this.getLength() === 0 ? [] : [...this.iterBetween(0, this.getLength() - 1)];
  }
  assertStructure(): void {
    if (this.#root instanceof AvlTreeUniqueStringListInternalNode) {
      this.#root.assertStructure();
    }
  }
}
interface AvlTreeUniqueStringListNode {
  parent: AvlTreeUniqueStringListInternalNode | null;
  height: number;
  size: number;
  insertBefore(index: number, value: string): AvlTreeUniqueStringListInternalNode;
}
class AvlTreeUniqueStringListLeafNode implements AvlTreeUniqueStringListNode {
  parent: AvlTreeUniqueStringListInternalNode | null;
  height = 0;
  size = 0;
  #valueToNode: Record<string, AvlTreeUniqueStringListInternalNode>;
  constructor(parent: AvlTreeUniqueStringListInternalNode | null, valueToNode: Record<string, AvlTreeUniqueStringListInternalNode>) {
    this.parent = parent;
    this.#valueToNode = valueToNode;
  }
  insertBefore(_index: number, value: string): AvlTreeUniqueStringListInternalNode {
    return new AvlTreeUniqueStringListInternalNode(value, this.parent, this.#valueToNode);
  }
}
class AvlTreeUniqueStringListInternalNode implements AvlTreeUniqueStringListNode {
  value: string;
  parent: AvlTreeUniqueStringListInternalNode | null;
  height = 1;
  size = 1;
  left: AvlTreeUniqueStringListNode;
  right: AvlTreeUniqueStringListNode;
  #valueToNode: Record<string, AvlTreeUniqueStringListInternalNode>;
  constructor(value: string, parent: AvlTreeUniqueStringListInternalNode | null, valueToNode: Record<string, AvlTreeUniqueStringListInternalNode>) {
    this.value = value;
    this.parent = parent;
    this.left = new AvlTreeUniqueStringListLeafNode(this, valueToNode);
    this.right = new AvlTreeUniqueStringListLeafNode(this, valueToNode);
    this.#valueToNode = valueToNode;
    this.#valueToNode[this.value] = this;
  }
  getNodeAt(index: number): AvlTreeUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      return (this.left as AvlTreeUniqueStringListInternalNode).getNodeAt(index);
    }
    if (index > leftSize) {
      return (this.right as AvlTreeUniqueStringListInternalNode).getNodeAt(index - leftSize - 1);
    }
    return this;
  }
  insertBefore(index: number, value: string): AvlTreeUniqueStringListInternalNode {
    const leftSize: number = this.left.size;
    if (index <= leftSize) {
      this.left = this.left.insertBefore(index, value);
    } else {
      this.right = this.right.insertBefore(index - leftSize - 1, value);
    }
    this.#recalculate();
    return this.#balance();
  }
  removeAt(index: number): AvlTreeUniqueStringListNode {
    const leftSize: number = this.left.size;
    if (index < leftSize) {
      this.left = (this.left as AvlTreeUniqueStringListInternalNode).removeAt(index);
    } else if (index > leftSize) {
      this.right = (this.right as AvlTreeUniqueStringListInternalNode).removeAt(index - leftSize - 1);
    } else {
      delete this.#valueToNode[this.value];
      if ((this.left.size === 0 && this.right.size === 0) || (this.left.size !== 0 && this.right.size === 0)) {
        const newNode = this.left;
        newNode.parent = this.parent;
        return newNode;
      }
      if (this.left.size === 0 && this.right.size !== 0) {
        const newNode = this.right;
        newNode.parent = this.parent;
        return newNode;
      }
      let temp = this.right as AvlTreeUniqueStringListInternalNode;
      while (temp.left.size !== 0) {
        temp = temp.left as AvlTreeUniqueStringListInternalNode;
      }
      this.value = temp.value;
      this.right = (this.right as AvlTreeUniqueStringListInternalNode).removeAt(0);
      this.#valueToNode[this.value] = this;
    }
    this.#recalculate();
    return this.#balance();
  }
  #balance(): AvlTreeUniqueStringListInternalNode {
    const parent = this.parent;
    const balance: number = this.#getBalance();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: AvlTreeUniqueStringListInternalNode = this;
    if (balance === -2) {
      const left = this.left as AvlTreeUniqueStringListInternalNode;
      if (left.#getBalance() === +1) {
        this.left = left.#rotateLeft();
      }
      result = this.#rotateRight();
    } else if (balance === +2) {
      const right = this.right as AvlTreeUniqueStringListInternalNode;
      if (right.#getBalance() === -1) {
        this.right = right.#rotateRight();
      }
      result = this.#rotateLeft();
    }
    result.parent = parent;
    return result;
  }
  #rotateLeft(): AvlTreeUniqueStringListInternalNode {
    const root = this.right as AvlTreeUniqueStringListInternalNode;
    root.parent = this.parent;
    this.right = root.left;
    this.right.parent = this;
    root.left = this;
    root.left.parent = root;
    this.#recalculate();
    root.#recalculate();
    return root;
  }
  #rotateRight(): AvlTreeUniqueStringListInternalNode {
    const root = this.left as AvlTreeUniqueStringListInternalNode;
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
    if (this.left instanceof AvlTreeUniqueStringListInternalNode) {
      this.left.assertStructure();
    }
    if (this.right instanceof AvlTreeUniqueStringListInternalNode) {
      this.right.assertStructure();
    }
    assert(this.height === Math.max(this.left.height, this.right.height) + 1);
    assert(this.size === this.left.size + this.right.size + 1);
    assert(Math.abs(this.#getBalance()) <= 1);
  }
}
export { type IndexableUniqueStringList, ArrayIndexableUniqueStringList, AvlTreeIndexableUniqueStringList };
