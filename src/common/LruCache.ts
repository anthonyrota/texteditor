import { assert } from './util';
class LruCache<K, V> {
  #values = new Map<K, V>();
  #maxEntries: number;
  constructor(maxEntries: number) {
    assert(maxEntries > 0);
    this.#maxEntries = maxEntries;
  }
  get(key: K): V | undefined {
    const entry = this.#values.get(key);
    if (entry) {
      this.#values.delete(key);
      this.#values.set(key, entry);
    }
    return entry;
  }
  set(key: K, value: V) {
    if (this.#values.size >= this.#maxEntries) {
      const [keyToDelete] = this.#values.keys();
      if (keyToDelete) {
        this.#values.delete(keyToDelete);
      }
    }
    this.#values.set(key, value);
  }
  invalidate(key: K): void {
    this.#values.delete(key);
  }
  clear(): void {
    this.#values.clear();
  }
}
export { LruCache };
