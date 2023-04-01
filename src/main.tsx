import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { isSafari } from './common/browserDetection';
import { makePromiseResolvingToNativeIntlSegmenterOrPolyfill } from './common/IntlSegmenter';
import { LruCache } from './common/LruCache';
import { assert, assertIsNotNullish, assertUnreachable, throwNotImplemented, throwUnreachable } from './common/util';
import * as matita from './matita';
import {
  SingleParagraphPlainTextSearchControl,
  SingleParagraphPlainTextSearchControlConfig,
  TrackAllControl,
} from './matita/SingleParagraphPlainTextSearchControl';
import { Disposable, DisposableClass, disposed } from './ruscel/disposable';
import { CurrentAndPreviousValueDistributor, CurrentValueDistributor, CurrentValueSource, Distributor } from './ruscel/distributor';
import { isNone, isSome, Maybe, None, Some } from './ruscel/maybe';
import { ScheduleInterval, scheduleMicrotask } from './ruscel/schedule';
import {
  combine,
  debounce,
  empty$,
  End,
  EndType,
  Event,
  filter,
  filterMap,
  flat,
  flatMap,
  fromArray,
  fromReactiveValue,
  fromScheduleFunction,
  interval,
  isSource,
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
  switchEach,
  takeUntil,
  takeWhile,
  throttle,
  ThrowType,
  timer,
  windowScheduledBySource,
} from './ruscel/source';
import { pipe, queueMicrotaskDisposable, requestAnimationFrameDisposable, setTimeoutDisposable } from './ruscel/util';
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
  containerHtmlElement$: CurrentAndPreviousValueDistributor<HTMLElement>;
  textNodeInfos: TextElementInfo[] = [];
  constructor(paragraphReference: matita.BlockReference, viewControl: VirtualizedViewControl) {
    super(() => this.#dispose());
    this.paragraphReference = paragraphReference;
    this.#viewControl = viewControl;
    this.containerHtmlElement$ = CurrentAndPreviousValueDistributor(this.#makeContainerHtmlElement());
    this.add(this.containerHtmlElement$);
    this.#render();
  }
  #makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('p');
    containerHtmlElement.dir = 'auto';
    containerHtmlElement.style.contain = 'content';
    containerHtmlElement.style.whiteSpace = 'break-spaces';
    containerHtmlElement.style.overflowWrap = 'anywhere';
    containerHtmlElement.style.fontFamily = "'IBM Plex Sans', sans-serif";
    containerHtmlElement.style.fontSize = '16px';
    containerHtmlElement.style.lineHeight = '21px';
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
  containerHtmlElement$: CurrentAndPreviousValueDistributor<HTMLElement>;
  #blockInfos: VirtualizedContentRenderControlParagraphBlockInfo[];
  constructor(contentReference: matita.ContentReference, viewControl: VirtualizedViewControl) {
    super(() => this.#dispose());
    this.contentReference = contentReference;
    this.#viewControl = viewControl;
    this.containerHtmlElement$ = CurrentAndPreviousValueDistributor(this.#makeContainerHtmlElement());
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
    const paragraphRenderControl = new VirtualizedParagraphRenderControl(paragraphReference, this.#viewControl);
    this.add(paragraphRenderControl);
    pipe(
      paragraphRenderControl.containerHtmlElement$,
      skip(1)<HTMLElement>,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const blockInfo = this.#blockInfos.find((blockInfo) => {
          return matita.areBlockReferencesAtSameBlock(blockInfo.paragraphRenderControl.paragraphReference, paragraphReference);
        });
        assertIsNotNullish(blockInfo);
        htmlElementToNodeRenderControlMap.set(paragraphRenderControl.containerHtmlElement, paragraphRenderControl);
        blockInfo.containerHtmlElement.replaceWith(paragraphRenderControl.containerHtmlElement);
      }, this),
    );
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
function findScrollContainer(node: Node, isScrollable: (element: Element) => boolean): HTMLElement {
  let parent = node.parentNode as HTMLElement | null;
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
    return document.documentElement;
  }
  return scrollElement;
}
function addEventListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  element.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      element.removeEventListener(type, listener, options);
    }),
  );
}
function addDocumentEventListener<K extends keyof DocumentEventMap>(
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addDocumentEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addDocumentEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  document.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      document.removeEventListener(type, listener, options);
    }),
  );
}
function addWindowEventListener<K extends keyof WindowEventMap>(
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: Window, ev: WindowEventMap[K]) => any,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addWindowEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void;
function addWindowEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  disposable: Disposable,
  options?: boolean | AddEventListenerOptions,
): void {
  if (!disposable.active) {
    return;
  }
  window.addEventListener(type, listener, options);
  disposable.add(
    Disposable(() => {
      window.removeEventListener(type, listener, options);
    }),
  );
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
  isPastPreviousCharacterHalfPoint: boolean;
  isWrappedLineStart: boolean;
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
}
interface ViewCursorAndRangeInfosForParagraphInRange {
  paragraphReference: matita.BlockReference;
  viewCursorInfos: ViewCursorInfo[];
  viewRangeInfos: ViewRangeInfo[];
}
interface ViewCursorAndRangeInfosForRange {
  viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[];
}
interface ViewCursorAndRangeInfosForSelectionRange {
  viewCursorAndRangeInfosForRanges: ViewCursorAndRangeInfosForRange[];
  selectionRangeId: string;
  hasFocus: boolean;
  isInComposition: boolean;
  isDraggingSelection: boolean;
}
interface ViewCursorAndRangeInfos {
  viewCursorAndRangeInfosForSelectionRanges: ViewCursorAndRangeInfosForSelectionRange[];
}
function use$<T>(source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>), initialMaybe?: Some<T> | (() => Some<T>), updateSync?: boolean): Some<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean,
): Maybe<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean,
): Maybe<T> {
  const [value, setValue] = useState<Maybe<T>>(initialMaybe ?? None);
  const isFirstUpdateRef = useRef(true);
  useEffect(() => {
    const isFirstUpdate = isFirstUpdateRef.current;
    isFirstUpdateRef.current = false;
    let syncFirstMaybe: Maybe<T> | undefined;
    let isSyncFirstEvent = true;
    const sink = Sink<T>((event) => {
      if (event.type === ThrowType) {
        throw event.error;
      }
      const maybe = event.type === EndType ? None : Some(event.value);
      if (isSyncFirstEvent) {
        syncFirstMaybe = maybe;
        return;
      }
      if (updateSync) {
        flushSync(() => {
          setValue(maybe);
        });
      } else {
        setValue(maybe);
      }
    });
    if (isSource(source)) {
      source(sink);
    } else {
      source(sink, isFirstUpdate)(sink);
    }
    isSyncFirstEvent = false;
    if (syncFirstMaybe) {
      setValue(syncFirstMaybe);
    } else if (!isFirstUpdate) {
      setValue(typeof initialMaybe === 'function' ? initialMaybe() : initialMaybe ?? None);
    }
    return () => {
      sink.dispose();
    };
  }, [source]);
  return value;
}
interface SelectionViewMessage {
  viewCursorAndRangeInfos: ViewCursorAndRangeInfos;
}
interface SelectionViewProps {
  selectionView$: Source<SelectionViewMessage>;
}
class UniqueKeyControl {
  #keyCount = new Map<string, number>();
  makeUniqueKey(key: string): string {
    const count = this.#keyCount.get(key);
    if (count !== undefined) {
      this.#keyCount.set(key, count + 1);
      return JSON.stringify([key, count]);
    }
    this.#keyCount.set(key, 1);
    return JSON.stringify([key, 0]);
  }
}
// TODO: Simplify information passed in.
function SelectionView(props: SelectionViewProps): JSX.Element | null {
  const { selectionView$ } = props;
  const selectionMaybe = use$(
    useMemo(
      () =>
        pipe(
          selectionView$,
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [],
    ),
    undefined,
    true,
  );
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
  if (isNone(selectionMaybe)) {
    return null;
  }
  const { viewCursorAndRangeInfos } = selectionMaybe.value;
  const { viewCursorAndRangeInfosForSelectionRanges } = viewCursorAndRangeInfos;
  if (viewCursorAndRangeInfosForSelectionRanges.length === 0) {
    return null;
  }
  const uniqueKeyControl = new UniqueKeyControl();
  return (
    <>
      {viewCursorAndRangeInfosForSelectionRanges.flatMap((viewCursorAndRangeInfoForSelectionRange) => {
        const { viewCursorAndRangeInfosForRanges, hasFocus, isInComposition, isDraggingSelection, selectionRangeId } = viewCursorAndRangeInfoForSelectionRange;
        return viewCursorAndRangeInfosForRanges.flatMap((viewCursorAndRangeInfosForRange) => {
          return viewCursorAndRangeInfosForRange.viewParagraphInfos.flatMap((viewCursorAndRangeInfosForParagraphInRange) => {
            const { viewCursorInfos, viewRangeInfos } = viewCursorAndRangeInfosForParagraphInRange;
            const viewRangeElements = viewRangeInfos.flatMap((viewRangeInfo) => {
              const { paragraphLineIndex, paragraphReference, rectangle } = viewRangeInfo;
              const spans: JSX.Element[] = [];
              const useCompositionStyle = isInComposition;
              if (useCompositionStyle) {
                spans.push(
                  <span
                    key={uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, true]))}
                    style={{
                      position: 'absolute',
                      top: rectangle.bottom - 2,
                      left: rectangle.left,
                      width: rectangle.width,
                      height: 2,
                      backgroundColor: '#222',
                    }}
                  />,
                );
              }
              spans.push(
                <span
                  key={uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, false]))}
                  style={{
                    position: 'absolute',
                    top: rectangle.top,
                    left: rectangle.left,
                    width: rectangle.width,
                    height: rectangle.height,
                    backgroundColor: useCompositionStyle ? '#accef733' : hasFocus ? '#accef7bb' : '#d3d3d36c',
                  }}
                />,
              );
              return spans;
            });
            const viewCursorElements = viewCursorInfos.map((viewCursorInfo) => {
              const { isAnchor, isFocus, offset, paragraphReference, rangeDirection } = viewCursorInfo;
              return (
                <BlinkingCursor
                  key={uniqueKeyControl.makeUniqueKey(
                    JSON.stringify([paragraphReference.blockId, isAnchor, isFocus, offset, rangeDirection, selectionRangeId]),
                  )}
                  viewCursorInfo={viewCursorInfo}
                  synchronizedCursorVisibility$={synchronizedCursorVisibility$}
                  cursorBlinkSpeed={cursorBlinkSpeed}
                  hasFocus={hasFocus}
                  isDraggingSelection={isDraggingSelection}
                />
              );
            });
            return viewRangeElements.concat(viewCursorElements);
          });
        });
      })}
    </>
  );
}
interface BlinkingCursorProps {
  viewCursorInfo: ViewCursorInfo;
  synchronizedCursorVisibility$: Source<boolean>;
  cursorBlinkSpeed: number;
  hasFocus: boolean;
  isDraggingSelection: boolean;
}
function BlinkingCursor(props: BlinkingCursorProps): JSX.Element | null {
  const { viewCursorInfo, synchronizedCursorVisibility$, cursorBlinkSpeed, hasFocus, isDraggingSelection } = props;
  if (!viewCursorInfo.isFocus) {
    return null;
  }
  const isVisibleMaybe = use$(
    useMemo(
      () =>
        !hasFocus || isDraggingSelection
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
      [cursorBlinkSpeed, synchronizedCursorVisibility$, hasFocus, isDraggingSelection],
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
        backgroundColor: hasFocus ? '#222' : '#888',
        visibility: isNone(isVisibleMaybe) || (isSome(isVisibleMaybe) && isVisibleMaybe.value) ? 'visible' : 'hidden',
      }}
    />
  );
}
interface SelectionOverlayMatchInfo {
  viewRangeInfos: ViewRangeInfo[];
  hasFocus: boolean;
}
interface SearchOverlayMessage {
  matchInfos: SelectionOverlayMatchInfo[];
}
interface SearchOverlayProps {
  searchOverlay$: Source<SearchOverlayMessage>;
}
function SearchOverlay(props: SearchOverlayProps): JSX.Element | null {
  const { searchOverlay$ } = props;
  const searchOverlayMaybe = use$(
    useMemo(
      () =>
        pipe(
          searchOverlay$,
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [],
    ),
    undefined,
    true,
  );
  if (isNone(searchOverlayMaybe)) {
    return null;
  }
  const { matchInfos } = searchOverlayMaybe.value;
  const uniqueKeyControl = new UniqueKeyControl();
  return (
    <>
      {matchInfos.flatMap((matchInfo) => {
        const { viewRangeInfos, hasFocus } = matchInfo;
        return viewRangeInfos.flatMap((viewRangeInfo) => {
          const { rectangle, paragraphReference, paragraphLineIndex } = viewRangeInfo;
          return (
            <span
              key={uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex]))}
              style={{
                position: 'absolute',
                top: rectangle.top,
                left: rectangle.left,
                width: rectangle.width,
                height: rectangle.height,
                backgroundColor: hasFocus ? '#87d392bb' : '#cdecd2bb',
              }}
            />
          );
        });
      })}
    </>
  );
}
enum SearchBoxConfigType {
  SingleParagraphPlainText = 'SingleParagraphPlainText',
}
interface SearchBoxControlConfig {
  type: SearchBoxConfigType.SingleParagraphPlainText;
  config: SingleParagraphPlainTextSearchControlConfig;
}
interface SearchBoxProps {
  isVisible$: CurrentValueSource<boolean>;
  containerStaticViewRectangle$: CurrentValueSource<ViewRectangle>;
  query$: Sink<string>;
  config$: Sink<SearchBoxControlConfig>;
  matchNumberMaybe$: CurrentValueSource<Maybe<number>>;
  totalMatchesMaybe$: CurrentValueSource<Maybe<number>>;
  initialConfig: SearchBoxControlConfig;
  inputRef: React.Ref<HTMLInputElement>;
}
function SearchBox(props: SearchBoxProps): JSX.Element | null {
  const { isVisible$, containerStaticViewRectangle$, query$, config$, matchNumberMaybe$, totalMatchesMaybe$, initialConfig, inputRef } = props;
  const margin = 8;
  type Position = {
    width: number;
    dropDownPercent: number;
  };
  const calculateWidthFromContainerStaticViewRectangle = (rectangle: ViewRectangle): number => {
    return Math.min(rectangle.width - margin * 2, 400);
  };
  const { value: position } = use$<Position>(
    useCallback((sink: Sink<Position>) => {
      const width$ = pipe(containerStaticViewRectangle$, map(calculateWidthFromContainerStaticViewRectangle));
      const dropDownPercent$ = CurrentValueDistributor<number>(isVisible$.currentValue ? 1 : 0);
      pipe(
        isVisible$,
        subscribe((event) => {
          if (event.type !== PushType) {
            throwUnreachable();
          }
          const isVisible = event.value;
          if (isVisible ? dropDownPercent$.currentValue === 1 : dropDownPercent$.currentValue === 0) {
            return;
          }
          const dt = 1000 / 30;
          const ms = 150;
          const step = dt / ms;
          pipe(
            fromScheduleFunction(ScheduleInterval(dt)),
            takeUntil(pipe(isVisible$, skip(1))),
            map(() => (isVisible ? Math.min(dropDownPercent$.currentValue + step, 1) : Math.max(dropDownPercent$.currentValue - step, 0))),
            takeWhile((dropDownPercent) => (isVisible ? dropDownPercent !== 1 : dropDownPercent !== 0), true),
            subscribe((event) => {
              if (event.type !== EndType) {
                dropDownPercent$(event);
              }
            }, sink),
          );
        }, sink),
      );
      return pipe(
        combine([width$, dropDownPercent$]),
        map(([width, dropDownPercent]) => ({
          width,
          dropDownPercent,
        })),
        memoConsecutive((a, b) => a.width === b.width && a.dropDownPercent === b.dropDownPercent),
        skip(1),
      );
    }, []),
    useMemo(
      () =>
        Some<Position>({
          width: calculateWidthFromContainerStaticViewRectangle(containerStaticViewRectangle$.currentValue),
          dropDownPercent: isVisible$.currentValue ? 1 : 0,
        }),
      [],
    ),
  );
  const matchNumberMaybe = use$(matchNumberMaybe$, Some(matchNumberMaybe$.currentValue)).value;
  const totalMatchesMaybe = use$(totalMatchesMaybe$, Some(totalMatchesMaybe$.currentValue)).value;
  return (
    <div
      style={{
        position: 'fixed',
        display: 'flex',
        top: 0,
        transform: `translateY(${margin * (position.dropDownPercent === 0 ? -100000 : 1.5 * Math.sqrt(position.dropDownPercent) - 0.5)}px)`,
        filter: `opacity(${isVisible$.currentValue ? 1 - (1 - position.dropDownPercent) ** 2 : position.dropDownPercent ** 2})`,
        right: margin,
        width: position.width,
        backgroundColor: '#000',
        padding: '0.5em',
        boxShadow: 'rgba(149, 157, 165, 0.1) 0px 8px 24px',
        contain: 'content',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <input
        type="search"
        className="unset-selection"
        style={{
          padding: '2px 0.25em',
          outline: '0',
          backgroundColor: '#000',
          color: '#fff',
          flexGrow: 1,
          marginRight: '0.25em',
        }}
        onChange={(event) => {
          query$(Push(event.target.value));
        }}
        ref={inputRef}
      />
      <span style={{ marginRight: '0.25em', color: '#aaa' }}>
        {isSome(matchNumberMaybe) ? matchNumberMaybe.value : '?'} of {isSome(totalMatchesMaybe) ? totalMatchesMaybe.value : '?'}
      </span>
    </div>
  );
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
function areViewRectanglesEqual(viewRectangle1: ViewRectangle, viewRectangle2: ViewRectangle): boolean {
  return (
    viewRectangle1.left === viewRectangle2.left &&
    viewRectangle1.top === viewRectangle2.top &&
    viewRectangle1.width === viewRectangle2.width &&
    viewRectangle1.height === viewRectangle2.height
  );
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
interface AbsoluteParagraphMeasurement extends RelativeParagraphMeasureCacheValue {
  boundingRect: ViewRectangle;
}
enum StandardCommand {
  MoveSelectionGraphemeBackwards = 'standard.moveSelectionGraphemeBackwards',
  MoveSelectionWordBackwards = 'standard.moveSelectionWordBackwards',
  MoveSelectionParagraphBackwards = 'standard.moveSelectionParagraphBackwards',
  MoveSelectionParagraphStart = 'standard.moveSelectionParagraphStart',
  MoveSelectionGraphemeForwards = 'standard.moveSelectionGraphemeForwards',
  MoveSelectionWordForwards = 'standard.moveSelectionWordForwards',
  MoveSelectionParagraphForwards = 'standard.moveSelectionParagraphForwards',
  MoveSelectionParagraphEnd = 'standard.moveSelectionParagraphEnd',
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
  ExtendSelectionParagraphStart = 'standard.extendSelectionParagraphStart',
  ExtendSelectionGraphemeForwards = 'standard.extendSelectionGraphemeForwards',
  ExtendSelectionWordForwards = 'standard.extendSelectionWordForwards',
  ExtendSelectionParagraphForwards = 'standard.extendSelectionParagraphForwards',
  ExtendSelectionParagraphEnd = 'standard.extendSelectionParagraphEnd',
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
  InsertParagraphBelow = 'standard.insertParagraphBelow',
  InsertParagraphAbove = 'standard.insertParagraphAbove',
  SelectAll = 'standard.selectAll',
  InsertText = 'standard.insertText',
  PasteText = 'standard.insertPastedText',
  DropText = 'standard.insertDroppedText',
  InsertLineBreak = 'standard.insertLineBreak',
  SplitParagraph = 'standard.splitParagraph',
  Undo = 'standard.undo',
  Redo = 'standard.redo',
  CollapseMultipleSelectionRangesToAnchorRange = 'standard.collapseMultipleSelectionRangesToAnchorRange',
  CollapseMultipleSelectionRangesToFocusRange = 'standard.collapseMultipleSelectionRangesToFocusRange',
  OpenSearch = 'standard.openSearch',
  CloseSearch = 'standard.closeSearch',
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
  Searching = 'Searching',
  DraggingSelection = 'DraggingSelection',
}
type Selector<T extends string> = T | { not: Selector<T> } | { all: Selector<T>[] } | { any: Selector<T>[] };
function satisfiesSelector<T extends string>(values: T[], selector: Selector<T>): boolean {
  if (typeof selector === 'string') {
    return values.includes(selector);
  }
  if ('not' in selector) {
    return !satisfiesSelector(values, selector.not);
  }
  if ('all' in selector) {
    return selector.all.every((selector) => satisfiesSelector(values, selector));
  }
  return selector.any.some((selector) => satisfiesSelector(values, selector));
}
type PlatformSelector = Selector<Platform>;
type ContextSelector = Selector<Context>;
type KeyCommands = {
  key: string | null;
  command: string | null;
  platform?: PlatformSelector | null;
  context?: ContextSelector | null;
  cancelKeyEvent?: boolean;
}[];
const defaultTextEditingKeyCommands: KeyCommands = [
  { key: 'ArrowLeft,Control+KeyB', command: StandardCommand.MoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowLeft', command: StandardCommand.MoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowUp', command: StandardCommand.MoveSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+KeyA', command: StandardCommand.MoveSelectionParagraphStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'ArrowRight,Control+KeyF', command: StandardCommand.MoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowRight', command: StandardCommand.MoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Alt+ArrowDown',
    command: StandardCommand.MoveSelectionParagraphForwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Control+KeyE', command: StandardCommand.MoveSelectionParagraphEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+ArrowLeft', command: StandardCommand.MoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+ArrowRight', command: StandardCommand.MoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  {
    key: 'ArrowDown,Control+KeyN',
    command: StandardCommand.MoveSelectionSoftLineDown,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'ArrowUp,Control+KeyP',
    command: StandardCommand.MoveSelectionSoftLineUp,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Meta+ArrowUp', command: StandardCommand.MoveSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+ArrowDown', command: StandardCommand.MoveSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  {
    key: 'Shift+ArrowLeft,Control+Shift+KeyB',
    command: StandardCommand.ExtendSelectionGraphemeBackwards,
    platform: Platform.Apple,
    context: Context.Editing,
  },
  { key: 'Alt+Shift+ArrowLeft', command: StandardCommand.ExtendSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Alt+Shift+ArrowUp',
    command: StandardCommand.ExtendSelectionParagraphBackwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Control+Shift+KeyA',
    command: StandardCommand.ExtendSelectionParagraphStart,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Shift+ArrowRight,Control+Shift+KeyF',
    command: StandardCommand.ExtendSelectionGraphemeForwards,
    platform: Platform.Apple,
    context: Context.Editing,
  },
  { key: 'Alt+Shift+ArrowRight', command: StandardCommand.ExtendSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Alt+Shift+ArrowDown',
    command: StandardCommand.ExtendSelectionParagraphForwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Control+Shift+KeyE', command: StandardCommand.ExtendSelectionParagraphEnd, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Meta+Shift+ArrowLeft',
    command: StandardCommand.ExtendSelectionSoftLineStart,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift+ArrowRight',
    command: StandardCommand.ExtendSelectionSoftLineEnd,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Shift+ArrowDown,Control+Shift+KeyN',
    command: StandardCommand.ExtendSelectionSoftLineDown,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Shift+ArrowUp,Control+Shift+KeyP',
    command: StandardCommand.ExtendSelectionSoftLineUp,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift+ArrowUp',
    command: StandardCommand.ExtendSelectionStartOfDocument,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift+ArrowDown',
    command: StandardCommand.ExtendSelectionEndOfDocument,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Backspace', command: StandardCommand.RemoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Alt+Backspace', command: StandardCommand.RemoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Delete', command: StandardCommand.RemoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Alt+Delete', command: StandardCommand.RemoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Backspace', command: StandardCommand.RemoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Delete', command: StandardCommand.RemoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+KeyT', command: StandardCommand.TransposeGraphemes, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Enter', command: StandardCommand.InsertParagraphAbove, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+Enter', command: StandardCommand.InsertParagraphBelow, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+KeyA', command: StandardCommand.SelectAll, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Shift+Enter,Control+KeyO', command: StandardCommand.InsertLineBreak, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Enter', command: StandardCommand.SplitParagraph, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+KeyZ,Meta+Shift+KeyY', command: StandardCommand.Undo, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+KeyZ,Meta+KeyY', command: StandardCommand.Redo, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  {
    key: 'Escape',
    command: StandardCommand.CollapseMultipleSelectionRangesToAnchorRange,
    platform: Platform.Apple,
    context: { all: [Context.Editing, { not: Context.DraggingSelection }] },
    cancelKeyEvent: true,
  },
  {
    key: 'Shift+Escape',
    command: StandardCommand.CollapseMultipleSelectionRangesToFocusRange,
    platform: Platform.Apple,
    context: { all: [Context.Editing, { not: Context.DraggingSelection }] },
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+KeyF',
    command: StandardCommand.OpenSearch,
    platform: Platform.Apple,
    context: { any: [Context.Editing, Context.Searching] },
    cancelKeyEvent: true,
  },
  {
    key: 'Escape',
    command: StandardCommand.CloseSearch,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
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
  const { anchorPointWithContentReference, focusPointWithContentReference } = matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
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
  const { anchorPointWithContentReference, focusPointWithContentReference } = matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
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
  const { anchorPointWithContentReference, focusPointWithContentReference } = matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
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
const genericCommandRegisterObject: Record<string, GenericRegisteredCommand> = {
  [StandardCommand.MoveSelectionGraphemeBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) =>
            shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ? collapseSelectionRangeBackwards(document, selectionRange) : false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionWordBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionParagraphBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionParagraphStart]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.PreviousBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionGraphemeForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) =>
            shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ? collapseSelectionRangeForwards(document, selectionRange) : false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionWordForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionParagraphForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionParagraphEnd]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.NextBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionStartOfDocument]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionEndOfDocument]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionGraphemeBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionWordBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphStart]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.PreviousBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionGraphemeForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionWordForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphEnd]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.NextBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionStartOfDocument]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionEndOfDocument]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.RemoveSelectionGraphemeBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextBackwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionWordBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextBackwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionParagraphBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.RemoveSelectionGraphemeForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextForwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionWordForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextForwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionParagraphForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.noopPointTransformFn,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.TransposeGraphemes]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeTransposeAtSelectionUpdateFn(stateControl));
    },
  },
  [StandardCommand.InsertParagraphAbove]: {
    execute(stateControl): void {
      stateControl.queueUpdate(() => {
        const blockIdCount = new Map<string, number>();
        const countBlockId = (blockId: string): number => {
          const count = blockIdCount.get(blockId) ?? 0;
          blockIdCount.set(blockId, count + 1);
          return count;
        };
        const affectedSelectionRangeInfos: [
          contentReference: matita.ContentReference,
          blockId: string,
          selectionRange: matita.SelectionRange,
          index: number,
        ][] = [];
        for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = stateControl.stateView.selection.selectionRanges[i];
          const focusRange = selectionRange.ranges.find((range) => range.id === selectionRange.focusRangeId);
          assertIsNotNullish(focusRange);
          const focusPoint = matita.getFocusPointFromRange(focusRange);
          if (matita.isBlockPoint(focusPoint)) {
            const blockId = matita.getBlockIdFromBlockPoint(focusPoint);
            const index = countBlockId(blockId);
            affectedSelectionRangeInfos.push([focusRange.contentReference, blockId, selectionRange, index]);
          } else if (matita.isParagraphPoint(focusPoint)) {
            const blockId = matita.getBlockIdFromParagraphPoint(focusPoint);
            const index = countBlockId(blockId);
            affectedSelectionRangeInfos.push([focusRange.contentReference, blockId, selectionRange, index]);
          }
        }
        const blockIdToInsertedParagraphIds = new Map<string, string[]>();
        const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
        blockIdCount.forEach((count, blockId) => {
          const insertedParagraphIds: string[] = [];
          const contentFragmentBlocks: matita.ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig>[] = [];
          for (let i = 0; i < count; i++) {
            const insertedParagraphId = matita.generateId();
            insertedParagraphIds.push(insertedParagraphId);
            // TODO.
            contentFragmentBlocks.push(matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], insertedParagraphId)));
          }
          blockIdToInsertedParagraphIds.set(blockId, insertedParagraphIds);
          const mutation = matita.makeInsertBlocksBeforeMutation(
            matita.makeBlockPointFromBlockReference(matita.makeBlockReferenceFromBlockId(blockId)),
            matita.makeContentFragment(contentFragmentBlocks),
          );
          mutations.push(mutation);
        });
        const batchMutation = matita.makeBatchMutation(mutations);
        stateControl.delta.applyMutation(batchMutation, undefined, (selectionRange) => {
          for (let i = 0; i < affectedSelectionRangeInfos.length; i++) {
            const affectedSelectionRangeInfo = affectedSelectionRangeInfos[i];
            const [contentReference, blockId, affectedSelectionRange, index] = affectedSelectionRangeInfo;
            if (matita.areSelectionRangesCoveringSameContent(selectionRange, affectedSelectionRange)) {
              const insertedParagraphIds = blockIdToInsertedParagraphIds.get(blockId);
              assertIsNotNullish(insertedParagraphIds);
              const insertedParagraphId = insertedParagraphIds[index];
              assertIsNotNullish(insertedParagraphId);
              const paragraphPoint = matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(
                matita.makeBlockReferenceFromBlockId(insertedParagraphId),
                0,
              );
              const range = matita.makeRange(contentReference, paragraphPoint, paragraphPoint, matita.generateId());
              return matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, selectionRange.id);
            }
          }
          return undefined;
        });
      });
    },
  },
  [StandardCommand.InsertParagraphBelow]: {
    execute(stateControl): void {
      stateControl.queueUpdate(() => {
        const blockIdCount = new Map<string, number>();
        const countBlockId = (blockId: string): number => {
          const count = blockIdCount.get(blockId) ?? 0;
          blockIdCount.set(blockId, count + 1);
          return count;
        };
        const affectedSelectionRangeInfos: [
          contentReference: matita.ContentReference,
          blockId: string,
          selectionRange: matita.SelectionRange,
          index: number,
        ][] = [];
        for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = stateControl.stateView.selection.selectionRanges[i];
          const focusRange = selectionRange.ranges.find((range) => range.id === selectionRange.focusRangeId);
          assertIsNotNullish(focusRange);
          const focusPoint = matita.getFocusPointFromRange(focusRange);
          if (matita.isBlockPoint(focusPoint)) {
            const blockId = matita.getBlockIdFromBlockPoint(focusPoint);
            const index = countBlockId(blockId);
            affectedSelectionRangeInfos.push([focusRange.contentReference, blockId, selectionRange, index]);
          } else if (matita.isParagraphPoint(focusPoint)) {
            const blockId = matita.getBlockIdFromParagraphPoint(focusPoint);
            const index = countBlockId(blockId);
            affectedSelectionRangeInfos.push([focusRange.contentReference, blockId, selectionRange, index]);
          }
        }
        const blockIdToInsertedParagraphIds = new Map<string, string[]>();
        const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
        blockIdCount.forEach((count, blockId) => {
          const insertedParagraphIds: string[] = [];
          const contentFragmentBlocks: matita.ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig>[] = [];
          for (let i = 0; i < count; i++) {
            const insertedParagraphId = matita.generateId();
            insertedParagraphIds.push(insertedParagraphId);
            // TODO.
            contentFragmentBlocks.push(matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], insertedParagraphId)));
          }
          blockIdToInsertedParagraphIds.set(blockId, insertedParagraphIds);
          const mutation = matita.makeInsertBlocksAfterMutation(
            matita.makeBlockPointFromBlockReference(matita.makeBlockReferenceFromBlockId(blockId)),
            matita.makeContentFragment(contentFragmentBlocks),
          );
          mutations.push(mutation);
        });
        const batchMutation = matita.makeBatchMutation(mutations);
        stateControl.delta.applyMutation(batchMutation, undefined, (selectionRange) => {
          for (let i = 0; i < affectedSelectionRangeInfos.length; i++) {
            const affectedSelectionRangeInfo = affectedSelectionRangeInfos[i];
            const [contentReference, blockId, affectedSelectionRange, index] = affectedSelectionRangeInfo;
            if (matita.areSelectionRangesCoveringSameContent(selectionRange, affectedSelectionRange)) {
              const insertedParagraphIds = blockIdToInsertedParagraphIds.get(blockId);
              assertIsNotNullish(insertedParagraphIds);
              const insertedParagraphId = insertedParagraphIds[index];
              assertIsNotNullish(insertedParagraphId);
              const paragraphPoint = matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(
                matita.makeBlockReferenceFromBlockId(insertedParagraphId),
                0,
              );
              const range = matita.makeRange(contentReference, paragraphPoint, paragraphPoint, matita.generateId());
              return matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, selectionRange.id);
            }
          }
          return undefined;
        });
      });
    },
  },
  [StandardCommand.SelectAll]: {
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
  [StandardCommand.InsertText]: {
    execute(stateControl, _viewControl, data: InsertTextCommandData): void {
      const { insertText } = data;
      const contentFragment = matita.makeContentFragment(
        insertText.split(/\r?\n/g).map((line) => {
          const lineText = line.replaceAll('\r', '');
          return matita.makeContentFragmentParagraph(matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()));
        }),
      );
      stateControl.queueUpdate(
        () => {
          stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, contentFragment));
        },
        { [matita.RedoUndoUpdateKey.InsertText]: true },
      );
    },
  },
  [StandardCommand.PasteText]: {
    execute(stateControl, _viewControl, data: PasteTextCommandData): void {
      const { pasteText } = data;
      const contentFragment = matita.makeContentFragment(
        pasteText.split(/\r?\n/g).map((line) => {
          const lineText = line.replaceAll('\r', '');
          return matita.makeContentFragmentParagraph(matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()));
        }),
      );
      stateControl.queueUpdate(() => {
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, contentFragment));
      });
    },
  },
  [StandardCommand.DropText]: {
    execute(stateControl, _viewControl, data: DropTextCommandData): void {
      const { dropText } = data;
      const contentFragment = matita.makeContentFragment(
        dropText.split(/\r?\n/g).map((line) => {
          const lineText = line.replaceAll('\r', '');
          return matita.makeContentFragmentParagraph(matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()));
        }),
      );
      stateControl.queueUpdate(() => {
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, contentFragment));
      });
    },
  },
  [StandardCommand.InsertLineBreak]: {
    execute(stateControl): void {
      // TODO.
      const contentFragment = matita.makeContentFragment([
        matita.makeContentFragmentParagraph(matita.makeParagraph({}, [matita.makeText({}, '\n')], matita.generateId())),
      ]);
      stateControl.queueUpdate(() => {
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, contentFragment));
      });
    },
  },
  [StandardCommand.SplitParagraph]: {
    execute(stateControl): void {
      // TODO.
      const contentFragment = matita.makeContentFragment([
        matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], matita.generateId())),
        matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], matita.generateId())),
      ]);
      stateControl.queueUpdate(() => {
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, contentFragment));
      });
    },
  },
  [StandardCommand.CollapseMultipleSelectionRangesToAnchorRange]: {
    execute(stateControl): void {
      stateControl.queueUpdate(() => {
        if (stateControl.stateView.selection.selectionRanges.length <= 1) {
          return;
        }
        const anchorSelectionRange = matita.getAnchorSelectionRangeFromSelection(stateControl.stateView.selection);
        assertIsNotNullish(anchorSelectionRange);
        stateControl.delta.setSelection(matita.makeSelection([anchorSelectionRange]));
      });
    },
  },
  [StandardCommand.CollapseMultipleSelectionRangesToFocusRange]: {
    execute(stateControl): void {
      stateControl.queueUpdate(() => {
        if (stateControl.stateView.selection.selectionRanges.length <= 1) {
          return;
        }
        const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(stateControl.stateView.selection);
        assertIsNotNullish(focusSelectionRange);
        stateControl.delta.setSelection(matita.makeSelection([focusSelectionRange]));
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
    commandName: StandardCommand.InsertText,
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
    commandName: StandardCommand.PasteText,
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
    commandName: StandardCommand.DropText,
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
  MoveSelectionSoftLineUpDownCursorOffsetLeft = 'virtualized.moveSelectionSoftLineUpDownCursorOffsetLeft',
  ExtendSelectionSoftLineUpDownCursorOffsetLeft = 'virtualized.extendSelectionSoftLineUpDownCursorOffsetLeft',
  LineWrapFocusCursorWrapToNextLine = 'virtualized.lineWrapFocusCursorWrapToNextLine',
  IgnoreRecursiveUpdate = 'virtualized.ignoreRecursiveUpdate',
}
const virtualizedCommandRegisterObject: Record<string, VirtualizedRegisteredCommand> = {
  [StandardCommand.MoveSelectionGraphemeBackwards]: {
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
              const { anchorPointWithContentReference, focusPointWithContentReference } =
                matita.getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange);
              const newPointWithContentReference = matita.getIsSelectionRangeAnchorAfterFocus(stateControl.stateView.document, selectionRange)
                ? focusPointWithContentReference
                : anchorPointWithContentReference;
              const rangeId = matita.generateId();
              if (matita.isParagraphPoint(newPointWithContentReference.point)) {
                const cursorWrapped = documentRenderControl.isParagraphPointAtWrappedLineWrapPoint(newPointWithContentReference.point);
                if (cursorWrapped) {
                  cursorWrappedIds.push(selectionRange.id);
                }
                return matita.makeSelectionRange(
                  [
                    matita.makeRange(
                      newPointWithContentReference.contentReference,
                      newPointWithContentReference.point,
                      newPointWithContentReference.point,
                      rangeId,
                    ),
                  ],
                  rangeId,
                  rangeId,
                  selectionRange.intention,
                  cursorWrapped ? { ...selectionRange.data, [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : selectionRange.data,
                  selectionRange.id,
                );
              }
              return matita.makeSelectionRange(
                [
                  matita.makeRange(
                    newPointWithContentReference.contentReference,
                    newPointWithContentReference.point,
                    newPointWithContentReference.point,
                    rangeId,
                  ),
                ],
                rangeId,
                rangeId,
                selectionRange.intention,
                selectionRange.data,
                selectionRange.id,
              );
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
  [StandardCommand.MoveSelectionWordBackwards]: {
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
  [StandardCommand.MoveSelectionSoftLineStart]: {
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
          ),
          undefined,
          { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
        );
      });
    },
  },
  [StandardCommand.MoveSelectionSoftLineEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionSoftLineDown]: {
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
  [StandardCommand.MoveSelectionSoftLineUp]: {
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
  [StandardCommand.MoveSelectionStartOfPage]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionEndOfPage]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionSoftLineStart]: {
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
          ),
          undefined,
          { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: cursorWrappedIds },
        );
      });
    },
  },
  [StandardCommand.ExtendSelectionSoftLineEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionSoftLineDown]: {
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
                matita.makeRange(contentReference, range.id === selectionRange.anchorRangeId ? matita.getAnchorPointFromRange(range) : point, point, range.id),
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
  [StandardCommand.ExtendSelectionSoftLineUp]: {
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
                matita.makeRange(contentReference, range.id === selectionRange.anchorRangeId ? matita.getAnchorPointFromRange(range) : point, point, range.id),
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
  [StandardCommand.ExtendSelectionStartOfPage]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          documentRenderControl.makePagePointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionEndOfPage]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeExtendSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.noopPointTransformFn,
          documentRenderControl.makePagePointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.RemoveSelectionSoftLineStart]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) =>
            !shouldCollapseSelectionRangeInTextCommand(document, selectionRange) || matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange),
          matita.noopPointTransformFn,
          documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.RemoveSelectionSoftLineEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) =>
            !shouldCollapseSelectionRangeInTextCommand(document, selectionRange) || !matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange),
          matita.noopPointTransformFn,
          documentRenderControl.makeSoftLineStartEndPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.OpenSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      documentRenderControl.openSearch();
    },
  },
  [StandardCommand.CloseSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      documentRenderControl.closeSearch();
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
function indexOfNearestLessThanDynamic<V, N>(
  access: (i: number) => V,
  length: number,
  needle: N,
  compare: (value: V, needle: N) => number,
  low = 0,
  high = length - 1,
): number {
  if (length === 0) {
    return -1;
  }
  let mid: number;
  let item: V;
  let target = -1;
  if (compare(access(high), needle) < 0) {
    return high;
  }
  while (low <= high) {
    mid = (low + high) >> 1;
    item = access(mid);
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
function indexOfNearestLessThan<V, N>(array: V[], needle: N, compare: (value: V, needle: N) => number, low = 0, high = array.length - 1): number {
  if (array.length === 0) {
    return -1;
  }
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
function scrollCursorRectIntoView(cursorRect: ViewRectangle, scrollElement: HTMLElement, isScrollable: (element: Element) => boolean, nestedCall?: boolean) {
  if (!nestedCall) {
    scrollElement = findScrollContainer(scrollElement, isScrollable);
    if (scrollElement !== document.body && scrollElement !== document.documentElement) {
      let s = scrollElement;
      while (true) {
        s = findScrollContainer(s, isScrollable);
        scrollCursorRectIntoView(cursorRect, s, isScrollable, true);
        if (s === document.body || s === document.documentElement) {
          break;
        }
      }
    }
  }
  const isWindow = scrollElement === document.body || scrollElement === document.documentElement;
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
  CompositionUpdate = 'CompositionUpdate',
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
  #lastChangeType: string | null;
  #selectionBefore: matita.Selection | null;
  #selectionAfter: matita.Selection | null;
  #forceChange: ((changeType: string) => boolean) | null;
  constructor(stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>) {
    super();
    this.#stateControl = stateControl;
    this.#undoStateDifferencesStack = [];
    this.#redoStateDifferencesStack = [];
    this.#mutationResults = [];
    this.#lastChangeType = null;
    this.#selectionBefore = null;
    this.#selectionAfter = null;
    this.#forceChange = null;
    pipe(this.#stateControl.selectionChange$, subscribe(this.#onSelectionChange.bind(this), this));
    pipe(this.#stateControl.afterMutationPart$, subscribe(this.#onAfterMutationPart.bind(this), this));
  }
  #onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    if (this.#mutationResults.length === 0) {
      return;
    }
    const { updateDataStack } = event.value;
    const updateDataMaybe = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if (isSome(updateDataMaybe)) {
      return;
    }
    this.#lastChangeType = LocalUndoControlLastChangeType.SelectionAfterChange;
  }
  #onAfterMutationPart(
    event: Event<matita.AfterMutationPartMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>,
  ): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { mutationPart, result, updateDataStack, afterMutation$, isFirstMutationPart, isLastMutationPart } = event.value;
    const lastUpdateData = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if ((isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]) || !result.didChange) {
      return;
    }
    this.#redoStateDifferencesStack = [];
    let changeType: string;
    if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.InsertText]) {
      changeType = LocalUndoControlLastChangeType.InsertText;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.RemoveTextBackwards]) {
      changeType = LocalUndoControlLastChangeType.RemoveTextBackwards;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.RemoveTextForwards]) {
      changeType = LocalUndoControlLastChangeType.RemoveTextForwards;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.CompositionUpdate]) {
      changeType = LocalUndoControlLastChangeType.CompositionUpdate;
    } else if (isSome(lastUpdateData) && typeof lastUpdateData.value[matita.RedoUndoUpdateKey.UniqueGroupedUpdate] === 'string') {
      changeType = lastUpdateData.value[matita.RedoUndoUpdateKey.UniqueGroupedUpdate];
    } else {
      changeType = LocalUndoControlLastChangeType.Other;
    }
    const pushToStack =
      (this.#forceChange && this.#forceChange(changeType)) ||
      (this.#mutationResults.length > 0 &&
        (this.#lastChangeType === LocalUndoControlLastChangeType.Other || (this.#lastChangeType && changeType !== this.#lastChangeType)));
    if (isFirstMutationPart) {
      if (pushToStack) {
        this.#pushToStack();
      }
      this.#forceChange = null;
      const defaultSelectionBefore = this.#stateControl.stateView.selection;
      pipe(
        afterMutation$,
        subscribe((event) => {
          assert(event.type === EndType);
          if (this.#selectionBefore === null) {
            if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.SelectionBefore]) {
              this.#selectionBefore = (lastUpdateData.value[matita.RedoUndoUpdateKey.SelectionBefore] as { value: matita.Selection }).value;
              assertIsNotNullish(this.#selectionBefore);
            } else {
              this.#selectionBefore = defaultSelectionBefore;
            }
          }
        }, this),
      );
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
          if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.SelectionAfter]) {
            this.#selectionAfter = (lastUpdateData.value[matita.RedoUndoUpdateKey.SelectionAfter] as { value: matita.Selection }).value;
            assertIsNotNullish(this.#selectionAfter);
          } else {
            this.#selectionAfter = this.#stateControl.stateView.selection;
          }
        }, this),
      );
    }
  }
  #pushToStack(): void {
    if (this.#mutationResults.length === 0) {
      return;
    }
    this.#forceChange = null;
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
  forceNextChange(shouldForceChange: (changeType: string) => boolean): void {
    this.#forceChange = shouldForceChange;
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
      { [matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
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
      { [matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
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
    commandRegister.set(StandardCommand.Undo, {
      execute: this.tryUndo.bind(this),
    });
    commandRegister.set(StandardCommand.Redo, {
      execute: this.tryRedo.bind(this),
    });
  }
}
function getNodeBoundingRect(textNode: Node) {
  const range = document.createRange();
  range.selectNodeContents(textNode);
  return range.getBoundingClientRect();
}
class ReactiveMutationObserver extends DisposableClass {
  records$: Source<MutationRecord[]>;
  #records$: Distributor<MutationRecord[]>;
  #observerTargets: {
    target: Node;
    options?: MutationObserverInit;
  }[];
  #mutationObserver: MutationObserver;
  constructor() {
    super(() => this.#dispose());
    this.#observerTargets = [];
    this.#records$ = Distributor();
    this.add(this.#records$);
    this.records$ = Source(this.#records$);
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
  #entries$: Distributor<IntersectionObserverEntry[]>;
  #intersectionObserver: IntersectionObserver;
  constructor(options?: IntersectionObserverInit) {
    super(() => this.#dispose());
    this.#entries$ = Distributor();
    this.add(this.#entries$);
    this.entries$ = Source(this.#entries$);
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
  #entries$: Distributor<ResizeObserverEntry[]>;
  #resizeObserver: ResizeObserver;
  constructor() {
    super(() => this.#dispose());
    this.#entries$ = Distributor();
    this.add(this.#entries$);
    this.entries$ = Source(this.#entries$);
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
const SeparateSelectionIdKey = 'virtualized.separateSelectionId';
class VirtualizedDocumentRenderControl extends DisposableClass implements matita.DocumentRenderControl {
  rootHtmlElement: HTMLElement;
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  viewControl: VirtualizedViewControl;
  topLevelContentReference: matita.ContentReference;
  htmlElementToNodeRenderControlMap: Map<HTMLElement, VirtualizedContentRenderControl | VirtualizedParagraphRenderControl>;
  #containerHtmlElement!: HTMLElement;
  #topLevelContentViewContainerElement!: HTMLElement;
  #selectionViewContainerElement!: HTMLElement;
  #inputElementLastSynchronizedParagraphReference: matita.BlockReference | null;
  #inputElementContainedInSingleParagraph: boolean;
  #inputTextElement!: HTMLElement;
  #inputTextElementMeasurementElement!: HTMLElement;
  #searchOverlayContainerElement!: HTMLElement;
  #searchElementContainerElement!: HTMLElement;
  #searchInputRef = createRef<HTMLInputElement>();
  #selectionView$: CurrentValueDistributor<SelectionViewMessage>;
  #searchOverlay$: CurrentValueDistributor<SearchOverlayMessage>;
  #relativeParagraphMeasurementCache: LruCache<string, RelativeParagraphMeasureCacheValue>;
  #keyCommands: KeyCommands;
  #commandRegister: VirtualizedCommandRegister;
  #undoControl: LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
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
    this.#selectionView$ = CurrentValueDistributor<SelectionViewMessage>({
      viewCursorAndRangeInfos: {
        viewCursorAndRangeInfosForSelectionRanges: [],
      },
    });
    this.#searchOverlay$ = CurrentValueDistributor<SearchOverlayMessage>({
      matchInfos: [],
    });
    this.#relativeParagraphMeasurementCache = new LruCache(250);
    this.#keyCommands = defaultTextEditingKeyCommands;
    this.#commandRegister = combineCommandRegistersOverride<
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
    >([genericCommandRegister, virtualizedCommandRegister]);
    this.#undoControl = new LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(this.stateControl);
    this.add(this.#undoControl);
    this.#undoControl.registerCommands(this.#commandRegister);
    this.#inputElementLastSynchronizedParagraphReference = null;
    this.#inputElementContainedInSingleParagraph = false;
  }
  #isDraggingSelection = false;
  #endSelectionDrag$ = Distributor<undefined>();
  #isOverflowClipNotSupported = false;
  #searchControl!: SingleParagraphPlainTextSearchControl;
  #isSearchElementContainerVisible$ = CurrentValueDistributor<boolean>(false);
  #searchElementTrackAllControl: TrackAllControl | null = null;
  #matchNumberMaybe$ = CurrentValueDistributor<Maybe<number>>(None);
  #totalMatchesMaybe$ = CurrentValueDistributor<Maybe<number>>(None);
  init(): void {
    this.#containerHtmlElement = document.createElement('div');
    this.#topLevelContentViewContainerElement = document.createElement('div');
    // TODO: Hack to fix virtual selection and input overflowing bottom.
    this.#topLevelContentViewContainerElement.style.paddingBottom = '8px';
    this.#selectionViewContainerElement = document.createElement('div');
    this.#searchOverlayContainerElement = document.createElement('div');
    pipe(
      this.stateControl.afterMutationPart$,
      map((message) => message.viewDelta),
      subscribe(this.#onViewDelta.bind(this), this),
    );
    pipe(this.stateControl.finishedUpdating$, subscribe(this.#onFinishedUpdating.bind(this), this));
    pipe(this.stateControl.selectionChange$, subscribe(this.#onSelectionChange.bind(this), this));
    pipe(this.stateControl.afterMutationPart$, subscribe(this.#onAfterMutationPart.bind(this), this));
    const topLevelContentRenderControl = new VirtualizedContentRenderControl(this.topLevelContentReference, this.viewControl);
    this.viewControl.renderControlRegister.registerContentRenderControl(topLevelContentRenderControl);
    this.add(topLevelContentRenderControl);
    this.#inputTextElement = document.createElement('span');
    this.#inputTextElement.contentEditable = 'true';
    this.#inputTextElement.spellcheck = false;
    this.#inputTextElement.style.position = 'absolute';
    this.#inputTextElement.style.left = '0';
    this.#inputTextElement.style.top = '0';
    this.#inputTextElement.style.minWidth = '1px';
    this.#inputTextElement.style.outline = 'none';
    this.#inputTextElement.style.caretColor = 'transparent';
    this.#inputTextElement.style.fontFamily = 'initial';
    this.#inputTextElement.style.whiteSpace = 'nowrap';
    this.#inputTextElement.style.letterSpacing = '0';
    this.#inputTextElement.style.opacity = '0';
    this.#inputTextElementMeasurementElement = document.createElement('span');
    this.#inputTextElementMeasurementElement.style.position = 'absolute';
    this.#inputTextElementMeasurementElement.style.top = '0';
    this.#inputTextElementMeasurementElement.style.left = '0';
    this.#inputTextElementMeasurementElement.style.fontFamily = 'initial';
    this.#inputTextElementMeasurementElement.style.whiteSpace = 'nowrap';
    this.#inputTextElementMeasurementElement.style.letterSpacing = '0';
    this.#inputTextElementMeasurementElement.style.opacity = '0';
    addEventListener(this.#inputTextElement, 'beforeinput', this.#onInputElementBeforeInput.bind(this), this);
    addEventListener(this.#inputTextElement, 'copy', this.#onCopy.bind(this), this);
    addEventListener(this.#inputTextElement, 'cut', this.#onCut.bind(this), this);
    addEventListener(this.#inputTextElement, 'focus', this.#onInputElementFocus.bind(this), this);
    // TODO.
    addEventListener(this.#inputTextElement, 'blur', this.#replaceViewSelectionRanges.bind(this), this);
    addEventListener(this.#inputTextElement, 'compositionstart', this.#onCompositionStart.bind(this), this);
    addEventListener(this.#inputTextElement, 'compositionend', this.#onCompositionEnd.bind(this), this);
    addWindowEventListener('focus', this.#replaceViewSelectionRanges.bind(this), this);
    addWindowEventListener(
      'blur',
      () => {
        requestAnimationFrameDisposable(() => {
          this.#clearKeys();
        }, this);
        // TODO.
        this.#replaceViewSelectionRanges();
      },
      this,
    );
    const inputElementReactiveMutationObserver = new ReactiveMutationObserver();
    pipe(
      inputElementReactiveMutationObserver.records$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        // This fires before compositionstart in safari.
        if (isSafari) {
          requestAnimationFrameDisposable(() => {
            this.#syncInputElement();
          }, this);
        } else {
          this.#syncInputElement();
        }
      }, this),
    );
    this.add(inputElementReactiveMutationObserver);
    inputElementReactiveMutationObserver.observe(this.#inputTextElement, {
      childList: true,
    });
    addEventListener(this.#inputTextElement, 'selectionchange', this.#syncInputElement.bind(this), this);
    const pointerDownLeft$ = Distributor<PointerEvent>();
    const pointerUpLeft$ = Distributor<PointerEvent>();
    const filterLeft = filter<PointerEvent>((event) => event.pointerType === 'mouse' && event.button === 0);
    const dragElements = [
      this.#inputTextElementMeasurementElement,
      this.#topLevelContentViewContainerElement,
      this.#selectionViewContainerElement,
      this.#searchOverlayContainerElement,
      this.#inputTextElement, // TODO: Overflows parent, changing dimensions.
    ];
    dragElements.forEach((element) => {
      element.classList.add('hidden-selection');
      element.style.cursor = 'text';
      pipe(
        fromReactiveValue<[PointerEvent]>((callback, disposable) => addEventListener(element, 'pointerdown', callback, disposable)),
        map((args) => args[0]),
        filterLeft,
        subscribe(pointerDownLeft$),
      );
      pipe(
        fromReactiveValue<[PointerEvent]>((callback, disposable) => addEventListener(element, 'pointerup', callback, disposable)),
        map((args) => args[0]),
        filterLeft,
        subscribe(pointerUpLeft$),
      );
    });
    let currentDebounceTimer$: Distributor<never>;
    pipe(
      pointerDownLeft$,
      windowScheduledBySource(
        pipe(
          pointerDownLeft$,
          debounce(
            () => {
              currentDebounceTimer$ = Distributor<never>();
              pipe(timer(400), subscribe(currentDebounceTimer$));
              return currentDebounceTimer$;
            },
            true,
            false,
          ),
        ),
      )<PointerEvent>,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const pointerDownWindow$ = event.value;
        type SelectionType = 'grapheme' | 'word' | 'paragraph';
        interface PointInfo {
          position: HitPosition;
          stateView: matita.StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
        }
        let dragState:
          | {
              startViewPosition: ViewPosition;
              lastViewPosition: ViewPosition;
              startPointInfo: PointInfo;
              lastPointInfo: PointInfo;
              originalSelection: matita.Selection;
              beforeSelection: matita.Selection;
              selectionType: SelectionType;
              isExtendSelection: boolean;
              separateSelectionId: Maybe<number>;
            }
          | undefined;
        const removeSelectionRangeWithIdFromBeforeSelection = (selectionRangeId: string): void => {
          assertIsNotNullish(dragState);
          dragState.beforeSelection = matita.makeSelection(
            dragState.beforeSelection.selectionRanges.filter((selectionRange) => selectionRange.id !== selectionRangeId),
          );
        };
        const transformPointInfoToCurrentPointWithContentReference = (pointInfo: PointInfo): matita.PointWithContentReference | null => {
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
          const startSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
            {
              selection: matita.makeSelection([dummySelectionRange]),
              fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
              shouldTransformAsSelection: true,
            },
            pointInfo.stateView,
            this.stateControl.stateView,
          );
          if (startSelection.selectionRanges.length === 0) {
            return null;
          }
          return {
            point: startSelection.selectionRanges[0].ranges[0].startPoint,
            contentReference: startSelection.selectionRanges[0].ranges[0].contentReference,
          };
        };
        let index = 0;
        pipe(
          pointerDownWindow$,
          subscribe((event) => {
            if (event.type !== PushType) {
              return;
            }
            const pointerEvent = event.value;
            const { target, pointerId } = pointerEvent;
            if (!target || !(target instanceof HTMLElement)) {
              throwUnreachable();
            }
            const viewPosition: ViewPosition = {
              left: pointerEvent.x,
              top: pointerEvent.y,
            };
            const position = this.#calculatePositionFromViewPosition(viewPosition);
            if (!dragState && !position) {
              return;
            }
            target.setPointerCapture(pointerId);
            const pointerCaptureDisposable = Disposable(() => {
              target.releasePointerCapture(pointerId);
            });
            pointerDownWindow$.add(pointerCaptureDisposable);
            const endSelectionDragDisposable = Disposable();
            pointerDownWindow$.add(endSelectionDragDisposable);
            endSelectionDragDisposable.add(pointerCaptureDisposable);
            const endSelectionDrag = (): void => {
              this.#isDraggingSelection = false;
              endSelectionDragDisposable.dispose();
              currentDebounceTimer$(End);
            };
            pipe(
              this.#endSelectionDrag$,
              subscribe((event) => {
                assert(event.type === PushType);
                endSelectionDrag();
              }, endSelectionDragDisposable),
            );
            pipe(
              this.#keyDown$,
              filterMap<{ key: string; keyboardEvent?: KeyboardEvent }, KeyboardEvent | undefined>(({ key, keyboardEvent }) =>
                key === 'Escape' ? Some(keyboardEvent) : None,
              ),
              subscribe((event) => {
                if (event.type !== PushType) {
                  throwUnreachable();
                }
                const keyboardEvent = event.value;
                keyboardEvent?.preventDefault();
                endSelectionDrag();
                this.stateControl.queueUpdate(() => {
                  assertIsNotNullish(dragState);
                  this.stateControl.delta.setSelection(
                    this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                      { selection: dragState.originalSelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix, shouldTransformAsSelection: true },
                      dragState.startPointInfo.stateView,
                      this.stateControl.stateView,
                    ),
                  );
                });
              }, pointerCaptureDisposable),
            );
            pipe(
              pointerUpLeft$,
              subscribe<PointerEvent>((event) => {
                if (event.type !== PushType) {
                  return;
                }
                assertIsNotNullish(dragState);
                pointerCaptureDisposable.dispose();
                const pointerEvent = event.value;
                const viewPosition: ViewPosition = {
                  left: pointerEvent.x,
                  top: pointerEvent.y,
                };
                const position = this.#calculatePositionFromViewPosition(viewPosition);
                let endPointInfo: PointInfo | undefined;
                if (position) {
                  endPointInfo = {
                    position,
                    stateView: this.stateControl.snapshotStateThroughStateView(),
                  };
                }
                queueSelectionUpdate(endPointInfo);
              }, pointerCaptureDisposable),
            );
            const selectionType: SelectionType = index === 0 ? 'grapheme' : (index - 1) % 2 === 0 ? 'word' : 'paragraph';
            index++;
            const isExtendSelection = this.#keyDownSet.has('Shift');
            if (dragState) {
              dragState.selectionType = selectionType;
              dragState.lastViewPosition = viewPosition;
              dragState.isExtendSelection = isExtendSelection;
            }
            const pointerMove$ = pipe(
              fromArray(
                dragElements.map((element) => {
                  return pipe(
                    fromReactiveValue<[PointerEvent]>((callback, disposable) => addEventListener(element, 'pointermove', callback, disposable)),
                    map((args) => args[0]),
                  );
                }),
              ),
              flat(),
            );
            let isMovedPastThreshold = false;
            const calculateSelection = (endPointInfo?: PointInfo): matita.Selection | null => {
              assertIsNotNullish(dragState);
              const transformedBeforeSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                { selection: dragState.beforeSelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix, shouldTransformAsSelection: true },
                dragState.startPointInfo.stateView,
                this.stateControl.stateView,
              );
              let originalStartPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.startPointInfo);
              if (!originalStartPointWithContentReference) {
                return null;
              }
              let originalEndPointWithContentReference: matita.PointWithContentReference | null;
              if (endPointInfo) {
                originalEndPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(endPointInfo);
              } else if (dragState.lastPointInfo === dragState.startPointInfo) {
                originalEndPointWithContentReference = originalStartPointWithContentReference;
              } else {
                originalEndPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.lastPointInfo);
              }
              if (!originalEndPointWithContentReference) {
                return null;
              }
              const originalIsWrappedLineStart = (endPointInfo ?? dragState.lastPointInfo).position.isWrappedLineStart;
              let extendedSelectionRangeIdMaybe: Maybe<string>;
              if (dragState.isExtendSelection && transformedBeforeSelection.selectionRanges.length > 0) {
                let selectionRangeToExtend: matita.SelectionRange | undefined | null;
                if (isSome(dragState.separateSelectionId)) {
                  selectionRangeToExtend = matita.getMostRecentlyCreatedSelectionRangeFromSelectionRanges(
                    transformedBeforeSelection.selectionRanges.filter(
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      (selectionRange) => selectionRange.data[SeparateSelectionIdKey] === (dragState!.separateSelectionId as Some<number>).value,
                    ),
                  );
                  if (!selectionRangeToExtend) {
                    selectionRangeToExtend = matita.getFocusSelectionRangeFromSelection(transformedBeforeSelection);
                    assertIsNotNullish(selectionRangeToExtend);
                  }
                } else {
                  selectionRangeToExtend = matita.getAnchorSelectionRangeFromSelection(transformedBeforeSelection);
                  assertIsNotNullish(selectionRangeToExtend);
                }
                const anchorRangeId = selectionRangeToExtend.anchorRangeId;
                const anchorRange = selectionRangeToExtend.ranges.find((range) => range.id === anchorRangeId);
                assertIsNotNullish(anchorRange);
                originalStartPointWithContentReference = {
                  contentReference: anchorRange.contentReference,
                  point: matita.getAnchorPointFromRange(anchorRange),
                };
                extendedSelectionRangeIdMaybe = Some(selectionRangeToExtend.id);
              } else {
                extendedSelectionRangeIdMaybe = None;
              }
              let startPointWithContentReference: matita.PointWithContentReference;
              let endPointWithContentReference: matita.PointWithContentReference;
              let isWrappedLineStart: boolean;
              if (dragState.selectionType === 'grapheme') {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalEndPointWithContentReference;
                isWrappedLineStart = originalIsWrappedLineStart;
              } else if (
                matita.isParagraphPoint(originalStartPointWithContentReference.point) &&
                matita.arePointWithContentReferencesEqual(originalStartPointWithContentReference, originalEndPointWithContentReference) &&
                matita.getParagraphLength(
                  matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, originalStartPointWithContentReference.point),
                ) === 0
              ) {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalStartPointWithContentReference;
                isWrappedLineStart = false;
              } else {
                const originalStartPointKey = matita.makePointKeyFromPoint(
                  this.stateControl.stateView.document,
                  originalStartPointWithContentReference.contentReference,
                  originalStartPointWithContentReference.point,
                );
                const originalEndPointKey = matita.makePointKeyFromPoint(
                  this.stateControl.stateView.document,
                  originalEndPointWithContentReference.contentReference,
                  originalEndPointWithContentReference.point,
                );
                let isBackward =
                  matita.compareKeys(this.stateControl.stateView.document, originalStartPointKey, originalEndPointKey) === matita.CompareKeysResult.After;
                let firstPointWithContentReference = isBackward ? originalEndPointWithContentReference : originalStartPointWithContentReference;
                let secondPointWithContentReference = isBackward ? originalStartPointWithContentReference : originalEndPointWithContentReference;
                // TODO. (Also, these aren't updated in 'word'.)
                const dummyFirstRange = matita.makeRange(
                  firstPointWithContentReference.contentReference,
                  firstPointWithContentReference.point,
                  firstPointWithContentReference.point,
                  matita.generateId(),
                );
                const dummyFirstSelectionRange = matita.makeSelectionRange(
                  [dummyFirstRange],
                  dummyFirstRange.id,
                  dummyFirstRange.id,
                  matita.SelectionRangeIntention.Text,
                  {},
                  matita.generateId(),
                );
                const dummySecondRange = matita.makeRange(
                  secondPointWithContentReference.contentReference,
                  secondPointWithContentReference.point,
                  secondPointWithContentReference.point,
                  matita.generateId(),
                );
                const dummySecondSelectionRange = matita.makeSelectionRange(
                  [dummySecondRange],
                  dummySecondRange.id,
                  dummySecondRange.id,
                  matita.SelectionRangeIntention.Text,
                  {},
                  matita.generateId(),
                );
                if (dragState.selectionType === 'word') {
                  const originalFirstPointWithContentReference = firstPointWithContentReference;
                  firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.WordBoundary,
                    matita.PointMovement.PreviousBoundByEdge,
                  )(
                    this.stateControl.stateView.document,
                    this.stateControl.stateControlConfig,
                    matita.SelectionRangeIntention.Text,
                    dummyFirstRange,
                    firstPointWithContentReference.point,
                    dummyFirstSelectionRange,
                  );
                  const originalSecondPointWithContentReference = secondPointWithContentReference;
                  if (
                    matita.arePointWithContentReferencesEqual(firstPointWithContentReference, secondPointWithContentReference) &&
                    matita.arePointWithContentReferencesEqual(firstPointWithContentReference, originalFirstPointWithContentReference)
                  ) {
                    // We are collapsed at a boundary.
                    let tryForwards = true;
                    if (dragState.startPointInfo.position.isPastPreviousCharacterHalfPoint) {
                      // Try backwards.
                      firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                        matita.MovementGranularity.WordBoundary,
                        matita.PointMovement.Previous,
                      )(
                        this.stateControl.stateView.document,
                        this.stateControl.stateControlConfig,
                        matita.SelectionRangeIntention.Text,
                        dummyFirstRange,
                        firstPointWithContentReference.point,
                        dummyFirstSelectionRange,
                      );
                      tryForwards = matita.arePointWithContentReferencesEqual(firstPointWithContentReference, secondPointWithContentReference);
                    }
                    if (tryForwards) {
                      secondPointWithContentReference = matita.makeDefaultPointTransformFn(matita.MovementGranularity.WordBoundary, matita.PointMovement.Next)(
                        this.stateControl.stateView.document,
                        this.stateControl.stateControlConfig,
                        matita.SelectionRangeIntention.Text,
                        dummyFirstRange,
                        secondPointWithContentReference.point,
                        dummyFirstSelectionRange,
                      );
                    }
                  } else {
                    secondPointWithContentReference = matita.makeDefaultPointTransformFn(
                      matita.MovementGranularity.WordBoundary,
                      matita.PointMovement.NextBoundByEdge,
                    )(
                      this.stateControl.stateView.document,
                      this.stateControl.stateControlConfig,
                      matita.SelectionRangeIntention.Text,
                      dummyFirstRange,
                      secondPointWithContentReference.point,
                      dummyFirstSelectionRange,
                    );
                  }
                  if (
                    isBackward &&
                    matita.arePointWithContentReferencesEqual(
                      firstPointWithContentReference,
                      matita.makeDefaultPointTransformFn(matita.MovementGranularity.WordBoundary, matita.PointMovement.Previous)(
                        this.stateControl.stateView.document,
                        this.stateControl.stateControlConfig,
                        matita.SelectionRangeIntention.Text,
                        dummySecondRange,
                        secondPointWithContentReference.point,
                        dummySecondSelectionRange,
                      ),
                    )
                  ) {
                    isBackward = false;
                  }
                  isWrappedLineStart =
                    originalIsWrappedLineStart &&
                    (isBackward
                      ? matita.arePointWithContentReferencesEqual(originalFirstPointWithContentReference, firstPointWithContentReference)
                      : matita.arePointWithContentReferencesEqual(originalSecondPointWithContentReference, secondPointWithContentReference));
                } else {
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  if (dragState.selectionType !== 'paragraph') {
                    assertUnreachable(dragState.selectionType);
                  }
                  firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.Paragraph,
                    matita.PointMovement.PreviousBoundByEdge,
                  )(
                    this.stateControl.stateView.document,
                    this.stateControl.stateControlConfig,
                    matita.SelectionRangeIntention.Text,
                    dummyFirstRange,
                    firstPointWithContentReference.point,
                    dummyFirstSelectionRange,
                  );
                  secondPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.Paragraph,
                    matita.PointMovement.NextBoundByEdge,
                  )(
                    this.stateControl.stateView.document,
                    this.stateControl.stateControlConfig,
                    matita.SelectionRangeIntention.Text,
                    dummySecondRange,
                    secondPointWithContentReference.point,
                    dummySecondSelectionRange,
                  );
                  matita.assertIsParagraphPoint(firstPointWithContentReference.point);
                  matita.assertIsParagraphPoint(secondPointWithContentReference.point);
                  if (isBackward && matita.areParagraphPointsAtSameParagraph(firstPointWithContentReference.point, secondPointWithContentReference.point)) {
                    isBackward = false;
                  }
                  isWrappedLineStart = false;
                }
                startPointWithContentReference = isBackward ? secondPointWithContentReference : firstPointWithContentReference;
                endPointWithContentReference = isBackward ? firstPointWithContentReference : secondPointWithContentReference;
              }
              const resolveOverlappingSelectionRanges = (
                info: matita.ResolveOverlappingSelectionRangesInfo,
                prioritySelectionRangeId: string,
              ): matita.RangeWithKeys | null => {
                if (info.range1WithKeys.selectionRangeId === prioritySelectionRangeId && info.range2WithKeys.selectionRangeId !== prioritySelectionRangeId) {
                  removeSelectionRangeWithIdFromBeforeSelection(info.range2WithKeys.selectionRangeId);
                  const newSelectionRangeId = info.updateSelectionRangeId(info.range2WithKeys.selectionRangeId, prioritySelectionRangeId);
                  return {
                    ...info.range1WithKeys,
                    selectionRangeId: newSelectionRangeId,
                  };
                }
                if (info.range1WithKeys.selectionRangeId !== prioritySelectionRangeId && info.range2WithKeys.selectionRangeId === prioritySelectionRangeId) {
                  removeSelectionRangeWithIdFromBeforeSelection(info.range1WithKeys.selectionRangeId);
                  const newSelectionRangeId = info.updateSelectionRangeId(info.range1WithKeys.selectionRangeId, prioritySelectionRangeId);
                  return {
                    ...info.range2WithKeys,
                    selectionRangeId: newSelectionRangeId,
                  };
                }
                return null;
              };
              const draggedSelectionRanges = matita.makeRangesConnectingPointsAtContentReferences(
                this.stateControl.stateView.document,
                startPointWithContentReference.contentReference,
                startPointWithContentReference.point,
                endPointWithContentReference.contentReference,
                endPointWithContentReference.point,
                matita.generateId(),
              );
              const draggedSelectionRange = matita.makeSelectionRange(
                draggedSelectionRanges,
                draggedSelectionRanges[0].id,
                draggedSelectionRanges[draggedSelectionRanges.length - 1].id,
                matita.SelectionRangeIntention.Text,
                Object.assign(
                  {},
                  isWrappedLineStart ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: true } : undefined,
                  isSome(dragState.separateSelectionId) ? { [SeparateSelectionIdKey]: dragState.separateSelectionId.value } : undefined,
                ),
                isSome(extendedSelectionRangeIdMaybe) ? extendedSelectionRangeIdMaybe.value : matita.generateId(),
                true,
              );
              if (isNone(dragState.separateSelectionId)) {
                return matita.makeSelection([draggedSelectionRange]);
              }
              if (isSome(extendedSelectionRangeIdMaybe)) {
                const extendedSelectionRangeId = extendedSelectionRangeIdMaybe.value;
                return matita.sortAndMergeAndFixSelectionRanges(
                  this.stateControl.stateView.document,
                  this.stateControl.stateControlConfig,
                  [
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    ...transformedBeforeSelection.selectionRanges.filter((selectionRange) => selectionRange.id !== extendedSelectionRangeId),
                    draggedSelectionRange,
                  ],
                  (info) => resolveOverlappingSelectionRanges(info, extendedSelectionRangeId),
                );
              }
              if (
                !isMovedPastThreshold &&
                dragState.selectionType === 'grapheme' &&
                matita.arePointWithContentReferencesEqual(originalStartPointWithContentReference, originalEndPointWithContentReference) &&
                transformedBeforeSelection.selectionRanges.length > 1
              ) {
                const withoutCollapsedAtSameSpotSelectionRanges = transformedBeforeSelection.selectionRanges.filter(
                  (selectionRange) => !matita.areSelectionRangesCoveringSameContent(selectionRange, draggedSelectionRange),
                );
                if (withoutCollapsedAtSameSpotSelectionRanges.length !== transformedBeforeSelection.selectionRanges.length) {
                  return matita.makeSelection(withoutCollapsedAtSameSpotSelectionRanges);
                }
              }
              return matita.sortAndMergeAndFixSelectionRanges(
                this.stateControl.stateView.document,
                this.stateControl.stateControlConfig,
                [...transformedBeforeSelection.selectionRanges, draggedSelectionRange],
                (info) => resolveOverlappingSelectionRanges(info, draggedSelectionRange.id),
              );
            };
            const queueSelectionUpdate = (endPointInfo?: PointInfo): void => {
              this.#isDraggingSelection = !endPointInfo;
              this.stateControl.queueUpdate(() => {
                const newSelection = calculateSelection(endPointInfo);
                if (!newSelection) {
                  return;
                }
                const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(newSelection);
                this.stateControl.delta.setSelection(
                  newSelection,
                  undefined,
                  focusSelectionRange?.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]
                    ? { [VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine]: [focusSelectionRange.id] }
                    : undefined,
                );
              });
            };
            pipe(
              pointerMove$,
              subscribe((event) => {
                if (event.type !== PushType) {
                  throwUnreachable();
                }
                assertIsNotNullish(dragState);
                const pointerEvent = event.value;
                const viewPosition: ViewPosition = {
                  left: pointerEvent.x,
                  top: pointerEvent.y,
                };
                const deltaX = viewPosition.left - dragState.startViewPosition.left;
                const deltaY = viewPosition.top - dragState.startViewPosition.top;
                const dragThreshold = 5;
                if (deltaX * deltaX + deltaY * deltaY > dragThreshold * dragThreshold) {
                  isMovedPastThreshold = true;
                  if (pointerCaptureDisposable.active) {
                    currentDebounceTimer$(End);
                  } else {
                    endSelectionDrag();
                  }
                }
              }, endSelectionDragDisposable),
            );
            pipe(
              pointerMove$,
              subscribe((event) => {
                if (event.type !== PushType) {
                  throwUnreachable();
                }
                assertIsNotNullish(dragState);
                const pointerEvent = event.value;
                const viewPosition: ViewPosition = {
                  left: pointerEvent.x,
                  top: pointerEvent.y,
                };
                dragState.lastViewPosition = viewPosition;
                const position = this.#calculatePositionFromViewPosition(viewPosition);
                if (position) {
                  const pointInfo: PointInfo = {
                    position,
                    stateView: this.stateControl.snapshotStateThroughStateView(),
                  };
                  dragState.lastPointInfo = pointInfo;
                  queueSelectionUpdate();
                }
              }, pointerCaptureDisposable),
            );
            if (!position) {
              return;
            }
            const pointInfo: PointInfo = {
              position,
              stateView: this.stateControl.snapshotStateThroughStateView(),
            };
            if (dragState) {
              dragState.lastPointInfo = pointInfo;
              queueSelectionUpdate();
              return;
            }
            const separateSelectionId = this.#keyDownSet.get('Alt');
            dragState = {
              startViewPosition: viewPosition,
              lastViewPosition: viewPosition,
              startPointInfo: pointInfo,
              lastPointInfo: pointInfo,
              originalSelection: this.stateControl.stateView.selection,
              beforeSelection: this.stateControl.stateView.selection,
              selectionType,
              isExtendSelection,
              separateSelectionId: separateSelectionId === undefined ? None : Some(separateSelectionId),
            };
            queueSelectionUpdate();
          }, this),
        );
      }, this),
    );
    this.#topLevelContentViewContainerElement.appendChild(topLevelContentRenderControl.containerHtmlElement);
    const renderReactNodeIntoHtmlContainerElement = (element: React.ReactNode, containerElement: HTMLElement): void => {
      const root = createRoot(containerElement);
      root.render(element);
      this.add(
        Disposable(() => {
          root.unmount();
        }),
      );
    };
    renderReactNodeIntoHtmlContainerElement(<SelectionView selectionView$={this.#selectionView$} />, this.#selectionViewContainerElement);
    renderReactNodeIntoHtmlContainerElement(<SearchOverlay searchOverlay$={this.#searchOverlay$} />, this.#searchOverlayContainerElement);
    this.#searchElementContainerElement = document.createElement('div');
    this.#containerHtmlElement.style.position = 'relative';
    this.#containerHtmlElement.append(
      this.#inputTextElementMeasurementElement,
      this.#topLevelContentViewContainerElement,
      this.#selectionViewContainerElement,
      this.#searchOverlayContainerElement,
      this.#inputTextElement,
      this.#searchElementContainerElement,
    );
    let searchContainerStaticViewRectangle$: CurrentValueDistributor<ViewRectangle> | undefined;
    const calculateCurrentSearchContainerStaticViewRectangle = (): ViewRectangle => {
      const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
      const { visibleLeft, visibleRight } = this.#getVisibleLeftAndRight();
      return makeViewRectangle(visibleLeft, visibleTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
    };
    const initialSearchControlConfig = {
      ignoreCase: true,
      ignoreDiacritics: true,
      ignorePunctuation: false,
      ignoreVoids: false,
      searchQueryWordsIndividually: false,
      wholeWords: false,
    };
    this.#searchControl = new SingleParagraphPlainTextSearchControl(this.stateControl, '', initialSearchControlConfig, this.topLevelContentReference);
    this.add(this.#searchControl);
    pipe(
      this.#isSearchElementContainerVisible$,
      skip(1),
      memoConsecutive<boolean>((previous, current) => previous === current),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const isVisible = event.value;
        this.#matchNumberMaybe$(Push(None));
        this.#totalMatchesMaybe$(Push(None));
        if (isVisible) {
          assert(this.#searchElementTrackAllControl === null);
          this.#searchElementTrackAllControl = this.#searchControl.trackAll();
          pipe(
            this.#searchElementTrackAllControl.totalMatches$,
            map((value) => Some(value)),
            subscribe(this.#totalMatchesMaybe$),
          );
        } else {
          assertIsNotNullish(this.#searchElementTrackAllControl);
          this.#searchElementTrackAllControl.dispose();
          this.#searchElementTrackAllControl = null;
        }
      }, this.#searchControl),
    );
    requestAnimationFrameDisposable(() => {
      searchContainerStaticViewRectangle$ = CurrentValueDistributor(calculateCurrentSearchContainerStaticViewRectangle());
      const searchConfigSink = Sink<SearchBoxControlConfig>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const searchBoxControlConfig = event.value;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (searchBoxControlConfig.type !== SearchBoxConfigType.SingleParagraphPlainText) {
          assertUnreachable(searchBoxControlConfig.type);
        }
        const newConfig = searchBoxControlConfig.config;
        this.#searchControl.config = newConfig;
        this.stateControl.queueUpdate(() => {
          // TODO: This is a hack to queue onFinishedUpdating.
        });
      });
      const searchQuery$ = Sink<string>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const query = event.value;
        this.#searchControl.query = query;
        this.stateControl.queueUpdate(() => {
          // TODO: This is a hack to queue onFinishedUpdating.
        });
      });
      renderReactNodeIntoHtmlContainerElement(
        <SearchBox
          config$={searchConfigSink}
          containerStaticViewRectangle$={searchContainerStaticViewRectangle$}
          initialConfig={{
            type: SearchBoxConfigType.SingleParagraphPlainText,
            config: initialSearchControlConfig,
          }}
          isVisible$={this.#isSearchElementContainerVisible$}
          query$={searchQuery$}
          matchNumberMaybe$={this.#matchNumberMaybe$}
          totalMatchesMaybe$={this.#totalMatchesMaybe$}
          inputRef={this.#searchInputRef}
        />,
        this.#searchElementContainerElement,
      );
    }, this);
    pipe(
      fromArray([
        this.#isSearchElementContainerVisible$,
        pipe(
          this.#isSearchElementContainerVisible$,
          map((isVisible) =>
            isVisible
              ? pipe(
                  fromArray([
                    topLevelContentViewContainerElementReactiveResizeObserver.entries$,
                    pipe(
                      fromReactiveValue<[globalThis.Event]>((callback, disposable) =>
                        addWindowEventListener('scroll', callback, disposable, { passive: true }),
                      ),
                      map((args) => args[0]),
                    ),
                  ]),
                  flat()<unknown>,
                  throttle(() => timer(16)),
                )
              : empty$,
          ),
          switchEach,
        ),
      ]),
      flat(),
      subscribe(this.#replaceVisibleSearchResults.bind(this), this),
    );
    this.#containerHtmlElement.style.overflow = 'clip visible';
    if (this.#containerHtmlElement.style.overflow !== 'clip visible') {
      // Old versions of safari do not support 'clip'.
      this.#isOverflowClipNotSupported = true;
      this.#containerHtmlElement.style.overflow = 'hidden visible';
    }
    this.rootHtmlElement.append(this.#containerHtmlElement);
    const topLevelContentViewContainerElementReactiveResizeObserver = new ReactiveResizeObserver();
    this.add(topLevelContentViewContainerElementReactiveResizeObserver);
    pipe(
      fromArray([
        topLevelContentViewContainerElementReactiveResizeObserver.entries$,
        pipe(
          fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
          map((args) => args[0]),
        ),
      ]),
      flat()<unknown>,
      debounce(() => timer(400)),
      map(calculateCurrentSearchContainerStaticViewRectangle),
      memoConsecutive(areViewRectanglesEqual),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        searchContainerStaticViewRectangle$?.(event);
      }, this),
    );
    pipe(
      topLevelContentViewContainerElementReactiveResizeObserver.entries$,
      filterMap((entries) => {
        // TODO.
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i];
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
            return Some(entry.borderBoxSize[0].inlineSize);
          }
        }
        return None;
      }),
      memoConsecutive((lastWidth, currentWidth) => lastWidth === currentWidth),
      debounce(() => timer(400), false, true),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.#relativeParagraphMeasurementCache.clear();
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
          this.stateControl.afterMutationPart$,
          flatMap((message) => fromArray(message.viewDelta.changes)),
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
    addWindowEventListener('keydown', this.#onGlobalKeyDown.bind(this), this);
    addWindowEventListener('keyup', this.#onGlobalKeyUp.bind(this), this);
  }
  openSearch(): void {
    if (!this.#isSearchElementContainerVisible$.currentValue) {
      this.#isSearchElementContainerVisible$(Push(true));
    }
    this.#searchInputRef.current?.select();
  }
  closeSearch(): void {
    if (this.#isSearchElementContainerVisible$.currentValue) {
      this.#isSearchElementContainerVisible$(Push(false));
    }
    this.#inputTextElement.focus({
      preventScroll: true,
    });
  }
  #onInputElementFocus(): void {
    // TODO.
    this.#replaceViewSelectionRanges();
  }
  makePagePointTransformFn(
    pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
  ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
    return (document, _stateControlConfig, _selectionRangeIntention, _range, _point) => {
      // TODO: Use viewport coordinates?
      const paragraphReferences = matita
        .accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference)
        .blockIds.toArray()
        .map(matita.makeBlockReferenceFromBlockId);
      const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
      if (pointMovement === matita.PointMovement.Previous) {
        const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, visibleTop, this.#compareParagraphTopToOffsetTop.bind(this)) - 1);
        const startParagraphReference = paragraphReferences[startIndex];
        return {
          contentReference: matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, startParagraphReference)),
          point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(startParagraphReference, 0),
        };
      }
      const endIndex = Math.min(
        paragraphReferences.length - 1,
        indexOfNearestLessThan(paragraphReferences, visibleBottom, this.#compareParagraphTopToOffsetTop.bind(this)) + 1,
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
          !(point.offset === measuredParagraphLineRange.endOffset && isLineWrapToNextLine && i !== paragraphMeasurement.measuredParagraphLineRanges.length - 1)
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
        const verticalDelta = (i + 1) * cursorPositionAndHeight.height;
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
            pointMovement === matita.PointMovement.Previous ? 0 : matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(document, point)),
          ),
        },
        offsetLeft: cursorPositionAndHeight.position.left,
        didFindVerticalPlacement: false,
      };
    };
  }
  #scrollSelectionIntoViewWhenFinishedUpdating = false;
  #markScrollSelectionIntoViewWhenFinishedUpdating(): void {
    this.#scrollSelectionIntoViewWhenFinishedUpdating = true;
  }
  #isSearchFocused(): boolean {
    return !!this.#searchInputRef.current && document.activeElement === this.#searchInputRef.current;
  }
  #onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
    // TODO: Can't do this with multiple selectionChange$ listeners.
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { previousSelection, data } = event.value;
    if (
      !this.#isDraggingSelection &&
      !(data && !!data[doNotScrollToSelectionAfterChangeDataKey]) &&
      !matita.areSelectionsCoveringSameContent(previousSelection, this.stateControl.stateView.selection)
    ) {
      this.#markScrollSelectionIntoViewWhenFinishedUpdating();
    }
    if (this.stateControl.stateView.selection.selectionRanges.length === 0) {
      if (this.#hasFocusIncludingNotActiveWindow()) {
        this.#inputTextElement.blur();
      }
    } else {
      if (!this.#hasFocusIncludingNotActiveWindow() && !this.#isSearchFocused()) {
        this.#inputTextElement.focus({
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
          (selectionRange) => !cursorWrappedIds.includes(selectionRange.id) && !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine],
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
        );
      }
    } else if (data && !!data[VirtualizedDataKey.ExtendSelectionSoftLineUpDownCursorOffsetLeft]) {
      if (
        newSelection.selectionRanges.some((selectionRange) => selectionRange.data[VirtualizedDataKey.MoveSelectionSoftLineUpDownCursorOffsetLeft] !== undefined)
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
      );
    }
    if (newSelection !== this.stateControl.stateView.selection) {
      this.stateControl.delta.setSelection(newSelection, undefined, { [VirtualizedDataKey.IgnoreRecursiveUpdate]: true });
    }
  }
  #onAfterMutationPart(
    event: Event<matita.AfterMutationPartMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>,
  ): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { updateDataStack } = event.value;
    if (!updateDataStack.some((data) => !!data[doNotScrollToSelectionAfterChangeDataKey])) {
      this.#markScrollSelectionIntoViewWhenFinishedUpdating();
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
    scrollCursorRectIntoView(
      makeViewRectangle(
        cursorPositionAndHeightFromParagraphPoint.position.left,
        cursorPositionAndHeightFromParagraphPoint.position.top,
        0,
        cursorPositionAndHeightFromParagraphPoint.height,
      ),
      this.#getScrollContainer(),
      this.#isElementScrollable,
    );
  }
  #isElementScrollable = (element: Element): boolean => {
    // TODO: Figure this out without forcing style calculation.
    return element === document.documentElement;
  };
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
    // Fix horizontal scroll hidden in safari.
    if (this.#isOverflowClipNotSupported) {
      this.#containerHtmlElement.scrollLeft = 0;
    }
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
    return document.activeElement === this.#inputTextElement;
  }
  #normalizeEventKey(event: KeyboardEvent): string {
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
      return event.key;
    }
    return event.code;
  }
  #modifiers = ['Meta', 'Shift', 'Control', 'Alt'];
  #shortcutKeys: string[] = [
    'KeyA',
    'KeyB',
    'KeyC',
    'KeyD',
    'KeyE',
    'KeyF',
    'KeyG',
    'KeyH',
    'KeyI',
    'KeyJ',
    'KeyK',
    'KeyL',
    'KeyM',
    'KeyN',
    'KeyO',
    'KeyP',
    'KeyQ',
    'KeyR',
    'KeyS',
    'KeyT',
    'KeyU',
    'KeyV',
    'KeyW',
    'KeyX',
    'KeyY',
    'KeyZ',
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'Backspace',
    'Delete',
    'Enter',
    'Escape',
  ];
  #keyDownId = 0;
  #keyDownSet = new Map<string, number>();
  #clearKeys(): void {
    const downKeys = [...this.#keyDownSet.keys()];
    this.#keyDownSet.clear();
    for (const key of downKeys) {
      this.#keyUp$(Push({ key }));
    }
  }
  #markKeyDown(key: string, keyboardEvent?: KeyboardEvent): void {
    this.#keyDownSet.set(key, this.#keyDownId++);
    this.#keyDown$(Push({ key, keyboardEvent }));
  }
  #markKeyUp(key: string, keyboardEvent?: KeyboardEvent): void {
    this.#keyDownSet.delete(key);
    this.#keyUp$(Push({ key, keyboardEvent }));
  }
  #keyDown$ = Distributor<{ key: string; keyboardEvent?: KeyboardEvent }>();
  #keyUp$ = Distributor<{ key: string; keyboardEvent?: KeyboardEvent }>();
  #onGlobalKeyDown(event: KeyboardEvent): void {
    const normalizedKey = this.#normalizeEventKey(event);
    if (platforms.includes(Platform.Apple) && (this.#keyDownSet.has('Meta') || normalizedKey === 'Meta')) {
      this.#clearKeys(); // MacOS track keyup events after Meta is pressed.
    }
    this.#markKeyDown(normalizedKey, event);
    if (!this.#shortcutKeys.includes(normalizedKey)) {
      return;
    }
    const hasMeta = event.metaKey;
    const hasControl = event.ctrlKey;
    const hasAlt = event.altKey;
    const hasShift = event.shiftKey;
    const activeContexts: Context[] = [];
    if (this.#hasFocusIncludingNotActiveWindow() && !this.#isInComposition) {
      activeContexts.push(Context.Editing);
    }
    if (this.#isDraggingSelection) {
      activeContexts.push(Context.DraggingSelection);
    }
    if (this.#isSearchFocused()) {
      activeContexts.push(Context.Searching);
    }
    for (let i = 0; i < this.#keyCommands.length; i++) {
      const keyCommand = this.#keyCommands[i];
      const { key, command, context, platform, cancelKeyEvent } = keyCommand;
      if (key === null || command === null) {
        continue;
      }
      if (!(context == null || satisfiesSelector(activeContexts, context))) {
        continue;
      }
      if (!(platform == null || satisfiesSelector(platforms, platform))) {
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
        const requiredNonModifierKeys = Array.from(parsedKeySet).filter((requiredKey) => !this.#modifiers.includes(requiredKey));
        if (
          !(
            requiredNonModifierKeys.every((requiredNonModifierKey) => normalizedKey === requiredNonModifierKey) &&
            (requiredMeta ? hasMeta : !hasMeta) &&
            (requiredControl ? hasControl : !hasControl) &&
            (requiredAlt ? hasAlt : !hasAlt) &&
            (requiredShift ? hasShift : !hasShift)
          )
        ) {
          continue;
        }
        this.#endSelectionDrag$(Push(undefined));
        this.runCommand({
          commandName: command,
          data: null,
        });
        if (cancelKeyEvent) {
          event.preventDefault();
        }
        break;
      }
    }
  }
  #onGlobalKeyUp(event: KeyboardEvent): void {
    const normalizedKey = this.#normalizeEventKey(event);
    this.#markKeyUp(normalizedKey, event);
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
      this.stateControl.delta.applyUpdate(matita.makeRemoveSelectionContentsUpdateFn(this.stateControl));
    });
  }
  #copySelectionToClipboard(): void {
    throwNotImplemented();
  }
  onConfigChanged(): void {
    throwNotImplemented();
  }
  #isInComposition = 0;
  #onCompositionStart(_event: CompositionEvent): void {
    // TODO: Fix composition.
    this.#endSelectionDrag$(Push(undefined));
    this.#isInComposition++;
  }
  #onCompositionEnd(_event: CompositionEvent): void {
    if (isSafari) {
      // Safari fires keydown events after the composition end event. Wait until they are processed (e.g. "Enter" to finish composition shouldn't split the
      // paragraph)
      setTimeoutDisposable(() => {
        this.#isInComposition--;
      }, 100);
    } else {
      this.#clearKeys();
      this.#isInComposition--;
    }
    this.stateControl.queueUpdate(() => {
      const selection = this.stateControl.stateView.selection;
      this.stateControl.delta.setSelection(
        matita.transformSelectionByTransformingSelectionRanges(
          this.stateControl.stateView.document,
          this.stateControl.stateControlConfig,
          selection,
          (selectionRange) => {
            if (shouldCollapseSelectionRangeInTextCommand(this.stateControl.stateView.document, selectionRange)) {
              return collapseSelectionRangeForwards(this.stateControl.stateView.document, selectionRange);
            }
            return selectionRange;
          },
        ),
      );
      this.#undoControl.forceNextChange(
        (changeType) => changeType === LocalUndoControlLastChangeType.InsertText || changeType === LocalUndoControlLastChangeType.CompositionUpdate,
      );
    });
  }
  #handleCompositionUpdate(startOffset: number, endOffset: number, text: string): void {
    if (/\r|\n/.test(text)) {
      return;
    }
    const paragraphReference = this.#inputElementLastSynchronizedParagraphReference;
    if (!paragraphReference) {
      return;
    }
    // eslint-disable-next-line no-control-regex
    const normalizedText = text.replace(/[\r\x00-\x1f]/g, '');
    const insertTexts: matita.Text<TextConfig>[] = !normalizedText ? [] : [matita.makeText({}, normalizedText)];
    const selectionBefore: { value?: matita.Selection } = {};
    const selectionAfter: { value?: matita.Selection } = {};
    this.stateControl.queueUpdate(
      () => {
        // TODO: Compose at all selection ranges.
        let paragraph: matita.Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
        try {
          paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        } catch (error) {
          if (!(error instanceof matita.BlockNotInBlockStoreError)) {
            throw error;
          }
          return;
        }
        matita.assertIsParagraph(paragraph);
        const paragraphLength = matita.getParagraphLength(paragraph);
        if (startOffset >= paragraphLength) {
          startOffset = paragraphLength;
        }
        if (endOffset >= paragraphLength) {
          endOffset = paragraphLength;
        }
        const removeCount = endOffset - startOffset;
        const startPoint = matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startOffset);
        const contentReference = matita.makeContentReferenceFromContent(
          matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
        );
        const afterSplicePoint = matita.changeParagraphPointOffset(startPoint, startPoint.offset + matita.getLengthOfParagraphInlineNodes(insertTexts));
        const afterSpliceRange = matita.makeRange(contentReference, startPoint, afterSplicePoint, matita.generateId());
        const afterSpliceSelectionRange = matita.makeSelectionRange(
          [afterSpliceRange],
          afterSpliceRange.id,
          afterSpliceRange.id,
          matita.SelectionRangeIntention.Text,
          {},
          matita.generateId(),
        );
        const afterSpliceSelection = matita.makeSelection([afterSpliceSelectionRange]);
        const selectionBeforePoint = matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, endOffset);
        const selectionBeforeRange = matita.makeRange(contentReference, selectionBeforePoint, selectionBeforePoint, matita.generateId());
        const selectionBeforeSelectionRange = matita.makeSelectionRange(
          [selectionBeforeRange],
          selectionBeforeRange.id,
          selectionBeforeRange.id,
          matita.SelectionRangeIntention.Text,
          {},
          matita.generateId(),
        );
        const selectionAfterPoint = afterSplicePoint;
        const selectionAfterRange = matita.makeRange(contentReference, selectionAfterPoint, selectionAfterPoint, matita.generateId());
        const selectionAfterSelectionRange = matita.makeSelectionRange(
          [selectionAfterRange],
          selectionAfterRange.id,
          selectionAfterRange.id,
          matita.SelectionRangeIntention.Text,
          {},
          matita.generateId(),
        );
        selectionBefore.value = matita.makeSelection([selectionBeforeSelectionRange]);
        selectionAfter.value = matita.makeSelection([selectionAfterSelectionRange]);
        this.stateControl.delta.applyMutation(matita.makeSpliceParagraphMutation(startPoint, removeCount, insertTexts));
        this.stateControl.delta.setSelection(afterSpliceSelection);
      },
      {
        [matita.RedoUndoUpdateKey.CompositionUpdate]: true,
        [matita.RedoUndoUpdateKey.SelectionBefore]: selectionBefore,
        [matita.RedoUndoUpdateKey.SelectionAfter]: selectionAfter,
      },
    );
  }
  #getTextFromInputEvent(event: InputEvent): string {
    let text = '';
    if (event.dataTransfer) {
      text = event.dataTransfer.getData('text/plain');
    }
    if (!text) {
      text = event.data || '';
    }
    return text;
  }
  #getDomInputTextFromParagraph(paragraph: matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig>): string {
    return (
      paragraph.children
        .map((child) => {
          matita.assertIsText(child);
          return child.text;
        })
        .join('')
        // Browser inserts NBSP instead of spaces.
        .replace(/ /g, '\xa0')
    );
  }
  #onInputElementBeforeInput(event: InputEvent): void {
    this.#endSelectionDrag$(Push(undefined));
    // We only use the beforeinput event for insertions. We don't want to deal with native ranges so we try to avoid it.
    const { inputType } = event;
    if (
      inputType === 'insertCompositionText' ||
      // Safari implements the old spec.
      (isSafari && (inputType === 'deleteCompositionText' || inputType === 'insertFromComposition' || inputType === 'deleteByComposition'))
    ) {
      const text = this.#getTextFromInputEvent(event);
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length !== 1) {
        return;
      }
      const { startOffset, endOffset } = targetRanges[0];
      this.#handleCompositionUpdate(startOffset, endOffset, text);
      return;
    }
    if (inputType === 'insertText' || inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || inputType === 'insertReplacementText') {
      if (inputType !== 'insertText') {
        // Don't prevent this to preserve composition.
        event.preventDefault();
      }
      const text = this.#getTextFromInputEvent(event);
      if (!text) {
        return;
      }
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length > 1) {
        return;
      }
      // TODO.
      replaceTextElsewhere: if (((!isSafari && inputType === 'insertText') || inputType === 'insertReplacementText') && targetRanges.length === 1) {
        // We handle 'insertText' as well, as chrome & firefox use the 'insertText' input type on compositions where there was no compositionupdate.
        // (Note safari uses 'insertReplacementText' for such composition cases, and handling 'insertText' here leads to bad behavior in compositions).
        if (!this.#inputElementContainedInSingleParagraph) {
          break replaceTextElsewhere;
        }
        const paragraphReference = this.#inputElementLastSynchronizedParagraphReference;
        if (!paragraphReference) {
          return;
        }
        const { startContainer, startOffset, endContainer, endOffset } = targetRanges[0];
        if (startOffset === endOffset) {
          break replaceTextElsewhere;
        }
        if (
          !text ||
          this.#inputTextElement.childNodes.length !== 1 ||
          !(this.#inputTextElement.childNodes[0] instanceof Text) ||
          startContainer !== this.#inputTextElement.childNodes[0] ||
          endContainer !== this.#inputTextElement.childNodes[0]
        ) {
          break replaceTextElsewhere;
        }
        const nativeSelection = getSelection();
        if (nativeSelection?.rangeCount !== 1) {
          break replaceTextElsewhere;
        }
        const currentNativeRange = nativeSelection.getRangeAt(0);
        if (
          currentNativeRange.startContainer !== this.#inputTextElement.childNodes[0] ||
          currentNativeRange.endContainer !== this.#inputTextElement.childNodes[0]
        ) {
          break replaceTextElsewhere;
        }
        try {
          matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        } catch (error) {
          if (!(error instanceof matita.BlockNotInBlockStoreError)) {
            throw error;
          }
          return;
        }
        const replacementContentFragment = matita.makeContentFragment(
          text.split(/\r?\n/g).map((line) => {
            const lineText = line.replaceAll('\r', '');
            return matita.makeContentFragmentParagraph(matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText({}, lineText)], matita.generateId()));
          }),
        );
        const originalTextContent = this.#inputTextElement.childNodes[0].nodeValue || '';
        this.stateControl.queueUpdate(
          () => {
            if (
              inputType === 'insertText' &&
              (this.stateControl.stateView.selection.selectionRanges.length > 1 ||
                (this.stateControl.stateView.selection.selectionRanges.length === 1 &&
                  shouldCollapseSelectionRangeInTextCommand(this.stateControl.stateView.document, this.stateControl.stateView.selection.selectionRanges[0])))
            ) {
              // 'insertText' only is handled using the native selection when it is collapsed, as this is for compatibility with composition in chrome/firefox.
              this.stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, replacementContentFragment));
              return;
            }
            let paragraph: matita.Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
            try {
              paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            } catch (error) {
              if (!(error instanceof matita.BlockNotInBlockStoreError)) {
                throw error;
              }
              this.stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, replacementContentFragment));
              return;
            }
            matita.assertIsParagraph(paragraph);
            const currentTextContent = this.#getDomInputTextFromParagraph(paragraph);
            if (originalTextContent !== currentTextContent) {
              this.stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, replacementContentFragment));
              return;
            }
            assert(startOffset <= endOffset);
            assert(endOffset <= matita.getParagraphLength(paragraph));
            const range = matita.makeRange(
              matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference)),
              matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startOffset),
              matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, endOffset),
              matita.generateId(),
            );
            this.stateControl.delta.applyUpdate(
              matita.makeInsertContentFragmentAtRangeUpdateFn(this.stateControl, range, replacementContentFragment, undefined, (selectionRange) => {
                if (selectionRange.ranges.length > 1) {
                  return false;
                }
                const currentRange = selectionRange.ranges[0];
                if (
                  !matita.isParagraphPoint(currentRange.startPoint) ||
                  !matita.isParagraphPoint(currentRange.endPoint) ||
                  !matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(currentRange.startPoint), paragraphReference) ||
                  !matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(currentRange.endPoint), paragraphReference)
                ) {
                  return false;
                }
                const firstCurrentRangeOffset = Math.min(currentRange.startPoint.offset, currentRange.endPoint.offset);
                const secondCurrentRangeOffset = Math.max(currentRange.startPoint.offset, currentRange.endPoint.offset);
                return startOffset <= firstCurrentRangeOffset && secondCurrentRangeOffset <= endOffset;
              }),
            );
          },
          inputType === 'insertText' ? { [matita.RedoUndoUpdateKey.InsertText]: true } : {},
        );
        return;
      }
      if (inputType === 'insertText') {
        this.runCommand(makeInsertTextCommandInfo(text));
        return;
      }
      if (inputType === 'insertFromPaste') {
        this.runCommand(makePasteTextCommandInfo(text));
        return;
      }
      if (inputType === 'insertFromDrop') {
        this.runCommand(makeDropTextCommandInfo(text));
        return;
      }
      // Don't insert replacement text unless handled above.
      return;
    }
    event.preventDefault();
    if (inputType === 'insertParagraph') {
      this.runCommand({
        commandName: StandardCommand.SplitParagraph,
        data: null,
      });
      return;
    }
    if (inputType === 'insertLineBreak') {
      this.runCommand({
        commandName: StandardCommand.InsertLineBreak,
        data: null,
      });
    }
  }
  #measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): AbsoluteParagraphMeasurement {
    // TODO: Graphemes instead of characters.
    // TODO: Rtl.
    // Fix horizontal scroll hidden in safari.
    if (this.#isOverflowClipNotSupported) {
      this.#containerHtmlElement.scrollLeft = 0;
    }
    const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const containerHtmlElement = paragraphRenderControl.containerHtmlElement;
    const containerHtmlElementBoundingRect = containerHtmlElement.getBoundingClientRect();
    const shiftCachedMeasurement = (cachedMeasurement: RelativeParagraphMeasureCacheValue): AbsoluteParagraphMeasurement => {
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
        // In Safari, the first wrapped character's bounding box envelops from the previous character (before the wrap) to the current character (after
        // the wrap), i.e. double height and full line width.
        const isSafariFirstWrappedCharacter =
          isSafari &&
          (characterRectangle.width > containerHtmlElementBoundingRect.width / 2 ||
            (previousCharacterRectangle !== null &&
              previousCharacterRectangle.width > 1 &&
              characterRectangle.left - previousCharacterRectangle.right < previousCharacterRectangle.width * 2 &&
              characterRectangle.height > previousCharacterRectangle.height));
        if (!isPreviousLineBreak && !isSafariFirstWrappedCharacter) {
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
            measuredParagraphLineRange.boundingRect = makeViewRectangle(expandedLeft, expandedTop, expandedRight - expandedLeft, expandedBottom - expandedTop);
            measuredParagraphLineRange.characterRectangles.push(characterRectangle);
            measuredParagraphLineRange.endOffset = textStart + j + 1;
            continue;
          }
        }
        isPreviousLineBreak = false;
        let fixedCharacterRectangle = characterRectangle;
        if (isSafariFirstWrappedCharacter) {
          const fixedHeight = fixedCharacterRectangle.height / 2;
          fixedCharacterRectangle = makeViewRectangle(characterRectangle.left, characterRectangle.top + fixedHeight, 16, fixedHeight);
        }
        measuredParagraphLineRanges.push({
          boundingRect: fixedCharacterRectangle,
          characterRectangles: [fixedCharacterRectangle],
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
    // Fix horizontal scroll hidden in safari.
    if (this.#isOverflowClipNotSupported) {
      this.#containerHtmlElement.scrollLeft = 0;
    }
    const paragraphNodeControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const boundingBox = paragraphNodeControl.containerHtmlElement.getBoundingClientRect();
    return boundingBox.top - needle;
  }
  #calculatePositionFromViewPosition(viewPosition: ViewPosition): HitPosition | null {
    const hitElements = document.elementsFromPoint(viewPosition.left, viewPosition.top);
    const firstContentHitElement = hitElements.find(
      (hitElement) => hitElement === this.#topLevelContentViewContainerElement || this.#topLevelContentViewContainerElement.contains(hitElement),
    );
    let paragraphReferences: matita.BlockReference[];
    const nodeRenderControl = firstContentHitElement ? findClosestNodeRenderControl(this.viewControl, firstContentHitElement) : null;
    if (!nodeRenderControl) {
      // TODO.
      paragraphReferences = matita
        .accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference)
        .blockIds.toArray()
        .map(matita.makeBlockReferenceFromBlockId);
    } else if (nodeRenderControl instanceof VirtualizedParagraphRenderControl) {
      const { paragraphReference } = nodeRenderControl;
      const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      paragraphReferences = [paragraphReference];
    } else {
      // TODO.
      paragraphReferences = matita
        .accessContentFromContentReference(this.stateControl.stateView.document, nodeRenderControl.contentReference)
        .blockIds.toArray()
        .map(matita.makeBlockReferenceFromBlockId);
    }
    const startIndex = Math.max(0, indexOfNearestLessThan(paragraphReferences, viewPosition.top, this.#compareParagraphTopToOffsetTop.bind(this)) - 1);
    const endIndex = Math.min(
      paragraphReferences.length - 1,
      indexOfNearestLessThan(paragraphReferences, viewPosition.top, this.#compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
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
      const { startOffset, characterRectangles, boundingRect } = measuredParagraphLineRange;
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
          isPastPreviousCharacterHalfPoint: false,
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
        const isPastPreviousCharacterHalfPoint = viewPosition.left > (characterRectangle.right + previousCharacterRightWithoutInfinity) / 2;
        const pointStartOffset = startOffset + j + (isPastPreviousCharacterHalfPoint ? 1 : 0);
        return {
          pointWithContentReference: {
            contentReference: matita.makeContentReferenceFromContent(
              matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
            ),
            point: matita.makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, pointStartOffset),
          },
          isPastPreviousCharacterHalfPoint,
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
  #getScrollContainer(): HTMLElement {
    // Horizontal overflow is set to hidden, but it can still be set programmatically (or by the browser). We should be using overflow clip, but it isn't
    // supported in safari <16. We reset it here as calling this method indicates that we are going to measure scroll offsets. This is a hack.
    if (this.#isOverflowClipNotSupported) {
      this.#containerHtmlElement.scrollLeft = 0;
    }
    return findScrollContainer(this.#topLevelContentViewContainerElement, this.#isElementScrollable);
  }
  #getVisibleTopAndBottom(): { visibleTop: number; visibleBottom: number } {
    // TODO.
    return {
      visibleTop: 0,
      visibleBottom: window.innerHeight,
    };
  }
  #getVisibleLeftAndRight(): { visibleLeft: number; visibleRight: number } {
    // TODO.
    return {
      visibleLeft: 0,
      visibleRight: window.innerWidth,
    };
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
    if (isSafari) {
      this.#syncInputElement();
      if (this.#isSearchElementContainerVisible$.currentValue) {
        this.#replaceVisibleSearchResults();
      }
      this.#replaceViewSelectionRanges();
      if (this.#scrollSelectionIntoViewWhenFinishedUpdating) {
        this.#scrollSelectionIntoViewWhenFinishedUpdating = false;
        this.#scrollSelectionIntoView();
      }
    } else {
      if (this.#scrollSelectionIntoViewWhenFinishedUpdating) {
        this.#scrollSelectionIntoViewWhenFinishedUpdating = false;
        this.#scrollSelectionIntoView();
      }
      if (this.#isSearchElementContainerVisible$.currentValue) {
        this.#replaceVisibleSearchResults();
      }
      this.#replaceViewSelectionRanges();
      this.#syncInputElement();
    }
  }
  #syncInputElement(): void {
    if (!this.#hasFocusIncludingNotActiveWindow()) {
      return;
    }
    // Hidden input text for composition.
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (!focusSelectionRange) {
      this.#inputElementLastSynchronizedParagraphReference = null;
      this.#inputTextElement.replaceChildren();
      return;
    }
    const focusRange = focusSelectionRange.ranges.find((range) => range.id === focusSelectionRange.focusRangeId);
    assertIsNotNullish(focusRange);
    const anchorPoint = matita.getAnchorPointFromRange(focusRange);
    const focusPoint = matita.getFocusPointFromRange(focusRange);
    matita.assertIsParagraphPoint(anchorPoint);
    matita.assertIsParagraphPoint(focusPoint);
    const paragraph = matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, focusPoint);
    this.#inputElementLastSynchronizedParagraphReference = matita.makeBlockReferenceFromParagraphPoint(focusPoint);
    const inputText = this.#getDomInputTextFromParagraph(paragraph);
    const direction = matita.getRangeDirection(this.stateControl.stateView.document, focusRange);
    assert(direction === matita.RangeDirection.Backwards || direction === matita.RangeDirection.Forwards || direction === matita.RangeDirection.NeutralText);
    if (!this.#isInComposition) {
      let rangeStartOffset: number;
      let rangeEndOffset: number;
      if (matita.areParagraphPointsAtSameParagraph(anchorPoint, focusPoint)) {
        this.#inputElementContainedInSingleParagraph = true;
        if (direction === matita.RangeDirection.Backwards) {
          rangeStartOffset = focusPoint.offset;
          rangeEndOffset = anchorPoint.offset;
        } else {
          rangeStartOffset = anchorPoint.offset;
          rangeEndOffset = focusPoint.offset;
        }
      } else {
        this.#inputElementContainedInSingleParagraph = false;
        if (direction === matita.RangeDirection.Backwards) {
          rangeStartOffset = focusPoint.offset;
          rangeEndOffset = inputText.length;
        } else {
          rangeStartOffset = 0;
          rangeEndOffset = focusPoint.offset;
        }
      }
      if (
        !(this.#inputTextElement.childNodes.length === 0 && inputText === '') &&
        !(
          this.#inputTextElement.childNodes.length === 1 &&
          this.#inputTextElement.childNodes[0] instanceof Text &&
          this.#inputTextElement.childNodes[0].nodeValue === inputText
        )
      ) {
        if (inputText === '') {
          this.#inputTextElement.replaceChildren();
        } else {
          const textNode = document.createTextNode(inputText);
          this.#inputTextElement.replaceChildren(textNode);
        }
      }
      let node: Node;
      if (inputText === '') {
        node = this.#inputTextElement;
      } else {
        node = this.#inputTextElement.childNodes[0];
      }
      const nativeRange = document.createRange();
      nativeRange.setStart(node, rangeStartOffset);
      nativeRange.setEnd(node, rangeEndOffset);
      const nativeSelection = getSelection();
      if (!nativeSelection) {
        return;
      }
      updateSelection: {
        if (nativeSelection.rangeCount === 1) {
          const currentNativeRange = nativeSelection.getRangeAt(0);
          if (
            currentNativeRange.startContainer === node &&
            currentNativeRange.startOffset === rangeStartOffset &&
            currentNativeRange.endContainer === node &&
            currentNativeRange.endOffset === rangeEndOffset
          ) {
            break updateSelection;
          }
        }
        if (nativeSelection.rangeCount > 1) {
          nativeSelection.removeAllRanges();
        }
        nativeSelection.setBaseAndExtent(node, rangeStartOffset, node, rangeEndOffset);
      }
    }
  }
  #replaceVisibleSearchResults(): void {
    if (!this.#isSearchElementContainerVisible$.currentValue) {
      this.#searchOverlay$(
        Push({
          matchInfos: [],
        }),
      );
      return;
    }
    const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
    const { relativeOffsetLeft, relativeOffsetTop } = this.#calculateRelativeOffsets();
    const marginTopBottom = this.#getBufferMarginTopBottom();
    const accessParagraphReferenceAtIndex = (index: number) => {
      return matita.makeBlockReferenceFromBlock(
        matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference, index),
      );
    };
    const numParagraphReferences = matita.getNumberOfBlocksInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
    const startIndex = Math.max(
      0,
      indexOfNearestLessThanDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleTop - marginTopBottom,
        this.#compareParagraphTopToOffsetTop.bind(this),
      ) - 1,
    );
    const endIndex = Math.min(
      numParagraphReferences - 1,
      indexOfNearestLessThanDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleBottom + marginTopBottom,
        this.#compareParagraphTopToOffsetTop.bind(this),
        startIndex,
      ) + 1,
    );
    const matchInfos: SelectionOverlayMatchInfo[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const paragraphMatches = this.#searchControl.getMatchesForParagraphAtBlockReference(paragraphReference);
      for (let i = 0; i < paragraphMatches.matches.length; i++) {
        const match = paragraphMatches.matches[i];
        const { startOffset, endOffset } = match;
        const viewRangeInfos = this.#calculateViewRangeInfosForParagraphAtBlockReference(
          paragraphReference,
          startOffset,
          endOffset,
          true,
          relativeOffsetLeft,
          relativeOffsetTop,
        );
        matchInfos.push({
          viewRangeInfos,
          hasFocus: false,
        });
      }
    }
    this.#searchOverlay$(
      Push({
        matchInfos,
      }),
    );
  }
  #virtualSelectionDisposable: Disposable | null = null;
  // TODO: Deduplicate calling this method.
  #replaceViewSelectionRanges(): void {
    this.#virtualSelectionDisposable?.dispose();
    const virtualSelectionDisposable = Disposable();
    this.#virtualSelectionDisposable = virtualSelectionDisposable;
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    const { selectionRanges } = this.stateControl.stateView.selection;
    if (selectionRanges.length === 0) {
      this.#selectionView$(
        Push({
          viewCursorAndRangeInfos: {
            viewCursorAndRangeInfosForSelectionRanges: [],
          },
        }),
      );
      return;
    }
    const viewCursorAndRangeInfosForSelectionRangeSources = selectionRanges.map((selectionRange) => {
      assertIsNotNullish(focusSelectionRange);
      const viewCursorAndRangeInfosForSelectionRange$ = this.#makeViewCursorAndRangeInfosForSelectionRange(
        selectionRange,
        selectionRange.id === focusSelectionRange.id,
        virtualSelectionDisposable,
      );
      return viewCursorAndRangeInfosForSelectionRange$;
    });
    const selectionViewMessage$ = pipe(
      combine(viewCursorAndRangeInfosForSelectionRangeSources),
      map(
        (viewCursorAndRangeInfosForSelectionRanges): SelectionViewMessage => ({
          viewCursorAndRangeInfos: {
            viewCursorAndRangeInfosForSelectionRanges,
          },
        }),
      ),
    );
    selectionViewMessage$(this.#selectionView$);
  }
  #makeViewCursorAndRangeInfosForSelectionRange(
    selectionRange: matita.SelectionRange,
    isFocusSelectionRange: boolean,
    disposable: Disposable,
  ): Source<ViewCursorAndRangeInfosForSelectionRange> {
    const viewCursorAndRangeInfoForRangeSources = selectionRange.ranges.map((range) => {
      const viewCursorAndRangeInfosForRange$ = this.#makeViewCursorAndRangeInfosForRange(
        range,
        range.id === selectionRange.anchorRangeId,
        range.id === selectionRange.focusRangeId,
        isFocusSelectionRange,
        !!selectionRange.data[VirtualizedDataKey.LineWrapFocusCursorWrapToNextLine],
        disposable,
      );
      return viewCursorAndRangeInfosForRange$;
    });
    return pipe(
      combine(viewCursorAndRangeInfoForRangeSources),
      map((viewCursorAndRangeInfosForRanges) => ({
        viewCursorAndRangeInfosForRanges,
        selectionRangeId: selectionRange.id,
        hasFocus: this.#hasFocus(),
        isInComposition: this.#isInComposition > 0,
        isDraggingSelection: this.#isDraggingSelection,
      })),
    );
  }
  #calculateRelativeOffsets(): { relativeOffsetLeft: number; relativeOffsetTop: number } {
    const scrollContainer = this.#getScrollContainer();
    const { visibleLeft } = this.#getVisibleLeftAndRight();
    const { visibleTop } = this.#getVisibleTopAndBottom();
    const relativeOffsetLeft = scrollContainer.scrollLeft + visibleLeft;
    const relativeOffsetTop = scrollContainer.scrollTop + visibleTop;
    return {
      relativeOffsetLeft,
      relativeOffsetTop,
    };
  }
  #calculateViewRangeInfosForParagraphAtBlockReference(
    paragraphReference: matita.BlockReference,
    includedParagraphStartOffset: number,
    includedParagraphEndOffset: number,
    isLastParagraphInRange: boolean,
    relativeOffsetLeft: number,
    relativeOffsetTop: number,
  ): ViewRangeInfo[] {
    const defaultVisibleLineBreakPadding = 8;
    const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
    const viewRangeInfos: ViewRangeInfo[] = [];
    for (let j = 0; j < paragraphMeasurement.measuredParagraphLineRanges.length; j++) {
      const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[j];
      const includedLineStartOffset = Math.max(measuredParagraphLineRange.startOffset, includedParagraphStartOffset);
      const includedLineEndOffset = Math.min(measuredParagraphLineRange.endOffset, includedParagraphEndOffset);
      if (includedLineStartOffset > measuredParagraphLineRange.endOffset || includedLineEndOffset < measuredParagraphLineRange.startOffset) {
        continue;
      }
      const hasVisibleLineBreakPaddingIfEndOfLine =
        (includedLineEndOffset === measuredParagraphLineRange.endOffset &&
          measuredParagraphLineRange.endsWithLineBreak &&
          !(includedLineEndOffset === includedParagraphEndOffset && isLastParagraphInRange)) ||
        (includedLineEndOffset === includedParagraphEndOffset && !isLastParagraphInRange);
      if (includedLineStartOffset === measuredParagraphLineRange.endOffset) {
        if (hasVisibleLineBreakPaddingIfEndOfLine) {
          let lineRect: ViewRectangle;
          if (measuredParagraphLineRange.characterRectangles.length === 0) {
            lineRect = makeViewRectangle(
              measuredParagraphLineRange.boundingRect.left + relativeOffsetLeft,
              measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
              defaultVisibleLineBreakPadding,
              measuredParagraphLineRange.boundingRect.height,
            );
          } else {
            const lastCharacterBoundingRect = measuredParagraphLineRange.characterRectangles[measuredParagraphLineRange.characterRectangles.length - 1];
            lineRect = makeViewRectangle(
              lastCharacterBoundingRect.right + relativeOffsetLeft,
              lastCharacterBoundingRect.top + relativeOffsetTop,
              defaultVisibleLineBreakPadding,
              lastCharacterBoundingRect.height,
            );
          }
          viewRangeInfos.push({
            rectangle: lineRect,
            paragraphLineIndex: j,
            startOffset: 0,
            endOffset: 0,
            paragraphReference,
          });
        }
        continue;
      }
      const lineRectLeft =
        (includedLineStartOffset === measuredParagraphLineRange.endOffset
          ? measuredParagraphLineRange.characterRectangles[includedLineStartOffset - measuredParagraphLineRange.startOffset - 1].right
          : measuredParagraphLineRange.characterRectangles[includedLineStartOffset - measuredParagraphLineRange.startOffset].left) + relativeOffsetLeft;
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
      viewRangeInfos.push({
        rectangle: makeViewRectangle(lineRectLeft, lineRectTop, lineRectWidth, lineRectHeight),
        paragraphLineIndex: j,
        startOffset: includedLineStartOffset,
        endOffset: includedLineEndOffset,
        paragraphReference,
      });
    }
    return viewRangeInfos;
  }
  #getBufferMarginTopBottom(): number {
    return Math.min(300, window.innerHeight);
  }
  // TODO: check works when removing paragraphs?
  #makeViewCursorAndRangeInfosForRange(
    range: matita.Range,
    isAnchor: boolean,
    isFocus: boolean,
    isFocusSelectionRange: boolean,
    isLineWrapFocusCursorWrapToNextLine: boolean,
    disposable: Disposable,
  ): Source<ViewCursorAndRangeInfosForRange> {
    const { contentReference } = range;
    const direction = matita.getRangeDirection(this.stateControl.stateView.document, range);
    assert(direction === matita.RangeDirection.Backwards || direction === matita.RangeDirection.Forwards || direction === matita.RangeDirection.NeutralText);
    const firstPoint = direction === matita.RangeDirection.Backwards ? range.endPoint : range.startPoint;
    const lastPoint = direction === matita.RangeDirection.Backwards ? range.startPoint : range.endPoint;
    matita.assertIsParagraphPoint(firstPoint);
    matita.assertIsParagraphPoint(lastPoint);
    const firstParagraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
    const lastParagraphReference = matita.makeBlockReferenceFromParagraphPoint(lastPoint);
    const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, firstParagraphReference);
    const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, lastParagraphReference);
    const observedParagraphReferences: matita.BlockReference[] = [];
    const observingTargets = new Set<HTMLElement>();
    for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, contentReference, i);
      matita.assertIsParagraph(paragraph);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      observedParagraphReferences.push(paragraphReference);
    }
    const marginTopBottom = this.#getBufferMarginTopBottom();
    const makeIntersectionObserver = (): ReactiveIntersectionObserver => {
      const intersectionObserver = new ReactiveIntersectionObserver({
        rootMargin: `${marginTopBottom}px 0px`,
      });
      disposable.add(intersectionObserver);
      return intersectionObserver;
    };
    let selectionIntersectionObserver = makeIntersectionObserver();
    const observeParagraphs = (): void => {
      for (let i = 0; i < observedParagraphReferences.length; i++) {
        const paragraphReference = observedParagraphReferences[i];
        const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
        const target = paragraphRenderControl.containerHtmlElement;
        selectionIntersectionObserver.observe(target);
        observingTargets.add(target);
      }
      pipe(
        selectionIntersectionObserver.entries$,
        skip(1),
        subscribe((event) => {
          if (event.type !== PushType) {
            throwUnreachable();
          }
          const entries = event.value;
          const newRenderedViewParagraphInfos = viewCursorAndRangeInfosForRange$.currentValue.viewParagraphInfos.slice();
          entries.forEach((entry) => {
            const target = entry.target as HTMLElement;
            if (!observingTargets.has(target)) {
              return;
            }
            const paragraphRenderControl = this.htmlElementToNodeRenderControlMap.get(target);
            if (!(paragraphRenderControl instanceof VirtualizedParagraphRenderControl)) {
              return;
            }
            const { paragraphReference } = paragraphRenderControl;
            const currentRenderedIndex = newRenderedViewParagraphInfos.findIndex((renderedViewParagraphInfo) => {
              return matita.areBlockReferencesAtSameBlock(renderedViewParagraphInfo.paragraphReference, paragraphReference);
            });
            if (!entry.isIntersecting) {
              if (currentRenderedIndex === -1) {
                return;
              }
              newRenderedViewParagraphInfos.splice(currentRenderedIndex, 1);
              return;
            }
            const { relativeOffsetLeft, relativeOffsetTop } = this.#calculateRelativeOffsets();
            const viewRangeInfos = calculateViewRangeInfosForParagraphAtIndex(
              observedParagraphReferences.findIndex((observedParagraphReference) => {
                return matita.areBlockReferencesAtSameBlock(observedParagraphReference, paragraphReference);
              }),
              relativeOffsetLeft,
              relativeOffsetTop,
            );
            const viewCursorInfos: ViewCursorInfo[] = [];
            if (isFocus && matita.areBlockReferencesAtSameBlock(paragraphReference, focusParagraphReference)) {
              viewCursorInfos.push(calculateViewCursorInfoForFocusPoint(relativeOffsetLeft, relativeOffsetTop));
            }
            const newViewParagraphInfo: ViewCursorAndRangeInfosForParagraphInRange = {
              paragraphReference,
              viewRangeInfos,
              viewCursorInfos,
            };
            if (currentRenderedIndex === -1) {
              newRenderedViewParagraphInfos.push(newViewParagraphInfo);
            } else {
              newRenderedViewParagraphInfos[currentRenderedIndex] = newViewParagraphInfo;
            }
          });
          viewCursorAndRangeInfosForRange$(Push({ viewParagraphInfos: newRenderedViewParagraphInfos }));
        }, disposable),
      );
    };
    observeParagraphs();
    // Intersection observer doesn't track correctly, so fix when scroll stops.
    pipe(
      fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
      map((args) => args[0]),
      debounce(() => timer(100)),
      subscribe((event) => {
        assert(event.type === PushType);
        viewCursorAndRangeInfosForRange$(Push(calculateViewCursorAndRangeInfosForVisibleParagraphsManually()));
        selectionIntersectionObserver.dispose();
        selectionIntersectionObserver = makeIntersectionObserver();
        observeParagraphs();
      }, disposable),
    );
    const calculateViewRangeInfosForParagraphAtIndex = (
      observedParagraphIndex: number,
      relativeOffsetLeft: number,
      relativeOffsetTop: number,
    ): ViewRangeInfo[] => {
      const paragraphReference = observedParagraphReferences[observedParagraphIndex];
      const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
      const i = firstParagraphIndex + observedParagraphIndex;
      matita.assertIsParagraph(paragraph);
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
      return this.#calculateViewRangeInfosForParagraphAtBlockReference(
        paragraphReference,
        includedParagraphStartOffset,
        includedParagraphEndOffset,
        i === lastParagraphIndex,
        relativeOffsetLeft,
        relativeOffsetTop,
      );
    };
    const focusPoint = matita.getFocusPointFromRange(range);
    matita.assertIsParagraphPoint(focusPoint);
    const focusParagraphReference = matita.makeBlockReferenceFromParagraphPoint(focusPoint);
    const setInputElementPosition = (cursorPositionAndHeight: { position: ViewPosition; height: number }, relativeOffsetTop: number): void => {
      const nativeSelection = getSelection();
      if (!nativeSelection || nativeSelection.rangeCount === 0) {
        return;
      }
      const anchorPoint = matita.getAnchorPointFromRange(range);
      matita.assertIsParagraphPoint(anchorPoint);
      const anchorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(
        anchorPoint,
        direction === matita.RangeDirection.NeutralText ? isLineWrapFocusCursorWrapToNextLine : false,
      );
      const minTop = Math.min(cursorPositionAndHeight.position.top, anchorPositionAndHeight.position.top);
      const maxBottom = Math.max(
        cursorPositionAndHeight.position.top + cursorPositionAndHeight.height,
        anchorPositionAndHeight.position.top + anchorPositionAndHeight.height,
      );
      const fontSize = Math.min(maxBottom - minTop, 40);
      this.#inputTextElementMeasurementElement.style.fontSize = `${fontSize}px`;
      const focusParagraph = matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, focusPoint);
      const textNode = document.createTextNode(this.#getDomInputTextFromParagraph(focusParagraph));
      this.#inputTextElementMeasurementElement.replaceChildren(textNode);
      const measureRange = document.createRange();
      measureRange.setStart(textNode, focusPoint.offset);
      measureRange.setEnd(textNode, focusPoint.offset);
      const measureRangeBoundingRect = measureRange.getBoundingClientRect();
      if (direction === matita.RangeDirection.Backwards) {
        this.#inputTextElement.style.top = `${minTop + relativeOffsetTop}px`;
      } else {
        this.#inputTextElement.style.top = `${maxBottom + relativeOffsetTop - fontSize}px`;
      }
      // Before we shifted left by fontSize because on macOS the composition dropdown needs to have space to the right at the end of the line, otherwise it
      // will glitch elsewhere. This introduces more issues (e.g. long press word selection not matching up), so we don't do this anymore.
      this.#inputTextElement.style.left = `${cursorPositionAndHeight.position.left - measureRangeBoundingRect.left /* - fontSize */}px`;
      this.#inputTextElement.style.fontSize = `${fontSize}px`;
    };
    let setInputElementPositionDisposable: Disposable | null = null;
    const queueSetInputElementPosition = (cursorPositionAndHeight: { position: ViewPosition; height: number }, relativeOffsetTop: number): void => {
      if (setInputElementPositionDisposable !== null) {
        setInputElementPositionDisposable.dispose();
      }
      setInputElementPositionDisposable = Disposable();
      queueMicrotaskDisposable(() => setInputElementPosition(cursorPositionAndHeight, relativeOffsetTop), disposable);
    };
    const calculateViewCursorInfoForFocusPoint = (relativeOffsetLeft: number, relativeOffsetTop: number): ViewCursorInfo => {
      const cursorOffset = focusPoint.offset;
      const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPoint(focusPoint, isLineWrapFocusCursorWrapToNextLine);
      const viewCursorInfo: ViewCursorInfo = {
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
      };
      // TODO: Refactor so this function is pure?
      if (isFocusSelectionRange) {
        queueSetInputElementPosition(cursorPositionAndHeight, relativeOffsetTop);
      }
      return viewCursorInfo;
    };
    const calculateViewCursorAndRangeInfosForKnownVisibleParagraphs = (visibleStartIndex: number, visibleEndIndex: number): ViewCursorAndRangeInfosForRange => {
      const { relativeOffsetLeft, relativeOffsetTop } = this.#calculateRelativeOffsets();
      const viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[] = [];
      if (direction === matita.RangeDirection.NeutralText) {
        const viewCursorInfo = calculateViewCursorInfoForFocusPoint(relativeOffsetLeft, relativeOffsetTop);
        viewParagraphInfos.push({
          paragraphReference: focusParagraphReference,
          viewRangeInfos: [],
          viewCursorInfos: [viewCursorInfo],
        });
      } else {
        for (let i = visibleStartIndex; i <= visibleEndIndex; i++) {
          const paragraphReference = observedParagraphReferences[i];
          const viewRangeInfos = calculateViewRangeInfosForParagraphAtIndex(i, relativeOffsetLeft, relativeOffsetTop);
          const viewCursorInfos: ViewCursorInfo[] = [];
          if (isFocus && matita.areBlockReferencesAtSameBlock(paragraphReference, focusParagraphReference)) {
            viewCursorInfos.push(calculateViewCursorInfoForFocusPoint(relativeOffsetLeft, relativeOffsetTop));
          }
          viewParagraphInfos.push({
            paragraphReference,
            viewRangeInfos,
            viewCursorInfos,
          });
        }
      }
      return {
        viewParagraphInfos,
      };
    };
    const calculateViewCursorAndRangeInfosForVisibleParagraphsManually = (): ViewCursorAndRangeInfosForRange => {
      const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
      const startIndex = Math.max(
        0,
        indexOfNearestLessThan(observedParagraphReferences, visibleTop - marginTopBottom, this.#compareParagraphTopToOffsetTop.bind(this)) - 1,
      );
      const endIndex = Math.min(
        observedParagraphReferences.length - 1,
        indexOfNearestLessThan(observedParagraphReferences, visibleBottom + marginTopBottom, this.#compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
      );
      return calculateViewCursorAndRangeInfosForKnownVisibleParagraphs(startIndex, endIndex);
    };
    const viewCursorAndRangeInfosForRange$ = CurrentValueDistributor<ViewCursorAndRangeInfosForRange>(
      calculateViewCursorAndRangeInfosForVisibleParagraphsManually(),
    );
    return viewCursorAndRangeInfosForRange$;
  }
  #dispose(): void {
    this.rootHtmlElement.removeChild(this.#containerHtmlElement);
  }
}
const rootHtmlElement = document.querySelector('#myEditor');
assertIsNotNullish(rootHtmlElement);
// eslint-disable-next-line import/order, import/no-unresolved
import dummyText from './dummyText.txt?raw';
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
        dummyText
          .split('\n')
          .map((text) =>
            matita.makeContentFragmentParagraph(matita.makeParagraph({}, text.length === 0 ? [] : [matita.makeText({}, text)], matita.generateId())),
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
