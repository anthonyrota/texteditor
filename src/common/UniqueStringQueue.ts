class LinkedListNode {
  $m_value: string;
  $m_previousNode: LinkedListNode | null;
  $m_nextNode: LinkedListNode | null;
  constructor(value: string, previousNode: LinkedListNode | null, nextNode: LinkedListNode | null) {
    this.$m_value = value;
    this.$m_previousNode = previousNode;
    this.$m_nextNode = nextNode;
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
        lastNode.$m_nextNode = new LinkedListNode(value, lastNode, null);
        lastNode = lastNode.$m_nextNode;
      }
      this.$p_valueToNode[value] = lastNode;
      this.$p_queueLength++;
    }
  }
  $m_getIsQueued(value: string): boolean {
    return value in this.$p_valueToNode;
  }
  $m_queue(value: string): void {
    this.$m_dequeue(value);
    if (this.$p_firstNode === null) {
      this.$p_firstNode = new LinkedListNode(value, null, null);
    } else {
      const firstNode = this.$p_firstNode;
      this.$p_firstNode = new LinkedListNode(value, null, firstNode);
      firstNode.$m_previousNode = this.$p_firstNode;
    }
    this.$p_valueToNode[value] = this.$p_firstNode;
    this.$p_queueLength++;
  }
  $m_dequeue(value: string): boolean {
    const node = this.$p_valueToNode[value];
    if (node === undefined) {
      return false;
    }
    delete this.$p_valueToNode[value];
    const { $m_previousNode: previousNode, $m_nextNode: nextNode } = node;
    if (previousNode === null) {
      if (nextNode === null) {
        this.$p_firstNode = null;
      } else {
        nextNode.$m_previousNode = null;
        this.$p_firstNode = nextNode;
      }
    } else {
      if (nextNode === null) {
        previousNode.$m_nextNode = null;
      } else {
        previousNode.$m_nextNode = nextNode;
        nextNode.$m_previousNode = previousNode;
      }
    }
    this.$p_queueLength--;
    return true;
  }
  $m_shift(): string | null {
    if (this.$p_firstNode === null) {
      return null;
    }
    this.$p_queueLength--;
    const { $m_value: value, $m_nextNode: nextNode } = this.$p_firstNode;
    delete this.$p_valueToNode[value];
    if (nextNode !== null) {
      nextNode.$m_previousNode = null;
    }
    this.$p_firstNode = nextNode;
    return value;
  }
  $m_getQueueLength(): number {
    return this.$p_queueLength;
  }
  $m_toArray(): string[] {
    const values: string[] = [];
    let node = this.$p_firstNode;
    while (node !== null) {
      values.push(node.$m_value);
      node = node.$m_nextNode;
    }
    return values;
  }
  *[Symbol.iterator](): IterableIterator<string> {
    for (const value in this.$p_valueToNode) {
      yield value;
    }
  }
}
export { UniqueStringQueue };
