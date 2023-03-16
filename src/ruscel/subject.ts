import { Disposable, implDisposableMethods, DisposalError } from './disposable';
import { isSome, Maybe, None, Some } from './maybe';
import { PushType, Event, Push, Throw, End, Source, isSource, Sink, isSink, ThrowType, $$Sink, $$Source } from './source';
import { asyncReportError, joinErrors } from './util';
interface Subject<T> extends Source<T>, Sink<T> {
    (eventOrSink: Event<T> | Sink<T>): void;
}
function markAsSubject<T>(subjectFunction: ((eventOrSink: Event<T> | Sink<T>) => void) & Disposable): Subject<T> {
    (subjectFunction as Subject<T>)[$$Sink] = undefined;
    (subjectFunction as Subject<T>)[$$Source] = undefined;
    return subjectFunction as Subject<T>;
}
function isSubject(value: unknown): value is Subject<unknown> {
    return isSource(value) && isSink(value);
}
interface SinkInfo<T> {
    __sink: Sink<T>;
    __didRemove: boolean;
    __notAdded: boolean;
}
interface SubjectBasePrivateActiveState<T> {
    __sinkInfos: SinkInfo<T>[];
    __sinksToAdd: SinkInfo<T>[];
    __eventsQueue: Event<T>[];
}
function SubjectBase<T>(): Subject<T> {
    let distributingEvent = false;
    let sinkIndex = 0;
    let state: SubjectBasePrivateActiveState<T> | null = {
        __sinkInfos: [],
        __sinksToAdd: [],
        __eventsQueue: [],
    };
    function nullifyState(): void {
        if (state) {
            const { __sinkInfos: sinkInfos, __sinksToAdd: sinksToAdd, __eventsQueue: eventsQueue } = state;
            sinkInfos.length = 0;
            sinksToAdd.length = 0;
            eventsQueue.length = 0;
            state = null;
        }
    }
    const disposable = Disposable(() => {
        if (state && !distributingEvent) {
            nullifyState();
        }
    });
    return markAsSubject(
        implDisposableMethods((eventOrSink: Event<T> | Sink<T>): void => {
            if (!disposable.active) {
                if (typeof eventOrSink !== 'function' && eventOrSink.type === ThrowType) {
                    const { error } = eventOrSink;
                    asyncReportError(
                        `A Throw event was intercepted by a disposed Subject: ${
                            // eslint-disable-next-line max-len
                            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                            (error instanceof Error && error.stack) || error
                        }`,
                    );
                }
                return;
            }
            const {
                __sinkInfos: sinkInfos,
                __sinksToAdd: sinksToAdd,
                __eventsQueue: eventsQueue,
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            } = state!;
            if (typeof eventOrSink === 'function') {
                if (!eventOrSink.active) {
                    return;
                }
                const addedInDistribution = distributingEvent;
                const sinkInfo: SinkInfo<T> = {
                    __sink: eventOrSink,
                    __didRemove: false,
                    __notAdded: addedInDistribution,
                };
                const sinkList = addedInDistribution ? sinksToAdd : sinkInfos;
                sinkList.push(sinkInfo);
                eventOrSink.add(
                    Disposable(() => {
                        if (!disposable.active || sinkInfo.__didRemove) {
                            return;
                        }
                        sinkInfo.__didRemove = true;
                        if (addedInDistribution && sinkInfo.__notAdded) {
                            // The sink was added during the loop below, which
                            // is still running.
                            const index = sinksToAdd.indexOf(sinkInfo);
                            if (index !== -1) {
                                sinksToAdd.splice(index, 1);
                            }
                            return;
                        }
                        if (distributingEvent) {
                            // We are in the loop below.
                            if (sinkInfos[sinkIndex] === sinkInfo) {
                                return;
                            }
                            const index = sinkInfos.indexOf(sinkInfo);
                            if (index < sinkIndex) {
                                sinkIndex--;
                            }
                            sinkInfos.splice(index, 1);
                            return;
                        }
                        // Nothing is happening in relation to this subject.
                        const index = sinkInfos.indexOf(sinkInfo);
                        if (index !== -1) {
                            sinkInfos.splice(index, 1);
                        }
                    }),
                );
            } else if (sinkInfos.length > 0) {
                const _distributingEvent = distributingEvent;
                distributingEvent = true;
                if (eventOrSink.type !== PushType) {
                    disposable.dispose();
                }
                if (_distributingEvent) {
                    eventsQueue.push(eventOrSink);
                    return;
                }
                const errors: DisposalError[] = [];
                let event: Event<T> | undefined = eventOrSink;
                while (event) {
                    if (sinkInfos.length === 0) {
                        if (event.type === ThrowType) {
                            asyncReportError(event.error);
                        }
                        break;
                    }
                    for (; sinkIndex < sinkInfos.length; sinkIndex++) {
                        const sinkInfo = sinkInfos[sinkIndex];
                        const { __sink: sink } = sinkInfo;
                        let active = false;
                        try {
                            active = sink.active;
                        } catch (error) {
                            errors.push(error as DisposalError);
                        }
                        if (!active) {
                            // Only remove if the current event is a Push event
                            // as if the current event is a Throw or End event
                            // then there is no point in removing it now as it
                            // will be removed at the end of the loop.
                            if (event.type === PushType) {
                                sinkInfos.splice(sinkIndex--, 1);
                            }
                            continue;
                        }
                        try {
                            sink(event);
                        } catch (error) {
                            asyncReportError(error);
                            sinkInfo.__didRemove = true;
                        }
                        // Remove if it was marked for removal during its
                        // execution.
                        if (sinkInfo.__didRemove && event.type === PushType) {
                            sinkInfos.splice(sinkIndex--, 1);
                        }
                    }
                    sinkIndex = 0;
                    if (event.type !== PushType) {
                        break;
                    }
                    for (let i = 0; i < sinksToAdd.length; i++) {
                        sinksToAdd[i].__notAdded = false;
                    }
                    // eslint-disable-next-line prefer-spread
                    sinkInfos.push.apply(sinkInfos, sinksToAdd);
                    sinksToAdd.length = 0;
                    event = eventsQueue.shift();
                }
                distributingEvent = false;
                if (
                    // Cannot throw.
                    !disposable.active
                ) {
                    nullifyState();
                }
                if (errors.length > 0) {
                    throw new SubjectDistributionSinkDisposalError(errors);
                }
            } else if (eventOrSink.type !== PushType) {
                if (eventOrSink.type === ThrowType) {
                    asyncReportError(eventOrSink.error);
                }
                disposable.dispose();
            }
        }, disposable),
    );
}
class SubjectDistributionSinkDisposalError extends Error {
    name = 'SubjectDistributionSinkDisposalError';
    constructor(public errors: DisposalError[], options?: ErrorOptions) {
        super(`${errors.length} error${errors.length === 1 ? ' was' : 's were'} caught while distributing an event through a subject.${joinErrors(errors)}`, {
            cause: options?.cause !== undefined ? { errors, originalCause: options.cause } : { errors },
        });
    }
}
function Subject<T>(): Subject<T> {
    const base = SubjectBase<T>();
    let finalEvent: Throw | End | undefined;
    return markAsSubject(
        implDisposableMethods((eventOrSink: Event<T> | Sink<T>): void => {
            if (typeof eventOrSink === 'function') {
                if (finalEvent) {
                    eventOrSink(finalEvent);
                } else {
                    base(eventOrSink);
                }
            } else {
                if (!base.active) {
                    return;
                }
                if (eventOrSink.type !== PushType) {
                    finalEvent = eventOrSink;
                }
                base(eventOrSink);
            }
        }, base),
    );
}
interface CurrentValueSubject<T> extends Subject<T> {
    currentValue: T;
}
function CurrentValueSubject<T>(initialValue: T, pushCurrentValue = true): CurrentValueSubject<T> {
    const base = Subject<T>();
    const subject = markAsSubject(
        implDisposableMethods((eventOrSink: Event<T> | Sink<T>) => {
            if (typeof eventOrSink === 'function') {
                base(eventOrSink);
                if (pushCurrentValue && eventOrSink.active) {
                    eventOrSink(Push(subject.currentValue));
                }
            } else {
                if (eventOrSink.type === PushType) {
                    subject.currentValue = eventOrSink.value;
                }
                base(eventOrSink);
            }
        }, base),
    ) as CurrentValueSubject<T>;
    subject.currentValue = initialValue;
    subject.add(base);
    return subject;
}
interface CurrentAndPreviousValueSubject<T> extends Subject<T> {
    previousValue: Maybe<T>;
    currentValue: T;
}
function CurrentAndPreviousValueSubject<T>(initialValue: T, pushCurrentValue = true, pushPreviousValue = false): CurrentAndPreviousValueSubject<T> {
    const base = Subject<T>();
    const subject = markAsSubject(
        implDisposableMethods((eventOrSink: Event<T> | Sink<T>) => {
            if (typeof eventOrSink === 'function') {
                if (eventOrSink.active) {
                    base(eventOrSink);
                    if (pushPreviousValue && isSome(subject.previousValue)) {
                        eventOrSink(Push(subject.previousValue.value));
                    }
                    if (pushCurrentValue) {
                        eventOrSink(Push(subject.currentValue));
                    }
                }
            } else {
                if (eventOrSink.type === PushType) {
                    subject.previousValue = Some(subject.currentValue);
                    subject.currentValue = eventOrSink.value;
                }
                base(eventOrSink);
            }
        }, base),
    ) as CurrentAndPreviousValueSubject<T>;
    subject.previousValue = None;
    subject.currentValue = initialValue;
    subject.add(base);
    return subject;
}
export { markAsSubject, isSubject, SubjectBase, SubjectDistributionSinkDisposalError, Subject, CurrentValueSubject, CurrentAndPreviousValueSubject };
