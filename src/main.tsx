import { render, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
// eslint-disable-next-line import/no-unresolved
import initialText from './initialText.txt?raw';
import { makePromiseResolvingToNativeIntlSegmenterOrPolyfill } from './IntlSegmenter';
import { LruCache } from './LruCache';
import * as matita from './matita';
import { Disposable, DisposableClass, disposed } from './ruscel/disposable';
import { isNone, isSome, Maybe, None, Some } from './ruscel/maybe';
import {
    End,
    EndType,
    Event,
    filterMap,
    flat,
    flatMap,
    fromArray,
    interval,
    map,
    memoConsecutive,
    ofEvent,
    Push,
    PushType,
    share,
    Sink,
    skip,
    Source,
    startWith,
    subscribe,
    take,
    ThrowType,
    timer,
} from './ruscel/source';
import { CurrentAndPreviousValueSubject, CurrentValueSubject, Subject } from './ruscel/subject';
import { pipe, requestAnimationFrameDisposable } from './ruscel/util';
import { assert, assertIsNotNullish, assertUnreachable, throwNotImplemented, throwUnreachable } from './util';
import './index.css';
interface DocumentConfig extends matita.NodeConfig {}
interface ContentConfig extends matita.NodeConfig {}
interface ParagraphConfig extends matita.NodeConfig {}
interface EmbedConfig extends matita.NodeConfig {}
interface TextConfig extends matita.NodeConfig {}
interface VoidConfig extends matita.NodeConfig {}
type VirtualizedViewControl = matita.ViewControl<
    DocumentConfig,
    ContentConfig,
    ParagraphConfig,
    EmbedConfig,
    TextConfig,
    VoidConfig,
    VirtualizedDocumentRenderControl,
    VirtualizedContentRenderControl,
    VirtualizedParagraphRenderControl,
    matita.EmbedRenderControl
>;
interface TextElementInfo {
    textStart: number;
    textEnd: number;
    textElement: HTMLElement;
}
class VirtualizedParagraphRenderControl extends DisposableClass implements matita.ParagraphRenderControl {
    paragraphReference: matita.BlockReference;
    #viewControl: VirtualizedViewControl;
    containerHtmlElement$: CurrentAndPreviousValueSubject<HTMLElement>;
    textElementInfos: TextElementInfo[] = [];
    constructor(paragraphReference: matita.BlockReference, viewControl: VirtualizedViewControl) {
        super(() => this.#dispose());
        this.paragraphReference = paragraphReference;
        this.#viewControl = viewControl;
        this.containerHtmlElement$ = CurrentAndPreviousValueSubject(this.#makeContainerHtmlElement());
        this.add(this.containerHtmlElement$);
        this.#render();
    }
    #makeContainerHtmlElement(): HTMLElement {
        const containerHtmlElement = document.createElement('p');
        containerHtmlElement.style.contain = 'content';
        containerHtmlElement.style.whiteSpace = 'break-spaces';
        containerHtmlElement.style.overflowWrap = 'anywhere';
        return containerHtmlElement;
    }
    get containerHtmlElement(): HTMLElement {
        return this.containerHtmlElement$.currentValue;
    }
    #render(): void {
        const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
        const { stateControl } = documentRenderControl;
        const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, this.paragraphReference);
        matita.assertIsParagraph(paragraph);
        if (!matita.isParagraphEmpty(paragraph)) {
            const textWrapper = document.createElement('span');
            textWrapper.appendChild(
                document.createTextNode(
                    paragraph.children
                        .map((child) => {
                            matita.assertIsText(child);
                            return child.text;
                        })
                        .join(''),
                ),
            );
            this.textElementInfos = [
                {
                    textStart: 0,
                    textEnd: matita.getParagraphLength(paragraph),
                    textElement: textWrapper,
                },
            ];
            this.containerHtmlElement$.currentValue.replaceChildren(textWrapper);
        } else {
            this.containerHtmlElement$.currentValue.replaceChildren(document.createTextNode('\xa0')); // NBSP.
        }
    }
    onConfigOrChildrenChanged(): void {
        this.#render();
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    #dispose(): void {}
}
interface VirtualizedContentRenderControlParagraphBlockInfo {
    paragraphRenderControl: VirtualizedParagraphRenderControl;
    containerHtmlElement: HTMLElement;
}
class VirtualizedContentRenderControl extends DisposableClass implements matita.ContentRenderControl {
    contentReference: matita.ContentReference;
    #viewControl: VirtualizedViewControl;
    containerHtmlElement$: CurrentAndPreviousValueSubject<HTMLElement>;
    #blockInfos: VirtualizedContentRenderControlParagraphBlockInfo[];
    constructor(contentReference: matita.ContentReference, viewControl: VirtualizedViewControl) {
        super(() => this.#dispose());
        this.contentReference = contentReference;
        this.#viewControl = viewControl;
        this.containerHtmlElement$ = CurrentAndPreviousValueSubject(this.#makeContainerHtmlElement());
        this.add(this.containerHtmlElement$);
        this.#blockInfos = [];
        this.#init();
    }
    #makeContainerHtmlElement(): HTMLElement {
        const containerHtmlElement = document.createElement('div');
        return containerHtmlElement;
    }
    get containerHtmlElement(): HTMLElement {
        return this.containerHtmlElement$.currentValue;
    }
    #init(): void {
        const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
        const { stateControl, htmlElementToNodeRenderControlMap } = documentRenderControl;
        htmlElementToNodeRenderControlMap.set(this.containerHtmlElement$.currentValue, this);
        this.#blockInfos = [];
        const numberOfBlocks = matita.getNumberOfBlocksInContentAtContentReference(stateControl.stateView.document, this.contentReference);
        for (let i = 0; i < numberOfBlocks; i++) {
            const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, this.contentReference, i);
            matita.assertIsParagraph(block);
            const paragraphReference = matita.makeBlockReferenceFromBlock(block);
            const paragraphRenderControl = this.#makeParagraphRenderControl(paragraphReference);
            this.#blockInfos.push({
                paragraphRenderControl,
                containerHtmlElement: paragraphRenderControl.containerHtmlElement,
            });
            this.containerHtmlElement$.currentValue.append(paragraphRenderControl.containerHtmlElement);
        }
    }
    #makeParagraphRenderControl(paragraphReference: matita.BlockReference): VirtualizedParagraphRenderControl {
        const { htmlElementToNodeRenderControlMap } = this.#viewControl.accessDocumentRenderControl();
        const changeContainerHtmlElementSink = Sink((event: Event<HTMLElement>): void => {
            if (event.type !== PushType) {
                throwUnreachable();
            }
            const blockInfo = this.#blockInfos.find((blockInfo) => {
                return matita.areBlockReferencesAtSameBlock(blockInfo.paragraphRenderControl.paragraphReference, paragraphReference);
            });
            assertIsNotNullish(blockInfo);
            htmlElementToNodeRenderControlMap.set(paragraphRenderControl.containerHtmlElement, paragraphRenderControl);
            blockInfo.containerHtmlElement.replaceWith(paragraphRenderControl.containerHtmlElement);
        });
        const paragraphRenderControl = new VirtualizedParagraphRenderControl(paragraphReference, this.#viewControl);
        this.add(paragraphRenderControl);
        pipe(paragraphRenderControl.containerHtmlElement$, skip(1), subscribe(changeContainerHtmlElementSink, this));
        this.#viewControl.renderControlRegister.registerParagraphRenderControl(paragraphRenderControl);
        htmlElementToNodeRenderControlMap.set(paragraphRenderControl.containerHtmlElement, paragraphRenderControl);
        return paragraphRenderControl;
    }
    onConfigChanged(): void {
        throwNotImplemented();
    }
    onBlockRemoved(blockReference: matita.BlockReference): void {
        const blockInfoIndex = this.#blockInfos.findIndex((blockInfo) =>
            matita.areBlockReferencesAtSameBlock(blockInfo.paragraphRenderControl.paragraphReference, blockReference),
        );
        assert(blockInfoIndex !== -1);
        const blockInfo = this.#blockInfos[blockInfoIndex];
        this.#blockInfos.splice(blockInfoIndex, 1);
        const { htmlElementToNodeRenderControlMap } = this.#viewControl.accessDocumentRenderControl();
        htmlElementToNodeRenderControlMap.delete(blockInfo.containerHtmlElement);
        this.#viewControl.renderControlRegister.unregisterParagraphRenderControl(blockInfo.paragraphRenderControl);
        blockInfo.containerHtmlElement.remove();
        blockInfo.paragraphRenderControl.dispose();
    }
    onParagraphInsertedAfter(paragraphReference: matita.BlockReference, insertAfterBlockReference: matita.BlockReference | null): void {
        const paragraphRenderControl = this.#makeParagraphRenderControl(paragraphReference);
        if (insertAfterBlockReference === null) {
            this.containerHtmlElement$.currentValue.prepend(paragraphRenderControl.containerHtmlElement);
            this.#blockInfos.unshift({
                paragraphRenderControl,
                containerHtmlElement: paragraphRenderControl.containerHtmlElement,
            });
            return;
        }
        const insertAfterBlockInfoIndex = this.#blockInfos.findIndex((blockInfo) =>
            matita.areBlockReferencesAtSameBlock(blockInfo.paragraphRenderControl.paragraphReference, insertAfterBlockReference),
        );
        assert(insertAfterBlockInfoIndex !== -1);
        this.#blockInfos.splice(insertAfterBlockInfoIndex + 1, 0, {
            paragraphRenderControl,
            containerHtmlElement: paragraphRenderControl.containerHtmlElement,
        });
        const insertAfterBlockInfo = this.#blockInfos[insertAfterBlockInfoIndex];
        assertIsNotNullish(insertAfterBlockInfo);
        insertAfterBlockInfo.containerHtmlElement.insertAdjacentElement('afterend', paragraphRenderControl.containerHtmlElement);
    }
    onEmbedInsertedAfter(embedReference: matita.BlockReference, insertAfterBlockReference: matita.BlockReference | null): void {
        throwNotImplemented();
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    #dispose(): void {}
}
function isScrollable(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const { overflowY } = style;
    return (overflowY && overflowY === 'auto') || overflowY === 'overlay' || overflowY === 'scroll';
}
function findScrollContainer(node: Node): HTMLElement {
    let parent = node.parentNode as HTMLElement;
    let scrollElement: HTMLElement | undefined;
    while (!scrollElement) {
        if (!parent || !parent.parentNode) {
            break;
        }
        if (isScrollable(parent)) {
            scrollElement = parent;
            break;
        }
        parent = parent.parentNode as HTMLElement;
    }
    if (!scrollElement) {
        return window.document.documentElement;
    }
    return scrollElement;
}
function addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
): Disposable;
function addEventListener(
    element: HTMLElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): Disposable;
