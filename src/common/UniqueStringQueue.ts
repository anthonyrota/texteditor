import { Maybe, None, Some } from '../ruscel/maybe';
import { IndexableUniqueStringList } from './IndexableUniqueStringList';
class UniqueStringQueue {
  #stringList: IndexableUniqueStringList;
  constructor(values: IterableIterator<string>) {
    this.#stringList = new IndexableUniqueStringList([]);
    for (const value of values) {
      this.#stringList.insertBefore(0, [value]);
    }
  }
  queue(value: string): void {
    const index = this.#stringList.indexOf(value);
    if (index === 0) {
      return;
    }
    if (index !== -1) {
      this.#stringList.remove(index, index);
    }
    this.#stringList.insertBefore(0, [value]);
  }
  dequeue(value: string): void {
    const index = this.#stringList.indexOf(value);
    if (index === -1) {
      return;
    }
    this.#stringList.remove(index, index);
  }
  shift(): Maybe<string> {
    if (this.#stringList.getLength() === 0) {
      return None;
    }
    const firstValue = this.#stringList.access(0);
    this.#stringList.remove(0, 0);
    return Some(firstValue);
  }
  getQueueLength(): number {
    return this.#stringList.getLength();
  }
}
export { UniqueStringQueue };
