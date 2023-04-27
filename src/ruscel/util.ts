import { Disposable } from './disposable';
function joinErrors(errors: unknown[]): string {
  const lastPrefixLength = `  [#${errors.length}] `.length;
  const multilineErrorPrefix = '\n' + Array(lastPrefixLength + 1).join(' ');
  return errors
    .map((error, index) => {
      const prefix_ = `  [#${index + 1}] `;
      const prefix = '\n' + Array(lastPrefixLength - prefix_.length + 1).join(' ') + prefix_;
      const displayedError = String((error instanceof Error && error.stack) || error);
      return prefix + displayedError.split(/\r\n|\r|\n/).join(multilineErrorPrefix);
    })
    .join('');
}
function asyncReportError(error: unknown): void {
  setTimeout(() => {
    throw error;
  }, 0);
}
function removeOnce<T>(array: T[], item: T): void {
  const index = array.indexOf(item);
  if (index !== -1) {
    array.splice(index, 1);
  }
}
function requestAnimationFrameDisposable(callback: (time: number) => void, subscription: Disposable): void {
  if (!subscription.active) {
    return;
  }
  const animationId = requestAnimationFrame(callback);
  subscription.add(
    Disposable(() => {
      cancelAnimationFrame(animationId);
    }),
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setTimeoutDisposable<T extends any[]>(callback: (...args: T) => void, delayMs = 0, subscription: Disposable, ...args: T): void {
  if (!subscription.active) {
    return;
  }
  const id = setTimeout(
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-explicit-any
    callback as (...args: any[]) => void,
    delayMs,
    ...args,
  );
  subscription.add(
    Disposable(() => {
      clearTimeout(id);
    }),
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setIntervalDisposable<T extends any[]>(callback: (...args: T) => void, delayMs = 0, subscription: Disposable, ...args: T): void {
  if (!subscription.active) {
    return;
  }
  const id = setInterval(
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-explicit-any
    callback as (...args: any[]) => void,
    delayMs,
    ...args,
  );
  subscription.add(
    Disposable(() => {
      clearInterval(id);
    }),
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queueMicrotaskDisposable<T extends any[]>(callback: (...args: T) => void, subscription: Disposable, ...args: T): void {
  if (!subscription.active) {
    return;
  }
  queueMicrotask(() => {
    if (!subscription.active) {
      return;
    }
    callback(...args);
  });
}
let requestedShimmedIdleCallbacks = 0;
let requestedShimmedIdleCallbacksFactor = 0;
const shouldShimRequestIdleCallback = typeof requestIdleCallback === 'undefined';
function requestIdleCallbackDisposable(callback: IdleRequestCallback, disposable: Disposable, options?: IdleRequestOptions): void {
  if (!disposable.active) {
    return;
  }
  if (shouldShimRequestIdleCallback) {
    let ran = false;
    requestedShimmedIdleCallbacks++;
    requestedShimmedIdleCallbacksFactor = 1 / Math.sqrt(requestedShimmedIdleCallbacks + 1);
    disposable.add(
      Disposable(() => {
        if (ran) {
          return;
        }
        requestedShimmedIdleCallbacks--;
        requestedShimmedIdleCallbacksFactor = 1 / Math.sqrt(requestedShimmedIdleCallbacks + 1);
        clearTimeout(timeoutId);
      }),
    );
    const timeoutId = setTimeout(() => {
      ran = true;
      requestedShimmedIdleCallbacks--;
      requestedShimmedIdleCallbacksFactor = 1 / Math.sqrt(requestedShimmedIdleCallbacks + 1);
      const startTime = performance.now();
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, (startTime + 25 - performance.now()) * requestedShimmedIdleCallbacksFactor),
      });
    }, 0);
    return;
  }
  disposable.add(
    Disposable(() => {
      cancelIdleCallback(requestId);
    }),
  );
  const requestId = requestIdleCallback((deadline) => {
    if (!disposable.active) {
      return;
    }
    callback(deadline);
  }, options);
}
function addEventListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  element.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      element.removeEventListener(type, listener, options);
    }),
  );
}
function addDocumentEventListener<K extends keyof DocumentEventMap>(
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addDocumentEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addDocumentEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  document.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      document.removeEventListener(type, listener, options);
    }),
  );
}
function addWindowEventListener<K extends keyof WindowEventMap>(
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: Window, ev: WindowEventMap[K]) => any,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addWindowEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addWindowEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  window.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      window.removeEventListener(type, listener, options);
    }),
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMapFunction = (a: any) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Head<T extends any[]> = T extends [infer H, ...infer _] ? H : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Last<T extends any[]> = T extends [infer _] ? never : T extends [...infer _, infer Tl] ? Tl : never;
type Allowed<T extends AnyMapFunction[], Cache extends AnyMapFunction[] = []> = T extends []
  ? Cache
  : T extends [infer Lst]
  ? Lst extends AnyMapFunction
    ? Allowed<[], [...Cache, Lst]>
    : never
  : T extends [infer Fst, ...infer Lst]
  ? Fst extends AnyMapFunction
    ? Lst extends AnyMapFunction[]
      ? Head<Lst> extends AnyMapFunction
        ? ReturnType<Fst> extends Head<Parameters<Head<Lst>>>
          ? Allowed<Lst, [...Cache, Fst]>
          : never
        : never
      : never
    : never
  : never;