function addEventListener(
    element: HTMLElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): Disposable {
    element.addEventListener(type, listener, options);
    return Disposable(() => {
        element.removeEventListener(type, listener, options);
    });
}
function addDocumentEventListener<K extends keyof DocumentEventMap>(
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
): Disposable;
function addDocumentEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposable;
function addDocumentEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposable {
    document.addEventListener(type, listener, options);
    return Disposable(() => {
        document.removeEventListener(type, listener, options);
    });
}
function addWindowEventListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
): Disposable;
function addWindowEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposable;
function addWindowEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposable {
    window.addEventListener(type, listener, options);
    return Disposable(() => {
        window.removeEventListener(type, listener, options);
    });
}
function requestIdleCallbackDisposable(callback: IdleRequestCallback, options?: IdleRequestOptions) {
    if (typeof requestIdleCallback === 'undefined') {
        const disposable = Disposable(() => {
            clearTimeout(timeoutId);
        });
        const timeoutId = setTimeout(() => {
            disposable.dispose();
            const start = Date.now();
            callback({
                didTimeout: false,
                timeRemaining: () => Math.max(0, 10 - start),
            });
        }, 500);
        return disposable;
    }
    const disposable = Disposable(() => {
        cancelIdleCallback(requestId);
    });
    const requestId = requestIdleCallback((deadline) => {
        disposable.dispose();
        callback(deadline);
    }, options);
    return disposable;
}
function findClosestNodeRenderControl(
    viewControl: VirtualizedViewControl,
    fromNode: Node,
): VirtualizedParagraphRenderControl | VirtualizedContentRenderControl | null;
function findClosestNodeRenderControl<T extends typeof VirtualizedContentRenderControl | typeof VirtualizedParagraphRenderControl>(
    viewControl: VirtualizedViewControl,
    fromNode: Node,
    specificType: T,
): InstanceType<T> | null;
function findClosestNodeRenderControl(
    viewControl: VirtualizedViewControl,
    fromNode: Node,
    specificType?: typeof VirtualizedContentRenderControl | typeof VirtualizedParagraphRenderControl,
): VirtualizedParagraphRenderControl | VirtualizedContentRenderControl | null {
    const { htmlElementToNodeRenderControlMap } = viewControl.accessDocumentRenderControl();
    if (fromNode instanceof HTMLElement) {
        const nodeRenderControl = htmlElementToNodeRenderControlMap.get(fromNode);
        if (nodeRenderControl && (!specificType || nodeRenderControl instanceof specificType)) {
            return nodeRenderControl;
        }
    }
    let node: Node | null = fromNode;
    while ((node = node.parentElement)) {
        if (!(node instanceof HTMLElement)) {
            continue;
        }
        const nodeRenderControl = htmlElementToNodeRenderControlMap.get(node);
        if (!nodeRenderControl) {
            continue;
        }
        if (specificType && !(nodeRenderControl instanceof specificType)) {
            continue;
        }
        return nodeRenderControl;
    }
    return null;
}
type NativeNodeAndOffset = [node: Node, offset: number];
function getNativeTextNodeAndOffset(root: Element, offset: number): NativeNodeAndOffset {
    const iter = document.createNodeIterator(root, NodeFilter.SHOW_TEXT);
    let end = 0;
    let textNode: Node | null;
    while ((textNode = iter.nextNode())) {
        const start = end;
        const { textContent } = textNode;
        assertIsNotNullish(textContent);
        end += textContent.length;
        if (offset === 0 || (start < offset && offset <= end)) {
            return [textNode, offset - start];
        }
    }
    throwUnreachable();
}
interface SelectionDragPointInfo {
    pointWithContentReference: matita.PointWithContentReference;
    stateView: matita.StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
interface SelectionDragInfo {
    disposable: Disposable;
    isSeparateSelection: boolean;
    lastViewPosition: ViewPosition;
    startPointInfo: SelectionDragPointInfo;
    lastPointInfo: SelectionDragPointInfo;
    previewSelectionRange: matita.SelectionRange | null;
}
function transformSelectionDragPointInfoToCurrentPointWithContentReference(
    pointInfo: SelectionDragPointInfo,
    stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): matita.PointWithContentReference | null {
    const dummyRange = matita.makeRange(
        pointInfo.pointWithContentReference.contentReference,
        pointInfo.pointWithContentReference.point,
        pointInfo.pointWithContentReference.point,
        matita.generateId(),
    );
    const dummySelectionRange = matita.makeSelectionRange([dummyRange], dummyRange.id, dummyRange.id, matita.SelectionRangeIntention.Text, matita.generateId());
    const startSelection = stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
        {
            selection: matita.makeSelection([dummySelectionRange], null),
            fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
        },
        pointInfo.stateView,
        stateControl.stateView,
    );
    if (startSelection.selectionRanges.length === 0) {
        return null;
    }
    return {
        point: startSelection.selectionRanges[0].ranges[0].startPoint,
        contentReference: startSelection.selectionRanges[0].ranges[0].contentReference,
    };
}
interface ViewPosition {
    readonly left: number;
    readonly top: number;
}
interface ViewCursorInfo {
    position: ViewPosition;
    height: number;
    isAnchor: boolean;
    isFocus: boolean;
    paragraphReference: matita.BlockReference;
    offset: number;
    rangeDirection: matita.RangeDirection;
}
interface ViewRangeInfo {
    rectangle: ViewRectangle;
    startOffset: number;
    endOffset: number;
    paragraphReference: matita.BlockReference;
    splitRectangleIndex: number;
}
interface ViewCursorAndRangeInfosForRange {
    viewCursorInfos: ViewCursorInfo[];
    viewRangeInfos: ViewRangeInfo[];
}
interface ViewCursorAndRangeInfosForSelectionRange {
    viewCursorAndRangeInfosForRanges: ViewCursorAndRangeInfosForRange[];
    isPreview: boolean;
    selectionRangeId: string;
}
interface ViewCursorAndRangeInfos {
    getViewCursorAndRangeInfosForSelectionRanges: () => ViewCursorAndRangeInfosForSelectionRange[];
}
function use$<T>(source: Source<T>): Maybe<T> {
    const [value, setValue] = useState<Maybe<T>>(None);
    useEffect(() => {
        setValue(None);
        const sink = Sink<T>((event) => {
            if (event.type === ThrowType) {
                throw event.error;
            }
            setValue(event.type === EndType ? None : Some(event.value));
        });
        source(sink);
        return () => {
            sink.dispose();
        };
    }, [source]);
    return value;
}
interface SelectionViewProps {
    viewCursorAndRangeInfos$: Source<ViewCursorAndRangeInfos>;
    previewViewCursorAndRangeInfos$: Source<ViewCursorAndRangeInfos>;
}
function SelectionView(props: SelectionViewProps): preact.JSX.Element | null {
    const { viewCursorAndRangeInfos$, previewViewCursorAndRangeInfos$ } = props;
    const viewCursorAndRangeInfosMaybe = use$(viewCursorAndRangeInfos$);
    const previewViewCursorAndRangeInfosMaybe = use$(previewViewCursorAndRangeInfos$);
    if (isNone(viewCursorAndRangeInfosMaybe) || isNone(previewViewCursorAndRangeInfosMaybe)) {
        return null;
    }
    const cursorBlinkSpeed = 500;
    const synchronizedCursorVisibility$ = useMemo(
        () =>
            pipe(
                interval(cursorBlinkSpeed),
                map((i) => i % 2 === 1),
                startWith(true),
                share(),
            ),
        [],
    );
    return (
        <Fragment>
            {viewCursorAndRangeInfosMaybe.value
                .getViewCursorAndRangeInfosForSelectionRanges()
                .concat(previewViewCursorAndRangeInfosMaybe.value.getViewCursorAndRangeInfosForSelectionRanges())
                .map((viewCursorAndRangeInfoForSelectionRange) => {
                    return viewCursorAndRangeInfoForSelectionRange.viewCursorAndRangeInfosForRanges.map((viewCursorAndRangeInfosForRange) => {
                        const viewRangeElements = viewCursorAndRangeInfosForRange.viewRangeInfos.map((viewRangeInfo) => {
                            return (
                                <span
                                    key={JSON.stringify([
                                        viewRangeInfo.paragraphReference.blockId,
                                        viewRangeInfo.startOffset,
                                        viewRangeInfo.endOffset,
                                        viewRangeInfo.splitRectangleIndex,
                                    ])}
                                    style={{
                                        position: 'absolute',
                                        top: viewRangeInfo.rectangle.top,
                                        left: viewRangeInfo.rectangle.left,
                                        width: viewRangeInfo.rectangle.width,
                                        height: viewRangeInfo.rectangle.height,
                                        backgroundColor: '#accef7bb',
                                    }}
                                />
                            );
                        });
                        const viewCursorElements = viewCursorAndRangeInfosForRange.viewCursorInfos.map((viewCursorInfo) => {
                            return (
                                <BlinkingCursor
                                    key={JSON.stringify([
                                        viewCursorInfo.paragraphReference.blockId,
                                        viewCursorInfo.isAnchor,
                                        viewCursorInfo.isFocus,
                                        viewCursorInfo.offset,
                                        viewCursorInfo.rangeDirection,
                                    ])}
                                    viewCursorInfo={viewCursorInfo}
                                    synchronizedCursorVisibility$={synchronizedCursorVisibility$}
                                    cursorBlinkSpeed={cursorBlinkSpeed}
                                    isPreview={viewCursorAndRangeInfoForSelectionRange.isPreview}
                                />
                            );
                        });
                        return viewRangeElements.concat(viewCursorElements);
                    });
                })}
        </Fragment>
    );
}
interface BlinkingCursorProps {
    viewCursorInfo: ViewCursorInfo;
    synchronizedCursorVisibility$: Source<boolean>;
    cursorBlinkSpeed: number;
    isPreview: boolean;
}
function BlinkingCursor(props: BlinkingCursorProps): preact.JSX.Element | null {
    const { viewCursorInfo, synchronizedCursorVisibility$, cursorBlinkSpeed, isPreview } = props;
    if (!viewCursorInfo.isFocus) {
        return null;
    }
    const isVisibleMaybe = use$(
        useMemo(
            () =>
                isPreview
                    ? ofEvent<boolean>(End)
                    : pipe(
                          fromArray([
                              pipe(
                                  timer(cursorBlinkSpeed / 2),
                                  map(() => true),
                              ),
                              synchronizedCursorVisibility$,
                          ]),
                          flat(1),
                      ),
            [isPreview, cursorBlinkSpeed, synchronizedCursorVisibility$],
        ),
    );
    return (
        <span
            style={{
                position: 'absolute',
                top: viewCursorInfo.position.top,
                left: viewCursorInfo.position.left,
                width: 2,
                height: viewCursorInfo.height,
                backgroundColor: '#222',
                visibility: isNone(isVisibleMaybe) || (isSome(isVisibleMaybe) && isVisibleMaybe.value) ? 'visible' : 'hidden',
            }}
        />
    );
}
class ReactiveMutationObserver extends DisposableClass {
    records$: Source<MutationRecord[]>;
    #records$: Subject<MutationRecord[]>;
    #observerTargets: {
        target: Node;
        options?: MutationObserverInit;
    }[];
    #mutationObserver: MutationObserver;
    constructor() {
        super(() => this.#dispose());
        this.#observerTargets = [];
        this.#records$ = Subject();
        this.records$ = Source(this.#records$);
        this.add(this.#records$);
        this.#mutationObserver = new MutationObserver((records) => {
            this.#records$(Push(records));
        });
    }
    observe(target: Node, options?: MutationObserverInit): Disposable {
        if (!this.active) {
            return disposed;
        }
        this.#observerTargets.push({ target, options });
        this.#mutationObserver.observe(target, options);
        return Disposable(() => {
            this.unobserve(target);
        });
    }
    unobserve(target: Node): void {
        if (!this.active) {
            return;
        }
        const newObserverTargets = this.#observerTargets.filter((ot) => ot.target !== target);
        this.#observerTargets = [];
        const records = this.#mutationObserver.takeRecords();
        this.#records$(Push(records.filter((record) => record.target !== target)));
        this.#mutationObserver.disconnect();
        newObserverTargets.forEach((otherTarget) => {
            this.observe(otherTarget.target, otherTarget.options);
        });
    }
    #dispose(): void {
        this.#mutationObserver.disconnect();
        this.#observerTargets = [];
    }
}
class ReactiveIntersectionObserver extends DisposableClass {
    entries$: Source<IntersectionObserverEntry[]>;
    #entries$: Subject<IntersectionObserverEntry[]>;
    #intersectionObserver: IntersectionObserver;
    constructor(options?: IntersectionObserverInit) {
        super(() => this.#dispose());
        this.#entries$ = Subject();
        this.entries$ = Source(this.#entries$);
        this.add(this.#entries$);
        this.#intersectionObserver = new IntersectionObserver((entries) => {
            this.#entries$(Push(entries));
        }, options);
    }
    observe(target: Element): Disposable {
        if (!this.active) {
            return disposed;
        }
        this.#intersectionObserver.observe(target);
        return Disposable(() => {
            this.unobserve(target);
        });
    }
    unobserve(target: Element): void {
        if (!this.active) {
            return;
        }
        this.#intersectionObserver.unobserve(target);
    }
    #dispose(): void {
        this.#intersectionObserver.disconnect();
    }
}
class ReactiveResizeObserver extends DisposableClass {
    entries$: Source<ResizeObserverEntry[]>;
    #entries$: Subject<ResizeObserverEntry[]>;
    #resizeObserver: ResizeObserver;
    constructor() {
        super(() => this.#dispose());
        this.#entries$ = Subject();
        this.entries$ = Source(this.#entries$);
        this.add(this.#entries$);
        this.#resizeObserver = new ResizeObserver((entries) => {
            this.#entries$(Push(entries));
        });
    }
    observe(target: Element, options?: ResizeObserverOptions): Disposable {
        if (!this.active) {
            return disposed;
        }
        this.#resizeObserver.observe(target, options);
        return Disposable(() => {
            this.unobserve(target);
        });
    }
    unobserve(target: Element): void {
        if (!this.active) {
            return;
        }
        this.#resizeObserver.unobserve(target);
    }
    #dispose(): void {
        this.#resizeObserver.disconnect();
    }
}
interface ViewRectangle extends ViewPosition {
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}
function makeViewRectangle(left: number, top: number, width: number, height: number): ViewRectangle {
    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
}
function shiftViewRectangle(rectangle: ViewRectangle, deltaRight: number, deltaDown: number): ViewRectangle {
    return makeViewRectangle(rectangle.left + deltaRight, rectangle.top + deltaDown, rectangle.width, rectangle.height);
}
function getViewRectangleIntersection(rectangle1: ViewRectangle, rectangle2: ViewRectangle): ViewRectangle {
    const x1 = Math.max(rectangle1.left, rectangle2.left);
    const x2 = Math.min(rectangle1.right, rectangle2.right);
    const y1 = Math.max(rectangle1.top, rectangle2.top);
    const y2 = Math.min(rectangle1.bottom, rectangle2.bottom);
    return makeViewRectangle(x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1));
}
function subtractViewRectangles(rectangle: ViewRectangle, holeRectangle: ViewRectangle): ViewRectangle[] {
    const intersection = getViewRectangleIntersection(rectangle, holeRectangle);
    if (intersection.width === 0 || intersection.height === 0) {
        return [rectangle];
    }
    // -------------------------
    // |          A            |
    // |-----------------------|
    // |  B  |   hole    |  C  |
    // |-----------------------|
    // |          D            |
    // -------------------------
    const rectangles: ViewRectangle[] = [];
    const heightA = intersection.top - rectangle.top;
    if (heightA > 0) {
        rectangles.push(makeViewRectangle(rectangle.left, rectangle.top, rectangle.width, heightA));
    }
    const widthB = intersection.left - rectangle.left;
    if (widthB > 0) {
        rectangles.push(makeViewRectangle(rectangle.left, intersection.top, widthB, intersection.height));
    }
    const widthC = rectangle.right - intersection.right;
    if (widthC > 0) {
        rectangles.push(makeViewRectangle(intersection.right, intersection.top, widthC, intersection.height));
    }
    const heightD = rectangle.bottom - intersection.bottom;
    if (heightD > 0) {
        rectangles.push(makeViewRectangle(rectangle.left, intersection.bottom, rectangle.width, heightD));
    }
    return rectangles;
}
interface MeasuredParagraphLineRange {
    startOffset: number;
    endOffset: number;
    boundingRect: ViewRectangle;
    characterRectangles: ViewRectangle[];
}
interface TextElementMeasurement {
    characterRectangles: ViewRectangle[];
    startOffset: number;
    endOffset: number;
}
interface RelativeParagraphMeasureCacheValue {
    characterRectangles: ViewRectangle[];
    textElementMeasurements: Map<HTMLElement, TextElementMeasurement>;
    measuredParagraphLineRanges: MeasuredParagraphLineRange[];
}
enum BuiltInCommandName {
    MoveSelectionGraphemeBackwards = 'BuiltInCommand.MoveSelectionGraphemeBackwards',
    MoveSelectionWordBackwards = 'BuiltInCommand.MoveSelectionWordBackwards',
    MoveSelectionParagraphBackwards = 'BuiltInCommand.MoveSelectionParagraphBackwards',
    MoveSelectionGraphemeForwards = 'BuiltInCommand.MoveSelectionGraphemeForwards',
    MoveSelectionWordForwards = 'BuiltInCommand.MoveSelectionWordForwards',
    MoveSelectionParagraphForwards = 'BuiltInCommand.MoveSelectionParagraphForwards',
    MoveSelectionSoftLineStart = 'BuiltInCommand.MoveSelectionSoftLineStart',
    MoveSelectionSoftLineEnd = 'BuiltInCommand.MoveSelectionSoftLineEnd',
    MoveSelectionSoftLineDown = 'BuiltInCommand.MoveSelectionSoftLineDown',
    MoveSelectionSoftLineUp = 'BuiltInCommand.MoveSelectionSoftLineUp',
    MoveSelectionStartOfPage = 'BuiltInCommand.MoveSelectionStartOfPage',
    MoveSelectionStartOfDocument = 'BuiltInCommand.MoveSelectionStartOfDocument',
    MoveSelectionEndOfPage = 'BuiltInCommand.MoveSelectionEndOfPage',
    MoveSelectionEndOfDocument = 'BuiltInCommand.MoveSelectionEndOfDocument',
    ExtendSelectionGraphemeBackwards = 'BuiltInCommand.ExtendSelectionGraphemeBackwards',
    ExtendSelectionWordBackwards = 'BuiltInCommand.ExtendSelectionWordBackwards',
    ExtendSelectionParagraphBackwards = 'BuiltInCommand.ExtendSelectionParagraphBackwards',
    ExtendSelectionGraphemeForwards = 'BuiltInCommand.ExtendSelectionGraphemeForwards',
    ExtendSelectionWordForwards = 'BuiltInCommand.ExtendSelectionWordForwards',
    ExtendSelectionParagraphForwards = 'BuiltInCommand.ExtendSelectionParagraphForwards',
    ExtendSelectionSoftLineStart = 'BuiltInCommand.ExtendSelectionSoftLineStart',
    ExtendSelectionSoftLineEnd = 'BuiltInCommand.ExtendSelectionSoftLineEnd',
    ExtendSelectionSoftLineDown = 'BuiltInCommand.ExtendSelectionSoftLineDown',
    ExtendSelectionSoftLineUp = 'BuiltInCommand.ExtendSelectionSoftLineUp',
    ExtendSelectionStartOfPage = 'BuiltInCommand.ExtendSelectionStartOfPage',
    ExtendSelectionStartOfDocument = 'BuiltInCommand.ExtendSelectionStartOfDocument',
    ExtendSelectionEndOfPage = 'BuiltInCommand.ExtendSelectionEndOfPage',
    ExtendSelectionEndOfDocument = 'BuiltInCommand.ExtendSelectionEndOfDocument',
    RemoveSelectionGraphemeBackwards = 'BuiltInCommand.RemoveSelectionGraphemeBackwards',
    RemoveSelectionWordBackwards = 'BuiltInCommand.RemoveSelectionWordBackwards',
    RemoveSelectionParagraphBackwards = 'BuiltInCommand.RemoveSelectionParagraphBackwards',
    RemoveSelectionGraphemeForwards = 'BuiltInCommand.RemoveSelectionGraphemeForwards',
    RemoveSelectionWordForwards = 'BuiltInCommand.RemoveSelectionWordForwards',
    RemoveSelectionParagraphForwards = 'BuiltInCommand.RemoveSelectionParagraphForwards',
    RemoveSelectionSoftLineStart = 'BuiltInCommand.RemoveSelectionSoftLineStart',
    RemoveSelectionSoftLineEnd = 'BuiltInCommand.RemoveSelectionSoftLineEnd',
    TransposeGraphemes = 'TransposeGraphemes',
    SelectAll = 'SelectAll',
}
enum Platform {
    Apple = 'Apple',
    NotApple = 'NotApple',
    MacOS = 'MacOS',
    Windows = 'Windows',
    Linux = 'Linux',
    Ios = 'Ios',
    Android = 'Android',
}
enum Context {
    Editing = 'Editing',
}
type KeyCommands = {
    key: string | null;
    command: BuiltInCommandName | null;
    platform?: Platform | Platform[] | null;
    context?: Context | Context[] | null;
}[];
const defaultTextEditingKeyCommands: KeyCommands = [
    { key: 'ArrowLeft', command: BuiltInCommandName.MoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+ArrowLeft', command: BuiltInCommandName.MoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+ArrowUp', command: BuiltInCommandName.MoveSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'ArrowRight', command: BuiltInCommandName.MoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+ArrowRight', command: BuiltInCommandName.MoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+ArrowDown', command: BuiltInCommandName.MoveSelectionParagraphForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+ArrowLeft', command: BuiltInCommandName.MoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+ArrowRight', command: BuiltInCommandName.MoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
    { key: 'ArrowDown', command: BuiltInCommandName.MoveSelectionSoftLineDown, platform: Platform.Apple, context: Context.Editing },
    { key: 'ArrowUp', command: BuiltInCommandName.MoveSelectionSoftLineUp, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.MoveSelectionStartOfPage, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+ArrowUp', command: BuiltInCommandName.MoveSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.MoveSelectionEndOfPage, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+ArrowDown', command: BuiltInCommandName.MoveSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: 'Shift+ArrowLeft', command: BuiltInCommandName.ExtendSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Shift+ArrowLeft', command: BuiltInCommandName.ExtendSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Shift+ArrowUp', command: BuiltInCommandName.ExtendSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Shift+ArrowRight', command: BuiltInCommandName.ExtendSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Shift+ArrowRight', command: BuiltInCommandName.ExtendSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Shift+ArrowDown', command: BuiltInCommandName.ExtendSelectionParagraphForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+ArrowLeft', command: BuiltInCommandName.ExtendSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+ArrowRight', command: BuiltInCommandName.ExtendSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
    { key: 'Shift+ArrowDown', command: BuiltInCommandName.ExtendSelectionSoftLineDown, platform: Platform.Apple, context: Context.Editing },
    { key: 'Shift+ArrowUp', command: BuiltInCommandName.ExtendSelectionSoftLineUp, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.ExtendSelectionStartOfPage, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+ArrowUp', command: BuiltInCommandName.ExtendSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.ExtendSelectionEndOfPage, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+ArrowDown', command: BuiltInCommandName.ExtendSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: 'Backspace', command: BuiltInCommandName.RemoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Backspace', command: BuiltInCommandName.RemoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.RemoveSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Delete', command: BuiltInCommandName.RemoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Delete', command: BuiltInCommandName.RemoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
    { key: null, command: BuiltInCommandName.RemoveSelectionParagraphForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Backspace', command: BuiltInCommandName.RemoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Delete', command: BuiltInCommandName.RemoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
    { key: 'Control+t', command: BuiltInCommandName.TransposeGraphemes, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+a', command: BuiltInCommandName.SelectAll, platform: Platform.Apple, context: Context.Editing },
];
function getPlatform(): Platform | null {
    const userAgent = window.navigator.userAgent;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const platform = ((window.navigator as any)?.userAgentData?.platform as string) || window.navigator.platform;
    const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
    const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
    const iosPlatforms = ['iPhone', 'iPad', 'iPod'];
    if (macosPlatforms.indexOf(platform) !== -1) {
        return Platform.MacOS;
    }
    if (iosPlatforms.indexOf(platform) !== -1) {
        return Platform.Ios;
    }
    if (windowsPlatforms.indexOf(platform) !== -1) {
        return Platform.Windows;
    }
    if (/Android/.test(userAgent)) {
        return Platform.Android;
    }
    if (/Linux/.test(platform)) {
        return Platform.Linux;
    }
    return null;
}
const platform = getPlatform() || Platform.Apple;
const platforms = platform === Platform.MacOS || platform === Platform.Ios ? [Platform.Apple, platform] : [Platform.NotApple, platform];
function collapseSelectionRangeBackwards(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    selectionRange: matita.SelectionRange,
): matita.SelectionRange {
    const { anchorPointWithContentReference, focusPointWithContentReference } =
        matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
    const newPointWithContentReference = matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange)
        ? focusPointWithContentReference
        : anchorPointWithContentReference;
    const rangeId = matita.generateId();
    return matita.makeSelectionRange(
        [matita.makeRange(newPointWithContentReference.contentReference, newPointWithContentReference.point, newPointWithContentReference.point, rangeId)],
        rangeId,
        rangeId,
        selectionRange.intention,
        selectionRange.id,
    );
}
function collapseSelectionRangeForwards(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    selectionRange: matita.SelectionRange,
): matita.SelectionRange {
    const { anchorPointWithContentReference, focusPointWithContentReference } =
        matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
    const newPointWithContentReference = matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange)
        ? anchorPointWithContentReference
        : focusPointWithContentReference;
    const rangeId = matita.generateId();
    return matita.makeSelectionRange(
        [matita.makeRange(newPointWithContentReference.contentReference, newPointWithContentReference.point, newPointWithContentReference.point, rangeId)],
        rangeId,
        rangeId,
        selectionRange.intention,
        selectionRange.id,
    );
}
function shouldCollapseSelectionRangeInTextCommand(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    selectionRange: matita.SelectionRange,
): boolean {
    const { anchorPointWithContentReference, focusPointWithContentReference } =
        matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
    return (
        !(selectionRange.ranges.length === 1 && matita.getRangeDirection(document, selectionRange.ranges[0]) === matita.RangeDirection.NeutralText) &&
        selectionRange.intention === matita.SelectionRangeIntention.Text &&
        (matita.isParagraphPoint(anchorPointWithContentReference.point) || matita.isBlockPoint(anchorPointWithContentReference.point)) &&
        (matita.isParagraphPoint(focusPointWithContentReference.point) || matita.isBlockPoint(focusPointWithContentReference.point))
    );
}
interface RegisteredCommand<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
    MyDocumentRenderControl extends matita.DocumentRenderControl,
    MyContentRenderControl extends matita.ContentRenderControl,
    MyParagraphRenderControl extends matita.ParagraphRenderControl,
    MyEmbedRenderControl extends matita.EmbedRenderControl,
> {
    execute: (
        stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
        viewControl: Omit<
            matita.ViewControl<
                DocumentConfig,
                ContentConfig,
                ParagraphConfig,
                EmbedConfig,
                TextConfig,
                VoidConfig,
                MyDocumentRenderControl,
                MyContentRenderControl,
                MyParagraphRenderControl,
                MyEmbedRenderControl
            >,
            'renderControlRegister'
        >,
    ) => void;
}
type CommandRegistry<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
    MyDocumentRenderControl extends matita.DocumentRenderControl,
    MyContentRenderControl extends matita.ContentRenderControl,
    MyParagraphRenderControl extends matita.ParagraphRenderControl,
    MyEmbedRenderControl extends matita.EmbedRenderControl,
> = Map<
    string,
    RegisteredCommand<
        DocumentConfig,
        ContentConfig,
        ParagraphConfig,
        EmbedConfig,
        TextConfig,
        VoidConfig,
        MyDocumentRenderControl,
        MyContentRenderControl,
        MyParagraphRenderControl,
        MyEmbedRenderControl
    >
>;
type GenericRegisteredCommand = RegisteredCommand<
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.DocumentRenderControl,
    matita.ContentRenderControl,
    matita.ParagraphRenderControl,
    matita.EmbedRenderControl
>;
type GenericCommandRegistry = CommandRegistry<
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.DocumentRenderControl,
    matita.ContentRenderControl,
    matita.ParagraphRenderControl,
    matita.EmbedRenderControl
>;
const genericCommandRegistryObject: Record<string, GenericRegisteredCommand> = {
    [BuiltInCommandName.MoveSelectionGraphemeBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (document, _stateControlConfig, selectionRange) =>
                        shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ? collapseSelectionRangeBackwards(document, selectionRange) : false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionWordBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionParagraphBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionGraphemeForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (document, _stateControlConfig, selectionRange) =>
                        shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ? collapseSelectionRangeForwards(document, selectionRange) : false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionWordForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionParagraphForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionStartOfDocument]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionEndOfDocument]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionGraphemeBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionWordBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionParagraphBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionGraphemeForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionWordForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionParagraphForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionStartOfDocument]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionEndOfDocument]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionGraphemeBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionWordBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionParagraphBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionGraphemeForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionWordForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionParagraphForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.TransposeGraphemes]: {
        execute(stateControl): void {
            stateControl.queueUpdate(matita.makeTransposeAtSelectionUpdateFn());
        },
    },
    [BuiltInCommandName.SelectAll]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
                ),
            );
        },
    },
};
const genericCommandRegistry: GenericCommandRegistry = new Map(Object.entries(genericCommandRegistryObject));
type VirtualizedRegisteredCommand = RegisteredCommand<
    DocumentConfig,
    ContentConfig,
    ParagraphConfig,
    EmbedConfig,
    TextConfig,
    VoidConfig,
    VirtualizedDocumentRenderControl,
    VirtualizedContentRenderControl,
    VirtualizedParagraphRenderControl,
    matita.EmbedRenderControl
