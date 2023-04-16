import { Maybe, None, Some, isNone } from '../ruscel/maybe';
export class Lazy<T> {
  #compute: () => T;
  #computedValueMaybe: Maybe<T> = None;
  constructor(compute: () => T) {
    this.#compute = compute;
  }
  get value(): T {
    if (isNone(this.#computedValueMaybe)) {
      this.#computedValueMaybe = Some(this.#compute());
    }
    return this.#computedValueMaybe.value;
  }
}
