import { Disposable } from './disposable';
import { requestAnimationFrameDisposable, setTimeoutDisposable, setIntervalDisposable, removeOnce } from './util';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ScheduleFunction<T extends any[] = []> {
    (callback: (...args: T) => void, subscription?: Disposable): void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ScheduleQueuedCallback<T extends any[]> {
    __callback: (...args: T) => void;
    __hasBeenRemovedFromQueue: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScheduleQueued<T extends any[] = []>(schedule: (callNext: (...args: T) => void, subscription: Disposable) => void): ScheduleFunction<T> {
    let callbacks: ScheduleQueuedCallback<T>[] = [];
    let scheduledSubscription: Disposable | undefined;
    let isInCallback = false;
    const nestedCallNextArgs: T[] = [];
    return (callback, subscription) => {
        if (subscription && !subscription.active) {
            return;
        }
        const callbackInfo: ScheduleQueuedCallback<T> = {
            __callback: callback,
            __hasBeenRemovedFromQueue: false,
        };
        callbacks.push(callbackInfo);
        if (subscription) {
            const _callbacks = callbacks;
            subscription.add(
                Disposable(() => {
                    // If the callbacks array has changed then the queue has
                    // already been flushed, ensuring this callback will not be
                    // called in the future.
                    if (_callbacks !== callbacks || callbackInfo.__hasBeenRemovedFromQueue) {
                        return;
                    }
                    callbackInfo.__hasBeenRemovedFromQueue = true;
                    removeOnce(callbacks, callbackInfo);
                    // If we are executing a callback, then there is no need to
                    // handle disposal logic here as it will be handled after
                    // the callback is called. This also avoids unnecessary
                    // disposal in the case where the callback flushes all
                    // future callbacks, then queues a new callback.
                    if (isInCallback) {
                        return;
                    }
                    if (callbacks.length === 0) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        scheduledSubscription!.dispose();
                    }
                }),
            );
        }
        // Exiting here ensures that in the case where the last callback is
        // removed from the queue and executed, scheduling another callback will
        // mean that the subscription logic will not be handled inside the
        // execution of the current callback but instead after the current
        // callback has been executed, ensuring that duplicate subscriptions are
        // avoided.
        if (isInCallback) {
            return;
        }
        if (callbacks.length === 1) {
            scheduledSubscription = Disposable();
            const _scheduledSubscription = scheduledSubscription;
            schedule((...args: T): void => {
                // If the scheduledSubscription given upon subscription has been
                // disposed then this scheduled instance should have stopped
                // emitting.
                if (!_scheduledSubscription.active) {
                    return;
                }
                // Similarly, as the only scheduledSubscription that can ever be
                // active is the current scheduledSubscription, this ensures
                // that we are currently in the context of the latest
                // scheduledSubscription.
                // If the given callNext function (this callback) is being
                // called inside the execution of a provided callback, then mark
                // as such and exit to ensure that synchronous recursive
                // schedule calls are properly queued.
                if (isInCallback) {
                    nestedCallNextArgs.push(args);
                    return;
                }
                // The only time the callbacks queue will be empty is if the
                // callbacks have already been flushed, which in this case means
                // the scheduledSubscription has already been disposed.
                // Therefore, the callbacks queue is guaranteed to not be empty.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const callbackInfo = callbacks.shift()!;
                callbackInfo.__hasBeenRemovedFromQueue = true;
                try {
                    let { __callback: callback } = callbackInfo;
                    isInCallback = true;
                    callback(...args);
                    let callNextArgs = nestedCallNextArgs.shift();
                    while (callNextArgs) {
                        const callbackInfo = callbacks.shift();
                        if (!callbackInfo) {
                            nestedCallNextArgs.length = 0;
                            break;
                        }
                        callbackInfo.__hasBeenRemovedFromQueue = true;
                        callback = callbackInfo.__callback;
                        callback(...callNextArgs);
                        callNextArgs = nestedCallNextArgs.shift();
                    }
                    isInCallback = false;
                } catch (error) {
                    callbacks = [];
                    isInCallback = false;
                    nestedCallNextArgs.length = 0;
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    scheduledSubscription!.dispose();
                    throw error;
                }
                if (callbacks.length === 0) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    scheduledSubscription!.dispose();
                }
            }, scheduledSubscription);
        }
    };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScheduleQueuedDiscrete<T extends any[] = []>(schedule: (callback: (...args: T) => void, subscription: Disposable) => void): ScheduleFunction<T> {
    return ScheduleQueued((callNext, subscription) => {
        function loop(...args: T): void {
            callNext(...args);
            // We don't know if the user provided function actually checks if
            // the subscription given to the schedule function is active or not.
            // Therefore, only pass active subscriptions to the schedule
            // function.
            if (subscription.active) {
                schedule(loop, subscription);
            }
        }
        schedule(loop, subscription);
    });
}
const scheduleSync: ScheduleFunction = (callback, subscription) => {
    if (subscription && !subscription.active) {
        return;
    }
    callback();
};
function ScheduleSyncQueuedInner(callNext: () => void, subscription: Disposable): void {
    do {
        callNext();
    } while (subscription.active);
}
function ScheduleSyncQueued(): ScheduleFunction {
    return ScheduleQueued(ScheduleSyncQueuedInner);
}
const scheduleAnimationFrame: ScheduleFunction<[number]> = requestAnimationFrameDisposable;
function ScheduleAnimationFrameQueued(): ScheduleFunction<[number]> {
    return ScheduleQueuedDiscrete(scheduleAnimationFrame);
}
function ScheduleTimeout(delayMs: number): ScheduleFunction {
    return (callback, subscription) => {
        setTimeoutDisposable(callback, delayMs, subscription);
    };
}
function ScheduleTimeoutQueued(delayMs: number): ScheduleFunction {
    return ScheduleQueuedDiscrete(ScheduleTimeout(delayMs));
}
function ScheduleInterval(delayMs: number): ScheduleFunction {
    return ScheduleQueued((callNext, subscription) => {
        setIntervalDisposable(callNext, delayMs, subscription);
    });
}
const scheduleMicrotask: ScheduleFunction = queueMicrotask;
function ScheduleMicrotaskQueued(): ScheduleFunction {
    return ScheduleQueued(scheduleMicrotask);
}
export {
    type ScheduleFunction,
    ScheduleQueued,
    ScheduleQueuedDiscrete,
    scheduleSync,
    ScheduleSyncQueued,
    scheduleAnimationFrame,
    ScheduleAnimationFrameQueued,
    ScheduleTimeout,
    ScheduleTimeoutQueued,
    ScheduleInterval,
    scheduleMicrotask,
    ScheduleMicrotaskQueued,
};
