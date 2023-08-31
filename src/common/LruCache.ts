import { assert } from './util';
class LruCache<K, V> {
  private $p_values = new Map<K, V>();
  private $p_maxEntries: number;
  constructor(maxEntries: number) {
    assert(maxEntries > 0);
    this.$p_maxEntries = maxEntries;
  }
  $m_get(key: K): V | undefined {
    const entry = this.$p_values.get(key);
    if (entry) {
      this.$p_values.delete(key);
      this.$p_values.set(key, entry);
    }
    return entry;
  }
  $m_set(key: K, value: V) {
    if (this.$p_values.size >= this.$p_maxEntries) {
      const [keyToDelete] = this.$p_values.keys();
      if (keyToDelete) {
        this.$p_values.delete(keyToDelete);
      }
    }
    this.$p_values.set(key, value);
  }
  $m_invalidate(key: K): void {
    this.$p_values.delete(key);
  }
  $m_clear(): void {
    this.$p_values.clear();
  }
}
export { LruCache };
