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
interface GroupConsecutiveItemsInArrayGroup<T, GI> {
  groupInfos: GI[];
  items: T[];
}
function groupConsecutiveItemsInArray<T, GI>(
  items: T[],
  getGroup: (item: T) => GI,
  compareGroups: (a: GI, b: GI) => boolean,
): GroupConsecutiveItemsInArrayGroup<T, GI>[] {
  const groups: GroupConsecutiveItemsInArrayGroup<T, GI>[] = [];
  let lastGroupInfo: GI;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const groupInfo = getGroup(item);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (i === 0 || !compareGroups(lastGroupInfo!, groupInfo)) {
      groups.push({ groupInfos: [groupInfo], items: [item] });
    } else {
      const lastGroup = groups[groups.length - 1];
      lastGroup.groupInfos.push(groupInfo);
      lastGroup.items.push(item);
    }
    lastGroupInfo = groupInfo;
  }
  return groups;
}
function groupArray<T, K>(items: T[], getGroupKey: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  items.forEach((item) => {
    const key = getGroupKey(item);
    const groupItems = groups.get(key);
    if (groupItems) {
      groupItems.push(item);
    } else {
      groups.set(key, [item]);
    }
  });
  return groups;
}
function omit<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newValue: any = {};
  Object.keys(value).forEach((key) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    if (!keys.includes(key as any)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      newValue[key] = value[key as keyof T];
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return newValue;
}
export {
  UnreachableCodeError,
  assertUnreachable,
  throwUnreachable,
  NotImplementedCodeError,
  throwNotImplemented,
  assert,
  assertIsNotNullish,
  groupConsecutiveItemsInArray,
  groupArray,
  type GroupConsecutiveItemsInArrayGroup,
  omit,
};