type Return<T extends AnyMapFunction[]> = Last<T> extends AnyMapFunction ? ReturnType<Last<T>> : never;
function pipe<T>(value: T): T;
function pipe<T, R>(value: T, f1: (value: T) => R): R;
function pipe<T, A, R>(value: T, f1: (value: T) => A, f2: (value: A) => R): R;
function pipe<T, A, B, R>(value: T, f1: (value: T) => A, f2: (value: A) => B, f3: (value: B) => R): R;
function pipe<T, A, B, C, R>(value: T, f1: (value: T) => A, f2: (value: A) => B, f3: (value: B) => C, f4: (value: C) => R): R;
function pipe<T, A, B, C, D, R>(value: T, f1: (value: T) => A, f2: (value: A) => B, f3: (value: B) => C, f4: (value: C) => D, f5: (value: D) => R): R;
function pipe<T, A, B, C, D, E, R>(
  value: T,
  f1: (value: T) => A,
  f2: (value: A) => B,
  f3: (value: B) => C,
  f4: (value: C) => D,
  f5: (value: D) => E,
  f6: (value: E) => R,
): R;
function pipe<T, A, B, C, D, E, F, R>(
  value: T,
  f1: (value: T) => A,
  f2: (value: A) => B,
  f3: (value: B) => C,
  f4: (value: C) => D,
  f5: (value: D) => E,
  f6: (value: E) => F,
  f7: (value: F) => R,
): R;
function pipe<T, A, B, C, D, E, F, G, R>(
  value: T,
  f1: (value: T) => A,
  f2: (value: A) => B,
  f3: (value: B) => C,
  f4: (value: C) => D,
  f5: (value: D) => E,
  f6: (value: E) => F,
  f7: (value: F) => G,
  f8: (value: G) => R,
): R;
function pipe<T, A, B, C, D, E, F, G, H, R>(
  value: T,
  f1: (value: T) => A,
  f2: (value: A) => B,
  f3: (value: B) => C,
  f4: (value: C) => D,
  f5: (value: D) => E,
  f6: (value: E) => F,
  f7: (value: F) => G,
  f8: (value: G) => H,
  f9: (value: H) => R,
): R;
function pipe<
  FirstParameter,
  PipeFunctions extends [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (value: FirstParameter) => any,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    AnyMapFunction,
    ...AnyMapFunction[],
  ],
>(value: FirstParameter, ...fns: PipeFunctions): Allowed<PipeFunctions> extends never ? never : Return<PipeFunctions>;
function pipe<T>(value: T, ...fns: ((value: T) => T)[]): T {
  return fns.reduce((acc, elem) => elem(acc), value);
}
export function flow(): <T>(x: T) => T;
export function flow<T, R>(f1: (x: T) => R): (x: T) => R;
export function flow<T, A, R>(f1: (x: T) => A, f2: (x: A) => R): (x: T) => R;
export function flow<T, A, B, R>(f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => R): (x: T) => R;
export function flow<T, A, B, C, R>(f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => C, f4: (x: C) => R): (x: T) => R;
export function flow<T, A, B, C, D, R>(f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => C, f4: (x: C) => D, f5: (x: D) => R): (x: T) => R;
export function flow<T, A, B, C, D, E, R>(f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => C, f4: (x: C) => D, f5: (x: D) => E, f6: (x: E) => R): (x: T) => R;
export function flow<T, A, B, C, D, E, F, R>(
  f1: (x: T) => A,
  f2: (x: A) => B,
  f3: (x: B) => C,
  f4: (x: C) => D,
  f5: (x: D) => E,
  f6: (x: E) => F,
  f7: (x: F) => R,
): (x: T) => R;
export function flow<T, A, B, C, D, E, F, G, R>(
  f1: (x: T) => A,
  f2: (x: A) => B,
  f3: (x: B) => C,
  f4: (x: C) => D,
  f5: (x: D) => E,
  f6: (x: E) => F,
  f7: (x: F) => G,
  f8: (x: G) => R,
): (x: T) => R;
export function flow<T, A, B, C, D, E, F, G, H, R>(
  f1: (x: T) => A,
  f2: (x: A) => B,
  f3: (x: B) => C,
  f4: (x: C) => D,
  f5: (x: D) => E,
  f6: (x: E) => F,
  f7: (x: F) => G,
  f8: (x: G) => H,
  f9: (x: H) => R,
): (x: T) => R;
export function flow<T, A, B, C, D, E, F, G, H, R>(
  f1: (x: T) => A,
  f2: (x: A) => B,
  f3: (x: B) => C,
  f4: (x: C) => D,
  f5: (x: D) => E,
  f6: (x: E) => F,
  f7: (x: F) => G,
  f8: (x: G) => H,
  f9: (x: H) => R,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...funcs: Array<(x: any) => any> // TODO.
): (x: T) => R;
export function flow<T>(...fns: Array<(x: T) => T>): (x: T) => T;
export function flow<T>(...fns: Array<(x: T) => T>): (x: T) => T {
  return (x: T): T => fns.reduce((x, f) => f(x), x);
}
export {
  joinErrors,
  asyncReportError,
  removeOnce,
  requestAnimationFrameDisposable,
  setTimeoutDisposable,
  setIntervalDisposable,
  queueMicrotaskDisposable,
  requestIdleCallbackDisposable,
  addEventListener,
  addDocumentEventListener,
  addWindowEventListener,
  pipe,
};
