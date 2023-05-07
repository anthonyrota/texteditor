import { Maybe, None, Some, isSome } from '../ruscel/maybe';
export function memoComputingValueNoArgs<T>(computeValue: () => T): () => T {
  let computedValue: Maybe<T> = None;
  return () => {
    if (isSome(computedValue)) {
      return computedValue.value;
    }
    const value = computeValue();
    computedValue = Some(value);
    return value;
  };
}
