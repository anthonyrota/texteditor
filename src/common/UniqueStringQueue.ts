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
  private $p_firstNode: LinkedListNode | null = null;
  private $p_valueToNode = Object.create(null) as Record<string, LinkedListNode | undefined>;
  private $p_queueLength: number;
  constructor(values: Iterable<string>) {
    let lastNode: LinkedListNode | null = null;
    this.$p_queueLength = 0;
    for (const value of values) {
      if (lastNode === null) {
        this.$p_firstNode = new LinkedListNode(value, null, null);
        lastNode = this.$p_firstNode;
      } else {
        lastNode.nextNode = new LinkedListNode(value, lastNode, null);
        lastNode = lastNode.nextNode;
      }
      this.$p_valueToNode[value] = lastNode;
      this.$p_queueLength++;
    }
  }
  private $p_queueNotAddedValue(value: string): void {
    if (this.$p_firstNode === null) {
      this.$p_firstNode = new LinkedListNode(value, null, null);
    } else {
      const firstNode = this.$p_firstNode;
      this.$p_firstNode = new LinkedListNode(value, null, firstNode);
      firstNode.previousNode = this.$p_firstNode;
    }
    this.$p_valueToNode[value] = this.$p_firstNode;
    this.$p_queueLength++;
  }
  getIsQueued(value: string): boolean {
    return value in this.$p_valueToNode;
  }
  queueIfNotQueuedAlready(value: string): void {
    if (value in this.$p_valueToNode) {
      return;
    }
    this.$p_queueNotAddedValue(value);
  }
  queue(value: string): void {
    this.dequeue(value);
    this.$p_queueNotAddedValue(value);
  }
  dequeue(value: string): boolean {
    const node = this.$p_valueToNode[value];
    if (node === undefined) {
      return false;
    }
    delete this.$p_valueToNode[value];
    const { previousNode, nextNode } = node;
    if (previousNode === null) {
      if (nextNode === null) {
        this.$p_firstNode = null;
      } else {
        nextNode.previousNode = null;
        this.$p_firstNode = nextNode;
      }
    } else {
      if (nextNode === null) {
        previousNode.nextNode = null;
      } else {
        previousNode.nextNode = nextNode;
        nextNode.previousNode = previousNode;
      }
    }
    this.$p_queueLength--;
    return true;
  }
  shift(): string | null {
    if (this.$p_firstNode === null) {
      return null;
    }
    this.$p_queueLength--;
    const { value, nextNode } = this.$p_firstNode;
    delete this.$p_valueToNode[value];
    if (nextNode !== null) {
      nextNode.previousNode = null;
    }
    this.$p_firstNode = nextNode;
    return value;
  }
  getQueueLength(): number {
    return this.$p_queueLength;
  }
  toArray(): string[] {
    const values: string[] = [];
    let node = this.$p_firstNode;
    while (node !== null) {
      values.push(node.value);
      node = node.nextNode;
    }
    return values;
  }
}
export { UniqueStringQueue };