>;
type VirtualizedCommandRegistry = CommandRegistry<
    DocumentConfig,
    ContentConfig,
    ParagraphConfig,
    EmbedConfig,
    TextConfig,
    VoidConfig,
    VirtualizedDocumentRenderControl,
    VirtualizedContentRenderControl,
    VirtualizedParagraphRenderControl,
    matita.EmbedRenderControl
>;
enum VirtualizedMovementGranularity {
    SoftLineStartEnd = 'SoftLine',
    SoftLineUpDown = 'SoftLineUpDown',
    Page = 'Page',
}
const virtualizedCommandRegistryObject: Record<string, VirtualizedRegisteredCommand> = {
    [BuiltInCommandName.MoveSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(
                        VirtualizedMovementGranularity.SoftLineStartEnd,
                        matita.PointMovement.Previous,
                    ),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineStartEnd, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineDown]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineUpDown, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineUp]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineUpDown, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionStartOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.Page, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionEndOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.Page, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(
                        VirtualizedMovementGranularity.SoftLineStartEnd,
                        matita.PointMovement.Previous,
                    ),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineStartEnd, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineDown]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineUpDown, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineUp]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineUpDown, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionStartOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.Page, matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionEndOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.Page, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(
                        VirtualizedMovementGranularity.SoftLineStartEnd,
                        matita.PointMovement.Previous,
                    ),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeDefaultVirtualizedPointTransformFn(VirtualizedMovementGranularity.SoftLineStartEnd, matita.PointMovement.Next),
                ),
            );
        },
    },
};
const virtualizedCommandRegistry: VirtualizedCommandRegistry = new Map(Object.entries(virtualizedCommandRegistryObject));
function combineCommandRegistries<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
    MyDocumentRenderControl extends matita.DocumentRenderControl,
    MyContentRenderControl extends matita.ContentRenderControl,
    MyParagraphRenderControl extends matita.ParagraphRenderControl,
    MyEmbedRenderControl extends matita.EmbedRenderControl,
