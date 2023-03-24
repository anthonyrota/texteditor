class UnreachableCodeError extends Error {
  name = 'UnreachableCodeError';
  constructor(options?: ErrorOptions) {
    super('Unreachable code was executed', options);
  }
}
function assertUnreachable(value: never): never {
  throw new UnreachableCodeError({
    cause: {
      value,
    },
  });
}
function throwUnreachable(): never {
  throw new UnreachableCodeError();
}
class NotImplementedCodeError extends Error {
  name = 'NotImplementedCodeError';
  constructor(options?: ErrorOptions) {
    super('Not implemented.', options);
  }
}
function throwNotImplemented(): never {
  throw new NotImplementedCodeError();
}
function assert(shouldBeTrue: false, message?: string, options?: ErrorOptions): never;
function assert(shouldBeTrue: boolean, message?: string, options?: ErrorOptions): asserts shouldBeTrue is true;
function assert(shouldBeTrue: boolean, message?: string, options?: ErrorOptions): asserts shouldBeTrue is true {
  if (!shouldBeTrue) {
    throw new Error('Unexpected assertion failure' + (message ? ': ' + message : ''), options);
  }
}
function assertIsNotNullish<T>(value: T, options?: ErrorOptions): asserts value is Exclude<T, void | undefined | null> {
  assert(value != null, 'Value should not be null.', options);
}
export { UnreachableCodeError, assertUnreachable, throwUnreachable, NotImplementedCodeError, throwNotImplemented, assert, assertIsNotNullish };
