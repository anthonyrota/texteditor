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
}
interface DisposableImplementationBase extends Disposable {
    __children_: () => DisposableImplementationBase[] | null;
    __prepareForDisposal: () => void;
}
class RealDisposableImplementation implements DisposableImplementationBase {
    private __children: DisposableImplementationBase[] | null = [];
    private __parents: DisposableImplementationBase[] | null = [];
    private __markedForDisposal = false;
    public [$$Disposable]: DisposableImplementationIdentifier.RealDisposable = DisposableImplementationIdentifier.RealDisposable;
    constructor(private __onDispose?: () => void) {}
    public get active(): boolean {
        if (!this.__children) {
            return false;
        }
        // If a disposable is determined to not be active, it should be ensured
        // that its dispose method was called.
        if (this.__markedForDisposal) {
            this.dispose();
            return false;
        }
        return true;
    }
    public __children_(): DisposableImplementationBase[] | null {
        return this.__children;
    }
    public add(child: Disposable): void {
        if (!this.__children) {
            child.dispose();
            return;
        }
        if (!(child as DisposableImplementationBase).__children_()) {
            return;
        }
        if (this.__markedForDisposal) {
            this.__children.push(child as DisposableImplementationBase);
            // Already marked children as disposed -> have to manually here.
            (child as DisposableImplementationBase).__prepareForDisposal();
            this.dispose();
            return;
        }
        if (child === this) {
            return;
        }
        this.__children.push(child as DisposableImplementationBase);
    }
    public remove(child: Disposable): void {
        if (this.__markedForDisposal) {
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
        if (!(child as DisposableImplementationBase).__children_()) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const index = this.__children!.indexOf(child as DisposableImplementationBase);
        if (index !== -1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.__children!.splice(index, 1);
        }
    }
    public dispose(): void {
        const children = this.__children;
        if (!children) {
            return;
        }
        // Walk the tree of all children and mark that one of their parents
        // has been disposed.
        this.__prepareForDisposal();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const parents = this.__parents!;
        const errors: unknown[] = [];
        this.__children = null;
        this.__parents = null;
        for (let i = 0; i < parents.length; i++) {
            parents[i].remove(this);
        }
        const onDispose = this.__onDispose;
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
    public __prepareForDisposal(): void {
        if (this.__markedForDisposal) {
            return;
        }
        this.__markedForDisposal = true;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const children = this.__children!;
        for (let i = 0; i < children.length; i++) {
            children[i].__prepareForDisposal();
        }
    }
}
interface FakeDisposableActiveDescriptor {
    get: () => boolean;
    enumerable: false;
    configurable: true;
}
interface FakeDisposableImplementation extends DisposableImplementationBase {
    [$$Disposable]: DisposableImplementationIdentifier.FakeDisposable;
    __activeDescriptor: FakeDisposableActiveDescriptor;
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
        fakeDisposable.__activeDescriptor = activeDescriptor;
        Object.defineProperty(value, 'active', activeDescriptor);
        fakeDisposable.add = disposableImplementation.add.bind(disposableImplementation);
        fakeDisposable.remove = disposableImplementation.remove.bind(disposableImplementation);
        fakeDisposable.dispose = disposableImplementation.dispose.bind(disposableImplementation);
        fakeDisposable.__children_ = disposableImplementation.__children_.bind(disposableImplementation);
        fakeDisposable.__prepareForDisposal = disposableImplementation.__prepareForDisposal.bind(disposableImplementation);
    } else {
        const activeDescriptor = disposableImplementation.__activeDescriptor;
        fakeDisposable.__activeDescriptor = activeDescriptor;
        Object.defineProperty(value, 'active', activeDescriptor);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakeDisposable.add = disposableImplementation.add;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakeDisposable.remove = disposableImplementation.remove;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakeDisposable.dispose = disposableImplementation.dispose;
        fakeDisposable.__children_ = disposableImplementation.__children_;
        fakeDisposable.__prepareForDisposal = disposableImplementation.__prepareForDisposal;
    }
    return fakeDisposable as unknown as T & Disposable;
}
class DisposalError extends Error {
    name = 'DisposalError';
    constructor(public errors: unknown[], options?: ErrorOptions) {
        const flattenedErrors = flattenDisposalErrors(errors);
        super(
            `Failed to dispose a resource. ${flattenedErrors.length} error${flattenedErrors.length === 1 ? ' was' : 's were'} caught.${joinErrors(
                flattenedErrors,
            )}`,
            { cause: options?.cause !== undefined ? { errors, originalCause: options.cause } : { errors } },
        );
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
