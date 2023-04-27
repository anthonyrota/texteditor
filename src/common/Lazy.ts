import { Maybe, None, Some, isNone } from '../ruscel/maybe';
export class Lazy<T> {
  private $p_compute: () => T;
  private $p_computedValueMaybe: Maybe<T> = None;
  constructor(compute: () => T) {
    this.$p_compute = compute;
  }
  get value(): T {
    if (isNone(this.$p_computedValueMaybe)) {
      this.$p_computedValueMaybe = Some(this.$p_compute());
    }
    return this.$p_computedValueMaybe.value;
  }
}
