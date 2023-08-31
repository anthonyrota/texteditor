const enum MaybeType {
  Some = 'Some',
  None = 'None',
}
interface Some<T> {
  $m_type: MaybeType.Some;
  $m_value: T;
}
function Some<T>(value: T): Some<T> {
  return {
    $m_type: MaybeType.Some,
    $m_value: value,
  };
}
function isSome(maybe: Maybe<unknown>): maybe is Some<unknown> {
  return maybe.$m_type === MaybeType.Some;
}
interface None {
  $m_type: MaybeType.None;
}
const None: None = {
  $m_type: MaybeType.None,
};
function isNone(maybe: Maybe<unknown>): maybe is None {
  return maybe.$m_type === MaybeType.None;
}
type Maybe<T> = Some<T> | None;
export { MaybeType, Some, isSome, None, isNone, type Maybe };
