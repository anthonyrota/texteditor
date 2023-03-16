enum MaybeType {
    Some = 'Some',
    None = 'None',
}
interface Some<T> {
    type: MaybeType.Some;
    value: T;
}
function Some<T>(value: T): Some<T> {
    return {
        type: MaybeType.Some,
        value,
    };
}
function isSome(maybe: Maybe<unknown>): maybe is Some<unknown> {
    return maybe.type === MaybeType.Some;
}
interface None {
    type: MaybeType.None;
}
const None: None = {
    type: MaybeType.None,
};
function isNone(maybe: Maybe<unknown>): maybe is None {
    return maybe.type === MaybeType.None;
}
type Maybe<T> = Some<T> | None;
export { MaybeType, Some, isSome, None, isNone, type Maybe };
