import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { v4 as uuidV4 } from 'uuid';
import { isFirefox, isSafari } from './common/browserDetection';
import { IndexableUniqueStringList } from './common/IndexableUniqueStringList';
import { IntlSegmenter, makePromiseResolvingToNativeIntlSegmenterOrPolyfill } from './common/IntlSegmenter';
import { LruCache } from './common/LruCache';
import { UniqueStringQueue } from './common/UniqueStringQueue';
import { assert, assertIsNotNullish, assertUnreachable, throwNotImplemented, throwUnreachable } from './common/util';
import * as matita from './matita';
import {
  SingleParagraphPlainTextSearchControl,
  SingleParagraphPlainTextSearchControlConfig,
  TotalMatchesMessage,
  TrackAllControl,
  WrapCurrentOrSearchFurtherMatchStrategy,
} from './matita/SingleParagraphPlainTextSearchControl';
import { Disposable, DisposableClass, disposed } from './ruscel/disposable';
import { CurrentValueDistributor, CurrentValueSource, Distributor } from './ruscel/distributor';
import { isNone, isSome, Maybe, None, Some } from './ruscel/maybe';
import { ScheduleInterval, scheduleAnimationFrame, scheduleMicrotask } from './ruscel/schedule';
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
  take,
  takeUntil,
  takeWhile,
  throttle,
  ThrowType,
  timer,
  windowScheduledBySource,
} from './ruscel/source';
import {
  pipe,
  queueMicrotaskDisposable,
  requestAnimationFrameDisposable,
  setTimeoutDisposable,
  setIntervalDisposable,
  addWindowEventListener,
  addEventListener,
} from './ruscel/util';
import './index.css';
// eslint-disable-next-line @typescript-eslint/ban-types
type DocumentConfig = {};
enum StoredListStyleType {
  OrderedList = 'ol',
  Checklist = 'checklist',
}
enum AccessedListStyleType {
  UnorderedList = 'ul',
  OrderedList = 'ol',
  Checklist = 'checklist',
}
type ListStyle = {
  // Undefined = ul.
  type?: StoredListStyleType;
  OrderedList_startNumber?: number;
};
function convertStoredOrderedListStartNumberToAccessedStartNumber(startNumber?: number): number {
  return typeof startNumber === 'number' && Number.isInteger(startNumber) && startNumber >= 0 && startNumber < 2 ** 20 ? startNumber : 1;
}
function convertAccessedOrderedListStartNumberToStoredOrderedListStartNumber(startNumber: number): number | undefined {
  return startNumber === 1 ? undefined : startNumber;
}
type TopLevelContentConfigListIdToStyle = {
  [listId: string]:
    | {
        indentLevelToStyle?: {
          [indentLevel: string]: ListStyle | undefined;
        };
      }
    | undefined;
};
type TopLevelContentConfig = {
  listStyles?: {
    listIdToStyle?: TopLevelContentConfigListIdToStyle;
  };
};
type ContentConfig = TopLevelContentConfig;
const maxListIndentLevel = 8;
type StoredListIndent = undefined | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const acceptableStoredListIndents: StoredListIndent[] = [undefined, 1, 2, 3, 4, 5, 6, 7, 8];
type NumberedListIndent = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const acceptableNumberedListIndents: NumberedListIndent[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
function convertNumberListIndentLevelToStoredListIndentLevel(numberedIndentLevel: number): StoredListIndent {
  assert((acceptableNumberedListIndents as number[]).includes(numberedIndentLevel));
  return (acceptableNumberedListIndents as unknown[]).includes(numberedIndentLevel) && numberedIndentLevel !== 0
    ? (numberedIndentLevel as StoredListIndent)
    : undefined;
}
function convertStoredListIndentLevelToNumberedIndentLevel(storedIndentLevel: number | undefined): NumberedListIndent {
  return (acceptableStoredListIndents as unknown[]).includes(storedIndentLevel) && storedIndentLevel !== undefined
    ? (storedIndentLevel as NumberedListIndent)
    : 0;
}
function incrementStoredListIndent(indentLevel: number | undefined): StoredListIndent {
  const index = (acceptableStoredListIndents as unknown[]).indexOf(indentLevel || undefined);
  return index === -1 ? undefined : indentLevel === maxListIndentLevel ? indentLevel : acceptableStoredListIndents[index + 1];
}
function decrementStoredListIndent(indentLevel: number | undefined): StoredListIndent {
  const index = (acceptableStoredListIndents as unknown[]).indexOf(indentLevel);
  return index === -1 || index === 0 ? undefined : acceptableStoredListIndents[index - 1];
}
function accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
  topLevelContentConfig: TopLevelContentConfig,
  listId: string,
  indentLevel: NumberedListIndent,
): ListStyle | undefined {
  if (!acceptableNumberedListIndents.includes(indentLevel)) {
    return undefined;
  }
  const { listStyles } = topLevelContentConfig;
  if (!matita.isJsonMap(listStyles)) {
    return undefined;
  }
  const { listIdToStyle } = listStyles;
  if (!matita.isJsonMap(listIdToStyle)) {
    return undefined;
  }
  const listIdStyles = listIdToStyle[listId];
  if (!matita.isJsonMap(listIdStyles)) {
    return undefined;
  }
  const { indentLevelToStyle } = listIdStyles;
  if (!matita.isJsonMap(indentLevelToStyle)) {
    return undefined;
  }
  return indentLevelToStyle[indentLevel];
}
function accessListStyleTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
  topLevelContentConfig: TopLevelContentConfig,
  listId: string,
  indentLevel: NumberedListIndent,
): AccessedListStyleType {
  assert(acceptableNumberedListIndents.includes(indentLevel));
  const listStyle = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, indentLevel);
  if (!matita.isJsonMap(listStyle)) {
    return defaultListStyleType;
  }
  return convertStoredListStyleTypeToAccessedListType(listStyle.type);
}
function accessOrderedListStartNumberInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
  topLevelContentConfig: TopLevelContentConfig,
  listId: string,
  indentLevel: NumberedListIndent,
): number {
  assert(acceptableNumberedListIndents.includes(indentLevel));
  const listStyle = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, indentLevel);
  if (!matita.isJsonMap(listStyle)) {
    throwUnreachable();
  }
  const listType = convertStoredListStyleTypeToAccessedListType(listStyle.type);
  assert(listType === AccessedListStyleType.OrderedList);
  return convertStoredOrderedListStartNumberToAccessedStartNumber(listStyle.OrderedList_startNumber);
}
const defaultListStyleType = AccessedListStyleType.UnorderedList;
function accessListTypeInTopLevelContentConfigFromListParagraphConfig(
  topLevelContentConfig: TopLevelContentConfig,
  paragraphConfig: ParagraphConfig,
): AccessedListStyleType {
  assert(paragraphConfig.type === ParagraphType.ListItem);
  const listId = paragraphConfig.ListItem_listId;
  if (typeof listId !== 'string') {
    return defaultListStyleType;
  }
  const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraphConfig.ListItem_indentLevel);
  return accessListStyleTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, numberedIndentLevel);
}
function convertStoredListStyleTypeToAccessedListType(storedListType: StoredListStyleType | undefined): AccessedListStyleType {
  if (storedListType === undefined || typeof storedListType !== 'string') {
    return defaultListStyleType;
  }
  if (storedListType === StoredListStyleType.OrderedList) {
    return AccessedListStyleType.OrderedList;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (storedListType === StoredListStyleType.Checklist) {
    return AccessedListStyleType.Checklist;
  }
  assertUnreachable(storedListType);
}
function convertAccessedListStyleTypeToStoredListType(accessedListType: AccessedListStyleType): StoredListStyleType | undefined {
  if (accessedListType === AccessedListStyleType.Checklist) {
    return StoredListStyleType.Checklist;
  }
  if (accessedListType === AccessedListStyleType.OrderedList) {
    return StoredListStyleType.OrderedList;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (accessedListType === AccessedListStyleType.UnorderedList) {
    return undefined;
  }
  assertUnreachable(accessedListType);
}
enum ParagraphType {
  ListItem = 'listitem',
  Blockquote = 'blockquote',
  Heading1 = 'heading1',
  Heading2 = 'heading2',
  Heading3 = 'heading3',
}
enum StoredParagraphAlignment {
  Center = 'center',
  Right = 'right',
  Justify = 'justify',
}
enum AccessedParagraphAlignment {
  Left = 'left',
  Center = 'center',
  Right = 'right',
  Justify = 'justify',
}
function convertStoredParagraphAlignmentToAccessedParagraphAlignment(
  storedParagraphAlignment: StoredParagraphAlignment | undefined,
): AccessedParagraphAlignment {
  if (storedParagraphAlignment === undefined) {
    return AccessedParagraphAlignment.Left;
  }
  if (storedParagraphAlignment === StoredParagraphAlignment.Center) {
    return AccessedParagraphAlignment.Center;
  }
  if (storedParagraphAlignment === StoredParagraphAlignment.Right) {
    return AccessedParagraphAlignment.Right;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (storedParagraphAlignment === StoredParagraphAlignment.Justify) {
    return AccessedParagraphAlignment.Justify;
  }
  assertUnreachable(storedParagraphAlignment);
}
function convertAccessedParagraphAlignmentToStoredParagraphAlignment(
  accessedParagraphAlignment: AccessedParagraphAlignment,
): StoredParagraphAlignment | undefined {
  if (accessedParagraphAlignment === AccessedParagraphAlignment.Left) {
    return undefined;
  }
  if (accessedParagraphAlignment === AccessedParagraphAlignment.Center) {
    return StoredParagraphAlignment.Center;
  }
  if (accessedParagraphAlignment === AccessedParagraphAlignment.Right) {
    return StoredParagraphAlignment.Right;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (accessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
    return StoredParagraphAlignment.Justify;
  }
  assertUnreachable(accessedParagraphAlignment);
}
type ParagraphConfig = {
  type?: ParagraphType;
  ListItem_listId?: string;
  ListItem_Checklist_checked?: true;
  ListItem_indentLevel?: number;
  alignment?: StoredParagraphAlignment;
};
const defaultParagraphConfig: ParagraphConfig = {};
const resetListMergeParagraphConfig: ParagraphConfig = {
  type: undefined,
  ListItem_listId: undefined,
  ListItem_Checklist_checked: undefined,
  ListItem_indentLevel: undefined,
};
const resetMergeParagraphConfig: ParagraphConfig = {
  type: undefined,
  ListItem_listId: undefined,
  ListItem_Checklist_checked: undefined,
  ListItem_indentLevel: undefined,
  alignment: undefined,
};
// eslint-disable-next-line @typescript-eslint/ban-types
type EmbedConfig = {};
enum TextConfigScript {
  Sub = 'sub',
  Super = 'super',
}
type TextConfig = {
  bold?: true;
  italic?: true;
  underline?: true;
  code?: true;
  strikethrough?: true;
  script?: TextConfigScript;
};
const defaultTextConfig: TextConfig = {};
const resetMergeTextConfig: TextConfig = {
  bold: undefined,
  italic: undefined,
  underline: undefined,
  code: undefined,
  strikethrough: undefined,
  script: undefined,
};
function getInsertTextConfigAtSelectionRangeWithoutCustomCollapsedSelectionTextConfig(
  document: matita.Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selectionRange: matita.SelectionRange,
): TextConfig {
  const firstRange = selectionRange.ranges[0];
  const direction = matita.getRangeDirection(document, firstRange);
  if (direction === matita.RangeDirection.NeutralEmptyContent) {
    return defaultTextConfig;
  }
  const firstPoint = direction === matita.RangeDirection.Backwards ? firstRange.endPoint : firstRange.startPoint;
  const firstPointBlockIndex = matita.getIndexOfBlockAtPointInNonEmptyContentAtContentReference(document, firstPoint, firstRange.contentReference);
  const block = matita.accessBlockAtIndexInContentAtContentReference(document, firstRange.contentReference, firstPointBlockIndex);
  if (matita.isEmbed(block)) {
    matita.assertIsNotParagraphPoint(firstPoint);
    return defaultTextConfig;
  }
  const paragraphOffset = matita.isParagraphPoint(firstPoint) ? firstPoint.offset : 0;
  const paragraphPoint = matita.makeParagraphPointFromParagraphAndOffset(block, paragraphOffset);
  const inlineNodeWithStartOffsetBefore = matita.getInlineNodeWithStartOffsetBeforeParagraphPoint(document, paragraphPoint);
  if (!inlineNodeWithStartOffsetBefore || matita.isVoid(inlineNodeWithStartOffsetBefore.inline)) {
    const inlineNodeWithStartOffsetAfter = matita.getInlineNodeWithStartOffsetAfterParagraphPoint(document, paragraphPoint);
    if (!inlineNodeWithStartOffsetAfter || matita.isVoid(inlineNodeWithStartOffsetAfter.inline)) {
      return defaultTextConfig;
    }
    return inlineNodeWithStartOffsetAfter.inline.config;
  }
  if (!matita.isSelectionRangeCollapsedInText(document, selectionRange)) {
    const inlineNodeWithStartOffsetAfter = matita.getInlineNodeWithStartOffsetAfterParagraphPoint(document, paragraphPoint);
    if (inlineNodeWithStartOffsetAfter && matita.isText(inlineNodeWithStartOffsetAfter.inline)) {
      return inlineNodeWithStartOffsetAfter.inline.config;
    }
  }
  return inlineNodeWithStartOffsetBefore.inline.config;
}
function getInsertTextConfigAtSelectionRange(
  document: matita.Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  customCollapsedSelectionTextConfig: TextConfig | null,
  selectionRange: matita.SelectionRange,
): TextConfig {
  if (customCollapsedSelectionTextConfig === null || !matita.isSelectionRangeCollapsedInText(document, selectionRange)) {
    return getInsertTextConfigAtSelectionRangeWithoutCustomCollapsedSelectionTextConfig(document, selectionRange);
  }
  return { ...getInsertTextConfigAtSelectionRangeWithoutCustomCollapsedSelectionTextConfig(document, selectionRange), ...customCollapsedSelectionTextConfig };
}
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
const getTextConfigTextRunSizingKey = (textConfig: TextConfig): string => {
  return [textConfig.script, textConfig.code].join('|');
};
interface ParagraphStyleInjection {
  ListItem_type?: AccessedListStyleType;
  ListItem_OrderedList_number?: number;
}
class VirtualizedParagraphRenderControl extends DisposableClass implements matita.ParagraphRenderControl {
  paragraphReference: matita.BlockReference;
  #viewControl: VirtualizedViewControl;
  containerHtmlElement: HTMLElement;
  #textContainerElement!: HTMLElement;
  textNodeInfos: TextElementInfo[] = [];
  #baseFontSize = 16;
  #fontSize = this.#baseFontSize;
  #lineHeight = 1.5;
  #scriptFontSizeMultiplier = 0.85;
  #dirtyChildren = true;
  #dirtyContainer = true;
  constructor(paragraphReference: matita.BlockReference, viewControl: VirtualizedViewControl) {
    super(() => this.#dispose());
    this.paragraphReference = paragraphReference;
    this.#viewControl = viewControl;
    this.containerHtmlElement = this.#makeContainerHtmlElement();
    this.#textContainerElement = this.containerHtmlElement;
  }
  #makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('div');
    containerHtmlElement.style.contain = 'content';
    containerHtmlElement.style.whiteSpace = 'break-spaces';
    containerHtmlElement.style.overflowWrap = 'anywhere';
    containerHtmlElement.style.fontFamily = 'IBM Plex Sans, sans-serif';
    containerHtmlElement.style.fontSize = `${this.#fontSize}px`;
    containerHtmlElement.style.lineHeight = `${this.#lineHeight}`;
    containerHtmlElement.style.position = 'relative';
    return containerHtmlElement;
  }
  get fontSize(): number {
    return this.#fontSize;
  }
  convertLineTopAndHeightToCursorTopAndHeightWithInsertTextConfig(
    lineTop: number,
    lineHeight: number,
    insertTextConfig: TextConfig,
    measuredParagraphLineRange: MeasuredParagraphLineRange,
  ): { top: number; height: number } {
    if (measuredParagraphLineRange.startOffset !== measuredParagraphLineRange.endOffset) {
      const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
      const paragraph = matita.accessBlockFromBlockReference(documentRenderControl.stateControl.stateView.document, this.paragraphReference);
      matita.assertIsParagraph(paragraph);
      const sizingKey = getTextConfigTextRunSizingKey(insertTextConfig);
      for (const inlineNodeWithStartOffset of matita.iterateParagraphChildrenWholeWithStartOffset(
        paragraph,
        measuredParagraphLineRange.startOffset,
        measuredParagraphLineRange.endOffset,
      )) {
        if (matita.isText(inlineNodeWithStartOffset.inline) && getTextConfigTextRunSizingKey(inlineNodeWithStartOffset.inline.config) === sizingKey) {
          const characterMeasurementIndex = Math.max(inlineNodeWithStartOffset.startOffset - measuredParagraphLineRange.startOffset, 0);
          const characterRectangle = measuredParagraphLineRange.characterRectangles[characterMeasurementIndex];
          assertIsNotNullish(characterRectangle);
          return { height: characterRectangle.height, top: characterRectangle.top };
        }
      }
    }
    let height: number;
    let top: number;
    if (insertTextConfig.script === undefined) {
      top = lineTop + lineHeight / 2 - this.#fontSize / 2 - this.#fontSize * 0.18;
      height = this.#fontSize * 1.42;
    } else {
      height = (this.#fontSize / this.#scriptFontSizeMultiplier) * 0.95;
      top = lineTop + lineHeight / 2 - height / 2;
      if (insertTextConfig.script === TextConfigScript.Sub) {
        top += 0.175 * height;
      } else {
        top -= 0.23 * height;
      }
    }
    return { top, height };
  }
  #addInlineStylesToTextElement(
    textElement: HTMLElement,
    textConfig: TextConfig,
    paragraph: matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    inlineIndex: number,
    isFirstInTextNode: boolean,
    isLastInTextNode: boolean,
  ): void {
    if (textConfig.bold === true) {
      textElement.style.fontWeight = 'bold';
    }
    if (textConfig.italic === true) {
      textElement.style.fontStyle = 'italic';
    }
    if (textConfig.underline === true) {
      if (textConfig.strikethrough === true) {
        textElement.style.textDecoration = 'underline line-through';
      } else {
        textElement.style.textDecoration = 'underline';
      }
    } else if (textConfig.strikethrough === true) {
      textElement.style.textDecoration = 'line-through';
    }
    if (textConfig.script !== undefined) {
      textElement.style.fontSize = `${this.#fontSize * this.#scriptFontSizeMultiplier}px`;
      if (textConfig.script === TextConfigScript.Super) {
        textElement.style.verticalAlign = 'super';
      } else {
        textElement.style.verticalAlign = 'sub';
      }
    }
    if (textConfig.code === true) {
      textElement.style.fontFamily = 'Fira Code, monospace';
      textElement.style.backgroundColor = '#afb8c133';
      const previousInline = paragraph.children[inlineIndex - 1];
      if (isFirstInTextNode && (inlineIndex === 0 || matita.isVoid(previousInline) || !previousInline.config.code)) {
        textElement.style.paddingLeft = '4px';
        textElement.style.borderTopLeftRadius = '4px';
        textElement.style.borderBottomLeftRadius = '4px';
      }
      const nextInline = paragraph.children[inlineIndex + 1];
      if (isLastInTextNode && (inlineIndex === paragraph.children.length - 1 || matita.isVoid(nextInline) || !nextInline.config.code)) {
        textElement.style.paddingRight = '4px';
        textElement.style.borderTopRightRadius = '4px';
        textElement.style.borderBottomRightRadius = '4px';
      }
    }
  }
  #accessParagraph(): matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    const paragraph = matita.accessBlockFromBlockReference(documentRenderControl.stateControl.stateView.document, this.paragraphReference);
    matita.assertIsParagraph(paragraph);
    return paragraph;
  }
  #previousRenderedConfig: ParagraphConfig | undefined;
  #previousInjectedStyle: ParagraphStyleInjection | undefined;
  #makeListMarker(paragraphConfig: ParagraphConfig, injectedStyle: ParagraphStyleInjection): HTMLElement {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(
      matita.accessContentFromContentReference(documentRenderControl.stateControl.stateView.document, documentRenderControl.topLevelContentReference).config,
      paragraphConfig,
    );
    switch (listType) {
      case AccessedListStyleType.UnorderedList: {
        const listMarker = document.createElement('span');
        listMarker.style.whiteSpace = 'nowrap';
        listMarker.append(document.createTextNode('•'));
        return listMarker;
      }
      case AccessedListStyleType.OrderedList: {
        const listMarker = document.createElement('span');
        listMarker.style.whiteSpace = 'nowrap';
        assertIsNotNullish(injectedStyle.ListItem_OrderedList_number);
        listMarker.append(document.createTextNode(`${injectedStyle.ListItem_OrderedList_number}.`));
        return listMarker;
      }
      case AccessedListStyleType.Checklist: {
        throwNotImplemented();
      }
    }
  }
  #listMarkerElement: HTMLElement | null = null;
  #getPaddingLeftStyleFromListIndent(listIndent: number): string {
    return `${24 + 48 * listIndent}px`;
  }
  #updateContainer(injectedStyle: ParagraphStyleInjection): void {
    const paragraph = this.#accessParagraph();
    const previousAccessedParagraphAlignment =
      this.#previousRenderedConfig && convertStoredParagraphAlignmentToAccessedParagraphAlignment(this.#previousRenderedConfig.alignment);
    const accessedParagraphAlignment = convertStoredParagraphAlignmentToAccessedParagraphAlignment(paragraph.config.alignment);
    if (previousAccessedParagraphAlignment !== accessedParagraphAlignment) {
      this.containerHtmlElement.style.textAlign = accessedParagraphAlignment;
      if (isSafari || isFirefox) {
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.containerHtmlElement.style.whiteSpace = 'pre-line';
        } else if (previousAccessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.containerHtmlElement.style.whiteSpace = 'break-spaces';
        }
      }
    }
    if (this.#previousRenderedConfig === undefined || this.#previousRenderedConfig.type !== paragraph.config.type) {
      if (this.#previousRenderedConfig !== undefined && this.#previousRenderedConfig.type === ParagraphType.ListItem) {
        this.containerHtmlElement.style.display = '';
        this.containerHtmlElement.style.justifyContent = '';
        this.containerHtmlElement.style.gap = '';
        this.containerHtmlElement.style.paddingLeft = '';
        this.containerHtmlElement.replaceChildren(...this.#textContainerElement.childNodes);
        this.#textContainerElement = this.containerHtmlElement;
      }
      if (this.#previousRenderedConfig !== undefined && this.#previousRenderedConfig.type === ParagraphType.Blockquote) {
        this.containerHtmlElement.style.display = '';
        this.containerHtmlElement.style.width = '';
        this.containerHtmlElement.style.color = '';
        this.containerHtmlElement.style.borderLeft = '';
        this.containerHtmlElement.style.paddingLeft = '';
        this.containerHtmlElement.style.marginLeft = '';
        this.containerHtmlElement.style.marginRight = '';
      }
      if (
        this.#previousRenderedConfig !== undefined &&
        (this.#previousRenderedConfig.type === ParagraphType.Heading1 ||
          this.#previousRenderedConfig.type === ParagraphType.Heading2 ||
          this.#previousRenderedConfig.type === ParagraphType.Heading3)
      ) {
        this.containerHtmlElement.style.fontWeight = '';
        this.#fontSize = this.#baseFontSize;
        this.containerHtmlElement.style.fontSize = `${this.#baseFontSize}px`;
      }
      switch (paragraph.config.type) {
        case undefined: {
          break;
        }
        case ParagraphType.Blockquote: {
          this.containerHtmlElement.style.color = '#57606a';
          this.containerHtmlElement.style.borderLeft = '0.2em solid #222';
          this.containerHtmlElement.style.paddingLeft = '12px';
          if (accessedParagraphAlignment === AccessedParagraphAlignment.Center || accessedParagraphAlignment === AccessedParagraphAlignment.Right) {
            this.containerHtmlElement.style.width = 'auto';
            this.containerHtmlElement.style.display = 'table';
            this.containerHtmlElement.style.marginLeft = 'auto';
          }
          if (accessedParagraphAlignment === AccessedParagraphAlignment.Center) {
            this.containerHtmlElement.style.marginRight = 'auto';
          }
          break;
        }
        case ParagraphType.Heading1: {
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.#fontSize = 2 * this.#baseFontSize;
          this.containerHtmlElement.style.fontSize = `${this.#fontSize}px`;
          break;
        }
        case ParagraphType.Heading2: {
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.#fontSize = 1.5 * this.#baseFontSize;
          this.containerHtmlElement.style.fontSize = `${this.#fontSize}px`;
          break;
        }
        case ParagraphType.Heading3: {
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.#fontSize = 1.25 * this.#baseFontSize;
          this.containerHtmlElement.style.fontSize = `${this.#fontSize}px`;
          break;
        }
        case ParagraphType.ListItem: {
          this.#textContainerElement = document.createElement('span');
          this.#textContainerElement.append(...this.containerHtmlElement.childNodes);
          this.containerHtmlElement.style.display = 'flex';
          const justifyContent =
            accessedParagraphAlignment === AccessedParagraphAlignment.Right
              ? 'end'
              : accessedParagraphAlignment === AccessedParagraphAlignment.Center
              ? 'center'
              : 'start';
          this.containerHtmlElement.style.justifyContent = justifyContent;
          this.containerHtmlElement.style.gap = '0.5em';
          this.containerHtmlElement.style.paddingLeft = this.#getPaddingLeftStyleFromListIndent(
            convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel),
          );
          this.#listMarkerElement = this.#makeListMarker(paragraph.config, injectedStyle);
          this.containerHtmlElement.append(this.#listMarkerElement, this.#textContainerElement);
          break;
        }
        default: {
          assertUnreachable(paragraph.config.type);
        }
      }
    } else {
      assertIsNotNullish(this.#previousInjectedStyle);
      if (paragraph.config.type === ParagraphType.Blockquote) {
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Center || accessedParagraphAlignment === AccessedParagraphAlignment.Right) {
          this.containerHtmlElement.style.width = 'auto';
          this.containerHtmlElement.style.display = 'table';
          this.containerHtmlElement.style.marginLeft = 'auto';
        } else {
          this.containerHtmlElement.style.width = '';
          this.containerHtmlElement.style.display = '';
          this.containerHtmlElement.style.marginLeft = '';
        }
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Center) {
          this.containerHtmlElement.style.marginRight = 'auto';
        } else {
          this.containerHtmlElement.style.marginRight = '';
        }
      }
      if (paragraph.config.type === ParagraphType.ListItem) {
        assertIsNotNullish(this.#listMarkerElement);
        assertIsNotNullish(this.#previousInjectedStyle.ListItem_type);
        assertIsNotNullish(injectedStyle.ListItem_type);
        if (
          this.#previousInjectedStyle.ListItem_type !== injectedStyle.ListItem_type ||
          this.#previousInjectedStyle.ListItem_OrderedList_number !== injectedStyle.ListItem_OrderedList_number
        ) {
          const previousListMarkerElement = this.#listMarkerElement;
          this.#listMarkerElement = this.#makeListMarker(paragraph.config, injectedStyle);
          previousListMarkerElement.replaceWith(this.#listMarkerElement);
        }
        const justifyContent =
          accessedParagraphAlignment === AccessedParagraphAlignment.Right
            ? 'end'
            : accessedParagraphAlignment === AccessedParagraphAlignment.Center
            ? 'center'
            : 'start';
        this.containerHtmlElement.style.justifyContent = justifyContent;
        const previousListIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(this.#previousRenderedConfig.ListItem_indentLevel);
        const listIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel);
        if (previousListIndentLevel !== listIndentLevel) {
          this.containerHtmlElement.style.paddingLeft = this.#getPaddingLeftStyleFromListIndent(listIndentLevel);
        }
      }
    }
    if (paragraph.config.type !== ParagraphType.ListItem) {
      this.#listMarkerElement = null;
    }
    this.#previousRenderedConfig = paragraph.config;
    this.#previousInjectedStyle = injectedStyle;
  }
  #updateChildren(): void {
    const paragraph = this.#accessParagraph();
    this.textNodeInfos.length = 0;
    if (paragraph.children.length === 0) {
      const textNode = document.createTextNode('\u200b');
      this.textNodeInfos.push({
        textStart: 0,
        textEnd: 0,
        textNode,
        endsWithLineBreak: false,
      });
      this.#textContainerElement.replaceChildren(textNode);
      return;
    }
    let isFirstAfterLineBreak = false;
    let lastNewlineBlockContainerElement: HTMLElement | null = null;
    let textStart = 0;
    const newChildren: Node[] = [];
    for (let i = 0; i < paragraph.children.length; i++) {
      const inline = paragraph.children[i];
      matita.assertIsText(inline);
      let remainingText = inline.text;
      while (true) {
        const indexOfNewline = remainingText.indexOf('\n');
        if (indexOfNewline === -1) {
          break;
        }
        const textBeforeNewline = remainingText.slice(0, indexOfNewline);
        remainingText = remainingText.slice(indexOfNewline + 1);
        if (indexOfNewline === 0 && this.textNodeInfos.length > 0) {
          const isFirstAfterLineBreak_ = isFirstAfterLineBreak;
          isFirstAfterLineBreak = true;
          if (isFirstAfterLineBreak_) {
            const dummyTextElement = document.createElement('span');
            dummyTextElement.style.display = 'block';
            const textNode = document.createTextNode('\u200b');
            dummyTextElement.appendChild(textNode);
            newChildren.push(dummyTextElement);
            this.textNodeInfos.push({
              textStart,
              textEnd: textStart,
              textNode,
              endsWithLineBreak: true,
            });
          } else {
            this.textNodeInfos[this.textNodeInfos.length - 1].endsWithLineBreak = true;
          }
          textStart++;
          continue;
        }
        const textElementBeforeNewline = document.createElement('span');
        if (textBeforeNewline.length > 0) {
          this.#addInlineStylesToTextElement(
            textElementBeforeNewline,
            inline.config,
            paragraph,
            i,
            inline.text.length === textBeforeNewline.length + 1 + remainingText.length,
            remainingText.length === 0,
          );
        }
        const textNode = document.createTextNode(textBeforeNewline || '\u200b');
        textElementBeforeNewline.appendChild(textNode);
        if (isFirstAfterLineBreak) {
          const newlineBlockContainerElement = document.createElement('span');
          newlineBlockContainerElement.style.display = 'block';
          newlineBlockContainerElement.appendChild(textElementBeforeNewline);
          newChildren.push(newlineBlockContainerElement);
        } else if (lastNewlineBlockContainerElement !== null) {
          lastNewlineBlockContainerElement.appendChild(textElementBeforeNewline);
        } else {
          newChildren.push(textElementBeforeNewline);
        }
        isFirstAfterLineBreak = true;
        const textEnd = textStart + textBeforeNewline.length;
        this.textNodeInfos.push({
          textStart,
          textEnd,
          textNode,
          endsWithLineBreak: true,
        });
        textStart = textEnd + 1;
      }
      if (remainingText.length === 0) {
        continue;
      }
      const textElement = document.createElement('span');
      this.#addInlineStylesToTextElement(textElement, inline.config, paragraph, i, inline.text.length === remainingText.length, true);
      const textNode = document.createTextNode(remainingText || '\u200b');
      textElement.appendChild(textNode);
      if (isFirstAfterLineBreak) {
        const newlineBlockContainerElement = document.createElement('span');
        newlineBlockContainerElement.style.display = 'block';
        newlineBlockContainerElement.appendChild(textElement);
        newChildren.push(newlineBlockContainerElement);
        lastNewlineBlockContainerElement = newlineBlockContainerElement;
      } else if (lastNewlineBlockContainerElement !== null) {
        lastNewlineBlockContainerElement.appendChild(textElement);
      } else {
        newChildren.push(textElement);
      }
      isFirstAfterLineBreak = false;
      const textEnd = textStart + remainingText.length;
      this.textNodeInfos.push({
        textStart,
        textEnd,
        textNode,
        endsWithLineBreak: false,
      });
      textStart = textEnd;
    }
    if (isFirstAfterLineBreak) {
      const dummyTextElement = document.createElement('span');
      dummyTextElement.style.display = 'block';
      const textNode = document.createTextNode('\u200b');
      dummyTextElement.appendChild(textNode);
      newChildren.push(dummyTextElement);
      this.textNodeInfos.push({
        textStart,
        textEnd: textStart,
        textNode,
        endsWithLineBreak: true,
      });
    }
    this.#textContainerElement.replaceChildren(...newChildren);
  }
  onConfigOrChildrenChanged(isParagraphChildrenUpdated: boolean): void {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    documentRenderControl.dirtyParagraphIdQueue.queueIfNotQueuedAlready(matita.getBlockIdFromBlockReference(this.paragraphReference));
    if (isParagraphChildrenUpdated) {
      this.#dirtyChildren = true;
    } else {
      this.#dirtyContainer = true;
    }
  }
  commitDirtyChanges(injectedStyle: ParagraphStyleInjection): void {
    if (this.#dirtyChildren) {
      this.#dirtyChildren = false;
      this.#updateChildren();
    }
    if (this.#dirtyContainer) {
      this.#dirtyContainer = false;
      this.#updateContainer(injectedStyle);
    }
  }
  markDirtyContainer(): void {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    documentRenderControl.relativeParagraphMeasurementCache.invalidate(matita.getBlockIdFromBlockReference(this.paragraphReference));
    this.#dirtyContainer = true;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  #dispose(): void {}
}
class VirtualizedContentRenderControl extends DisposableClass implements matita.ContentRenderControl {
  contentReference: matita.ContentReference;
  #viewControl: VirtualizedViewControl;
  containerHtmlElement: HTMLElement;
  #children: VirtualizedParagraphRenderControl[];
  constructor(contentReference: matita.ContentReference, viewControl: VirtualizedViewControl) {
    super(() => this.#dispose());
    this.contentReference = contentReference;
    this.#viewControl = viewControl;
    this.containerHtmlElement = this.#makeContainerHtmlElement();
    this.#children = [];
    this.#init();
  }
  #makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('div');
    return containerHtmlElement;
  }
  #init(): void {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    documentRenderControl.htmlElementToNodeRenderControlMap.set(this.containerHtmlElement, this);
    const numberOfBlocks = matita.getNumberOfBlocksInContentAtContentReference(documentRenderControl.stateControl.stateView.document, this.contentReference);
    const documentFragment = document.createDocumentFragment();
    for (let i = 0; i < numberOfBlocks; i++) {
      const block = matita.accessBlockAtIndexInContentAtContentReference(documentRenderControl.stateControl.stateView.document, this.contentReference, i);
      matita.assertIsParagraph(block);
      const paragraphReference = matita.makeBlockReferenceFromBlock(block);
      const paragraphRenderControl = this.#makeParagraphRenderControl(paragraphReference);
      this.#children.push(paragraphRenderControl);
      documentFragment.appendChild(paragraphRenderControl.containerHtmlElement);
    }
    this.containerHtmlElement.appendChild(documentFragment);
  }
  #makeParagraphRenderControl(paragraphReference: matita.BlockReference): VirtualizedParagraphRenderControl {
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    const paragraphRenderControl = new VirtualizedParagraphRenderControl(paragraphReference, this.#viewControl);
    this.add(paragraphRenderControl);
    this.#viewControl.renderControlRegister.registerParagraphRenderControl(paragraphRenderControl);
    documentRenderControl.htmlElementToNodeRenderControlMap.set(paragraphRenderControl.containerHtmlElement, paragraphRenderControl);
    documentRenderControl.dirtyParagraphIdQueue.queueIfNotQueuedAlready(matita.getBlockIdFromBlockReference(paragraphReference));
    return paragraphRenderControl;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onConfigChanged(): void {}
  onBlocksRemoved(blockReferences: matita.BlockReference[]): void {
    const firstBlockReference = blockReferences[0];
    const firstChildIndex = this.#children.findIndex((paragraphRenderControl) => {
      return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.paragraphReference, firstBlockReference);
    });
    assert(firstChildIndex !== -1);
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const childIndex = firstChildIndex + i;
      const childRenderControl = this.#children[childIndex];
      documentRenderControl.htmlElementToNodeRenderControlMap.delete(childRenderControl.containerHtmlElement);
      documentRenderControl.dirtyParagraphIdQueue.dequeue(matita.getBlockIdFromBlockReference(childRenderControl.paragraphReference));
      if (childRenderControl instanceof VirtualizedParagraphRenderControl) {
        this.#viewControl.renderControlRegister.unregisterParagraphRenderControl(childRenderControl);
      } else {
        throwNotImplemented();
      }
      childRenderControl.containerHtmlElement.remove();
      childRenderControl.dispose();
    }
    this.#children.splice(firstChildIndex, blockReferences.length);
  }
  onBlocksInsertedAfter(blockReferences: matita.BlockReference[], insertAfterBlockReference: matita.BlockReference | null): void {
    const insertionIndex =
      insertAfterBlockReference === null
        ? 0
        : this.#children.findIndex((paragraphRenderControl) => {
            return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.paragraphReference, insertAfterBlockReference);
          }) + 1;
    const childRenderControls: VirtualizedParagraphRenderControl[] = [];
    const documentFragment = document.createDocumentFragment();
    const documentRenderControl = this.#viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(documentRenderControl.stateControl.stateView.document, blockReference);
      let childRenderControl: VirtualizedParagraphRenderControl;
      if (matita.isParagraph(block)) {
        childRenderControl = this.#makeParagraphRenderControl(blockReference);
      } else {
        throwNotImplemented();
      }
      childRenderControls.push(childRenderControl);
      documentFragment.appendChild(childRenderControl.containerHtmlElement);
    }
    this.containerHtmlElement.insertBefore(
      documentFragment,
      insertionIndex === this.#children.length ? null : this.#children[insertionIndex].containerHtmlElement,
    );
    this.#children.splice(insertionIndex, 0, ...childRenderControls);
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
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Some<T> | (() => Some<T>),
  updateSync?: boolean | ((value: Maybe<T>) => boolean),
): Some<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean | ((value: Maybe<T>) => boolean),
): Maybe<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean | ((value: Maybe<T>) => boolean),
): Maybe<T> {
  const [value, setValueState] = useState<Maybe<T>>(initialMaybe ?? None);
  const isFirstUpdateRef = useRef(true);
  const setValue = (newMaybe: Maybe<T>) => {
    setValueState((currentValue) => {
      if (isNone(currentValue) ? isNone(newMaybe) : isSome(newMaybe) && currentValue.value === newMaybe.value) {
        return currentValue;
      }
      return newMaybe;
    });
  };
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
      const updateSyncResult = typeof updateSync === 'function' ? updateSync(maybe) : updateSync;
      if (updateSyncResult === true) {
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
function pushCurvedLineRectSpans(
  jsxElements: JSX.Element[],
  previousLineRect: ViewRectangle | undefined,
  currentLineRect: ViewRectangle,
  nextLineRect: ViewRectangle | undefined,
  borderRadius: number,
  key: string,
  backgroundColor: string,
): void {
  const cssProperties: React.CSSProperties = {
    position: 'absolute',
    top: currentLineRect.top,
    left: currentLineRect.left,
    width: currentLineRect.width,
    height: currentLineRect.height,
    backgroundColor,
  };
  if (previousLineRect === undefined) {
    cssProperties.borderTopLeftRadius = borderRadius;
    cssProperties.borderTopRightRadius = borderRadius;
  } else {
    if (previousLineRect.left !== currentLineRect.left) {
      if (previousLineRect.left < currentLineRect.left && currentLineRect.left <= previousLineRect.right) {
        const restrictedBorderRadiusTopLeft = Math.min(borderRadius, (currentLineRect.left - previousLineRect.left) / 2);
        jsxElements.push(
          <span
            key={key + 'tl'}
            style={{
              position: 'absolute',
              top: currentLineRect.top,
              left: currentLineRect.left - restrictedBorderRadiusTopLeft,
              width: restrictedBorderRadiusTopLeft,
              height: restrictedBorderRadiusTopLeft,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at bottom left, transparent 0, transparent ${restrictedBorderRadiusTopLeft}px, ${backgroundColor} ${restrictedBorderRadiusTopLeft}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusTopLeft =
          previousLineRect.left > currentLineRect.left ? Math.min(borderRadius, (previousLineRect.left - currentLineRect.left) / 2) : borderRadius;
        cssProperties.borderTopLeftRadius = restrictedBorderRadiusTopLeft;
      }
    }
    if (previousLineRect.right !== currentLineRect.right) {
      if (previousLineRect.left <= currentLineRect.right && currentLineRect.right < previousLineRect.right) {
        const restrictedBorderRadiusTopRight = Math.min(borderRadius, (previousLineRect.right - currentLineRect.right) / 2);
        jsxElements.push(
          <span
            key={key + 'tr'}
            style={{
              position: 'absolute',
              top: currentLineRect.top,
              left: currentLineRect.right,
              width: restrictedBorderRadiusTopRight,
              height: restrictedBorderRadiusTopRight,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at bottom right, transparent 0, transparent ${restrictedBorderRadiusTopRight}px, ${backgroundColor} ${restrictedBorderRadiusTopRight}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusTopRight =
          currentLineRect.right > previousLineRect.right ? Math.min(borderRadius, (currentLineRect.right - previousLineRect.right) / 2) : borderRadius;
        cssProperties.borderTopRightRadius = restrictedBorderRadiusTopRight;
      }
    }
  }
  if (nextLineRect === undefined) {
    cssProperties.borderBottomLeftRadius = borderRadius;
    cssProperties.borderBottomRightRadius = borderRadius;
  } else {
    if (nextLineRect.left !== currentLineRect.left) {
      if (nextLineRect.left < currentLineRect.left && currentLineRect.left <= nextLineRect.right) {
        const restrictedBorderRadiusBottomLeft = Math.min(borderRadius, (currentLineRect.left - nextLineRect.left) / 2);
        jsxElements.push(
          <span
            key={key + 'bl'}
            style={{
              position: 'absolute',
              top: currentLineRect.bottom - restrictedBorderRadiusBottomLeft,
              left: currentLineRect.left - restrictedBorderRadiusBottomLeft,
              width: restrictedBorderRadiusBottomLeft,
              height: restrictedBorderRadiusBottomLeft,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at top left, transparent 0, transparent ${restrictedBorderRadiusBottomLeft}px, ${backgroundColor} ${restrictedBorderRadiusBottomLeft}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusBottomLeft =
          nextLineRect.left > currentLineRect.left ? Math.min(borderRadius, (nextLineRect.left - currentLineRect.left) / 2) : borderRadius;
        cssProperties.borderBottomLeftRadius = restrictedBorderRadiusBottomLeft;
      }
    }
    if (nextLineRect.right !== currentLineRect.right) {
      if (nextLineRect.left <= currentLineRect.right && currentLineRect.right < nextLineRect.right) {
        const restrictedBorderRadiusBottomRight = Math.min(borderRadius, (nextLineRect.right - currentLineRect.right) / 2);
        jsxElements.push(
          <span
            key={key + 'br'}
            style={{
              position: 'absolute',
              top: currentLineRect.bottom - restrictedBorderRadiusBottomRight,
              left: currentLineRect.right,
              width: restrictedBorderRadiusBottomRight,
              height: restrictedBorderRadiusBottomRight,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at top right, transparent 0, transparent ${restrictedBorderRadiusBottomRight}px, ${backgroundColor} ${restrictedBorderRadiusBottomRight}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusBottomRight =
          currentLineRect.right > nextLineRect.right ? Math.min(borderRadius, (currentLineRect.right - nextLineRect.right) / 2) : borderRadius;
        cssProperties.borderBottomRightRadius = restrictedBorderRadiusBottomRight;
      }
    }
  }
  jsxElements.push(<span key={key} style={cssProperties} />);
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
interface HitPosition {
  pointWithContentReference: matita.PointWithContentReference;
  isPastPreviousCharacterHalfPoint: boolean;
  isWrappedLineStart: boolean;
  isWrappedLinePreviousEnd: boolean;
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
  isItalic: boolean;
  insertTextConfig: TextConfig;
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
  isInComposition: boolean;
  roundCorners: boolean;
}
interface ViewCursorAndRangeInfos {
  viewCursorAndRangeInfosForSelectionRanges: ViewCursorAndRangeInfosForSelectionRange[];
}
interface SelectionViewMessage {
  viewCursorAndRangeInfos: ViewCursorAndRangeInfos;
  renderSync: boolean;
}
interface SelectionViewProps {
  selectionView$: Source<SelectionViewMessage>;
  hasFocus$: Source<boolean>;
  resetSynchronizedCursorVisibility$: Source<undefined>;
}
function SelectionView(props: SelectionViewProps): JSX.Element | null {
  const { selectionView$, hasFocus$, resetSynchronizedCursorVisibility$ } = props;
  const selectionViewMaybe = use$(
    useMemo(
      () =>
        pipe(
          selectionView$,
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [],
    ),
    undefined,
    (maybe) => {
      return isSome(maybe) && maybe.value.renderSync;
    },
  );
  const hasFocusMaybe = use$(
    useMemo(
      () =>
        pipe(
          hasFocus$,
          debounce(() => ofEvent(End, scheduleAnimationFrame)),
          memoConsecutive(),
        ),
      [hasFocus$],
    ),
  );
  const hasFocus = isSome(hasFocusMaybe) && hasFocusMaybe.value;
  const cursorBlinkSpeed = 500;
  const synchronizedCursorVisibility$ = useMemo(
    () =>
      pipe(
        hasFocus$,
        map((hasFocus) => {
          if (hasFocus) {
            return pipe(
              resetSynchronizedCursorVisibility$,
              map<undefined, Source<boolean>>(() =>
                pipe(
                  interval(cursorBlinkSpeed),
                  map((i) => i % 2 === 1),
                  startWith([true]),
                ),
              ),
              switchEach,
            );
          }
          return ofEvent(Push(true));
        }),
        switchEach,
        debounce(() => ofEvent(End, scheduleMicrotask)),
        memoConsecutive(),
        share(),
      ),
    [],
  );
  if (isNone(selectionViewMaybe)) {
    return null;
  }
  const { viewCursorAndRangeInfos } = selectionViewMaybe.value;
  const { viewCursorAndRangeInfosForSelectionRanges } = viewCursorAndRangeInfos;
  if (viewCursorAndRangeInfosForSelectionRanges.length === 0) {
    return null;
  }
  const uniqueKeyControl = new UniqueKeyControl();
  const fragmentChildren: JSX.Element[] = [];
  for (let i = 0; i < viewCursorAndRangeInfosForSelectionRanges.length; i++) {
    const viewCursorAndRangeInfosForSelectionRange = viewCursorAndRangeInfosForSelectionRanges[i];
    const { viewCursorAndRangeInfosForRanges, isInComposition, selectionRangeId, roundCorners } = viewCursorAndRangeInfosForSelectionRange;
    for (let j = 0; j < viewCursorAndRangeInfosForRanges.length; j++) {
      const viewCursorAndRangeInfosForRange = viewCursorAndRangeInfosForRanges[j];
      const { viewParagraphInfos } = viewCursorAndRangeInfosForRange;
      for (let k = 0; k < viewParagraphInfos.length; k++) {
        const viewCursorAndRangeInfosForParagraphInRange = viewParagraphInfos[k];
        const { viewCursorInfos, viewRangeInfos } = viewCursorAndRangeInfosForParagraphInRange;
        for (let l = 0; l < viewRangeInfos.length; l++) {
          const viewRangeInfo = viewRangeInfos[l];
          const { paragraphLineIndex, paragraphReference, rectangle } = viewRangeInfo;
          let previousLineRect = viewRangeInfos[l - 1]?.rectangle as ViewRectangle | undefined;
          if (previousLineRect === undefined && k > 0) {
            const previousParagraphViewRangeInfos = viewCursorAndRangeInfosForRange.viewParagraphInfos[k - 1].viewRangeInfos;
            previousLineRect = previousParagraphViewRangeInfos[previousParagraphViewRangeInfos.length - 1]?.rectangle;
          }
          let nextLineRect = viewRangeInfos[l + 1]?.rectangle as ViewRectangle | undefined;
          if (nextLineRect === undefined && k < viewCursorAndRangeInfosForRange.viewParagraphInfos.length - 1) {
            const nextParagraphViewRangeInfos = viewCursorAndRangeInfosForRange.viewParagraphInfos[k + 1].viewRangeInfos;
            nextLineRect = nextParagraphViewRangeInfos[0]?.rectangle;
          }
          const key = uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, false]));
          const backgroundColor = isInComposition ? '#accef766' : hasFocus ? '#accef7cc' : '#d3d3d36c';
          if (isInComposition) {
            fragmentChildren.push(
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
          } else if (roundCorners) {
            pushCurvedLineRectSpans(fragmentChildren, previousLineRect, rectangle, nextLineRect, 4, key, backgroundColor);
            continue;
          }
          fragmentChildren.push(
            <span
              key={key}
              style={{
                position: 'absolute',
                top: rectangle.top,
                left: rectangle.left,
                width: rectangle.width,
                height: rectangle.height,
                backgroundColor,
              }}
            />,
          );
        }
        for (let l = 0; l < viewCursorInfos.length; l++) {
          const viewCursorInfo = viewCursorInfos[l];
          const { isAnchor, isFocus, isItalic, offset, paragraphReference, rangeDirection, insertTextConfig } = viewCursorInfo;
          fragmentChildren.push(
            <BlinkingCursor
              key={uniqueKeyControl.makeUniqueKey(
                JSON.stringify([paragraphReference.blockId, isAnchor, isFocus, offset, rangeDirection, selectionRangeId, insertTextConfig]),
              )}
              viewCursorInfo={viewCursorInfo}
              synchronizedCursorVisibility$={synchronizedCursorVisibility$}
              hasFocus={hasFocus}
              isItalic={isItalic}
            />,
          );
        }
      }
    }
  }
  return <>{fragmentChildren}</>;
}
interface BlinkingCursorProps {
  viewCursorInfo: ViewCursorInfo;
  synchronizedCursorVisibility$: Source<boolean>;
  hasFocus: boolean;
  isItalic: boolean;
}
function BlinkingCursor(props: BlinkingCursorProps): JSX.Element | null {
  const { viewCursorInfo, synchronizedCursorVisibility$, hasFocus, isItalic } = props;
  if (!viewCursorInfo.isFocus) {
    return null;
  }
  const isVisibleMaybe = use$(synchronizedCursorVisibility$, Some(true));
  const cursorWidth = 2;
  return (
    <span
      style={{
        position: 'absolute',
        top: viewCursorInfo.position.top,
        left: viewCursorInfo.position.left - cursorWidth / 2,
        width: cursorWidth,
        height: viewCursorInfo.height,
        backgroundColor: hasFocus ? '#222' : '#666',
        transform: isItalic ? 'skew(-7deg)' : undefined,
        visibility: isVisibleMaybe.value ? 'visible' : 'hidden',
      }}
    />
  );
}
interface SearchOverlayMatchInfo {
  viewRangeInfos: ViewRangeInfo[];
  isSelected: boolean;
  hasFocus: boolean;
}
interface SearchOverlayMessage {
  calculateMatchInfos: () => SearchOverlayMatchInfo[];
  roundCorners: boolean;
  renderSync: boolean;
  onRender?: () => void;
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
    (maybe) => {
      return isSome(maybe) && maybe.value.renderSync;
    },
  );
  if (isNone(searchOverlayMaybe)) {
    return null;
  }
  const { calculateMatchInfos, roundCorners, onRender } = searchOverlayMaybe.value;
  onRender?.();
  const matchInfos = calculateMatchInfos();
  const uniqueKeyControl = new UniqueKeyControl();
  const fragmentChildren: JSX.Element[] = [];
  for (let i = 0; i < matchInfos.length; i++) {
    const matchInfo = matchInfos[i];
    const { viewRangeInfos, isSelected, hasFocus } = matchInfo;
    for (let j = 0; j < viewRangeInfos.length; j++) {
      const viewRangeInfo = viewRangeInfos[j];
      const { rectangle, paragraphReference, paragraphLineIndex } = viewRangeInfo;
      const previousLineRect = viewRangeInfos[j - 1]?.rectangle;
      const nextLineRect = viewRangeInfos[j + 1]?.rectangle;
      const key = uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex]));
      const backgroundColor = hasFocus ? '#aa77ff' : isSelected ? '#aa77ff77' : '#f5c6ec';
      if (roundCorners) {
        pushCurvedLineRectSpans(fragmentChildren, previousLineRect, rectangle, nextLineRect, 4, key, backgroundColor);
        continue;
      }
      return (
        <span
          key={key}
          style={{
            position: 'absolute',
            top: rectangle.top,
            left: rectangle.left,
            width: rectangle.width,
            height: rectangle.height,
            backgroundColor,
          }}
        />
      );
    }
  }
  return <>{fragmentChildren}</>;
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
  goToSearchResultImmediatelySink: Sink<boolean>;
  querySink: Sink<string>;
  configSink: Sink<SearchBoxControlConfig>;
  goToPreviousMatchSink: Sink<undefined>;
  goToNextMatchSink: Sink<undefined>;
  closeSink: Sink<undefined>;
  isInCompositionSink: Sink<boolean>;
  changeQuery$: Source<string>;
  matchNumberMaybe$: CurrentValueSource<Maybe<number>>;
  totalMatchesMaybe$: CurrentValueSource<Maybe<TotalMatchesMessage>>;
  initialGoToSearchResultImmediately: boolean;
  initialQuery: string;
  initialConfig: SearchBoxControlConfig;
  inputRef: React.Ref<HTMLInputElement>;
}
function useToggle(initialValue = false): [value: boolean, toggleValue: () => void] {
  const [value, setValue] = useState<boolean>(initialValue);
  const toggleValue = useCallback(() => setValue((value) => !value), []);
  return [value, toggleValue];
}
const searchBoxMargin = 8;
function SearchBox(props: SearchBoxProps): JSX.Element | null {
  const {
    isVisible$,
    containerStaticViewRectangle$,
    goToSearchResultImmediatelySink,
    querySink,
    configSink,
    closeSink,
    goToPreviousMatchSink,
    goToNextMatchSink,
    isInCompositionSink,
    changeQuery$,
    matchNumberMaybe$,
    totalMatchesMaybe$,
    initialGoToSearchResultImmediately,
    initialQuery,
    initialConfig,
    inputRef,
  } = props;
  type Position = {
    width: number;
    dropDownPercent: number;
  };
  const calculateWidthFromContainerStaticViewRectangle = (rectangle: ViewRectangle): number => {
    return rectangle.width - searchBoxMargin * 2;
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
  const matchNumberMaybe = use$(matchNumberMaybe$, Some(matchNumberMaybe$.currentValue), true).value;
  const totalMatchesMaybe = use$(totalMatchesMaybe$, Some(totalMatchesMaybe$.currentValue), true).value;
  const [isOptionsShown, toggleIsOptionsShown] = useToggle();
  const tabIndex = position.dropDownPercent < 1 ? -1 : undefined;
  const [config, setConfigState] = useState(initialConfig.config);
  const setConfig = (newConfig: SingleParagraphPlainTextSearchControlConfig): void => {
    setConfigState(newConfig);
    configSink(
      Push({
        type: SearchBoxConfigType.SingleParagraphPlainText,
        config: newConfig,
      }),
    );
  };
  const [query, setQueryState] = useState(initialQuery);
  useEffect(() => {
    const sink = Sink<string>((event) => {
      if (event.type === ThrowType) {
        throw event.error;
      }
      if (event.type === EndType) {
        return;
      }
      const newQuery = event.value;
      setQueryState(newQuery);
    });
    changeQuery$(sink);
    return () => {
      sink.dispose();
    };
  }, [changeQuery$]);
  const setQuery = (newQuery: string): void => {
    setQueryState(newQuery);
    querySink(Push(newQuery));
  };
  const [loadingIndicatorState, setLoadingIndicatorState] = useState<number | null>(0);
  const isLoading = isSome(totalMatchesMaybe) && !totalMatchesMaybe.value.isComplete;
  useEffect(() => {
    setLoadingIndicatorState(null);
    if (!isLoading) {
      return;
    }
    const disposable = Disposable();
    setIntervalDisposable(
      () => {
        setLoadingIndicatorState((loadingIndicatorState) => (loadingIndicatorState === null ? 0 : loadingIndicatorState + 1) % 3);
      },
      300,
      disposable,
    );
    return () => {
      disposable.dispose();
    };
  }, [isLoading, query]);
  let resultInfoText: string;
  if (isSome(totalMatchesMaybe)) {
    if (isSome(matchNumberMaybe)) {
      resultInfoText = `${matchNumberMaybe.value} of ${totalMatchesMaybe.value.totalMatches}`;
    } else if (totalMatchesMaybe.value.totalMatches === 0) {
      resultInfoText = 'No matches';
    } else if (totalMatchesMaybe.value.totalMatches === 1) {
      resultInfoText = '1 match';
    } else {
      resultInfoText = `${totalMatchesMaybe.value.totalMatches} matches`;
    }
    if (!totalMatchesMaybe.value.isComplete && loadingIndicatorState !== null) {
      resultInfoText += '.'.repeat(loadingIndicatorState + 1);
    }
  } else {
    resultInfoText = ' '.repeat(15);
  }
  const searchBoxChildren: React.ReactNode[] = [];
  searchBoxChildren.push(
    <div className="search-box__line-container search-box__line-container--search" key="search">
      <div className="search-box__line-container--search__sub-container search-box__line-container--search__grow-dominate">
        <input
          type="search"
          className="search-box__search-input"
          onCompositionStart={() => isInCompositionSink(Push(true))}
          onCompositionEnd={() => isInCompositionSink(Push(false))}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Find in document"
          tabIndex={tabIndex}
          value={query}
          ref={inputRef}
        />
      </div>
      <div className="search-box__line-container--search__sub-container search-box__line-container--search__grow">
        <div className="search-box__line-container--search__sub-container">
          <span className="search-box__search-results-info">{resultInfoText}</span>
        </div>
        <div className="search-box__line-container--search__sub-container search-box__line-container--search__sub-container--justify-end search-box__line-container--search__grow">
          <div className="search-box__line-container--search__sub-container">
            <button
              className="search-box__button search-box__button--text"
              onClick={() => {
                toggleIsOptionsShown();
              }}
              tabIndex={tabIndex}
              aria-pressed={isOptionsShown ? true : false}
            >
              {isOptionsShown ? 'Hide Options' : 'Show Options'}
            </button>
          </div>
          <div className="search-box__line-container--search__sub-container">
            <button
              className="search-box__button search-box__button--icon"
              onClick={() => {
                goToPreviousMatchSink(Push(undefined));
              }}
              tabIndex={tabIndex}
            >
              <svg className="search-box__button--icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                <path
                  className="search-box__button--icon__path"
                  d="M201.4 137.4c12.5-12.5 32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L224 205.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160z"
                />
              </svg>
            </button>
            <button
              className="search-box__button search-box__button--icon"
              onClick={() => {
                goToNextMatchSink(Push(undefined));
              }}
              tabIndex={tabIndex}
            >
              <svg className="search-box__button--icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                <path
                  className="search-box__button--icon__path"
                  d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"
                />
              </svg>
            </button>
            <button
              className="search-box__button search-box__button--icon"
              onClick={() => {
                closeSink(Push(undefined));
              }}
              tabIndex={tabIndex}
            >
              <svg className="search-box__button--icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
                <path
                  className="search-box__button--icon__path"
                  d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>,
  );
  const options: [key: keyof SingleParagraphPlainTextSearchControlConfig, name: string, isInverted: boolean][] = [
    ['ignoreCase', 'Match Case', true],
    ['ignoreDiacritics', 'Match Diacritics', true],
    ['stripNonLettersAndNumbers', 'Strip Non Letters And Numbers', false],
    ['wholeWords', 'Whole Words', false],
    ['searchQueryWordsIndividually', 'Search Query Words Individually', false],
  ];
  const [goToSearchResultImmediately, setGoToSearchResultsImmediatelyState] = useState<boolean>(initialGoToSearchResultImmediately);
  const setGoToSearchResultsImmediately = (newGoToSearchResultImmediately: boolean): void => {
    setGoToSearchResultsImmediatelyState(newGoToSearchResultImmediately);
    goToSearchResultImmediatelySink(Push(newGoToSearchResultImmediately));
  };
  if (isOptionsShown) {
    searchBoxChildren.push(
      <div className="search-box__line-container search-box__line-container--options" key="options">
        {options.map(([configKey, readableName, isInverted], i) => {
          const getIsChecked = (value: boolean) => (isInverted ? !value : value);
          return (
            <label className="search-box__checkbox-container" key={configKey}>
              <input
                className="search-box__checkbox-input"
                type="checkbox"
                onChange={(event) => {
                  const isChecked = getIsChecked(event.target.checked);
                  setConfig({
                    ...config,
                    [configKey]: isChecked,
                  });
                }}
                checked={getIsChecked(config[configKey])}
              />
              <span className="search-box__checkbox-label">{readableName}</span>
            </label>
          );
        })}
        <label className="search-box__checkbox-container">
          <input
            className="search-box__checkbox-input"
            type="checkbox"
            onChange={(event) => {
              const isChecked = event.target.checked;
              setGoToSearchResultsImmediately(isChecked);
            }}
            checked={goToSearchResultImmediately}
          />
          <span className="search-box__checkbox-label">Go To Search Result Immediately</span>
        </label>
      </div>,
    );
  }
  return (
    <div
      className="search-box"
      style={
        {
          '--search-box_translate-y': `${searchBoxMargin * (position.dropDownPercent === 0 ? -100000 : 1.5 * Math.sqrt(position.dropDownPercent) - 0.5)}px`,
          '--search-box_opacity': isVisible$.currentValue ? 1 - (1 - position.dropDownPercent) ** 2 : position.dropDownPercent ** 2,
          '--search-box_margin': `${searchBoxMargin}px`,
          '--search-box_max-width': `${position.width}px`,
        } as React.CSSProperties
      }
    >
      {searchBoxChildren}
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
interface MeasuredParagraphLineRange {
  startOffset: number;
  endOffset: number;
  boundingRect: ViewRectangle;
  characterRectangles: ViewRectangle[];
  endsWithLineBreak: boolean;
}
interface RelativeParagraphMeasureCacheValue {
  characterRectangles: (ViewRectangle | null)[];
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
  MoveSelectionStartOfDocument = 'standard.moveSelectionStartOfDocument',
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
  ExtendSelectionStartOfDocument = 'standard.extendSelectionStartOfDocument',
  ExtendSelectionEndOfDocument = 'standard.extendSelectionEndOfDocument',
  RemoveSelectionGraphemeBackwards = 'standard.removeSelectionGraphemeBackwards',
  RemoveSelectionWordBackwards = 'standard.removeSelectionWordBackwards',
  RemoveSelectionGraphemeForwards = 'standard.removeSelectionGraphemeForwards',
  RemoveSelectionWordForwards = 'standard.removeSelectionWordForwards',
  RemoveSelectionSoftLineStart = 'standard.removeSelectionSoftLineStart',
  RemoveSelectionSoftLineEnd = 'standard.removeSelectionSoftLineEnd',
  TransposeGraphemes = 'standard.transposeGraphemes',
  InsertParagraphBelow = 'standard.insertParagraphBelow',
  InsertParagraphAbove = 'standard.insertParagraphAbove',
  SelectAll = 'standard.selectAll',
  InsertPlainText = 'standard.insertPlainText',
  InsertPastedPlainText = 'standard.insertPastedPlainText',
  InsertDroppedPlainText = 'standard.insertDroppedPlainText',
  InsertLineBreak = 'standard.insertLineBreak',
  SplitParagraph = 'standard.splitParagraph',
  Undo = 'standard.undo',
  Redo = 'standard.redo',
  CollapseMultipleSelectionRangesToAnchorRange = 'standard.collapseMultipleSelectionRangesToAnchorRange',
  CollapseMultipleSelectionRangesToFocusRange = 'standard.collapseMultipleSelectionRangesToFocusRange',
  OpenSearch = 'standard.openSearch',
  CloseSearch = 'standard.closeSearch',
  SearchCurrentFocusSelectionRange = 'standard.searchCurrentFocusSelectionRange',
  SelectAllInstancesOfWord = 'standard.selectAllInstancesOfWord',
  SelectAllInstancesOfSearchQuery = 'standard.selectAllInstancesOfSearchQuery',
  SelectNextInstanceOfWordAtFocus = 'standard.selectNextInstanceOfWordAtFocus',
  SelectPreviousInstanceOfWordAtFocus = 'standard.selectPreviousInstanceOfWordAtFocus',
  SelectNextInstanceOfSearchQuery = 'standard.selectNextInstanceOfSearchQuery',
  SelectPreviousInstanceOfSearchQuery = 'standard.selectPreviousInstanceOfSearchQuery',
  SelectNextSearchMatch = 'standard.selectNextSearchMatch',
  SelectPreviousSearchMatch = 'standard.selectPreviousSearchMatch',
  MoveCurrentBlocksAbove = 'standard.moveCurrentBlocksAbove',
  MoveCurrentBlocksBelow = 'standard.moveCurrentBlocksBelow',
  CloneCurrentBlocksAbove = 'standard.cloneCurrentBlocksAbove',
  CloneCurrentBlocksBelow = 'standard.cloneCurrentBlocksBelow',
  ApplyBold = 'standard.boldText',
  ApplyItalic = 'standard.applyItalic',
  ApplyUnderline = 'standard.applyUnderline',
  ApplyCode = 'standard.applyCode',
  ApplyStrikethrough = 'standard.applyStrikethrough',
  ApplySubscript = 'standard.applySubscript',
  ApplySuperscript = 'standard.applySuperscript',
  ResetInlineStyle = 'standard.resetInlineStyle',
  AlignParagraphLeft = 'standard.alignParagraphLeft',
  AlignParagraphRight = 'standard.alignParagraphRight',
  AlignParagraphCenter = 'standard.alignParagraphCenter',
  AlignParagraphJustify = 'standard.alignParagraphJustify',
  ToggleChecklistChecked = 'standard.toggleChecklistChecked',
  IncreaseListIndent = 'standard.increaseListIndent',
  DecreaseListIndent = 'standard.decreaseListIndent',
  ApplyBlockquote = 'standard.applyBlockquote',
  ApplyHeading1 = 'standard.applyHeading1',
  ApplyHeading2 = 'standard.applyHeading2',
  ApplyHeading3 = 'standard.applyHeading3',
  ApplyOrderedList = 'standard.applyOrderedList',
  ApplyUnorderedList = 'standard.applyUnorderedList',
  ApplyChecklist = 'standard.applyChecklist',
  ResetParagraphStyle = 'standard.resetParagraphStyle',
  KeyPressSpace = 'standard.keyPressSpace',
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
  InSearchBox = 'InSearchBox',
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
type KeyCommands = {
  key: string | null;
  command: string | null;
  platform?: Selector<Platform> | null;
  context?: Selector<Context> | null;
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
  {
    key: 'Shift?+Backspace',
    command: StandardCommand.RemoveSelectionGraphemeBackwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Alt+Shift?+Backspace,Control+Shift?+Backspace,Control+Alt+Shift?+Backspace',
    command: StandardCommand.RemoveSelectionWordBackwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Shift?+Delete', command: StandardCommand.RemoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  {
    key: 'Alt+Shift?+Delete,Control+Shift?+Delete,Control+Alt+Shift?+Delete',
    command: StandardCommand.RemoveSelectionWordForwards,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift?+Backspace',
    command: StandardCommand.RemoveSelectionSoftLineStart,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Meta+Shift?+Delete', command: StandardCommand.RemoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
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
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+KeyG',
    command: StandardCommand.SearchCurrentFocusSelectionRange,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift+KeyG',
    command: StandardCommand.SearchCurrentFocusSelectionRange,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Enter,Meta+KeyG',
    command: StandardCommand.SelectNextSearchMatch,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
  {
    key: 'Shift+Enter,Meta+Shift+KeyG',
    command: StandardCommand.SelectPreviousSearchMatch,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
  {
    key: 'Escape',
    command: StandardCommand.CloseSearch,
    platform: Platform.Apple,
    context: Context.InSearchBox,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Shift+KeyL',
    command: StandardCommand.SelectAllInstancesOfWord,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Alt+Enter,Meta+Shift+KeyL',
    command: StandardCommand.SelectAllInstancesOfSearchQuery,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Alt+Comma',
    command: StandardCommand.SelectPreviousInstanceOfWordAtFocus,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Alt+Period',
    command: StandardCommand.SelectNextInstanceOfWordAtFocus,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Alt+Comma',
    command: StandardCommand.SelectPreviousInstanceOfSearchQuery,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
  {
    key: 'Meta+Alt+Period',
    command: StandardCommand.SelectNextInstanceOfSearchQuery,
    platform: Platform.Apple,
    context: Context.Searching,
    cancelKeyEvent: true,
  },
  {
    key: 'Control+Alt+ArrowUp',
    command: StandardCommand.MoveCurrentBlocksAbove,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Control+Alt+ArrowDown',
    command: StandardCommand.MoveCurrentBlocksBelow,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Control+Alt+Shift+ArrowUp',
    command: StandardCommand.CloneCurrentBlocksBelow,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  {
    key: 'Control+Alt+Shift+ArrowDown',
    command: StandardCommand.CloneCurrentBlocksAbove,
    platform: Platform.Apple,
    context: Context.Editing,
    cancelKeyEvent: true,
  },
  { key: 'Meta+KeyB', command: StandardCommand.ApplyBold, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+KeyI', command: StandardCommand.ApplyItalic, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+KeyU', command: StandardCommand.ApplyUnderline, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+KeyJ', command: StandardCommand.ApplyCode, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+KeyX', command: StandardCommand.ApplyStrikethrough, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+Comma', command: StandardCommand.ApplySubscript, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Shift+Period', command: StandardCommand.ApplySuperscript, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Backslash', command: StandardCommand.ResetInlineStyle, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+Alt+KeyL', command: StandardCommand.AlignParagraphLeft, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+Alt+KeyE', command: StandardCommand.AlignParagraphCenter, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+Alt+KeyR', command: StandardCommand.AlignParagraphRight, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Control+Alt+KeyJ', command: StandardCommand.AlignParagraphJustify, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+BracketRight', command: StandardCommand.IncreaseListIndent, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+BracketLeft', command: StandardCommand.DecreaseListIndent, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit1', command: StandardCommand.ApplyHeading1, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit2', command: StandardCommand.ApplyHeading2, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit3', command: StandardCommand.ApplyHeading3, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit7', command: StandardCommand.ApplyUnorderedList, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit8', command: StandardCommand.ApplyOrderedList, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit9', command: StandardCommand.ApplyChecklist, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Digit0', command: StandardCommand.ApplyBlockquote, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Meta+Alt+Backslash', command: StandardCommand.ResetParagraphStyle, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
  { key: 'Alt?+Shift?+Space', command: StandardCommand.KeyPressSpace, platform: Platform.Apple, context: Context.Editing, cancelKeyEvent: true },
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
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
          undefined,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextBackwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionGraphemeForwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          undefined,
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
          undefined,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextForwards]: true },
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
      stateControl.queueUpdate(matita.makeInsertParagraphBelowOrAboveAtSelectionUpdateFn(stateControl, 'above'));
    },
  },
  [StandardCommand.InsertParagraphBelow]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeInsertParagraphBelowOrAboveAtSelectionUpdateFn(stateControl, 'below'));
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
  [StandardCommand.MoveCurrentBlocksAbove]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeSwitchOrCloneCurrentBlocksBelowOrAboveAtSelectionUpdateFn(stateControl, 'switch', 'above'));
    },
  },
  [StandardCommand.MoveCurrentBlocksBelow]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeSwitchOrCloneCurrentBlocksBelowOrAboveAtSelectionUpdateFn(stateControl, 'switch', 'below'));
    },
  },
  [StandardCommand.CloneCurrentBlocksAbove]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeSwitchOrCloneCurrentBlocksBelowOrAboveAtSelectionUpdateFn(stateControl, 'clone', 'above'));
    },
  },
  [StandardCommand.CloneCurrentBlocksBelow]: {
    execute(stateControl): void {
      stateControl.queueUpdate(matita.makeSwitchOrCloneCurrentBlocksBelowOrAboveAtSelectionUpdateFn(stateControl, 'clone', 'below'));
    },
  },
};
interface CommandInfo<Data> {
  commandName: string;
  data: Data;
}
interface InsertPlainTextCommandData {
  insertText: string;
}
function makeInsertPlainTextCommandInfo(insertText: string): CommandInfo<InsertPlainTextCommandData> {
  return {
    commandName: StandardCommand.InsertPlainText,
    data: {
      insertText,
    },
  };
}
interface InsertPastedPlainTextCommandData {
  pasteText: string;
}
function makeInsertPastedPlainTextCommandInfo(pasteText: string): CommandInfo<InsertPastedPlainTextCommandData> {
  return {
    commandName: StandardCommand.InsertPastedPlainText,
    data: {
      pasteText,
    },
  };
}
interface InsertDroppedPlainTextCommandData {
  dropText: string;
}
function makeInsertDroppedPlainTextCommandInfo(dropText: string): CommandInfo<InsertDroppedPlainTextCommandData> {
  return {
    commandName: StandardCommand.InsertDroppedPlainText,
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
  SelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft = 'virtualized.selectionChangeData.preserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft',
  SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId = 'virtualized.selectionRangeData.moveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId',
  SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds = 'virtualized.selectionChangeData.preserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds',
  SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId = 'virtualized.selectionRangeData.lineWrapFocusCursorWrapToNextLineWithExpirationId',
  SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds = 'virtualized.selectionChangeData.preserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds',
  SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId = 'virtualized.selectionRangeData.lineWrapAnchorCursorWrapToNextLineWithExpirationId',
}
function isSelectionChangeDataPreservingMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft(selectionChangeData: matita.SelectionChangeData): boolean {
  if (VirtualizedDataKey.SelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft in selectionChangeData) {
    const value = selectionChangeData[VirtualizedDataKey.SelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft];
    assert(value === true);
    return true;
  }
  return false;
}
function makeSelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftDataValue(): true {
  return true;
}
interface MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue {
  cursorOffsetLeft: number;
  expirationId: number;
}
function getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
  selectionRangeData: matita.SelectionRangeData,
): MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue | undefined {
  if (!(VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId in selectionRangeData)) {
    return;
  }
  const value = selectionRangeData[VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId];
  assert(
    value != null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'cursorOffsetLeft' in value &&
      typeof value.cursorOffsetLeft === 'number' &&
      'expirationId' in value &&
      typeof value.expirationId === 'number',
  );
  return value as MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue;
}
function makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
  cursorOffsetLeft: number,
  expirationId: number,
): MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue {
  return {
    cursorOffsetLeft,
    expirationId,
  };
}
interface LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  expirationId: number;
}
function getSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
  selectionChangeData: matita.SelectionChangeData,
): string[] {
  if (VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds in selectionChangeData) {
    const value = selectionChangeData[VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds];
    assert(Array.isArray(value) && value.every((item) => typeof item === 'string'));
    return value as string[];
  }
  return [];
}
function makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
  preservedSelectionRangeIds: string[],
): string[] {
  return preservedSelectionRangeIds;
}
function getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  selectionRangeData: matita.SelectionRangeData,
): LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue | undefined {
  if (!(VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId in selectionRangeData)) {
    return;
  }
  const value = selectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId];
  assert(value != null && typeof value === 'object' && !Array.isArray(value) && 'expirationId' in value && typeof value.expirationId === 'number');
  return value as LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue;
}
function makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  expirationId: number,
): LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  return {
    expirationId,
  };
}
interface LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  expirationId: number;
}
function getSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
  selectionChangeData: matita.SelectionChangeData,
): string[] {
  if (VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds in selectionChangeData) {
    const value = selectionChangeData[VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds];
    assert(Array.isArray(value) && value.every((item) => typeof item === 'string'));
    return value as string[];
  }
  return [];
}
function makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
  preservedSelectionRangeIds: string[],
): string[] {
  return preservedSelectionRangeIds;
}
function getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  selectionRangeData: matita.SelectionRangeData,
): LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue | undefined {
  if (!(VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId in selectionRangeData)) {
    return;
  }
  const value = selectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId];
  assert(value != null && typeof value === 'object' && !Array.isArray(value) && 'expirationId' in value && typeof value.expirationId === 'number');
  return value as LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue;
}
function makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  expirationId: number,
): LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  return {
    expirationId,
  };
}
function makeVirtualizedMoveSelectionBackwardsByPointTransformFnThroughFocusPointUpdateFn(
  documentRenderControl: VirtualizedDocumentRenderControl,
  shouldSelectionRangeCollapse: matita.ShouldSelectionRangeCollapseFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): matita.RunUpdateFn {
  return () => {
    const preserveAnchorLineWrapSelectionRangeIds: string[] = [];
    const preserveFocusLineWrapSelectionRangeIds: string[] = [];
    documentRenderControl.stateControl.delta.applyUpdate(
      matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
        documentRenderControl.stateControl,
        shouldSelectionRangeCollapse,
        pointTransformFn,
        (_oldSelectionRange, newSelectionRange) => {
          const newFocusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(newSelectionRange));
          if (matita.isParagraphPoint(newFocusPoint) && documentRenderControl.isParagraphPointAtWrappedLineWrapPoint(newFocusPoint)) {
            preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            return {
              ...newSelectionRange.data,
              [VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId]:
                makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                  documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
                ),
              [VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId]:
                makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                  documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
                ),
            };
          }
          return undefined;
        },
        (_oldSelection, _newSelection) => ({
          [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
            makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
              preserveAnchorLineWrapSelectionRangeIds,
            ),
          [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
            makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(preserveFocusLineWrapSelectionRangeIds),
        }),
      ),
    );
  };
}
function makeVirtualizedMoveSelectionSoftLineUpDownUpdateFn(
  documentRenderControl: VirtualizedDocumentRenderControl,
  pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
): matita.RunUpdateFn {
  return () => {
    const preserveAnchorLineWrapSelectionRangeIds: string[] = [];
    const preserveFocusLineWrapSelectionRangeIds: string[] = [];
    let horizontalOffset!: number;
    let isWrappedLineStart!: boolean;
    documentRenderControl.stateControl.delta.applyUpdate(
      matita.makeMoveSelectionByPointTransformFnThroughAnchorPointUpdateFn(
        documentRenderControl.stateControl,
        (_document, _stateControlConfig, _selectionRange) => false,
        (_document, _stateControlConfig, selectionRangeIntention, range, anchorPoint, selectionRange) => {
          const compareAnchorToFocusResult = matita.compareSelectionRangeAnchorToFocus(documentRenderControl.stateControl.stateView.document, selectionRange);
          const moveFromFocus =
            compareAnchorToFocusResult === matita.CompareKeysResult.OverlapSameNonText ||
            compareAnchorToFocusResult === matita.CompareKeysResult.OverlapSameText ||
            (pointMovement === matita.PointMovement.Previous
              ? compareAnchorToFocusResult === matita.CompareKeysResult.After
              : compareAnchorToFocusResult === matita.CompareKeysResult.Before);
          let cursorOffsetLeft: number | undefined;
          const cursorOffsetLeftDataValue = getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(selectionRange.data);
          if (
            cursorOffsetLeftDataValue !== undefined &&
            documentRenderControl.isSelectionSecondaryDataExpirationIdActive(cursorOffsetLeftDataValue.expirationId) &&
            moveFromFocus
          ) {
            cursorOffsetLeft = cursorOffsetLeftDataValue.cursorOffsetLeft;
          }
          let result: ReturnType<(typeof documentRenderControl)['transformPointSoftLineUpDownWithOffsetLeft']>;
          if (moveFromFocus) {
            const focusPoint = matita.getFocusPointFromRange(range);
            result = documentRenderControl.transformPointSoftLineUpDownWithOffsetLeft(
              pointMovement,
              selectionRangeIntention,
              range,
              focusPoint,
              selectionRange,
              cursorOffsetLeft,
              false,
            );
          } else {
            result = documentRenderControl.transformPointSoftLineUpDownWithOffsetLeft(
              pointMovement,
              selectionRangeIntention,
              range,
              anchorPoint,
              selectionRange,
              cursorOffsetLeft,
              true,
            );
          }
          horizontalOffset = result.horizontalOffset;
          isWrappedLineStart = result.isWrappedLineStart;
          return result.pointWithContentReference;
        },
        (_oldSelectionRange, newSelectionRange) => {
          const newSelectionRangeData: matita.SelectionRangeData = {
            ...newSelectionRange.data,
            [VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId]:
              makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
                horizontalOffset,
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              ),
          };
          if (isWrappedLineStart) {
            preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId] =
              makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              );
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              );
          }
          return newSelectionRangeData;
        },
        (_oldSelection, _newSelection) => {
          return {
            [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
              makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
                preserveAnchorLineWrapSelectionRangeIds,
              ),
            [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
              makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
                preserveFocusLineWrapSelectionRangeIds,
              ),
            [VirtualizedDataKey.SelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft]:
              makeSelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftDataValue(),
          };
        },
      ),
    );
  };
}
function makeVirtualizedExtendSelectionSoftLineUpDownUpdateFn(
  documentRenderControl: VirtualizedDocumentRenderControl,
  pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
): matita.RunUpdateFn {
  return () => {
    const preserveAnchorLineWrapSelectionRangeIds: string[] = [];
    const preserveFocusLineWrapSelectionRangeIds: string[] = [];
    let horizontalOffset!: number;
    let isWrappedLineStart!: boolean;
    documentRenderControl.stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.stateControl,
        (_document, _stateControlConfig, _selectionRange) => true,
        undefined,
        (_document, _stateControlConfig, selectionRangeIntention, range, focusPoint, selectionRange) => {
          let cursorOffsetLeft: number | undefined;
          const cursorOffsetLeftDataValue = getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(selectionRange.data);
          if (
            cursorOffsetLeftDataValue !== undefined &&
            documentRenderControl.isSelectionSecondaryDataExpirationIdActive(cursorOffsetLeftDataValue.expirationId)
          ) {
            cursorOffsetLeft = cursorOffsetLeftDataValue.cursorOffsetLeft;
          }
          const result = documentRenderControl.transformPointSoftLineUpDownWithOffsetLeft(
            pointMovement,
            selectionRangeIntention,
            range,
            focusPoint,
            selectionRange,
            cursorOffsetLeft,
            false,
          );
          horizontalOffset = result.horizontalOffset;
          isWrappedLineStart = result.isWrappedLineStart;
          return result.pointWithContentReference;
        },
        (oldSelectionRange, newSelectionRange) => {
          const newSelectionRangeData: matita.SelectionRangeData = {
            ...newSelectionRange.data,
            [VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId]:
              makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
                horizontalOffset,
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              ),
          };
          const oldAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(oldSelectionRange));
          if (matita.isParagraphPoint(oldAnchorPoint)) {
            const lineWrapAnchorCursorWrapToNextLineDataValue = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
              oldSelectionRange.data,
            );
            if (
              lineWrapAnchorCursorWrapToNextLineDataValue &&
              documentRenderControl.isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.expirationId)
            ) {
              preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            }
          }
          if (isWrappedLineStart) {
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              );
          }
          return newSelectionRangeData;
        },
        (_oldSelection, _newSelection) => {
          return {
            [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
              makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
                preserveAnchorLineWrapSelectionRangeIds,
              ),
            [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
              makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
                preserveFocusLineWrapSelectionRangeIds,
              ),
            [VirtualizedDataKey.SelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft]:
              makeSelectionChangeDataPreserveMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftDataValue(),
          };
        },
      ),
    );
  };
}
function makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
  documentRenderControl: VirtualizedDocumentRenderControl,
  shouldExtendSelectionRange: matita.ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): matita.RunUpdateFn {
  return () => {
    const preserveAnchorLineWrapSelectionRangeIds: string[] = [];
    const preserveFocusLineWrapSelectionRangeIds: string[] = [];
    documentRenderControl.stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.stateControl,
        shouldExtendSelectionRange,
        undefined,
        pointTransformFn,
        (oldSelectionRange, newSelectionRange) => {
          const newSelectionRangeData = { ...newSelectionRange.data };
          const oldAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(oldSelectionRange));
          if (matita.isParagraphPoint(oldAnchorPoint)) {
            const newAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(newSelectionRange));
            if (matita.arePointsEqual(oldAnchorPoint, newAnchorPoint)) {
              const lineWrapAnchorCursorWrapToNextLineDataValue = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                oldSelectionRange.data,
              );
              if (
                lineWrapAnchorCursorWrapToNextLineDataValue &&
                documentRenderControl.isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.expirationId)
              ) {
                preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
              }
            }
          }
          const newFocusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(newSelectionRange));
          if (matita.isParagraphPoint(newFocusPoint) && documentRenderControl.isParagraphPointAtWrappedLineWrapPoint(newFocusPoint)) {
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.makeActivatedSelectionSecondaryDataExpirationId(),
              );
          }
          return newSelectionRangeData;
        },
        (_oldSelection, _newSelection) => ({
          [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
            makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
              preserveAnchorLineWrapSelectionRangeIds,
            ),
          [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
            makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(preserveFocusLineWrapSelectionRangeIds),
        }),
      ),
    );
  };
}
function makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
  documentRenderControl: VirtualizedDocumentRenderControl,
  shouldExtendSelectionRange: matita.ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): matita.RunUpdateFn {
  return () => {
    const preserveAnchorLineWrapSelectionRangeIds: string[] = [];
    documentRenderControl.stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.stateControl,
        shouldExtendSelectionRange,
        undefined,
        pointTransformFn,
        (oldSelectionRange, newSelectionRange) => {
          const oldAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(oldSelectionRange));
          if (matita.isParagraphPoint(oldAnchorPoint)) {
            const newAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(newSelectionRange));
            if (matita.arePointsEqual(oldAnchorPoint, newAnchorPoint)) {
              const lineWrapAnchorCursorWrapToNextLineDataValue = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                oldSelectionRange.data,
              );
              if (
                lineWrapAnchorCursorWrapToNextLineDataValue &&
                documentRenderControl.isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.expirationId)
              ) {
                preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
              }
            }
          }
          return undefined;
        },
        (_oldSelection, _newSelection) => ({
          [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
            makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(
              preserveAnchorLineWrapSelectionRangeIds,
            ),
        }),
      ),
    );
  };
}
function makeInsertPlainTextAtSelectionUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  text: string,
  selection?: matita.Selection,
  treatAsSelection?: boolean,
): matita.RunUpdateFn {
  return () => {
    const lineTexts = text.split(/\r?\n/g).map((line) => line.replaceAll('\r', ''));
    const getContentFragmentFromSelectionRange = (
      customCollapsedSelectionTextConfig: TextConfig | null,
      selectionRange: matita.SelectionRange,
    ): matita.ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
      return matita.makeContentFragment(
        lineTexts.map((lineText) =>
          matita.makeContentFragmentParagraph(
            matita.makeParagraph(
              {},
              lineText === ''
                ? []
                : [
                    matita.makeText(
                      getInsertTextConfigAtSelectionRange(stateControl.stateView.document, customCollapsedSelectionTextConfig, selectionRange),
                      lineText,
                    ),
                  ],
              matita.generateId(),
            ),
          ),
        ),
      );
    };
    stateControl.delta.applyUpdate(
      () => {
        const { customCollapsedSelectionTextConfig } = stateControl.stateView;
        stateControl.delta.applyUpdate(
          matita.makeInsertContentFragmentAtSelectionUpdateFn(
            stateControl,
            (selectionRange) => {
              return getContentFragmentFromSelectionRange(customCollapsedSelectionTextConfig, selectionRange);
            },
            selection,
            treatAsSelection,
          ),
        );
      },
      { [matita.RedoUndoUpdateKey.InsertText]: true },
    );
  };
}
const serializeListIdAndNumberedIndentCombination = (listId: string, listIndent: NumberedListIndent): string => {
  return JSON.stringify([listId, listIndent]);
};
function makeApplyListTypeAtSelectionUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  topLevelContentReference: matita.ContentReference,
  listType: AccessedListStyleType,
  selection?: matita.Selection,
): matita.RunUpdateFn {
  return () => {
    const selectionAt = selection ?? stateControl.stateView.selection;
    const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, topLevelContentReference);
    const { paragraphReferenceRanges, isAllActive } = matita.calculateParagraphReferenceRangesAndIsAllActiveFromParagraphConfigToggle(
      stateControl.stateView.document,
      (paragraphConfig) =>
        paragraphConfig.type === ParagraphType.ListItem &&
        accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraphConfig) === listType,
      matita.getRangesInSelectionSorted(stateControl.stateView.document, selectionAt),
    );
    if (paragraphReferenceRanges.length === 0) {
      return;
    }
    if (isAllActive) {
      const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
      for (let i = 0; i < paragraphReferenceRanges.length; i++) {
        const paragraphReferenceRange = paragraphReferenceRanges[i];
        const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
        mutations.push(
          matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(firstParagraphReference, lastParagraphReference, resetListMergeParagraphConfig),
        );
      }
      const batchMutation = matita.makeBatchMutation(mutations);
      stateControl.delta.applyMutation(batchMutation);
      return;
    }
    matita.joinNeighboringParagraphReferenceRanges(stateControl.stateView.document, paragraphReferenceRanges);
    const handledExistingListIdAndNumberedIndentCombinations = new Set<string>();
    const topLevelContentConfigMutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const paragraphConfigMutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const nonWellDefinedListParagraphReferenceRanges: matita.ParagraphReferenceRange[] = [];
    const changedListIdAndNumberedIndentCombinations = new Set<string>();
    const listStyleTypeToStore = convertAccessedListStyleTypeToStoredListType(listType);
    for (let i = 0; i < paragraphReferenceRanges.length; i++) {
      const paragraphReferenceRange = paragraphReferenceRanges[i];
      const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
      const contentReference = matita.makeContentReferenceFromContent(
        matita.accessContentFromBlockReference(stateControl.stateView.document, firstParagraphReference),
      );
      const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, firstParagraphReference);
      const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, lastParagraphReference);
      let didSkip = true;
      for (let j = firstParagraphIndex; j <= lastParagraphIndex; j++) {
        const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, contentReference, j);
        if (matita.isParagraph(block) && block.config.type === ParagraphType.ListItem && typeof block.config.ListItem_listId === 'string') {
          const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel);
          const serializedListIdAndNumberedIndentCombination = serializeListIdAndNumberedIndentCombination(block.config.ListItem_listId, numberedIndentLevel);
          if (!handledExistingListIdAndNumberedIndentCombinations.has(serializedListIdAndNumberedIndentCombination)) {
            handledExistingListIdAndNumberedIndentCombinations.add(serializedListIdAndNumberedIndentCombination);
            const accessedListStyleType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, block.config);
            if (accessedListStyleType !== listType) {
              changedListIdAndNumberedIndentCombinations.add(serializedListIdAndNumberedIndentCombination);
              topLevelContentConfigMutations.push(
                matita.makeUpdateContentConfigMutation(
                  topLevelContentReference,
                  matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(
                    ['listStyles', 'listIdToStyle', block.config.ListItem_listId, 'indentLevelToStyle', String(numberedIndentLevel), 'type'],
                    listStyleTypeToStore,
                  ),
                ),
              );
            }
          }
          didSkip = true;
        } else {
          const paragraphReference = matita.makeBlockReferenceFromBlock(block);
          if (didSkip) {
            nonWellDefinedListParagraphReferenceRanges.push({
              firstParagraphReference: paragraphReference,
              lastParagraphReference: paragraphReference,
            });
            didSkip = false;
          } else {
            nonWellDefinedListParagraphReferenceRanges[nonWellDefinedListParagraphReferenceRanges.length - 1].lastParagraphReference = paragraphReference;
          }
        }
      }
    }
    const nonExistingListParagraphIdToListIdAndIndentMap = new Map<string, { listId: string; listIndent: NumberedListIndent }>();
    const getListIdFromParagraphIdAndConfigIfWellDefined = (paragraphId: string, paragraphConfig: ParagraphConfig): string | undefined => {
      const newMappedListInfo = nonExistingListParagraphIdToListIdAndIndentMap.get(paragraphId);
      if (newMappedListInfo !== undefined) {
        return newMappedListInfo.listId;
      }
      if (paragraphConfig.type !== ParagraphType.ListItem || typeof paragraphConfig.ListItem_listId !== 'string') {
        return undefined;
      }
      return paragraphConfig.ListItem_listId;
    };
    const getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType = (paragraphId: string, paragraphConfig: ParagraphConfig): string | undefined => {
      const newMappedListInfo = nonExistingListParagraphIdToListIdAndIndentMap.get(paragraphId);
      if (newMappedListInfo !== undefined) {
        return newMappedListInfo.listId;
      }
      if (paragraphConfig.type !== ParagraphType.ListItem || typeof paragraphConfig.ListItem_listId !== 'string') {
        return undefined;
      }
      const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraphConfig.ListItem_indentLevel);
      const serializedListIdAndNumberedIndentCombination = serializeListIdAndNumberedIndentCombination(paragraphConfig.ListItem_listId, numberedIndentLevel);
      if (
        changedListIdAndNumberedIndentCombinations.has(serializedListIdAndNumberedIndentCombination) ||
        accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraphConfig) === listType
      ) {
        return paragraphConfig.ListItem_listId;
      }
      return undefined;
    };
    const getListIndentFromParagraphIdAndConfig = (paragraphId: string, paragraphConfig: ParagraphConfig): NumberedListIndent => {
      const newMappedListInfo = nonExistingListParagraphIdToListIdAndIndentMap.get(paragraphId);
      if (newMappedListInfo !== undefined) {
        return newMappedListInfo.listIndent;
      }
      return convertStoredListIndentLevelToNumberedIndentLevel(paragraphConfig.ListItem_indentLevel);
    };
    const unhandledIndices = new Set<number>();
    const lookBackwardsIndices = new Set<number>();
    const lookForwardsIndices = new Set<number>();
    const pushSetAsListMutation = (
      firstParagraphReference: matita.BlockReference,
      lastParagraphReference: matita.BlockReference,
      listId: string,
      listIndent: NumberedListIndent,
      updateListIdMapping: boolean,
    ): void => {
      const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, firstParagraphReference);
      const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, firstParagraphReference);
      const contentReference = matita.makeContentReferenceFromContent(
        matita.accessContentFromBlockReference(stateControl.stateView.document, firstParagraphReference),
      );
      if (updateListIdMapping) {
        for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
          const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, contentReference, i);
          if (matita.isEmbed(block)) {
            continue;
          }
          nonExistingListParagraphIdToListIdAndIndentMap.set(block.id, { listId, listIndent });
        }
      }
      paragraphConfigMutations.push(
        matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(firstParagraphReference, lastParagraphReference, {
          type: ParagraphType.ListItem,
          ListItem_listId: listId,
          ListItem_indentLevel: convertNumberListIndentLevelToStoredListIndentLevel(listIndent),
          ListItem_Checklist_checked: undefined,
        }),
      );
    };
    for (let i = 0; i < nonWellDefinedListParagraphReferenceRanges.length; i++) {
      const paragraphReferenceRange = nonWellDefinedListParagraphReferenceRanges[i];
      const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
      const contentReference = matita.makeContentReferenceFromContent(
        matita.accessContentFromBlockReference(stateControl.stateView.document, firstParagraphReference),
      );
      let listId: string | undefined;
      let listIndent: NumberedListIndent | undefined;
      const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, firstParagraphReference);
      if (firstParagraphIndex > 0) {
        const previousBlockToFirstParagraph = matita.accessBlockAtIndexInContentAtContentReference(
          stateControl.stateView.document,
          contentReference,
          firstParagraphIndex - 1,
        );
        if (matita.isParagraph(previousBlockToFirstParagraph)) {
          listId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(previousBlockToFirstParagraph.id, previousBlockToFirstParagraph.config);
          if (listId === undefined) {
            if (firstParagraphIndex > 1) {
              const groupListId = getListIdFromParagraphIdAndConfigIfWellDefined(previousBlockToFirstParagraph.id, previousBlockToFirstParagraph.config);
              if (groupListId !== undefined) {
                lookBackwardsIndices.add(i);
              }
            }
          } else {
            listIndent = getListIndentFromParagraphIdAndConfig(previousBlockToFirstParagraph.id, previousBlockToFirstParagraph.config);
          }
        }
      }
      if (listId === undefined) {
        const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, lastParagraphReference);
        const numberOfBlocksInContent = matita.getNumberOfBlocksInContentAtContentReference(stateControl.stateView.document, contentReference);
        if (lastParagraphIndex < numberOfBlocksInContent - 1) {
          const nextBlockToLastParagraph = matita.accessBlockAtIndexInContentAtContentReference(
            stateControl.stateView.document,
            contentReference,
            lastParagraphIndex + 1,
          );
          if (matita.isParagraph(nextBlockToLastParagraph)) {
            listId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(nextBlockToLastParagraph.id, nextBlockToLastParagraph.config);
            if (listId === undefined) {
              if (lastParagraphIndex < numberOfBlocksInContent - 2) {
                const groupListId = getListIdFromParagraphIdAndConfigIfWellDefined(nextBlockToLastParagraph.id, nextBlockToLastParagraph.config);
                if (groupListId !== undefined) {
                  lookForwardsIndices.add(i);
                }
              }
            } else {
              lookBackwardsIndices.delete(i);
              listIndent = getListIndentFromParagraphIdAndConfig(nextBlockToLastParagraph.id, nextBlockToLastParagraph.config);
            }
          }
        }
      }
      if (listId === undefined) {
        unhandledIndices.add(i);
        continue;
      }
      assertIsNotNullish(listIndent);
      pushSetAsListMutation(firstParagraphReference, lastParagraphReference, listId, listIndent, true);
    }
    for (let indentLevel = 0; indentLevel <= maxListIndentLevel; indentLevel++) {
      if (lookBackwardsIndices.size === 0 && lookForwardsIndices.size === 0) {
        break;
      }
      if (lookBackwardsIndices.size > 0) {
        for (let i = 0; i < nonWellDefinedListParagraphReferenceRanges.length; i++) {
          if (!lookBackwardsIndices.has(i)) {
            continue;
          }
          const paragraphReferenceRange = nonWellDefinedListParagraphReferenceRanges[i];
          const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(stateControl.stateView.document, firstParagraphReference),
          );
          const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, firstParagraphReference);
          assert(firstParagraphIndex > 1);
          const previousBlockToFirstParagraph = matita.accessBlockAtIndexInContentAtContentReference(
            stateControl.stateView.document,
            contentReference,
            firstParagraphIndex - 1,
          );
          matita.assertIsParagraph(previousBlockToFirstParagraph);
          const previousBlockMatchingTypeListId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(
            previousBlockToFirstParagraph.id,
            previousBlockToFirstParagraph.config,
          );
          assert(previousBlockMatchingTypeListId === undefined);
          const groupListId = getListIdFromParagraphIdAndConfigIfWellDefined(previousBlockToFirstParagraph.id, previousBlockToFirstParagraph.config);
          assertIsNotNullish(groupListId);
          for (let j = firstParagraphIndex - 2; j >= 0; j--) {
            const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, contentReference, j);
            if (matita.isEmbed(block)) {
              break;
            }
            const potentialMatchingTypeListId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(block.id, block.config);
            if (potentialMatchingTypeListId !== undefined) {
              if (potentialMatchingTypeListId !== groupListId) {
                break;
              }
              const potentialIndentLevel = getListIndentFromParagraphIdAndConfig(block.id, block.config);
              if (potentialIndentLevel !== indentLevel) {
                continue;
              }
              unhandledIndices.delete(i);
              lookBackwardsIndices.delete(i);
              lookForwardsIndices.delete(i);
              pushSetAsListMutation(firstParagraphReference, lastParagraphReference, groupListId, indentLevel, true);
              break;
            }
            const potentialGroupListId = getListIdFromParagraphIdAndConfigIfWellDefined(block.id, block.config);
            if (potentialGroupListId !== groupListId) {
              break;
            }
          }
        }
      }
      if (lookForwardsIndices.size > 0) {
        for (let i = nonWellDefinedListParagraphReferenceRanges.length - 1; i >= 0; i--) {
          if (!lookForwardsIndices.has(i)) {
            continue;
          }
          const paragraphReferenceRange = nonWellDefinedListParagraphReferenceRanges[i];
          const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(stateControl.stateView.document, firstParagraphReference),
          );
          const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, lastParagraphReference);
          const numberOfBlocksInContent = matita.getNumberOfBlocksInContentAtContentReference(stateControl.stateView.document, contentReference);
          assert(lastParagraphIndex < numberOfBlocksInContent - 2);
          const nextBlockToLastParagraph = matita.accessBlockAtIndexInContentAtContentReference(
            stateControl.stateView.document,
            contentReference,
            lastParagraphIndex + 1,
          );
          matita.assertIsParagraph(nextBlockToLastParagraph);
          const nextBlockMatchingTypeListId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(
            nextBlockToLastParagraph.id,
            nextBlockToLastParagraph.config,
          );
          assert(nextBlockMatchingTypeListId === undefined);
          const groupListId = getListIdFromParagraphIdAndConfigIfWellDefined(nextBlockToLastParagraph.id, nextBlockToLastParagraph.config);
          assertIsNotNullish(groupListId);
          for (let j = lastParagraphIndex + 2; j < numberOfBlocksInContent; j++) {
            const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, contentReference, j);
            if (matita.isEmbed(block)) {
              break;
            }
            const potentialMatchingTypeListId = getListIdFromParagraphIdAndConfigIfWellDefinedAndTheRightListType(block.id, block.config);
            if (potentialMatchingTypeListId !== undefined) {
              if (potentialMatchingTypeListId !== groupListId) {
                break;
              }
              const potentialIndentLevel = getListIndentFromParagraphIdAndConfig(block.id, block.config);
              if (potentialIndentLevel !== indentLevel) {
                continue;
              }
              unhandledIndices.delete(i);
              lookBackwardsIndices.delete(i);
              lookForwardsIndices.delete(i);
              pushSetAsListMutation(firstParagraphReference, lastParagraphReference, groupListId, indentLevel, true);
              break;
            }
            const potentialGroupListId = getListIdFromParagraphIdAndConfigIfWellDefined(block.id, block.config);
            if (potentialGroupListId !== groupListId) {
              break;
            }
          }
        }
      }
    }
    if (unhandledIndices.size > 0) {
      for (let i = 0; i < nonWellDefinedListParagraphReferenceRanges.length; i++) {
        if (!unhandledIndices.has(i)) {
          continue;
        }
        const paragraphReferenceRange = nonWellDefinedListParagraphReferenceRanges[i];
        const { firstParagraphReference, lastParagraphReference } = paragraphReferenceRange;
        const listId = uuidV4();
        const listIndent = 0;
        topLevelContentConfigMutations.push(
          matita.makeUpdateContentConfigMutation(
            topLevelContentReference,
            matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(['listStyles', 'listIdToStyle', listId, 'indentLevelToStyle', '0', 'type'], listStyleTypeToStore),
          ),
        );
        pushSetAsListMutation(firstParagraphReference, lastParagraphReference, listId, listIndent, false);
      }
    }
    const nestedBatchMutations: matita.BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    if (topLevelContentConfigMutations.length > 0) {
      nestedBatchMutations.push(matita.makeBatchMutation(topLevelContentConfigMutations));
    }
    if (paragraphConfigMutations.length > 0) {
      nestedBatchMutations.push(matita.makeBatchMutation(paragraphConfigMutations));
    }
    const batchMutation = matita.makeBatchMutation(nestedBatchMutations);
    stateControl.delta.applyMutation(batchMutation);
  };
}
function makeRemoveSelectionBackwardsByPointTransformFnUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  shouldExtendSelectionRange: matita.ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  focusPointTransformFn?: matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): matita.RunUpdateFn {
  return () => {
    const removeBackwardsSelectionRanges: matita.SelectionRange[] = [];
    const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
      const selectionRange = stateControl.stateView.selection.selectionRanges[i];
      if (!matita.isSelectionRangeCollapsedInText(stateControl.stateView.document, selectionRange)) {
        removeBackwardsSelectionRanges.push(selectionRange);
        continue;
      }
      const collapsedRange = selectionRange.ranges[0];
      const point = collapsedRange.startPoint;
      matita.assertIsParagraphPoint(point);
      if (point.offset !== 0) {
        removeBackwardsSelectionRanges.push(selectionRange);
        continue;
      }
      const paragraph = matita.accessParagraphFromParagraphPoint(stateControl.stateView.document, point);
      if (paragraph.config.type === ParagraphType.ListItem) {
        const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
        mutations.push(matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, resetListMergeParagraphConfig));
        continue;
      }
      if (paragraph.config.type === ParagraphType.Blockquote) {
        const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
        mutations.push(matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, { type: undefined }));
        continue;
      }
      const alignment = convertStoredParagraphAlignmentToAccessedParagraphAlignment(paragraph.config.alignment);
      if (alignment === AccessedParagraphAlignment.Center || alignment === AccessedParagraphAlignment.Right) {
        const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
        mutations.push(matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, { alignment: undefined }));
        continue;
      }
      removeBackwardsSelectionRanges.push(selectionRange);
    }
    const applyNormalRemovalIfShould = (): void => {
      if (removeBackwardsSelectionRanges.length > 0) {
        const removeBackwardsSelection = matita.makeSelection(removeBackwardsSelectionRanges);
        stateControl.delta.applyUpdate(
          matita.makeRemoveSelectionByPointTransformFnsUpdateFn(
            stateControl,
            shouldExtendSelectionRange,
            undefined,
            focusPointTransformFn,
            removeBackwardsSelection,
          ),
        );
      }
    };
    if (mutations.length > 0) {
      stateControl.delta.applyUpdate(
        () => {
          const batchMutation = matita.makeBatchMutation(mutations);
          stateControl.delta.applyMutation(batchMutation);
          applyNormalRemovalIfShould();
        },
        { [matita.RedoUndoUpdateKey.UniqueGroupedUpdate]: matita.makeUniqueGroupedChangeType() },
      );
    } else {
      applyNormalRemovalIfShould();
    }
  };
}
const virtualizedCommandRegisterObject: Record<string, VirtualizedRegisteredCommand> = {
  [StandardCommand.MoveSelectionGraphemeBackwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedMoveSelectionBackwardsByPointTransformFnThroughFocusPointUpdateFn(
          documentRenderControl,
          (document, _stateControlConfig, selectionRange) =>
            shouldCollapseSelectionRangeInTextCommand(document, selectionRange) ? collapseSelectionRangeBackwards(document, selectionRange) : false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionWordBackwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedMoveSelectionBackwardsByPointTransformFnThroughFocusPointUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionGraphemeBackwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionWordBackwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphBackwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphStart]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.PreviousBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.RemoveSelectionGraphemeBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        makeRemoveSelectionBackwardsByPointTransformFnUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Previous),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextBackwards]: true },
      );
    },
  },
  [StandardCommand.RemoveSelectionWordBackwards]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        makeRemoveSelectionBackwardsByPointTransformFnUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) => !shouldCollapseSelectionRangeInTextCommand(document, selectionRange),
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous),
        ),
        { [matita.RedoUndoUpdateKey.RemoveTextBackwards]: true },
      );
    },
  },
  [StandardCommand.ExtendSelectionGraphemeForwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Grapheme, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionWordForwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphForwards]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionParagraphEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.Paragraph, matita.PointMovement.NextBoundByEdge),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionStartOfDocument]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionEndOfDocument]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          matita.makeDefaultPointTransformFn(matita.MovementGranularity.TopLevelContent, matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionSoftLineStart]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedMoveSelectionBackwardsByPointTransformFnThroughFocusPointUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionSoftLineEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
          stateControl,
          (_document, _stateControlConfig, _selectionRange) => false,
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.MoveSelectionSoftLineDown]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeVirtualizedMoveSelectionSoftLineUpDownUpdateFn(documentRenderControl, matita.PointMovement.Next));
    },
  },
  [StandardCommand.MoveSelectionSoftLineUp]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeVirtualizedMoveSelectionSoftLineUpDownUpdateFn(documentRenderControl, matita.PointMovement.Previous));
    },
  },
  [StandardCommand.ExtendSelectionSoftLineStart]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionBackwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionSoftLineEnd]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeVirtualizedExtendSelectionForwardsByFocusPointTransformFnUpdateFn(
          documentRenderControl,
          (_document, _stateControlConfig, _selectionRange) => true,
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.ExtendSelectionSoftLineDown]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeVirtualizedExtendSelectionSoftLineUpDownUpdateFn(documentRenderControl, matita.PointMovement.Next));
    },
  },
  [StandardCommand.ExtendSelectionSoftLineUp]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeVirtualizedExtendSelectionSoftLineUpDownUpdateFn(documentRenderControl, matita.PointMovement.Previous));
    },
  },
  [StandardCommand.RemoveSelectionSoftLineStart]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeRemoveSelectionBackwardsByPointTransformFnUpdateFn(
          stateControl,
          (document, _stateControlConfig, selectionRange) =>
            !shouldCollapseSelectionRangeInTextCommand(document, selectionRange) || matita.getIsSelectionRangeAnchorAfterFocus(document, selectionRange),
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
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
          undefined,
          documentRenderControl.makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.OpenSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.openSearch());
    },
  },
  [StandardCommand.CloseSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.closeSearch());
    },
  },
  [StandardCommand.SearchCurrentFocusSelectionRange]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.searchCurrentFocusSelectionRange());
    },
  },
  [StandardCommand.SelectAllInstancesOfWord]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectAllInstancesOfWord());
    },
  },
  [StandardCommand.SelectAllInstancesOfSearchQuery]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectAllInstancesOfSearchQuery());
    },
  },
  [StandardCommand.SelectNextInstanceOfWordAtFocus]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectNextInstanceOfWordAtFocus());
    },
  },
  [StandardCommand.SelectPreviousInstanceOfWordAtFocus]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectPreviousInstanceOfWordAtFocus());
    },
  },
  [StandardCommand.SelectNextInstanceOfSearchQuery]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectNextSearchMatch(true));
    },
  },
  [StandardCommand.SelectPreviousInstanceOfSearchQuery]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectPreviousSearchMatch(true));
    },
  },
  [StandardCommand.SelectNextSearchMatch]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectNextSearchMatch());
    },
  },
  [StandardCommand.SelectPreviousSearchMatch]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.selectPreviousSearchMatch());
    },
  },
  [StandardCommand.ApplyBold]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.bold === true,
          (isAllActive) => ({ bold: isAllActive ? undefined : true }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyItalic]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.italic === true,
          (isAllActive) => ({ italic: isAllActive ? undefined : true }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyUnderline]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.underline === true,
          (isAllActive) => ({ underline: isAllActive ? undefined : true }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyCode]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.code === true,
          (isAllActive) => ({ code: isAllActive ? undefined : true }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyStrikethrough]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.strikethrough === true,
          (isAllActive) => ({ strikethrough: isAllActive ? undefined : true }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplySubscript]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.script === TextConfigScript.Sub,
          (isAllActive) => ({ script: isAllActive ? undefined : TextConfigScript.Sub }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplySuperscript]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.script === TextConfigScript.Super,
          (isAllActive) => ({ script: isAllActive ? undefined : TextConfigScript.Super }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetInlineStyle]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.document, stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetMergeTextConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetMergeTextConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.AlignParagraphLeft]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => ({ alignment: undefined })),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.AlignParagraphRight]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => ({ alignment: StoredParagraphAlignment.Right })),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.AlignParagraphCenter]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => ({ alignment: StoredParagraphAlignment.Center })),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.AlignParagraphJustify]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => ({ alignment: StoredParagraphAlignment.Justify })),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ToggleChecklistChecked]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        () => {
          const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
          for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, stateControl.stateView.selection)) {
            const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            if (paragraph.config.type !== ParagraphType.ListItem) {
              continue;
            }
            const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, documentRenderControl.topLevelContentReference);
            const listStyleType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
            if (listStyleType !== AccessedListStyleType.Checklist) {
              continue;
            }
            const isChecked = paragraph.config.ListItem_Checklist_checked === true;
            const newIsChecked = isChecked === true ? true : undefined;
            mutations.push(
              matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, {
                ListItem_Checklist_checked: newIsChecked,
              }),
            );
          }
          if (mutations.length === 0) {
            return;
          }
          stateControl.delta.applyMutation(matita.makeBatchMutation(mutations));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.IncreaseListIndent]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
          for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, stateControl.stateView.selection)) {
            const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            if (paragraph.config.type === ParagraphType.ListItem) {
              const newIndentLevel = incrementStoredListIndent(paragraph.config.ListItem_indentLevel);
              assertIsNotNullish(newIndentLevel);
              if (paragraph.config.ListItem_indentLevel !== newIndentLevel) {
                mutations.push(
                  matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, {
                    ListItem_indentLevel: newIndentLevel,
                  }),
                );
              }
            }
          }
          if (mutations.length === 0) {
            return;
          }
          stateControl.delta.applyMutation(matita.makeBatchMutation(mutations));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.DecreaseListIndent]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
          for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, stateControl.stateView.selection)) {
            const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            if (paragraph.config.type === ParagraphType.ListItem) {
              const newIndentLevel = decrementStoredListIndent(paragraph.config.ListItem_indentLevel);
              if (paragraph.config.ListItem_indentLevel !== newIndentLevel) {
                mutations.push(
                  matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, {
                    ListItem_indentLevel: newIndentLevel,
                  }),
                );
              }
            }
          }
          if (mutations.length === 0) {
            return;
          }
          stateControl.delta.applyMutation(matita.makeBatchMutation(mutations));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyBlockquote]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Blockquote,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Blockquote }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHeading1]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading1,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading1 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHeading2]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading2,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading2 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHeading3]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading3,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading3 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyOrderedList]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, AccessedListStyleType.OrderedList),
        {
          [doNotScrollToSelectionAfterChangeDataKey]: true,
        },
      );
    },
  },
  [StandardCommand.ApplyUnorderedList]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, AccessedListStyleType.UnorderedList),
        {
          [doNotScrollToSelectionAfterChangeDataKey]: true,
        },
      );
    },
  },
  [StandardCommand.ApplyChecklist]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, AccessedListStyleType.Checklist),
        {
          [doNotScrollToSelectionAfterChangeDataKey]: true,
        },
      );
    },
  },
  [StandardCommand.ResetParagraphStyle]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          stateControl.delta.applyUpdate(matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => resetMergeParagraphConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.InsertPlainText]: {
    execute(stateControl, _viewControl, data: InsertPlainTextCommandData): void {
      const { insertText } = data;
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, insertText));
    },
  },
  [StandardCommand.InsertPastedPlainText]: {
    execute(stateControl, _viewControl, data: InsertPastedPlainTextCommandData): void {
      const { pasteText } = data;
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, pasteText));
    },
  },
  [StandardCommand.InsertDroppedPlainText]: {
    execute(stateControl, _viewControl, data: InsertDroppedPlainTextCommandData): void {
      const { dropText } = data;
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, dropText));
    },
  },
  [StandardCommand.InsertLineBreak]: {
    execute(stateControl): void {
      const getContentFragmentFromSelectionRange = (
        selectionRange: matita.SelectionRange,
      ): matita.ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
        return matita.makeContentFragment([
          matita.makeContentFragmentParagraph(
            matita.makeParagraph(
              {},
              [
                matita.makeText(
                  getInsertTextConfigAtSelectionRange(
                    stateControl.stateView.document,
                    stateControl.stateView.customCollapsedSelectionTextConfig,
                    selectionRange,
                  ),
                  '\n',
                ),
              ],
              matita.generateId(),
            ),
          ),
        ]);
      };
      stateControl.queueUpdate(() => {
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, getContentFragmentFromSelectionRange));
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
        stateControl.delta.applyUpdate(matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, () => contentFragment));
      });
    },
  },
  [StandardCommand.KeyPressSpace]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(() => {
        const minimumPartialParagraphPointOffsetMap = new Map<string, number>();
        for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = stateControl.stateView.selection.selectionRanges[i];
          for (let i = 0; i < selectionRange.ranges.length; i++) {
            const range = selectionRange.ranges[i];
            if (matita.isParagraphPoint(range.startPoint)) {
              const paragraphId = matita.getParagraphIdFromParagraphPoint(range.startPoint);
              const currentMinimum = minimumPartialParagraphPointOffsetMap.get(paragraphId) ?? Infinity;
              minimumPartialParagraphPointOffsetMap.set(paragraphId, Math.min(currentMinimum, range.startPoint.offset));
            }
            if (matita.isParagraphPoint(range.endPoint)) {
              const paragraphId = matita.getParagraphIdFromParagraphPoint(range.endPoint);
              const currentMinimum = minimumPartialParagraphPointOffsetMap.get(paragraphId) ?? Infinity;
              minimumPartialParagraphPointOffsetMap.set(paragraphId, Math.min(currentMinimum, range.endPoint.offset));
            }
          }
        }
        const trackedSelectionRangeIds = new Set<string>();
        for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = stateControl.stateView.selection.selectionRanges[i];
          if (!matita.isSelectionRangeCollapsedInText(stateControl.stateView.document, selectionRange)) {
            continue;
          }
          const collapsedRange = selectionRange.ranges[0];
          const point = collapsedRange.startPoint;
          matita.assertIsParagraphPoint(point);
          const paragraphId = matita.getParagraphIdFromParagraphPoint(point);
          const minimum = minimumPartialParagraphPointOffsetMap.get(paragraphId);
          assertIsNotNullish(minimum);
          if (point.offset !== minimum) {
            continue;
          }
          const paragraph = matita.accessParagraphFromParagraphPoint(stateControl.stateView.document, point);
          const inlineNodesBeforePoint = matita.sliceParagraphChildren(paragraph, 0, point.offset);
          if (!inlineNodesBeforePoint.every(matita.isText)) {
            continue;
          }
          const inlineNodeText = inlineNodesBeforePoint.map((textNode) => textNode.text).join('');
          if (
            inlineNodeText === '-' ||
            inlineNodeText === '*' ||
            inlineNodeText === '>' ||
            inlineNodeText === '#' ||
            inlineNodeText === '##' ||
            inlineNodeText === '###'
          ) {
            trackedSelectionRangeIds.add(selectionRange.id);
          }
        }
        stateControl.delta.applyUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, ' '));
        const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
        const applyUnorderedListSelectionRanges: matita.SelectionRange[] = [];
        const handledParagraphIds = new Set<string>();
        for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = stateControl.stateView.selection.selectionRanges[i];
          if (!trackedSelectionRangeIds.has(selectionRange.id) || !matita.isSelectionRangeCollapsedInText(stateControl.stateView.document, selectionRange)) {
            continue;
          }
          const collapsedRange = selectionRange.ranges[0];
          const point = collapsedRange.startPoint;
          matita.assertIsParagraphPoint(point);
          const paragraph = matita.accessParagraphFromParagraphPoint(stateControl.stateView.document, point);
          if (handledParagraphIds.has(paragraph.id)) {
            continue;
          }
          handledParagraphIds.add(paragraph.id);
          const inlineNodesBeforePoint = matita.sliceParagraphChildren(paragraph, 0, point.offset);
          if (!inlineNodesBeforePoint.every(matita.isText)) {
            continue;
          }
          const inlineNodeText = inlineNodesBeforePoint.map((textNode) => textNode.text).join('');
          if (inlineNodeText === '- ' || inlineNodeText === '* ') {
            if (paragraph.config.type === ParagraphType.ListItem) {
              continue;
            }
            const pointAtBeginningOfParagraph = matita.changeParagraphPointOffset(point, 0);
            mutations.push(matita.makeSpliceParagraphMutation(pointAtBeginningOfParagraph, point.offset, []));
            applyUnorderedListSelectionRanges.push(selectionRange);
            continue;
          }
          if (inlineNodeText === '> ' || inlineNodeText === '# ' || inlineNodeText === '## ' || inlineNodeText === '### ') {
            const newParagraphType =
              inlineNodeText === '> '
                ? ParagraphType.Blockquote
                : inlineNodeText === '# '
                ? ParagraphType.Heading1
                : inlineNodeText === '## '
                ? ParagraphType.Heading2
                : ParagraphType.Heading3;
            if (paragraph.config.type === newParagraphType) {
              continue;
            }
            const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
            const pointAtBeginningOfParagraph = matita.changeParagraphPointOffset(point, 0);
            mutations.push(
              matita.makeSpliceParagraphMutation(pointAtBeginningOfParagraph, point.offset, []),
              matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, { type: newParagraphType }),
            );
          }
        }
        if (mutations.length === 0) {
          return;
        }
        stateControl.delta.applyUpdate(
          () => {
            if (applyUnorderedListSelectionRanges.length > 0) {
              const applyUnorderedListSelection = matita.makeSelection(applyUnorderedListSelectionRanges);
              stateControl.delta.applyUpdate(
                makeApplyListTypeAtSelectionUpdateFn(
                  stateControl,
                  documentRenderControl.topLevelContentReference,
                  AccessedListStyleType.UnorderedList,
                  applyUnorderedListSelection,
                ),
              );
            }
            const batchMutation = matita.makeBatchMutation(mutations);
            stateControl.delta.applyMutation(batchMutation);
          },
          { [matita.RedoUndoUpdateKey.UniqueGroupedUpdate]: matita.makeUniqueGroupedChangeType() },
        );
      });
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
function indexOfNearestLessThanEqDynamic<V, N>(
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
      return mid;
    }
  }
  return target;
}
function indexOfNearestLessThanEq<V, N>(array: V[], needle: N, compare: (value: V, needle: N) => number, low = 0, high = array.length - 1): number {
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
      return mid;
    }
  }
  return target;
}
interface AdditionalMargins {
  visible: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  notVisible: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
}
function scrollCursorRectIntoView(
  cursorRect: ViewRectangle,
  scrollElement: HTMLElement,
  isScrollable: (element: Element) => boolean,
  getScrollElementAdditionalMargins: (element: Element) => AdditionalMargins,
  nestedCall?: boolean,
) {
  if (!nestedCall) {
    scrollElement = findScrollContainer(scrollElement, isScrollable);
    if (scrollElement !== document.body && scrollElement !== document.documentElement) {
      let s = scrollElement;
      while (true) {
        s = findScrollContainer(s, isScrollable);
        scrollCursorRectIntoView(cursorRect, s, isScrollable, getScrollElementAdditionalMargins, true);
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
  const additionalMarginsAll = getScrollElementAdditionalMargins(scrollElement);
  const cursorTop = cursorRect.top + yOffset - scrollElementTop;
  const cursorLeft = cursorRect.left + xOffset - scrollElementLeft;
  const isVisible = !(
    cursorLeft < xOffset ||
    cursorLeft + cursorRect.width + scrollElementBordersX > xOffset + width ||
    cursorTop < yOffset ||
    cursorTop + cursorRect.height + scrollElementBordersY > yOffset + height
  );
  const additionalMargins = isVisible ? additionalMarginsAll.visible : additionalMarginsAll.notVisible;
  let x: number;
  let y: number;
  if (cursorLeft - additionalMargins.left < xOffset) {
    x = cursorLeft - scrollElementPaddingLeft - additionalMargins.left;
  } else if (cursorLeft + cursorRect.width + scrollElementBordersX + additionalMargins.right > xOffset + width) {
    x = cursorLeft + scrollElementBordersX + scrollElementPaddingRight + additionalMargins.right - width;
  } else {
    x = xOffset;
  }
  if (cursorTop - additionalMargins.top < yOffset) {
    y = cursorTop - scrollElementPaddingTop - additionalMargins.top;
  } else if (cursorTop + cursorRect.height + scrollElementBordersY + additionalMargins.bottom > yOffset + height) {
    y = cursorTop + scrollElementBordersY + scrollElementPaddingBottom + additionalMargins.bottom + cursorRect.height - height;
  } else {
    y = yOffset;
  }
  if (x === xOffset && y === yOffset) {
    return;
  }
  // TODO: Browser scroll calculation errors on large scroll heights when cursor not fully visible in one axis but is in the other, e.g. to the right edge of
  // the screen in right aligned text.
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
  SelectionOrCustomCollapsedSelectionTextConfigAfterChange = 'SelectionOrCustomCollapsedSelectionTextConfigAfterChange',
  InsertPlainText = 'InsertPlainText',
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
    pipe(this.#stateControl.customCollapsedSelectionTextConfigChange$, subscribe(this.#onCustomCollapsedSelectionTextConfigChange.bind(this), this));
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
    this.#lastChangeType = LocalUndoControlLastChangeType.SelectionOrCustomCollapsedSelectionTextConfigAfterChange;
  }
  #onCustomCollapsedSelectionTextConfigChange(event: Event<matita.CustomCollapsedSelectionTextConfigChangeMessage<TextConfig>>): void {
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
    this.#lastChangeType = LocalUndoControlLastChangeType.SelectionOrCustomCollapsedSelectionTextConfigAfterChange;
  }
  #onAfterMutationPart(
    event: Event<matita.AfterMutationPartMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>,
  ): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { mutationPart, result, updateDataStack, afterMutation$, isFirstMutationPart, isLastMutationPart } = event.value;
    const lastUpdateData = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]) {
      return;
    }
    this.#redoStateDifferencesStack = [];
    let changeType: string;
    if (isSome(lastUpdateData) && !!lastUpdateData.value[matita.RedoUndoUpdateKey.InsertText]) {
      changeType = LocalUndoControlLastChangeType.InsertPlainText;
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
      this.#mutationResults.length > 0 &&
      ((this.#forceChange && this.#forceChange(changeType)) ||
        this.#lastChangeType === LocalUndoControlLastChangeType.Other ||
        (this.#lastChangeType && changeType !== this.#lastChangeType));
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
    if (result.didChange) {
      this.#mutationResults.push({
        mutationPart,
        result,
      });
    }
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
interface NumberedListItemInfo {
  paragraphId: string;
  indentLevel: NumberedListIndent;
}
// TODO: Insertion can be done more efficiently w/o binary search and instead directly through the tree as the blocks are ordered.
class NumberedListIndexer {
  #listItemInfos: IndexableUniqueStringList;
  #paragraphIdToNumber = Object.create(null) as Record<string, number>;
  #paragraphIdToIndentLevel = Object.create(null) as Record<string, NumberedListIndent>;
  #isDirty = false;
  constructor() {
    this.#listItemInfos = new IndexableUniqueStringList([]);
  }
  iterateParagraphIds(): IterableIterator<string> {
    return this.#listItemInfos.iterBetween(0, this.#listItemInfos.getLength() - 1);
  }
  markDirty(): void {
    this.#isDirty = true;
  }
  getIsDirty(): boolean {
    return this.#isDirty;
  }
  recomputeListNumbers(viewControl: VirtualizedViewControl, numberedIndentLevels: Map<number, number>): void {
    assert(this.#isDirty);
    const documentRenderControl = viewControl.accessDocumentRenderControl();
    const numberOfListItemInfos = this.#listItemInfos.getLength();
    const indices: number[] = Array<number>(maxListIndentLevel + 1);
    indices.fill(0);
    let previousIndentLevel = -1;
    for (let i = 0; i < numberOfListItemInfos; i++) {
      const paragraphId = this.#listItemInfos.access(i);
      const indentLevel = this.#paragraphIdToIndentLevel[paragraphId];
      const currentListItemIndex = this.#paragraphIdToNumber[paragraphId];
      if (previousIndentLevel > indentLevel) {
        for (let j = indentLevel + 1; j <= maxListIndentLevel; j++) {
          indices[j] = 0;
        }
      }
      const startNumber = numberedIndentLevels.get(indentLevel);
      if (startNumber !== undefined) {
        const newListItemIndex = startNumber + indices[indentLevel]++;
        if (currentListItemIndex !== newListItemIndex) {
          this.#paragraphIdToNumber[paragraphId] = newListItemIndex;
          const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
          const paragraphRenderControl = viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
          paragraphRenderControl.markDirtyContainer();
          documentRenderControl.dirtyParagraphIdQueue.queueIfNotQueuedAlready(paragraphId);
        }
      }
      previousIndentLevel = indentLevel;
    }
    this.#isDirty = false;
  }
  setListItemIndentLevel(paragraphId: string, indentLevel: NumberedListIndent): void {
    assert(this.#listItemInfos.has(paragraphId));
    const currentIndentLevel = this.#paragraphIdToIndentLevel[paragraphId];
    if (currentIndentLevel !== indentLevel) {
      this.#isDirty = true;
      this.#paragraphIdToIndentLevel[paragraphId] = indentLevel;
    }
  }
  insertListItems(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    listItemInfoToInsert: NumberedListItemInfo[],
  ): void {
    assert(listItemInfoToInsert.length > 0);
    const paragraphIdsToInsert: string[] = Array<string>(listItemInfoToInsert.length);
    for (let i = 0; i < listItemInfoToInsert.length; i++) {
      const listItemInfo = listItemInfoToInsert[i];
      assert(!this.#listItemInfos.has(listItemInfo.paragraphId));
      this.#paragraphIdToIndentLevel[listItemInfo.paragraphId] = listItemInfo.indentLevel;
      paragraphIdsToInsert[i] = listItemInfo.paragraphId;
    }
    this.#isDirty = true;
    const getCompareValueFromParagraphId = (paragraphId: string): number[] => {
      const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
      const contentReference = matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(document, paragraphReference));
      const pointKey = matita.makePointKeyFromPoint(document, contentReference, matita.makeBlockPointFromBlockReference(paragraphReference));
      return pointKey.indices;
    };
    const indexBeforeWhereFirstListItemToInsertWillBe = indexOfNearestLessThanEqDynamic<number[], number[]>(
      (index) => getCompareValueFromParagraphId(this.#listItemInfos.access(index)),
      this.#listItemInfos.getLength(),
      getCompareValueFromParagraphId(listItemInfoToInsert[0].paragraphId),
      (value, needle) => {
        for (let i = 0; i < value.length; i++) {
          const a = value[i];
          const b = needle[i];
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
        }
        throwUnreachable();
      },
    );
    this.#listItemInfos.insertBefore(indexBeforeWhereFirstListItemToInsertWillBe + 1, paragraphIdsToInsert);
  }
  onListItemRemoved(paragraphId: string): void {
    assert(this.#listItemInfos.has(paragraphId));
    this.#isDirty = true;
    const index = this.#listItemInfos.indexOf(paragraphId);
    this.#listItemInfos.remove(index, index);
    delete this.#paragraphIdToNumber[paragraphId];
    delete this.#paragraphIdToIndentLevel[paragraphId];
  }
  getListItemNumber(paragraphId: string): number {
    assert(this.#listItemInfos.has(paragraphId) && !this.#isDirty);
    const value = this.#paragraphIdToNumber[paragraphId];
    assertIsNotNullish(value);
    return value;
  }
  getItemCount(): number {
    return this.#listItemInfos.getLength();
  }
}
const SeparateSelectionIdKey = 'virtualized.separateSelectionId';
const SearchQueryGoToSearchResultImmediatelyKey = 'virtualized.searchQueryGoToSearchResultImmediately';
class VirtualizedDocumentRenderControl extends DisposableClass implements matita.DocumentRenderControl {
  rootHtmlElement: HTMLElement;
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  viewControl: VirtualizedViewControl;
  topLevelContentReference: matita.ContentReference;
  htmlElementToNodeRenderControlMap: Map<HTMLElement, VirtualizedContentRenderControl | VirtualizedParagraphRenderControl>;
  dirtyParagraphIdQueue: UniqueStringQueue;
  #numberedListIndexerMap: Map<string, NumberedListIndexer>;
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
  relativeParagraphMeasurementCache: LruCache<string, RelativeParagraphMeasureCacheValue>;
  #keyCommands: KeyCommands;
  #commandRegister: VirtualizedCommandRegister;
  #undoControl: LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  #graphemeSegmenter: IntlSegmenter;
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
    this.dirtyParagraphIdQueue = new UniqueStringQueue([]);
    this.#numberedListIndexerMap = new Map<string, NumberedListIndexer>();
    this.#selectionView$ = CurrentValueDistributor<SelectionViewMessage>({
      viewCursorAndRangeInfos: {
        viewCursorAndRangeInfosForSelectionRanges: [],
      },
      renderSync: false,
    });
    this.#searchOverlay$ = CurrentValueDistributor<SearchOverlayMessage>({
      calculateMatchInfos: () => [],
      renderSync: false,
      roundCorners: true,
    });
    this.relativeParagraphMeasurementCache = new LruCache(250);
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
    this.#graphemeSegmenter = new this.stateControl.stateControlConfig.IntlSegmenter();
  }
  #commitDirtyChanges(): void {
    let paragraphId: string | null;
    const topLevelContent = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
    const { listStyles } = topLevelContent.config;
    if (matita.isJsonMap(listStyles)) {
      const { listIdToStyle } = listStyles;
      if (matita.isJsonMap(listIdToStyle)) {
        // TODO: This loop happens on every measurement.
        for (const [listId, numberedListIndexer] of this.#numberedListIndexerMap.entries()) {
          if (!numberedListIndexer.getIsDirty()) {
            continue;
          }
          const stylesForListId = listIdToStyle[listId];
          if (matita.isJsonMap(stylesForListId)) {
            const numberedIndentLevels = new Map<number, number>();
            for (let indentLevel = 0; indentLevel <= maxListIndentLevel; indentLevel++) {
              const listStyleAtIndent = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                topLevelContent.config,
                listId,
                indentLevel as NumberedListIndent,
              );
              if (
                matita.isJsonMap(listStyleAtIndent) &&
                convertStoredListStyleTypeToAccessedListType(listStyleAtIndent.type) === AccessedListStyleType.OrderedList
              ) {
                const startNumber = convertStoredOrderedListStartNumberToAccessedStartNumber(listStyleAtIndent.OrderedList_startNumber);
                numberedIndentLevels.set(indentLevel, startNumber);
              }
            }
            if (numberedIndentLevels.size > 0) {
              numberedListIndexer.recomputeListNumbers(this.viewControl, numberedIndentLevels);
            }
          }
        }
      }
    }
    while ((paragraphId = this.dirtyParagraphIdQueue.shift()) !== null) {
      const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
      const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
      const injectedStyle: ParagraphStyleInjection = {};
      if (paragraph.config.type === ParagraphType.ListItem) {
        const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
        injectedStyle.ListItem_type = listType;
        if (listType === AccessedListStyleType.OrderedList) {
          assert(typeof paragraph.config.ListItem_listId === 'string');
          const numberedListIndexer = this.#numberedListIndexerMap.get(paragraph.config.ListItem_listId as string);
          assertIsNotNullish(numberedListIndexer);
          injectedStyle.ListItem_OrderedList_number = numberedListIndexer.getListItemNumber(paragraph.id);
        }
      }
      paragraphRenderControl.commitDirtyChanges(injectedStyle);
    }
  }
  #isDraggingSelection = false;
  #endSelectionDrag$ = Distributor<undefined>();
  #isOverflowClipNotSupported = false;
  #searchControl!: SingleParagraphPlainTextSearchControl;
  #isSearchElementContainerVisible$ = CurrentValueDistributor<boolean>(false);
  #searchElementTrackAllControl: TrackAllControl | null = null;
  #matchNumberMaybe$ = CurrentValueDistributor<Maybe<number>>(None);
  #totalMatchesMaybe$ = CurrentValueDistributor<Maybe<TotalMatchesMessage>>(None);
  #isSearchInComposition$ = CurrentValueDistributor<boolean>(false);
  #renderOverlayAsync = false;
  #changeQuery$ = Distributor<string>();
  #hasFocus$ = CurrentValueDistributor(false);
  #resetSynchronizedCursorVisibility$ = CurrentValueDistributor<undefined>(undefined);
  init(): void {
    const registerParagraphAtParagraphIdWithListIdAndNumberedListIndent = (paragraphId: string, listId: string, indentLevel: NumberedListIndent) => {
      let indexer = this.#numberedListIndexerMap.get(listId);
      if (indexer === undefined) {
        indexer = new NumberedListIndexer();
        this.#numberedListIndexerMap.set(listId, indexer);
      }
      indexer.insertListItems(this.stateControl.stateView.document, [{ paragraphId, indentLevel }]);
    };
    const unregisterParagraphAtParagraphIdWithListId = (paragraphId: string, listId: string) => {
      const indexer = this.#numberedListIndexerMap.get(listId);
      assertIsNotNullish(indexer);
      indexer.onListItemRemoved(paragraphId);
      if (indexer.getItemCount() === 0) {
        this.#numberedListIndexerMap.delete(listId);
      }
    };
    for (const paragraphReference of matita.iterContentSubParagraphs(this.stateControl.stateView.document, this.topLevelContentReference)) {
      const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      if (paragraph.config.type === ParagraphType.ListItem && typeof paragraph.config.ListItem_listId === 'string') {
        registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
          paragraph.id,
          paragraph.config.ListItem_listId,
          convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel),
        );
      }
    }
    const untrackNumberedListBlocksBeforeRemoved = (blockReferences: matita.BlockReference[]): void => {
      for (let i = 0; i < blockReferences.length; i++) {
        const blockReference = blockReferences[i];
        const block = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, blockReference);
        if (matita.isParagraph(block) && block.config.type === ParagraphType.ListItem && typeof block.config.ListItem_listId === 'string') {
          unregisterParagraphAtParagraphIdWithListId(block.id, block.config.ListItem_listId);
        }
      }
    };
    const trackNumberedListBlocksAfterInserted = (blockReferences: matita.BlockReference[]): void => {
      for (let i = 0; i < blockReferences.length; i++) {
        const blockReference = blockReferences[i];
        const block = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, blockReference);
        if (matita.isParagraph(block) && block.config.type === ParagraphType.ListItem && typeof block.config.ListItem_listId === 'string') {
          registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
            block.id,
            block.config.ListItem_listId,
            convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel),
          );
        }
      }
    };
    pipe(
      this.stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const message = event.value;
        for (let i = 0; i < message.viewDelta.changes.length; i++) {
          const change = message.viewDelta.changes[i];
          switch (change.type) {
            case matita.ViewDeltaChangeType.BlocksInserted: {
              const { blockReferences } = change;
              pipe(
                this.stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === PushType) {
                    trackNumberedListBlocksAfterInserted(blockReferences);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlocksMoved: {
              const { blockReferences } = change;
              untrackNumberedListBlocksBeforeRemoved(blockReferences);
              pipe(
                this.stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === PushType) {
                    trackNumberedListBlocksAfterInserted(blockReferences);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
              const { blockReference } = change;
              if (change.isParagraphChildrenUpdated) {
                break;
              }
              let block = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, blockReference);
              if (matita.isEmbed(block)) {
                break;
              }
              const configBefore = block.config;
              pipe(
                this.stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  block = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, blockReference);
                  matita.assertIsParagraph(block);
                  const configAfter = block.config;
                  if (configAfter.type === ParagraphType.ListItem && typeof configAfter.ListItem_listId === 'string') {
                    const currentListId = configAfter.ListItem_listId;
                    if (configBefore.type === ParagraphType.ListItem && typeof configBefore.ListItem_listId === 'string') {
                      const previousListId = configBefore.ListItem_listId;
                      if (previousListId === currentListId) {
                        const previousIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(configBefore.ListItem_indentLevel);
                        const currentIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(configAfter.ListItem_indentLevel);
                        if (previousIndentLevel !== currentIndentLevel) {
                          const indexer = this.#numberedListIndexerMap.get(currentListId);
                          assertIsNotNullish(indexer);
                          indexer.setListItemIndentLevel(block.id, currentIndentLevel);
                        }
                      } else {
                        unregisterParagraphAtParagraphIdWithListId(block.id, previousListId);
                        registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
                          block.id,
                          currentListId,
                          convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel),
                        );
                      }
                    } else {
                      registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
                        block.id,
                        currentListId,
                        convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel),
                      );
                    }
                  } else if (configBefore.type === ParagraphType.ListItem && typeof configBefore.ListItem_listId === 'string') {
                    const previousListId = configBefore.ListItem_listId;
                    unregisterParagraphAtParagraphIdWithListId(block.id, previousListId);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlocksRemoved: {
              const { blockReferences } = change;
              untrackNumberedListBlocksBeforeRemoved(blockReferences);
              break;
            }
            case matita.ViewDeltaChangeType.ContentsInserted: {
              const { contentReferences } = change;
              pipe(
                this.stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  for (let i = 0; i < contentReferences.length; i++) {
                    const contentReference = contentReferences[i];
                    for (const paragraphReference of matita.iterContentSubParagraphs(this.stateControl.stateView.document, contentReference)) {
                      const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
                      matita.assertIsParagraph(paragraph);
                      if (paragraph.config.type === ParagraphType.ListItem && typeof paragraph.config.ListItem_listId === 'string') {
                        registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
                          paragraph.id,
                          paragraph.config.ListItem_listId,
                          convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel),
                        );
                      }
                    }
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.ContentsRemoved: {
              const { contentReferences } = change;
              for (let i = 0; i < contentReferences.length; i++) {
                const contentReference = contentReferences[i];
                for (const paragraphReference of matita.iterContentSubParagraphs(this.stateControl.stateView.document, contentReference)) {
                  const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
                  matita.assertIsParagraph(paragraph);
                  if (paragraph.config.type === ParagraphType.ListItem && typeof paragraph.config.ListItem_listId === 'string') {
                    unregisterParagraphAtParagraphIdWithListId(paragraph.id, paragraph.config.ListItem_listId);
                  }
                }
              }
              break;
            }
            case matita.ViewDeltaChangeType.ContentConfigUpdated: {
              const { contentReference } = change;
              if (!matita.areContentReferencesAtSameContent(contentReference, this.topLevelContentReference)) {
                break;
              }
              let content = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
              const configBefore = content.config;
              pipe(
                this.stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  content = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
                  const configAfter = content.config;
                  if (configBefore.listStyles === configAfter.listStyles) {
                    return;
                  }
                  for (const [listId, numberedListIndexer] of this.#numberedListIndexerMap.entries()) {
                    for (let indentLevel = 0; indentLevel <= maxListIndentLevel; indentLevel++) {
                      const previousListType = accessListStyleTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                        configBefore,
                        listId,
                        indentLevel as NumberedListIndent,
                      );
                      const listType = accessListStyleTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                        configAfter,
                        listId,
                        indentLevel as NumberedListIndent,
                      );
                      if (previousListType === listType) {
                        if (listType === AccessedListStyleType.OrderedList) {
                          const previousListStartNumber = accessOrderedListStartNumberInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                            configBefore,
                            listId,
                            indentLevel as NumberedListIndent,
                          );
                          const listStartNumber = accessOrderedListStartNumberInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                            configAfter,
                            listId,
                            indentLevel as NumberedListIndent,
                          );
                          if (previousListStartNumber !== listStartNumber) {
                            for (const paragraphId of numberedListIndexer.iterateParagraphIds()) {
                              const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
                              const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
                              matita.assertIsParagraph(paragraph);
                              if (convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel) === indentLevel) {
                                numberedListIndexer.markDirty();
                                const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
                                paragraphRenderControl.markDirtyContainer();
                                this.dirtyParagraphIdQueue.queueIfNotQueuedAlready(paragraphId);
                              }
                            }
                          }
                        }
                      } else {
                        for (const paragraphId of numberedListIndexer.iterateParagraphIds()) {
                          const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
                          const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
                          matita.assertIsParagraph(paragraph);
                          if (convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel) === indentLevel) {
                            if (listType === AccessedListStyleType.OrderedList) {
                              numberedListIndexer.markDirty();
                            }
                            const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
                            paragraphRenderControl.markDirtyContainer();
                            this.dirtyParagraphIdQueue.queueIfNotQueuedAlready(paragraphId);
                          }
                        }
                      }
                    }
                  }
                }, this),
              );
            }
          }
        }
      }, this),
    );
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
    addEventListener(this.#inputTextElement, 'blur', this.#onInputElementBlur.bind(this), this);
    addWindowEventListener('compositionstart', this.#onCompositionStart.bind(this), this);
    addWindowEventListener('compositionend', this.#onCompositionEnd.bind(this), this);
    addWindowEventListener('focus', () => this.#onWindowFocus.bind(this), this);
    addWindowEventListener('blur', this.#onWindowBlur.bind(this), this);
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
      element.style.userSelect = 'none';
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
    let currentDebounceSink: Sink<unknown>;
    let currentDebounceTimer$: Distributor<never>;
    pipe(
      pointerDownLeft$,
      windowScheduledBySource(
        pipe(
          pointerDownLeft$,
          debounce(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              currentDebounceTimer$?.dispose();
              currentDebounceTimer$ = Distributor<never>();
              pipe(timer(400), subscribe(currentDebounceTimer$));
              return Source((debounceSink) => {
                currentDebounceSink = debounceSink;
                currentDebounceTimer$(debounceSink);
              });
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
            const position = this.#calculatePositionFromViewPosition(viewPosition, false);
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
            let didEndSelectionDragManually = false;
            const endSelectionDrag = (): void => {
              didEndSelectionDragManually = true;
              this.#isDraggingSelection = false;
              endSelectionDragDisposable.dispose();
              currentDebounceTimer$(End);
            };
            currentDebounceSink.add(
              Disposable(() => {
                pointerCaptureDisposable.add(endSelectionDragDisposable);
              }),
            );
            pipe(
              currentDebounceTimer$,
              subscribe((event) => {
                assert(event.type === EndType);
                pointerCaptureDisposable.add(
                  Disposable(() => {
                    // TODO.
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        dragState = undefined;
                      });
                    });
                  }),
                );
              }, Disposable()),
            );
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
                this.stateControl.queueUpdate(() => {
                  assertIsNotNullish(dragState);
                  endSelectionDrag();
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
                const position = this.#calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold);
                queueSelectionUpdate(
                  position && {
                    position,
                    stateView: this.stateControl.snapshotStateThroughStateView(),
                  },
                );
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
            const calculateSelection = (endPointInfo: PointInfo | null): matita.Selection | null => {
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
              const originalIsWrappedLinePreviousEnd = (endPointInfo ?? dragState.lastPointInfo).position.isWrappedLinePreviousEnd;
              endPointInfo = null;
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
                const anchorRange = matita.getAnchorRangeFromSelectionRange(selectionRangeToExtend);
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
              let isFocusWrappedLineStart: boolean;
              if (dragState.selectionType === 'grapheme') {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalEndPointWithContentReference;
                isFocusWrappedLineStart = originalIsWrappedLineStart;
              } else if (
                matita.isParagraphPoint(originalStartPointWithContentReference.point) &&
                matita.arePointWithContentReferencesEqual(originalStartPointWithContentReference, originalEndPointWithContentReference) &&
                matita.getParagraphLength(
                  matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, originalStartPointWithContentReference.point),
                ) === 0
              ) {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalStartPointWithContentReference;
                isFocusWrappedLineStart = false;
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
                  isFocusWrappedLineStart = originalIsWrappedLineStart
                    ? isBackward
                      ? matita.arePointWithContentReferencesEqual(originalFirstPointWithContentReference, firstPointWithContentReference)
                      : matita.arePointWithContentReferencesEqual(originalSecondPointWithContentReference, secondPointWithContentReference)
                    : isBackward && !originalIsWrappedLinePreviousEnd;
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
                  isFocusWrappedLineStart = false;
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
                  isFocusWrappedLineStart
                    ? {
                        [VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId]:
                          makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(this.makeActivatedSelectionSecondaryDataExpirationId()),
                      }
                    : undefined,
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
            const queueSelectionUpdate = (endPointInfo: PointInfo | null): void => {
              this.#isDraggingSelection = !endPointInfo;
              this.stateControl.queueUpdate(() => {
                if (didEndSelectionDragManually) {
                  return;
                }
                const newSelection = calculateSelection(endPointInfo);
                if (!newSelection) {
                  endPointInfo = null;
                  return;
                }
                const allSelectionIds = newSelection.selectionRanges.map((selectionRange) => selectionRange.id);
                this.stateControl.delta.setSelection(newSelection, undefined, {
                  [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
                    makeSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(allSelectionIds),
                  [VirtualizedDataKey.SelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIds]:
                    makeSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(allSelectionIds),
                });
                endPointInfo = null;
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
                const position = this.#calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold);
                if (position) {
                  dragState.lastPointInfo = {
                    position,
                    stateView: this.stateControl.snapshotStateThroughStateView(),
                  };
                  queueSelectionUpdate(null);
                }
              }, pointerCaptureDisposable),
            );
            if (!position) {
              return;
            }
            let pointInfo: PointInfo | null = {
              position,
              stateView: this.stateControl.snapshotStateThroughStateView(),
            };
            if (dragState) {
              dragState.lastPointInfo = pointInfo;
              pointInfo = null;
              queueSelectionUpdate(null);
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
            pointInfo = null;
            queueSelectionUpdate(null);
          }, this),
        );
      }, this),
    );
    this.#commitDirtyChanges();
    this.#topLevelContentViewContainerElement.appendChild(topLevelContentRenderControl.containerHtmlElement);
    const renderReactNodeIntoHtmlContainerElement = (element: React.ReactNode, containerElement: HTMLElement, identifierPrefix: string): void => {
      const root = createRoot(containerElement, {
        identifierPrefix,
      });
      root.render(element);
      this.add(
        Disposable(() => {
          root.unmount();
        }),
      );
    };
    renderReactNodeIntoHtmlContainerElement(
      <SelectionView
        selectionView$={this.#selectionView$}
        hasFocus$={this.#hasFocus$}
        resetSynchronizedCursorVisibility$={this.#resetSynchronizedCursorVisibility$}
      />,
      this.#selectionViewContainerElement,
      'selection-view-',
    );
    renderReactNodeIntoHtmlContainerElement(<SearchOverlay searchOverlay$={this.#searchOverlay$} />, this.#searchOverlayContainerElement, 'search-overlay-');
    this.#searchElementContainerElement = document.createElement('div');
    this.#containerHtmlElement.style.position = 'relative';
    this.#containerHtmlElement.append(
      this.#inputTextElementMeasurementElement,
      this.#searchOverlayContainerElement,
      this.#selectionViewContainerElement,
      this.#topLevelContentViewContainerElement,
      this.#inputTextElement,
      this.#searchElementContainerElement,
    );
    let searchContainerStaticViewRectangle$: CurrentValueDistributor<ViewRectangle> | undefined;
    const calculateCurrentSearchContainerStaticViewRectangle = (): ViewRectangle => {
      const { visibleTop, visibleBottom } = this.#getVisibleTopAndBottom();
      const { visibleLeft, visibleRight } = this.#getVisibleLeftAndRight();
      return makeViewRectangle(visibleLeft, visibleTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
    };
    const initialGoToSearchResultImmediately = true;
    const initialQuery = '';
    const initialSearchControlConfig: SingleParagraphPlainTextSearchControlConfig = {
      ignoreCase: true,
      ignoreDiacritics: true,
      stripNonLettersAndNumbers: false,
      searchQueryWordsIndividually: false,
      wholeWords: false,
    };
    this.#searchControl = new SingleParagraphPlainTextSearchControl(this.stateControl, initialQuery, initialSearchControlConfig, this.topLevelContentReference);
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
      let goToSearchResultImmediately = initialGoToSearchResultImmediately as boolean;
      let goToSearchResultImmediatelyCancelDisposable: Disposable | null;
      if (goToSearchResultImmediately) {
        goToSearchResultImmediatelyCancelDisposable = Disposable();
        this.add(goToSearchResultImmediatelyCancelDisposable);
      }
      const goToSearchResultImmediatelySink = Sink<boolean>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        goToSearchResultImmediately = event.value;
        if (goToSearchResultImmediately) {
          goToSearchResultImmediatelyCancelDisposable = Disposable();
          this.add(goToSearchResultImmediatelyCancelDisposable);
        } else {
          assertIsNotNullish(goToSearchResultImmediatelyCancelDisposable);
          goToSearchResultImmediatelyCancelDisposable.dispose();
        }
      });
      let anchoredStateView: [matita.Selection, matita.StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>] | null =
        null;
      let matchDisposable: Disposable | null = null;
      let currentTryGoToSearchResultImmediatelyRequestIndex = -1;
      const tryGoToSearchResultImmediately = (): void => {
        if (!goToSearchResultImmediately || !this.#searchElementTrackAllControl) {
          return;
        }
        assertIsNotNullish(goToSearchResultImmediatelyCancelDisposable);
        if (anchoredStateView === null) {
          if (!this.#isInSearchBox()) {
            return;
          }
          anchoredStateView = [this.stateControl.stateView.selection, this.stateControl.snapshotStateThroughStateView()];
          const resetAnchoredStateViewDisposable = Disposable(() => {
            anchoredStateView = null;
          });
          this.add(resetAnchoredStateViewDisposable);
          goToSearchResultImmediatelyCancelDisposable.add(resetAnchoredStateViewDisposable);
          pipe(
            this.stateControl.selectionChange$,
            subscribe((event) => {
              if (event.type !== PushType) {
                return;
              }
              const message = event.value;
              const { updateDataStack, data } = message;
              if (
                !updateDataStack.some((data) => !!data[SearchQueryGoToSearchResultImmediatelyKey]) &&
                !(data && !!data[SearchQueryGoToSearchResultImmediatelyKey])
              ) {
                resetAnchoredStateViewDisposable.dispose();
              }
            }, resetAnchoredStateViewDisposable),
          );
        }
        matchDisposable?.dispose();
        matchDisposable = Disposable();
        goToSearchResultImmediatelyCancelDisposable.add(matchDisposable);
        pipe(
          this.stateControl.selectionChange$,
          subscribe((event) => {
            assert(event.type === PushType);
            assertIsNotNullish(matchDisposable);
            matchDisposable.dispose();
          }, matchDisposable),
        );
        assertIsNotNullish(anchoredStateView);
        const findFromSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
          {
            selection: anchoredStateView[0],
            fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
            shouldTransformAsSelection: true,
          },
          anchoredStateView[1],
          this.stateControl.stateView,
        );
        const findFromSelectionRange = matita.getFocusSelectionRangeFromSelection(findFromSelection);
        const match$ = this.#searchElementTrackAllControl.wrapCurrentAlwaysOrFindNextMatch(findFromSelectionRange, matchDisposable);
        pipe(
          match$,
          subscribe((event) => {
            if (event.type === ThrowType) {
              throw event.error;
            }
            if (event.type === EndType) {
              return;
            }
            const paragraphMatch = event.value;
            if (paragraphMatch === null) {
              return;
            }
            const updateFn: matita.RunUpdateFn = () => {
              const contentReference = matita.makeContentReferenceFromContent(
                matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphMatch.paragraphReference),
              );
              const range = matita.makeRange(
                contentReference,
                matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphMatch.paragraphReference, paragraphMatch.startOffset),
                matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphMatch.paragraphReference, paragraphMatch.endOffset),
                matita.generateId(),
              );
              const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
              const selection = matita.makeSelection([selectionRange]);
              this.stateControl.delta.setSelection(selection, undefined, { [SearchQueryGoToSearchResultImmediatelyKey]: true });
            };
            if (this.stateControl.isInUpdate) {
              this.stateControl.delta.applyUpdate(updateFn);
            } else {
              this.#renderOverlayAsync = true;
              this.stateControl.queueUpdate(updateFn);
            }
          }, matchDisposable),
        );
      };
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
        const requestIndex = ++currentTryGoToSearchResultImmediatelyRequestIndex;
        this.stateControl.queueUpdate(() => {
          this.#renderOverlayAsync = true;
          this.#searchControl.config = newConfig;
          if (requestIndex === currentTryGoToSearchResultImmediatelyRequestIndex) {
            tryGoToSearchResultImmediately();
          }
        });
      });
      const searchQuerySink = Sink<string>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const query = event.value;
        const requestIndex = ++currentTryGoToSearchResultImmediatelyRequestIndex;
        this.stateControl.queueUpdate(() => {
          this.#renderOverlayAsync = true;
          this.#searchControl.query = query;
          if (requestIndex === currentTryGoToSearchResultImmediatelyRequestIndex) {
            tryGoToSearchResultImmediately();
          }
        });
      });
      const closeSearchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.stateControl.queueUpdate(this.closeSearch());
      });
      const goToPreviousMatchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.runCommand({
          commandName: StandardCommand.SelectPreviousSearchMatch,
          data: null,
        });
      });
      const goToNextMatchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.runCommand({
          commandName: StandardCommand.SelectNextSearchMatch,
          data: null,
        });
      });
      renderReactNodeIntoHtmlContainerElement(
        <SearchBox
          isVisible$={this.#isSearchElementContainerVisible$}
          containerStaticViewRectangle$={searchContainerStaticViewRectangle$}
          goToSearchResultImmediatelySink={goToSearchResultImmediatelySink}
          querySink={searchQuerySink}
          configSink={searchConfigSink}
          goToPreviousMatchSink={goToPreviousMatchSink}
          goToNextMatchSink={goToNextMatchSink}
          closeSink={closeSearchSink}
          isInCompositionSink={this.#isSearchInComposition$}
          changeQuery$={this.#changeQuery$}
          matchNumberMaybe$={this.#matchNumberMaybe$}
          totalMatchesMaybe$={this.#totalMatchesMaybe$}
          initialGoToSearchResultImmediately={initialGoToSearchResultImmediately}
          initialQuery={initialQuery}
          initialConfig={{
            type: SearchBoxConfigType.SingleParagraphPlainText,
            config: initialSearchControlConfig,
          }}
          inputRef={this.#searchInputRef}
        />,
        this.#searchElementContainerElement,
        'search-box-',
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
        pipe(fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true }))),
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
      fromArray([
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
        ),
        pipe(
          fromReactiveValue((callback, disposable) => {
            document.fonts.addEventListener('loadingdone', callback);
            disposable.add(
              Disposable(() => {
                document.fonts.removeEventListener('loadingdone', callback);
              }),
            );
          }),
        ),
      ]),
      flat()<unknown>,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.relativeParagraphMeasurementCache.clear();
        this.#replaceVisibleSearchResults();
        this.#replaceViewSelectionRanges(true);
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
        this.relativeParagraphMeasurementCache.invalidate(event.value.blockId);
      }, this),
    );
    addWindowEventListener('keydown', this.#onGlobalKeyDown.bind(this), this);
    addWindowEventListener('keyup', this.#onGlobalKeyUp.bind(this), this);
  }
  openSearch(focusSearchInput = true): matita.RunUpdateFn {
    return () => {
      if (!this.#isSearchElementContainerVisible$.currentValue) {
        this.#isSearchElementContainerVisible$(Push(true));
      }
      if (focusSearchInput) {
        this.#searchInputRef.current?.select();
      }
    };
  }
  closeSearch(): matita.RunUpdateFn {
    return () => {
      if (this.#isSearchElementContainerVisible$.currentValue) {
        this.#isSearchElementContainerVisible$(Push(false));
      }
      this.#inputTextElement.focus({
        preventScroll: true,
      });
    };
  }
  #setSearchQuery(query: string): void {
    this.#searchControl.query = query;
    this.#changeQuery$(Push(query));
  }
  searchCurrentFocusSelectionRange(): matita.RunUpdateFn {
    return () => {
      const result = this.#getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.#setSearchQuery(word);
      if (isAway) {
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  #getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(
    givenRange: matita.Range,
    givenSelectionRange: matita.SelectionRange,
  ): {
    newSelectionRange: matita.SelectionRange;
    word: string;
    isAway: boolean;
  } | null {
    if (
      !matita.isParagraphPoint(givenRange.startPoint) ||
      !matita.isParagraphPoint(givenRange.endPoint) ||
      !matita.areParagraphPointsAtSameParagraph(givenRange.startPoint, givenRange.endPoint)
    ) {
      return null;
    }
    const paragraph = matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, givenRange.startPoint);
    let wordSegmenter: IntlSegmenter | null = null;
    const makeWordSegmenter = (): IntlSegmenter => {
      if (wordSegmenter === null) {
        wordSegmenter = new this.stateControl.stateControlConfig.IntlSegmenter(undefined, {
          granularity: 'word',
        });
      }
      return wordSegmenter;
    };
    const extractText = (startOffset: number, endOffset: number): Maybe<string> => {
      const inlineNodes = matita.sliceParagraphChildren(paragraph, startOffset, endOffset);
      if (inlineNodes.some((inline) => matita.isVoid(inline))) {
        return None;
      }
      return Some(inlineNodes.map((inline) => (inline as matita.Text<TextConfig>).text).join(''));
    };
    function isTermIntlWordLike(term: string): boolean {
      const wordSegmenter = makeWordSegmenter();
      const segments = wordSegmenter.segment(term);
      for (const segment of segments) {
        if (!segment.isWordLike) {
          return false;
        }
      }
      return true;
    }
    const extractTextIfWordLike = (startOffset: number, endOffset: number): Maybe<string> => {
      const textMaybe = extractText(startOffset, endOffset);
      if (isNone(textMaybe) || !isTermIntlWordLike(textMaybe.value)) {
        return None;
      }
      return textMaybe;
    };
    let word: string;
    let newSelectionRange: matita.SelectionRange;
    const firstPoint = givenRange.startPoint.offset < givenRange.endPoint.offset ? givenRange.startPoint : givenRange.endPoint;
    const lastPoint = givenRange.startPoint.offset < givenRange.endPoint.offset ? givenRange.endPoint : givenRange.startPoint;
    const isAway = givenRange.startPoint.offset === givenRange.endPoint.offset;
    if (isAway) {
      const prevFirstBounded = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.PreviousBoundByEdge)(
        this.stateControl.stateView.document,
        this.stateControl.stateControlConfig,
        matita.SelectionRangeIntention.Text,
        givenRange,
        firstPoint,
        givenSelectionRange,
      );
      const nextLastBounded = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.NextBoundByEdge)(
        this.stateControl.stateView.document,
        this.stateControl.stateControlConfig,
        matita.SelectionRangeIntention.Text,
        givenRange,
        lastPoint,
        givenSelectionRange,
      );
      if (
        !matita.isParagraphPoint(prevFirstBounded.point) ||
        !matita.areParagraphPointsAtSameParagraph(prevFirstBounded.point, givenRange.startPoint) ||
        !matita.isParagraphPoint(nextLastBounded.point) ||
        !matita.areParagraphPointsAtSameParagraph(nextLastBounded.point, givenRange.startPoint)
      ) {
        return null;
      }
      let startOffset: number;
      let endOffset: number;
      let traceWord = false;
      if (matita.areParagraphPointsAtSameOffsetInSameParagraph(prevFirstBounded.point, nextLastBounded.point)) {
        // At edge. Try forwards.
        const nextLast = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Next)(
          this.stateControl.stateView.document,
          this.stateControl.stateControlConfig,
          matita.SelectionRangeIntention.Text,
          givenRange,
          lastPoint,
          givenSelectionRange,
        );
        if (
          !matita.isParagraphPoint(nextLast.point) ||
          !matita.areParagraphPointsAtSameParagraph(nextLast.point, givenRange.startPoint) ||
          !matita.areParagraphPointsAtSameParagraph(nextLast.point, nextLastBounded.point) ||
          isNone(extractTextIfWordLike(prevFirstBounded.point.offset, nextLast.point.offset))
        ) {
          // Try backwards.
          const prevFirst = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.Previous)(
            this.stateControl.stateView.document,
            this.stateControl.stateControlConfig,
            matita.SelectionRangeIntention.Text,
            givenRange,
            firstPoint,
            givenSelectionRange,
          );
          if (
            !matita.isParagraphPoint(prevFirst.point) ||
            !matita.areParagraphPointsAtSameParagraph(prevFirst.point, givenRange.startPoint) ||
            !matita.areParagraphPointsAtSameParagraph(prevFirst.point, prevFirstBounded.point) ||
            isNone(extractTextIfWordLike(prevFirst.point.offset, nextLastBounded.point.offset))
          ) {
            return null;
          }
          startOffset = prevFirst.point.offset;
          endOffset = nextLastBounded.point.offset;
        } else {
          startOffset = prevFirstBounded.point.offset;
          endOffset = nextLast.point.offset;
        }
      } else {
        startOffset = prevFirstBounded.point.offset;
        endOffset = nextLastBounded.point.offset;
        traceWord = true;
      }
      let textMaybe = extractText(startOffset, endOffset);
      if (isNone(textMaybe)) {
        return null;
      }
      if (traceWord) {
        const segmenter = makeWordSegmenter();
        const segments = segmenter.segment(textMaybe.value);
        for (const segment of segments) {
          if (segment.isWordLike) {
            startOffset += segment.index;
            endOffset = startOffset + segment.segment.length;
            textMaybe = extractText(startOffset, endOffset);
            if (isNone(textMaybe)) {
              return null;
            }
            break;
          }
        }
      }
      const range = matita.makeRange(
        givenRange.contentReference,
        matita.changeParagraphPointOffset(givenRange.startPoint, startOffset),
        matita.changeParagraphPointOffset(givenRange.endPoint, endOffset),
        matita.generateId(),
      );
      newSelectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      word = textMaybe.value;
    } else {
      newSelectionRange = givenSelectionRange;
      const textMaybe = extractText(firstPoint.offset, lastPoint.offset);
      if (isNone(textMaybe)) {
        return null;
      }
      word = textMaybe.value;
    }
    return {
      newSelectionRange,
      word,
      isAway,
    };
  }
  #getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText(): {
    newSelectionRange: matita.SelectionRange;
    word: string;
    isAway: boolean;
  } | null {
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (!focusSelectionRange || focusSelectionRange.ranges.length > 1) {
      return null;
    }
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    return this.#getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(focusRange, focusSelectionRange);
  }
  selectAllInstancesOfWord(): matita.RunUpdateFn {
    return () => {
      const result = this.#getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word } = result;
      this.#setSearchQuery(word);
      this.stateControl.delta.applyUpdate(this.selectAllInstancesOfSearchQuery(newSelectionRange));
    };
  }
  selectAllInstancesOfSearchQuery(focusSelectionRange?: matita.SelectionRange): matita.RunUpdateFn {
    return () => {
      const paragraphIdToParagraphMatchesMapMaybe = this.#searchControl.findAllMatchesSyncLimitedToMaxAmount(200);
      if (isNone(paragraphIdToParagraphMatchesMapMaybe)) {
        // TODO: Show feedback.
        return;
      }
      const paragraphIdToParagraphMatchesMap = paragraphIdToParagraphMatchesMapMaybe.value;
      if (paragraphIdToParagraphMatchesMap.size === 0) {
        return;
      }
      const selectionRanges: matita.SelectionRange[] = [];
      let matchingFocusSelectionRangeWithIndex: [selectionRange: matita.SelectionRange, index: number] | null = null;
      for (const [paragraphId, paragraphMatches] of paragraphIdToParagraphMatchesMap) {
        const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
        const contentReference = matita.makeContentReferenceFromContent(
          matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
        );
        for (let i = 0; i < paragraphMatches.matches.length; i++) {
          const match = paragraphMatches.matches[i];
          const { startOffset, endOffset } = match;
          const range = matita.makeRange(
            contentReference,
            matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
            matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
            matita.generateId(),
          );
          const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
          if (focusSelectionRange && matita.areSelectionRangesCoveringSameContent(selectionRange, focusSelectionRange)) {
            matchingFocusSelectionRangeWithIndex = [focusSelectionRange, selectionRanges.length];
            selectionRanges.push(focusSelectionRange);
          } else {
            selectionRanges.push(selectionRange);
          }
        }
      }
      if (matchingFocusSelectionRangeWithIndex !== null) {
        selectionRanges[matchingFocusSelectionRangeWithIndex[1]] = matita.regenerateSelectionRangeCreatedAtTimestamp(matchingFocusSelectionRangeWithIndex[0]);
      }
      const selection = matita.makeSelection(selectionRanges);
      this.stateControl.delta.setSelection(selection);
      this.stateControl.delta.applyUpdate(this.closeSearch());
    };
  }
  selectNextInstanceOfWordAtFocus(): matita.RunUpdateFn {
    return () => {
      const result = this.#getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.#setSearchQuery(word);
      if (isAway) {
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.stateControl.delta.applyUpdate(this.selectNextSearchMatch(true));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  selectPreviousInstanceOfWordAtFocus(): matita.RunUpdateFn {
    return () => {
      const result = this.#getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.#setSearchQuery(word);
      if (isAway) {
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.stateControl.delta.applyUpdate(this.selectPreviousSearchMatch(true));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  selectPreviousInstanceOfSearchQuery(): matita.RunUpdateFn {
    return () => {
      const result = this.#getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.#setSearchQuery(word);
      if (isAway) {
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.stateControl.delta.applyUpdate(this.selectPreviousSearchMatch(true));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  selectNextSearchMatch(extendSelection?: boolean): matita.RunUpdateFn {
    return () => {
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
      const match = this.#searchControl.wrapCurrentOrFindNextMatchSync(
        focusSelectionRange,
        WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther,
      );
      if (!match) {
        return;
      }
      const { paragraphReference, startOffset, endOffset } = match;
      const range = matita.makeRange(
        matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference)),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
        matita.generateId(),
      );
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      if (extendSelection) {
        this.stateControl.delta.setSelection(matita.makeSelection([...this.stateControl.stateView.selection.selectionRanges, selectionRange]));
      } else {
        this.stateControl.delta.setSelection(matita.makeSelection([selectionRange]));
      }
    };
  }
  selectPreviousSearchMatch(extendSelection?: boolean): matita.RunUpdateFn {
    return () => {
      const anchorSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
      const match = this.#searchControl.wrapCurrentOrFindPreviousMatchSync(
        anchorSelectionRange,
        WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther,
      );
      if (!match) {
        return;
      }
      const { paragraphReference, startOffset, endOffset } = match;
      const range = matita.makeRange(
        matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference)),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
        matita.generateId(),
      );
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      if (extendSelection) {
        this.stateControl.delta.setSelection(matita.makeSelection([selectionRange, ...this.stateControl.stateView.selection.selectionRanges]));
      } else {
        this.stateControl.delta.setSelection(matita.makeSelection([selectionRange]));
      }
    };
  }
  #onInputElementFocus(): void {
    this.#hasFocus$(Push(this.#hasFocus()));
  }
  #onInputElementBlur(): void {
    this.#hasFocus$(Push(this.#hasFocus()));
  }
  #onWindowFocus(): void {
    this.#hasFocus$(Push(this.#hasFocus()));
  }
  #onWindowBlur(): void {
    requestAnimationFrameDisposable(() => {
      this.#clearKeys();
    }, this);
    this.#hasFocus$(Push(this.#hasFocus()));
  }
  makeSoftLineStartEndFocusPointTransformFn(
    pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
  ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
    return (document, _stateControlConfig, _selectionRangeIntention, range, point, selectionRange) => {
      if (point.type !== matita.PointType.Paragraph) {
        return {
          contentReference: range.contentReference,
          point,
        };
      }
      const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
      const isLineWrapToNextLine =
        lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
        this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId) &&
        this.isParagraphPointAtWrappedLineWrapPoint(point);
      const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
      const { relativeParagraphMeasurement } = this.#getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
      const measuredParagraphLineRangeIndex = this.#getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
        relativeParagraphMeasurement,
        point,
        isLineWrapToNextLine,
      );
      const measuredParagraphLineRange = relativeParagraphMeasurement.measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
      return {
        contentReference: range.contentReference,
        point: matita.changeParagraphPointOffset(
          point,
          pointMovement === matita.PointMovement.Previous ? measuredParagraphLineRange.startOffset : measuredParagraphLineRange.endOffset,
        ),
      };
    };
  }
  #getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue,
    point: matita.ParagraphPoint,
    isLineWrapToNextLine: boolean,
  ): number {
    for (let i = 0; i < relativeParagraphMeasurement.measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = relativeParagraphMeasurement.measuredParagraphLineRanges[i];
      if (
        measuredParagraphLineRange.startOffset <= point.offset &&
        point.offset <= measuredParagraphLineRange.endOffset &&
        !(
          point.offset === measuredParagraphLineRange.endOffset &&
          isLineWrapToNextLine &&
          i !== relativeParagraphMeasurement.measuredParagraphLineRanges.length - 1
        )
      ) {
        return i;
      }
    }
    throwUnreachable();
  }
  transformPointSoftLineUpDownWithOffsetLeft(
    pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    selectionRangeIntention: matita.SelectionRangeIntention,
    range: matita.Range,
    point: matita.Point,
    selectionRange: matita.SelectionRange,
    overrideCursorOffsetLeft: number | undefined,
    isAnchor: boolean,
  ): { pointWithContentReference: matita.PointWithContentReference; isWrappedLineStart: boolean; horizontalOffset: number } {
    if (!matita.isParagraphPoint(point) || selectionRangeIntention === matita.SelectionRangeIntention.Block) {
      throwUnreachable();
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (selectionRangeIntention !== matita.SelectionRangeIntention.Text) {
      assertUnreachable(selectionRangeIntention);
    }
    const lineWrapFocusCursorWrapToNextLineDataValue = isAnchor
      ? getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data)
      : getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
    const isLineWrapToNextLine =
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
      this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId) &&
      this.isParagraphPointAtWrappedLineWrapPoint(point);
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.#measureParagraphAtParagraphReference(paragraphReference);
    const measuredParagraphLineRangeIndex = this.#getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
      paragraphMeasurement,
      point,
      isLineWrapToNextLine,
    );
    const horizontalOffset =
      overrideCursorOffsetLeft ?? this.#getCursorPositionAndHeightFromParagraphPointFillingLine(point, isLineWrapToNextLine).position.left;
    if (pointMovement === matita.PointMovement.Previous) {
      if (measuredParagraphLineRangeIndex === 0) {
        const paragraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        if (paragraphIndex === 0) {
          return {
            pointWithContentReference: {
              contentReference: range.contentReference,
              point: matita.changeParagraphPointOffset(point, 0),
            },
            isWrappedLineStart: false,
            horizontalOffset,
          };
        }
        const previousBlock = matita.accessBlockAtIndexInContentAtContentReference(
          this.stateControl.stateView.document,
          range.contentReference,
          paragraphIndex - 1,
        );
        if (matita.isEmbed(previousBlock)) {
          return {
            pointWithContentReference: {
              contentReference: range.contentReference,
              point: matita.makeBlockPointFromBlock(previousBlock),
            },
            isWrappedLineStart: false,
            horizontalOffset,
          };
        }
        const previousParagraphReference = matita.makeBlockReferenceFromBlock(previousBlock);
        const previousParagraphMeasurement = this.#measureParagraphAtParagraphReference(previousParagraphReference);
        const position = this.#calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
          previousParagraphMeasurement,
          previousParagraphReference,
          previousParagraphMeasurement.measuredParagraphLineRanges.length - 1,
          horizontalOffset,
        );
        return {
          pointWithContentReference: position.pointWithContentReference,
          isWrappedLineStart: position.isWrappedLineStart,
          horizontalOffset,
        };
      }
      const position = this.#calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
        paragraphMeasurement,
        paragraphReference,
        measuredParagraphLineRangeIndex - 1,
        horizontalOffset,
      );
      return {
        pointWithContentReference: position.pointWithContentReference,
        isWrappedLineStart: position.isWrappedLineStart,
        horizontalOffset,
      };
    }
    if (measuredParagraphLineRangeIndex === paragraphMeasurement.measuredParagraphLineRanges.length - 1) {
      const paragraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, paragraphReference);
      if (paragraphIndex === matita.getNumberOfBlocksInContentAtContentReference(this.stateControl.stateView.document, range.contentReference) - 1) {
        const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        return {
          pointWithContentReference: {
            contentReference: range.contentReference,
            point: matita.changeParagraphPointOffset(point, matita.getParagraphLength(paragraph)),
          },
          isWrappedLineStart: false,
          horizontalOffset,
        };
      }
      const nextBlock = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, range.contentReference, paragraphIndex + 1);
      if (matita.isEmbed(nextBlock)) {
        return {
          pointWithContentReference: {
            contentReference: range.contentReference,
            point: matita.makeBlockPointFromBlock(nextBlock),
          },
          isWrappedLineStart: false,
          horizontalOffset,
        };
      }
      const nextParagraphReference = matita.makeBlockReferenceFromBlock(nextBlock);
      const nextParagraphMeasurement = this.#measureParagraphAtParagraphReference(nextParagraphReference);
      const position = this.#calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
        nextParagraphMeasurement,
        nextParagraphReference,
        0,
        horizontalOffset,
      );
      return {
        pointWithContentReference: position.pointWithContentReference,
        isWrappedLineStart: position.isWrappedLineStart,
        horizontalOffset,
      };
    }
    const position = this.#calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
      paragraphMeasurement,
      paragraphReference,
      measuredParagraphLineRangeIndex + 1,
      horizontalOffset,
    );
    return {
      pointWithContentReference: position.pointWithContentReference,
      isWrappedLineStart: position.isWrappedLineStart,
      horizontalOffset,
    };
  }
  #scrollSelectionIntoViewWhenFinishedUpdating = false;
  #isSearchFocused(): boolean {
    return !!this.#searchInputRef.current && document.activeElement === this.#searchInputRef.current;
  }
  #isInSearchBox(): boolean {
    return !!document.activeElement && this.#searchElementContainerElement.contains(document.activeElement);
  }
  #activeSelectionSecondaryDataExpirationIds = new Set<number>();
  #activeSelectionSecondaryDataExpirationIdCounter = 0;
  makeActivatedSelectionSecondaryDataExpirationId(): number {
    const id = this.#activeSelectionSecondaryDataExpirationIdCounter++;
    this.#activeSelectionSecondaryDataExpirationIds.add(id);
    return id;
  }
  isSelectionSecondaryDataExpirationIdActive(expirationId: number): boolean {
    return this.#activeSelectionSecondaryDataExpirationIds.has(expirationId);
  }
  #didResetCursorVisibility = false;
  #onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { previousSelection, data, updateDataStack } = event.value;
    if (
      !this.#isDraggingSelection &&
      !updateDataStack.some((data) => !!data[doNotScrollToSelectionAfterChangeDataKey]) &&
      !(data && !!data[doNotScrollToSelectionAfterChangeDataKey])
    ) {
      this.#scrollSelectionIntoViewWhenFinishedUpdating = true;
    }
    if (this.stateControl.stateView.selection.selectionRanges.length === 0) {
      if (this.#hasFocusIncludingNotActiveWindow()) {
        this.#inputTextElement.blur();
      }
    } else {
      if (!this.#hasFocusIncludingNotActiveWindow() && !this.#isInSearchBox()) {
        this.#inputTextElement.focus({
          preventScroll: true,
        });
      }
    }
    const preserveSelectionSecondaryDataExpirationIds = new Set<number>();
    const isSelectionCoveringTheSameContentAsBefore = matita.areSelectionsCoveringSameContent(previousSelection, this.stateControl.stateView.selection);
    if (data !== undefined || isSelectionCoveringTheSameContentAsBefore) {
      const preserveLineWrapFocusCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds = new Set(
        data === undefined ? [] : getSelectionChangeDataPreserveLineWrapFocusCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(data),
      );
      const preserveLineWrapAnchorCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds = new Set(
        data === undefined ? [] : getSelectionChangeDataPreserveLineWrapAnchorCursorWrapToNextLineForSelectionRangesWithSelectionIdsDataValue(data),
      );
      if (
        preserveLineWrapAnchorCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.size > 0 ||
        preserveLineWrapFocusCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.size > 0 ||
        isSelectionCoveringTheSameContentAsBefore
      ) {
        for (let i = 0; i < this.stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = this.stateControl.stateView.selection.selectionRanges[i];
          if (
            isSelectionCoveringTheSameContentAsBefore ||
            preserveLineWrapFocusCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.has(selectionRange.id)
          ) {
            const focusLineWrapSelectionRangeData = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
            if (focusLineWrapSelectionRangeData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(focusLineWrapSelectionRangeData.expirationId);
            }
          }
          if (
            isSelectionCoveringTheSameContentAsBefore ||
            preserveLineWrapAnchorCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.has(selectionRange.id)
          ) {
            const anchorLineWrapSelectionRangeData = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
            if (anchorLineWrapSelectionRangeData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(anchorLineWrapSelectionRangeData.expirationId);
            }
          }
        }
      }
      if (data !== undefined) {
        if (isSelectionChangeDataPreservingMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft(data)) {
          for (let i = 0; i < this.stateControl.stateView.selection.selectionRanges.length; i++) {
            const selectionRange = this.stateControl.stateView.selection.selectionRanges[i];
            const moveOrExtendCursorOffsetData = getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
              selectionRange.data,
            );
            if (moveOrExtendCursorOffsetData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(moveOrExtendCursorOffsetData.expirationId);
            }
          }
        }
      }
    }
    for (const activeExpirationId of this.#activeSelectionSecondaryDataExpirationIds) {
      if (!preserveSelectionSecondaryDataExpirationIds.has(activeExpirationId)) {
        this.#activeSelectionSecondaryDataExpirationIds.delete(activeExpirationId);
      }
    }
    if (!this.#didResetCursorVisibility) {
      this.#resetSynchronizedCursorVisibility$(Push(undefined));
      this.#didResetCursorVisibility = true;
    }
  }
  #onAfterMutationPart(
    event: Event<matita.AfterMutationPartMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>,
  ): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { updateDataStack } = event.value;
    if (!this.#isDraggingSelection && !updateDataStack.some((data) => !!data[doNotScrollToSelectionAfterChangeDataKey])) {
      this.#scrollSelectionIntoViewWhenFinishedUpdating = true;
    }
  }
  #scrollSelectionIntoView(): void {
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (!focusSelectionRange) {
      return;
    }
    const focusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(focusSelectionRange));
    matita.assertIsParagraphPoint(focusPoint);
    const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(focusSelectionRange.data);
    const cursorPositionAndHeightFromParagraphPoint = this.#getCursorPositionAndHeightFromParagraphPointFillingLine(
      focusPoint,
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
        this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId),
    );
    // TODO: Fix in case of multiple selections.
    scrollCursorRectIntoView(
      makeViewRectangle(
        cursorPositionAndHeightFromParagraphPoint.position.left,
        cursorPositionAndHeightFromParagraphPoint.position.top,
        2,
        cursorPositionAndHeightFromParagraphPoint.height,
      ),
      this.#getScrollContainer(),
      this.#isElementScrollable,
      this.#getScrollElementAdditionalNonVisibleMargins,
    );
  }
  // TODO: Not always when search box is open.
  #getScrollElementAdditionalNonVisibleMargins = (element: Element): AdditionalMargins => {
    let visibleTop: number;
    let visibleBottom: number;
    let notVisibleTop: number;
    let notVisibleBottom: number;
    if (this.#isSearchElementContainerVisible$.currentValue && element === this.#getScrollContainer()) {
      const searchElementPaddingTop =
        ((this.#searchElementContainerElement.firstChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0) + searchBoxMargin * 2;
      const visibleTopAndBottom = this.#getVisibleTopAndBottom();
      const visibleHeight = visibleTopAndBottom.visibleBottom - visibleTopAndBottom.visibleTop;
      visibleTop = searchElementPaddingTop;
      visibleBottom = visibleHeight / 5;
      notVisibleTop = Math.max(searchElementPaddingTop, searchElementPaddingTop + visibleHeight / 4);
      notVisibleBottom = Math.min((visibleHeight * 3) / 5, visibleHeight - searchElementPaddingTop);
    } else {
      visibleTop = 0;
      visibleBottom = 0;
      notVisibleTop = 0;
      notVisibleBottom = 0;
    }
    return {
      visible: {
        top: visibleTop,
        bottom: visibleBottom,
        left: 0,
        right: 0,
      },
      notVisible: {
        top: notVisibleTop,
        bottom: notVisibleBottom,
        left: 0,
        right: 0,
      },
    };
  };
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
  #getCursorPositionAndHeightFromParagraphPointFillingLine(
    point: matita.ParagraphPoint,
    isMarkedLineWrapToNextLine: boolean,
  ): { position: ViewPosition; height: number; measuredParagraphLineRange: MeasuredParagraphLineRange } {
    const isLineWrapToNextLine = isMarkedLineWrapToNextLine && this.isParagraphPointAtWrappedLineWrapPoint(point);
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
                measuredParagraphLineRange: nextMeasuredParagraphLineRange,
              };
            }
            return {
              position: {
                left: nextMeasuredParagraphLineRange.characterRectangles[0].left,
                top: nextMeasuredParagraphLineRange.boundingRect.top,
              },
              height: nextMeasuredParagraphLineRange.boundingRect.height,
              measuredParagraphLineRange: nextMeasuredParagraphLineRange,
            };
          }
          if (measuredParagraphLineRange.characterRectangles.length === 0) {
            return {
              position: {
                left: measuredParagraphLineRange.boundingRect.left,
                top: measuredParagraphLineRange.boundingRect.top,
              },
              height: measuredParagraphLineRange.boundingRect.height,
              measuredParagraphLineRange,
            };
          }
          const characterRectangle = paragraphMeasurement.characterRectangles[point.offset - 1];
          assertIsNotNullish(characterRectangle);
          return {
            position: {
              left: characterRectangle.right,
              top: measuredParagraphLineRange.boundingRect.top,
            },
            height: measuredParagraphLineRange.boundingRect.height,
            measuredParagraphLineRange,
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const characterRectangle = paragraphMeasurement.characterRectangles[point.offset];
        assertIsNotNullish(characterRectangle);
        return {
          position: {
            left: characterRectangle.left,
            top: measuredParagraphLineRange.boundingRect.top,
          },
          height: measuredParagraphLineRange.boundingRect.height,
          measuredParagraphLineRange,
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
    'Digit0',
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
    'Space',
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'Backspace',
    'Delete',
    'Enter',
    'Escape',
    'BracketLeft',
    'BracketRight',
    'Comma',
    'Period',
    'Backslash',
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
    if (this.#isSearchFocused() && !this.#isSearchInComposition$.currentValue) {
      activeContexts.push(Context.Searching);
    }
    if (this.#isInSearchBox() && !this.#isSearchInComposition$.currentValue) {
      activeContexts.push(Context.InSearchBox);
    }
    let shouldCancel = false;
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
        const optionalMeta = parsedKeySet.has('Meta?');
        const optionalControl = parsedKeySet.has('Control?');
        const optionalAlt = parsedKeySet.has('Alt?');
        const optionalShift = parsedKeySet.has('Shift?');
        const requiredNonModifierKeys = Array.from(parsedKeySet).filter(
          (requiredKey) => !['Meta', 'Shift', 'Control', 'Alt'].includes(requiredKey) && !requiredKey.endsWith('?'),
        );
        if (
          !(
            requiredNonModifierKeys.every((requiredNonModifierKey) => normalizedKey === requiredNonModifierKey) &&
            (optionalMeta || (requiredMeta ? hasMeta : !hasMeta)) &&
            (optionalControl || (requiredControl ? hasControl : !hasControl)) &&
            (optionalAlt || (requiredAlt ? hasAlt : !hasAlt)) &&
            (optionalShift || (requiredShift ? hasShift : !hasShift))
          )
        ) {
          continue;
        }
        if (cancelKeyEvent) {
          shouldCancel = true;
        }
        this.#endSelectionDrag$(Push(undefined));
        this.runCommand({
          commandName: command,
          data: null,
        });
        break;
      }
    }
    if (shouldCancel) {
      event.preventDefault();
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
        (changeType) => changeType === LocalUndoControlLastChangeType.InsertPlainText || changeType === LocalUndoControlLastChangeType.CompositionUpdate,
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
        const startPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset);
        const contentReference = matita.makeContentReferenceFromContent(
          matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
        );
        const afterSplicePoint = matita.changeParagraphPointOffset(startPoint, startPoint.offset + normalizedText.length);
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
        const selectionBeforePoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset);
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
        const coverRange = matita.makeRange(
          contentReference,
          matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
          matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
          matita.generateId(),
        );
        const coverSelectionRange = matita.makeSelectionRange(
          [coverRange],
          coverRange.id,
          coverRange.id,
          matita.SelectionRangeIntention.Text,
          {},
          matita.generateId(),
        );
        const insertTexts: matita.Text<TextConfig>[] = !normalizedText
          ? []
          : [
              matita.makeText(
                getInsertTextConfigAtSelectionRange(
                  this.stateControl.stateView.document,
                  this.stateControl.stateView.customCollapsedSelectionTextConfig,
                  coverSelectionRange,
                ),
                normalizedText,
              ),
            ];
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
    if (inputType === 'insertText' || inputType === 'insertFromPaste' || inputType === 'insertReplacementText') {
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
        const lineTexts = text.split(/\r?\n/g).map((line) => line.replaceAll('\r', ''));
        const getContentFragmentFromSelectionRange = (
          customCollapsedSelectionTextConfig: TextConfig | null,
          selectionRange: matita.SelectionRange,
        ): matita.ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
          return matita.makeContentFragment(
            lineTexts.map((lineText) =>
              matita.makeContentFragmentParagraph(
                matita.makeParagraph(
                  {},
                  lineText === ''
                    ? []
                    : [
                        matita.makeText(
                          getInsertTextConfigAtSelectionRange(this.stateControl.stateView.document, customCollapsedSelectionTextConfig, selectionRange),
                          lineText,
                        ),
                      ],
                  matita.generateId(),
                ),
              ),
            ),
          );
        };
        const originalTextContent = this.#inputTextElement.childNodes[0].nodeValue || '';
        this.stateControl.queueUpdate(
          () => {
            const { customCollapsedSelectionTextConfig } = this.stateControl.stateView;
            if (
              inputType === 'insertText' &&
              (this.stateControl.stateView.selection.selectionRanges.length > 1 ||
                (this.stateControl.stateView.selection.selectionRanges.length === 1 &&
                  shouldCollapseSelectionRangeInTextCommand(this.stateControl.stateView.document, this.stateControl.stateView.selection.selectionRanges[0])))
            ) {
              // 'insertText' only is handled using the native selection when it is collapsed, as this is for compatibility with composition in chrome/firefox.
              this.stateControl.delta.applyUpdate(
                matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, (selectionRange) =>
                  getContentFragmentFromSelectionRange(customCollapsedSelectionTextConfig, selectionRange),
                ),
              );
              return;
            }
            let paragraph: matita.Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
            try {
              paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            } catch (error) {
              if (!(error instanceof matita.BlockNotInBlockStoreError)) {
                throw error;
              }
              this.stateControl.delta.applyUpdate(
                matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, (selectionRange) =>
                  getContentFragmentFromSelectionRange(customCollapsedSelectionTextConfig, selectionRange),
                ),
              );
              return;
            }
            matita.assertIsParagraph(paragraph);
            const currentTextContent = this.#getDomInputTextFromParagraph(paragraph);
            if (originalTextContent !== currentTextContent) {
              this.stateControl.delta.applyUpdate(
                matita.makeInsertContentFragmentAtSelectionUpdateFn(this.stateControl, (selectionRange) =>
                  getContentFragmentFromSelectionRange(customCollapsedSelectionTextConfig, selectionRange),
                ),
              );
              return;
            }
            assert(startOffset <= endOffset);
            assert(endOffset <= matita.getParagraphLength(paragraph));
            const range = matita.makeRange(
              matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference)),
              matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
              matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
              matita.generateId(),
            );
            this.stateControl.delta.applyUpdate(
              matita.makeInsertContentFragmentAtRangeUpdateFn(
                this.stateControl,
                range,
                getContentFragmentFromSelectionRange(
                  customCollapsedSelectionTextConfig,
                  matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId()),
                ),
                (selectionRange) => {
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
                },
              ),
            );
          },
          inputType === 'insertText' ? { [matita.RedoUndoUpdateKey.InsertText]: true } : {},
        );
        return;
      }
      if (inputType === 'insertText') {
        this.runCommand(makeInsertPlainTextCommandInfo(text));
        return;
      }
      if (inputType === 'insertFromPaste') {
        this.runCommand(makeInsertPastedPlainTextCommandInfo(text));
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
  #getRelativeParagraphMeasurementAtParagraphReference(paragraphReference: matita.BlockReference): {
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue;
    containerHtmlElementBoundingRect?: DOMRect;
  } {
    const cachedMeasurement = this.relativeParagraphMeasurementCache.get(paragraphReference.blockId);
    if (cachedMeasurement) {
      return { relativeParagraphMeasurement: cachedMeasurement };
    }
    this.#commitDirtyChanges();
    // TODO: Graphemes instead of characters.
    // TODO: Rtl.
    // Fix horizontal scroll hidden in safari.
    if (this.#isOverflowClipNotSupported) {
      this.#containerHtmlElement.scrollLeft = 0;
    }
    const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const containerHtmlElement = paragraphRenderControl.containerHtmlElement;
    const containerHtmlElementBoundingRect = containerHtmlElement.getBoundingClientRect();
    const measureRange = document.createRange();
    const measuredParagraphLineRanges: MeasuredParagraphLineRange[] = [];
    const paragraphCharacterRectangles: (ViewRectangle | null)[] = [];
    const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    let isPreviousLineBreak = false;
    type MutableViewRectangle = { -readonly [P in keyof ViewRectangle]: ViewRectangle[P] };
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
      let previousNativeEndNodeAndOffset: NativeNodeAndOffset | undefined;
      const measureGraphemeThroughIndices = (startIndex: number, j: number): void => {
        const nativeStartNodeAndOffset = previousNativeEndNodeAndOffset ?? getNativeTextNodeAndOffset(textNode, startIndex);
        const nativeEndNodeAndOffset = getNativeTextNodeAndOffset(textNode, j + 1);
        previousNativeEndNodeAndOffset = nativeEndNodeAndOffset;
        measureRange.setStart(nativeStartNodeAndOffset[0], nativeStartNodeAndOffset[1]);
        measureRange.setEnd(nativeEndNodeAndOffset[0], nativeEndNodeAndOffset[1]);
        // TODO: In Safari, when e.g. emoji is split where one character code is styled differently then the other, hence rendered as an unknown glyph, the
        // measurement for the rest of the characters in that line is bogus. Also for invisible/malformed graphemes, the measured width can be negative (????).
        const measureRangeBoundingRect = measureRange.getBoundingClientRect();
        const left = measureRangeBoundingRect.left - containerHtmlElementBoundingRect.left;
        const top = measureRangeBoundingRect.top - containerHtmlElementBoundingRect.top;
        const width = measureRangeBoundingRect.width;
        const height = measureRangeBoundingRect.height;
        const characterRectangle = makeViewRectangle(left, top, width, height) as MutableViewRectangle;
        if (measuredParagraphLineRanges.length === 0) {
          paragraphCharacterRectangles.push(characterRectangle);
          measuredParagraphLineRanges.push({
            boundingRect: characterRectangle,
            characterRectangles: [characterRectangle],
            startOffset: textStart + startIndex,
            endOffset: textStart + j + 1,
            endsWithLineBreak: false,
          });
          return;
        }
        const previousCharacterRectangle = paragraphCharacterRectangles[paragraphCharacterRectangles.length - 1];
        const minDifferenceToBeConsideredTheSame = (5 / 16) * paragraphRenderControl.fontSize;
        const isSameLineSameFontSize =
          previousCharacterRectangle &&
          (previousCharacterRectangle.top === characterRectangle.top || previousCharacterRectangle.bottom === characterRectangle.bottom) &&
          characterRectangle.left - previousCharacterRectangle.right <= minDifferenceToBeConsideredTheSame;
        const isSameLineDifferentFontSize =
          !isSameLineSameFontSize &&
          previousCharacterRectangle &&
          characterRectangle.left >= previousCharacterRectangle.right - minDifferenceToBeConsideredTheSame &&
          characterRectangle.left - previousCharacterRectangle.right <= 2 * paragraphRenderControl.fontSize &&
          (Math.abs(previousCharacterRectangle.top - characterRectangle.bottom) <= 2 * paragraphRenderControl.fontSize ||
            Math.abs(previousCharacterRectangle.bottom - characterRectangle.top) <= 2 * paragraphRenderControl.fontSize);
        // In Safari, the first wrapped character's bounding box envelops from the previous character (before the wrap) to the current character (after the
        // wrap), i.e. double height and full line width.
        const currentMeasuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1];
        const isSafariFirstWrappedCharacter =
          isSafari &&
          !isSameLineDifferentFontSize &&
          (characterRectangle.width > containerHtmlElementBoundingRect.width / 2 ||
            (previousCharacterRectangle !== null &&
              previousCharacterRectangle.width > 1 &&
              characterRectangle.left - previousCharacterRectangle.right < previousCharacterRectangle.width * 2 &&
              characterRectangle.height > previousCharacterRectangle.height &&
              characterRectangle.width > currentMeasuredParagraphLineRange.boundingRect.width - minDifferenceToBeConsideredTheSame));
        if (!isPreviousLineBreak && !isSafariFirstWrappedCharacter) {
          assertIsNotNullish(previousCharacterRectangle);
          if (isSameLineSameFontSize || isSameLineDifferentFontSize) {
            const currentMeasuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1];
            const expandedLeft = Math.min(currentMeasuredParagraphLineRange.boundingRect.left, characterRectangle.left);
            const expandedTop = Math.min(currentMeasuredParagraphLineRange.boundingRect.top, characterRectangle.top);
            const expandedRight = Math.max(currentMeasuredParagraphLineRange.boundingRect.right, characterRectangle.right);
            const expandedBottom = Math.max(currentMeasuredParagraphLineRange.boundingRect.bottom, characterRectangle.bottom);
            currentMeasuredParagraphLineRange.boundingRect = makeViewRectangle(
              expandedLeft,
              expandedTop,
              expandedRight - expandedLeft,
              expandedBottom - expandedTop,
            );
            const lastCharacterRectangle =
              currentMeasuredParagraphLineRange.characterRectangles[currentMeasuredParagraphLineRange.characterRectangles.length - 1];
            characterRectangle.left = lastCharacterRectangle.right;
            characterRectangle.width = characterRectangle.right - characterRectangle.left;
            paragraphCharacterRectangles.push(characterRectangle);
            currentMeasuredParagraphLineRange.characterRectangles.push(characterRectangle);
            currentMeasuredParagraphLineRange.endOffset = textStart + j + 1;
            return;
          }
        }
        isPreviousLineBreak = false;
        let fixedCharacterRectangle: ViewRectangle;
        if (isSafariFirstWrappedCharacter) {
          // TODO: Use canvas to measure width of character. Estimation sucks, e.g. if emoji (wide).
          fixedCharacterRectangle = makeViewRectangle(
            characterRectangle.left,
            characterRectangle.top + currentMeasuredParagraphLineRange.boundingRect.height,
            characterRectangle.left + currentMeasuredParagraphLineRange.characterRectangles.length === 0
              ? 9
              : currentMeasuredParagraphLineRange.boundingRect.width / currentMeasuredParagraphLineRange.characterRectangles.length,
            characterRectangle.height - currentMeasuredParagraphLineRange.boundingRect.height,
          );
        } else {
          fixedCharacterRectangle = characterRectangle;
        }
        paragraphCharacterRectangles.push(fixedCharacterRectangle);
        measuredParagraphLineRanges.push({
          boundingRect: fixedCharacterRectangle,
          characterRectangles: [fixedCharacterRectangle],
          startOffset: textStart + startIndex,
          endOffset: textStart + j + 1,
          endsWithLineBreak: false,
        });
      };
      // We store graphemes covering multiple character codes as a run of zero-width measurements followed by the grapheme's measurement at the end.
      const relevantText = matita
        .sliceParagraphChildren(paragraph, textStart, textEnd)
        .map((inlineNode) => {
          matita.assertIsText(inlineNode);
          return inlineNode.text;
        })
        .join('');
      for (const segmentData of this.#graphemeSegmenter.segment(relevantText)) {
        measureGraphemeThroughIndices(segmentData.index, segmentData.index + segmentData.segment.length - 1);
        for (let j = segmentData.index; j < segmentData.index + segmentData.segment.length - 1; j++) {
          const measuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1];
          assertIsNotNullish(measuredParagraphLineRange);
          const lastCharacterRectangle = measuredParagraphLineRange.characterRectangles[measuredParagraphLineRange.characterRectangles.length - 1];
          assertIsNotNullish(lastCharacterRectangle);
          const characterRectangle = makeViewRectangle(lastCharacterRectangle.left, lastCharacterRectangle.top, 0, lastCharacterRectangle.height);
          paragraphCharacterRectangles.splice(paragraphCharacterRectangles.length - 1, 0, characterRectangle);
          measuredParagraphLineRange.characterRectangles.splice(measuredParagraphLineRange.characterRectangles.length - 1, 0, characterRectangle);
        }
      }
      measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1].endsWithLineBreak = endsWithLineBreak;
      if (endsWithLineBreak) {
        isPreviousLineBreak = true;
        paragraphCharacterRectangles.push(null);
      }
    }
    const linesTopAndBottomAndHeightBefore = measuredParagraphLineRanges.map((measuredParagraphLineRange) => ({
      top: measuredParagraphLineRange.boundingRect.top,
      bottom: measuredParagraphLineRange.boundingRect.bottom,
      height: measuredParagraphLineRange.boundingRect.height,
    }));
    for (let i = 0; i < measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = measuredParagraphLineRanges[i];
      const boundingRect = measuredParagraphLineRange.boundingRect as MutableViewRectangle;
      if (i === 0) {
        boundingRect.top = 0;
      } else {
        const previous = linesTopAndBottomAndHeightBefore[i - 1];
        const current = linesTopAndBottomAndHeightBefore[i];
        boundingRect.top = (previous.bottom * previous.height + current.top * current.height) / (previous.height + current.height);
      }
      if (i === measuredParagraphLineRanges.length - 1) {
        boundingRect.bottom = containerHtmlElementBoundingRect.bottom - containerHtmlElementBoundingRect.top;
      } else {
        const current = linesTopAndBottomAndHeightBefore[i];
        const next = linesTopAndBottomAndHeightBefore[i + 1];
        boundingRect.bottom = (current.bottom * current.height + next.top * next.height) / (current.height + next.height);
      }
      boundingRect.height = boundingRect.bottom - boundingRect.top;
    }
    const newCachedMeasurement: RelativeParagraphMeasureCacheValue = {
      characterRectangles: paragraphCharacterRectangles,
      measuredParagraphLineRanges,
    };
    this.relativeParagraphMeasurementCache.set(paragraphReference.blockId, newCachedMeasurement);
    return { relativeParagraphMeasurement: newCachedMeasurement, containerHtmlElementBoundingRect };
  }
  #measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): AbsoluteParagraphMeasurement {
    const {
      relativeParagraphMeasurement,
      containerHtmlElementBoundingRect = this.viewControl
        .accessParagraphRenderControlAtBlockReference(paragraphReference)
        .containerHtmlElement.getBoundingClientRect(),
    } = this.#getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
    function shiftRelativeCharacterRectangle(relativeCharacterRectangle: ViewRectangle): ViewRectangle {
      return shiftViewRectangle(relativeCharacterRectangle, containerHtmlElementBoundingRect.left, containerHtmlElementBoundingRect.top);
    }
    return {
      characterRectangles: relativeParagraphMeasurement.characterRectangles.map(
        (characterRectangle) => characterRectangle && shiftRelativeCharacterRectangle(characterRectangle),
      ),
      measuredParagraphLineRanges: relativeParagraphMeasurement.measuredParagraphLineRanges.map((measuredParagraphLineRange) => {
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
  #positionCalculationEpsilon = 1;
  #calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
    measuredParagraphLineRange: MeasuredParagraphLineRange,
    paragraphReference: matita.BlockReference,
    horizontalOffset: number,
    isFirstInParagraphOrIsPreviousLineEndingWithLineBreak: boolean,
    isLastInParagraph: boolean,
  ): HitPosition {
    if (measuredParagraphLineRange.characterRectangles.length === 0) {
      return {
        pointWithContentReference: {
          contentReference: matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
          ),
          point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, measuredParagraphLineRange.startOffset),
        },
        isPastPreviousCharacterHalfPoint: false,
        isWrappedLineStart: false,
        isWrappedLinePreviousEnd: false,
      };
    }
    for (let j = 0; j < measuredParagraphLineRange.characterRectangles.length; j++) {
      const characterRectangle = measuredParagraphLineRange.characterRectangles[j];
      const previousCharacterRightWithoutInfinity =
        j === 0 ? characterRectangle.left : Math.min(measuredParagraphLineRange.characterRectangles[j - 1].right, characterRectangle.left);
      const previousCharacterRight = j === 0 ? -Infinity : Math.min(measuredParagraphLineRange.characterRectangles[j - 1].right, characterRectangle.left);
      const characterRight = j === measuredParagraphLineRange.characterRectangles.length - 1 ? Infinity : characterRectangle.right;
      if (
        !(
          previousCharacterRight - this.#positionCalculationEpsilon <= horizontalOffset && horizontalOffset <= characterRight + this.#positionCalculationEpsilon
        )
      ) {
        continue;
      }
      const isPastPreviousCharacterHalfPoint = horizontalOffset > (characterRectangle.right + previousCharacterRightWithoutInfinity) / 2;
      if (isPastPreviousCharacterHalfPoint) {
        j += 1;
      }
      // In Safari some malformed character measurements are negative???
      while (j > 0 && measuredParagraphLineRange.characterRectangles[j - 1].width <= 0) {
        // The preceding character has a width of 0, so it combines with the current character.
        j--;
      }
      const pointOffset = measuredParagraphLineRange.startOffset + j;
      return {
        pointWithContentReference: {
          contentReference: matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
          ),
          point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, pointOffset),
        },
        isPastPreviousCharacterHalfPoint,
        isWrappedLineStart: !isFirstInParagraphOrIsPreviousLineEndingWithLineBreak && pointOffset === measuredParagraphLineRange.startOffset,
        isWrappedLinePreviousEnd: !isLastInParagraph && !measuredParagraphLineRange.endsWithLineBreak && pointOffset === measuredParagraphLineRange.endOffset,
      };
    }
    throwUnreachable();
  }
  #calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue,
    paragraphReference: matita.BlockReference,
    measuredParagraphLineRangeIndex: number,
    horizontalOffset: number,
  ): HitPosition {
    const measuredParagraphLineRange = relativeParagraphMeasurement.measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
    const isFirstInParagraphOrIsPreviousLineEndingWithLineBreak =
      measuredParagraphLineRangeIndex === 0 || relativeParagraphMeasurement.measuredParagraphLineRanges[measuredParagraphLineRangeIndex - 1].endsWithLineBreak;
    const isLastInParagraph = measuredParagraphLineRangeIndex === relativeParagraphMeasurement.measuredParagraphLineRanges.length - 1;
    return this.#calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
      measuredParagraphLineRange,
      paragraphReference,
      horizontalOffset,
      isFirstInParagraphOrIsPreviousLineEndingWithLineBreak,
      isLastInParagraph,
    );
  }
  #calculatePositionFromViewPosition(viewPosition: ViewPosition, isExtend: boolean): HitPosition | null {
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
    const startIndex = Math.max(0, indexOfNearestLessThanEq(paragraphReferences, viewPosition.top, this.#compareParagraphTopToOffsetTop.bind(this)) - 1);
    const endIndex = Math.min(
      paragraphReferences.length - 1,
      indexOfNearestLessThanEq(paragraphReferences, viewPosition.top, this.#compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
    );
    const possibleLines: {
      paragraphReference: matita.BlockReference;
      measuredParagraphLineRange: MeasuredParagraphLineRange;
      isFirstInParagraph: boolean;
      isLastInParagraph: boolean;
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
          isLastInParagraph: j === paragraphMeasurement.measuredParagraphLineRanges.length - 1,
        });
      }
    }
    for (let i = 0; i < possibleLines.length; i++) {
      const possibleLine = possibleLines[i];
      const { paragraphReference, measuredParagraphLineRange, isFirstInParagraph, isLastInParagraph } = possibleLine;
      const { boundingRect } = measuredParagraphLineRange;
      const lineTop = i === 0 ? -Infinity : boundingRect.top;
      const lineBottom =
        i === possibleLines.length - 1 ? Infinity : Math.max(possibleLines[i + 1].measuredParagraphLineRange.boundingRect.top, boundingRect.bottom);
      if (!(lineTop - this.#positionCalculationEpsilon <= viewPosition.top && viewPosition.top <= lineBottom + this.#positionCalculationEpsilon)) {
        continue;
      }
      if (isExtend) {
        if (i === 0 && viewPosition.top < possibleLine.measuredParagraphLineRange.boundingRect.top) {
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
          );
          if (matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, paragraphReference) === 0) {
            const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            return {
              pointWithContentReference: {
                contentReference,
                point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, 0),
              },
              isPastPreviousCharacterHalfPoint: false,
              isWrappedLineStart: false,
              isWrappedLinePreviousEnd: false,
            };
          }
        }
        if (i > 0 && i === possibleLines.length - 1 && viewPosition.top > possibleLine.measuredParagraphLineRange.boundingRect.bottom) {
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
          );
          if (
            matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, paragraphReference) ===
            matita.getNumberOfBlocksInContentAtContentReference(this.stateControl.stateView.document, contentReference) - 1
          ) {
            const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            const paragraphLength = matita.getParagraphLength(paragraph);
            return {
              pointWithContentReference: {
                contentReference,
                point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, paragraphLength),
              },
              isPastPreviousCharacterHalfPoint: paragraphLength > 0,
              isWrappedLineStart: false,
              isWrappedLinePreviousEnd: false,
            };
          }
        }
      }
      return this.#calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
        measuredParagraphLineRange,
        paragraphReference,
        viewPosition.left,
        isFirstInParagraph || possibleLines[i - 1].measuredParagraphLineRange.endsWithLineBreak,
        isLastInParagraph,
      );
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
    this.#didResetCursorVisibility = false;
    const message = event.value;
    const { didApplyMutation } = message;
    if (didApplyMutation) {
      this.#commitDirtyChanges();
    }
    if (isSafari) {
      this.#syncInputElement();
      if (this.#isSearchElementContainerVisible$.currentValue) {
        this.#replaceVisibleSearchResults();
      }
      this.#replaceViewSelectionRanges(didApplyMutation);
      if (this.#scrollSelectionIntoViewWhenFinishedUpdating) {
        this.#scrollSelectionIntoView();
      }
      this.#scrollSelectionIntoViewWhenFinishedUpdating = false;
    } else {
      if (this.#scrollSelectionIntoViewWhenFinishedUpdating) {
        this.#scrollSelectionIntoView();
      }
      this.#scrollSelectionIntoViewWhenFinishedUpdating = false;
      if (this.#isSearchElementContainerVisible$.currentValue) {
        this.#replaceVisibleSearchResults();
      }
      this.#replaceViewSelectionRanges(didApplyMutation);
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
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
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
  #trackMatchesDisposable: Disposable | null = null;
  #calculateVisibleSearchResultsMatchInfos = (): SearchOverlayMatchInfo[] => {
    this.#trackMatchesDisposable?.dispose();
    this.#trackMatchesDisposable = Disposable();
    this.add(this.#trackMatchesDisposable);
    queueMicrotaskDisposable(() => {
      this.#matchNumberMaybe$(Push(None));
    }, this.#trackMatchesDisposable);
    if (!this.#isSearchElementContainerVisible$.currentValue) {
      return [];
    }
    // TODO: Lag when dragging selection with lots of results.
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
      indexOfNearestLessThanEqDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleTop - marginTopBottom,
        this.#compareParagraphTopToOffsetTop.bind(this),
      ) - 1,
    );
    const endIndex = Math.min(
      numParagraphReferences - 1,
      indexOfNearestLessThanEqDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleBottom + marginTopBottom,
        this.#compareParagraphTopToOffsetTop.bind(this),
        startIndex,
      ) + 1,
    );
    const matchInfos: SearchOverlayMatchInfo[] = [];
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (
      this.#searchElementTrackAllControl &&
      focusSelectionRange &&
      focusSelectionRange.ranges.length === 1 &&
      matita.isParagraphPoint(focusSelectionRange.ranges[0].startPoint) &&
      matita.isParagraphPoint(focusSelectionRange.ranges[0].endPoint) &&
      matita.areParagraphPointsAtSameParagraph(focusSelectionRange.ranges[0].startPoint, focusSelectionRange.ranges[0].endPoint)
    ) {
      const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(focusSelectionRange.ranges[0].startPoint);
      const focusStartOffset = focusSelectionRange.ranges[0].startPoint.offset;
      const focusEndOffset = focusSelectionRange.ranges[0].endPoint.offset;
      const paragraphMatches = this.#searchControl.getMatchesForParagraphAtBlockReference(paragraphReference);
      const matchIndexInParagraph = paragraphMatches.matches.findIndex(
        (otherMatch) =>
          (otherMatch.startOffset === focusStartOffset && otherMatch.endOffset === focusEndOffset) ||
          (otherMatch.startOffset === focusEndOffset && otherMatch.endOffset === focusStartOffset),
      );
      if (matchIndexInParagraph !== -1) {
        const totalMatchesBeforeParagraph$ = this.#searchElementTrackAllControl.trackTotalMatchesBeforeParagraphAtParagraphReferenceUntilStateOrSearchChange(
          paragraphReference,
          this.#trackMatchesDisposable,
        );
        pipe(
          totalMatchesBeforeParagraph$,
          subscribe((event) => {
            if (event.type === ThrowType) {
              throw event.error;
            }
            if (event.type === EndType) {
              return;
            }
            const totalMatchesBeforeParagraph = event.value;
            assertIsNotNullish(this.#trackMatchesDisposable);
            queueMicrotaskDisposable(() => {
              this.#matchNumberMaybe$(Push(Some(totalMatchesBeforeParagraph + matchIndexInParagraph + 1)));
            }, this.#trackMatchesDisposable);
          }, this.#trackMatchesDisposable),
        );
      }
    }
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const paragraphMatches = this.#searchControl.getMatchesForParagraphAtBlockReference(paragraphReference);
      for (let i = 0; i < paragraphMatches.matches.length; i++) {
        const match = paragraphMatches.matches[i];
        const { startOffset, endOffset } = match;
        const hasFocus =
          !!focusSelectionRange &&
          focusSelectionRange.ranges.length === 1 &&
          matita.isParagraphPoint(focusSelectionRange.ranges[0].startPoint) &&
          matita.isParagraphPoint(focusSelectionRange.ranges[0].endPoint) &&
          matita.areParagraphPointsAtSameParagraph(focusSelectionRange.ranges[0].startPoint, focusSelectionRange.ranges[0].endPoint) &&
          matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(focusSelectionRange.ranges[0].startPoint), paragraphReference) &&
          ((focusSelectionRange.ranges[0].startPoint.offset === startOffset && focusSelectionRange.ranges[0].endPoint.offset === endOffset) ||
            (focusSelectionRange.ranges[0].startPoint.offset === endOffset && focusSelectionRange.ranges[0].endPoint.offset === startOffset));
        const isSelected =
          hasFocus ||
          this.stateControl.stateView.selection.selectionRanges.some(
            (selectionRange) =>
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              selectionRange.id !== focusSelectionRange!.id &&
              selectionRange.ranges.length === 1 &&
              matita.isParagraphPoint(selectionRange.ranges[0].startPoint) &&
              matita.isParagraphPoint(selectionRange.ranges[0].endPoint) &&
              matita.areParagraphPointsAtSameParagraph(selectionRange.ranges[0].startPoint, selectionRange.ranges[0].endPoint) &&
              matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(selectionRange.ranges[0].startPoint), paragraphReference) &&
              ((selectionRange.ranges[0].startPoint.offset === startOffset && selectionRange.ranges[0].endPoint.offset === endOffset) ||
                (selectionRange.ranges[0].startPoint.offset === endOffset && selectionRange.ranges[0].endPoint.offset === startOffset)),
          );
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
          isSelected,
          hasFocus,
        });
      }
    }
    return matchInfos;
  };
  #replaceVisibleSearchResults(): void {
    this.#searchOverlay$(
      Push({
        calculateMatchInfos: this.#calculateVisibleSearchResultsMatchInfos.bind(this),
        renderSync: !this.#renderOverlayAsync && !this.#isDraggingSelection,
        onRender: () => {
          this.#renderOverlayAsync = false;
        },
        roundCorners: true,
      }),
    );
  }
  #virtualSelectionDisposable: Disposable | null = null;
  #lastRenderedSelection: matita.Selection | null = null;
  #lastRenderedCustomCollapsedSelectionTextConfig: TextConfig | null = null;
  #replaceViewSelectionRanges(forceUpdate?: boolean): void {
    if (
      forceUpdate === false &&
      this.#lastRenderedSelection === this.stateControl.stateView.selection &&
      this.#lastRenderedCustomCollapsedSelectionTextConfig === this.stateControl.stateView.customCollapsedSelectionTextConfig
    ) {
      return;
    }
    this.#lastRenderedSelection = this.stateControl.stateView.selection;
    this.#lastRenderedCustomCollapsedSelectionTextConfig = this.stateControl.stateView.customCollapsedSelectionTextConfig;
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
          renderSync: false,
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
    pipe(
      combine(viewCursorAndRangeInfosForSelectionRangeSources),
      map(
        (viewCursorAndRangeInfosForSelectionRanges, i): SelectionViewMessage => ({
          viewCursorAndRangeInfos: {
            viewCursorAndRangeInfosForSelectionRanges,
          },
          renderSync: !this.#renderOverlayAsync && (!isFirefox || i === 0),
        }),
      ),
      subscribe(this.#selectionView$),
    );
  }
  #makeViewCursorAndRangeInfosForSelectionRange(
    selectionRange: matita.SelectionRange,
    isFocusSelectionRange: boolean,
    disposable: Disposable,
  ): Source<ViewCursorAndRangeInfosForSelectionRange> {
    const viewCursorAndRangeInfoForRangeSources = selectionRange.ranges.map((range) => {
      const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
      const viewCursorAndRangeInfosForRange$ = this.#makeViewCursorAndRangeInfosForRange(
        range,
        range.id === selectionRange.anchorRangeId,
        range.id === selectionRange.focusRangeId,
        isFocusSelectionRange,
        lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
          this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId),
        disposable,
        selectionRange,
      );
      return viewCursorAndRangeInfosForRange$;
    });
    return pipe(
      combine(viewCursorAndRangeInfoForRangeSources),
      map(
        (viewCursorAndRangeInfosForRanges): ViewCursorAndRangeInfosForSelectionRange => ({
          viewCursorAndRangeInfosForRanges,
          selectionRangeId: selectionRange.id,
          isInComposition: this.#isInComposition > 0,
          roundCorners: true,
        }),
      ),
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
    const defaultVisibleLineBreakPadding = 12;
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
            lineRect = makeViewRectangle(
              measuredParagraphLineRange.boundingRect.right + relativeOffsetLeft,
              measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
              defaultVisibleLineBreakPadding,
              measuredParagraphLineRange.boundingRect.height,
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
    return Math.min(isFirefox ? 300 : 600, window.innerHeight);
  }
  // TODO: check works when removing paragraphs?
  // TODO: Batch ranges w/ IntersectionObserver/binary search?
  // TODO: Make general control for underlays/overlays (combine logic for selection, search, spelling, errors, warnings, conflicts, etc.).
  #makeViewCursorAndRangeInfosForRange(
    range: matita.Range,
    isAnchor: boolean,
    isFocus: boolean,
    isFocusSelectionRange: boolean,
    isMarkedLineWrapFocusCursorWrapToNextLine: boolean,
    disposable: Disposable,
    selectionRange?: matita.SelectionRange,
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
    const observeParagraphs = (): void => {
      const noTargetsTracked = observingTargets.size === 0;
      for (let i = 0; i < observedParagraphReferences.length; i++) {
        const paragraphReference = observedParagraphReferences[i];
        const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
        const target = paragraphRenderControl.containerHtmlElement;
        selectionIntersectionObserver.observe(target);
        if (noTargetsTracked) {
          observingTargets.add(target);
        }
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
    let selectionIntersectionObserver!: ReactiveIntersectionObserver;
    if (isSafari) {
      pipe(
        fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
        throttle(() => ofEvent(End, scheduleMicrotask)),
        subscribe((event) => {
          assert(event.type === PushType);
          viewCursorAndRangeInfosForRange$(Push(calculateViewCursorAndRangeInfosForVisibleParagraphsManually()));
        }, disposable),
      );
    } else {
      // Safari intersection observer sucks.
      selectionIntersectionObserver = makeIntersectionObserver();
      observeParagraphs();
      // Intersection observer doesn't track correctly, so fix when scroll stops.
      pipe(
        fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
        isFirefox || observedParagraphReferences.length < 4000 ? debounce(() => timer(100)) : throttle(() => timer(50)),
        subscribe((event) => {
          assert(event.type === PushType);
          viewCursorAndRangeInfosForRange$(Push(calculateViewCursorAndRangeInfosForVisibleParagraphsManually()));
          selectionIntersectionObserver.dispose();
          selectionIntersectionObserver = makeIntersectionObserver();
          observeParagraphs();
        }, disposable),
      );
    }
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
      const anchorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPointFillingLine(anchorPoint, isMarkedLineWrapFocusCursorWrapToNextLine);
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
      const cursorPositionAndHeight = this.#getCursorPositionAndHeightFromParagraphPointFillingLine(focusPoint, isMarkedLineWrapFocusCursorWrapToNextLine);
      assertIsNotNullish(selectionRange);
      const insertTextConfig = getInsertTextConfigAtSelectionRange(
        this.stateControl.stateView.document,
        this.stateControl.stateView.customCollapsedSelectionTextConfig,
        selectionRange,
      );
      let cursorTop: number;
      let cursorHeight: number;
      const isCollapsed = direction === matita.RangeDirection.NeutralText;
      if (isCollapsed) {
        const firstParagraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(firstParagraphReference);
        const cursorTopAndHeight = firstParagraphRenderControl.convertLineTopAndHeightToCursorTopAndHeightWithInsertTextConfig(
          cursorPositionAndHeight.position.top,
          cursorPositionAndHeight.height,
          insertTextConfig,
          cursorPositionAndHeight.measuredParagraphLineRange,
        );
        cursorTop = cursorTopAndHeight.top;
        cursorHeight = cursorTopAndHeight.height;
      } else {
        cursorTop = cursorPositionAndHeight.position.top;
        cursorHeight = cursorPositionAndHeight.height;
      }
      const viewCursorInfo: ViewCursorInfo = {
        position: {
          left: cursorPositionAndHeight.position.left + relativeOffsetLeft,
          top: cursorTop + relativeOffsetTop,
        },
        height: cursorHeight,
        isAnchor,
        isFocus,
        isItalic: isCollapsed && insertTextConfig.italic === true,
        paragraphReference: focusParagraphReference,
        offset: cursorOffset,
        rangeDirection: direction,
        insertTextConfig,
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
        indexOfNearestLessThanEq(observedParagraphReferences, visibleTop - marginTopBottom, this.#compareParagraphTopToOffsetTop.bind(this)) - 1,
      );
      const endIndex = Math.min(
        observedParagraphReferences.length - 1,
        indexOfNearestLessThanEq(observedParagraphReferences, visibleBottom + marginTopBottom, this.#compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
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
            matita.makeContentFragmentParagraph(
              matita.makeParagraph({}, text.length === 0 ? [] : [matita.makeText(defaultTextConfig, text)], matita.generateId()),
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
