import { render, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
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
    ThrowType,
    timer,
} from './ruscel/source';
import { CurrentAndPreviousValueSubject, CurrentValueSubject, Subject } from './ruscel/subject';
import { pipe, requestAnimationFrameDisposable } from './ruscel/util';
import { assert, assertIsNotNullish, throwNotImplemented, throwUnreachable } from './util';
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
    textNode: Node;
    endsWithLineBreak: boolean;
}
class VirtualizedParagraphRenderControl extends DisposableClass implements matita.ParagraphRenderControl {
    paragraphReference: matita.BlockReference;
    #viewControl: VirtualizedViewControl;
    containerHtmlElement$: CurrentAndPreviousValueSubject<HTMLElement>;
    textNodeInfos: TextElementInfo[] = [];
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
        containerHtmlElement.style.fontFamily = "'Fira Code', monospace";
        containerHtmlElement.style.fontSize = '14px';
        containerHtmlElement.style.lineHeight = '16px';
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
        this.textNodeInfos = [];
        const text = paragraph.children
            .map((child) => {
                matita.assertIsText(child);
                return child.text;
            })
            .join('');
        const textSplitAtLineBreaks = text.split('\n');
        let textStart = 0;
        const newChildren: Node[] = [];
        textSplitAtLineBreaks.forEach((textPart, i) => {
            const textNode = document.createTextNode(textPart.length === 0 ? '\u200b' : textPart);
            if (i === 0) {
                newChildren.push(textNode);
            } else {
                const textElement = document.createElement('span');
                textElement.style.display = 'block';
                textElement.appendChild(textNode);
                newChildren.push(textElement);
            }
            const textEnd = textStart + textPart.length;
            this.textNodeInfos.push({
                textStart,
                textEnd,
                textNode: textNode,
                endsWithLineBreak: i < textSplitAtLineBreaks.length - 1,
            });
            textStart = textEnd + 1;
        });
        this.containerHtmlElement$.currentValue.replaceChildren(...newChildren);
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
function getNativeTextNodeAndOffset(root: Node, offset: number): NativeNodeAndOffset {
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
interface HitPosition {
    pointWithContentReference: matita.PointWithContentReference;
    isWrappedLineStart: boolean;
}
interface SelectionDragPointInfo {
    position: HitPosition;
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
        pointInfo.position.pointWithContentReference.contentReference,
        pointInfo.position.pointWithContentReference.point,
        pointInfo.position.pointWithContentReference.point,
        matita.generateId(),
    );
    const dummySelectionRange = matita.makeSelectionRange(
        [dummyRange],
        dummyRange.id,
        dummyRange.id,
        matita.SelectionRangeIntention.Text,
        {},
        matita.generateId(),
    );
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
    paragraphLineIndex: number;
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
    hasFocus: boolean;
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
    const viewCursorAndRangeInfos = viewCursorAndRangeInfosMaybe.value.getViewCursorAndRangeInfosForSelectionRanges();
    const previewCursorAndRangeInfos = previewViewCursorAndRangeInfosMaybe.value.getViewCursorAndRangeInfosForSelectionRanges();
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
    const keyCount = new Map<string, number>();
    const makeUniqueKey = (key: string) => {
        const count = keyCount.get(key);
        if (count !== undefined) {
            keyCount.set(key, count + 1);
            return JSON.stringify([key, count]);
        }
        keyCount.set(key, 1);
        return JSON.stringify([key, 0]);
    };
    return (
        <Fragment>
            {(previewCursorAndRangeInfos.length > 0 ? previewCursorAndRangeInfos : viewCursorAndRangeInfos).map((viewCursorAndRangeInfoForSelectionRange) => {
                return viewCursorAndRangeInfoForSelectionRange.viewCursorAndRangeInfosForRanges.map((viewCursorAndRangeInfosForRange) => {
                    const viewRangeElements = viewCursorAndRangeInfosForRange.viewRangeInfos.map((viewRangeInfo) => {
                        return (
                            <span
                                key={makeUniqueKey(JSON.stringify([viewRangeInfo.paragraphReference.blockId, viewRangeInfo.paragraphLineIndex]))}
                                style={{
                                    position: 'absolute',
                                    top: viewRangeInfo.rectangle.top,
                                    left: viewRangeInfo.rectangle.left,
                                    width: viewRangeInfo.rectangle.width,
                                    height: viewRangeInfo.rectangle.height,
                                    backgroundColor:
                                        viewCursorAndRangeInfoForSelectionRange.hasFocus || viewCursorAndRangeInfoForSelectionRange.isPreview
                                            ? '#accef7bb'
                                            : '#d3d3d36c',
                                }}
                            />
                        );
                    });
                    const viewCursorElements = viewCursorAndRangeInfosForRange.viewCursorInfos.map((viewCursorInfo) => {
                        return (
                            <BlinkingCursor
                                key={makeUniqueKey(
                                    JSON.stringify([
                                        viewCursorInfo.paragraphReference.blockId,
                                        viewCursorInfo.isAnchor,
                                        viewCursorInfo.isFocus,
                                        viewCursorInfo.offset,
                                        viewCursorInfo.rangeDirection,
                                    ]),
                                )}
                                viewCursorInfo={viewCursorInfo}
                                synchronizedCursorVisibility$={synchronizedCursorVisibility$}
                                cursorBlinkSpeed={cursorBlinkSpeed}
                                isPreview={viewCursorAndRangeInfoForSelectionRange.isPreview}
                                hasFocus={viewCursorAndRangeInfoForSelectionRange.hasFocus}
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
    hasFocus: boolean;
}
function BlinkingCursor(props: BlinkingCursorProps): preact.JSX.Element | null {
    const { viewCursorInfo, synchronizedCursorVisibility$, cursorBlinkSpeed, isPreview, hasFocus } = props;
    if (!viewCursorInfo.isFocus) {
        return null;
    }
    const isVisibleMaybe = use$(
        useMemo(
            () =>
                !hasFocus || isPreview
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
            [isPreview, cursorBlinkSpeed, synchronizedCursorVisibility$, hasFocus, isPreview],
        ),
    );
    const cursorWidth = 2;
    return (
        <span
            style={{
                position: 'absolute',
                top: viewCursorInfo.position.top,
                left: viewCursorInfo.position.left - cursorWidth / 2,
                width: cursorWidth,
                height: viewCursorInfo.height,
                backgroundColor: hasFocus || isPreview ? '#222' : '#888',
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
    endsWithLineBreak: boolean;
}
interface TextNodeMeasurement {
    characterRectangles: ViewRectangle[];
    startOffset: number;
    endOffset: number;
}
interface RelativeParagraphMeasureCacheValue {
    characterRectangles: (ViewRectangle | null)[];
    textNodeMeasurements: Map<Node, TextNodeMeasurement>;
    measuredParagraphLineRanges: MeasuredParagraphLineRange[];
}
enum BuiltInCommandName {
    MoveSelectionGraphemeBackwards = 'standard.moveSelectionGraphemeBackwards',
    MoveSelectionWordBackwards = 'standard.moveSelectionWordBackwards',
    MoveSelectionParagraphBackwards = 'standard.moveSelectionParagraphBackwards',
    MoveSelectionGraphemeForwards = 'standard.moveSelectionGraphemeForwards',
    MoveSelectionWordForwards = 'standard.moveSelectionWordForwards',
    MoveSelectionParagraphForwards = 'standard.moveSelectionParagraphForwards',
    MoveSelectionSoftLineStart = 'standard.moveSelectionSoftLineStart',
    MoveSelectionSoftLineEnd = 'standard.moveSelectionSoftLineEnd',
    MoveSelectionSoftLineDown = 'standard.moveSelectionSoftLineDown',
    MoveSelectionSoftLineUp = 'standard.moveSelectionSoftLineUp',
    MoveSelectionStartOfPage = 'standard.moveSelectionStartOfPage',
    MoveSelectionStartOfDocument = 'standard.moveSelectionStartOfDocument',
    MoveSelectionEndOfPage = 'standard.moveSelectionEndOfPage',
    MoveSelectionEndOfDocument = 'standard.moveSelectionEndOfDocument',
    ExtendSelectionGraphemeBackwards = 'standard.extendSelectionGraphemeBackwards',
    ExtendSelectionWordBackwards = 'standard.extendSelectionWordBackwards',
    ExtendSelectionParagraphBackwards = 'standard.extendSelectionParagraphBackwards',
    ExtendSelectionGraphemeForwards = 'standard.extendSelectionGraphemeForwards',
    ExtendSelectionWordForwards = 'standard.extendSelectionWordForwards',
    ExtendSelectionParagraphForwards = 'standard.extendSelectionParagraphForwards',
    ExtendSelectionSoftLineStart = 'standard.extendSelectionSoftLineStart',
    ExtendSelectionSoftLineEnd = 'standard.extendSelectionSoftLineEnd',
    ExtendSelectionSoftLineDown = 'standard.extendSelectionSoftLineDown',
    ExtendSelectionSoftLineUp = 'standard.extendSelectionSoftLineUp',
    ExtendSelectionStartOfPage = 'standard.extendSelectionStartOfPage',
    ExtendSelectionStartOfDocument = 'standard.extendSelectionStartOfDocument',
    ExtendSelectionEndOfPage = 'standard.extendSelectionEndOfPage',
    ExtendSelectionEndOfDocument = 'standard.extendSelectionEndOfDocument',
    RemoveSelectionGraphemeBackwards = 'standard.removeSelectionGraphemeBackwards',
    RemoveSelectionWordBackwards = 'standard.removeSelectionWordBackwards',
    RemoveSelectionParagraphBackwards = 'standard.removeSelectionParagraphBackwards',
    RemoveSelectionGraphemeForwards = 'standard.removeSelectionGraphemeForwards',
    RemoveSelectionWordForwards = 'standard.removeSelectionWordForwards',
    RemoveSelectionParagraphForwards = 'standard.removeSelectionParagraphForwards',
    RemoveSelectionSoftLineStart = 'standard.removeSelectionSoftLineStart',
    RemoveSelectionSoftLineEnd = 'standard.removeSelectionSoftLineEnd',
    TransposeGraphemes = 'standard.transposeGraphemes',
    SelectAll = 'standard.selectAll',
    InsertText = 'standard.insertText',
    PasteText = 'standard.insertPastedText',
    DropText = 'standard.insertDroppedText',
    InsertLineBreak = 'standard.insertLineBreak',
    SplitParagraph = 'standard.splitParagraph',
    Undo = 'standard.undo',
    Redo = 'standard.redo',
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
    command: string | null;
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
    { key: 'Meta+ArrowUp', command: BuiltInCommandName.MoveSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
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
    { key: 'Meta+Shift+ArrowUp', command: BuiltInCommandName.ExtendSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+ArrowDown', command: BuiltInCommandName.ExtendSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing },
    { key: 'Backspace', command: BuiltInCommandName.RemoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Backspace', command: BuiltInCommandName.RemoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Delete', command: BuiltInCommandName.RemoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Alt+Delete', command: BuiltInCommandName.RemoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Backspace', command: BuiltInCommandName.RemoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Delete', command: BuiltInCommandName.RemoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
    { key: 'Control+t', command: BuiltInCommandName.TransposeGraphemes, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+a', command: BuiltInCommandName.SelectAll, platform: Platform.Apple, context: Context.Editing },
    { key: 'Shift+Enter', command: BuiltInCommandName.InsertLineBreak, platform: Platform.Apple, context: Context.Editing },
    { key: 'Enter', command: BuiltInCommandName.SplitParagraph, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+z,Meta+Shift+y', command: BuiltInCommandName.Undo, platform: Platform.Apple, context: Context.Editing },
    { key: 'Meta+Shift+z,Meta+y', command: BuiltInCommandName.Redo, platform: Platform.Apple, context: Context.Editing },
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
const platform = getPlatform() ?? Platform.Apple;
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
        selectionRange.data,
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
        selectionRange.data,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any,
    ) => void;
}
type CommandRegister<
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
type GenericCommandRegister = CommandRegister<
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
const doNotScrollToSelectionAfterChangeDataKey = 'standard.doNotScrollToSelectionAfterChange';
enum RedoUndoUpdateKey {
    InsertText = 'standard.redoUndoUpdateKey.insertText',
    RemoveTextForwards = 'standard.redoUndoUpdateKey.removeTextForwards',
    RemoveTextBackwards = 'standard.redoUndoUpdateKey.removeTextBackwards',
    IgnoreRecursiveUpdate = 'standard.redoUndoUpdateKey.ignoreRecursiveUpdate',
}
const genericCommandRegisterObject: Record<string, GenericRegisteredCommand> = {
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
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionGraphemeBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
                ),
                { [RedoUndoUpdateKey.RemoveTextBackwards]: true },
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionWordBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
                ),
                { [RedoUndoUpdateKey.RemoveTextBackwards]: true },
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionParagraphBackwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
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
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
                ),
                { [RedoUndoUpdateKey.RemoveTextForwards]: true },
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionWordForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
                    matita.noopPointTransformFn,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
                ),
                { [RedoUndoUpdateKey.RemoveTextForwards]: true },
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionParagraphForwards]: {
        execute(stateControl): void {
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
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
            stateControl.queueUpdate(() => {
                const extendedSelection = matita.extendSelectionByPointTransformFns(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
                    matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
                );
                stateControl.delta.setSelection(extendedSelection, undefined, {
                    [doNotScrollToSelectionAfterChangeDataKey]: true,
                });
            });
        },
    },
    [BuiltInCommandName.InsertText]: {
        execute(stateControl, _viewControl, data: InsertTextCommandData): void {
            const { insertText } = data;
            const contentFragment = matita.makeContentFragment(
                insertText.split(/\r?\n/g).map((line) => {
                    const lineText = line.replaceAll('\r', '');
                    return matita.makeContentFragmentParagraph(
                        matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()),
                    );
                }),
            );
            stateControl.queueUpdate(
                () => {
                    stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
                },
                { [RedoUndoUpdateKey.InsertText]: true },
            );
        },
    },
    [BuiltInCommandName.PasteText]: {
        execute(stateControl, _viewControl, data: PasteTextCommandData): void {
            const { pasteText } = data;
            const contentFragment = matita.makeContentFragment(
                pasteText.split(/\r?\n/g).map((line) => {
                    const lineText = line.replaceAll('\r', '');
                    return matita.makeContentFragmentParagraph(
                        matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()),
                    );
                }),
            );
            stateControl.queueUpdate(() => {
                stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
            });
        },
    },
    [BuiltInCommandName.DropText]: {
        execute(stateControl, _viewControl, data: DropTextCommandData): void {
            const { dropText } = data;
            const contentFragment = matita.makeContentFragment(
                dropText.split(/\r?\n/g).map((line) => {
                    const lineText = line.replaceAll('\r', '');
                    return matita.makeContentFragmentParagraph(
                        matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()),
                    );
                }),
            );
            stateControl.queueUpdate(() => {
                stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
            });
        },
    },
    [BuiltInCommandName.InsertLineBreak]: {
        execute(stateControl): void {
            // TODO.
            const contentFragment = matita.makeContentFragment([
                matita.makeContentFragmentParagraph(matita.makeParagraph({}, [matita.makeText({}, '\n')], matita.generateId())),
            ]);
            stateControl.queueUpdate(() => {
                stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
            });
        },
    },
    [BuiltInCommandName.SplitParagraph]: {
        execute(stateControl): void {
            // TODO.
            const contentFragment = matita.makeContentFragment([
                matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], matita.generateId())),
                matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], matita.generateId())),
            ]);
            stateControl.queueUpdate(() => {
                stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(contentFragment));
            });
        },
    },
};
interface CommandInfo<Data> {
    commandName: string;
    data: Data;
}
interface InsertTextCommandData {
    insertText: string;
}
function makeInsertTextCommandInfo(insertText: string): CommandInfo<InsertTextCommandData> {
    return {
        commandName: BuiltInCommandName.InsertText,
        data: {
            insertText,
        },
    };
}
interface PasteTextCommandData {
    pasteText: string;
}
function makePasteTextCommandInfo(pasteText: string): CommandInfo<PasteTextCommandData> {
    return {
        commandName: BuiltInCommandName.PasteText,
        data: {
            pasteText,
        },
    };
}
interface DropTextCommandData {
    dropText: string;
}
function makeDropTextCommandInfo(dropText: string): CommandInfo<DropTextCommandData> {
    return {
        commandName: BuiltInCommandName.DropText,
        data: {
            dropText,
        },
    };
}
const genericCommandRegister: GenericCommandRegister = new Map(Object.entries(genericCommandRegisterObject));
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
type VirtualizedCommandRegister = CommandRegister<
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
enum VirtualizedDataKey {
    MoveSelectionSoftLineUpDownCursorOffsetLeft = 'virtualized.moveSelectionSoftLine(Up|Down).cursorOffsetLeft',
    ExtendSelectionSoftLineUpDownCursorOffsetLeft = 'virtualized.extendSelectionSoftLine(Up|Down).cursorOffsetLeft',
    LineWrapFocusCursorWrapToNextLine = 'virtualized.lineWrapFocusCursorWrapToNextLine',
    IgnoreRecursiveUpdate = 'virtualized.(move|extend)SelectionSoftLine(Up|Down).ignoreRecursiveUpdate',
}
const virtualizedCommandRegisterObject: Record<string, VirtualizedRegisteredCommand> = {
    [BuiltInCommandName.MoveSelectionGraphemeBackwards]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous);
            stateControl.queueUpdate(() => {
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        if (shouldCollapseSelectionRangeInTextCommand(stateControl.stateView.document, selectionRange)) {
                            return collapseSelectionRangeBackwards(stateControl.stateView.document, selectionRange);
                        }
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const { contentReference, point } = pointTransformFn(
                                stateControl.stateView.document,
                                stateControl.stateControlConfig,
                                selectionRange.intention,
                                range,
                                focusPoint,
                                selectionRange,
                            );
                            matita.assertIsParagraphPoint(point);
                            const isWrapped = documentRenderControl.isParagraphPointAtWrappedLineWrapPoint(point);
                            cursorWrapped = isWrapped;
                            return [matita.makeRange(contentReference, point, point, range.id)];
                        });
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.focusRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            cursorWrapped ? { ...selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : selectionRange.data,
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(
                    newSelection,
                    undefined,
                    cursorWrappedIds.length === 0 ? undefined : { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
                );
            });
        },
    },
    [BuiltInCommandName.MoveSelectionWordBackwards]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous);
            stateControl.queueUpdate(() => {
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const { contentReference, point } = pointTransformFn(
                                stateControl.stateView.document,
                                stateControl.stateControlConfig,
                                selectionRange.intention,
                                range,
                                focusPoint,
                                selectionRange,
                            );
                            matita.assertIsParagraphPoint(point);
                            const isWrapped = documentRenderControl.isParagraphPointAtWrappedLineWrapPoint(point);
                            cursorWrapped = isWrapped;
                            return [matita.makeRange(contentReference, point, point, range.id)];
                        });
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.focusRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            cursorWrapped ? { ...selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : selectionRange.data,
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(
                    newSelection,
                    undefined,
                    cursorWrappedIds.length === 0 ? undefined : { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
                );
            });
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(() => {
                const movedSelection = matita.moveSelectionByPointTransformFnThroughFocusPoint(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Previous),
                );
                const cursorWrappedIds = stateControl.stateView.selection.selectionRanges.map((selectionRange) => selectionRange.id);
                stateControl.delta.setSelection(
                    matita.makeSelection(
                        movedSelection.selectionRanges.map((selectionRange) =>
                            matita.makeSelectionRange(
                                selectionRange.ranges,
                                selectionRange.anchorRangeId,
                                selectionRange.focusRangeId,
                                selectionRange.intention,
                                { ...selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true },
                                selectionRange.id,
                            ),
                        ),
                        movedSelection.focusSelectionRangeId,
                    ),
                    undefined,
                    { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
                );
            });
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineDown]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = documentRenderControl.makeSoftLineUpDownPointTransformFnWithOffsetLeft(matita.PointMovement.Next);
            stateControl.queueUpdate(() => {
                if (stateControl.stateView.selection.selectionRanges.length === 0) {
                    return;
                }
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        if (matita.getIsSelectionRangeAnchorAfterFocus(stateControl.stateView.document, selectionRange)) {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                            let cursorDidFindVerticalPlacement: boolean | undefined;
                            let cursorWrapped: boolean | undefined;
                            const newRanges = selectionRange.ranges.flatMap((range) => {
                                if (range.id !== selectionRange.anchorRangeId) {
                                    return [];
                                }
                                const anchorPoint = matita.getAnchorPointFromRange(range);
                                const {
                                    pointWithContentReference: { contentReference, point },
                                    offsetLeft,
                                    didFindVerticalPlacement,
                                    isWrappedLineStart,
                                } = pointTransformFn(selectionRange.intention, range, anchorPoint, selectionRange, cursorOffsetLeft);
                                if (cursorOffsetLeft === undefined) {
                                    cursorOffsetLeft = offsetLeft;
                                }
                                cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                                cursorWrapped = !!isWrappedLineStart;
                                return [matita.makeRange(contentReference, point, point, range.id)];
                            });
                            assertIsNotNullish(cursorOffsetLeft);
                            assertIsNotNullish(cursorDidFindVerticalPlacement);
                            assertIsNotNullish(cursorWrapped);
                            if (cursorWrapped) {
                                cursorWrappedIds.push(selectionRange.id);
                            }
                            return matita.makeSelectionRange(
                                newRanges,
                                selectionRange.anchorRangeId,
                                selectionRange.anchorRangeId,
                                selectionRange.intention,
                                Object.assign(
                                    {},
                                    cursorDidFindVerticalPlacement
                                        ? {
                                              ...selectionRange.data,
                                              [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                          }
                                        : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                    cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                                ),
                                selectionRange.id,
                            );
                        }
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                        let cursorDidFindVerticalPlacement: boolean | undefined;
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const {
                                pointWithContentReference: { contentReference, point },
                                offsetLeft,
                                didFindVerticalPlacement,
                                isWrappedLineStart,
                            } = pointTransformFn(selectionRange.intention, range, focusPoint, selectionRange, cursorOffsetLeft);
                            if (cursorOffsetLeft === undefined) {
                                cursorOffsetLeft = offsetLeft;
                            }
                            cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                            cursorWrapped = !!isWrappedLineStart;
                            return [matita.makeRange(contentReference, point, point, range.id)];
                        });
                        assertIsNotNullish(cursorOffsetLeft);
                        assertIsNotNullish(cursorDidFindVerticalPlacement);
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.focusRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            Object.assign(
                                {},
                                cursorDidFindVerticalPlacement
                                    ? {
                                          ...selectionRange.data,
                                          [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                      }
                                    : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                            ),
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(newSelection, undefined, {
                    [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: true,
                    [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds.length > 0 ? cursorWrappedIds : undefined,
                });
            });
        },
    },
    [BuiltInCommandName.MoveSelectionSoftLineUp]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = documentRenderControl.makeSoftLineUpDownPointTransformFnWithOffsetLeft(matita.PointMovement.Previous);
            stateControl.queueUpdate(() => {
                if (stateControl.stateView.selection.selectionRanges.length === 0) {
                    return;
                }
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        if (!matita.getIsSelectionRangeAnchorAfterFocus(stateControl.stateView.document, selectionRange)) {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                            let cursorDidFindVerticalPlacement: boolean | undefined;
                            let cursorWrapped: boolean | undefined;
                            const newRanges = selectionRange.ranges.flatMap((range) => {
                                if (range.id !== selectionRange.anchorRangeId) {
                                    return [];
                                }
                                const anchorPoint = matita.getAnchorPointFromRange(range);
                                const {
                                    pointWithContentReference: { contentReference, point },
                                    offsetLeft,
                                    didFindVerticalPlacement,
                                    isWrappedLineStart,
                                } = pointTransformFn(selectionRange.intention, range, anchorPoint, selectionRange, cursorOffsetLeft);
                                if (cursorOffsetLeft === undefined) {
                                    cursorOffsetLeft = offsetLeft;
                                }
                                cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                                cursorWrapped = !!isWrappedLineStart;
                                return [matita.makeRange(contentReference, point, point, range.id)];
                            });
                            assertIsNotNullish(cursorOffsetLeft);
                            assertIsNotNullish(cursorDidFindVerticalPlacement);
                            assertIsNotNullish(cursorWrapped);
                            if (cursorWrapped) {
                                cursorWrappedIds.push(selectionRange.id);
                            }
                            return matita.makeSelectionRange(
                                newRanges,
                                selectionRange.anchorRangeId,
                                selectionRange.anchorRangeId,
                                selectionRange.intention,
                                Object.assign(
                                    {},
                                    cursorDidFindVerticalPlacement
                                        ? {
                                              ...selectionRange.data,
                                              [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                          }
                                        : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                    cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                                ),
                                selectionRange.id,
                            );
                        }
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                        let cursorDidFindVerticalPlacement: boolean | undefined;
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const {
                                pointWithContentReference: { contentReference, point },
                                offsetLeft,
                                didFindVerticalPlacement,
                                isWrappedLineStart,
                            } = pointTransformFn(selectionRange.intention, range, focusPoint, selectionRange, cursorOffsetLeft);
                            if (cursorOffsetLeft === undefined) {
                                cursorOffsetLeft = offsetLeft;
                            }
                            cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                            cursorWrapped = !!isWrappedLineStart;
                            return [matita.makeRange(contentReference, point, point, range.id)];
                        });
                        assertIsNotNullish(cursorOffsetLeft);
                        assertIsNotNullish(cursorDidFindVerticalPlacement);
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.focusRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            Object.assign(
                                {},
                                cursorDidFindVerticalPlacement
                                    ? {
                                          ...selectionRange.data,
                                          [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                      }
                                    : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                            ),
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(newSelection, undefined, {
                    [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]: true,
                    [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds.length > 0 ? cursorWrappedIds : undefined,
                });
            });
        },
    },
    [BuiltInCommandName.MoveSelectionStartOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => false,
                    documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
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
                    documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(() => {
                const movedSelection = matita.extendSelectionByPointTransformFns(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Previous),
                );
                const cursorWrappedIds = stateControl.stateView.selection.selectionRanges.map((selectionRange) => selectionRange.id);
                stateControl.delta.setSelection(
                    matita.makeSelection(
                        movedSelection.selectionRanges.map((selectionRange) =>
                            matita.makeSelectionRange(
                                selectionRange.ranges,
                                selectionRange.anchorRangeId,
                                selectionRange.focusRangeId,
                                selectionRange.intention,
                                { ...selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true },
                                selectionRange.id,
                            ),
                        ),
                        movedSelection.focusSelectionRangeId,
                    ),
                    undefined,
                    { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
                );
            });
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineDown]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = documentRenderControl.makeSoftLineUpDownPointTransformFnWithOffsetLeft(matita.PointMovement.Next);
            stateControl.queueUpdate(() => {
                if (stateControl.stateView.selection.selectionRanges.length === 0) {
                    return;
                }
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                        let cursorDidFindVerticalPlacement: boolean | undefined;
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                if (range.id === selectionRange.anchorRangeId) {
                                    return [range];
                                }
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const {
                                pointWithContentReference: { contentReference, point },
                                offsetLeft,
                                didFindVerticalPlacement,
                                isWrappedLineStart,
                            } = pointTransformFn(selectionRange.intention, range, focusPoint, selectionRange, cursorOffsetLeft);
                            if (cursorOffsetLeft === undefined) {
                                cursorOffsetLeft = offsetLeft;
                            }
                            cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                            cursorWrapped = !!isWrappedLineStart;
                            return [
                                matita.makeRange(
                                    contentReference,
                                    range.id === selectionRange.anchorRangeId ? matita.getAnchorPointFromRange(range) : point,
                                    point,
                                    range.id,
                                ),
                            ];
                        });
                        assertIsNotNullish(cursorOffsetLeft);
                        assertIsNotNullish(cursorDidFindVerticalPlacement);
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.anchorRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            Object.assign(
                                {},
                                cursorDidFindVerticalPlacement
                                    ? {
                                          ...selectionRange.data,
                                          [VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                      }
                                    : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                            ),
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(newSelection, undefined, {
                    [VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]: true,
                    [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds.length > 0 ? cursorWrappedIds : undefined,
                });
            });
        },
    },
    [BuiltInCommandName.ExtendSelectionSoftLineUp]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            const pointTransformFn = documentRenderControl.makeSoftLineUpDownPointTransformFnWithOffsetLeft(matita.PointMovement.Previous);
            stateControl.queueUpdate(() => {
                if (stateControl.stateView.selection.selectionRanges.length === 0) {
                    return;
                }
                const cursorWrappedIds: string[] = [];
                const newSelection = matita.transformSelectionByTransformingSelectionRanges(
                    stateControl.stateView.document,
                    stateControl.stateControlConfig,
                    stateControl.stateView.selection,
                    (selectionRange) => {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        let cursorOffsetLeft = selectionRange.data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft] as number | undefined;
                        let cursorDidFindVerticalPlacement: boolean | undefined;
                        let cursorWrapped: boolean | undefined;
                        const newRanges = selectionRange.ranges.flatMap((range) => {
                            if (range.id !== selectionRange.focusRangeId) {
                                if (range.id === selectionRange.anchorRangeId) {
                                    return [range];
                                }
                                return [];
                            }
                            const focusPoint = matita.getFocusPointFromRange(range);
                            const {
                                pointWithContentReference: { contentReference, point },
                                offsetLeft,
                                didFindVerticalPlacement,
                                isWrappedLineStart,
                            } = pointTransformFn(selectionRange.intention, range, focusPoint, selectionRange, cursorOffsetLeft);
                            if (cursorOffsetLeft === undefined) {
                                cursorOffsetLeft = offsetLeft;
                            }
                            cursorDidFindVerticalPlacement = didFindVerticalPlacement;
                            cursorWrapped = !!isWrappedLineStart;
                            return [
                                matita.makeRange(
                                    contentReference,
                                    range.id === selectionRange.anchorRangeId ? matita.getAnchorPointFromRange(range) : point,
                                    point,
                                    range.id,
                                ),
                            ];
                        });
                        assertIsNotNullish(cursorOffsetLeft);
                        assertIsNotNullish(cursorDidFindVerticalPlacement);
                        assertIsNotNullish(cursorWrapped);
                        if (cursorWrapped) {
                            cursorWrappedIds.push(selectionRange.id);
                        }
                        return matita.makeSelectionRange(
                            newRanges,
                            selectionRange.anchorRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            Object.assign(
                                {},
                                cursorDidFindVerticalPlacement
                                    ? {
                                          ...selectionRange.data,
                                          [VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]: cursorOffsetLeft,
                                      }
                                    : omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                                cursorWrapped ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                            ),
                            selectionRange.id,
                        );
                    },
                );
                stateControl.delta.setSelection(newSelection, undefined, {
                    [VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]: true,
                    [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds.length > 0 ? cursorWrappedIds : undefined,
                });
            });
        },
    },
    [BuiltInCommandName.ExtendSelectionStartOfPage]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeExtendSelectionByPointTransformFnsUpdateFn(
                    (_document, _stateControlConfig, _selectionRange) => true,
                    matita.noopPointTransformFn,
                    documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
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
                    documentRenderControl.makePagePointTransformFn(matita.PointMovement.Next),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionSoftLineStart]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) =>
                        !shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ||
                        matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange),
                    matita.noopPointTransformFn,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Previous),
                ),
            );
        },
    },
    [BuiltInCommandName.RemoveSelectionSoftLineEnd]: {
        execute(stateControl, viewControl): void {
            const documentRenderControl = viewControl.accessDocumentRenderControl();
            stateControl.queueUpdate(
                matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
                    (document, _stateControlConfig, selectionRange) =>
                        !shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ||
                        !matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange),
                    matita.noopPointTransformFn,
                    documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
                ),
            );
        },
    },
};
const virtualizedCommandRegister: VirtualizedCommandRegister = new Map(Object.entries(virtualizedCommandRegisterObject));
function combineCommandRegistersOverride<
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
    commandRegisters: CommandRegister<
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
): CommandRegister<
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
    const combinedCommandRegister: CommandRegister<
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
    const commandNames = new Set(commandRegisters.flatMap((commandRegister) => Array.from(commandRegister.keys())));
    for (const commandName of commandNames) {
        let lastCommand:
            | RegisteredCommand<
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
            | undefined;
        for (let i = 0; i < commandRegisters.length; i++) {
            const commandRegister = commandRegisters[i];
            const command = commandRegister.get(commandName);
            if (command) {
                lastCommand = command;
            }
        }
        assertIsNotNullish(lastCommand);
        combinedCommandRegister.set(commandName, lastCommand);
    }
    return combinedCommandRegister;
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
function omit<T extends object, K extends string>(value: T, keys: K[]): Omit<T, K> {
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
function scrollCursorRectIntoView(cursorRect: ViewRectangle, scrollElement: HTMLElement, nestedCall?: boolean) {
    if (!nestedCall) {
        scrollElement = findScrollContainer(scrollElement);
        if (scrollElement !== window.document.body && scrollElement !== window.document.documentElement) {
            let s = scrollElement;
            while (true) {
                s = findScrollContainer(s);
                scrollCursorRectIntoView(cursorRect, s, true);
                if (s === window.document.body || s === window.document.documentElement) {
                    break;
                }
            }
        }
    }
    const isWindow = scrollElement === window.document.body || scrollElement === window.document.documentElement;
    let width;
    let height;
    let yOffset;
    let xOffset;
    let scrollElementTop = 0;
    let scrollElementLeft = 0;
    let scrollElementBordersY = 0;
    let scrollElementBordersX = 0;
    let scrollElementPaddingTop = 0;
    let scrollElementPaddingBottom = 0;
    let scrollElementPaddingLeft = 0;
    let scrollElementPaddingRight = 0;
    if (isWindow) {
        const clientWidth = document.documentElement.clientWidth;
        const clientHeight = document.documentElement.clientHeight;
        const { pageYOffset, pageXOffset } = window;
        width = clientWidth;
        height = clientHeight;
        yOffset = pageYOffset;
        xOffset = pageXOffset;
    } else {
        const { top, left } = scrollElement.getBoundingClientRect();
        const style = window.getComputedStyle(scrollElement);
        const borderTopWidth = parseInt(style.borderTopWidth || '0', 10);
        const borderBottomWidth = parseInt(style.borderBottomWidth || '0', 10);
        const borderLeftWidth = parseInt(style.borderLeftWidth || '0', 10);
        const borderRightWidth = parseInt(style.borderRightWidth || '0', 10);
        const paddingTop = parseInt(style.paddingTop || '0', 10);
        const paddingBottom = parseInt(style.paddingBottom || '0', 10);
        const paddingLeft = parseInt(style.paddingLeft || '0', 10);
        const paddingRight = parseInt(style.paddingRight || '0', 10);
        width = scrollElement.clientWidth;
        height = scrollElement.clientHeight;
        scrollElementTop = top + borderTopWidth;
        scrollElementLeft = left + borderLeftWidth;
        scrollElementBordersY = borderTopWidth + borderBottomWidth;
        scrollElementBordersX = borderLeftWidth + borderRightWidth;
        scrollElementPaddingTop = paddingTop;
        scrollElementPaddingBottom = paddingBottom;
        scrollElementPaddingLeft = paddingLeft;
        scrollElementPaddingRight = paddingRight;
        yOffset = scrollElement.scrollTop;
        xOffset = scrollElement.scrollLeft;
    }
    const cursorTop = cursorRect.top + yOffset - scrollElementTop;
    const cursorLeft = cursorRect.left + xOffset - scrollElementLeft;
    let x = xOffset;
    let y = yOffset;
    if (cursorLeft < xOffset) {
        x = cursorLeft - scrollElementPaddingLeft;
    } else if (cursorLeft + cursorRect.width + scrollElementBordersX > xOffset + width) {
        x = cursorLeft + scrollElementBordersX + scrollElementPaddingRight - width;
    }
    if (cursorTop < yOffset) {
        y = cursorTop - scrollElementPaddingTop;
    } else if (cursorTop + cursorRect.height + scrollElementBordersY > yOffset + height) {
        y = cursorTop + scrollElementBordersY + scrollElementPaddingBottom + cursorRect.height - height;
    }
    if (isWindow) {
        window.scrollTo(x, y);
    } else {
        scrollElement.scrollTop = y;
        scrollElement.scrollLeft = x;
    }
}
function memo<T>(fn: () => T): () => T {
    let result: Maybe<T> = None;
    return () => {
        if (isNone(result)) {
            result = Some(fn());
        }
        return result.value;
    };
}
interface MutationResultWithMutation<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
> {
    mutationPart: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
    result: matita.ChangedMutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
interface LocalUndoStateDifference<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
> {
    mutationResults: MutationResultWithMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
    selectionBefore: matita.Selection;
    selectionAfter: matita.Selection;
}
enum LocalUndoControlLastChangeType {
    SelectionAfterChange = 'SelectionAfterChange',
    InsertText = 'InsertText',
    RemoveTextBackwards = 'RemoveTextBackwards',
    RemoveTextForwards = 'RemoveTextForwards',
    Other = 'Other',
}
class LocalUndoControl<
    DocumentConfig extends matita.NodeConfig,
    ContentConfig extends matita.NodeConfig,
    ParagraphConfig extends matita.NodeConfig,
    EmbedConfig extends matita.NodeConfig,
    TextConfig extends matita.NodeConfig,
    VoidConfig extends matita.NodeConfig,
> extends DisposableClass {
    #stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
    #undoStateDifferencesStack: LocalUndoStateDifference<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
    #redoStateDifferencesStack: LocalUndoStateDifference<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
    #mutationResults: MutationResultWithMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
    #lastChangeType: LocalUndoControlLastChangeType | null;
    #selectionBefore: matita.Selection | null;
    #selectionAfter: matita.Selection | null;
    constructor(stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>) {
        super();
        this.#stateControl = stateControl;
        this.#undoStateDifferencesStack = [];
        this.#redoStateDifferencesStack = [];
        this.#mutationResults = [];
        this.#lastChangeType = null;
        this.#selectionBefore = null;
        this.#selectionAfter = null;
        pipe(this.#stateControl.selectionChange$, subscribe(this.#onSelectionChange.bind(this), this));
        pipe(this.#stateControl.mutationPartResult$, subscribe(this.#onMutationResult.bind(this), this));
    }
    #onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
        if (event.type !== PushType) {
            throwUnreachable();
        }
        if (this.#mutationResults.length === 0) {
            return;
        }
        const { updateDataStack } = event.value;
        if (updateDataStack.length > 0) {
            const lastUpdateData = updateDataStack[updateDataStack.length - 1];
            if (
                !!lastUpdateData[RedoUndoUpdateKey.IgnoreRecursiveUpdate] ||
                !!lastUpdateData[RedoUndoUpdateKey.InsertText] ||
                !!lastUpdateData[RedoUndoUpdateKey.RemoveTextBackwards] ||
                !!lastUpdateData[RedoUndoUpdateKey.RemoveTextForwards]
            ) {
                return;
            }
        }
        this.#lastChangeType = LocalUndoControlLastChangeType.SelectionAfterChange;
    }
    #onMutationResult(event: Event<matita.MutationResultMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>): void {
        if (event.type !== PushType) {
            throwUnreachable();
        }
        const { mutationPart, result, updateDataStack, afterMutation$, isFirstMutationPart, isLastMutationPart } = event.value;
        const lastUpdateData = updateDataStack.length > 0 ? updateDataStack[updateDataStack.length - 1] : undefined;
        if ((lastUpdateData && !!lastUpdateData[RedoUndoUpdateKey.IgnoreRecursiveUpdate]) || !result.didChange) {
            return;
        }
        this.#redoStateDifferencesStack = [];
        let changeType: LocalUndoControlLastChangeType;
        if (lastUpdateData && !!lastUpdateData[RedoUndoUpdateKey.InsertText]) {
            changeType = LocalUndoControlLastChangeType.InsertText;
        } else if (lastUpdateData && !!lastUpdateData[RedoUndoUpdateKey.RemoveTextBackwards]) {
            changeType = LocalUndoControlLastChangeType.RemoveTextBackwards;
        } else if (lastUpdateData && !!lastUpdateData[RedoUndoUpdateKey.RemoveTextForwards]) {
            changeType = LocalUndoControlLastChangeType.RemoveTextForwards;
        } else {
            changeType = LocalUndoControlLastChangeType.Other;
        }
        const pushToStack =
            this.#mutationResults.length > 0 &&
            (this.#lastChangeType === LocalUndoControlLastChangeType.Other || (this.#lastChangeType && changeType !== this.#lastChangeType));
        if (isFirstMutationPart) {
            if (pushToStack) {
                this.#pushToStack();
            }
            if (this.#selectionBefore === null) {
                this.#selectionBefore = this.#stateControl.stateView.selection;
            }
        }
        if (isLastMutationPart) {
            this.#lastChangeType = changeType;
        }
        this.#mutationResults.push({
            mutationPart,
            result,
        });
        if (isLastMutationPart) {
            pipe(
                afterMutation$,
                subscribe((event) => {
                    assert(event.type === EndType);
                    this.#selectionAfter = this.#stateControl.stateView.selection;
                }, this),
            );
        }
    }
    #pushToStack(): void {
        if (this.#mutationResults.length === 0) {
            return;
        }
        const mutationResults = this.#mutationResults;
        const selectionBefore = this.#selectionBefore;
        assertIsNotNullish(selectionBefore);
        const selectionAfter = this.#selectionAfter;
        assertIsNotNullish(selectionAfter);
        this.#mutationResults = [];
        this.#lastChangeType = null;
        this.#selectionBefore = null;
        this.#selectionAfter = null;
        this.#undoStateDifferencesStack.push({
            mutationResults,
            selectionBefore,
            selectionAfter,
        });
    }
    tryUndo(): void {
        assert(!this.#stateControl.isInUpdate, 'Cannot undo while in a state update.');
        this.#stateControl.queueUpdate(
            () => {
                if (this.#mutationResults.length > 0) {
                    this.#pushToStack();
                } else if (this.#undoStateDifferencesStack.length === 0) {
                    return;
                }
                const lastStateDifference = this.#undoStateDifferencesStack.pop();
                assertIsNotNullish(lastStateDifference);
                this.#redoStateDifferencesStack.push(lastStateDifference);
                const { mutationResults, selectionBefore } = lastStateDifference;
                const reverseMutations: matita.BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
                for (let i = mutationResults.length - 1; i >= 0; i--) {
                    const mutationResult = mutationResults[i];
                    const { reverseMutation } = mutationResult.result;
                    reverseMutations.push(reverseMutation);
                }
                this.#stateControl.delta.applyMutation(matita.makeBatchMutation(reverseMutations));
                if (selectionBefore.selectionRanges.length > 0) {
                    this.#stateControl.delta.setSelection(selectionBefore);
                }
            },
            { [RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
        );
    }
    tryRedo(): void {
        assert(!this.#stateControl.isInUpdate, 'Cannot redo while in a state update.');
        this.#stateControl.queueUpdate(
            () => {
                if (this.#mutationResults.length > 0) {
                    assert(this.#redoStateDifferencesStack.length === 0);
                    return;
                }
                if (this.#redoStateDifferencesStack.length === 0) {
                    return;
                }
                const lastStateDifference = this.#redoStateDifferencesStack.pop();
                assertIsNotNullish(lastStateDifference);
                this.#undoStateDifferencesStack.push(lastStateDifference);
                const { mutationResults, selectionAfter } = lastStateDifference;
                this.#stateControl.delta.applyMutation(matita.makeBatchMutation(mutationResults.map((mutationResult) => mutationResult.mutationPart)));
                if (selectionAfter.selectionRanges.length > 0) {
                    this.#stateControl.delta.setSelection(selectionAfter);
                }
            },
            { [RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
        );
    }
    registerCommands<
        MyDocumentRenderControl extends matita.DocumentRenderControl,
        MyContentRenderControl extends matita.ContentRenderControl,
        MyParagraphRenderControl extends matita.ParagraphRenderControl,
        MyEmbedRenderControl extends matita.EmbedRenderControl,
    >(
        commandRegister: CommandRegister<
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
    ): void {
        commandRegister.set(BuiltInCommandName.Undo, {
            execute: this.tryUndo.bind(this),
        });
        commandRegister.set(BuiltInCommandName.Redo, {
            execute: this.tryRedo.bind(this),
        });
    }
}
function getNodeBoundingRect(textNode: Node) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    return range.getBoundingClientRect();
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
    #commandRegister: VirtualizedCommandRegister;
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
        this.#commandRegister = combineCommandRegistersOverride([genericCommandRegister, virtualizedCommandRegister]);
    }
    init(): void {
        this.#containerHtmlElement = document.createElement('div');
        this.#topLevelContentViewContainerElement = document.createElement('div');
        this.#selectionViewContainerElement = document.createElement('div');
        pipe(this.stateControl.viewDelta$, subscribe(this.#onViewDelta.bind(this), this));
        pipe(this.stateControl.finishedUpdating$, subscribe(this.#onFinishedUpdating.bind(this), this));
        pipe(this.stateControl.selectionChange$, subscribe(this.#onSelectionChange.bind(this), this));
        const topLevelContentRenderControl = new VirtualizedContentRenderControl(this.topLevelContentReference, this.viewControl);
        this.viewControl.renderControlRegister.registerContentRenderControl(topLevelContentRenderControl);
        this.add(topLevelContentRenderControl);
        this.#inputElement = document.createElement('div');
        this.#inputElement.contentEditable = 'true';
        this.#inputElement.style.maxHeight = '1px';
        this.#inputElement.style.position = 'absolute';
        this.#inputElement.style.left = '-100000px';
        this.#inputElement.style.top = '-100000px';
        this.#inputElement.style.outline = 'none';
        this.#inputElement.style.caretColor = 'transparent';
        this.add(addEventListener(this.#inputElement, 'beforeinput', this.#onInputElementBeforeInput.bind(this)));
        this.add(addEventListener(this.#inputElement, 'copy', this.#onCopy.bind(this)));
        this.add(addEventListener(this.#inputElement, 'cut', this.#onCut.bind(this)));
        this.add(addEventListener(this.#inputElement, 'focus', this.#onInputElementFocus.bind(this)));
        this.add(addEventListener(this.#inputElement, 'blur', this.#replaceViewSelectionRanges.bind(this)));
        this.add(addWindowEventListener('focus', this.#replaceViewSelectionRanges.bind(this)));
        this.add(addWindowEventListener('blur', this.#replaceViewSelectionRanges.bind(this)));
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
        this.#containerHtmlElement.style.overflow = 'clip visible';
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
        const undoControl = new LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(this.stateControl);
        this.add(undoControl);
        undoControl.registerCommands(this.#commandRegister);
    }
    #onInputElementFocus(): void {
        this.#replaceViewSelectionRanges();
    }
    makePagePointTransformFn(
        pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
        return (document, _stateControlConfig, _selectionRangeIntention, _range, _point) => {
            // TODO.
            // Use viewport coordinates?
            const paragraphReferences = matita.accessContentFromContentReference(
                this.stateControl.stateView.document,
                this.topLevelContentReference,
            ).blockReferences;
            const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
            if (pointMovement === matita.PointMovement.Previous) {
                const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, visibleTop - 1, this.#compareParagraphTopToOffsetTop.bind(this)));
                const startParagraphReference = paragraphReferences[startIndex];
                return {
                    contentReference: matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, startParagraphReference)),
                    point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(startParagraphReference, 0),
                };
            }
            const endIndex = Math.min(
                paragraphReferences.length - 1,
                indexOfNearestLessThan(paragraphReferences, visibleBottom + 1, this.#compareParagraphTopToOffsetTop.bind(this)),
            );
            const endParagraphReference = paragraphReferences[endIndex];
            return {
                contentReference: matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, endParagraphReference)),
                point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(endParagraphReference, 0),
            };
        };
    }
    makeSoftLineStartEndPointTransformFn(
        pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
        return (document, _stateControlConfig, _selectionRangeIntention, range, point, selectionRange) => {
            const isLineWrapToNextLine = !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine];
            if (point.type !== matita.PointType.Paragraph) {
                return {
                    contentReference: range.contentReference,
                    point,
                };
            }
            const paragraph = matita.accessParagraphFromParagraphPoint(document, point);
            const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
            const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
            for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
                const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
                if (
                    measuredParagraphLineRange.startOffset <= point.offset &&
                    point.offset <= measuredParagraphLineRange.endOffset &&
                    !(
                        point.offset === measuredParagraphLineRange.endOffset &&
                        isLineWrapToNextLine &&
                        i !== paragraphMeasurement.measuredParagraphLineRanges.length - 1
                    )
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
        };
    }
    makeSoftLineUpDownPointTransformFnWithOffsetLeft(
        pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    ): (
        selectionRangeIntention: matita.SelectionRangeIntention,
        range: matita.Range,
        point: matita.Point,
        selectionRange: matita.SelectionRange,
        overrideCursorOffsetLeft?: number,
    ) => { pointWithContentReference: matita.PointWithContentReference; offsetLeft: number; didFindVerticalPlacement: boolean; isWrappedLineStart?: boolean } {
        return (selectionRangeIntention, range, point, selectionRange, overrideCursorOffsetLeft) => {
            const isLineWrapToNextLine = !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine];
            const { document } = this.stateControl.stateView;
            matita.assertIsParagraphPoint(point);
            const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(point, isLineWrapToNextLine);
            for (let i = 0; i < 16; i++) {
                const verticalDelta = ((i + 1) * cursorPositionAndHeight.height) / 2;
                const position = this.#calculatePositionFromViewPosition({
                    left: overrideCursorOffsetLeft ?? cursorPositionAndHeight.position.left,
                    top:
                        pointMovement === matita.PointMovement.Previous
                            ? cursorPositionAndHeight.position.top + cursorPositionAndHeight.height / 2 - verticalDelta
                            : cursorPositionAndHeight.position.top + cursorPositionAndHeight.height / 2 + verticalDelta,
                });
                if (!position) {
                    break;
                }
                if (
                    !matita.areContentReferencesAtSameContent(range.contentReference, position.pointWithContentReference.contentReference) ||
                    !matita.arePointsEqual(point, position.pointWithContentReference.point)
                ) {
                    return {
                        pointWithContentReference: position.pointWithContentReference,
                        offsetLeft: cursorPositionAndHeight.position.left,
                        didFindVerticalPlacement: true,
                        isWrappedLineStart: position.isWrappedLineStart,
                    };
                }
            }
            return {
                pointWithContentReference: {
                    contentReference: range.contentReference,
                    point: matita.changeParagraphPointOffset(
                        point,
                        pointMovement === matita.PointMovement.Previous
                            ? 0
                            : matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(document, point)),
                    ),
                },
                offsetLeft: cursorPositionAndHeight.position.left,
                didFindVerticalPlacement: false,
            };
        };
    }
    #onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
        // TODO: can't do this with multiple selectionChange$ listeners.
        if (event.type !== PushType) {
            throwUnreachable();
        }
        const { previousSelection, data } = event.value;
        if (
            !(data && !!data[doNotScrollToSelectionAfterChangeDataKey]) &&
            !matita.areSelectionsCoveringSameContent(previousSelection, this.stateControl.stateView.selection)
        ) {
            this.#scrollSelectionIntoView();
        }
        if (this.stateControl.stateView.selection.selectionRanges.length === 0) {
            if (this.#hasFocusIncludingNotActiveWindow()) {
                this.#inputElement.blur();
            }
        } else {
            if (!this.#hasFocusIncludingNotActiveWindow()) {
                this.#inputElement.focus({
                    preventScroll: true,
                });
            }
        }
        if (data && !!data[VirtualizedDataKey.IgnoreRecursiveUpdate]) {
            return;
        }
        let newSelection = this.stateControl.stateView.selection;
        if (data && !!data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]) {
            const cursorWrappedIds = data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine] as string[];
            if (
                newSelection.selectionRanges.some(
                    (selectionRange) =>
                        !cursorWrappedIds.includes(selectionRange.id) && !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine],
                )
            ) {
                newSelection = matita.makeSelection(
                    newSelection.selectionRanges.map((selectionRange) =>
                        cursorWrappedIds.includes(selectionRange.id)
                            ? selectionRange
                            : matita.makeSelectionRange(
                                  selectionRange.ranges,
                                  selectionRange.anchorRangeId,
                                  selectionRange.focusRangeId,
                                  selectionRange.intention,
                                  omit(selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]),
                                  selectionRange.id,
                              ),
                    ),
                    newSelection.focusSelectionRangeId,
                );
            }
        } else if (newSelection.selectionRanges.some((selectionRange) => !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine])) {
            newSelection = matita.makeSelection(
                newSelection.selectionRanges.map((selectionRange) =>
                    matita.makeSelectionRange(
                        selectionRange.ranges,
                        selectionRange.anchorRangeId,
                        selectionRange.focusRangeId,
                        selectionRange.intention,
                        omit(selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]),
                        selectionRange.id,
                    ),
                ),
                newSelection.focusSelectionRangeId,
            );
        }
        if (data && !!data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]) {
            if (
                newSelection.selectionRanges.some(
                    (selectionRange) => selectionRange.data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft] !== undefined,
                )
            ) {
                newSelection = matita.makeSelection(
                    newSelection.selectionRanges.map((selectionRange) =>
                        matita.makeSelectionRange(
                            selectionRange.ranges,
                            selectionRange.anchorRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            omit(selectionRange.data, [VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]),
                            selectionRange.id,
                        ),
                    ),
                    newSelection.focusSelectionRangeId,
                );
            }
        } else if (data && !!data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]) {
            if (
                newSelection.selectionRanges.some(
                    (selectionRange) => selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] !== undefined,
                )
            ) {
                newSelection = matita.makeSelection(
                    newSelection.selectionRanges.map((selectionRange) =>
                        matita.makeSelectionRange(
                            selectionRange.ranges,
                            selectionRange.anchorRangeId,
                            selectionRange.focusRangeId,
                            selectionRange.intention,
                            omit(selectionRange.data, [VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft]),
                            selectionRange.id,
                        ),
                    ),
                    newSelection.focusSelectionRangeId,
                );
            }
        } else if (
            newSelection.selectionRanges.some(
                (selectionRange) =>
                    selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] !== undefined ||
                    selectionRange.data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft] !== undefined,
            )
        ) {
            newSelection = matita.makeSelection(
                newSelection.selectionRanges.map((selectionRange) =>
                    matita.makeSelectionRange(
                        selectionRange.ranges,
                        selectionRange.anchorRangeId,
                        selectionRange.focusRangeId,
                        selectionRange.intention,
                        omit(selectionRange.data, [
                            VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft,
                            VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft,
                        ]),
                        selectionRange.id,
                    ),
                ),
                newSelection.focusSelectionRangeId,
            );
        }
        if (newSelection !== this.stateControl.stateView.selection) {
            this.stateControl.delta.setSelection(newSelection, undefined, { [VirtualizedDataKey.IgnoreRecursiveUpdate]: true });
        }
    }
    #scrollSelectionIntoView(): void {
        const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
        if (!focusSelectionRange) {
            return;
        }
        const focusRange = focusSelectionRange.ranges.find((range) => range.id === focusSelectionRange.focusRangeId);
        assertIsNotNullish(focusRange);
        const focusPoint = matita.getFocusPointFromRange(focusRange);
        matita.assertIsParagraphPoint(focusPoint);
        const cursorPositionAndHeightFromParagraphPoint = this.#getCursorPositionAndHeightFromParagraphPoint(
            focusPoint,
            !!focusSelectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine],
        );
        this.#inputElement.style.top = `${cursorPositionAndHeightFromParagraphPoint.position.top}px`;
        this.#inputElement.style.left = `${cursorPositionAndHeightFromParagraphPoint.position.left}px`;
        scrollCursorRectIntoView(
            makeViewRectangle(
                cursorPositionAndHeightFromParagraphPoint.position.left,
                cursorPositionAndHeightFromParagraphPoint.position.top,
                0,
                cursorPositionAndHeightFromParagraphPoint.height,
            ),
            this.#getScrollContainer(),
        );
    }
    isParagraphPointAtWrappedLineWrapPoint(point: matita.ParagraphPoint): boolean {
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
        const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
        const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        if (matita.isParagraphEmpty(paragraph)) {
            return false;
        }
        for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
            const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
            if (measuredParagraphLineRange.startOffset <= point.offset && point.offset <= measuredParagraphLineRange.endOffset) {
                if (point.offset === measuredParagraphLineRange.endOffset) {
                    return !measuredParagraphLineRange.endsWithLineBreak;
                }
                return false;
            }
        }
        throwUnreachable();
    }
    #getCursorPositionAndHeightFromParagraphPoint(point: matita.ParagraphPoint, isLineWrapToNextLine: boolean): { position: ViewPosition; height: number } {
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
        const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
        const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
            const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
            if (measuredParagraphLineRange.startOffset <= point.offset && point.offset <= measuredParagraphLineRange.endOffset) {
                if (point.offset === measuredParagraphLineRange.endOffset) {
                    if (isLineWrapToNextLine && i !== paragraphMeasurement.measuredParagraphLineRanges.length - 1) {
                        const nextMeasuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i + 1];
                        assertIsNotNullish(nextMeasuredParagraphLineRange);
                        if (nextMeasuredParagraphLineRange.characterRectangles.length === 0) {
                            return {
                                position: {
                                    left: nextMeasuredParagraphLineRange.boundingRect.left,
                                    top: nextMeasuredParagraphLineRange.boundingRect.top,
                                },
                                height: nextMeasuredParagraphLineRange.boundingRect.height,
                            };
                        }
                        return {
                            position: {
                                left: nextMeasuredParagraphLineRange.characterRectangles[0].left,
                                top: nextMeasuredParagraphLineRange.boundingRect.top,
                            },
                            height: nextMeasuredParagraphLineRange.boundingRect.height,
                        };
                    }
                    if (measuredParagraphLineRange.characterRectangles.length === 0) {
                        return {
                            position: {
                                left: measuredParagraphLineRange.boundingRect.left,
                                top: measuredParagraphLineRange.boundingRect.top,
                            },
                            height: measuredParagraphLineRange.boundingRect.height,
                        };
                    }
                    return {
                        position: {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            left: paragraphMeasurement.characterRectangles[point.offset - 1]!.right,
                            top: measuredParagraphLineRange.boundingRect.top,
                        },
                        height: measuredParagraphLineRange.boundingRect.height,
                    };
                }
                return {
                    position: {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        left: paragraphMeasurement.characterRectangles[point.offset]!.left,
                        top: measuredParagraphLineRange.boundingRect.top,
                    },
                    height: measuredParagraphLineRange.boundingRect.height,
                };
            }
        }
        throwUnreachable();
    }
    #hasFocus(): boolean {
        return document.hasFocus() && this.#hasFocusIncludingNotActiveWindow();
    }
    #hasFocusIncludingNotActiveWindow(): boolean {
        return document.activeElement === this.#inputElement;
    }
    #keyDownSet = new Set<string>();
    #onDocumentKeyDown(event: KeyboardEvent): void {
        if (platforms.includes(Platform.Apple) && (this.#keyDownSet.has('Meta') || event.key === 'Meta')) {
            this.#keyDownSet.clear();
            this.#keyDownSet.add('Meta'); // MacOS track keyup events after Meta is pressed.
        } else {
            this.#keyDownSet.add(event.key);
        }
        const modifiers = ['Meta', 'Control', 'Alt', 'Shift'];
        if (modifiers.includes(event.key)) {
            return;
        }
        const hasMeta = event.metaKey;
        const hasControl = event.ctrlKey;
        const hasAlt = event.altKey;
        const hasShift = event.shiftKey;
        const activeContexts = this.#hasFocusIncludingNotActiveWindow() ? [Context.Editing] : [];
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
                const requiredNonModifierKeys = Array.from(parsedKeySet).filter((requiredKey) => !modifiers.includes(requiredKey));
                if (
                    !(
                        requiredNonModifierKeys.every(
                            (requiredNonModifierKey) => this.#keyDownSet.has(requiredNonModifierKey) || event.key === requiredNonModifierKey,
                        ) &&
                        Array.from(this.#keyDownSet).every((keyDown) => modifiers.includes(keyDown) || requiredNonModifierKeys.includes(keyDown)) &&
                        (requiredMeta ? hasMeta : !hasMeta) &&
                        (requiredControl ? hasControl : !hasControl) &&
                        (requiredAlt ? hasAlt : !hasAlt) &&
                        (requiredShift ? hasShift : !hasShift)
                    )
                ) {
                    continue;
                }
                this.runCommand({
                    commandName: command,
                    data: null,
                });
                event.preventDefault();
            }
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runCommand(commandInfo: CommandInfo<any>): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { commandName, data } = commandInfo;
        const registeredCommand = this.#commandRegister.get(commandName);
        if (!registeredCommand) {
            return;
        }
        registeredCommand.execute(this.stateControl, this.viewControl, data);
    }
    #onDocumentKeyUp(event: KeyboardEvent): void {
        this.#keyDownSet.delete(event.key);
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
            let text = '';
            if (event.dataTransfer) {
                text = event.dataTransfer.getData('text/plain');
            }
            if (!text) {
                text = event.data || '';
            }
            if (!text) {
                return;
            }
            if (event.inputType === 'insertText') {
                this.runCommand(makeInsertTextCommandInfo(text));
            } else if (event.inputType === 'insertFromPaste') {
                this.runCommand(makePasteTextCommandInfo(text));
            } else {
                this.runCommand(makeDropTextCommandInfo(text));
            }
            return;
        }
        if (event.inputType === 'insertParagraph') {
            this.runCommand({
                commandName: BuiltInCommandName.SplitParagraph,
                data: null,
            });
            return;
        }
        if (event.inputType === 'insertLineBreak') {
            this.runCommand({
                commandName: BuiltInCommandName.InsertLineBreak,
                data: null,
            });
        }
    }
    #measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): RelativeParagraphMeasureCacheValue & { boundingRect: ViewRectangle } {
        // TODO: graphemes instead of characters.
        const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
        const containerHtmlElement = paragraphRenderControl.containerHtmlElement;
        const containerHtmlElementBoundingRect = containerHtmlElement.getBoundingClientRect();
        const shiftCachedMeasurement = (
            cachedMeasurement: RelativeParagraphMeasureCacheValue,
        ): RelativeParagraphMeasureCacheValue & { boundingRect: ViewRectangle } => {
            function shiftRelativeCharacterRectangle(relativeCharacterRectangle: ViewRectangle): ViewRectangle {
                return shiftViewRectangle(relativeCharacterRectangle, containerHtmlElementBoundingRect.left, containerHtmlElementBoundingRect.top);
            }
            function* mapEntries(iterator: Iterable<[Node, TextNodeMeasurement]>): IterableIterator<[Node, TextNodeMeasurement]> {
                for (const [textNode, textNodeMeasurement] of iterator) {
                    yield [
                        textNode,
                        {
                            characterRectangles: textNodeMeasurement.characterRectangles.map(shiftRelativeCharacterRectangle),
                            startOffset: textNodeMeasurement.startOffset,
                            endOffset: textNodeMeasurement.endOffset,
                        },
                    ];
                }
            }
            return {
                characterRectangles: cachedMeasurement.characterRectangles.map(
                    (characterRectangle) => characterRectangle && shiftRelativeCharacterRectangle(characterRectangle),
                ),
                textNodeMeasurements: new Map(mapEntries(cachedMeasurement.textNodeMeasurements.entries())),
                measuredParagraphLineRanges: cachedMeasurement.measuredParagraphLineRanges.map((measuredParagraphLineRange) => {
                    return {
                        boundingRect: shiftRelativeCharacterRectangle(measuredParagraphLineRange.boundingRect),
                        characterRectangles: measuredParagraphLineRange.characterRectangles.map(shiftRelativeCharacterRectangle),
                        startOffset: measuredParagraphLineRange.startOffset,
                        endOffset: measuredParagraphLineRange.endOffset,
                        endsWithLineBreak: measuredParagraphLineRange.endsWithLineBreak,
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
        const textNodeMeasurements = new Map<Node, TextNodeMeasurement>();
        const measuredParagraphLineRanges: MeasuredParagraphLineRange[] = [];
        const paragraphCharacterRectangles: (ViewRectangle | null)[] = [];
        let isPreviousLineBreak = false;
        for (let i = 0; i < paragraphRenderControl.textNodeInfos.length; i++) {
            const textNodeInfo = paragraphRenderControl.textNodeInfos[i];
            const { textStart, textEnd, textNode, endsWithLineBreak } = textNodeInfo;
            if (textStart === textEnd) {
                const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
                matita.assertIsParagraph(paragraph);
                const isEmpty = matita.isParagraphEmpty(paragraph);
                assert(i === paragraphRenderControl.textNodeInfos.length - 1 || ((endsWithLineBreak || isEmpty) && !(endsWithLineBreak && isEmpty)));
                isPreviousLineBreak = true;
                if (endsWithLineBreak) {
                    paragraphCharacterRectangles.push(null);
                }
                const textNodeBoundingRect = getNodeBoundingRect(textNode);
                measuredParagraphLineRanges.push({
                    boundingRect: makeViewRectangle(
                        textNodeBoundingRect.left - containerHtmlElementBoundingRect.left,
                        textNodeBoundingRect.top - containerHtmlElementBoundingRect.top,
                        textNodeBoundingRect.width,
                        textNodeBoundingRect.height,
                    ),
                    characterRectangles: [],
                    startOffset: textStart,
                    endOffset: textStart,
                    endsWithLineBreak,
                });
                continue;
            }
            const characterRectangles: ViewRectangle[] = [];
            let previousNativeEndNodeAndOffset: NativeNodeAndOffset | undefined;
            for (let j = 0; j < textEnd - textStart; j++) {
                const nativeStartNodeAndOffset = previousNativeEndNodeAndOffset ?? getNativeTextNodeAndOffset(textNode, j);
                const nativeEndNodeAndOffset = getNativeTextNodeAndOffset(textNode, j + 1);
                previousNativeEndNodeAndOffset = nativeEndNodeAndOffset;
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
                if (paragraphCharacterRectangles.length === 1) {
                    measuredParagraphLineRanges.push({
                        boundingRect: characterRectangle,
                        characterRectangles: [characterRectangle],
                        startOffset: textStart + j,
                        endOffset: textStart + j + 1,
                        endsWithLineBreak: false,
                    });
                    continue;
                }
                const previousCharacterRectangle = paragraphCharacterRectangles[paragraphCharacterRectangles.length - 2];
                const minDifferenceToBeConsideredTheSame = 5;
                if (!isPreviousLineBreak) {
                    assertIsNotNullish(previousCharacterRectangle);
                    if (
                        Math.abs(previousCharacterRectangle.bottom - characterRectangle.bottom) <= minDifferenceToBeConsideredTheSame &&
                        characterRectangle.left - previousCharacterRectangle.right <= minDifferenceToBeConsideredTheSame
                    ) {
                        const measuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1];
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
                        continue;
                    }
                }
                isPreviousLineBreak = false;
                measuredParagraphLineRanges.push({
                    boundingRect: characterRectangle,
                    characterRectangles: [characterRectangle],
                    startOffset: textStart + j,
                    endOffset: textStart + j + 1,
                    endsWithLineBreak: false,
                });
            }
            measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1].endsWithLineBreak = endsWithLineBreak;
            textNodeMeasurements.set(textNode, {
                characterRectangles: characterRectangles,
                startOffset: textStart,
                endOffset: textEnd,
            });
            if (endsWithLineBreak) {
                isPreviousLineBreak = true;
                paragraphCharacterRectangles.push(null);
            }
        }
        const newCachedMeasurement: RelativeParagraphMeasureCacheValue = {
            characterRectangles: paragraphCharacterRectangles,
            textNodeMeasurements,
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
    #calculatePositionFromViewPosition(viewPosition: ViewPosition): HitPosition | null {
        // TODO: fix when columns.
        const hitElements = document.elementsFromPoint(viewPosition.left, viewPosition.top);
        const firstContentHitElement = hitElements.find(
            (hitElement) => hitElement === this.#topLevelContentViewContainerElement || this.#topLevelContentViewContainerElement.contains(hitElement),
        );
        let paragraphReferences: matita.BlockReference[];
        const nodeRenderControl = firstContentHitElement ? findClosestNodeRenderControl(this.viewControl, firstContentHitElement) : null;
        if (!nodeRenderControl) {
            // TODO.
            paragraphReferences = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference).blockReferences;
        } else if (nodeRenderControl instanceof VirtualizedParagraphRenderControl) {
            const { paragraphReference } = nodeRenderControl;
            const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            paragraphReferences = [paragraphReference];
        } else {
            // TODO.
            paragraphReferences = matita.accessContentFromContentReference(
                this.stateControl.stateView.document,
                nodeRenderControl.contentReference,
            ).blockReferences;
        }
        const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, viewPosition.top - 1, this.#compareParagraphTopToOffsetTop.bind(this)) - 1);
        const endIndex = Math.min(
            paragraphReferences.length - 1,
            indexOfNearestLessThan(paragraphReferences, viewPosition.top + 1, this.#compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
        );
        const possibleLines: {
            paragraphReference: matita.BlockReference;
            measuredParagraphLineRange: MeasuredParagraphLineRange;
            isFirstInParagraph: boolean;
        }[] = [];
        for (let i = startIndex; i <= endIndex; i++) {
            const paragraphReference = paragraphReferences[i];
            const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
            for (let j = 0; j < paragraphMeasurement.measuredParagraphLineRanges.length; j++) {
                const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[j];
                possibleLines.push({
                    paragraphReference,
                    measuredParagraphLineRange,
                    isFirstInParagraph: j === 0,
                });
            }
        }
        const epsilon = 1;
        for (let i = 0; i < possibleLines.length; i++) {
            const possibleLine = possibleLines[i];
            const { paragraphReference, measuredParagraphLineRange, isFirstInParagraph } = possibleLine;
            const { startOffset, characterRectangles, boundingRect, endsWithLineBreak } = measuredParagraphLineRange;
            const lineTop = i === 0 ? -Infinity : boundingRect.top;
            const lineBottom =
                i === possibleLines.length - 1 ? Infinity : Math.max(possibleLines[i + 1].measuredParagraphLineRange.boundingRect.top, boundingRect.bottom);
            if (!(lineTop - epsilon <= viewPosition.top && viewPosition.top <= lineBottom + epsilon)) {
                continue;
            }
            if (characterRectangles.length === 0) {
                return {
                    pointWithContentReference: {
                        contentReference: matita.makeContentReferenceFromContent(
                            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
                        ),
                        point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startOffset),
                    },
                    isWrappedLineStart: false,
                };
            }
            for (let j = 0; j < characterRectangles.length; j++) {
                const characterRectangle = characterRectangles[j];
                const previousCharacterRightWithoutInfinity = j === 0 ? 0 : Math.min(characterRectangles[j - 1].right, characterRectangle.left);
                const previousCharacterRight = j === 0 ? -Infinity : Math.min(characterRectangles[j - 1].right, characterRectangle.left);
                const characterRight = j === characterRectangles.length - 1 ? Infinity : characterRectangle.right;
                if (!(previousCharacterRight - epsilon <= viewPosition.left && viewPosition.left <= characterRight + epsilon)) {
                    continue;
                }
                const pointStartOffset = startOffset + j + (viewPosition.left > (characterRectangle.right + previousCharacterRightWithoutInfinity) / 2 ? 1 : 0);
                return {
                    pointWithContentReference: {
                        contentReference: matita.makeContentReferenceFromContent(
                            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
                        ),
                        point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, pointStartOffset),
                    },
                    isWrappedLineStart:
                        !isFirstInParagraph &&
                        !possibleLines[i - 1].measuredParagraphLineRange.endsWithLineBreak &&
                        j === 0 &&
                        startOffset !== 0 &&
                        pointStartOffset - startOffset === 0,
                };
            }
        }
        return null;
    }
    #selectionDragInfo: SelectionDragInfo | null = null;
    #calculateDragSelectionRange(
        startPointInfo: SelectionDragPointInfo,
        lastPointInfo: SelectionDragPointInfo,
        calculatedEndPosition: HitPosition | null,
    ): matita.SelectionRange | null {
        const startPointWithContentReference = transformSelectionDragPointInfoToCurrentPointWithContentReference(startPointInfo, this.stateControl);
        if (!startPointWithContentReference) {
            return null;
        }
        let endPointWithContentReference: matita.PointWithContentReference;
        let isWrappedLineStart: boolean;
        if (calculatedEndPosition) {
            endPointWithContentReference = calculatedEndPosition.pointWithContentReference;
            isWrappedLineStart = calculatedEndPosition.isWrappedLineStart;
        } else {
            const transformedLastPointWithContentReference =
                lastPointInfo === startPointInfo
                    ? startPointWithContentReference
                    : transformSelectionDragPointInfoToCurrentPointWithContentReference(lastPointInfo, this.stateControl);
            if (!transformedLastPointWithContentReference) {
                return null;
            }
            endPointWithContentReference = transformedLastPointWithContentReference;
            isWrappedLineStart = lastPointInfo.position.isWrappedLineStart;
        }
        const ranges = matita.makeRangesConnectingPointsAtContentReferences(
            this.stateControl.stateView.document,
            startPointWithContentReference.contentReference,
            startPointWithContentReference.point,
            endPointWithContentReference.contentReference,
            endPointWithContentReference.point,
            matita.generateId(),
        );
        return matita.makeSelectionRange(
            ranges,
            ranges[0].id,
            ranges[ranges.length - 1].id,
            matita.SelectionRangeIntention.Text,
            isWrappedLineStart ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : {},
            matita.generateId(),
        );
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
        const position = this.#calculatePositionFromViewPosition(cursorViewPosition);
        if (position === null) {
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
            position,
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
        const position = this.#calculatePositionFromViewPosition(cursorViewPosition);
        if (!position) {
            return;
        }
        const lastPointInfo: SelectionDragPointInfo = {
            position,
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
        const position = this.#calculatePositionFromViewPosition(cursorViewPosition);
        this.stateControl.queueUpdate(() => {
            const selectionRange = this.#calculateDragSelectionRange(startPointInfo, lastPointInfo, position);
            if (!selectionRange) {
                return;
            }
            const newSelection = matita.makeSelection([selectionRange], selectionRange.id);
            this.stateControl.delta.setSelection(
                newSelection,
                undefined,
                selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]
                    ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: [selectionRange.id] }
                    : undefined,
            );
        });
        this.#replaceDragPreviewSelectionRange();
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
    #replaceViewSelectionRanges(): void {
        this.#viewCursorAndRangeInfos$(
            Push({
                getViewCursorAndRangeInfosForSelectionRanges: memo(() => {
                    return this.stateControl.stateView.selection.selectionRanges.map((selectionRange) => {
                        return this.#makeViewCursorAndRangeInfosForSelectionRange(
                            selectionRange,
                            false,
                            selectionRange.id === this.stateControl.stateView.selection.focusSelectionRangeId,
                        );
                    });
                }),
            }),
        );
    }
    #replaceDragPreviewSelectionRange(): void {
        const previewSelectionRange = this.#selectionDragInfo?.previewSelectionRange;
        const snapshotStateView = this.stateControl.snapshotStateThroughStateView();
        this.#previewViewCursorAndRangeInfos$(
            Push({
                getViewCursorAndRangeInfosForSelectionRanges: memo(() => {
                    if (!previewSelectionRange) {
                        return [];
                    }
                    const dummySelection = matita.makeSelection([previewSelectionRange], null);
                    const transformedSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                        { selection: dummySelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix },
                        snapshotStateView,
                        this.stateControl.stateView,
                    );
                    return transformedSelection.selectionRanges.map((selectionRange) => {
                        return this.#makeViewCursorAndRangeInfosForSelectionRange(selectionRange, true, true);
                    });
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
                    !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine],
                ),
            ),
            isPreview,
            selectionRangeId: selectionRange.id,
            hasFocus: this.#hasFocus(),
        };
    }
    #makeViewCursorAndRangeInfosForRange(
        range: matita.Range,
        isAnchor: boolean,
        isFocus: boolean,
        isFocusSelectionRange: boolean,
        isLineWrapFocusCursorWrapToNextLine: boolean,
    ): ViewCursorAndRangeInfosForRange {
        const { contentReference } = range;
        const direction = matita.getRangeDirection(this.stateControl.stateView.document, range);
        assert(
            direction === matita.RangeDirection.Backwards || direction === matita.RangeDirection.Forwards || direction === matita.RangeDirection.NeutralText,
        );
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
        const { visibleTop } = this.#getVisibleTopAndBottom();
        const { visibleLeft } = this.#getVisibleLeftAndRight();
        const relativeOffsetTop = scrollContainer.scrollTop + visibleTop;
        const relativeOffsetLeft = scrollContainer.scrollLeft + visibleLeft;
        let previousLineRect: ViewRectangle | undefined;
        for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
            if (direction === matita.RangeDirection.NeutralText) {
                break;
            }
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
            const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
            for (let j = 0; j < paragraphMeasurement.measuredParagraphLineRanges.length; j++) {
                const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[j];
                const includedLineStartOffset = Math.max(measuredParagraphLineRange.startOffset, includedParagraphStartOffset);
                const includedLineEndOffset = Math.min(measuredParagraphLineRange.endOffset, includedParagraphEndOffset);
                if (includedLineStartOffset > measuredParagraphLineRange.endOffset || includedLineEndOffset < measuredParagraphLineRange.startOffset) {
                    continue;
                }
                const hasVisibleLineBreakPaddingIfEndOfLine =
                    includedLineEndOffset === measuredParagraphLineRange.endOffset &&
                    includedLineEndOffset === includedParagraphEndOffset &&
                    i !== lastParagraphIndex;
                if (includedLineStartOffset === measuredParagraphLineRange.endOffset) {
                    if (
                        hasVisibleLineBreakPaddingIfEndOfLine ||
                        (measuredParagraphLineRange.endsWithLineBreak && measuredParagraphLineRange.characterRectangles.length === 0)
                    ) {
                        let lineRect: ViewRectangle;
                        if (measuredParagraphLineRange.characterRectangles.length === 0) {
                            lineRect = makeViewRectangle(
                                measuredParagraphLineRange.boundingRect.left + relativeOffsetLeft,
                                measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
                                defaultVisibleLineBreakPadding,
                                measuredParagraphLineRange.boundingRect.height,
                            );
                        } else {
                            const lastCharacterBoundingRect =
                                measuredParagraphLineRange.characterRectangles[measuredParagraphLineRange.characterRectangles.length - 1];
                            lineRect = makeViewRectangle(
                                lastCharacterBoundingRect.right,
                                lastCharacterBoundingRect.top,
                                defaultVisibleLineBreakPadding,
                                lastCharacterBoundingRect.height,
                            );
                        }
                        const nonOverlappingLineRects = previousLineRect ? subtractViewRectangles(lineRect, previousLineRect) : [lineRect];
                        nonOverlappingLineRects.forEach((nonOverlappingLineRect, splitRectangleIndex) => {
                            viewRangeInfos.push({
                                rectangle: nonOverlappingLineRect,
                                paragraphLineIndex: j,
                                startOffset: 0,
                                endOffset: 0,
                                paragraphReference,
                                splitRectangleIndex,
                            });
                        });
                        previousLineRect = lineRect;
                    }
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
                if (hasVisibleLineBreakPaddingIfEndOfLine) {
                    const visibleLineBreakPadding = measuredParagraphLineRange.boundingRect.width / measuredParagraphLineRange.characterRectangles.length;
                    lineRectWidth += visibleLineBreakPadding === 0 ? defaultVisibleLineBreakPadding : visibleLineBreakPadding;
                } else if (includedLineStartOffset === includedLineEndOffset) {
                    continue;
                }
                const lineRect = makeViewRectangle(lineRectLeft, lineRectTop, lineRectWidth, lineRectHeight);
                const nonOverlappingLineRects = previousLineRect ? subtractViewRectangles(lineRect, previousLineRect) : [lineRect];
                nonOverlappingLineRects.forEach((nonOverlappingLineRect, splitRectangleIndex) => {
                    viewRangeInfos.push({
                        rectangle: nonOverlappingLineRect,
                        paragraphLineIndex: j,
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
            const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(focusPoint, isLineWrapFocusCursorWrapToNextLine);
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
// eslint-disable-next-line import/order, import/no-unresolved
import initialText from './matita/index.ts?raw';
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
