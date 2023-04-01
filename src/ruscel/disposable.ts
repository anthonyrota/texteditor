import { joinErrors } from './util';
const enum DisposableImplementationIdentifier {
  RealDisposable,
  FakeDisposable,
}
const $$Disposable = Symbol('Disposable');
interface Disposable {
  readonly active: boolean;
  add(child: Disposable): void;
  remove(child: Disposable): void;
  dispose(): void;
  [$$Disposable]: DisposableImplementationIdentifier;
  __$$DISPOSABLE$$_id: number;
  __$$DISPOSABLE$$_children_: () => Disposable[] | null;
  __$$DISPOSABLE$$_prepareForDisposal: () => void;
  __$$DISPOSABLE$$_activeDescriptor?: FakeDisposableActiveDescriptor;
}
let lastId = 0;
class RealDisposableImplementation implements Disposable {
  __$$DISPOSABLE$$_id = ++lastId;
  #children: Disposable[] | null = [];
  #parents: Disposable[] | null = [];
  #markedForDisposal = false;
  #onDispose: (() => void) | undefined;
  [$$Disposable]: DisposableImplementationIdentifier.RealDisposable = DisposableImplementationIdentifier.RealDisposable;
  constructor(__onDispose?: () => void) {
    this.#onDispose = __onDispose;
  }
  get active(): boolean {
    if (!this.#children) {
      return false;
    }
    // If a disposable is determined to not be active, it should be ensured
    // that its dispose method was called.
    if (this.#markedForDisposal) {
      this.dispose();
      return false;
    }
    return true;
  }
  __$$DISPOSABLE$$_children_(): Disposable[] | null {
    return this.#children;
  }
  add(child: Disposable): void {
    if (!this.#children) {
      child.dispose();
      return;
    }
    if (!child.__$$DISPOSABLE$$_children_()) {
      return;
    }
    if (this.#markedForDisposal) {
      this.#children.push(child);
      // Already marked children as disposed -> have to manually here.
      child.__$$DISPOSABLE$$_prepareForDisposal();
      this.dispose();
      return;
    }
    if (child.__$$DISPOSABLE$$_id === this.__$$DISPOSABLE$$_id) {
      return;
    }
    this.#children.push(child);
  }
  remove(child: Disposable): void {
    if (this.#markedForDisposal) {
      // Note that there are two cases here:
      //     1. We have already been disposed, which means we have no
      //            children and should return.
      //     2. We are being disposed.
      // There are two cases for case two:
      //     a. The child is not in our children's list and we should
      //            return.
      //     b. The child is in our children's list, meaning it has been
      //            marked for disposal, potentially under us, and
      //            therefore we cannot remove it to ensure that it does
      //            disposed.
      return;
    }
    if (!child.__$$DISPOSABLE$$_children_()) {
      return;
    }
    // Note that this will only remove the specific instance revering to the Disposable, e.g. delineates between the fake and real implementation. This behavior
    // is unstable and TBD.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const index = this.#children!.indexOf(child);
    if (index !== -1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.#children!.splice(index, 1);
    }
  }
  dispose(): void {
    const children = this.#children;
    if (!children) {
      return;
    }
    // Walk the tree of all children and mark that one of their parents
    // has been disposed.
    this.__$$DISPOSABLE$$_prepareForDisposal();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parents = this.#parents!;
    const errors: unknown[] = [];
    this.#children = null;
    this.#parents = null;
    for (let i = 0; i < parents.length; i++) {
      parents[i].remove(this);
    }
    const onDispose = this.#onDispose;
    if (onDispose) {
      try {
        onDispose();
      } catch (error) {
        errors.push(error);
      }
    }
    for (let i = 0; i < children.length; i++) {
      try {
        children[i].dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new DisposalError(errors);
    }
  }
  __$$DISPOSABLE$$_prepareForDisposal(): void {
    if (this.#markedForDisposal) {
      return;
    }
    this.#markedForDisposal = true;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const children = this.#children!;
    for (let i = 0; i < children.length; i++) {
      children[i].__$$DISPOSABLE$$_prepareForDisposal();
    }
  }
}
interface FakeDisposableActiveDescriptor {
  get: () => boolean;
  enumerable: false;
  configurable: true;
}
interface FakeDisposableImplementation extends Disposable {
  [$$Disposable]: DisposableImplementationIdentifier.FakeDisposable;
  __$$DISPOSABLE$$_activeDescriptor: FakeDisposableActiveDescriptor;
}
type DisposableImplementation = RealDisposableImplementation | FakeDisposableImplementation;
// eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-non-null-assertion
const activeGetter = Object.getOwnPropertyDescriptor(RealDisposableImplementation.prototype, 'active')!.get as () => boolean;
function implDisposableMethods<T extends object>(value: T, disposable = Disposable()): T & Disposable {
  // This gets optimized out.
  const fakeDisposable = value as unknown as FakeDisposableImplementation;
  const disposableImplementation = disposable as unknown as DisposableImplementation;
  fakeDisposable[$$Disposable] = DisposableImplementationIdentifier.FakeDisposable;
  if (disposableImplementation[$$Disposable] === DisposableImplementationIdentifier.RealDisposable) {
    const activeDescriptor: FakeDisposableActiveDescriptor = {
      get: activeGetter.bind(disposableImplementation),
      enumerable: false,
      configurable: true,
    };
    fakeDisposable.__$$DISPOSABLE$$_activeDescriptor = activeDescriptor;
    Object.defineProperty(value, 'active', activeDescriptor);
    fakeDisposable.add = disposableImplementation.add.bind(disposableImplementation);
    fakeDisposable.remove = disposableImplementation.remove.bind(disposableImplementation);
    fakeDisposable.dispose = disposableImplementation.dispose.bind(disposableImplementation);
    fakeDisposable.__$$DISPOSABLE$$_children_ = disposableImplementation.__$$DISPOSABLE$$_children_.bind(disposableImplementation);
    fakeDisposable.__$$DISPOSABLE$$_prepareForDisposal = disposableImplementation.__$$DISPOSABLE$$_prepareForDisposal.bind(disposableImplementation);
  } else {
    const activeDescriptor = disposableImplementation.__$$DISPOSABLE$$_activeDescriptor;
    fakeDisposable.__$$DISPOSABLE$$_activeDescriptor = activeDescriptor;
    Object.defineProperty(value, 'active', activeDescriptor);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    fakeDisposable.add = disposableImplementation.add;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    fakeDisposable.remove = disposableImplementation.remove;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    fakeDisposable.dispose = disposableImplementation.dispose;
    fakeDisposable.__$$DISPOSABLE$$_children_ = disposableImplementation.__$$DISPOSABLE$$_children_;
    fakeDisposable.__$$DISPOSABLE$$_prepareForDisposal = disposableImplementation.__$$DISPOSABLE$$_prepareForDisposal;
  }
  fakeDisposable.__$$DISPOSABLE$$_id = disposableImplementation.__$$DISPOSABLE$$_id;
  return fakeDisposable as unknown as T & Disposable;
}
class DisposalError extends Error {
  name = 'DisposalError';
  errors: unknown[];
  constructor(errors: unknown[], options?: ErrorOptions) {
    const flattenedErrors = flattenDisposalErrors(errors);
    super(
      `Failed to dispose a resource. ${flattenedErrors.length} error${flattenedErrors.length === 1 ? ' was' : 's were'} caught.${joinErrors(flattenedErrors)}`,
      { cause: options?.cause !== undefined ? { errors, originalCause: options.cause } : { errors } },
    );
    this.errors = errors;
  }
}
function flattenDisposalErrors(errors: unknown[]): unknown[] {
  const flattened: unknown[] = [];
  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    if (error instanceof DisposalError) {
      flattened.push(...error.errors);
    } else {
      flattened.push(error);
    }
  }
  return flattened;
}
function Disposable(onDispose?: () => void): Disposable {
  return new RealDisposableImplementation(onDispose);
}
function isDisposable(value: unknown): value is Disposable {
  if (value == null) {
    return false;
  }
  const implementationIdentifier = (value as DisposableImplementation)[$$Disposable];
  return (
    implementationIdentifier === DisposableImplementationIdentifier.RealDisposable ||
    implementationIdentifier === DisposableImplementationIdentifier.FakeDisposable
  );
}
const disposed = Disposable();
disposed.dispose();
export { Disposable, isDisposable, implDisposableMethods, DisposalError, disposed, RealDisposableImplementation as DisposableClass };