>(
    commandRegistries: CommandRegistry<
        DocumentConfig,
        ContentConfig,
        ParagraphConfig,
        EmbedConfig,
        TextConfig,
        VoidConfig,
        MyDocumentRenderControl,
        MyContentRenderControl,
        MyParagraphRenderControl,
        MyEmbedRenderControl
    >[],
): CommandRegistry<
    DocumentConfig,
    ContentConfig,
    ParagraphConfig,
    EmbedConfig,
    TextConfig,
    VoidConfig,
    MyDocumentRenderControl,
    MyContentRenderControl,
    MyParagraphRenderControl,
    MyEmbedRenderControl
> {
    const combinedCommandRegistry: CommandRegistry<
        DocumentConfig,
        ContentConfig,
        ParagraphConfig,
        EmbedConfig,
        TextConfig,
        VoidConfig,
        MyDocumentRenderControl,
        MyContentRenderControl,
        MyParagraphRenderControl,
        MyEmbedRenderControl
    > = new Map();
    const commandNames = new Set(commandRegistries.flatMap((commandRegistry) => Array.from(commandRegistry.keys())));
    for (const commandName of commandNames) {
        combinedCommandRegistry.set(commandName, {
            execute(stateControl, viewControl) {
                for (let j = 0; j < commandRegistries.length; j++) {
                    const commandRegistry = commandRegistries[j];
                    const command = commandRegistry.get(commandName);
                    if (command) {
                        command.execute(stateControl, viewControl);
                    }
                }
            },
        });
    }
    return combinedCommandRegistry;
}
function indexOfNearestLessThan<V, N>(array: V[], needle: N, compare: (value: V, needle: N) => number, low = 0, high = array.length - 1): number {
    if (array.length === 0) return -1;
    let mid: number;
    let item: V;
    let target = -1;
    if (compare(array[high], needle) < 0) {
        return high;
    }
    while (low <= high) {
        mid = (low + high) >> 1;
        item = array[mid];
        const compareResult = compare(item, needle);
        if (compareResult > 0) {
            high = mid - 1;
        } else if (compareResult < 0) {
            target = mid;
            low = mid + 1;
        } else {
            return low;
        }
    }
    return target;
}
class VirtualizedDocumentRenderControl extends DisposableClass implements matita.DocumentRenderControl {
    rootHtmlElement: HTMLElement;
    stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
    viewControl: VirtualizedViewControl;
    topLevelContentReference: matita.ContentReference;
    htmlElementToNodeRenderControlMap: Map<HTMLElement, VirtualizedContentRenderControl | VirtualizedParagraphRenderControl>;
    #containerHtmlElement!: HTMLElement;
    #topLevelContentViewContainerElement!: HTMLElement;
    #selectionViewContainerElement!: HTMLElement;
    #inputElement!: HTMLElement;
    #viewCursorAndRangeInfos$: CurrentValueSubject<ViewCursorAndRangeInfos>;
    #previewViewCursorAndRangeInfos$: CurrentValueSubject<ViewCursorAndRangeInfos>;
    #measureReactiveMutationObserver: ReactiveMutationObserver;
    #measureReactiveResizeObserver: ReactiveResizeObserver;
    #measureReactiveIntersectionObserver: ReactiveIntersectionObserver;
    #relativeParagraphMeasurementCache: LruCache<string, RelativeParagraphMeasureCacheValue>;
    #keyCommands: KeyCommands;
    #commandRegistry: VirtualizedCommandRegistry;
    constructor(
        rootHtmlElement: HTMLElement,
        stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
        viewControl: VirtualizedViewControl,
        topLevelContentReference: matita.ContentReference,
    ) {
        super(() => this.#dispose());
        this.rootHtmlElement = rootHtmlElement;
        this.stateControl = stateControl;
        this.viewControl = viewControl;
        this.topLevelContentReference = topLevelContentReference;
        this.htmlElementToNodeRenderControlMap = new Map();
        this.#viewCursorAndRangeInfos$ = CurrentValueSubject<ViewCursorAndRangeInfos>({
            getViewCursorAndRangeInfosForSelectionRanges: () => [],
        });
        this.#previewViewCursorAndRangeInfos$ = CurrentValueSubject<ViewCursorAndRangeInfos>({
            getViewCursorAndRangeInfosForSelectionRanges: () => [],
        });
        this.#measureReactiveMutationObserver = new ReactiveMutationObserver();
        this.add(this.#measureReactiveMutationObserver);
        this.#measureReactiveResizeObserver = new ReactiveResizeObserver();
        this.add(this.#measureReactiveResizeObserver);
        this.#measureReactiveIntersectionObserver = new ReactiveIntersectionObserver();
        this.add(this.#measureReactiveIntersectionObserver);
        this.#relativeParagraphMeasurementCache = new LruCache(250);
        this.#keyCommands = defaultTextEditingKeyCommands;
        this.#commandRegistry = combineCommandRegistries([genericCommandRegistry, virtualizedCommandRegistry]);
    }
    init(): void {
        this.#containerHtmlElement = document.createElement('div');
        this.#topLevelContentViewContainerElement = document.createElement('div');
        this.#selectionViewContainerElement = document.createElement('div');
        const onViewDeltaSink = Sink(this.#onViewDelta.bind(this));
        this.add(onViewDeltaSink);
        this.stateControl.viewDelta$(onViewDeltaSink);
        const onFinishedUpdatingSink = Sink(this.#onFinishedUpdating.bind(this));
        this.add(onFinishedUpdatingSink);
        this.stateControl.finishedUpdating$(onFinishedUpdatingSink);
        const topLevelContentRenderControl = new VirtualizedContentRenderControl(this.topLevelContentReference, this.viewControl);
        this.viewControl.renderControlRegister.registerContentRenderControl(topLevelContentRenderControl);
        this.add(topLevelContentRenderControl);
        this.#inputElement = this.#createInputElement();
        this.#addInputEventListeners();
        [this.#topLevelContentViewContainerElement, this.#selectionViewContainerElement].forEach((viewElement) => {
            this.add(addEventListener(viewElement, 'pointerdown', this.#onMousePointerDown.bind(this)));
            this.add(addEventListener(viewElement, 'pointerup', this.#onMousePointerUp.bind(this)));
            viewElement.style.userSelect = 'none';
            viewElement.style.cursor = 'text';
        });
        this.#topLevelContentViewContainerElement.appendChild(topLevelContentRenderControl.containerHtmlElement);
        render(
            <SelectionView viewCursorAndRangeInfos$={this.#viewCursorAndRangeInfos$} previewViewCursorAndRangeInfos$={this.#previewViewCursorAndRangeInfos$} />,
            this.#selectionViewContainerElement,
        );
        this.add(
            Disposable(() => {
                render(null, this.#selectionViewContainerElement);
            }),
        );
        this.#containerHtmlElement.style.position = 'relative';
        this.#containerHtmlElement.append(this.#topLevelContentViewContainerElement, this.#selectionViewContainerElement, this.#inputElement);
        this.rootHtmlElement.append(this.#containerHtmlElement);
        const topLevelContentViewContainerElementReactiveResizeObserver = new ReactiveResizeObserver();
        this.add(topLevelContentViewContainerElementReactiveResizeObserver);
        pipe(
            topLevelContentViewContainerElementReactiveResizeObserver.entries$,
            filterMap((entries) => {
                let lastWidth: number | undefined;
                for (const entry of entries) {
                    const width = entry.borderBoxSize?.[0].inlineSize;
                    if (typeof width === 'number') {
                        lastWidth = width;
                    }
                }
                if (typeof lastWidth !== 'undefined') {
                    return Some(lastWidth);
                }
                return None;
            }),
            memoConsecutive((lastWidth, currentWidth) => lastWidth === currentWidth),
            subscribe((event) => {
                if (event.type !== PushType) {
                    throwUnreachable();
                }
                this.#relativeParagraphMeasurementCache.clear();
                this.#replaceDragPreviewSelectionRange();
                this.#replaceViewSelectionRanges();
            }, this),
        );
        topLevelContentViewContainerElementReactiveResizeObserver.observe(this.#topLevelContentViewContainerElement, {
            box: 'border-box',
        });
        pipe(
            fromArray([
                pipe(
                    this.viewControl.renderControlRegister.paragraphRenderControlRegisterUnregister$,
                    filterMap((value) => {
                        if (value.type === matita.RegisterUnregisterEventType.Unregister) {
                            return Some(value.paragraphRenderControl.paragraphReference);
                        }
                        return None;
                    }),
                ),
                pipe(
                    this.stateControl.viewDelta$,
                    flatMap((viewDelta) => fromArray(viewDelta.changes)),
                    filterMap((viewDeltaChange) => {
                        if (viewDeltaChange.type !== matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated) {
                            return None;
                        }
                        const { blockReference } = viewDeltaChange;
                        matita.assertIsParagraph(matita.accessBlockFromBlockReference(this.stateControl.stateView.document, blockReference));
                        return Some(blockReference);
                    }),
                ),
            ]),
            flat(),
            subscribe((event) => {
                if (event.type !== PushType) {
                    throwUnreachable();
                }
                this.#relativeParagraphMeasurementCache.invalidate(event.value.blockId);
            }, this),
        );
        addDocumentEventListener('keydown', this.#onDocumentKeyDown.bind(this));
        addDocumentEventListener('keyup', this.#onDocumentKeyUp.bind(this));
    }
    makeDefaultVirtualizedPointTransformFn(
        movementGranularity: VirtualizedMovementGranularity,
        pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
        return (document, stateControlConfig, selectionRangeIntention, range, point) => {
            if (movementGranularity === VirtualizedMovementGranularity.Page) {
                // TODO.
                const paragraphReferences = matita.accessContentFromContentReference(
                    this.stateControl.stateView.document,
                    this.topLevelContentReference,
                ).blockReferences;
                const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
                if (pointMovement === matita.PointMovement.Previous) {
                    const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, visibleTop, this.#compareParagraphTopToOffsetTop.bind(this)));
                    const startParagraphReference = paragraphReferences[startIndex];
                    return {
                        contentReference: matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, startParagraphReference)),
                        point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(startParagraphReference, 0),
                    };
                }
                const endIndex = Math.min(
                    paragraphReferences.length - 1,
                    indexOfNearestLessThan(paragraphReferences, visibleBottom, this.#compareParagraphTopToOffsetTop.bind(this)),
                );
                const endParagraphReference = paragraphReferences[endIndex];
                return {
                    contentReference: matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, endParagraphReference)),
                    point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(endParagraphReference, 0),
                };
            }
            if (movementGranularity === VirtualizedMovementGranularity.SoftLineStartEnd) {
                if (point.type !== matita.PointType.Paragraph) {
                    return {
                        contentReference: range.contentReference,
                        point,
                    };
                }
                const paragraph = matita.accessParagraphFromParagraphPoint(document, point);
                if (matita.isParagraphEmpty(paragraph)) {
                    return {
                        contentReference: range.contentReference,
                        point,
                    };
                }
                const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
                const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
                for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
                    const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
                    // TODO.
                    if (
                        measuredParagraphLineRange.startOffset <= point.offset &&
                        (i === paragraphMeasurement.measuredParagraphLineRanges.length - 1 ||
                            point.offset < paragraphMeasurement.measuredParagraphLineRanges[i + 1].startOffset)
                    ) {
                        const newPoint = matita.changeParagraphPointOffset(
                            point,
                            pointMovement === matita.PointMovement.Previous ? measuredParagraphLineRange.startOffset : measuredParagraphLineRange.endOffset,
                        );
                        return {
                            contentReference: range.contentReference,
                            point: newPoint,
                        };
                    }
                }
                return {
                    contentReference: range.contentReference,
                    point: matita.changeParagraphPointOffset(point, pointMovement === matita.PointMovement.Previous ? 0 : matita.getParagraphLength(paragraph)),
                };
            }
            if (movementGranularity === VirtualizedMovementGranularity.SoftLineUpDown) {
                matita.assertIsParagraphPoint(point);
                const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(point);
                for (let i = 0; i < 16; i++) {
                    const verticalDelta = ((i + 1) * cursorPositionAndHeight.height) / 2;
                    const newPointWithContentReference = this.#calculatePointWithContentReferenceFromViewPosition({
                        left: cursorPositionAndHeight.position.left,
                        top:
                            pointMovement === matita.PointMovement.Previous
                                ? cursorPositionAndHeight.position.top + cursorPositionAndHeight.height / 2 - verticalDelta
                                : cursorPositionAndHeight.position.top + cursorPositionAndHeight.height / 2 + verticalDelta,
                    });
                    if (!newPointWithContentReference) {
                        break;
                    }
                    if (
                        !matita.areContentReferencesAtSameContent(range.contentReference, newPointWithContentReference.contentReference) ||
                        !matita.arePointsEqual(point, newPointWithContentReference.point)
                    ) {
                        return newPointWithContentReference;
                    }
                }
                return {
                    contentReference: range.contentReference,
                    point: matita.changeParagraphPointOffset(
                        point,
                        pointMovement === matita.PointMovement.Previous
                            ? 0
                            : matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(document, point)),
                    ),
                };
            }
            assertUnreachable(movementGranularity);
        };
    }
    #getCursorPositionAndHeightFromParagraphPoint(point: matita.ParagraphPoint): { position: ViewPosition; height: number } {
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
        const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
        if (paragraphMeasurement.characterRectangles.length === 0) {
            return {
                position: {
                    left: paragraphMeasurement.boundingRect.left,
                    top: paragraphMeasurement.boundingRect.top,
                },
                height: paragraphMeasurement.boundingRect.height,
            };
        }
        for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
            // TODO.
            const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
            if (
                measuredParagraphLineRange.startOffset <= point.offset &&
                (i === paragraphMeasurement.measuredParagraphLineRanges.length - 1 ||
                    point.offset < paragraphMeasurement.measuredParagraphLineRanges[i + 1].startOffset)
            ) {
                return point.offset === paragraphMeasurement.characterRectangles.length
                    ? {
                          position: {
                              left: paragraphMeasurement.characterRectangles[point.offset - 1].right,
                              top: measuredParagraphLineRange.boundingRect.top,
                          },
                          height: measuredParagraphLineRange.boundingRect.height,
                      }
                    : {
                          position: {
                              left: paragraphMeasurement.characterRectangles[point.offset].left,
                              top: measuredParagraphLineRange.boundingRect.top,
                          },
                          height: measuredParagraphLineRange.boundingRect.height,
                      };
            }
        }
        throwUnreachable();
    }
    #keyDownSet = new Set<string>();
    #onDocumentKeyDown(event: KeyboardEvent): void {
        if (platforms.includes(Platform.Apple) && (this.#keyDownSet.has('Meta') || event.key === 'Meta')) {
            this.#keyDownSet.clear();
            this.#keyDownSet.add('Meta'); // MacOS track keyup events after Meta is pressed.
        } else {
            this.#keyDownSet.add(event.key);
        }
        if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
            return;
        }
        const hasMeta = event.metaKey;
        const hasControl = event.ctrlKey;
        const hasAlt = event.altKey;
        const hasShift = event.shiftKey;
        const activeContexts = document.activeElement === this.#inputElement ? [Context.Editing] : [];
        for (let i = 0; i < this.#keyCommands.length; i++) {
            const keyCommand = this.#keyCommands[i];
            const { key, command, context, platform } = keyCommand;
            if (key === null || command === null) {
                continue;
            }
            if (
                !(
                    context == null ||
                    (typeof context === 'string' ? activeContexts.includes(context) : context.some((context) => activeContexts.includes(context)))
                )
            ) {
                continue;
            }
            if (
                !(platform == null || (typeof platform === 'string' ? platforms.includes(platform) : platform.some((platform) => platforms.includes(platform))))
            ) {
                continue;
            }
            const parsedKeySets = key
                .split(/\s*,\s*/)
                .map((string) => string.trim())
                .filter(Boolean)
                .map(
                    (keySet) =>
                        new Set(
                            keySet
                                .split(/\s*\+\s*/)
                                .map((string) => string.trim())
                                .filter(Boolean),
                        ),
                );
            for (let j = 0; j < parsedKeySets.length; j++) {
                const parsedKeySet = parsedKeySets[j];
                const requiredMeta = parsedKeySet.has('Meta');
                const requiredControl = parsedKeySet.has('Control');
                const requiredAlt = parsedKeySet.has('Alt');
                const requiredShift = parsedKeySet.has('Shift');
                const requiredNonModifierKeys = Array.from(parsedKeySet).filter((requiredKey) => !['Meta', 'Control', 'Alt', 'Shift'].includes(requiredKey));
                if (
                    !(
                        requiredNonModifierKeys.every(
                            (requiredNonModifierKey) => this.#keyDownSet.has(requiredNonModifierKey) || event.key === requiredNonModifierKey,
                        ) &&
                        (requiredMeta ? hasMeta : !hasMeta) &&
                        (requiredControl ? hasControl : !hasControl) &&
                        (requiredAlt ? hasAlt : !hasAlt) &&
                        (requiredShift ? hasShift : !hasShift)
                    )
                ) {
                    continue;
                }
                const registeredCommand = this.#commandRegistry.get(command);
                if (!registeredCommand) {
                    continue;
                }
                registeredCommand.execute(this.stateControl, this.viewControl);
                event.preventDefault();
            }
        }
    }
    #onDocumentKeyUp(event: KeyboardEvent): void {
        this.#keyDownSet.delete(event.key);
    }
    #createInputElement(): HTMLElement {
        const inputElement = document.createElement('div');
        inputElement.contentEditable = 'true';
        inputElement.style.maxHeight = '1px';
        inputElement.style.position = 'absolute';
        inputElement.style.left = '-100000px';
        inputElement.style.top = '-100000px';
        inputElement.style.outline = 'none';
        inputElement.style.caretColor = 'transparent';
        return inputElement;
    }
    #addInputEventListeners(): void {
        this.add(addEventListener(this.#inputElement, 'beforeinput', this.#onInputElementBeforeInput.bind(this)));
        this.add(addEventListener(this.#inputElement, 'copy', this.#onCopy.bind(this)));
        this.add(addEventListener(this.#inputElement, 'cut', this.#onCut.bind(this)));
        const inputElementReactiveMutationObserver = new ReactiveMutationObserver();
        pipe(
            inputElementReactiveMutationObserver.records$,
            subscribe((event) => {
                if (event.type !== PushType) {
                    throwUnreachable();
                }
                this.#inputElement.replaceChildren();
            }, this),
        );
        this.add(inputElementReactiveMutationObserver);
        inputElementReactiveMutationObserver.observe(this.#inputElement, {
            childList: true,
        });
    }
    #onCopy(event: ClipboardEvent): void {
        event.preventDefault();
        this.stateControl.queueUpdate(() => {
            this.#copySelectionToClipboard();
        });
    }
    #onCut(event: ClipboardEvent): void {
        event.preventDefault();
        this.stateControl.queueUpdate(() => {
            this.#copySelectionToClipboard();
            this.stateControl.delta.applyUpdate(matita.makeRemoveSelectionContentsUpdateFn());
        });
    }
    #copySelectionToClipboard(): void {
        // TODO.
    }
    onConfigChanged(): void {
        throwNotImplemented();
    }
    #onInputElementBeforeInput(event: InputEvent): void {
        event.preventDefault();
        if (event.inputType === 'insertText' || event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
            let insertText = '';
            if (event.dataTransfer) {
                insertText = event.dataTransfer.getData('text/plain');
            }
            if (!insertText) {
                insertText = event.data || '';
            }
            if (!insertText) {
                return;
            }
            if (insertText.includes('\n')) {
                const contentFragment = matita.makeContentFragment(
                    insertText.split(/\r?\n/g).map((line) => {
                        const lineText = line.replaceAll('\r', '');
                        return matita.makeContentFragmentParagraph(
                            matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()),
                        );
                    }),
                );
                this.stateControl.queueUpdate(() => {
                    this.stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
                });
            } else {
                insertText = insertText.replaceAll('\r', '');
                if (insertText) {
                    this.stateControl.queueUpdate(() => {
                        this.stateControl.delta.applyUpdate(matita.makeInsertTextWithConfigAtSelectionUpdateFn({}, {}, insertText));
                    });
                }
            }
        }
    }
    #measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): RelativeParagraphMeasureCacheValue & { boundingRect: ViewRectangle } {
        // TODO: fix when columns.
        const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
        const containerHtmlElement = paragraphRenderControl.containerHtmlElement;
        const containerHtmlElementBoundingRect = containerHtmlElement.getBoundingClientRect();
        const shiftCachedMeasurement = (
            cachedMeasurement: RelativeParagraphMeasureCacheValue,
        ): RelativeParagraphMeasureCacheValue & { boundingRect: ViewRectangle } => {
            function shiftRelativeCharacterRectangle(relativeCharacterRectangle: ViewRectangle): ViewRectangle {
                return shiftViewRectangle(relativeCharacterRectangle, containerHtmlElementBoundingRect.left, containerHtmlElementBoundingRect.top);
            }
            function* mapEntries(iterator: Iterable<[HTMLElement, TextElementMeasurement]>): IterableIterator<[HTMLElement, TextElementMeasurement]> {
                for (const [textElement, textElementMeasurement] of iterator) {
                    yield [
                        textElement,
                        {
                            characterRectangles: textElementMeasurement.characterRectangles.map(shiftRelativeCharacterRectangle),
                            startOffset: textElementMeasurement.startOffset,
                            endOffset: textElementMeasurement.endOffset,
                        },
                    ];
                }
            }
            return {
                characterRectangles: cachedMeasurement.characterRectangles.map(shiftRelativeCharacterRectangle),
                textElementMeasurements: new Map(mapEntries(cachedMeasurement.textElementMeasurements.entries())),
                measuredParagraphLineRanges: cachedMeasurement.measuredParagraphLineRanges.map((measuredParagraphLineRange) => {
                    return {
                        boundingRect: shiftRelativeCharacterRectangle(measuredParagraphLineRange.boundingRect),
                        characterRectangles: measuredParagraphLineRange.characterRectangles.map(shiftRelativeCharacterRectangle),
                        startOffset: measuredParagraphLineRange.startOffset,
                        endOffset: measuredParagraphLineRange.endOffset,
                    };
                }),
                boundingRect: makeViewRectangle(
                    containerHtmlElementBoundingRect.left,
                    containerHtmlElementBoundingRect.top,
                    containerHtmlElementBoundingRect.width,
                    containerHtmlElementBoundingRect.height,
                ),
            };
        };
        const cachedMeasurement = this.#relativeParagraphMeasurementCache.get(paragraphReference.blockId);
        if (cachedMeasurement) {
            return shiftCachedMeasurement(cachedMeasurement);
        }
        const measureRange = document.createRange();
        const lineWrappingRange = document.createRange();
        const lineWrappingRangeAddedIndices = new Map<number, number>();
        let firstNativeNodeAndOffset: NativeNodeAndOffset;
        const textElementMeasurements = new Map<HTMLElement, TextElementMeasurement>();
        const measuredParagraphLineRanges: MeasuredParagraphLineRange[] = [];
        const paragraphCharacterRectangles: ViewRectangle[] = [];
        for (let i = 0; i < paragraphRenderControl.textElementInfos.length; i++) {
            const { textStart, textEnd, textElement } = paragraphRenderControl.textElementInfos[i];
            const characterRectangles: ViewRectangle[] = [];
            let previousNativeEndNodeAndOffset: NativeNodeAndOffset | undefined;
            for (let j = 0; j < textEnd - textStart; j++) {
                const nativeStartNodeAndOffset = previousNativeEndNodeAndOffset ?? getNativeTextNodeAndOffset(textElement, j);
                const nativeEndNodeAndOffset = getNativeTextNodeAndOffset(textElement, j + 1);
                previousNativeEndNodeAndOffset = nativeEndNodeAndOffset;
                if (j === 0 && i === 0) {
                    firstNativeNodeAndOffset = nativeEndNodeAndOffset;
                }
                measureRange.setStart(nativeStartNodeAndOffset[0], nativeStartNodeAndOffset[1]);
                measureRange.setEnd(nativeEndNodeAndOffset[0], nativeEndNodeAndOffset[1]);
                const measureRangeBoundingRect = measureRange.getBoundingClientRect();
                const left = measureRangeBoundingRect.left - containerHtmlElementBoundingRect.left;
                const top = measureRangeBoundingRect.top - containerHtmlElementBoundingRect.top;
                const width = measureRangeBoundingRect.width;
                const height = measureRangeBoundingRect.height;
                const characterRectangle = makeViewRectangle(left, top, width, height);
                paragraphCharacterRectangles.push(characterRectangle);
                characterRectangles.push(characterRectangle);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                lineWrappingRange.setStart(firstNativeNodeAndOffset![0], firstNativeNodeAndOffset![1]);
                lineWrappingRange.setEnd(nativeEndNodeAndOffset[0], nativeEndNodeAndOffset[1]);
                const lineWrappingRangeClientRects = lineWrappingRange.getClientRects();
                let totalLines = 1;
                for (let k = 0; k < lineWrappingRangeClientRects.length - 1; k++) {
                    const lineWrappingRangeClientRect = lineWrappingRangeClientRects[k];
                    const nextLineWrappingRangeClientRect = lineWrappingRangeClientRects[k + 1];
                    if (Math.abs(lineWrappingRangeClientRect.top - nextLineWrappingRangeClientRect.top)) {
                        totalLines++;
                    }
                }
                if (!lineWrappingRangeAddedIndices.has(totalLines)) {
                    lineWrappingRangeAddedIndices.set(totalLines, measuredParagraphLineRanges.length);
                    measuredParagraphLineRanges.push({
                        boundingRect: characterRectangle,
                        characterRectangles: [characterRectangle],
                        startOffset: textStart + j,
                        endOffset: textStart + j + 1,
                    });
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const measuredParagraphLineRange = measuredParagraphLineRanges[lineWrappingRangeAddedIndices.get(totalLines)!];
                    const expandedLeft = Math.min(measuredParagraphLineRange.boundingRect.left, characterRectangle.left);
                    const expandedTop = Math.min(measuredParagraphLineRange.boundingRect.top, characterRectangle.top);
                    const expandedRight = Math.max(measuredParagraphLineRange.boundingRect.right, characterRectangle.right);
                    const expandedBottom = Math.max(measuredParagraphLineRange.boundingRect.bottom, characterRectangle.bottom);
                    measuredParagraphLineRange.boundingRect = makeViewRectangle(
                        expandedLeft,
                        expandedTop,
                        expandedRight - expandedLeft,
                        expandedBottom - expandedTop,
                    );
                    measuredParagraphLineRange.characterRectangles.push(characterRectangle);
                    measuredParagraphLineRange.endOffset = textStart + j + 1;
                }
            }
            textElementMeasurements.set(textElement, {
                characterRectangles: characterRectangles,
                startOffset: textStart,
                endOffset: textEnd,
            });
        }
        const newCachedMeasurement: RelativeParagraphMeasureCacheValue = {
            characterRectangles: paragraphCharacterRectangles,
            textElementMeasurements,
            measuredParagraphLineRanges,
        };
        this.#relativeParagraphMeasurementCache.set(paragraphReference.blockId, newCachedMeasurement);
        return shiftCachedMeasurement(newCachedMeasurement);
    }
    #compareParagraphTopToOffsetTop(paragraphReference: matita.BlockReference, needle: number): number {
        const paragraphNodeControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
        const boundingBox = paragraphNodeControl.containerHtmlElement.getBoundingClientRect();
        return boundingBox.top - needle;
    }
    #calculatePointWithContentReferenceFromViewPosition(viewPosition: ViewPosition): matita.PointWithContentReference | null {
        // TODO: fix when columns.
        const hitElements = document.elementsFromPoint(viewPosition.left, viewPosition.top);
        let paragraphReferences: matita.BlockReference[];
        const nodeRenderControl = hitElements.length === 0 ? null : findClosestNodeRenderControl(this.viewControl, hitElements[0]);
        if (!nodeRenderControl) {
            // TODO.
            paragraphReferences = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference).blockReferences;
        } else if (nodeRenderControl instanceof VirtualizedParagraphRenderControl) {
            const { paragraphReference } = nodeRenderControl;
            const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            if (matita.isParagraphEmpty(paragraph)) {
                return {
                    contentReference: matita.makeContentReferenceFromContent(
                        matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
                    ),
                    point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, 0),
                };
            }
            // TODO.
            paragraphReferences = [paragraphReference];
        } else {
            // TODO.
            paragraphReferences = matita.accessContentFromContentReference(
                this.stateControl.stateView.document,
                nodeRenderControl.contentReference,
            ).blockReferences;
        }
        const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
        const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, visibleTop, this.#compareParagraphTopToOffsetTop.bind(this)));
        const endIndex = Math.min(
            paragraphReferences.length - 1,
            indexOfNearestLessThan(paragraphReferences, visibleBottom, this.#compareParagraphTopToOffsetTop.bind(this), startIndex),
        );
        const possibleLines: {
            paragraphReference: matita.BlockReference;
            measuredParagraphLineRange?: MeasuredParagraphLineRange;
            boundingRect: ViewRectangle;
        }[] = [];
        for (let i = startIndex; i <= endIndex; i++) {
            const paragraphReference = paragraphReferences[i];
            const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
            if (paragraphMeasurement.measuredParagraphLineRanges.length === 0) {
                possibleLines.push({
                    paragraphReference,
                    boundingRect: this.viewControl
                        .accessParagraphRenderControlAtBlockReference(paragraphReference)
                        .containerHtmlElement.getBoundingClientRect(),
                });
            }
            for (let j = 0; j < paragraphMeasurement.measuredParagraphLineRanges.length; j++) {
                const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[j];
                possibleLines.push({
                    paragraphReference,
                    measuredParagraphLineRange,
                    boundingRect: measuredParagraphLineRange.boundingRect,
                });
            }
        }
        const epsilon = 1;
        for (let i = 0; i < possibleLines.length; i++) {
            const possibleLine = possibleLines[i];
            const { paragraphReference, measuredParagraphLineRange, boundingRect } = possibleLine;
            if (!measuredParagraphLineRange) {
                if (
                    boundingRect.left <= viewPosition.left &&
                    viewPosition.left <= boundingRect.right &&
                    boundingRect.top <= viewPosition.top &&
                    viewPosition.top <= boundingRect.bottom
                ) {
                    return {
                        point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, 0),
                        contentReference: matita.makeContentReferenceFromContent(
                            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
                        ),
                    };
                }
                continue;
            }
            const { startOffset, characterRectangles } = measuredParagraphLineRange;
            const lineTop = i === 0 ? -Infinity : boundingRect.top;
            const lineBottom = i === possibleLines.length - 1 ? Infinity : Math.max(possibleLines[i + 1].boundingRect.top, boundingRect.bottom);
            if (!(lineTop - epsilon <= viewPosition.top && viewPosition.top <= lineBottom + epsilon)) {
                continue;
            }
            for (let j = 0; j < characterRectangles.length; j++) {
                const characterRectangle = characterRectangles[j];
                const previousCharacterRightWithoutInfinity = j === 0 ? 0 : Math.min(characterRectangles[j - 1].right, characterRectangle.left);
                const previousCharacterRight = j === 0 ? -Infinity : Math.min(characterRectangles[j - 1].right, characterRectangle.left);
                const characterRight = j === characterRectangles.length - 1 ? Infinity : characterRectangle.right;
                if (!(previousCharacterRight - epsilon <= viewPosition.left && viewPosition.left <= characterRight + epsilon)) {
                    continue;
                }
                return {
                    contentReference: matita.makeContentReferenceFromContent(
                        matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
                    ),
                    point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(
                        paragraphReference,
                        startOffset + j + (viewPosition.left > (characterRectangle.right + previousCharacterRightWithoutInfinity) / 2 ? 1 : 0),
                    ),
                };
            }
        }
        return null;
    }
    #selectionDragInfo: SelectionDragInfo | null = null;
    #calculateDragSelectionRange(
        startPointInfo: SelectionDragPointInfo,
        lastPointInfo: SelectionDragPointInfo,
        calculatedEndPointWithContentReference: matita.PointWithContentReference | null,
    ): matita.SelectionRange | null {
        const startPointWithContentReference = transformSelectionDragPointInfoToCurrentPointWithContentReference(startPointInfo, this.stateControl);
        if (!startPointWithContentReference) {
            return null;
        }
        let endPointWithContentReference: matita.PointWithContentReference;
        if (calculatedEndPointWithContentReference) {
            endPointWithContentReference = calculatedEndPointWithContentReference;
        } else {
            const transformedLastPointWithContentReference =
                lastPointInfo === startPointInfo
                    ? startPointWithContentReference
                    : transformSelectionDragPointInfoToCurrentPointWithContentReference(lastPointInfo, this.stateControl);
            if (!transformedLastPointWithContentReference) {
                return null;
            }
            endPointWithContentReference = transformedLastPointWithContentReference;
        }
        const ranges = matita.makeRangesConnectingPointsAtContentReferences(
            this.stateControl.stateView.document,
            startPointWithContentReference.contentReference,
            startPointWithContentReference.point,
            endPointWithContentReference.contentReference,
            endPointWithContentReference.point,
            matita.generateId(),
        );
        return matita.makeSelectionRange(ranges, ranges[0].id, ranges[ranges.length - 1].id, matita.SelectionRangeIntention.Text, matita.generateId());
    }
    #getScrollContainer(): HTMLElement {
        return findScrollContainer(this.#topLevelContentViewContainerElement);
    }
    #getVisibleTopAndBottom(): { visibleTop: number; visibleBottom: number } {
        const scrollContainer = this.#getScrollContainer();
        const scrollContainerBoundingRect = scrollContainer.getBoundingClientRect();
        const visibleTop = Math.max(scrollContainer.scrollTop + scrollContainerBoundingRect.top, 0);
        const visibleBottom = Math.min(Math.min(visibleTop + scrollContainer.clientHeight, scrollContainerBoundingRect.bottom), window.innerHeight);
        return {
            visibleTop,
            visibleBottom,
        };
    }
    #getVisibleLeftAndRight(): { visibleLeft: number; visibleRight: number } {
        const scrollContainer = this.#getScrollContainer();
        const scrollContainerBoundingRect = scrollContainer.getBoundingClientRect();
        const visibleLeft = Math.max(scrollContainer.scrollLeft + scrollContainerBoundingRect.left, 0);
        const visibleRight = Math.min(Math.min(visibleLeft + scrollContainer.clientWidth, scrollContainerBoundingRect.right), window.innerWidth);
        return {
            visibleLeft,
            visibleRight,
        };
    }
    #isMakeSeparateSelectionKeyDown(): boolean {
        return this.#keyDownSet.has('Alt');
    }
    #onMousePointerDown(event: PointerEvent): void {
        if (this.#selectionDragInfo) {
            this.#selectionDragInfo.disposable.dispose();
            this.#selectionDragInfo = null;
        }
        if (event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }
        const cursorViewPosition: ViewPosition = {
            left: event.x,
            top: event.y,
        };
        const startPointWithContentReference = this.#calculatePointWithContentReferenceFromViewPosition(cursorViewPosition);
        if (startPointWithContentReference === null) {
            return;
        }
        const { pointerId } = event;
        const disposable = Disposable(() => {
            this.#topLevelContentViewContainerElement.releasePointerCapture(pointerId);
        });
        this.#topLevelContentViewContainerElement.setPointerCapture(pointerId);
        disposable.add(addEventListener(this.#topLevelContentViewContainerElement, 'pointermove', this.#onMousePointerMove.bind(this)));
        let lastTime = performance.now();
        const detectScroll = (): void => {
            assertIsNotNullish(this.#selectionDragInfo);
            const currentTime = performance.now();
            const dt = currentTime - lastTime;
            const dtLimited = Math.max(dt, 100);
            lastTime = currentTime;
            requestAnimationFrameDisposable(detectScroll, disposable);
            const { top } = this.#selectionDragInfo.lastViewPosition;
            const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
            const windowScrollPaddingSize = 0.01 * window.innerHeight;
            const startScrollTop = visibleTop + windowScrollPaddingSize;
            const startScrollBottom = visibleBottom - windowScrollPaddingSize;
            const cursorDelta = top < startScrollTop ? top - startScrollTop : top > startScrollBottom ? top - startScrollBottom : 0;
            if (cursorDelta === 0) {
                return;
            }
            const scrollDelta = Math.sign(cursorDelta) * Math.abs(((cursorDelta * dtLimited) / 5 / screen.height + 0.8 * Math.sign(cursorDelta)) * 8) ** 1.25;
            const scrollContainer = this.#getScrollContainer();
            if (scrollContainer === document.documentElement) {
                window.scrollBy(0, scrollDelta);
            } else {
                scrollContainer.scrollTop += scrollDelta;
            }
            this.#updateSelectionDragInfo(this.#selectionDragInfo.lastViewPosition);
        };
        requestAnimationFrameDisposable(detectScroll, disposable);
        this.add(disposable);
        const startPointInfo: SelectionDragPointInfo = {
            pointWithContentReference: startPointWithContentReference,
            stateView: this.stateControl.snapshotStateThroughStateView(),
        };
        this.#selectionDragInfo = {
            disposable,
            isSeparateSelection: this.#isMakeSeparateSelectionKeyDown(),
            lastViewPosition: cursorViewPosition,
            startPointInfo,
            lastPointInfo: startPointInfo,
            previewSelectionRange: this.#calculateDragSelectionRange(startPointInfo, startPointInfo, null),
        };
        this.#replaceDragPreviewSelectionRange();
    }
    #onMousePointerMove(event: PointerEvent): void {
        if (event.pointerType !== 'mouse') {
            return;
        }
        event.preventDefault();
        if (!this.#selectionDragInfo) {
            return;
        }
        const cursorViewPosition: ViewPosition = {
            left: event.x,
            top: event.y,
        };
        this.#updateSelectionDragInfo(cursorViewPosition);
    }
    #updateSelectionDragInfo(cursorViewPosition: ViewPosition): void {
        assertIsNotNullish(this.#selectionDragInfo);
        this.#selectionDragInfo.lastViewPosition = cursorViewPosition;
        const mouseDragCurrent = this.#calculatePointWithContentReferenceFromViewPosition(cursorViewPosition);
        if (!mouseDragCurrent) {
            return;
        }
        const lastPointInfo: SelectionDragPointInfo = {
            pointWithContentReference: mouseDragCurrent,
            stateView: this.stateControl.snapshotStateThroughStateView(),
        };
        this.#selectionDragInfo.lastPointInfo = lastPointInfo;
        this.#selectionDragInfo.previewSelectionRange = this.#calculateDragSelectionRange(this.#selectionDragInfo.startPointInfo, lastPointInfo, null);
        this.#replaceDragPreviewSelectionRange();
    }
    #onMousePointerUp(event: PointerEvent): void {
        if (event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }
        event.preventDefault();
        if (!this.#selectionDragInfo) {
            return;
        }
        const { startPointInfo, lastPointInfo } = this.#selectionDragInfo;
        this.#selectionDragInfo.disposable.dispose();
        this.#selectionDragInfo = null;
        const cursorViewPosition = {
            left: event.x,
            top: event.y,
        };
        const calculatedEndPointWithContentReference = this.#calculatePointWithContentReferenceFromViewPosition(cursorViewPosition);
        this.stateControl.queueUpdate(() => {
            const selectionRange = this.#calculateDragSelectionRange(startPointInfo, lastPointInfo, calculatedEndPointWithContentReference);
            if (!selectionRange) {
                return;
            }
            const newSelection = matita.makeSelection([selectionRange], selectionRange.id);
            this.stateControl.delta.setSelection(newSelection);
        });
        pipe(this.stateControl.finishedUpdating$, take(1), () => {
            this.#focusInput();
        });
        this.#replaceDragPreviewSelectionRange();
    }
    #focusInput(): void {
        this.#inputElement.focus({
            preventScroll: true,
        });
    }
    #onViewDelta(event: Event<matita.ViewDelta>): void {
        if (event.type !== PushType) {
            throwUnreachable();
        }
        this.viewControl.applyViewDelta(event.value);
    }
    #onFinishedUpdating(event: Event<matita.FinishedUpdatingMessage>): void {
        if (event.type !== PushType) {
            throwUnreachable();
        }
        this.#replaceViewSelectionRanges();
    }
    #memo<T>(fn: () => T): () => T {
        let result: Maybe<T> = None;
        return () => {
            if (isNone(result)) {
                result = Some(fn());
            }
            return result.value;
        };
    }
    #replaceViewSelectionRanges(): void {
        this.#viewCursorAndRangeInfos$(
            Push({
                getViewCursorAndRangeInfosForSelectionRanges: this.#memo(() => {
                    return this.stateControl.stateView.selection.selectionRanges.map((selectionRange) =>
                        this.#makeViewCursorAndRangeInfosForSelectionRange(
                            selectionRange,
                            false,
                            selectionRange.id === this.stateControl.stateView.selection.focusSelectionRangeId,
                        ),
                    );
                }),
            }),
        );
    }
    #replaceDragPreviewSelectionRange(): void {
        this.#previewViewCursorAndRangeInfos$(
            Push({
                getViewCursorAndRangeInfosForSelectionRanges: this.#memo(() => {
                    return this.#selectionDragInfo?.previewSelectionRange
                        ? [this.#makeViewCursorAndRangeInfosForSelectionRange(this.#selectionDragInfo.previewSelectionRange, true, false)]
                        : [];
                }),
            }),
        );
    }
    #makeViewCursorAndRangeInfosForSelectionRange(
        selectionRange: matita.SelectionRange,
        isPreview: boolean,
        isFocusSelectionRange: boolean,
    ): ViewCursorAndRangeInfosForSelectionRange {
        return {
            viewCursorAndRangeInfosForRanges: selectionRange.ranges.map((range) =>
                this.#makeViewCursorAndRangeInfosForRange(
                    range,
                    range.id === selectionRange.anchorRangeId,
                    range.id === selectionRange.focusRangeId,
                    isFocusSelectionRange,
                ),
            ),
            isPreview,
            selectionRangeId: selectionRange.id,
        };
    }
    #makeViewCursorAndRangeInfosForRange(
        range: matita.Range,
        isAnchor: boolean,
        isFocus: boolean,
        isFocusSelectionRange: boolean,
    ): ViewCursorAndRangeInfosForRange {
        const { contentReference } = range;
        const direction = matita.getRangeDirection(this.stateControl.stateView.document, range);
        const firstPoint = direction === matita.RangeDirection.Backwards ? range.endPoint : range.startPoint;
        const lastPoint = direction === matita.RangeDirection.Backwards ? range.startPoint : range.endPoint;
        matita.assertIsParagraphPoint(firstPoint);
        matita.assertIsParagraphPoint(lastPoint);
        const firstParagraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
        const lastParagraphReference = matita.makeBlockReferenceFromParagraphPoint(lastPoint);
        const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, firstParagraphReference);
        const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, lastParagraphReference);
        const viewCursorInfos: ViewCursorInfo[] = [];
        const viewRangeInfos: ViewRangeInfo[] = [];
        const scrollContainer = this.#getScrollContainer();
        const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
        const { visibleLeft } = this.#getVisibleLeftAndRight();
        const relativeOffsetTop = scrollContainer.scrollTop + visibleTop;
        const relativeOffsetLeft = scrollContainer.scrollLeft + visibleLeft;
        let previousLineRect: ViewRectangle | undefined;
        for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
            const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, contentReference, i);
            matita.assertIsParagraph(paragraph);
            const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
            let includedParagraphStartOffset: number;
            let includedParagraphEndOffset: number;
            if (i === firstParagraphIndex) {
                includedParagraphStartOffset = firstPoint.offset;
            } else {
                includedParagraphStartOffset = 0;
            }
            if (i === lastParagraphIndex) {
                includedParagraphEndOffset = lastPoint.offset;
            } else {
                includedParagraphEndOffset = matita.getParagraphLength(paragraph);
            }
            const defaultVisibleLineBreakPadding = 8;
            if (matita.isParagraphEmpty(paragraph) && i !== lastParagraphIndex) {
                const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
                const paragraphBoundingClientRect = paragraphRenderControl.containerHtmlElement.getBoundingClientRect();
                const lineRectLeft = paragraphBoundingClientRect.left + relativeOffsetLeft;
                const lineRectTop = paragraphBoundingClientRect.top + relativeOffsetTop;
                const lineRectWidth = defaultVisibleLineBreakPadding;
                const lineRectHeight = paragraphBoundingClientRect.bottom - paragraphBoundingClientRect.top;
                const lineRect = makeViewRectangle(lineRectLeft, lineRectTop, lineRectWidth, lineRectHeight);
                const nonOverlappingLineRects = previousLineRect ? subtractViewRectangles(lineRect, previousLineRect) : [lineRect];
                nonOverlappingLineRects.forEach((nonOverlappingLineRect, splitRectangleIndex) => {
                    viewRangeInfos.push({
                        rectangle: nonOverlappingLineRect,
                        startOffset: 0,
                        endOffset: 0,
                        paragraphReference,
                        splitRectangleIndex,
                    });
                });
                previousLineRect = lineRect;
                continue;
            }
            const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
            for (let j = 0; j < paragraphMeasurement.measuredParagraphLineRanges.length; j++) {
                const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[j];
                const includedLineStartOffset = Math.max(measuredParagraphLineRange.startOffset, includedParagraphStartOffset);
                const includedLineEndOffset = Math.min(measuredParagraphLineRange.endOffset, includedParagraphEndOffset);
                if (includedLineStartOffset > measuredParagraphLineRange.endOffset || includedLineEndOffset < measuredParagraphLineRange.startOffset) {
                    continue;
                }
                const lineRectLeft =
                    (includedLineStartOffset === measuredParagraphLineRange.endOffset
                        ? measuredParagraphLineRange.characterRectangles[includedLineStartOffset - measuredParagraphLineRange.startOffset - 1].right
                        : measuredParagraphLineRange.characterRectangles[includedLineStartOffset - measuredParagraphLineRange.startOffset].left) +
                    relativeOffsetLeft;
                const lineRectTop = measuredParagraphLineRange.boundingRect.top + relativeOffsetTop;
                const lineRectHeight = measuredParagraphLineRange.boundingRect.height;
                let lineRectWidth: number =
                    includedLineStartOffset === includedLineEndOffset
                        ? 0
                        : measuredParagraphLineRange.characterRectangles[includedLineEndOffset - measuredParagraphLineRange.startOffset - 1].right +
                          relativeOffsetLeft -
                          lineRectLeft;
                if (
                    includedLineEndOffset === measuredParagraphLineRange.endOffset &&
                    includedLineEndOffset === includedParagraphEndOffset &&
                    i !== lastParagraphIndex
                ) {
                    const visibleLineBreakPadding = measuredParagraphLineRange.boundingRect.width / measuredParagraphLineRange.characterRectangles.length;
                    lineRectWidth += visibleLineBreakPadding === 0 ? defaultVisibleLineBreakPadding : visibleLineBreakPadding;
                } else if (includedLineStartOffset === includedLineEndOffset) {
                    continue;
                }
                const lineRect = makeViewRectangle(lineRectLeft, lineRectTop, lineRectWidth, lineRectHeight);
                // const nonOverlappingLineRects = [lineRect];
                const nonOverlappingLineRects = previousLineRect ? subtractViewRectangles(lineRect, previousLineRect) : [lineRect];
                nonOverlappingLineRects.forEach((nonOverlappingLineRect, splitRectangleIndex) => {
                    viewRangeInfos.push({
                        rectangle: nonOverlappingLineRect,
                        startOffset: includedLineStartOffset,
                        endOffset: includedLineEndOffset,
                        paragraphReference,
                        splitRectangleIndex,
                    });
                });
                previousLineRect = lineRect;
            }
        }
        if (isFocus) {
            const focusPoint = matita.getFocusPointFromRange(range);
            matita.assertIsParagraphPoint(focusPoint);
            const focusParagraphReference = matita.makeBlockReferenceFromParagraphPoint(focusPoint);
            const cursorOffset = focusPoint.offset;
            const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(focusPoint);
            viewCursorInfos.push({
                position: {
                    left: cursorPositionAndHeight.position.left + relativeOffsetLeft,
                    top: cursorPositionAndHeight.position.top + relativeOffsetTop,
                },
                height: cursorPositionAndHeight.height,
                isAnchor,
                isFocus,
                paragraphReference: focusParagraphReference,
                offset: cursorOffset,
                rangeDirection: direction,
            });
        }
        if (viewCursorInfos.length > 0 && isFocus && isFocusSelectionRange) {
            const lastViewCursor = viewCursorInfos[viewCursorInfos.length - 1];
            this.#inputElement.style.top = `${lastViewCursor.position.top}px`;
            this.#inputElement.style.left = `${lastViewCursor.position.left}px`;
        }
        return {
            viewCursorInfos,
            viewRangeInfos,
        };
    }
    #dispose(): void {
        this.rootHtmlElement.removeChild(this.#containerHtmlElement);
    }
}
const rootHtmlElement = document.querySelector('#myEditor');
assertIsNotNullish(rootHtmlElement);
// eslint-disable-next-line @typescript-eslint/no-floating-promises
makePromiseResolvingToNativeIntlSegmenterOrPolyfill().then((IntlSegmenter) => {
    const stateControlConfig: matita.StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = {
        canContentAtContentReferenceBeRemovedWhenRemovingSelection(document, contentReference) {
            throwNotImplemented();
        },
        fixSelectionRange(document, selectionRange) {
            return selectionRange;
        },
        IntlSegmenter,
    };
    const document_ = matita.makeDocument<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>({}, {}, {}, matita.generateId());
    const topLevelContentId = matita.generateId();
    const topLevelContentReference = matita.makeContentReferenceFromContentId(topLevelContentId);
    matita.applyMutation(
        document_,
        matita.makeRegisterTopLevelContentMutation(
            topLevelContentId,
            {},
            matita.makeContentFragment(
                initialText
                    .split('\n')
                    .map((text) =>
                        matita.makeContentFragmentParagraph(
                            matita.makeParagraph({}, text.length === 0 ? [] : [matita.makeText({}, text)], matita.generateId()),
                        ),
                    ),
            ),
        ),
        null,
        null,
    );
    const stateControl = matita.makeStateControl(document_, stateControlConfig);
    const baseRenderControl: matita.BaseRenderControl<VirtualizedDocumentRenderControl> = {
        makeDocumentRenderControl(rootHtmlElement) {
            return new VirtualizedDocumentRenderControl(rootHtmlElement, stateControl, viewControl, topLevelContentReference);
        },
    };
    const viewControl: VirtualizedViewControl = matita.makeViewControl(baseRenderControl);
    viewControl.bindStateControl(stateControl);
    viewControl.insertIntoRootHtmlElement(rootHtmlElement as HTMLElement);
});
