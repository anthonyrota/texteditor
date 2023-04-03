class LinkedListNode {
  value: string;
  previousNode: LinkedListNode | null;
  nextNode: LinkedListNode | null;
  constructor(value: string, previousNode: LinkedListNode | null, nextNode: LinkedListNode | null) {
    this.value = value;
    this.previousNode = previousNode;
    this.nextNode = nextNode;
  }
}
class UniqueStringQueue {
  #firstNode: LinkedListNode | null = null;
  #valueToNode = Object.create(null) as Record<string, LinkedListNode | undefined>;
  #queueLength: number;
  constructor(values: IterableIterator<string>) {
    let lastNode: LinkedListNode | null = null;
    this.#queueLength = 0;
    for (const value of values) {
      if (lastNode === null) {
        this.#firstNode = new LinkedListNode(value, null, null);
        lastNode = this.#firstNode;
      } else {
        lastNode.nextNode = new LinkedListNode(value, lastNode, null);
        lastNode = lastNode.nextNode;
      }
      this.#valueToNode[value] = lastNode;
      this.#queueLength++;
    }
  }
  queue(value: string): void {
    this.dequeue(value);
    if (this.#firstNode === null) {
      this.#firstNode = new LinkedListNode(value, null, null);
    } else {
      const firstNode = this.#firstNode;
      this.#firstNode = new LinkedListNode(value, null, firstNode);
      firstNode.previousNode = this.#firstNode;
    }
    this.#valueToNode[value] = this.#firstNode;
    this.#queueLength++;
  }
  dequeue(value: string): void {
    const node = this.#valueToNode[value];
    if (node === undefined) {
      return;
    }
    delete this.#valueToNode[value];
    const { previousNode, nextNode } = node;
    if (previousNode === null) {
      if (nextNode === null) {
        this.#firstNode = null;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.#firstNode = this.#firstNode!.nextNode;
      }
    } else {
      if (nextNode === null) {
        previousNode.nextNode = null;
      } else {
        previousNode.nextNode = nextNode;
        nextNode.previousNode = previousNode;
      }
    }
    this.#queueLength--;
  }
  shift(): string | null {
    if (this.#firstNode === null) {
      return null;
    }
    this.#queueLength--;
    const { value, nextNode } = this.#firstNode;
    delete this.#valueToNode[value];
    this.#firstNode = nextNode;
    return value;
  }
  getQueueLength(): number {
    return this.#queueLength;
  }
}
export { UniqueStringQueue };
