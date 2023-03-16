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
function requestAnimationFrameDisposable(callback: (time: number) => void, subscription?: Disposable): void {
    if (subscription && !subscription.active) {
        return;
    }
    const animationId = requestAnimationFrame(callback);
    if (subscription) {
        subscription.add(
            Disposable(() => {
                cancelAnimationFrame(animationId);
            }),
        );
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setTimeoutDisposable<T extends any[]>(callback: (...args: T) => void, delayMs = 0, subscription?: Disposable, ...args: T): void {
    if (subscription && !subscription.active) {
        return;
    }
    const id = setTimeout(
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-explicit-any
        callback as (...args: any[]) => void,
        delayMs,
        ...args,
    );
    if (subscription) {
        subscription.add(
            Disposable(() => {
                clearTimeout(id);
            }),
        );
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setIntervalDisposable<T extends any[]>(callback: (...args: T) => void, delayMs = 0, subscription?: Disposable, ...args: T): void {
    if (subscription && !subscription.active) {
        return;
    }
    const id = setInterval(
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-explicit-any
        callback as (...args: any[]) => void,
        delayMs,
        ...args,
    );
    if (subscription) {
        subscription.add(
            Disposable(() => {
                clearInterval(id);
            }),
        );
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queueMicrotaskDisposable<T extends any[]>(callback: (...args: T) => void, subscription?: Disposable, ...args: T): void {
    if (subscription && !subscription.active) {
        return;
    }
    queueMicrotask(() => {
        if (subscription && !subscription.active) {
            return;
        }
        callback(...args);
    });
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
type Return<T extends AnyMapFunction[]> = Last<T> extends AnyMapFunction ? ReturnType<Last<T>> : never; /** @public */
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
export {
    joinErrors,
    asyncReportError,
    removeOnce,
    requestAnimationFrameDisposable,
    setTimeoutDisposable,
    setIntervalDisposable,
    queueMicrotaskDisposable,
    pipe,
};
