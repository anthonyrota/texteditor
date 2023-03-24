import { Disposable, implDisposableMethods, DisposalError } from './disposable';
import { isSome, Maybe, None, Some } from './maybe';
import { PushType, Event, Push, Throw, End, Source, isSource, Sink, isSink, ThrowType, $$Sink, $$Source } from './source';
import { asyncReportError, joinErrors } from './util';
interface Distributor<T> extends Source<T>, Sink<T> {
  (eventOrSink: Event<T> | Sink<T>): void;
}
function markAsDistributor<T>(distributorFunction: ((eventOrSink: Event<T> | Sink<T>) => void) & Disposable): Distributor<T> {
  (distributorFunction as Distributor<T>)[$$Sink] = undefined;
  (distributorFunction as Distributor<T>)[$$Source] = undefined;
  return distributorFunction as Distributor<T>;
}
function isDistributor(value: unknown): value is Distributor<unknown> {
  return isSource(value) && isSink(value);
}
interface SinkInfo<T> {
  __sink: Sink<T>;
  __didRemove: boolean;
  __notAdded: boolean;
}
interface DistributorBasePrivateActiveState<T> {
  __sinkInfos: SinkInfo<T>[];
  __sinksToAdd: SinkInfo<T>[];
  __eventsQueue: Event<T>[];
}
function DistributorBase<T>(): Distributor<T> {
  let distributingEvent = false;
  let sinkIndex = 0;
  let state: DistributorBasePrivateActiveState<T> | null = {
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
  return markAsDistributor(
    implDisposableMethods((eventOrSink: Event<T> | Sink<T>): void => {
      if (!disposable.active) {
        if (typeof eventOrSink !== 'function' && eventOrSink.type === ThrowType) {
          const { error } = eventOrSink;
          asyncReportError(
            `A Throw event was intercepted by a disposed Distributor: ${
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
            // Nothing is happening in relation to this distributor.
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
          throw new DistributorDistributionSinkDisposalError(errors);
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
class DistributorDistributionSinkDisposalError extends Error {
  name = 'DistributorDistributionSinkDisposalError';
  constructor(public errors: DisposalError[], options?: ErrorOptions) {
    super(`${errors.length} error${errors.length === 1 ? ' was' : 's were'} caught while distributing an event through a distributor.${joinErrors(errors)}`, {
      cause: options?.cause !== undefined ? { errors, originalCause: options.cause } : { errors },
    });
  }
}
function Distributor<T>(): Distributor<T> {
  const base = DistributorBase<T>();
  let finalEvent: Throw | End | undefined;
  return markAsDistributor(
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
interface CurrentValueDistributor<T> extends Distributor<T> {
  currentValue: T;
}
function CurrentValueDistributor<T>(initialValue: T, pushCurrentValue = true): CurrentValueDistributor<T> {
  const base = Distributor<T>();
  const distributor = markAsDistributor(
    implDisposableMethods((eventOrSink: Event<T> | Sink<T>) => {
      if (typeof eventOrSink === 'function') {
        base(eventOrSink);
        if (pushCurrentValue && eventOrSink.active) {
          eventOrSink(Push(distributor.currentValue));
        }
      } else {
        if (eventOrSink.type === PushType) {
          distributor.currentValue = eventOrSink.value;
        }
        base(eventOrSink);
      }
    }, base),
  ) as CurrentValueDistributor<T>;
  distributor.currentValue = initialValue;
  distributor.add(base);
  return distributor;
}
interface CurrentAndPreviousValueDistributor<T> extends Distributor<T> {
  previousValue: Maybe<T>;
  currentValue: T;
}
function CurrentAndPreviousValueDistributor<T>(initialValue: T, pushCurrentValue = true, pushPreviousValue = false): CurrentAndPreviousValueDistributor<T> {
  const base = Distributor<T>();
  const distributor = markAsDistributor(
    implDisposableMethods((eventOrSink: Event<T> | Sink<T>) => {
      if (typeof eventOrSink === 'function') {
        if (eventOrSink.active) {
          base(eventOrSink);
          if (pushPreviousValue && isSome(distributor.previousValue)) {
            eventOrSink(Push(distributor.previousValue.value));
          }
          if (pushCurrentValue) {
            eventOrSink(Push(distributor.currentValue));
          }
        }
      } else {
        if (eventOrSink.type === PushType) {
          distributor.previousValue = Some(distributor.currentValue);
          distributor.currentValue = eventOrSink.value;
        }
        base(eventOrSink);
      }
    }, base),
  ) as CurrentAndPreviousValueDistributor<T>;
  distributor.previousValue = None;
  distributor.currentValue = initialValue;
  distributor.add(base);
  return distributor;
}
export {
  markAsDistributor,
  isDistributor,
  DistributorBase,
  DistributorDistributionSinkDisposalError,
  Distributor,
  CurrentValueDistributor,
  CurrentAndPreviousValueDistributor,
};
