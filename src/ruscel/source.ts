import { Disposable, implDisposableMethods } from './disposable';
import { Distributor } from './distributor';
import { Maybe, Some, None, isNone } from './maybe';
import { ScheduleFunction, ScheduleInterval, ScheduleTimeout } from './schedule';
import { asyncReportError, pipe } from './util';
type PushType = 0;
const PushType: PushType = 0;
type ThrowType = 1;
const ThrowType: ThrowType = 1;
type EndType = 2;
const EndType: EndType = 2;
type EventType = PushType | ThrowType | EndType;
interface Push<T> {
    readonly type: PushType;
    readonly value: T;
}
interface Throw {
    readonly type: ThrowType;
    readonly error: unknown;
}
interface End {
    readonly type: EndType;
}
type Event<T> = Push<T> | Throw | End;
function Push<T>(value: T): Push<T> {
    return { type: PushType, value };
}
function Throw(error: unknown): Throw {
    return { type: ThrowType, error };
}
const End: End = { type: EndType };
const $$Sink = Symbol('Sink');
interface Sink<T> extends Disposable {
    [$$Sink]: undefined;
    (event: Event<T>): void;
}
function Sink<T>(onEvent: (event: Event<T>) => void): Sink<T> {
    // TODO: handle if onEvent is a Sink?
    const disposable = Disposable();
    const sink = implDisposableMethods((event: Event<T>): void => {
        if (!disposable.active) {
            if (event.type === ThrowType) {
                const { error } = event;
                asyncReportError(
                    `A Throw event was intercepted by a disposed Sink: ${
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        (error instanceof Error && error.stack) || error
                    }`,
                );
            }
            return;
        }
        if (event.type !== PushType) {
            disposable.dispose();
        }
        try {
            onEvent(event);
        } catch (error) {
            asyncReportError(error);
            disposable.dispose();
        }
    }, disposable);
    (sink as Sink<T>)[$$Sink] = undefined;
    return sink as unknown as Sink<T>;
}
function isSink(value: unknown): value is Sink<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value != null && $$Sink in (value as any);
}
const $$Source = Symbol('Source');
interface Source<T> {
    [$$Source]: undefined;
    (sink: Sink<T>): void;
}
function Source<T>(produce: (sink: Sink<T>) => void): Source<T> {
    function safeSource(sink: Sink<T>): void {
        if (!sink.active) {
            return;
        }
        try {
            produce(sink);
        } catch (error) {
            let active: boolean;
            try {
                // This can throw if one of the sink's parents is disposed but
                // the sink itself is not disposed yet, meaning while checking
                // if it is active, it disposes itself.
                active = sink.active;
            } catch (innerError) {
                // This try/catch is to ensure that when sink.active throws
                // synchronously, the original error caught when calling the
                // base function is also reported.
                asyncReportError(error);
                throw innerError;
            }
            if (active) {
                sink(Throw(error));
            } else {
                asyncReportError(error);
            }
        }
    }
    (safeSource as Source<T>)[$$Source] = undefined;
    return safeSource as Source<T>;
}
function isSource(value: unknown): value is Source<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value != null && $$Source in (value as any);
}
function subscribe<T>(onEvent: (event: Event<T>) => void, disposable: Disposable): (source: Source<T>) => void {
    const sink = Sink(onEvent);
    disposable.add(sink);
    return (source) => {
        source(sink);
    };
}
function pushArrayItemsToSink<T>(array: ArrayLike<T>, sink: Sink<T>): void {
    for (let i = 0; sink.active && i < array.length; i++) {
        sink(Push(array[i]));
    }
}
function fromArray<T>(array: ArrayLike<T>): Source<T> {
    return Source((sink) => {
        pushArrayItemsToSink(array, sink);
        sink(End);
    });
}
function ofEvent<T>(event: Event<T>, schedule?: ScheduleFunction): Source<T>;
function ofEvent<T>(event: Event<T>, schedule?: ScheduleFunction): Source<T> {
    if (schedule) {
        return Source((sink) => {
            schedule(() => {
                sink(event);
                sink(End);
            }, sink);
        });
    }
    return Source((sink) => {
        sink(event);
        sink(End);
    });
}
function combine<T extends unknown[]>(sources: { [K in keyof T]: Source<T[K]> }): Source<T>;
function combine<T>(sources: Source<T>[]): Source<T[]> {
    if (sources.length === 0) {
        return ofEvent(End);
    }
    return Source((sink) => {
        const valueMaybes: Maybe<T>[] = [];
        for (let i = 0; i < sources.length; i++) {
            valueMaybes[i] = None;
        }
        let responded = 0;
        for (let i = 0; i < sources.length && sink.active; i++) {
            const sourceSink = Sink<T>((event) => {
                if (event.type !== PushType) {
                    sink(event);
                    return;
                }
                if (isNone(valueMaybes[i])) {
                    responded++;
                }
                valueMaybes[i] = Some(event.value);
                if (responded === sources.length) {
                    sink(Push(valueMaybes.map((valueMaybe) => (valueMaybe as Some<T>).value)));
                }
            });
            sink.add(sourceSink);
            sources[i](sourceSink);
        }
    });
}
interface Operator<T, U> {
    (source: Source<T>): Source<U>;
}
interface IdentityOperator {
    <T>(source: Source<T>): Source<T>;
}
function _createMergeMapOperator(expand: false): <T, U>(transform: (value: T, index: number) => Source<U>, maxConcurrent?: number) => Operator<T, U>;
function _createMergeMapOperator(expand: true): <T>(transform: (value: T, index: number) => Source<T>, maxConcurrent?: number) => Operator<T, T>;
function _createMergeMapOperator(expand: boolean): <T, U>(transform: (value: T, index: number) => Source<U>, maxConcurrent?: number) => Operator<T, U> {
    return <T, U>(transform: (value: T, index: number) => Source<U>, maxConcurrent = Infinity) => {
        return (source: Source<T>) => {
            return Source<U>((sink) => {
                const pushEvents: Push<T>[] = [];
                let completed = false;
                let active = 0;
                let idx = 0;
                function onInnerEvent(event: Event<U>): void {
                    if (event.type === PushType && expand) {
                        sourceSink(event as unknown as Push<T>);
                        return;
                    }
                    if (event.type === EndType) {
                        active--;
                        const nextPush = pushEvents.shift();
                        if (nextPush) {
                            transformPush(nextPush);
                            return;
                        }
                        if (active !== 0 || !completed) {
                            return;
                        }
                    }
                    sink(event);
                }
                function transformPush(pushEvent: Push<T>): void {
                    let innerSource: Source<U>;
                    try {
                        innerSource = transform(pushEvent.value, idx++);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                    const innerSink = Sink(onInnerEvent);
                    sink.add(innerSink);
                    active++;
                    innerSource(innerSink);
                }
                const sourceSink = Sink<T>((event) => {
                    if (event.type === PushType) {
                        if (active < maxConcurrent) {
                            transformPush(event);
                        } else {
                            pushEvents.push(event);
                        }
                        return;
                    }
                    if (event.type === EndType) {
                        completed = true;
                        if (pushEvents.length !== 0 || active !== 0) {
                            return;
                        }
                    }
                    sink(event);
                });
                sink.add(sourceSink);
                source(sourceSink);
            });
        };
    };
}
const flatMap = _createMergeMapOperator(false);
function flat(maxConcurrent?: number): <T>(source: Source<Source<T>>) => Source<T> {
    return flatMap(<T>(source: Source<T>) => source, maxConcurrent);
}
function map<T, R>(transform: (value: T, index: number) => R): Operator<T, R> {
    return (source) =>
        Source((sink) => {
            let idx = 0;
            const sourceSink = Sink<T>((event) => {
                if (event.type === PushType) {
                    let transformed: R;
                    try {
                        transformed = transform(event.value, idx++);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                    sink(Push(transformed));
                    return;
                }
                sink(event);
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
function filter<T, S extends T>(predicate: (value: T, index: number) => value is S): Operator<T, S>;
function filter<T>(predicate: (value: T, index: number) => boolean): Operator<T, T>;
function filter<T>(predicate: (value: T, index: number) => boolean): Operator<T, T> {
    return (source) =>
        Source((sink) => {
            let idx = 0;
            const sourceSink = Sink<T>((event) => {
                if (event.type === PushType) {
                    let passThrough: boolean;
                    try {
                        passThrough = predicate(event.value, idx++);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                    if (!passThrough) {
                        return;
                    }
                }
                sink(event);
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
function filterMap<T, R>(transform: (value: T, index: number) => Maybe<R>): Operator<T, R> {
    return (source) =>
        Source((sink) => {
            let idx = 0;
            const sourceSink = Sink<T>((event) => {
                if (event.type === PushType) {
                    let maybe: Maybe<R>;
                    try {
                        maybe = transform(event.value, idx++);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                    if (isNone(maybe)) {
                        return;
                    }
                    sink(Push(maybe.value));
                    return;
                }
                sink(event);
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
function skip(amount: number): IdentityOperator {
    return <T>(source: Source<T>) =>
        Source<T>((sink) => {
            let count = 0;
            const sourceSink = Sink<T>((event) => {
                if (event.type === PushType && ++count <= amount) {
                    return;
                }
                sink(event);
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
function lazy<T>(createSource: () => Source<T>): Source<T> {
    return Source((sink) => {
        let source: Source<T>;
        try {
            source = createSource();
        } catch (error) {
            sink(Throw(error));
            return;
        }
        source(sink);
    });
}
interface SpyOperators {
    spyAll: <T>(onEvent: (event: Event<T>) => void) => Operator<T, T>;
    spyPush: <T>(onPush: (value: T, index: number) => void) => Operator<T, T>;
    spyThrow: (onThrow: (error: unknown) => void) => IdentityOperator;
    spyEnd: (onEnd: () => void) => IdentityOperator;
}
function _createSpyOperators(spyAfter: boolean): SpyOperators {
    function spy<T>(onEvent: (event: Event<T>) => void): Operator<T, T> {
        return (source) =>
            Source((sink) => {
                const sourceSink = Sink<T>((event) => {
                    if (spyAfter) {
                        sink(event);
                    }
                    try {
                        onEvent(event);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                    if (!spyAfter) {
                        sink(event);
                    }
                });
                sink.add(sourceSink);
                source(sourceSink);
            });
    }
    function spyPush<T>(onPush: (value: T, index: number) => void): Operator<T, T> {
        return (source) =>
            lazy(() => {
                let idx = 0;
                return pipe(
                    source,
                    spy<T>((event) => {
                        if (event.type === PushType) {
                            onPush(event.value, idx++);
                        }
                    }),
                );
            });
    }
    function spyThrow(onThrow: (error: unknown) => void): IdentityOperator {
        return spy((event) => {
            if (event.type === ThrowType) {
                onThrow(event.error);
            }
        });
    }
    function spyEnd(onEnd: () => void): IdentityOperator {
        return spy((event) => {
            if (event.type === EndType) {
                onEnd();
            }
        });
    }
    return {
        spyAll: spy,
        spyPush: spyPush,
        spyThrow: spyThrow,
        spyEnd: spyEnd,
    };
}
const spyBeforeOperators = _createSpyOperators(false);
const spyAfterOperators = _createSpyOperators(true);
function memoConsecutive(): IdentityOperator;
function memoConsecutive<T>(isEqual: (keyA: T, keyB: T, currentIndex: number) => boolean): Operator<T, T>;
function memoConsecutive<T, K>(isEqual: ((keyA: K, keyB: K, currentIndex: number) => boolean) | undefined, getKey: (value: T) => K): Operator<T, T>;
function memoConsecutive<T, K>(
    computeIsEqual: (keyA: K, keyB: K, currentIndex: number) => boolean = (a: K, b: K) => a === b,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    getKey: (value: T) => K = (x: any) => x,
): Operator<T, T> {
    return (source) =>
        lazy(() => {
            let lastKey: Maybe<K> = None;
            return pipe(
                source,
                filter((value, index) => {
                    if (isNone(lastKey)) {
                        lastKey = Some(getKey(value));
                        return true;
                    }
                    const currentKey = getKey(value);
                    const isEqual = computeIsEqual(lastKey.value, currentKey, index);
                    if (!isEqual) {
                        lastKey = Some(currentKey);
                    }
                    return !isEqual;
                }),
            );
        });
}
function fromScheduleFunction<T extends unknown[]>(schedule: ScheduleFunction<T>): Source<T> {
    return Source((sink) => {
        function callback(...args: T): void {
            sink(Push(args));
            // We don't know if the user provided function actually checks if
            // the sink is active or not, even though it should.
            if (sink.active) {
                schedule(callback, sink);
            }
        }
        schedule(callback, sink);
    });
}
const replaceWithValueIndex = map((_, idx: number) => idx);
function interval(delayMs: number): Source<number> {
    return replaceWithValueIndex(fromScheduleFunction(ScheduleInterval(delayMs)));
}
function startWith<T>(...values: T[]): <U>(source: Source<U>) => Source<T | U> {
    return <U>(source: Source<U>) =>
        Source<T | U>((sink) => {
            pushArrayItemsToSink(values, sink);
            source(sink);
        });
}
interface ControllableSource<T> extends Source<T> {
    produce(): void;
}
function shareControlled<T>(Distributor_: () => Distributor<T>): (source: Source<T>) => ControllableSource<T>;
function shareControlled(Distributor_?: typeof Distributor): <T>(source: Source<T>) => ControllableSource<T>;
function shareControlled(Distributor_ = Distributor): <T>(source: Source<T>) => ControllableSource<T> {
    return <T>(source: Source<T>) => {
        let distributor: Distributor<T> | undefined;
        const controllable = Source<T>((sink) => {
            if (!distributor || !distributor.active) {
                distributor = Distributor_();
            }
            distributor(sink);
        }) as ControllableSource<T>;
        function produce(): void {
            if (!distributor || !distributor.active) {
                distributor = Distributor_();
            }
            source(distributor);
        }
        controllable.produce = produce;
        return controllable;
    };
}
function share<T>(Distributor_: () => Distributor<T>): Operator<T, T>;
function share(Distributor_?: typeof Distributor): IdentityOperator;
function share(Distributor_ = Distributor): IdentityOperator {
    return <T>(source: Source<T>): Source<T> => {
        let distributor: Distributor<T>;
        const shared = pipe(
            source,
            shareControlled(() => {
                distributor = Distributor_();
                return distributor;
            }),
        );
        let subscriberCount = 0;
        return Source((sink) => {
            sink.add(
                Disposable(() => {
                    subscriberCount--;
                    if (subscriberCount === 0) {
                        distributor.dispose();
                    }
                }),
            );
            const _subscriberCount = subscriberCount;
            subscriberCount++;
            shared(sink);
            if (_subscriberCount === 0 && subscriberCount !== 0) {
                shared.produce();
            }
        });
    };
}
function shareOnce<T>(Distributor_: () => Distributor<T>): Operator<T, T>;
function shareOnce(Distributor_?: typeof Distributor): IdentityOperator;
function shareOnce(Distributor_ = Distributor): IdentityOperator {
    return <T>(source: Source<T>): Source<T> => {
        const distributor = Distributor_<T>();
        return pipe(
            source,
            share(() => distributor),
        );
    };
}
function sharePersist<T>(Distributor_: () => Distributor<T>): Operator<T, T>;
function sharePersist(Distributor_?: typeof Distributor): IdentityOperator;
function sharePersist(Distributor_ = Distributor): IdentityOperator {
    return <T>(source: Source<T>): Source<T> => {
        let distributor: Distributor<T> | undefined;
        const shared = pipe(
            source,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            shareControlled(() => distributor!),
        );
        return Source((sink) => {
            if (!distributor) {
                distributor = Distributor_();
            }
            shared(sink);
            shared.produce();
        });
    };
}
function shareTransform<T, U>(Distributor_: () => Distributor<T>, transform: (shared: Source<T>) => Source<U>): Operator<T, U>;
function shareTransform<U>(Distributor_: typeof Distributor, transform: <T>(source: Source<T>) => Source<U>): <T>(shared: Source<T>) => Source<U>;
function shareTransform<T, U>(Distributor_: () => Distributor<T>, transform: (shared: Source<T>) => Source<U>): Operator<T, U> {
    return (source) =>
        Source((sink) => {
            const distributor = Distributor_();
            let transformed: Source<U>;
            try {
                transformed = transform(distributor);
            } catch (error) {
                sink(Throw(error));
                return;
            }
            transformed(sink);
            sink.add(distributor);
            source(distributor);
        });
}
function timer(durationMs: number): Source<never> {
    return ofEvent(End, ScheduleTimeout(durationMs));
}
function take(amount: number): IdentityOperator {
    if (amount === 0) {
        return () => ofEvent(End);
    }
    return <T>(source: Source<T>) =>
        Source<T>((sink) => {
            let count = 0;
            const sourceSink = Sink<T>((event) => {
                // If called during last event, exit.
                if (count >= amount) {
                    return;
                }
                if (event.type === PushType) {
                    count++;
                }
                sink(event);
                if (count >= amount) {
                    sink(End);
                }
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
type DebounceTrailingRestart = 'restart';
const DebounceTrailingRestart: DebounceTrailingRestart = 'restart';
interface DebounceConfig {
    leading?: boolean | null;
    trailing?: boolean | DebounceTrailingRestart | null;
    emitPendingOnEnd?: boolean | null;
}
const defaultDebounceConfig: DebounceConfig = {
    leading: false,
    trailing: true,
    emitPendingOnEnd: true,
};
type InitialDurationInfo =
    | [/* durationSource */ Source<unknown>, /* maxDurationSource */ (Source<unknown> | undefined | null)?]
    | [/* durationSource */ undefined | null, /* maxDurationSource */ Source<unknown>];
function debounce<T>(
    getDurationSource: (value: T, index: number) => Source<unknown>,
    getInitialDurationRange?: ((firstDebouncedValue: T, index: number) => InitialDurationInfo) | null,
    config?: DebounceConfig | null,
): Operator<T, T>;
function debounce<T>(
    getDurationSource: undefined | null,
    getInitialDurationRange: (firstDebouncedValue: T, index: number) => InitialDurationInfo,
    config?: DebounceConfig | null,
): Operator<T, T>;
function debounce<T>(
    getDurationSource?: ((value: T, index: number) => Source<unknown>) | null,
    getInitialDurationRange?: ((firstDebouncedValue: T, index: number) => InitialDurationInfo) | null,
    config?: DebounceConfig | null,
): Operator<T, T> {
    let leading: DebounceConfig['leading'];
    let trailing: DebounceConfig['trailing'];
    let emitPendingOnEnd: DebounceConfig['emitPendingOnEnd'];
    if (config) {
        leading = config.leading == null ? defaultDebounceConfig.leading : config.leading;
        trailing = config.trailing == null ? defaultDebounceConfig.trailing : config.trailing;
        emitPendingOnEnd = config.emitPendingOnEnd == null ? defaultDebounceConfig.emitPendingOnEnd : config.emitPendingOnEnd;
    }
    return (source) =>
        Source<T>((sink) => {
            let latestPush: Push<T>;
            let durationSink: Sink<unknown>;
            let maxDurationSink: Sink<unknown> | true | undefined;
            let distributing = false;
            let lastPushedIdx = 0;
            let idx = 0;
            function onDurationEvent(event: Event<unknown>): void {
                if (event.type === ThrowType) {
                    sink(event);
                    return;
                }
                if (durationSink) durationSink.dispose();
                if (maxDurationSink && maxDurationSink !== true) {
                    maxDurationSink.dispose();
                }
                maxDurationSink = undefined;
                if (trailing && idx > lastPushedIdx) {
                    if (trailing === DebounceTrailingRestart) {
                        const _latestPush = latestPush;
                        const _idx = idx;
                        distributing = true;
                        lastPushedIdx = _idx;
                        sink(_latestPush);
                        distributing = false;
                        startDebounce(_latestPush, _idx);
                    } else {
                        // No logic after this so we can straight up push.
                        sink(latestPush);
                    }
                }
            }
            function restartDebounce(durationSource?: Source<unknown>): void {
                if (!getDurationSource) {
                    return;
                }
                if (durationSink) durationSink.dispose();
                durationSink = Sink(onDurationEvent);
                sourceSink.add(durationSink);
                let durationSource_ = durationSource;
                if (!durationSource_) {
                    try {
                        durationSource_ = getDurationSource(latestPush.value, idx);
                    } catch (error) {
                        sink(Throw(error));
                        return;
                    }
                }
                durationSource_(durationSink);
            }
            function startDebounce(_latestPush: Push<T>, _idx: number): void {
                if (getInitialDurationRange) {
                    maxDurationSink = Sink(onDurationEvent);
                    sourceSink.add(maxDurationSink);
                } else {
                    maxDurationSink = true;
                    restartDebounce();
                    return;
                }
                let initialDurationInfo: InitialDurationInfo;
                try {
                    initialDurationInfo = getInitialDurationRange(_latestPush.value, _idx);
                } catch (error) {
                    sink(Throw(error));
                    return;
                }
                const [durationSource, maxDurationSource] = initialDurationInfo;
                const _maxDurationSink = maxDurationSink;
                if (maxDurationSource) {
                    maxDurationSource(_maxDurationSink);
                }
                if (durationSource && _maxDurationSink.active) {
                    restartDebounce(durationSource);
                }
            }
            const sourceSink = Sink<T>((event) => {
                if (event.type === PushType) {
                    latestPush = event;
                    idx++;
                    if (distributing) {
                        return;
                    }
                    if (maxDurationSink) {
                        restartDebounce();
                    } else {
                        const _latestPush = latestPush;
                        const _idx = idx;
                        if (leading) {
                            distributing = true;
                            lastPushedIdx = idx;
                            sink(_latestPush);
                            distributing = false;
                        }
                        startDebounce(_latestPush, _idx);
                    }
                    return;
                }
                if (event.type === EndType && emitPendingOnEnd && maxDurationSink && idx > lastPushedIdx) {
                    sink(latestPush);
                }
                sink(event);
            });
            sink.add(sourceSink);
            source(sourceSink);
        });
}
function debounceMs(durationMs: number, maxDurationMs?: number | null, config?: DebounceConfig | null): IdentityOperator;
function debounceMs(durationMs: null | undefined, maxDurationMs: number, config?: DebounceConfig | null): IdentityOperator;
function debounceMs(durationMs?: number | null, maxDurationMs?: number | null, config?: DebounceConfig | null): IdentityOperator {
    const durationSource = durationMs == null ? durationMs : timer(durationMs);
    const maxDuration = maxDurationMs == null ? maxDurationMs : timer(maxDurationMs);
    if (durationSource != null) {
        return debounce(() => durationSource, maxDuration == null ? maxDuration : () => [durationSource, maxDuration], config);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return debounce(null, () => [null, maxDuration!], config);
}
interface ThrottleConfig {
    leading?: boolean | null;
    trailing?: boolean | null;
    emitPendingOnEnd?: boolean | null;
}
const defaultThrottleConfig: ThrottleConfig = {
    leading: true,
    trailing: true,
    emitPendingOnEnd: true,
};
function throttle(getDurationSource: () => Source<unknown>, config?: ThrottleConfig | null): IdentityOperator;
function throttle<T>(getDurationSource: (value: T, index: number) => Source<unknown>, config?: ThrottleConfig | null): Operator<T, T>;
function throttle<T>(getDurationSource: (value: T, index: number) => Source<unknown>, config?: ThrottleConfig | null): Operator<T, T> {
    let leading: ThrottleConfig['leading'];
    let trailing: ThrottleConfig['trailing'];
    let emitPendingOnEnd: ThrottleConfig['emitPendingOnEnd'];
    if (config) {
        leading = config.leading == null ? defaultThrottleConfig.leading : config.leading;
        trailing = config.trailing == null ? defaultThrottleConfig.trailing : config.trailing;
        emitPendingOnEnd = config.emitPendingOnEnd == null ? defaultThrottleConfig.emitPendingOnEnd : config.emitPendingOnEnd;
    }
    return debounce<T>(null, (value, index) => [null, getDurationSource(value, index)], { leading, trailing, emitPendingOnEnd });
}
function throttleMs(durationMs: number, config?: ThrottleConfig | null): IdentityOperator {
    const durationSource = timer(durationMs);
    return throttle(() => durationSource, config);
}
export {
    PushType,
    ThrowType,
    EndType,
    type EventType,
    type Event,
    Push,
    Throw,
    End,
    $$Sink,
    Sink,
    isSink,
    $$Source,
    Source,
    isSource,
    subscribe,
    fromArray,
    ofEvent,
    combine,
    type Operator,
    type IdentityOperator,
    flatMap,
    flat,
    map,
    filter,
    filterMap,
    skip,
    lazy,
    spyBeforeOperators,
    spyAfterOperators,
    memoConsecutive,
    fromScheduleFunction,
    interval,
    startWith,
    type ControllableSource,
    shareControlled,
    share,
    shareOnce,
    sharePersist,
    shareTransform,
    timer,
    take,
    type DebounceTrailingRestart,
    type DebounceConfig,
    defaultDebounceConfig,
    type InitialDurationInfo,
    debounce,
    debounceMs,
    type ThrottleConfig,
    defaultThrottleConfig,
    throttle,
    throttleMs,
};
