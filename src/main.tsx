import { RefObject, createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Children, createContext, useContext } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { v4 } from 'uuid';
import { isFirefox, isSafari } from './common/browserDetection';
import { IndexableUniqueStringList } from './common/IndexableUniqueStringList';
import { IntlSegmenter, makePromiseResolvingToNativeIntlSegmenterOrPolyfill } from './common/IntlSegmenter';
import { LruCache } from './common/LruCache';
import { isValidHttpUrl, sanitizeUrl } from './common/sanitizeUrl';
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
import { ParagraphSpellingMistake, SpellCheckControl, TextEditUpdateType, forceSpellCheckControlTextEditUpdateDataKey } from './matita/SpellCheckControl';
import { Disposable, DisposableClass, disposed } from './ruscel/disposable';
import { CurrentValueDistributor, CurrentValueSource, Distributor, LastValueDistributor } from './ruscel/distributor';
import { isNone, isSome, Maybe, None, Some } from './ruscel/maybe';
import { ScheduleInterval, scheduleMicrotask } from './ruscel/schedule';
import {
  throttle,
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
  ThrowType,
  timer,
  windowScheduledBySource,
} from './ruscel/source';
import {
  pipe,
  queueMicrotaskDisposable,
  requestAnimationFrameDisposable,
  setIntervalDisposable,
  addWindowEventListener,
  addEventListener,
  setTimeoutDisposable,
} from './ruscel/util';
import './index.css';
// eslint-disable-next-line @typescript-eslint/ban-types
type DocumentConfig = {};
enum StoredListStyleType {
  UnorderedList = 'ul',
  OrderedList = 'ol',
  Checklist = 'checklist',
}
enum OrderedListStyle {
  Decimal = 'decimal',
  LowerAlpha = 'lowerAlpha',
  UpperAlpha = 'upperAlpha',
  LowerRoman = 'lowerRoman',
  UpperRoman = 'upperRoman',
  LowerGreek = 'lowerGreek',
  UpperGreek = 'upperGreek',
}
const orderedListStyles = [
  OrderedListStyle.Decimal,
  OrderedListStyle.LowerAlpha,
  OrderedListStyle.LowerGreek,
  OrderedListStyle.LowerRoman,
  OrderedListStyle.UpperAlpha,
  OrderedListStyle.UpperGreek,
  OrderedListStyle.UpperRoman,
];
function encodeNumberByString(number: number, string: string): string {
  let markerText = '';
  do {
    markerText = string[(number - 1) % string.length] + markerText;
    number = Math.floor((number - 1) / string.length);
  } while (number > 0);
  return markerText;
}
function makeLowerAlphaListMarkerText(number: number): string {
  return encodeNumberByString(number, 'abcdefghijklmnopqrstuvwxyz');
}
function makeUpperAlphaListMarkerText(number: number): string {
  return encodeNumberByString(number, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
}
// https://blog.stevenlevithan.com/archives/javascript-roman-numeral-converter
function romanize(num: number) {
  const digits = String(num).split('');
  const key = [
    '',
    'C',
    'CC',
    'CCC',
    'CD',
    'D',
    'DC',
    'DCC',
    'DCCC',
    'CM',
    '',
    'X',
    'XX',
    'XXX',
    'XL',
    'L',
    'LX',
    'LXX',
    'LXXX',
    'XC',
    '',
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
  ];
  let roman = '';
  let i = 3;
  while (i--) {
    roman = (key[Number(digits.pop()) + i * 10] || '') + roman;
  }
  return Array(+digits.join('') + 1).join('M') + roman;
}
function makeLowerGreekListMarkerText(number: number): string {
  return encodeNumberByString(number, 'αβγδεζηθικλμνξοπρστυφχψω');
}
function makeUpperGreekListMarkerText(number: number): string {
  return encodeNumberByString(number, 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ');
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
  OrderedList_style?: OrderedListStyle;
};
function convertStoredOrderedListStartNumberToAccessedStartNumber(startNumber?: number): number {
  return typeof startNumber === 'number' && Number.isInteger(startNumber) && startNumber >= 1 && startNumber < 2 ** 20 ? startNumber : 1;
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
const maxListIndentLevel = 23;
type StoredListIndent = undefined | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;
const acceptableStoredListIndents: StoredListIndent[] = [undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
type NumberedListIndent = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;
const acceptableNumberedListIndents: NumberedListIndent[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
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
function accessListTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
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
  return accessListTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, numberedIndentLevel);
}
function accessOrderedListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
  topLevelContentConfig: TopLevelContentConfig,
  listId: string,
  indentLevel: NumberedListIndent,
): OrderedListStyle {
  if (accessListTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, indentLevel) !== AccessedListStyleType.OrderedList) {
    throwUnreachable();
  }
  const listStyle = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, indentLevel);
  if (!matita.isJsonMap(listStyle)) {
    return OrderedListStyle.Decimal;
  }
  let style = listStyle.OrderedList_style;
  if (!(orderedListStyles as unknown[]).includes(style)) {
    style = OrderedListStyle.Decimal;
  }
  return style as OrderedListStyle;
}
function accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(
  topLevelContentConfig: TopLevelContentConfig,
  paragraphConfig: ParagraphConfig,
): OrderedListStyle {
  if (accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContentConfig, paragraphConfig) !== AccessedListStyleType.OrderedList) {
    throwUnreachable();
  }
  const listId = paragraphConfig.ListItem_listId;
  assertIsNotNullish(listId);
  const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraphConfig.ListItem_indentLevel);
  return accessOrderedListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(topLevelContentConfig, listId, numberedIndentLevel);
}
function isStoredListTypeSet(storedListType: StoredListStyleType | undefined): boolean {
  return (
    storedListType === StoredListStyleType.UnorderedList ||
    storedListType === StoredListStyleType.OrderedList ||
    storedListType === StoredListStyleType.Checklist
  );
}
function convertStoredListStyleTypeToAccessedListType(storedListType: StoredListStyleType | undefined): AccessedListStyleType {
  if (storedListType === StoredListStyleType.OrderedList) {
    return AccessedListStyleType.OrderedList;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (storedListType === StoredListStyleType.Checklist) {
    return AccessedListStyleType.Checklist;
  }
  return defaultListStyleType;
}
function convertAccessedListStyleTypeToStoredListType(accessedListType: AccessedListStyleType): StoredListStyleType | undefined {
  if (accessedListType === AccessedListStyleType.UnorderedList) {
    return StoredListStyleType.UnorderedList;
  }
  if (accessedListType === AccessedListStyleType.Checklist) {
    return StoredListStyleType.Checklist;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (accessedListType === AccessedListStyleType.OrderedList) {
    return StoredListStyleType.OrderedList;
  }
  assertUnreachable(accessedListType);
}
enum ParagraphType {
  ListItem = 'listItem',
  Quote = 'quote',
  Indent1 = 'indent1',
  IndentHanging1 = 'indentHanging1',
  IndentFirstLine1 = 'indentFirstLine1',
  Heading1 = 'heading1',
  Heading2 = 'heading2',
  Heading3 = 'heading3',
  Heading4 = 'heading4',
  Heading5 = 'heading5',
  Heading6 = 'heading6',
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
const resetMergeParagraphTypeConfig: ParagraphConfig = {
  type: undefined,
  ListItem_listId: undefined,
  ListItem_Checklist_checked: undefined,
  ListItem_indentLevel: undefined,
};
enum EmbedType {
  Collapsible = 'collapsible',
  CaptionedImage = 'captionedImage',
  CaptionedVideo = 'video',
  Table = 'table',
  Callout = 'callout',
  Code = 'code',
  Tabs = 'tabs',
  HorizontalRule = 'horizontalRule',
  FootnoteDetails = 'footnoteDetails',
  Spoiler = 'spoiler',
  Latex = 'latex',
  Mermaid = 'mermaid',
  Excalidraw = 'excalidraw',
  Tweet = 'tweet',
  YoutubeVideo = 'youtubeVideo',
  NestableListItem = 'nestableListItem',
  Poll = 'poll',
  Giphy = 'giphy',
}
enum CodeLanguage {
  JavaScript = 'js',
  Json = 'json',
  Html = 'html',
  Css = 'css',
  Sass = 'sass',
  Scss = 'scss',
  Less = 'less',
  Flow = 'flow',
  TypeScript = 'ts',
  Markdown = 'md',
  Bash = 'bash',
  C = 'c',
  Cpp = 'cpp',
  ObjectiveC = 'objc',
  Java = 'java',
  Python = 'python',
  Julia = 'julia',
  R = 'r',
  Ruby = 'ruby',
  Rust = 'rust',
  Go = 'go',
  Sql = 'sql',
  CSharp = 'cs',
  Haskell = 'hs',
}
const supportedCodeLanguages = new Set([
  CodeLanguage.JavaScript,
  CodeLanguage.Json,
  CodeLanguage.Html,
  CodeLanguage.Css,
  CodeLanguage.Sass,
  CodeLanguage.Scss,
  CodeLanguage.Less,
  CodeLanguage.Flow,
  CodeLanguage.TypeScript,
  CodeLanguage.Markdown,
  CodeLanguage.Bash,
  CodeLanguage.C,
  CodeLanguage.Cpp,
  CodeLanguage.ObjectiveC,
  CodeLanguage.Java,
  CodeLanguage.Python,
  CodeLanguage.Julia,
  CodeLanguage.R,
  CodeLanguage.Ruby,
  CodeLanguage.Rust,
  CodeLanguage.Go,
  CodeLanguage.Sql,
  CodeLanguage.CSharp,
  CodeLanguage.Haskell,
]);
function accessCodeLanguage(codeLanguage: string): CodeLanguage | undefined {
  if ((supportedCodeLanguages as Set<string>).has(codeLanguage)) {
    return codeLanguage as CodeLanguage;
  }
}
type EmbedConfig = {
  type?: EmbedType;
  FootnoteDetails_footnoteId?: string;
  Code_lang?: CodeLanguage;
};
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
  Purple = 'purple',
}
const colors = [Color.Red, Color.Green, Color.Blue, Color.Purple];
const colorLabels: Record<Color, string> = {
  [Color.Red]: 'Red',
  [Color.Green]: 'Green',
  [Color.Blue]: 'Blue',
  [Color.Purple]: 'Purple',
};
const colorHexValues: Record<Color, string> = {
  [Color.Red]: '#e02424',
  [Color.Green]: '#31c48d',
  [Color.Blue]: '#3f83f8',
  [Color.Purple]: '#9061f9',
};
const highlightColorHexValues: Record<Color, string> = {
  [Color.Red]: '#e0242455',
  [Color.Green]: '#31c48d55',
  [Color.Blue]: '#3f83f855',
  [Color.Purple]: '#9061f955',
};
const darkerHighlightColorHexValues: Record<Color, string> = {
  [Color.Red]: '#e02424aa',
  [Color.Green]: '#31c48daa',
  [Color.Blue]: '#3f83f8aa',
  [Color.Purple]: '#9061f9aa',
};
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
  color?: Color;
  highlightColor?: Color;
  link?: string;
};
const defaultTextConfig: TextConfig = {};
const resetMergeTextConfig: TextConfig = {
  bold: undefined,
  italic: undefined,
  underline: undefined,
  code: undefined,
  strikethrough: undefined,
  script: undefined,
  color: undefined,
  highlightColor: undefined,
  link: undefined,
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
  if (!matita.isSelectionRangeCollapsedInText(selectionRange)) {
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
  if (customCollapsedSelectionTextConfig === null || !matita.isSelectionRangeCollapsedInText(selectionRange)) {
    return getInsertTextConfigAtSelectionRangeWithoutCustomCollapsedSelectionTextConfig(document, selectionRange);
  }
  return { ...getInsertTextConfigAtSelectionRangeWithoutCustomCollapsedSelectionTextConfig(document, selectionRange), ...customCollapsedSelectionTextConfig };
}
enum VoidType {
  Image = 'image',
  FootnoteMarker = 'footnoteMarker',
  FileChip = 'fileChip',
  AudioChip = 'audioChip',
  Latex = 'latex',
}
enum StoredVoidImageAlignment {
  Inline = 'inline',
  FloatLeft = 'floatLeft',
  FloatRight = 'floatRight',
}
type VoidConfig = {
  type?: VoidType;
  Image_alignment?: StoredVoidImageAlignment;
  FootnoteMarker_footnoteId?: string;
};
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
  ListItem_OrderedList_style?: OrderedListStyle;
}
class VirtualizedParagraphRenderControl extends DisposableClass implements matita.ParagraphRenderControl {
  paragraphReference: matita.BlockReference;
  private $p_viewControl: VirtualizedViewControl;
  containerHtmlElement: HTMLElement;
  private $p_textContainerElement!: HTMLElement;
  textNodeInfos: TextElementInfo[] = [];
  private $p_baseFontSize = 16;
  private $p_fontSize = this.$p_baseFontSize;
  private $p_lineHeight = 2;
  private $p_scriptFontSizeMultiplier = 0.85;
  private $p_dirtyChildren = true;
  private $p_dirtyContainer = true;
  constructor(paragraphReference: matita.BlockReference, viewControl: VirtualizedViewControl) {
    super();
    this.paragraphReference = paragraphReference;
    this.$p_viewControl = viewControl;
    this.containerHtmlElement = this.$p_makeContainerHtmlElement();
    this.$p_textContainerElement = this.containerHtmlElement;
  }
  private $p_makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('div');
    containerHtmlElement.style.whiteSpace = 'break-spaces';
    containerHtmlElement.style.overflowWrap = 'anywhere';
    containerHtmlElement.style.fontFamily = 'Roboto, sans-serif';
    containerHtmlElement.style.letterSpacing = '0.2px';
    containerHtmlElement.style.fontSize = `${this.$p_fontSize}px`;
    containerHtmlElement.style.lineHeight = `${this.$p_lineHeight}`;
    containerHtmlElement.style.position = 'relative';
    return containerHtmlElement;
  }
  get fontSize(): number {
    return this.$p_fontSize;
  }
  convertLineTopAndHeightToCursorTopAndHeightWithInsertTextConfig(
    lineTop: number,
    lineHeight: number,
    insertTextConfig: TextConfig,
    measuredParagraphLineRanges: MeasuredParagraphLineRange[],
    measuredParagraphLineRangeIndex: number,
  ): { top: number; height: number } {
    const measuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
    if (measuredParagraphLineRange.startOffset !== measuredParagraphLineRange.endOffset) {
      const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
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
      top = lineTop + lineHeight / 2 - this.$p_fontSize / 2 - this.$p_fontSize * 0.18;
      height = this.$p_fontSize * 1.42;
    } else {
      height = (this.$p_fontSize / this.$p_scriptFontSizeMultiplier) * 0.95;
      top = lineTop + lineHeight / 2 - height / 2;
      if (insertTextConfig.script === TextConfigScript.Sub) {
        top += 0.175 * height;
      } else {
        top -= 0.23 * height;
      }
    }
    return { top, height };
  }
  private $p_addInlineStylesToTextElement(
    textElement: HTMLElement,
    textConfig: TextConfig,
    paragraph: matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    inlineIndex: number,
    isFirstInTextNode: boolean,
    isLastInTextNode: boolean,
  ): void {
    if (textConfig.color !== undefined && colors.includes(textConfig.color)) {
      textElement.style.color = colorHexValues[textConfig.color];
    }
    if (textConfig.highlightColor !== undefined && colors.includes(textConfig.highlightColor)) {
      textElement.style.backgroundColor = highlightColorHexValues[textConfig.highlightColor];
    }
    let isUnderline = false;
    if (typeof textConfig.link === 'string' && textConfig.link !== '') {
      isUnderline = true;
      textElement.style.color = 'rgb(26, 115, 232)';
    }
    if (textConfig.bold === true) {
      textElement.style.fontWeight = 'bold';
    }
    if (textConfig.italic === true) {
      textElement.style.fontStyle = 'italic';
    }
    isUnderline ||= textConfig.underline === true;
    if (isUnderline) {
      if (textConfig.strikethrough === true) {
        textElement.style.textDecoration = 'underline line-through';
      } else {
        textElement.style.textDecoration = 'underline';
      }
    } else if (textConfig.strikethrough === true) {
      textElement.style.textDecoration = 'line-through';
    }
    if (textConfig.script === TextConfigScript.Super || textConfig.script === TextConfigScript.Sub) {
      textElement.style.fontSize = `${this.$p_fontSize * this.$p_scriptFontSizeMultiplier}px`;
      if (textConfig.script === TextConfigScript.Super) {
        textElement.style.verticalAlign = 'super';
      } else {
        textElement.style.verticalAlign = 'sub';
      }
    }
    if (textConfig.code === true) {
      textElement.style.fontFamily = 'Roboto Mono, monospace';
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
  private $p_accessParagraph(): matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    const paragraph = matita.accessBlockFromBlockReference(documentRenderControl.stateControl.stateView.document, this.paragraphReference);
    matita.assertIsParagraph(paragraph);
    return paragraph;
  }
  private $p_previousRenderedConfig: ParagraphConfig | undefined;
  private $p_previousInjectedStyle: ParagraphStyleInjection | undefined;
  private $p_makeListMarker(paragraphConfig: ParagraphConfig, injectedStyle: ParagraphStyleInjection): HTMLElement {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
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
        assertIsNotNullish(injectedStyle.ListItem_OrderedList_style);
        const number = injectedStyle.ListItem_OrderedList_number;
        const style = injectedStyle.ListItem_OrderedList_style;
        let listMarkerText: string;
        switch (style) {
          case OrderedListStyle.Decimal: {
            listMarkerText = String(number);
            break;
          }
          case OrderedListStyle.LowerAlpha: {
            listMarkerText = makeLowerAlphaListMarkerText(number);
            break;
          }
          case OrderedListStyle.UpperAlpha: {
            listMarkerText = makeUpperAlphaListMarkerText(number);
            break;
          }
          case OrderedListStyle.LowerRoman: {
            listMarkerText = romanize(number).toLowerCase();
            break;
          }
          case OrderedListStyle.UpperRoman: {
            listMarkerText = romanize(number);
            break;
          }
          case OrderedListStyle.LowerGreek: {
            listMarkerText = makeLowerGreekListMarkerText(number);
            break;
          }
          case OrderedListStyle.UpperGreek: {
            listMarkerText = makeUpperGreekListMarkerText(number);
            break;
          }
        }
        listMarker.append(document.createTextNode(`${listMarkerText}.`));
        return listMarker;
      }
      case AccessedListStyleType.Checklist: {
        const listMarker = document.createElement('span');
        let className = 'list-item--checklist__checkbox';
        if (paragraphConfig.ListItem_Checklist_checked === true) {
          className += ' list-item--checklist__checkbox--checked';
        }
        listMarker.className = className;
        listMarker.style.top = `${(this.$p_lineHeight * this.$p_fontSize - 18) / 2}px`;
        return listMarker;
      }
    }
  }
  listMarkerElement: HTMLElement | null = null;
  private $p_getPaddingLeftStyleFromListIndent(listIndent: number): string {
    return `${16 + 32 * listIndent}px`;
  }
  private $p_updateContainer(injectedStyle: ParagraphStyleInjection): void {
    const paragraph = this.$p_accessParagraph();
    const previousAccessedParagraphAlignment =
      this.$p_previousRenderedConfig && convertStoredParagraphAlignmentToAccessedParagraphAlignment(this.$p_previousRenderedConfig.alignment);
    const accessedParagraphAlignment = convertStoredParagraphAlignmentToAccessedParagraphAlignment(paragraph.config.alignment);
    if (previousAccessedParagraphAlignment !== accessedParagraphAlignment) {
      this.containerHtmlElement.style.textAlign = accessedParagraphAlignment;
      if (isSafari) {
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.containerHtmlElement.style.whiteSpace = 'pre-wrap';
        } else if (previousAccessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.containerHtmlElement.style.whiteSpace = 'break-spaces';
        }
      }
    }
    if (this.$p_previousRenderedConfig === undefined || this.$p_previousRenderedConfig.type !== paragraph.config.type) {
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.ListItem) {
        this.containerHtmlElement.style.display = '';
        this.containerHtmlElement.style.justifyContent = '';
        this.containerHtmlElement.style.gap = '';
        this.containerHtmlElement.style.paddingLeft = '';
        this.containerHtmlElement.style.color = '';
        this.$p_textContainerElement.style.textDecoration = '';
        this.containerHtmlElement.replaceChildren(...this.$p_textContainerElement.childNodes);
        this.$p_textContainerElement = this.containerHtmlElement;
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.Quote) {
        this.containerHtmlElement.style.display = '';
        this.containerHtmlElement.style.width = '';
        this.containerHtmlElement.style.color = '';
        this.containerHtmlElement.style.borderLeft = '';
        this.containerHtmlElement.style.paddingLeft = '';
        this.containerHtmlElement.style.marginLeft = '';
        this.containerHtmlElement.style.marginRight = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.Indent1) {
        this.containerHtmlElement.style.paddingLeft = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.IndentFirstLine1) {
        this.containerHtmlElement.style.textIndent = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.IndentHanging1) {
        this.containerHtmlElement.style.paddingLeft = '';
        this.containerHtmlElement.style.textIndent = '';
      }
      if (
        this.$p_previousRenderedConfig !== undefined &&
        (this.$p_previousRenderedConfig.type === ParagraphType.Heading1 ||
          this.$p_previousRenderedConfig.type === ParagraphType.Heading2 ||
          this.$p_previousRenderedConfig.type === ParagraphType.Heading3 ||
          this.$p_previousRenderedConfig.type === ParagraphType.Heading4 ||
          this.$p_previousRenderedConfig.type === ParagraphType.Heading5 ||
          this.$p_previousRenderedConfig.type === ParagraphType.Heading6)
      ) {
        this.containerHtmlElement.style.fontWeight = '';
        this.$p_fontSize = this.$p_baseFontSize;
        this.containerHtmlElement.style.fontSize = `${this.$p_baseFontSize}px`;
      }
      switch (paragraph.config.type) {
        case undefined: {
          break;
        }
        case ParagraphType.Quote: {
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
        case ParagraphType.Indent1: {
          this.containerHtmlElement.style.paddingLeft = '32px';
          break;
        }
        case ParagraphType.IndentFirstLine1: {
          this.containerHtmlElement.style.textIndent = '32px';
          break;
        }
        case ParagraphType.IndentHanging1: {
          this.containerHtmlElement.style.paddingLeft = '32px';
          this.containerHtmlElement.style.textIndent = '-32px';
          break;
        }
        case ParagraphType.Heading1: {
          this.$p_fontSize = 2 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.Heading2: {
          this.$p_fontSize = 1.5 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.Heading3: {
          this.$p_fontSize = 1.25 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.Heading4: {
          this.$p_fontSize = 1.1 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.Heading5: {
          this.$p_fontSize = 0.94 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.Heading6: {
          this.$p_fontSize = 0.85 * this.$p_baseFontSize;
          this.containerHtmlElement.style.fontWeight = 'bold';
          this.containerHtmlElement.style.fontSize = `${this.fontSize}px`;
          break;
        }
        case ParagraphType.ListItem: {
          this.$p_textContainerElement = document.createElement('span');
          this.$p_textContainerElement.append(...this.containerHtmlElement.childNodes);
          this.containerHtmlElement.style.display = 'flex';
          const justifyContent =
            accessedParagraphAlignment === AccessedParagraphAlignment.Right
              ? 'end'
              : accessedParagraphAlignment === AccessedParagraphAlignment.Center
              ? 'center'
              : 'start';
          this.containerHtmlElement.style.justifyContent = justifyContent;
          this.containerHtmlElement.style.gap = '0.5em';
          this.containerHtmlElement.style.paddingLeft = this.$p_getPaddingLeftStyleFromListIndent(
            convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel),
          );
          this.listMarkerElement = this.$p_makeListMarker(paragraph.config, injectedStyle);
          this.containerHtmlElement.append(this.listMarkerElement, this.$p_textContainerElement);
          if (injectedStyle.ListItem_type === AccessedListStyleType.Checklist && paragraph.config.ListItem_Checklist_checked === true) {
            this.containerHtmlElement.style.color = '#888';
            this.$p_textContainerElement.style.textDecoration = 'line-through';
          }
          break;
        }
        default: {
          assertUnreachable(paragraph.config.type);
        }
      }
    } else {
      assertIsNotNullish(this.$p_previousInjectedStyle);
      if (paragraph.config.type === ParagraphType.Quote) {
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
        assertIsNotNullish(this.listMarkerElement);
        assertIsNotNullish(this.$p_previousInjectedStyle.ListItem_type);
        assertIsNotNullish(injectedStyle.ListItem_type);
        const recreateMarker =
          this.$p_previousInjectedStyle.ListItem_type !== injectedStyle.ListItem_type ||
          this.$p_previousInjectedStyle.ListItem_OrderedList_number !== injectedStyle.ListItem_OrderedList_number ||
          this.$p_previousInjectedStyle.ListItem_OrderedList_style !== injectedStyle.ListItem_OrderedList_style;
        if (recreateMarker) {
          const previousListMarkerElement = this.listMarkerElement;
          this.listMarkerElement = this.$p_makeListMarker(paragraph.config, injectedStyle);
          previousListMarkerElement.replaceWith(this.listMarkerElement);
        }
        const justifyContent =
          accessedParagraphAlignment === AccessedParagraphAlignment.Right
            ? 'end'
            : accessedParagraphAlignment === AccessedParagraphAlignment.Center
            ? 'center'
            : 'start';
        this.containerHtmlElement.style.justifyContent = justifyContent;
        const previousListIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(this.$p_previousRenderedConfig.ListItem_indentLevel);
        const listIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel);
        if (previousListIndentLevel !== listIndentLevel) {
          this.containerHtmlElement.style.paddingLeft = this.$p_getPaddingLeftStyleFromListIndent(listIndentLevel);
        }
        if (
          injectedStyle.ListItem_type === AccessedListStyleType.Checklist &&
          !recreateMarker &&
          this.$p_previousRenderedConfig.ListItem_Checklist_checked !== paragraph.config.ListItem_Checklist_checked
        ) {
          if (paragraph.config.ListItem_Checklist_checked === true) {
            this.listMarkerElement.classList.add('list-item--checklist__checkbox--checked');
          } else {
            this.listMarkerElement.classList.remove('list-item--checklist__checkbox--checked');
          }
        }
        if (injectedStyle.ListItem_type === AccessedListStyleType.Checklist && paragraph.config.ListItem_Checklist_checked) {
          this.containerHtmlElement.style.color = '#888';
          this.$p_textContainerElement.style.textDecoration = 'line-through';
        } else {
          this.containerHtmlElement.style.color = '';
          this.$p_textContainerElement.style.textDecoration = '';
        }
      }
    }
    if (paragraph.config.type !== ParagraphType.ListItem) {
      this.listMarkerElement = null;
    }
    this.$p_previousRenderedConfig = paragraph.config;
    this.$p_previousInjectedStyle = injectedStyle;
  }
  private $p_updateChildren(): void {
    const paragraph = this.$p_accessParagraph();
    this.textNodeInfos.length = 0;
    if (paragraph.children.length === 0) {
      const textNode = document.createTextNode('\u200b');
      this.textNodeInfos.push({
        textStart: 0,
        textEnd: 0,
        textNode,
        endsWithLineBreak: false,
      });
      this.$p_textContainerElement.replaceChildren(textNode);
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
          this.$p_addInlineStylesToTextElement(
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
      this.$p_addInlineStylesToTextElement(textElement, inline.config, paragraph, i, inline.text.length === remainingText.length, true);
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
    this.$p_textContainerElement.replaceChildren(...newChildren);
  }
  onConfigOrChildrenChanged(isParagraphChildrenUpdated: boolean): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.dirtyParagraphIdQueue.queue(matita.getBlockIdFromBlockReference(this.paragraphReference));
    if (isParagraphChildrenUpdated) {
      this.$p_dirtyChildren = true;
    } else {
      this.$p_dirtyContainer = true;
    }
  }
  commitDirtyChanges(injectedStyle: ParagraphStyleInjection): void {
    const previousFontSize = this.$p_fontSize;
    if (this.$p_dirtyContainer) {
      this.$p_dirtyContainer = false;
      this.$p_updateContainer(injectedStyle);
    }
    const currentFontSize = this.$p_fontSize;
    if (this.$p_dirtyChildren) {
      this.$p_dirtyChildren = false;
      this.$p_updateChildren();
    } else if (previousFontSize !== currentFontSize) {
      const paragraph = this.$p_accessParagraph();
      if (
        paragraph.children.some(
          (child) => matita.isText(child) && (child.config.script === TextConfigScript.Sub || child.config.script === TextConfigScript.Super),
        )
      ) {
        this.$p_updateChildren();
      }
    }
  }
  markDirtyContainer(): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.relativeParagraphMeasurementCache.invalidate(matita.getBlockIdFromBlockReference(this.paragraphReference));
    this.$p_dirtyContainer = true;
  }
}
class VirtualizedContentRenderControl extends DisposableClass implements matita.ContentRenderControl {
  contentReference: matita.ContentReference;
  private $p_viewControl: VirtualizedViewControl;
  containerHtmlElement: HTMLElement;
  private $p_children: VirtualizedParagraphRenderControl[];
  constructor(contentReference: matita.ContentReference, viewControl: VirtualizedViewControl) {
    super();
    this.contentReference = contentReference;
    this.$p_viewControl = viewControl;
    this.containerHtmlElement = this.$p_makeContainerHtmlElement();
    this.$p_children = [];
    this.$p_init();
  }
  private $p_makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('div');
    return containerHtmlElement;
  }
  private $p_init(): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.htmlElementToNodeRenderControlMap.set(this.containerHtmlElement, this);
    const numberOfBlocks = matita.getNumberOfBlocksInContentAtContentReference(documentRenderControl.stateControl.stateView.document, this.contentReference);
    const documentFragment = document.createDocumentFragment();
    for (let i = 0; i < numberOfBlocks; i++) {
      const block = matita.accessBlockAtIndexInContentAtContentReference(documentRenderControl.stateControl.stateView.document, this.contentReference, i);
      matita.assertIsParagraph(block);
      const paragraphReference = matita.makeBlockReferenceFromBlock(block);
      const paragraphRenderControl = this.$p_makeParagraphRenderControl(paragraphReference);
      this.$p_children.push(paragraphRenderControl);
      documentFragment.appendChild(paragraphRenderControl.containerHtmlElement);
    }
    this.containerHtmlElement.appendChild(documentFragment);
  }
  private $p_makeParagraphRenderControl(paragraphReference: matita.BlockReference): VirtualizedParagraphRenderControl {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    const paragraphRenderControl = new VirtualizedParagraphRenderControl(paragraphReference, this.$p_viewControl);
    this.add(paragraphRenderControl);
    this.$p_viewControl.renderControlRegister.registerParagraphRenderControl(paragraphRenderControl);
    documentRenderControl.htmlElementToNodeRenderControlMap.set(paragraphRenderControl.containerHtmlElement, paragraphRenderControl);
    documentRenderControl.dirtyParagraphIdQueue.queue(matita.getBlockIdFromBlockReference(paragraphReference));
    return paragraphRenderControl;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onConfigChanged(): void {}
  onBlocksRemoved(blockReferences: matita.BlockReference[]): void {
    const firstBlockReference = blockReferences[0];
    const firstChildIndex = this.$p_children.findIndex((paragraphRenderControl) => {
      return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.paragraphReference, firstBlockReference);
    });
    assert(firstChildIndex !== -1);
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const childIndex = firstChildIndex + i;
      const childRenderControl = this.$p_children[childIndex];
      documentRenderControl.htmlElementToNodeRenderControlMap.delete(childRenderControl.containerHtmlElement);
      documentRenderControl.dirtyParagraphIdQueue.dequeue(matita.getBlockIdFromBlockReference(childRenderControl.paragraphReference));
      if (childRenderControl instanceof VirtualizedParagraphRenderControl) {
        this.$p_viewControl.renderControlRegister.unregisterParagraphRenderControl(childRenderControl);
      } else {
        throwNotImplemented();
      }
      childRenderControl.containerHtmlElement.remove();
      childRenderControl.dispose();
    }
    this.$p_children.splice(firstChildIndex, blockReferences.length);
  }
  onBlocksInsertedAfter(blockReferences: matita.BlockReference[], insertAfterBlockReference: matita.BlockReference | null): void {
    const insertionIndex =
      insertAfterBlockReference === null
        ? 0
        : this.$p_children.findIndex((paragraphRenderControl) => {
            return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.paragraphReference, insertAfterBlockReference);
          }) + 1;
    const childRenderControls: VirtualizedParagraphRenderControl[] = [];
    const documentFragment = document.createDocumentFragment();
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(documentRenderControl.stateControl.stateView.document, blockReference);
      let childRenderControl: VirtualizedParagraphRenderControl;
      if (matita.isParagraph(block)) {
        childRenderControl = this.$p_makeParagraphRenderControl(blockReference);
      } else {
        throwNotImplemented();
      }
      childRenderControls.push(childRenderControl);
      documentFragment.appendChild(childRenderControl.containerHtmlElement);
    }
    this.containerHtmlElement.insertBefore(
      documentFragment,
      insertionIndex === this.$p_children.length ? null : this.$p_children[insertionIndex].containerHtmlElement,
    );
    this.$p_children.splice(insertionIndex, 0, ...childRenderControls);
  }
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
  inFlush?: (maybe: Maybe<T>) => void,
): Some<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean | ((value: Maybe<T>) => boolean),
  inFlush?: (maybe: Maybe<T>) => void,
): Maybe<T>;
function use$<T>(
  source: Source<T> | ((sink: Sink<T>, isFirst: boolean) => Source<T>),
  initialMaybe?: Maybe<T> | (() => Maybe<T>),
  updateSync?: boolean | ((value: Maybe<T>) => boolean),
  inFlush?: (maybe: Maybe<T>) => void,
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
      if (event.type === EndType) {
        return;
      }
      const maybe = Some(event.value);
      if (isSyncFirstEvent) {
        syncFirstMaybe = maybe;
        return;
      }
      const updateSyncResult = typeof updateSync === 'function' ? updateSync(maybe) : updateSync;
      if (updateSyncResult === true) {
        flushSync(() => {
          setValue(maybe);
          inFlush?.(maybe);
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
  private $p_keyCount = new Map<string, number>();
  makeUniqueKey(key: string): string {
    const count = this.$p_keyCount.get(key);
    if (count !== undefined) {
      this.$p_keyCount.set(key, count + 1);
      return JSON.stringify([key, count]);
    }
    this.$p_keyCount.set(key, 1);
    return JSON.stringify([key, 0]);
  }
}
enum HitPositionType {
  CheckboxMarker = 'CheckboxMarker',
  ParagraphText = 'ParagraphText',
}
interface CheckboxMarkerHitPosition {
  type: HitPositionType.CheckboxMarker;
  paragraphReference: matita.BlockReference;
}
interface ParagraphTextHitPosition {
  type: HitPositionType.ParagraphText;
  checkboxMarkerParagraphReference: matita.BlockReference | null;
  pointWithContentReference: matita.PointWithContentReference;
  isPastPreviousCharacterHalfPoint: boolean;
  isWrappedLineStart: boolean;
  isWrappedLinePreviousEnd: boolean;
}
type HitPosition = CheckboxMarkerHitPosition | ParagraphTextHitPosition;
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
interface ViewRangeInfosForParagraphInRange {
  paragraphReference: matita.BlockReference;
  viewRangeInfos: ViewRangeInfo[];
}
interface ViewCursorAndRangeInfosForParagraphInRange extends ViewRangeInfosForParagraphInRange {
  viewCursorInfos: ViewCursorInfo[];
}
interface ViewCursorAndRangeInfosForRange {
  viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[];
  compositionRangeInfos?: ViewRangeInfosForParagraphInRange;
}
interface ViewCursorAndRangeInfosForSelectionRange {
  viewCursorAndRangeInfosForRanges: ViewCursorAndRangeInfosForRange[];
  selectionRangeId: string;
  isInComposition: boolean;
  roundCorners: boolean;
}
interface ViewCursorAndRangeInfos {
  viewCursorAndRangeInfosForSelectionRanges: ViewCursorAndRangeInfosForSelectionRange[];
  isDragging: boolean;
}
interface SelectionViewMessage {
  viewCursorAndRangeInfos: ViewCursorAndRangeInfos;
  renderSync: boolean;
}
interface SelectionViewProps {
  selectionView$: Source<SelectionViewMessage>;
  hasFocus$: Source<boolean>;
  resetSynchronizedCursorVisibility$: Source<undefined>;
  cursorElement: HTMLElement;
}
// TODO: Vanilla JS.
function SelectionView(props: SelectionViewProps): JSX.Element | null {
  const { selectionView$, hasFocus$, resetSynchronizedCursorVisibility$, cursorElement } = props;
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
          debounce(() => ofEvent(End, scheduleMicrotask)),
          memoConsecutive(),
        ),
      [hasFocus$],
    ),
    undefined,
    true,
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
  const { viewCursorAndRangeInfosForSelectionRanges, isDragging } = viewCursorAndRangeInfos;
  if (viewCursorAndRangeInfosForSelectionRanges.length === 0) {
    return null;
  }
  const uniqueKeyControl = new UniqueKeyControl();
  const selectionRectElements: JSX.Element[] = [];
  const cursorElements: JSX.Element[] = [];
  for (let i = 0; i < viewCursorAndRangeInfosForSelectionRanges.length; i++) {
    const viewCursorAndRangeInfosForSelectionRange = viewCursorAndRangeInfosForSelectionRanges[i];
    const { viewCursorAndRangeInfosForRanges, isInComposition, selectionRangeId, roundCorners } = viewCursorAndRangeInfosForSelectionRange;
    for (let j = 0; j < viewCursorAndRangeInfosForRanges.length; j++) {
      const viewCursorAndRangeInfosForRange = viewCursorAndRangeInfosForRanges[j];
      const { viewParagraphInfos, compositionRangeInfos } = viewCursorAndRangeInfosForRange;
      if (compositionRangeInfos !== undefined) {
        const { viewRangeInfos, paragraphReference } = compositionRangeInfos;
        for (let k = 0; k < viewRangeInfos.length; k++) {
          const viewRangeInfo = viewRangeInfos[k];
          const { paragraphLineIndex, rectangle } = viewRangeInfo;
          const key = uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, false, 2]));
          selectionRectElements.push(
            <span
              key={key}
              style={{
                position: 'absolute',
                top: rectangle.top,
                left: rectangle.left,
                width: rectangle.width,
                height: rectangle.height,
                backgroundColor: '#accef7cc',
              }}
            />,
          );
        }
      }
      for (let k = 0; k < viewParagraphInfos.length; k++) {
        const viewCursorAndRangeInfosForParagraphInRange = viewParagraphInfos[k];
        const { viewCursorInfos, viewRangeInfos, paragraphReference } = viewCursorAndRangeInfosForParagraphInRange;
        for (let l = 0; l < viewRangeInfos.length; l++) {
          const viewRangeInfo = viewRangeInfos[l];
          const { paragraphLineIndex, rectangle } = viewRangeInfo;
          const key = uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, 0]));
          if (isInComposition) {
            selectionRectElements.push(
              <span
                key={uniqueKeyControl.makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, 1]))}
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
            continue;
          }
          const backgroundColor = hasFocus || isDragging ? '#accef7cc' : '#d3d3d36c';
          if (roundCorners) {
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
            pushCurvedLineRectSpans(selectionRectElements, previousLineRect, rectangle, nextLineRect, 4, key, backgroundColor);
            continue;
          }
          selectionRectElements.push(
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
          cursorElements.push(
            <BlinkingCursor
              key={uniqueKeyControl.makeUniqueKey(
                JSON.stringify([paragraphReference.blockId, isAnchor, isFocus, offset, rangeDirection, selectionRangeId, insertTextConfig]),
              )}
              viewCursorInfo={viewCursorInfo}
              synchronizedCursorVisibility$={synchronizedCursorVisibility$}
              hasFocus={hasFocus}
              isDragging={isDragging}
              isItalic={isItalic}
            />,
          );
        }
      }
    }
  }
  return (
    <>
      <>{selectionRectElements}</>
      {createPortal(cursorElements, cursorElement)}
    </>
  );
}
interface BlinkingCursorProps {
  viewCursorInfo: ViewCursorInfo;
  synchronizedCursorVisibility$: Source<boolean>;
  hasFocus: boolean;
  isDragging: boolean;
  isItalic: boolean;
}
const cursorWidth = 2;
function BlinkingCursor(props: BlinkingCursorProps): JSX.Element | null {
  const { viewCursorInfo, synchronizedCursorVisibility$, hasFocus, isDragging, isItalic } = props;
  if (!viewCursorInfo.isFocus) {
    return null;
  }
  const isVisibleMaybe = use$(
    useMemo(
      () =>
        pipe(
          isDragging ? ofEvent(Push(true)) : pipe(synchronizedCursorVisibility$),
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [isDragging],
    ),
    Some(true),
    true,
  );
  return (
    <span
      style={{
        position: 'absolute',
        top: viewCursorInfo.position.top,
        left: viewCursorInfo.position.left - cursorWidth / 2,
        width: cursorWidth,
        height: viewCursorInfo.height,
        backgroundColor: hasFocus || isDragging ? '#222' : '#88888899',
        transform: isItalic ? 'skew(-7deg)' : undefined,
        visibility: isVisibleMaybe.value ? 'visible' : 'hidden',
      }}
    />
  );
}
interface TextDecorationInfo {
  charactersBoundingRectangle: ViewRectangle;
  charactersLineBoundingRectangle: ViewRectangle;
  paragraphReference: matita.BlockReference;
}
interface SpellingMistakeOverlayInfo {
  textDecorationInfos: TextDecorationInfo[];
}
interface SpellingMistakesOverlayMessage {
  spellingMistakeOverlayInfos: SpellingMistakeOverlayInfo[];
}
interface SpellingMistakesOverlayProps {
  spellingMistakeOverlay$: Source<SpellingMistakesOverlayMessage>;
}
function SpellingMistakesOverlay(props: SpellingMistakesOverlayProps): JSX.Element | null {
  const { spellingMistakeOverlay$ } = props;
  const spellingMistakesOverlayMaybe = use$(
    useMemo(
      () =>
        pipe(
          spellingMistakeOverlay$,
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [],
    ),
    undefined,
    true,
  );
  if (isNone(spellingMistakesOverlayMaybe)) {
    return null;
  }
  const { spellingMistakeOverlayInfos } = spellingMistakesOverlayMaybe.value;
  const uniqueKeyControl = new UniqueKeyControl();
  const fragmentChildren: JSX.Element[] = [];
  for (let i = 0; i < spellingMistakeOverlayInfos.length; i++) {
    const spellingMistakeInfo = spellingMistakeOverlayInfos[i];
    const { textDecorationInfos } = spellingMistakeInfo;
    for (let j = 0; j < textDecorationInfos.length; j++) {
      const viewRangeInfo = textDecorationInfos[j];
      const { charactersBoundingRectangle, paragraphReference } = viewRangeInfo;
      const key = uniqueKeyControl.makeUniqueKey(paragraphReference.blockId);
      fragmentChildren.push(
        <span
          key={key}
          style={{
            position: 'absolute',
            top: charactersBoundingRectangle.top,
            left: charactersBoundingRectangle.left,
            width: charactersBoundingRectangle.width,
            height: charactersBoundingRectangle.height,
            // eslint-disable-next-line max-len
            background: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23e51400'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E") repeat-x bottom left`,
          }}
        />,
      );
    }
  }
  return <>{fragmentChildren}</>;
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
  selectAllText$: Source<undefined>;
  onAfterSelectAll: () => void;
  containerWidth$: CurrentValueSource<number>;
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
  inputRef: React.RefObject<HTMLInputElement>;
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
    selectAllText$,
    onAfterSelectAll,
    containerWidth$,
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
  const calculateWidthFromContainerWidth = (containerWidth: number): number => {
    return containerWidth - searchBoxMargin * 2;
  };
  const selectAllTextCounter = use$(
    useMemo(
      () =>
        pipe(
          selectAllText$,
          map((_, i) => i),
        ),
      [],
    ),
  );
  useEffect(() => {
    if (isNone(selectAllTextCounter)) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    inputRef.current!.select();
    onAfterSelectAll();
  }, [selectAllTextCounter]);
  const { value: position } = use$<Position>(
    useCallback((sink: Sink<Position>) => {
      const width$ = pipe(containerWidth$, map(calculateWidthFromContainerWidth));
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
          width: calculateWidthFromContainerWidth(containerWidth$.currentValue),
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
  const safariCompositionEndTimerDisposableRef = useRef<Disposable | null>(null);
  function onCompositionStart(): void {
    safariCompositionEndTimerDisposableRef.current?.dispose();
    isInCompositionSink(Push(true));
  }
  function onCompositionEnd(): void {
    if (isSafari) {
      safariCompositionEndTimerDisposableRef.current?.dispose();
      safariCompositionEndTimerDisposableRef.current = Disposable();
      setTimeoutDisposable(
        () => {
          isInCompositionSink(Push(false));
        },
        100,
        safariCompositionEndTimerDisposableRef.current,
      );
    } else {
      isInCompositionSink(Push(false));
    }
  }
  searchBoxChildren.push(
    <div className="search-box__line-container search-box__line-container--search" key="search">
      <div className="search-box__line-container--search__sub-container search-box__line-container--search__grow-dominate">
        <input
          type="search"
          className="search-box__search-input"
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
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
    ['replaceSimilarLooking', 'Similar Looking Characters', false],
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
function useFloatingBoxPosition(
  boundingRects: { visibleBoundingRect: ViewRectangle; wordBoundingRect: ViewRectangle } | null,
  domRef: RefObject<HTMLElement>,
): { positionLeft: number; positionTop: number; maxWidth: number; maxHeight: number; isCalculated: boolean } | null {
  const domBoundingRectRef = useRef<DOMRect | null>(null);
  const [_, setDummyState] = useState({});
  useLayoutEffect(() => {
    if (domBoundingRectRef.current !== null || boundingRects === null || domRef.current === null) {
      domBoundingRectRef.current = null;
      return;
    }
    domBoundingRectRef.current = domRef.current.getBoundingClientRect();
    setDummyState({});
  });
  if (boundingRects === null) {
    return null;
  }
  const { visibleBoundingRect, wordBoundingRect } = boundingRects;
  const domBoundingRect = domBoundingRectRef.current;
  let positionLeft: number;
  let positionTop: number;
  const isCalculated = domBoundingRect !== null;
  if (isCalculated) {
    if (wordBoundingRect.left + domBoundingRect.width <= visibleBoundingRect.right) {
      positionLeft = wordBoundingRect.left;
    } else {
      positionLeft = Math.max(visibleBoundingRect.right - domBoundingRect.width, visibleBoundingRect.left);
    }
    if (wordBoundingRect.top - domBoundingRect.height >= visibleBoundingRect.top) {
      positionTop = wordBoundingRect.top - domBoundingRect.height;
    } else {
      positionTop = wordBoundingRect.bottom;
    }
  } else {
    positionLeft = 0;
    positionTop = 0;
  }
  return {
    positionLeft,
    positionTop,
    // TODO.
    maxWidth: visibleBoundingRect.right - positionLeft,
    maxHeight: visibleBoundingRect.bottom - positionTop,
    isCalculated,
  };
}
interface SpellingBoxRenderMessage {
  misspelledWord: string;
  suggestions: string[];
  visibleBoundingRect: ViewRectangle;
  wordBoundingRect: ViewRectangle;
  replaceWith: (suggestion: string) => void;
  focusedSuggestionIndex: number | null;
}
interface SpellingBoxProps {
  renderMessage$: Source<SpellingBoxRenderMessage | null>;
  spellingBoxRef: RefObject<HTMLDivElement>;
}
function SpellingBox(props: SpellingBoxProps): JSX.Element | null {
  const { renderMessage$, spellingBoxRef } = props;
  const renderMessageMaybe = use$(renderMessage$, undefined, true);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.value : null;
  const positions = useFloatingBoxPosition(renderMessage, spellingBoxRef);
  if (renderMessage === null) {
    return null;
  }
  if (!doViewRectanglesIntersect(renderMessage.visibleBoundingRect, renderMessage.wordBoundingRect)) {
    return null;
  }
  const { suggestions, replaceWith, focusedSuggestionIndex } = renderMessage;
  assertIsNotNullish(positions);
  const { positionLeft, positionTop, maxWidth, maxHeight } = positions;
  return (
    <div
      ref={spellingBoxRef}
      className="spelling-box"
      style={{
        left: positionLeft,
        top: positionTop,
        maxWidth,
        maxHeight,
      }}
    >
      <div className="spelling-box__info">{suggestions.length === 0 ? 'Unrecognized word' : 'Did you mean:'}</div>
      {suggestions.map((suggestion, i) => (
        <button
          className={
            'spelling-box__suggestion' +
            (i === focusedSuggestionIndex
              ? ' spelling-box__suggestion--focused'
              : focusedSuggestionIndex === null
              ? ' spelling-box__suggestion--can-hover'
              : '')
          }
          key={suggestion}
          onClick={() => {
            replaceWith(suggestion);
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
interface LinkBoxRenderMessage {
  startTextValue: string;
  startLinkValue: string;
  shouldGetText: boolean;
  visibleBoundingRect: ViewRectangle;
  wordBoundingRect: ViewRectangle;
  applyLink: (link: string, text: string) => void;
}
interface LinkBoxProps {
  renderMessage$: Source<LinkBoxRenderMessage | null>;
}
function LinkBox(props: LinkBoxProps): JSX.Element | null {
  const { renderMessage$ } = props;
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [hasError, setHasError] = useState(false);
  const renderMessageMaybe = use$(renderMessage$, undefined, true, (maybe) => {
    const renderMessage = isSome(maybe) ? maybe.value : null;
    setHasError(false);
    if (renderMessage === null) {
      setText('');
      setUrl('');
      return;
    }
    const { startTextValue, startLinkValue } = renderMessage;
    setText(startTextValue);
    setUrl(startLinkValue);
  });
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.value : null;
  const positions = useFloatingBoxPosition(renderMessage, linkBoxRef);
  const textInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const renderMessageCountRef = useRef<number>(0);
  useEffect(() => {
    if (renderMessage === null) {
      renderMessageCountRef.current = 0;
      return;
    }
    renderMessageCountRef.current++;
    if (renderMessageCountRef.current !== 2) {
      return;
    }
    if (renderMessage.shouldGetText) {
      assertIsNotNullish(textInputRef.current);
      textInputRef.current.focus();
    } else {
      assertIsNotNullish(urlInputRef.current);
      urlInputRef.current.focus();
    }
  });
  if (renderMessage === null) {
    return null;
  }
  const { shouldGetText, applyLink } = renderMessage;
  assertIsNotNullish(positions);
  const { positionLeft, positionTop, maxWidth, maxHeight } = positions;
  const submitForm = (): void => {
    const sanitizedUrl = sanitizeUrl(url);
    if (sanitizedUrl === null || !isValidHttpUrl(sanitizedUrl)) {
      setHasError(true);
      return;
    }
    setHasError(false);
    applyLink(sanitizedUrl, text || url);
  };
  const isValid = url !== '';
  return (
    <div
      ref={linkBoxRef}
      className="link-box"
      style={{
        left: positionLeft,
        top: positionTop,
        maxWidth,
        maxHeight,
      }}
      onKeyDown={(event) => {
        if (isValid && event.code === 'Enter') {
          submitForm();
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {shouldGetText && (
        <label className="link-box__label">
          <span className="link-box__label-text">Text:</span>
          <input
            className="link-box__input"
            type="text"
            value={text}
            placeholder="Link text..."
            onChange={(event) => {
              setText(event.target.value);
            }}
            ref={textInputRef}
          />
        </label>
      )}
      <label className="link-box__label">
        <span className="link-box__label-text">Link:</span>
        <input
          className="link-box__input"
          type="url"
          value={url}
          placeholder="Link url..."
          onChange={(event) => {
            setUrl(event.target.value);
            setHasError(false);
          }}
          ref={urlInputRef}
        />
      </label>
      {hasError && <div className="link-box__error">Enter a valid URL</div>}
      <button
        className={['link-box__button', !isValid && 'link-box__button--disabled', hasError && 'link-box__button--has-error'].join(' ')}
        onClick={submitForm}
        disabled={!isValid}
      >
        Apply
      </button>
    </div>
  );
}
interface LinkDetailsRenderMessage {
  link: string;
  visibleBoundingRect: ViewRectangle;
  wordBoundingRect: ViewRectangle;
  tempClose: () => void;
  returnFocus: () => void;
  editLink: () => void;
  removeLink: () => void;
}
interface LinkDetailsProps {
  renderMessage$: Source<LinkDetailsRenderMessage | null>;
}
function LinkDetails(props: LinkDetailsProps): JSX.Element | null {
  const { renderMessage$ } = props;
  const renderMessageMaybe = use$(renderMessage$, undefined, true);
  const linkDetailsRef = useRef<HTMLDivElement>(null);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.value : null;
  const positions = useFloatingBoxPosition(renderMessage, linkDetailsRef);
  if (renderMessage === null) {
    return null;
  }
  const { link, tempClose, returnFocus, editLink, removeLink } = renderMessage;
  assertIsNotNullish(positions);
  const { positionLeft, positionTop, maxWidth, maxHeight } = positions;
  const onCopyLinkButtonClick = (): void => {
    void navigator.clipboard.writeText(link).then(() => {
      tempClose();
    });
  };
  return (
    <div
      ref={linkDetailsRef}
      className="link-details"
      style={{
        left: positionLeft,
        top: positionTop,
        maxWidth,
        maxHeight,
      }}
    >
      <a className="link-details__link" href={link} target="_blank" onClick={returnFocus}>
        {link}
      </a>
      <div className="link-details__buttons">
        <button className="link-details__button" onClick={onCopyLinkButtonClick}>
          Copy Link
        </button>
        <button className="link-details__button" onClick={editLink}>
          Edit Link
        </button>
        <button className="link-details__button" onClick={removeLink}>
          Remove Link
        </button>
      </div>
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
function doViewRectanglesIntersect(viewRectangle1: ViewRectangle, viewRectangle2: ViewRectangle): boolean {
  return (
    viewRectangle1.right >= viewRectangle2.left &&
    viewRectangle1.left <= viewRectangle2.right &&
    viewRectangle1.top <= viewRectangle2.bottom &&
    viewRectangle2.bottom >= viewRectangle1.top
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
const enum StandardCommand {
  MoveSelectionGraphemeBackwards,
  MoveSelectionWordBackwards,
  MoveSelectionParagraphBackwards,
  MoveSelectionParagraphStart,
  MoveSelectionGraphemeForwards,
  MoveSelectionWordForwards,
  MoveSelectionParagraphForwards,
  MoveSelectionParagraphEnd,
  MoveSelectionSoftLineStart,
  MoveSelectionSoftLineEnd,
  MoveSelectionSoftLineDown,
  MoveSelectionSoftLineUp,
  MoveSelectionStartOfDocument,
  MoveSelectionEndOfDocument,
  ExtendSelectionGraphemeBackwards,
  ExtendSelectionWordBackwards,
  ExtendSelectionParagraphBackwards,
  ExtendSelectionParagraphStart,
  ExtendSelectionGraphemeForwards,
  ExtendSelectionWordForwards,
  ExtendSelectionParagraphForwards,
  ExtendSelectionParagraphEnd,
  ExtendSelectionSoftLineStart,
  ExtendSelectionSoftLineEnd,
  ExtendSelectionSoftLineDown,
  ExtendSelectionSoftLineUp,
  ExtendSelectionStartOfDocument,
  ExtendSelectionEndOfDocument,
  RemoveSelectionGraphemeBackwards,
  RemoveSelectionWordBackwards,
  RemoveSelectionGraphemeForwards,
  RemoveSelectionWordForwards,
  RemoveSelectionSoftLineStart,
  RemoveSelectionSoftLineEnd,
  TransposeGraphemes,
  InsertParagraphBelow,
  InsertParagraphAbove,
  SelectAll,
  InsertPlainText,
  InsertPastedPlainText,
  InsertDroppedPlainText,
  InsertLineBreak,
  OpenFloatingLinkBoxAtSelection,
  SplitParagraph,
  Undo,
  Redo,
  CollapseMultipleSelectionRangesToAnchorRange,
  CollapseMultipleSelectionRangesToFocusRange,
  OpenSearch,
  CloseSearch,
  SearchCurrentFocusSelectionRange,
  SelectAllInstancesOfWord,
  SelectAllInstancesOfSearchQuery,
  SelectNextInstanceOfWordAtFocus,
  SelectPreviousInstanceOfWordAtFocus,
  SelectNextInstanceOfSearchQuery,
  SelectPreviousInstanceOfSearchQuery,
  SelectNextSearchMatch,
  SelectPreviousSearchMatch,
  MoveCurrentBlocksAbove,
  MoveCurrentBlocksBelow,
  CloneCurrentBlocksAbove,
  CloneCurrentBlocksBelow,
  ApplyBold,
  ApplyItalic,
  ApplyUnderline,
  ApplyCode,
  ApplyStrikethrough,
  ApplySubscript,
  ApplySuperscript,
  ResetTextScript,
  ResetTextColor,
  ResetHighlightColor,
  ResetInlineStyle,
  ResetParagraphType,
  AlignParagraphLeft,
  AlignParagraphRight,
  AlignParagraphCenter,
  AlignParagraphJustify,
  ToggleChecklistChecked,
  ToggleChecklistCheckedIndividually,
  IncreaseListIndent,
  DecreaseListIndent,
  ApplyBlockquote,
  ApplyIndent1,
  ApplyHangingIndent1,
  ApplyIndentFirstLine1,
  ApplyHeading1,
  ApplyHeading2,
  ApplyHeading3,
  ApplyHeading4,
  ApplyHeading5,
  ApplyHeading6,
  ApplyOrderedList,
  CycleOrderedListStyle,
  ApplyOrderedListStyle,
  ApplyUnorderedList,
  ApplyChecklist,
  ResetParagraphStyle,
  OpenQuickFixAtSelection,
  ApplyTextColor,
  ApplyHighlightColor,
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
type CommandName = string | number;
type KeyCommands = {
  key: string | null;
  command: CommandName | null;
  platform?: Selector<Platform> | null;
  context?: Selector<Context> | null;
}[];
const defaultTextEditingKeyCommands: KeyCommands = [
  { key: 'ArrowLeft,Control+KeyB', command: StandardCommand.MoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowLeft', command: StandardCommand.MoveSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowUp', command: StandardCommand.MoveSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+KeyA', command: StandardCommand.MoveSelectionParagraphStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'ArrowRight,Control+KeyF', command: StandardCommand.MoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowRight', command: StandardCommand.MoveSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+ArrowDown', command: StandardCommand.MoveSelectionParagraphForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+KeyE', command: StandardCommand.MoveSelectionParagraphEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+ArrowLeft', command: StandardCommand.MoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+ArrowRight', command: StandardCommand.MoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'ArrowDown,Control+KeyN', command: StandardCommand.MoveSelectionSoftLineDown, platform: Platform.Apple, context: Context.Editing },
  { key: 'ArrowUp,Control+KeyP', command: StandardCommand.MoveSelectionSoftLineUp, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+ArrowUp', command: StandardCommand.MoveSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+ArrowDown', command: StandardCommand.MoveSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+ArrowLeft,Control+Shift+KeyB', command: StandardCommand.ExtendSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+Shift+ArrowLeft', command: StandardCommand.ExtendSelectionWordBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+Shift+ArrowUp', command: StandardCommand.ExtendSelectionParagraphBackwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Shift+KeyA', command: StandardCommand.ExtendSelectionParagraphStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+ArrowRight,Control+Shift+KeyF', command: StandardCommand.ExtendSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+Shift+ArrowRight', command: StandardCommand.ExtendSelectionWordForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+Shift+ArrowDown', command: StandardCommand.ExtendSelectionParagraphForwards, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Shift+KeyE', command: StandardCommand.ExtendSelectionParagraphEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+ArrowLeft', command: StandardCommand.ExtendSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+ArrowRight', command: StandardCommand.ExtendSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+ArrowDown,Control+Shift+KeyN', command: StandardCommand.ExtendSelectionSoftLineDown, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+ArrowUp,Control+Shift+KeyP', command: StandardCommand.ExtendSelectionSoftLineUp, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+ArrowUp', command: StandardCommand.ExtendSelectionStartOfDocument, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+ArrowDown', command: StandardCommand.ExtendSelectionEndOfDocument, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift?+Backspace', command: StandardCommand.RemoveSelectionGraphemeBackwards, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Alt+Shift?+Backspace,Control+Shift?+Backspace,Control+Alt+Shift?+Backspace',
    command: StandardCommand.RemoveSelectionWordBackwards,
    platform: Platform.Apple,
    context: Context.Editing,
  },
  { key: 'Shift?+Delete', command: StandardCommand.RemoveSelectionGraphemeForwards, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Alt+Shift?+Delete,Control+Shift?+Delete,Control+Alt+Shift?+Delete',
    command: StandardCommand.RemoveSelectionWordForwards,
    platform: Platform.Apple,
    context: Context.Editing,
  },
  { key: 'Meta+Shift?+Backspace', command: StandardCommand.RemoveSelectionSoftLineStart, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift?+Delete', command: StandardCommand.RemoveSelectionSoftLineEnd, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+KeyT', command: StandardCommand.TransposeGraphemes, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Enter', command: StandardCommand.InsertParagraphAbove, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+Enter', command: StandardCommand.InsertParagraphBelow, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyA', command: StandardCommand.SelectAll, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+Enter,Control+KeyO', command: StandardCommand.InsertLineBreak, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyK', command: StandardCommand.OpenFloatingLinkBoxAtSelection, platform: Platform.Apple, context: Context.Editing },
  { key: 'Enter', command: StandardCommand.SplitParagraph, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyZ,Meta+Shift+KeyY', command: StandardCommand.Undo, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+KeyZ,Meta+KeyY', command: StandardCommand.Redo, platform: Platform.Apple, context: Context.Editing },
  {
    key: 'Escape',
    command: StandardCommand.CollapseMultipleSelectionRangesToAnchorRange,
    platform: Platform.Apple,
    context: { all: [Context.Editing, { not: Context.DraggingSelection }] },
  },
  {
    key: 'Shift+Escape',
    command: StandardCommand.CollapseMultipleSelectionRangesToFocusRange,
    platform: Platform.Apple,
    context: { all: [Context.Editing, { not: Context.DraggingSelection }] },
  },
  { key: 'Meta+KeyF', command: StandardCommand.OpenSearch, platform: Platform.Apple },
  { key: 'Meta+KeyG', command: StandardCommand.SearchCurrentFocusSelectionRange, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+KeyG', command: StandardCommand.SearchCurrentFocusSelectionRange, platform: Platform.Apple, context: Context.Editing },
  { key: 'Enter,Meta+KeyG', command: StandardCommand.SelectNextSearchMatch, platform: Platform.Apple, context: Context.Searching },
  { key: 'Shift+Enter,Meta+Shift+KeyG', command: StandardCommand.SelectPreviousSearchMatch, platform: Platform.Apple, context: Context.Searching },
  { key: 'Escape', command: StandardCommand.CloseSearch, platform: Platform.Apple, context: Context.InSearchBox },
  { key: 'Meta+Shift+KeyL', command: StandardCommand.SelectAllInstancesOfWord, platform: Platform.Apple, context: Context.Editing },
  { key: 'Alt+Enter,Meta+Shift+KeyL', command: StandardCommand.SelectAllInstancesOfSearchQuery, platform: Platform.Apple, context: Context.Searching },
  { key: 'Meta+Shift+KeyD', command: StandardCommand.SelectPreviousInstanceOfWordAtFocus, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyD', command: StandardCommand.SelectNextInstanceOfWordAtFocus, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+KeyD', command: StandardCommand.SelectPreviousInstanceOfSearchQuery, platform: Platform.Apple, context: Context.Searching },
  { key: 'Meta+KeyD', command: StandardCommand.SelectNextInstanceOfSearchQuery, platform: Platform.Apple, context: Context.Searching },
  { key: 'Control+Alt+ArrowUp', command: StandardCommand.MoveCurrentBlocksAbove, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Alt+ArrowDown', command: StandardCommand.MoveCurrentBlocksBelow, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Alt+Shift+ArrowUp', command: StandardCommand.CloneCurrentBlocksBelow, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Alt+Shift+ArrowDown', command: StandardCommand.CloneCurrentBlocksAbove, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyB', command: StandardCommand.ApplyBold, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyI', command: StandardCommand.ApplyItalic, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+KeyU', command: StandardCommand.ApplyUnderline, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+KeyJ', command: StandardCommand.ApplyCode, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+KeyX', command: StandardCommand.ApplyStrikethrough, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+Comma', command: StandardCommand.ApplySubscript, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Shift+Period', command: StandardCommand.ApplySuperscript, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Backslash', command: StandardCommand.ResetInlineStyle, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+KeyL', command: StandardCommand.AlignParagraphLeft, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+KeyE', command: StandardCommand.AlignParagraphCenter, platform: Platform.Apple, context: Context.Editing },
  // TODO: Doesn't work for safari, reloads page.
  { key: 'Meta+Alt+KeyR', command: StandardCommand.AlignParagraphRight, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+KeyJ', command: StandardCommand.AlignParagraphJustify, platform: Platform.Apple, context: Context.Editing },
  { key: 'Tab', command: StandardCommand.IncreaseListIndent, platform: Platform.Apple, context: Context.Editing },
  { key: 'Shift+Tab', command: StandardCommand.DecreaseListIndent, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+BracketRight', command: StandardCommand.IncreaseListIndent, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+BracketLeft', command: StandardCommand.DecreaseListIndent, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit1', command: StandardCommand.ApplyHeading1, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit2', command: StandardCommand.ApplyHeading2, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit3', command: StandardCommand.ApplyHeading3, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit4', command: StandardCommand.ApplyHeading4, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit7', command: StandardCommand.ApplyUnorderedList, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit8', command: StandardCommand.ApplyOrderedList, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Shift+Digit8', command: StandardCommand.CycleOrderedListStyle, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit9', command: StandardCommand.ApplyChecklist, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Digit0', command: StandardCommand.ApplyBlockquote, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Shift+Digit0', command: StandardCommand.ApplyIndent1, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Semicolon', command: StandardCommand.ApplyIndentFirstLine1, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Shift+Semicolon', command: StandardCommand.ApplyHangingIndent1, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Alt+Backslash', command: StandardCommand.ResetParagraphStyle, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Enter', command: StandardCommand.ToggleChecklistChecked, platform: Platform.Apple, context: Context.Editing },
  { key: 'Control+Alt+Enter', command: StandardCommand.ToggleChecklistCheckedIndividually, platform: Platform.Apple, context: Context.Editing },
  { key: 'Meta+Period', command: StandardCommand.OpenQuickFixAtSelection, platform: Platform.Apple, context: Context.Editing },
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
const selectionLeftRightDataKey = 'standard.selectionLeftRight';
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        if (stateControl.stateView.selection.selectionRanges.length === 0) {
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
        if (stateControl.stateView.selection.selectionRanges.length === 0) {
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
  commandName: CommandName;
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
        (_document, _stateControlConfig, range, anchorPoint, selectionRange) => {
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
              range,
              focusPoint,
              selectionRange,
              cursorOffsetLeft,
              false,
            );
          } else {
            result = documentRenderControl.transformPointSoftLineUpDownWithOffsetLeft(
              pointMovement,
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
        (_document, _stateControlConfig, range, focusPoint, selectionRange) => {
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
  fixTextConfig?: (textConfig: TextConfig) => TextConfig,
): matita.RunUpdateFn {
  return () => {
    const lineTexts = text.split(/\r?\n/g).map((line) => line.replaceAll('\r', ''));
    const getContentFragmentFromSelectionRange = (
      customCollapsedSelectionTextConfig: TextConfig | null,
      selectionRange: matita.SelectionRange,
    ): matita.ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
      return matita.makeContentFragment(
        lineTexts.map((lineText) => {
          let textConfig = getInsertTextConfigAtSelectionRange(stateControl.stateView.document, customCollapsedSelectionTextConfig, selectionRange);
          if (fixTextConfig) {
            textConfig = fixTextConfig(textConfig);
          }
          return matita.makeContentFragmentParagraph(
            matita.makeParagraph({}, lineText === '' ? [] : [matita.makeText(textConfig, lineText)], matita.generateId()),
          );
        }),
      );
    };
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
  };
}
function makePressedSpaceBarToInsertSpaceAtSelectionUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  topLevelContentReference: matita.ContentReference,
): matita.RunUpdateFn {
  return () => {
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
      if (!matita.isSelectionRangeCollapsedInText(selectionRange)) {
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
        inlineNodeText === '>>' ||
        inlineNodeText === '>-' ||
        inlineNodeText === '>;' ||
        inlineNodeText === '#' ||
        inlineNodeText === '##' ||
        inlineNodeText === '###' ||
        inlineNodeText === '####' ||
        inlineNodeText === '#####' ||
        inlineNodeText === '######'
      ) {
        trackedSelectionRangeIds.add(selectionRange.id);
      }
    }
    stateControl.delta.applyUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, ' '), { [matita.RedoUndoUpdateKey.InsertText]: true });
    const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const applyUnorderedListSelectionRanges: matita.SelectionRange[] = [];
    const handledParagraphIds = new Set<string>();
    for (let i = 0; i < stateControl.stateView.selection.selectionRanges.length; i++) {
      const selectionRange = stateControl.stateView.selection.selectionRanges[i];
      if (!trackedSelectionRangeIds.has(selectionRange.id) || !matita.isSelectionRangeCollapsedInText(selectionRange)) {
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
      if (
        inlineNodeText === '> ' ||
        inlineNodeText === '>> ' ||
        inlineNodeText === '>- ' ||
        inlineNodeText === '>; ' ||
        inlineNodeText === '# ' ||
        inlineNodeText === '## ' ||
        inlineNodeText === '### ' ||
        inlineNodeText === '#### ' ||
        inlineNodeText === '##### ' ||
        inlineNodeText === '###### '
      ) {
        const newParagraphType =
          inlineNodeText === '> '
            ? ParagraphType.Quote
            : inlineNodeText === '>> '
            ? ParagraphType.Indent1
            : inlineNodeText === '>- '
            ? ParagraphType.IndentFirstLine1
            : inlineNodeText === '>; '
            ? ParagraphType.IndentHanging1
            : inlineNodeText === '# '
            ? ParagraphType.Heading1
            : inlineNodeText === '## '
            ? ParagraphType.Heading2
            : inlineNodeText === '### '
            ? ParagraphType.Heading3
            : inlineNodeText === '#### '
            ? ParagraphType.Heading4
            : inlineNodeText === '##### '
            ? ParagraphType.Heading5
            : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            inlineNodeText === '###### '
            ? ParagraphType.Heading6
            : assertUnreachable(inlineNodeText);
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
            makeApplyListTypeAtSelectionUpdateFn(stateControl, topLevelContentReference, AccessedListStyleType.UnorderedList, applyUnorderedListSelection),
          );
        }
        const batchMutation = matita.makeBatchMutation(mutations);
        stateControl.delta.applyMutation(batchMutation);
      },
      { [matita.RedoUndoUpdateKey.UniqueGroupedUpdate]: matita.makeUniqueGroupedChangeType() },
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
      const mergeParagraphConfig: ParagraphConfig = {
        type: ParagraphType.ListItem,
        ListItem_listId: listId,
        ListItem_indentLevel: convertNumberListIndentLevelToStoredListIndentLevel(listIndent),
      };
      if (listType === AccessedListStyleType.Checklist) {
        mergeParagraphConfig.ListItem_Checklist_checked = undefined;
      }
      paragraphConfigMutations.push(
        matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(firstParagraphReference, lastParagraphReference, mergeParagraphConfig),
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
        const listId = v4();
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
function makeIndentOrDedentListUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  topLevelContentReference: matita.ContentReference,
  indentOrDedent: 'indent' | 'dedent',
): matita.RunUpdateFn {
  return () => {
    const topLevelContentConfigMutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const paragraphConfigMutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const handledListIdAndNumberedIndentCombinations = new Set<string>();
    const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, topLevelContentReference);
    for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, stateControl.stateView.selection)) {
      const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      if (paragraph.config.type === ParagraphType.ListItem) {
        const newStoredIndentLevel =
          indentOrDedent === 'indent'
            ? incrementStoredListIndent(paragraph.config.ListItem_indentLevel)
            : decrementStoredListIndent(paragraph.config.ListItem_indentLevel);
        if (paragraph.config.ListItem_indentLevel !== newStoredIndentLevel) {
          if (typeof paragraph.config.ListItem_listId === 'string') {
            const newNumberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(newStoredIndentLevel);
            const serializedListIdAndNumberedIndentCombination = serializeListIdAndNumberedIndentCombination(
              paragraph.config.ListItem_listId,
              newNumberedIndentLevel,
            );
            if (!handledListIdAndNumberedIndentCombinations.has(serializedListIdAndNumberedIndentCombination)) {
              handledListIdAndNumberedIndentCombinations.add(serializedListIdAndNumberedIndentCombination);
              const listTypeAtCurrentIndent = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
              const storedListStyleAtNewIndent = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                topLevelContent.config,
                paragraph.config.ListItem_listId,
                newNumberedIndentLevel,
              );
              if (!matita.isJsonMap(storedListStyleAtNewIndent) || !isStoredListTypeSet(storedListStyleAtNewIndent.type)) {
                const newNumberedIndentLevelAsString = String(newNumberedIndentLevel);
                topLevelContentConfigMutations.push(
                  matita.makeUpdateContentConfigMutation(
                    topLevelContentReference,
                    matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(
                      ['listStyles', 'listIdToStyle', paragraph.config.ListItem_listId, 'indentLevelToStyle', newNumberedIndentLevelAsString, 'type'],
                      convertAccessedListStyleTypeToStoredListType(listTypeAtCurrentIndent),
                    ),
                  ),
                );
                if (listTypeAtCurrentIndent === AccessedListStyleType.OrderedList) {
                  let newOrderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
                  switch (newOrderedListStyle) {
                    case OrderedListStyle.Decimal: {
                      let hasUpper = false;
                      let isLastBeforeLower = true;
                      for (let indentLevel = 0; indentLevel <= maxListIndentLevel && !(indentLevel >= newNumberedIndentLevel && hasUpper); indentLevel++) {
                        const listStyleAtIndent = accessListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                          topLevelContent.config,
                          paragraph.config.ListItem_listId,
                          indentLevel as NumberedListIndent,
                        );
                        if (
                          matita.isJsonMap(listStyleAtIndent) &&
                          convertStoredListStyleTypeToAccessedListType(listStyleAtIndent.type) === AccessedListStyleType.OrderedList
                        ) {
                          const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                            topLevelContent.config,
                            paragraph.config.ListItem_listId,
                            indentLevel as NumberedListIndent,
                          );
                          if ([OrderedListStyle.UpperAlpha, OrderedListStyle.UpperGreek, OrderedListStyle.UpperRoman].includes(orderedListStyle)) {
                            hasUpper = true;
                            isLastBeforeLower = false;
                          } else if (
                            [OrderedListStyle.LowerAlpha, OrderedListStyle.LowerGreek, OrderedListStyle.LowerRoman].includes(orderedListStyle) &&
                            indentLevel < newNumberedIndentLevel
                          ) {
                            isLastBeforeLower = true;
                          }
                        }
                      }
                      if (hasUpper && !isLastBeforeLower) {
                        newOrderedListStyle = OrderedListStyle.UpperAlpha;
                      } else {
                        newOrderedListStyle = OrderedListStyle.LowerAlpha;
                      }
                      break;
                    }
                    case OrderedListStyle.LowerAlpha: {
                      newOrderedListStyle = OrderedListStyle.LowerRoman;
                      break;
                    }
                    case OrderedListStyle.UpperAlpha: {
                      newOrderedListStyle = OrderedListStyle.UpperRoman;
                      break;
                    }
                    case OrderedListStyle.LowerRoman:
                    case OrderedListStyle.UpperRoman:
                    case OrderedListStyle.LowerGreek:
                    case OrderedListStyle.UpperGreek: {
                      newOrderedListStyle = OrderedListStyle.Decimal;
                      break;
                    }
                    default: {
                      assertUnreachable(newOrderedListStyle);
                    }
                  }
                  topLevelContentConfigMutations.push(
                    matita.makeUpdateContentConfigMutation(
                      topLevelContentReference,
                      matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(
                        [
                          'listStyles',
                          'listIdToStyle',
                          paragraph.config.ListItem_listId,
                          'indentLevelToStyle',
                          newNumberedIndentLevelAsString,
                          'OrderedList_style',
                        ],
                        newOrderedListStyle,
                      ),
                    ),
                  );
                }
              }
            }
          }
          paragraphConfigMutations.push(
            matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, {
              ListItem_indentLevel: newStoredIndentLevel,
            }),
          );
        }
      }
    }
    if (paragraphConfigMutations.length === 0) {
      return;
    }
    const nestedBatchMutations: matita.BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    if (topLevelContentConfigMutations.length > 0) {
      nestedBatchMutations.push(matita.makeBatchMutation(topLevelContentConfigMutations));
    }
    nestedBatchMutations.push(matita.makeBatchMutation(paragraphConfigMutations));
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
      if (!matita.isSelectionRangeCollapsedInText(selectionRange)) {
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
      if (
        paragraph.config.type === ParagraphType.Quote ||
        paragraph.config.type === ParagraphType.Indent1 ||
        paragraph.config.type === ParagraphType.IndentFirstLine1
      ) {
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
function isParagraphChecklistByTopLevelContentConfigAndParagraphConfig(
  topLevelContentConfig: TopLevelContentConfig,
  paragraphConfig: ParagraphConfig,
): boolean {
  if (paragraphConfig.type !== ParagraphType.ListItem) {
    return false;
  }
  const listStyleType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContentConfig, paragraphConfig);
  return listStyleType === AccessedListStyleType.Checklist;
}
function makeToggleChecklistCheckedAtSelectionUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  topLevelContentReference: matita.ContentReference,
  strategy: 'synced' | 'individually',
  selection?: matita.Selection,
): matita.RunUpdateFn {
  return () => {
    const selectionAt = selection ?? stateControl.stateView.selection;
    const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, topLevelContentReference);
    let isAllChecked = true;
    if (strategy === 'synced') {
      for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, selectionAt)) {
        const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        if (
          isParagraphChecklistByTopLevelContentConfigAndParagraphConfig(topLevelContent.config, paragraph.config) &&
          paragraph.config.ListItem_Checklist_checked !== true
        ) {
          isAllChecked = false;
          break;
        }
      }
    }
    for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, selectionAt)) {
      const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      if (!isParagraphChecklistByTopLevelContentConfigAndParagraphConfig(topLevelContent.config, paragraph.config)) {
        continue;
      }
      const newIsChecked = (strategy === 'individually' ? paragraph.config.ListItem_Checklist_checked === true : isAllChecked) ? undefined : true;
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
  };
}
function makeMapOrderedListStyleAtSelectionUpdateFn(
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  topLevelContentReference: matita.ContentReference,
  mapOrderedListStyle: (style: OrderedListStyle) => OrderedListStyle,
  selection?: matita.Selection,
): matita.RunUpdateFn {
  return () => {
    const selectionAt = selection ?? stateControl.stateView.selection;
    const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, topLevelContentReference);
    const cycledListIds = new Set<string>();
    const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    for (const paragraphReference of matita.iterParagraphsInSelectionOutOfOrder(stateControl.stateView.document, selectionAt)) {
      const paragraph = matita.accessBlockFromBlockReference(stateControl.stateView.document, paragraphReference);
      if (paragraph.config.type !== ParagraphType.ListItem) {
        continue;
      }
      const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
      if (listType !== AccessedListStyleType.OrderedList) {
        continue;
      }
      const listId = paragraph.config.ListItem_listId;
      if (typeof listId !== 'string') {
        throwUnreachable();
      }
      if (cycledListIds.has(listId)) {
        continue;
      }
      cycledListIds.add(listId);
      const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
      const newOrderedListStyle = mapOrderedListStyle(orderedListStyle);
      const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel);
      mutations.push(
        matita.makeUpdateContentConfigMutation(
          topLevelContentReference,
          matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(
            ['listStyles', 'listIdToStyle', listId, 'indentLevelToStyle', String(numberedIndentLevel), 'OrderedList_style'],
            newOrderedListStyle,
          ),
        ),
      );
    }
    if (mutations.length === 0) {
      return;
    }
    stateControl.delta.applyMutation(matita.makeBatchMutation(mutations));
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
        { [selectionLeftRightDataKey]: true },
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
  [StandardCommand.ApplyTextColor]: {
    execute(stateControl, _viewControl, data) {
      const newTextColor = data as Color;
      assert(colors.includes(newTextColor));
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.color === newTextColor,
          (isAllActive) => ({ color: isAllActive ? undefined : newTextColor }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHighlightColor]: {
    execute(stateControl, _viewControl, data) {
      const newHighlightColor = data as Color;
      assert(colors.includes(newHighlightColor));
      stateControl.queueUpdate(
        matita.makeToggleUpdateTextConfigAtCurrentSelectionAndCustomCollapsedSelectionTextConfigUpdateFn(
          stateControl,
          (textConfig) => textConfig.highlightColor === newHighlightColor,
          (isAllActive) => ({ highlightColor: isAllActive ? undefined : newHighlightColor }),
          getInsertTextConfigAtSelectionRange,
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetTextScript]: {
    execute(stateControl): void {
      const resetTextScriptMergeConfig: TextConfig = {
        script: undefined,
      };
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetTextScriptMergeConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetTextScriptMergeConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetTextColor]: {
    execute(stateControl): void {
      const resetTextColorMergeConfig: TextConfig = {
        color: undefined,
      };
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetTextColorMergeConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetTextColorMergeConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetHighlightColor]: {
    execute(stateControl): void {
      const resetHighlightColorMergeConfig: TextConfig = {
        highlightColor: undefined,
      };
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetHighlightColorMergeConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetHighlightColorMergeConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetMergeTextConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetMergeTextConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetInlineStyle]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          if (matita.isSelectionCollapsedInText(stateControl.stateView.selection)) {
            stateControl.delta.setCustomCollapsedSelectionTextConfig(resetMergeTextConfig);
            return;
          }
          stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(stateControl, null, () => resetMergeTextConfig));
        },
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ResetParagraphType]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(stateControl, null, () => resetMergeParagraphTypeConfig),
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
      stateControl.queueUpdate(makeToggleChecklistCheckedAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, 'synced'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.ToggleChecklistCheckedIndividually]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeToggleChecklistCheckedAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, 'individually'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.IncreaseListIndent]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeIndentOrDedentListUpdateFn(documentRenderControl.stateControl, documentRenderControl.topLevelContentReference, 'indent'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.DecreaseListIndent]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeIndentOrDedentListUpdateFn(documentRenderControl.stateControl, documentRenderControl.topLevelContentReference, 'dedent'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.ApplyBlockquote]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Quote,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Quote }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyIndent1]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Indent1,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Indent1 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyIndentFirstLine1]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.IndentFirstLine1,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.IndentFirstLine1 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHangingIndent1]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.IndentHanging1,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.IndentHanging1 }),
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
  [StandardCommand.ApplyHeading4]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading4,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading4 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHeading5]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading5,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading5 }),
        ),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyHeading6]: {
    execute(stateControl) {
      stateControl.queueUpdate(
        matita.makeToggleUpdateParagraphConfigAtSelectionUpdateFn(
          stateControl,
          (paragraphConfig) => paragraphConfig.type === ParagraphType.Heading6,
          (isAllActive) => ({ type: isAllActive ? undefined : ParagraphType.Heading6 }),
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
  [StandardCommand.CycleOrderedListStyle]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeMapOrderedListStyleAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, (orderedListStyle) => {
          const orderedListStyleIndex = orderedListStyles.indexOf(orderedListStyle);
          const newOrderedListStyle = orderedListStyles[(orderedListStyleIndex + 1) % orderedListStyles.length];
          return newOrderedListStyle;
        }),

        { [doNotScrollToSelectionAfterChangeDataKey]: true },
      );
    },
  },
  [StandardCommand.ApplyOrderedListStyle]: {
    execute(stateControl, viewControl, data): void {
      const newOrderedListStyle = data as OrderedListStyle;
      assert(orderedListStyles.includes(newOrderedListStyle));
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeMapOrderedListStyleAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference, () => newOrderedListStyle),
        { [doNotScrollToSelectionAfterChangeDataKey]: true },
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
    execute(stateControl, viewControl, data: InsertPlainTextCommandData): void {
      const { insertText } = data;
      // TODO: Hybrid approach here? E.g. Japanese composition, hitting space bar doesn't insert space.
      if (insertText === ' ') {
        const documentRenderControl = viewControl.accessDocumentRenderControl();
        stateControl.queueUpdate(makePressedSpaceBarToInsertSpaceAtSelectionUpdateFn(stateControl, documentRenderControl.topLevelContentReference));
        return;
      }
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, insertText), { [matita.RedoUndoUpdateKey.InsertText]: true });
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
  [StandardCommand.OpenFloatingLinkBoxAtSelection]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.openFloatingLinkBoxAtSelection(), { [keepFloatingLinkBoxOpenUpdateKey]: true });
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
  [StandardCommand.OpenQuickFixAtSelection]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.openQuickFixAtSelection());
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
  private $p_stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  private $p_undoStateDifferencesStack: LocalUndoStateDifference<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
  private $p_redoStateDifferencesStack: LocalUndoStateDifference<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
  private $p_mutationResults: MutationResultWithMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
  private $p_lastChangeType: string | null;
  private $p_selectionBefore: matita.Selection | null;
  private $p_selectionAfter: matita.Selection | null;
  private $p_forceChange: ((changeType: string) => boolean) | null;
  constructor(stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>) {
    super();
    this.$p_stateControl = stateControl;
    this.$p_undoStateDifferencesStack = [];
    this.$p_redoStateDifferencesStack = [];
    this.$p_mutationResults = [];
    this.$p_lastChangeType = null;
    this.$p_selectionBefore = null;
    this.$p_selectionAfter = null;
    this.$p_forceChange = null;
    pipe(this.$p_stateControl.selectionChange$, subscribe(this.$p_onSelectionChange.bind(this), this));
    pipe(this.$p_stateControl.customCollapsedSelectionTextConfigChange$, subscribe(this.$p_onCustomCollapsedSelectionTextConfigChange.bind(this), this));
    pipe(this.$p_stateControl.afterMutationPart$, subscribe(this.$p_onAfterMutationPart.bind(this), this));
  }
  private $p_onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    if (this.$p_mutationResults.length === 0) {
      return;
    }
    const { updateDataStack } = event.value;
    const updateDataMaybe = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if (isSome(updateDataMaybe)) {
      return;
    }
    this.$p_lastChangeType = LocalUndoControlLastChangeType.SelectionOrCustomCollapsedSelectionTextConfigAfterChange;
  }
  private $p_onCustomCollapsedSelectionTextConfigChange(event: Event<matita.CustomCollapsedSelectionTextConfigChangeMessage<TextConfig>>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    if (this.$p_mutationResults.length === 0) {
      return;
    }
    const { updateDataStack } = event.value;
    const updateDataMaybe = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if (isSome(updateDataMaybe)) {
      return;
    }
    this.$p_lastChangeType = LocalUndoControlLastChangeType.SelectionOrCustomCollapsedSelectionTextConfigAfterChange;
  }
  private $p_onAfterMutationPart(
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
    this.$p_redoStateDifferencesStack = [];
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
      this.$p_mutationResults.length > 0 &&
      ((this.$p_forceChange && this.$p_forceChange(changeType)) ||
        this.$p_lastChangeType === LocalUndoControlLastChangeType.Other ||
        (this.$p_lastChangeType && changeType !== this.$p_lastChangeType));
    if (isFirstMutationPart) {
      if (pushToStack) {
        this.$p_pushToStack();
      }
      this.$p_forceChange = null;
      const selectionBefore = this.$p_stateControl.stateView.selection;
      pipe(
        afterMutation$,
        subscribe((event) => {
          assert(event.type === EndType);
          if (this.$p_selectionBefore === null) {
            this.$p_selectionBefore = selectionBefore;
          }
        }, this),
      );
    }
    if (isLastMutationPart) {
      this.$p_lastChangeType = changeType;
    }
    if (result.didChange) {
      this.$p_mutationResults.push({
        mutationPart,
        result,
      });
    }
    if (isLastMutationPart) {
      pipe(
        afterMutation$,
        subscribe((event) => {
          assert(event.type === EndType);
          this.$p_selectionAfter = this.$p_stateControl.stateView.selection;
        }, this),
      );
    }
  }
  private $p_pushToStack(): void {
    if (this.$p_mutationResults.length === 0) {
      return;
    }
    this.$p_forceChange = null;
    const mutationResults = this.$p_mutationResults;
    const selectionBefore = this.$p_selectionBefore;
    assertIsNotNullish(selectionBefore);
    const selectionAfter = this.$p_selectionAfter;
    assertIsNotNullish(selectionAfter);
    this.$p_mutationResults = [];
    this.$p_lastChangeType = null;
    this.$p_selectionBefore = null;
    this.$p_selectionAfter = null;
    this.$p_undoStateDifferencesStack.push({
      mutationResults,
      selectionBefore,
      selectionAfter,
    });
  }
  forceNextChange(shouldForceChange: (changeType: string) => boolean): void {
    this.$p_forceChange = shouldForceChange;
  }
  tryUndo(): void {
    assert(!this.$p_stateControl.isInUpdate, 'Cannot undo while in a state update.');
    this.$p_stateControl.queueUpdate(
      () => {
        if (this.$p_mutationResults.length > 0) {
          this.$p_pushToStack();
        } else if (this.$p_undoStateDifferencesStack.length === 0) {
          return;
        }
        const lastStateDifference = this.$p_undoStateDifferencesStack.pop();
        assertIsNotNullish(lastStateDifference);
        this.$p_redoStateDifferencesStack.push(lastStateDifference);
        const { mutationResults, selectionBefore } = lastStateDifference;
        const reverseMutations: matita.BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
        for (let i = mutationResults.length - 1; i >= 0; i--) {
          const mutationResult = mutationResults[i];
          const { reverseMutation } = mutationResult.result;
          reverseMutations.push(reverseMutation);
        }
        this.$p_stateControl.delta.applyMutation(matita.makeBatchMutation(reverseMutations));
        if (selectionBefore.selectionRanges.length > 0) {
          this.$p_stateControl.delta.setSelection(selectionBefore);
        }
      },
      { [matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
    );
  }
  tryRedo(): void {
    assert(!this.$p_stateControl.isInUpdate, 'Cannot redo while in a state update.');
    this.$p_stateControl.queueUpdate(
      () => {
        if (this.$p_mutationResults.length > 0) {
          assert(this.$p_redoStateDifferencesStack.length === 0);
          return;
        }
        if (this.$p_redoStateDifferencesStack.length === 0) {
          return;
        }
        const lastStateDifference = this.$p_redoStateDifferencesStack.pop();
        assertIsNotNullish(lastStateDifference);
        this.$p_undoStateDifferencesStack.push(lastStateDifference);
        const { mutationResults, selectionAfter } = lastStateDifference;
        this.$p_stateControl.delta.applyMutation(matita.makeBatchMutation(mutationResults.map((mutationResult) => mutationResult.mutationPart)));
        if (selectionAfter.selectionRanges.length > 0) {
          this.$p_stateControl.delta.setSelection(selectionAfter);
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
    commandRegister.set(String(StandardCommand.Undo), {
      execute: this.tryUndo.bind(this),
    });
    commandRegister.set(String(StandardCommand.Redo), {
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
  private $p_records$: Distributor<MutationRecord[]>;
  private $p_observerTargets: {
    target: Node;
    options?: MutationObserverInit;
  }[];
  private $p_mutationObserver: MutationObserver;
  constructor() {
    super(() => this.$p_dispose());
    this.$p_observerTargets = [];
    this.$p_records$ = Distributor();
    this.add(this.$p_records$);
    this.records$ = this.$p_records$;
    this.$p_mutationObserver = new MutationObserver((records) => {
      this.$p_records$(Push(records));
    });
  }
  observe(target: Node, options?: MutationObserverInit): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_observerTargets.push({ target, options });
    this.$p_mutationObserver.observe(target, options);
    return Disposable(() => {
      this.unobserve(target);
    });
  }
  unobserve(target: Node): void {
    if (!this.active) {
      return;
    }
    const newObserverTargets = this.$p_observerTargets.filter((ot) => ot.target !== target);
    this.$p_observerTargets = [];
    const records = this.$p_mutationObserver.takeRecords();
    this.$p_records$(Push(records.filter((record) => record.target !== target)));
    this.$p_mutationObserver.disconnect();
    newObserverTargets.forEach((otherTarget) => {
      this.observe(otherTarget.target, otherTarget.options);
    });
  }
  private $p_dispose(): void {
    this.$p_mutationObserver.disconnect();
    this.$p_observerTargets = [];
  }
}
class ReactiveIntersectionObserver extends DisposableClass {
  entries$: Source<IntersectionObserverEntry[]>;
  private $p_entries$: Distributor<IntersectionObserverEntry[]>;
  private $p_intersectionObserver: IntersectionObserver;
  constructor(options?: IntersectionObserverInit) {
    super(() => this.$p_dispose());
    this.$p_entries$ = Distributor();
    this.add(this.$p_entries$);
    this.entries$ = this.$p_entries$;
    this.$p_intersectionObserver = new IntersectionObserver((entries) => {
      this.$p_entries$(Push(entries));
    }, options);
  }
  observe(target: Element): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_intersectionObserver.observe(target);
    return Disposable(() => {
      this.unobserve(target);
    });
  }
  unobserve(target: Element): void {
    if (!this.active) {
      return;
    }
    this.$p_intersectionObserver.unobserve(target);
  }
  private $p_dispose(): void {
    this.$p_intersectionObserver.disconnect();
  }
}
class ReactiveResizeObserver extends DisposableClass {
  entries$: Source<ResizeObserverEntry[]>;
  private $p_entries$: Distributor<ResizeObserverEntry[]>;
  private $p_resizeObserver: ResizeObserver;
  constructor() {
    super(() => this.$p_dispose());
    this.$p_entries$ = Distributor();
    this.add(this.$p_entries$);
    this.entries$ = this.$p_entries$;
    this.$p_resizeObserver = new ResizeObserver((entries) => {
      this.$p_entries$(Push(entries));
    });
  }
  observe(target: Element, options?: ResizeObserverOptions): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_resizeObserver.observe(target, options);
    return Disposable(() => {
      this.unobserve(target);
    });
  }
  unobserve(target: Element): void {
    if (!this.active) {
      return;
    }
    this.$p_resizeObserver.unobserve(target);
  }
  private $p_dispose(): void {
    this.$p_resizeObserver.disconnect();
  }
}
interface NumberedListItemInfo {
  paragraphId: string;
  indentLevel: NumberedListIndent;
}
class ListIndexer {
  private $p_listItemInfos: IndexableUniqueStringList;
  private $p_paragraphIdToNumber = Object.create(null) as Record<string, number>;
  private $p_paragraphIdToIndentLevel = Object.create(null) as Record<string, NumberedListIndent>;
  private $p_isDirty = false;
  constructor() {
    this.$p_listItemInfos = new IndexableUniqueStringList([]);
  }
  iterateParagraphIds(): IterableIterator<string> {
    return this.$p_listItemInfos.iterBetween(0, this.$p_listItemInfos.getLength() - 1);
  }
  markDirty(): void {
    this.$p_isDirty = true;
  }
  getIsDirty(): boolean {
    return this.$p_isDirty;
  }
  recomputeListNumbers(viewControl: VirtualizedViewControl, numberedIndentLevels: Map<number, number>): void {
    assert(this.$p_isDirty);
    const documentRenderControl = viewControl.accessDocumentRenderControl();
    const numberOfListItemInfos = this.$p_listItemInfos.getLength();
    const indices: number[] = Array<number>(maxListIndentLevel + 1);
    indices.fill(0);
    let previousIndentLevel = -1;
    for (let i = 0; i < numberOfListItemInfos; i++) {
      const paragraphId = this.$p_listItemInfos.access(i);
      const indentLevel = this.$p_paragraphIdToIndentLevel[paragraphId];
      const currentListItemIndex = this.$p_paragraphIdToNumber[paragraphId];
      if (previousIndentLevel > indentLevel) {
        for (let j = indentLevel + 1; j <= maxListIndentLevel; j++) {
          indices[j] = 0;
        }
      }
      const startNumber = numberedIndentLevels.get(indentLevel);
      if (startNumber !== undefined) {
        const newListItemIndex = startNumber + indices[indentLevel]++;
        if (currentListItemIndex !== newListItemIndex) {
          this.$p_paragraphIdToNumber[paragraphId] = newListItemIndex;
          const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
          const paragraphRenderControl = viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
          paragraphRenderControl.markDirtyContainer();
          documentRenderControl.dirtyParagraphIdQueue.queue(paragraphId);
        }
      }
      previousIndentLevel = indentLevel;
    }
    this.$p_isDirty = false;
  }
  setListItemIndentLevel(paragraphId: string, indentLevel: NumberedListIndent): void {
    assert(this.$p_listItemInfos.has(paragraphId));
    const currentIndentLevel = this.$p_paragraphIdToIndentLevel[paragraphId];
    if (currentIndentLevel !== indentLevel) {
      this.$p_isDirty = true;
      this.$p_paragraphIdToIndentLevel[paragraphId] = indentLevel;
    }
  }
  insertListItems(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    listItemInfoToInsert: NumberedListItemInfo[],
  ): void {
    assert(listItemInfoToInsert.length > 0);
    this.$p_isDirty = true;
    for (let i = 0; i < listItemInfoToInsert.length; i++) {
      const listItemInfo = listItemInfoToInsert[i];
      assert(!this.$p_listItemInfos.has(listItemInfo.paragraphId));
      this.$p_paragraphIdToIndentLevel[listItemInfo.paragraphId] = listItemInfo.indentLevel;
      const paragraphReference = matita.makeBlockReferenceFromBlockId(listItemInfo.paragraphId);
      const paragraphBlockIndices = matita.indexBlockAtBlockReference(document, paragraphReference);
      this.$p_listItemInfos.insertValueUsingComparisonFunction(listItemInfo.paragraphId, (paragraphId) => {
        const compareWithParagraphBlockReference = matita.makeBlockReferenceFromBlockId(paragraphId);
        const compareWithParagraphBlockIndices = matita.indexBlockAtBlockReference(document, compareWithParagraphBlockReference);
        return matita.compareBlockIndicesForUniqueParagraphsAtBlockReferences(paragraphBlockIndices, compareWithParagraphBlockIndices);
      });
    }
  }
  onListItemRemoved(paragraphId: string): void {
    assert(this.$p_listItemInfos.has(paragraphId));
    this.$p_isDirty = true;
    const index = this.$p_listItemInfos.indexOf(paragraphId);
    this.$p_listItemInfos.remove(index, index);
    delete this.$p_paragraphIdToNumber[paragraphId];
    delete this.$p_paragraphIdToIndentLevel[paragraphId];
  }
  getListItemNumber(paragraphId: string): number {
    assert(this.$p_listItemInfos.has(paragraphId) && !this.$p_isDirty);
    const value = this.$p_paragraphIdToNumber[paragraphId];
    assertIsNotNullish(value);
    return value;
  }
  getItemCount(): number {
    return this.$p_listItemInfos.getLength();
  }
}
const compositionStartDataKey = 'virtualized.compositionStart';
interface CompositionUpdateSelectionDataValue {
  expirationId: number;
  selectionStartOffsetAdjustAmount: number;
  selectionEndOffsetAdjustAmount: number;
}
const compositionUpdateSelectionChangeDataKey = 'virtualized.compositionUpdateSelectionChangeDataKey';
const compositionUpdateSelectionRangeDataKey = 'virtualized.compositionUpdateSelectionRangeDataKey';
function isSelectionChangeDataCompositionUpdate(selectionChangeData: matita.SelectionChangeData): boolean {
  if (compositionUpdateSelectionChangeDataKey in selectionChangeData) {
    const value = selectionChangeData[compositionUpdateSelectionChangeDataKey];
    assert(value === true);
    return true;
  }
  return false;
}
function makeSelectionChangeCompositionUpdateDataValue(): true {
  return true;
}
function getSelectionRangeCompositionUpdateDataValue(selectionRangeData: matita.SelectionRangeData): CompositionUpdateSelectionDataValue | undefined {
  if (!(compositionUpdateSelectionRangeDataKey in selectionRangeData)) {
    return;
  }
  const value = selectionRangeData[compositionUpdateSelectionRangeDataKey];
  assert(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'expirationId' in value &&
      typeof value.expirationId === 'number' &&
      'selectionStartOffsetAdjustAmount' in value &&
      typeof value.selectionStartOffsetAdjustAmount === 'number' &&
      'selectionEndOffsetAdjustAmount' in value &&
      typeof value.selectionEndOffsetAdjustAmount === 'number',
  );
  return value as CompositionUpdateSelectionDataValue;
}
function makeSelectionRangeCompositionUpdateDataValue(
  expirationId: number,
  selectionStartOffsetAdjustAmount: number,
  selectionEndOffsetAdjustAmount: number,
): CompositionUpdateSelectionDataValue {
  return {
    expirationId,
    selectionStartOffsetAdjustAmount,
    selectionEndOffsetAdjustAmount,
  };
}
type PendingCompositionSelectionOffsets = { offsets?: { startOffset: number; endOffset: number } };
class FloatingVirtualizedTextInputControl extends DisposableClass {
  inputElement: HTMLElement;
  private $p_isInComposition_syncedToQueueUpdate = false;
  private $p_isInComposition_syncStartDelayedEnd = false;
  private $p_lastNativeOffset = 0;
  private $p_unexpectedCompositionInterruption = false;
  private $p_lastCompositionSelectionTextInputUpdateOffsets: {
    startOffset: number;
    endOffset: number;
  } | null = null;
  private $p_isInComposition_syncStartDelayedEndDisposable: Disposable | null = null;
  constructor(
    private $p_stateControl: matita.StateControl<
      matita.NodeConfig,
      matita.NodeConfig,
      matita.NodeConfig,
      matita.NodeConfig,
      matita.NodeConfig,
      matita.NodeConfig
    >,
    private $p_undoControl: LocalUndoControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private $p_runCommand: (commandInfo: CommandInfo<any>) => void,
    private $p_getIsDraggingSelection: () => boolean,
    private $p_endSelectionDrag: () => void,
    private $p_makeSelectionDataExpirationId: () => number,
  ) {
    super();
    this.inputElement = document.createElement('span');
    this.inputElement.contentEditable = 'true';
    this.inputElement.spellcheck = false;
    this.inputElement.style.position = 'absolute';
    this.inputElement.style.outline = 'none';
    this.inputElement.style.caretColor = 'transparent';
    this.inputElement.style.fontFamily = 'initial';
    this.inputElement.style.whiteSpace = 'nowrap';
    this.inputElement.style.opacity = '0';
    this.inputElement.style.textAlign = 'right';
    this.inputElement.style.lineHeight = '1';
    const inputElementReactiveMutationObserver = new ReactiveMutationObserver();
    pipe(
      inputElementReactiveMutationObserver.records$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        // This fires before compositionstart in safari.
        if (isSafari) {
          if (this.$p_isInComposition_syncedToQueueUpdate) {
            return;
          }
          requestAnimationFrameDisposable(() => {
            this.$p_syncInputElement();
          }, this);
        } else if (!this.$p_isInComposition_syncedToQueueUpdate) {
          this.$p_syncInputElement();
        }
      }, this),
    );
    this.add(inputElementReactiveMutationObserver);
    inputElementReactiveMutationObserver.observe(this.inputElement, {
      childList: true,
    });
    addEventListener(this.inputElement, 'selectionchange', this.$p_syncInputElement.bind(this), this);
    addEventListener(this.inputElement, 'compositionstart', this.$p_onCompositionStart.bind(this), this);
    addWindowEventListener('compositionend', this.$p_onCompositionEnd.bind(this), this);
    addEventListener(this.inputElement, 'beforeinput', this.$p_onBeforeInput.bind(this), this);
    if (!isSafari) {
      addEventListener(this.inputElement, 'input', this.$p_onInput.bind(this), this);
    }
  }
  setPositionAndHeight(left: number, top: number, height: number) {
    this.inputElement.style.fontSize = `${height}px`;
    this.inputElement.style.right = `calc(100% - ${left}px)`;
    this.inputElement.style.top = `${top}px`;
  }
  getIsInComposition(): boolean {
    return this.$p_isInComposition_syncedToQueueUpdate || this.$p_isInComposition_syncStartDelayedEnd;
  }
  sync(): void {
    this.$p_syncInputElement();
  }
  getIsFocused(): boolean {
    return document.activeElement === this.inputElement;
  }
  focusButDoNotScrollTo(): void {
    this.inputElement.focus({
      preventScroll: true,
    });
  }
  blur(): void {
    this.inputElement.blur();
  }
  private $p_syncInputElement(): void {
    if (!this.getIsFocused() || this.getIsInComposition()) {
      return;
    }
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$p_stateControl.stateView.selection);
    if (!focusSelectionRange) {
      this.inputElement.replaceChildren();
      return;
    }
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    const direction = matita.getRangeDirection(this.$p_stateControl.stateView.document, focusRange);
    const anchorPoint = matita.getAnchorPointFromRange(focusRange);
    const focusPoint = matita.getFocusPointFromRange(focusRange);
    matita.assertIsParagraphPoint(anchorPoint);
    matita.assertIsParagraphPoint(focusPoint);
    const firstPoint = direction === matita.RangeDirection.Backwards ? focusPoint : anchorPoint;
    const paragraph = matita.accessParagraphFromParagraphPoint(this.$p_stateControl.stateView.document, firstPoint);
    const textUntilFirstPoint = matita
      .sliceParagraphChildren(paragraph, 0, firstPoint.offset)
      .filter(matita.isText)
      .map((textNode) => textNode.text)
      .join('');
    const lastWord = textUntilFirstPoint.slice(textUntilFirstPoint.lastIndexOf(' ') + 1);
    if (
      !(this.inputElement.childNodes.length === 0 && lastWord === '') &&
      !(this.inputElement.childNodes.length === 1 && this.inputElement.childNodes[0] instanceof Text && this.inputElement.childNodes[0].nodeValue === lastWord)
    ) {
      if (lastWord === '') {
        this.inputElement.replaceChildren();
      } else {
        const textNode = document.createTextNode(lastWord);
        this.inputElement.replaceChildren(textNode);
      }
    }
    let newNativeNode: Node;
    if (lastWord === '') {
      newNativeNode = this.inputElement;
    } else {
      newNativeNode = this.inputElement.childNodes[0];
    }
    const nativeSelection = getSelection();
    if (!nativeSelection) {
      return;
    }
    const newNativeOffset = firstPoint.offset - (textUntilFirstPoint.length - lastWord.length);
    this.$p_lastNativeOffset = newNativeOffset;
    if (nativeSelection.rangeCount === 1) {
      const currentNativeRange = nativeSelection.getRangeAt(0);
      if (
        currentNativeRange.startContainer === newNativeNode &&
        currentNativeRange.startOffset === newNativeOffset &&
        currentNativeRange.endContainer === newNativeNode &&
        currentNativeRange.endOffset === newNativeOffset
      ) {
        return;
      }
    }
    if (nativeSelection.rangeCount > 1) {
      nativeSelection.removeAllRanges();
    }
    nativeSelection.setBaseAndExtent(newNativeNode, newNativeOffset, newNativeNode, newNativeOffset);
  }
  private $p_onCompositionStart(): void {
    this.$p_isInComposition_syncStartDelayedEndDisposable?.dispose();
    this.$p_isInComposition_syncStartDelayedEnd = true;
    this.$p_stateControl.queueUpdate(
      () => {
        this.$p_isInComposition_syncedToQueueUpdate = true;
        this.$p_unexpectedCompositionInterruption = false;
      },
      { [compositionStartDataKey]: true },
    );
  }
  private $p_onCompositionEnd(): void {
    if (!this.$p_isInComposition_syncStartDelayedEnd) {
      return;
    }
    this.$p_isInComposition_syncStartDelayedEndDisposable?.dispose();
    this.$p_isInComposition_syncStartDelayedEndDisposable = Disposable();
    // TODO: This looks like a hack and it most definitely is. We don't want to wipe the input between compositions or allow keyboard events straight after.
    requestAnimationFrameDisposable(() => {
      requestAnimationFrameDisposable(
        () => {
          requestAnimationFrameDisposable(() => {
            requestAnimationFrameDisposable(() => {
              this.$p_isInComposition_syncStartDelayedEnd = false;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            }, this.$p_isInComposition_syncStartDelayedEndDisposable!);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          }, this.$p_isInComposition_syncStartDelayedEndDisposable!);
        },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.$p_isInComposition_syncStartDelayedEndDisposable!,
      );
    }, this.$p_isInComposition_syncStartDelayedEndDisposable);
    this.$p_stateControl.queueUpdate(
      () => {
        this.$p_isInComposition_syncedToQueueUpdate = false;
        // TODO: Clicking checkbox/Alt drag?ww
        if (!this.$p_getIsDraggingSelection()) {
          this.$p_stateControl.delta.setSelection(
            matita.transformSelectionByTransformingSelectionRanges(
              this.$p_stateControl.stateView.document,
              this.$p_stateControl.stateControlConfig,
              this.$p_stateControl.stateView.selection,
              (selectionRange) => {
                if (shouldCollapseSelectionRangeInTextCommand(this.$p_stateControl.stateView.document, selectionRange)) {
                  return collapseSelectionRangeForwards(this.$p_stateControl.stateView.document, selectionRange);
                }
                return selectionRange;
              },
            ),
          );
        }
        if (this.$p_lastCompositionSelectionTextInputUpdateOffsets !== null) {
          this.$p_lastNativeOffset = this.$p_lastCompositionSelectionTextInputUpdateOffsets.endOffset;
          // We reset this on compositionend, instead of compositionstart, because safari can run beforeinput before compositionstart.
          this.$p_lastCompositionSelectionTextInputUpdateOffsets = null;
        }
        this.$p_undoControl.forceNextChange(
          (changeType) => changeType === LocalUndoControlLastChangeType.InsertPlainText || changeType === LocalUndoControlLastChangeType.CompositionUpdate,
        );
      },
      { [forceSpellCheckControlTextEditUpdateDataKey]: TextEditUpdateType.Composition },
    );
  }
  private $p_insertTextWithAdjustAmounts(text: string, startOffsetAdjustAmount: number, endOffsetAdjustAmount: number): void {
    const adjustPointIfParagraphPoint = (range: matita.Range, point: matita.Point, adjustAmount: number): matita.PointWithContentReference => {
      if (!matita.isParagraphPoint(point)) {
        return {
          contentReference: range.contentReference,
          point,
        };
      }
      const newPointOffset =
        adjustAmount > 0
          ? Math.min(
              point.offset + adjustAmount,
              matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(this.$p_stateControl.stateView.document, point)),
            )
          : Math.max(point.offset + adjustAmount, 0);
      return {
        contentReference: range.contentReference,
        point: matita.changeParagraphPointOffset(point, newPointOffset),
      };
    };
    // TODO: Collisions with multiple selection range, and limit backwards/forwards shifting?
    // TODO: Consecutive composition selection ranges in safari with long composition text merges them whereas it doesn't in firefox/chrome.
    const insertSelection =
      startOffsetAdjustAmount === 0 && endOffsetAdjustAmount === 0
        ? undefined
        : matita.extendSelectionByPointTransformFns(
            this.$p_stateControl.stateView.document,
            this.$p_stateControl.stateControlConfig,
            this.$p_stateControl.stateView.selection,
            () => true,
            (_document, _stateControlConfig, range, point, selectionRange) => {
              if (matita.getIsSelectionRangeAnchorAfterFocus(this.$p_stateControl.stateView.document, selectionRange)) {
                return adjustPointIfParagraphPoint(range, point, endOffsetAdjustAmount);
              }
              return adjustPointIfParagraphPoint(range, point, startOffsetAdjustAmount);
            },
            (_document, _stateControlConfig, range, point, selectionRange) => {
              if (matita.getIsSelectionRangeAnchorAfterFocus(this.$p_stateControl.stateView.document, selectionRange)) {
                return adjustPointIfParagraphPoint(range, point, startOffsetAdjustAmount);
              }
              return adjustPointIfParagraphPoint(range, point, endOffsetAdjustAmount);
            },
          );
    const getContentFragmentFromSelectionRange = (
      customCollapsedSelectionTextConfig: TextConfig | null,
      selectionRange: matita.SelectionRange,
    ): matita.ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
      return matita.makeContentFragment([
        matita.makeContentFragmentParagraph(
          matita.makeParagraph(
            {},
            text === ''
              ? []
              : [
                  matita.makeText(
                    getInsertTextConfigAtSelectionRange(this.$p_stateControl.stateView.document, customCollapsedSelectionTextConfig, selectionRange),
                    text,
                  ),
                ],
            matita.generateId(),
          ),
        ),
      ]);
    };
    const { customCollapsedSelectionTextConfig } = this.$p_stateControl.stateView;
    this.$p_stateControl.delta.applyUpdate(
      matita.makeInsertContentFragmentAtSelectionUpdateFn(
        this.$p_stateControl,
        (selectionRange) => getContentFragmentFromSelectionRange(customCollapsedSelectionTextConfig, selectionRange),
        insertSelection,
        true,
      ),
    );
  }
  private $p_getIsInputTypeComposition(inputType: string): boolean {
    return (
      inputType === 'insertCompositionText' ||
      // Safari implements the old spec.
      (isSafari && (inputType === 'deleteCompositionText' || inputType === 'insertFromComposition' || inputType === 'deleteByComposition'))
    );
  }
  private $p_pendingCompositionBeforeInputSelectionOffsets: PendingCompositionSelectionOffsets | undefined;
  private $p_calculatePendingCompositionOffsets(): void {
    if (this.$p_pendingCompositionBeforeInputSelectionOffsets === undefined) {
      return;
    }
    const nativeSelection = getSelection();
    if (nativeSelection !== null && nativeSelection.rangeCount === 1) {
      const nativeRange = nativeSelection.getRangeAt(0);
      if (nativeRange.startContainer === nativeRange.endContainer && this.inputElement.contains(nativeRange.startContainer)) {
        this.$p_pendingCompositionBeforeInputSelectionOffsets.offsets = {
          startOffset: nativeRange.startOffset,
          endOffset: nativeRange.endOffset,
        };
      }
    }
  }
  private $p_onInput(event: globalThis.Event): void {
    if (
      this.$p_pendingCompositionBeforeInputSelectionOffsets === undefined ||
      this.$p_pendingCompositionBeforeInputSelectionOffsets.offsets !== undefined ||
      !(event instanceof InputEvent) ||
      !this.$p_getIsInputTypeComposition(event.inputType)
    ) {
      return;
    }
    this.$p_calculatePendingCompositionOffsets();
  }
  private $p_handleCompositionUpdate(startOffset: number, endOffset: number, text: string): void {
    assert(endOffset >= startOffset);
    let pendingOffsets: PendingCompositionSelectionOffsets | undefined;
    if (text === '') {
      this.$p_pendingCompositionBeforeInputSelectionOffsets = undefined;
    } else {
      pendingOffsets = {};
      this.$p_pendingCompositionBeforeInputSelectionOffsets = pendingOffsets;
    }
    // TODO: Doesn't preserve style, especially in Safari.
    const runUpdate: matita.RunUpdateFn = () => {
      if (this.$p_unexpectedCompositionInterruption) {
        return;
      }
      if (this.$p_getIsDraggingSelection() || /\r|\n/.test(text)) {
        // Firefox inserts the composition text at the drag position when selecting elsewhere ends the composition.
        this.$p_unexpectedCompositionInterruption = true;
        return;
      }
      let startOffsetAdjustAmount: number;
      let endOffsetAdjustAmount: number;
      if (this.$p_lastCompositionSelectionTextInputUpdateOffsets === null) {
        startOffsetAdjustAmount = Math.min(startOffset - this.$p_lastNativeOffset, 0);
        endOffsetAdjustAmount = Math.min(endOffset - this.$p_lastNativeOffset, 0);
      } else {
        startOffsetAdjustAmount = startOffset - this.$p_lastCompositionSelectionTextInputUpdateOffsets.startOffset;
        endOffsetAdjustAmount = endOffset - this.$p_lastCompositionSelectionTextInputUpdateOffsets.endOffset;
      }
      this.$p_insertTextWithAdjustAmounts(text, startOffsetAdjustAmount, endOffsetAdjustAmount);
      const compositionSelectionTextInputUpdateOffsetsStartOffset = startOffset;
      const compositionSelectionTextInputUpdateOffsetsEndOffset = startOffset + text.length;
      this.$p_lastCompositionSelectionTextInputUpdateOffsets = {
        startOffset: compositionSelectionTextInputUpdateOffsetsStartOffset,
        endOffset: compositionSelectionTextInputUpdateOffsetsEndOffset,
      };
      if (text !== '') {
        if (isSafari) {
          this.$p_calculatePendingCompositionOffsets();
        }
        let updateSelectionRangeData: matita.UpdateSelectionRangeDataFn | undefined;
        let getSelectionChangeData: matita.GetSelectionChangeDataFn | undefined;
        assertIsNotNullish(pendingOffsets);
        const { offsets } = pendingOffsets;
        if (offsets !== undefined) {
          updateSelectionRangeData = (_oldSelectionRange, newSelectionRange) => ({
            ...newSelectionRange.data,
            [compositionUpdateSelectionRangeDataKey]: makeSelectionRangeCompositionUpdateDataValue(
              this.$p_makeSelectionDataExpirationId(),
              offsets.startOffset - compositionSelectionTextInputUpdateOffsetsStartOffset,
              offsets.endOffset - compositionSelectionTextInputUpdateOffsetsEndOffset,
            ),
          });
          getSelectionChangeData = () => ({
            [compositionUpdateSelectionChangeDataKey]: makeSelectionChangeCompositionUpdateDataValue(),
          });
        }
        this.$p_stateControl.delta.applyUpdate(
          matita.makeExtendSelectionByPointTransformFnsUpdateFn(
            this.$p_stateControl,
            (_document, _stateControlConfig, selectionRange) => matita.isSelectionRangeCollapsedInText(selectionRange),
            (_document, _stateControlConfig, range, point, _selectionRange) => {
              matita.assertIsParagraphPoint(point);
              return {
                contentReference: range.contentReference,
                point: matita.changeParagraphPointOffset(point, Math.max(point.offset - text.length, 0)),
              };
            },
            undefined,
            updateSelectionRangeData,
            getSelectionChangeData,
          ),
        );
      }
    };
    this.$p_stateControl.queueUpdate(runUpdate, {
      [matita.RedoUndoUpdateKey.CompositionUpdate]: true,
    });
  }
  private $p_getTextFromInputEvent(event: InputEvent): string {
    let text = '';
    if (event.dataTransfer) {
      text = event.dataTransfer.getData('text/plain');
    }
    if (!text) {
      text = event.data || '';
    }
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\r\x00-\x1f]/g, '');
  }
  private $p_onBeforeInput(event: InputEvent): void {
    this.$p_endSelectionDrag();
    const { inputType } = event;
    if (this.$p_getIsInputTypeComposition(inputType)) {
      const text = this.$p_getTextFromInputEvent(event);
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length !== 1) {
        return;
      }
      const { startContainer, startOffset, endContainer, endOffset } = targetRanges[0];
      if (startContainer !== endContainer) {
        this.$p_stateControl.queueUpdate(() => {
          if (this.$p_isInComposition_syncedToQueueUpdate) {
            this.$p_unexpectedCompositionInterruption = true;
          }
        });
        return;
      }
      this.$p_handleCompositionUpdate(startOffset, endOffset, text);
      return;
    }
    if (inputType === 'insertText' || (isSafari && inputType === 'insertReplacementText')) {
      const text = this.$p_getTextFromInputEvent(event);
      if (text === '' || /\r|\n/.test(text)) {
        event.preventDefault();
        return;
      }
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length !== 1) {
        event.preventDefault();
        return;
      }
      const { startContainer, startOffset, endContainer, endOffset } = targetRanges[0];
      if (startContainer !== endContainer) {
        event.preventDefault();
        return;
      }
      if (startOffset !== endOffset) {
        assert(endOffset > startOffset);
        this.$p_stateControl.queueUpdate(
          () => {
            // TODO: When multiple input events are batched together the last native offset can be incorrect.
            const startOffsetAdjustAmount = Math.min(startOffset - this.$p_lastNativeOffset, 0);
            const endOffsetAdjustAmount = Math.min(endOffset - this.$p_lastNativeOffset, 0);
            this.$p_insertTextWithAdjustAmounts(text, startOffsetAdjustAmount, endOffsetAdjustAmount);
          },
          { [forceSpellCheckControlTextEditUpdateDataKey]: TextEditUpdateType.InsertOrRemove },
        );
        event.preventDefault();
        return;
      }
      this.$p_runCommand(makeInsertPlainTextCommandInfo(text));
      // Canceling messes with composition.
      return;
    }
    event.preventDefault();
  }
}
const SeparateSelectionIdKey = 'virtualized.separateSelectionId';
const SearchQueryGoToSearchResultImmediatelyKey = 'virtualized.searchQueryGoToSearchResultImmediately';
class ListStyleInjectionControl extends DisposableClass {
  private $p_numberedListIndexerMap = new Map<string, ListIndexer>();
  constructor(
    private $p_stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    private $p_viewControl: VirtualizedViewControl,
    private $p_topLevelContentReference: matita.ContentReference,
    private $p_queueDirtyParagraph: (paragraphId: string) => void,
  ) {
    super();
    this.$p_trackChanges();
  }
  injectStyle(paragraphReference: matita.BlockReference, injectedStyle: ParagraphStyleInjection): void {
    const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    if (paragraph.config.type === ParagraphType.ListItem) {
      const topLevelContent = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
      const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
      injectedStyle.ListItem_type = listType;
      if (listType === AccessedListStyleType.OrderedList) {
        assert(typeof paragraph.config.ListItem_listId === 'string');
        const numberedListIndexer = this.$p_numberedListIndexerMap.get(paragraph.config.ListItem_listId as string);
        assertIsNotNullish(numberedListIndexer);
        injectedStyle.ListItem_OrderedList_number = numberedListIndexer.getListItemNumber(paragraph.id);
        const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
        injectedStyle.ListItem_OrderedList_style = orderedListStyle;
      }
    }
  }
  computeIndices(): void {
    const topLevelContent = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
    const { listStyles } = topLevelContent.config;
    if (matita.isJsonMap(listStyles)) {
      const { listIdToStyle } = listStyles;
      if (matita.isJsonMap(listIdToStyle)) {
        for (const [listId, numberedListIndexer] of this.$p_numberedListIndexerMap.entries()) {
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
              numberedListIndexer.recomputeListNumbers(this.$p_viewControl, numberedIndentLevels);
            }
          }
        }
      }
    }
  }
  private $p_trackChanges(): void {
    const registerParagraphAtParagraphIdWithListIdAndNumberedListIndent = (paragraphId: string, listId: string, indentLevel: NumberedListIndent) => {
      let indexer = this.$p_numberedListIndexerMap.get(listId);
      if (indexer === undefined) {
        indexer = new ListIndexer();
        this.$p_numberedListIndexerMap.set(listId, indexer);
      }
      indexer.insertListItems(this.$p_stateControl.stateView.document, [{ paragraphId, indentLevel }]);
    };
    const unregisterParagraphAtParagraphIdWithListId = (paragraphId: string, listId: string) => {
      const indexer = this.$p_numberedListIndexerMap.get(listId);
      assertIsNotNullish(indexer);
      indexer.onListItemRemoved(paragraphId);
      if (indexer.getItemCount() === 0) {
        this.$p_numberedListIndexerMap.delete(listId);
      }
    };
    for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference)) {
      const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
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
        const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
        if (matita.isParagraph(block)) {
          if (block.config.type === ParagraphType.ListItem && typeof block.config.ListItem_listId === 'string') {
            unregisterParagraphAtParagraphIdWithListId(block.id, block.config.ListItem_listId);
          }
        } else {
          for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
            const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            if (paragraph.config.type === ParagraphType.ListItem && typeof paragraph.config.ListItem_listId === 'string') {
              unregisterParagraphAtParagraphIdWithListId(paragraph.id, paragraph.config.ListItem_listId);
            }
          }
        }
      }
    };
    const trackNumberedListBlocksAfterInserted = (blockReferences: matita.BlockReference[]): void => {
      for (let i = 0; i < blockReferences.length; i++) {
        const blockReference = blockReferences[i];
        const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
        if (matita.isParagraph(block)) {
          if (block.config.type === ParagraphType.ListItem && typeof block.config.ListItem_listId === 'string') {
            registerParagraphAtParagraphIdWithListIdAndNumberedListIndent(
              block.id,
              block.config.ListItem_listId,
              convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel),
            );
          }
        } else {
          for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
            const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
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
      }
    };
    pipe(
      this.$p_stateControl.beforeMutationPart$,
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
                this.$p_stateControl.afterMutationPart$,
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
                this.$p_stateControl.afterMutationPart$,
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
              const { blockReference, isParagraphChildrenUpdated } = change;
              if (isParagraphChildrenUpdated) {
                break;
              }
              let block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
              if (matita.isEmbed(block)) {
                break;
              }
              const configBefore = block.config;
              pipe(
                this.$p_stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
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
                          const indexer = this.$p_numberedListIndexerMap.get(currentListId);
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
                this.$p_stateControl.afterMutationPart$,
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
                    for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
                      const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
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
                for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
                  const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
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
              if (!matita.areContentReferencesAtSameContent(contentReference, this.$p_topLevelContentReference)) {
                break;
              }
              let content = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
              const configBefore = content.config;
              pipe(
                this.$p_stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  content = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
                  const configAfter = content.config;
                  if (configBefore.listStyles === configAfter.listStyles) {
                    return;
                  }
                  for (const [listId, numberedListIndexer] of this.$p_numberedListIndexerMap.entries()) {
                    for (let indentLevel = 0; indentLevel <= maxListIndentLevel; indentLevel++) {
                      const numberedIndentLevel = indentLevel as NumberedListIndent;
                      const previousListType = accessListTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(configBefore, listId, numberedIndentLevel);
                      const listType = accessListTypeInTopLevelContentConfigAtListIdAtNumberedIndentLevel(configAfter, listId, numberedIndentLevel);
                      let shouldUpdate = false;
                      decideShouldUpdate: if (previousListType !== listType) {
                        shouldUpdate = true;
                      } else if (listType === AccessedListStyleType.OrderedList) {
                        const previousListStartNumber = accessOrderedListStartNumberInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                          configBefore,
                          listId,
                          numberedIndentLevel,
                        );
                        const listStartNumber = accessOrderedListStartNumberInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                          configAfter,
                          listId,
                          numberedIndentLevel,
                        );
                        if (previousListStartNumber !== listStartNumber) {
                          shouldUpdate = true;
                          break decideShouldUpdate;
                        }
                        const previousOrderedListStyle = accessOrderedListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                          configBefore,
                          listId,
                          numberedIndentLevel,
                        );
                        const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigAtListIdAtNumberedIndentLevel(
                          configAfter,
                          listId,
                          numberedIndentLevel,
                        );
                        if (previousOrderedListStyle !== orderedListStyle) {
                          shouldUpdate = true;
                        }
                      }
                      if (shouldUpdate) {
                        for (const paragraphId of numberedListIndexer.iterateParagraphIds()) {
                          const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
                          const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
                          matita.assertIsParagraph(paragraph);
                          if (convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel) === indentLevel) {
                            if (listType === AccessedListStyleType.OrderedList) {
                              numberedListIndexer.markDirty();
                            }
                            const paragraphRenderControl = this.$p_viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
                            paragraphRenderControl.markDirtyContainer();
                            this.$p_queueDirtyParagraph(paragraphId);
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
  }
}
// prettier-ignore
const commonTwoLetterWords = new Set(['am', 'an', 'as', 'at', 'be', 'bi', 'by', 'do', 'ex', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'ok', 'on', 'or', 're', 'so', 'to', 'un', 'up', 'us', 'we']);
const enum WhichDropdown {
  Mark,
  Paragraph,
  Insert,
}
interface ToolbarDropdownItemContextValue {
  activeChildText: string | null;
  setActiveChildText: (newActiveParent: string | null) => void;
}
const ToolbarDropdownItemContext = createContext<ToolbarDropdownItemContextValue | null>(null);
const ToolbarDropdownItemContextProvider = ToolbarDropdownItemContext.Provider;
type ToolbarPropsRunCommandFn = (commandInfo: CommandInfo<any>) => void;
interface ToolbarProps {
  close$: Source<unknown>;
  isToolbarOpenSink: Sink<boolean>;
  resetFocusSink: Sink<undefined>;
  runCommand: ToolbarPropsRunCommandFn;
}
function Toolbar(props: ToolbarProps): JSX.Element | null {
  const { close$, isToolbarOpenSink, resetFocusSink, runCommand } = props;
  const [activeDropdown, setActiveDropdown_] = useState<WhichDropdown | null>(null);
  const setActiveDropdown = (newActiveDropdown: WhichDropdown | null) => {
    isToolbarOpenSink(Push(newActiveDropdown !== null));
    setActiveDropdown_(newActiveDropdown);
  };
  const unsetAsActive = () => {
    resetFocusSink(Push(undefined));
    setActiveDropdown(null);
  };
  useEffect(() => {
    const disposable = Disposable();
    pipe(
      close$,
      subscribe((event) => {
        assert(event.type === PushType);
        flushSync(() => {
          setActiveDropdown(null);
        });
      }, disposable),
    );
    return () => {
      disposable.dispose();
    };
  });
  const makeRunCommandAction = (commandName: CommandName, data: unknown = null): (() => void) => {
    return () => {
      runCommand({
        commandName,
        data,
      });
      unsetAsActive();
    };
  };
  return (
    <>
      <ToolbarDropdown
        dropdown={WhichDropdown.Mark}
        activeDropdown={activeDropdown}
        setAsActive={() => setActiveDropdown(WhichDropdown.Mark)}
        unsetAsActive={unsetAsActive}
        isFirst={true}
        text="Mark"
      >
        <ToolbarDropdownItem text="Bold" action={makeRunCommandAction(StandardCommand.ApplyBold)} />
        <ToolbarDropdownItem text="Italic" action={makeRunCommandAction(StandardCommand.ApplyItalic)} />
        <ToolbarDropdownItem text="Underline" action={makeRunCommandAction(StandardCommand.ApplyUnderline)} />
        <ToolbarDropdownItem text="Code" action={makeRunCommandAction(StandardCommand.ApplyCode)} />
        <ToolbarDropdownItem text="Strikethrough" action={makeRunCommandAction(StandardCommand.ApplyStrikethrough)} />
        <ToolbarDropdownItem text="Script">
          <ToolbarDropdownItem text="Default" action={makeRunCommandAction(StandardCommand.ResetTextScript)} />
          <ToolbarDropdownItem text="Superscript" action={makeRunCommandAction(StandardCommand.ApplySuperscript)} />
          <ToolbarDropdownItem text="Subscript" action={makeRunCommandAction(StandardCommand.ApplySubscript)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Color">
          <ToolbarDropdownItem text="Default" action={makeRunCommandAction(StandardCommand.ResetTextColor)} />
          {colors.map((color) => (
            <ToolbarDropdownItem
              text={colorLabels[color]}
              color={colorHexValues[color]}
              key={color}
              action={makeRunCommandAction(StandardCommand.ApplyTextColor, color)}
            />
          ))}
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Highlight">
          <ToolbarDropdownItem text="Default" action={makeRunCommandAction(StandardCommand.ResetHighlightColor)} />
          {colors.map((color) => (
            <ToolbarDropdownItem
              text={colorLabels[color]}
              backgroundColor={highlightColorHexValues[color]}
              hoverBackgroundColor={darkerHighlightColorHexValues[color]}
              key={color}
              action={makeRunCommandAction(StandardCommand.ApplyHighlightColor, color)}
            />
          ))}
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Link" action={makeRunCommandAction(StandardCommand.OpenFloatingLinkBoxAtSelection)} />
        <ToolbarDropdownItem text="Clear All" action={makeRunCommandAction(StandardCommand.ResetInlineStyle)} />
      </ToolbarDropdown>
      <ToolbarDropdown
        dropdown={WhichDropdown.Paragraph}
        activeDropdown={activeDropdown}
        setAsActive={() => setActiveDropdown(WhichDropdown.Paragraph)}
        unsetAsActive={unsetAsActive}
        isFirst={false}
        text="Paragraph"
      >
        <ToolbarDropdownItem text="Default" action={makeRunCommandAction(StandardCommand.ResetParagraphType)} />
        <ToolbarDropdownItem text="Heading">
          <ToolbarDropdownItem text="Heading 1" action={makeRunCommandAction(StandardCommand.ApplyHeading1)} />
          <ToolbarDropdownItem text="Heading 2" action={makeRunCommandAction(StandardCommand.ApplyHeading2)} />
          <ToolbarDropdownItem text="Heading 3" action={makeRunCommandAction(StandardCommand.ApplyHeading3)} />
          <ToolbarDropdownItem text="Heading 4" action={makeRunCommandAction(StandardCommand.ApplyHeading4)} />
          <ToolbarDropdownItem text="Heading 5" action={makeRunCommandAction(StandardCommand.ApplyHeading5)} />
          <ToolbarDropdownItem text="Heading 6" action={makeRunCommandAction(StandardCommand.ApplyHeading6)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Blockquote" action={makeRunCommandAction(StandardCommand.ApplyBlockquote)} />
        <ToolbarDropdownItem text="List">
          <ToolbarDropdownItem text="Bullet List" action={makeRunCommandAction(StandardCommand.ApplyUnorderedList)} />
          <ToolbarDropdownItem text="Ordered List" action={makeRunCommandAction(StandardCommand.ApplyOrderedList)} />
          <ToolbarDropdownItem text="Checklist" action={makeRunCommandAction(StandardCommand.ApplyChecklist)} />
          <ToolbarDropdownItem text="Ordered List Style">
            <ToolbarDropdownItem text="Decimal" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.Decimal)} />
            <ToolbarDropdownItem text="Lower Alpha" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerAlpha)} />
            <ToolbarDropdownItem text="Lower Roman" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerRoman)} />
            <ToolbarDropdownItem text="Lower Greek" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerGreek)} />
            <ToolbarDropdownItem text="Upper Alpha" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperAlpha)} />
            <ToolbarDropdownItem text="Upper Roman" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperRoman)} />
            <ToolbarDropdownItem text="Upper Greek" action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperGreek)} />
          </ToolbarDropdownItem>
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Alignment">
          <ToolbarDropdownItem text="Left" action={makeRunCommandAction(StandardCommand.AlignParagraphLeft)} />
          <ToolbarDropdownItem text="Right" action={makeRunCommandAction(StandardCommand.AlignParagraphRight)} />
          <ToolbarDropdownItem text="Center" action={makeRunCommandAction(StandardCommand.AlignParagraphCenter)} />
          <ToolbarDropdownItem text="Justify" action={makeRunCommandAction(StandardCommand.AlignParagraphJustify)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Indent">
          <ToolbarDropdownItem text="Indented" action={makeRunCommandAction(StandardCommand.ApplyIndent1)} />
          <ToolbarDropdownItem text="Hanging Indent" action={makeRunCommandAction(StandardCommand.ApplyHangingIndent1)} />
          <ToolbarDropdownItem text="First Line Indent" action={makeRunCommandAction(StandardCommand.ApplyIndentFirstLine1)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem text="Insert Above" action={makeRunCommandAction(StandardCommand.InsertParagraphAbove)} />
        <ToolbarDropdownItem text="Insert Below" action={makeRunCommandAction(StandardCommand.InsertParagraphBelow)} />
        <ToolbarDropdownItem text="Clear All" action={makeRunCommandAction(StandardCommand.ResetParagraphStyle)} />
      </ToolbarDropdown>
      <ToolbarDropdown
        dropdown={WhichDropdown.Insert}
        activeDropdown={activeDropdown}
        setAsActive={() => setActiveDropdown(WhichDropdown.Insert)}
        unsetAsActive={unsetAsActive}
        isFirst={false}
        text="Insert"
      >
        <ToolbarDropdownItem text="Image" />
        <ToolbarDropdownItem text="Chip" />
        <ToolbarDropdownItem text="Footnote" />
        <ToolbarDropdownItem text="Latex" />
        <ToolbarDropdownItem text="Table" />
        <ToolbarDropdownItem text="Collapsible" />
        <ToolbarDropdownItem text="Video" />
        <ToolbarDropdownItem text="Callout" />
        <ToolbarDropdownItem text="Code" />
        <ToolbarDropdownItem text="Tabs" />
        <ToolbarDropdownItem text="Divider" />
        <ToolbarDropdownItem text="Spoiler" />
        <ToolbarDropdownItem text="Latex" />
        <ToolbarDropdownItem text="Mermaid" />
        <ToolbarDropdownItem text="Excalidraw" />
        <ToolbarDropdownItem text="Tweet" />
        <ToolbarDropdownItem text="Poll" />
        <ToolbarDropdownItem text="Web Link" />
        <ToolbarDropdownItem text="Giphy" />
      </ToolbarDropdown>
    </>
  );
}
function useToolbarDropdownItemContextValue(isActive: boolean): ToolbarDropdownItemContextValue {
  const [activeChildText, setActiveChildText] = useState<string | null>(null);
  if (!isActive && activeChildText !== null) {
    setActiveChildText(null);
  }
  const childToolbarDropdownItemContextValue = useMemo(() => ({ activeChildText, setActiveChildText }), [activeChildText]);
  return childToolbarDropdownItemContextValue;
}
interface ToolbarDropdownProps extends React.PropsWithChildren {
  dropdown: WhichDropdown;
  activeDropdown: WhichDropdown | null;
  setAsActive: () => void;
  unsetAsActive: () => void;
  text: string;
  isFirst: boolean;
}
function ToolbarDropdown(props: ToolbarDropdownProps): JSX.Element | null {
  const { dropdown, activeDropdown, setAsActive, unsetAsActive, text, isFirst, children } = props;
  const isActive = dropdown === activeDropdown;
  const childToolbarDropdownItemContextValue = useToolbarDropdownItemContextValue(isActive);
  return (
    <div className="toolbar__dropdown-container">
      <button
        className={['toolbar__dropdown-button', isFirst || 'toolbar__dropdown-button--not-first', isActive && 'toolbar__dropdown-button--active']
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (activeDropdown === dropdown) {
            unsetAsActive();
          } else {
            setAsActive();
          }
        }}
        onMouseOver={() => {
          if (activeDropdown === null || activeDropdown === dropdown) {
            return;
          }
          setAsActive();
        }}
      >
        {text}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16">
          <path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z" />
        </svg>
      </button>
      <ToolbarDropdownItemContextProvider value={childToolbarDropdownItemContextValue}>
        <div className={['toolbar__dropdown', isActive && 'toolbar__dropdown--active'].filter(Boolean).join(' ')}>{children}</div>
      </ToolbarDropdownItemContextProvider>
    </div>
  );
}
interface ToolbarDropdownItemProps extends React.PropsWithChildren {
  text: string;
  color?: string;
  backgroundColor?: string;
  hoverBackgroundColor?: string;
  action?: () => void; // TODO.
}
function ToolbarDropdownItem(props: ToolbarDropdownItemProps): JSX.Element | null {
  const { text, color, backgroundColor, hoverBackgroundColor, action, children } = props;
  const parentToolbarDropdownItemContextValue = useContext(ToolbarDropdownItemContext);
  assertIsNotNullish(parentToolbarDropdownItemContextValue);
  const { activeChildText, setActiveChildText } = parentToolbarDropdownItemContextValue;
  const hasChildren = Children.count(children) > 0;
  const onMouseOver = useCallback(() => {
    setActiveChildText(hasChildren ? text : null);
  }, [setActiveChildText, hasChildren, text]);
  const isActive = hasChildren && activeChildText === text;
  const childToolbarDropdownItemContextValue = useToolbarDropdownItemContextValue(isActive);
  const style = {
    color,
    '--toolbar__dropdown-item_background-color': backgroundColor,
    '--toolbar__dropdown-item_hover-background-color': hoverBackgroundColor,
  };
  const toolbarDropdownItemBaseClassName = `toolbar__dropdown-item ${
    backgroundColor ? 'toolbar__dropdown-item--has-background-color' : 'toolbar__dropdown-item--no-background-color'
  }`;
  if (hasChildren) {
    return (
      <div className="toolbar__nested-dropdown-container" onMouseOver={onMouseOver}>
        <div className={toolbarDropdownItemBaseClassName} style={style}>
          {text}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" width="16" height="16" className="toolbar__chevron-right">
            <path d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z" />
          </svg>
        </div>
        <ToolbarDropdownItemContextProvider value={childToolbarDropdownItemContextValue}>
          <div className={['toolbar__nested-dropdown', isActive && 'toolbar__nested-dropdown--active'].join(' ')}>{children}</div>
        </ToolbarDropdownItemContextProvider>
      </div>
    );
  }
  return (
    <button className={`${toolbarDropdownItemBaseClassName} toolbar__dropdown-item--no-children`} style={style} onMouseOver={onMouseOver} onClick={action}>
      {text}
    </button>
  );
}
const keepFloatingLinkBoxOpenUpdateKey = 'keepFloatingLinkBoxOpenUpdateKey';
class VirtualizedDocumentRenderControl extends DisposableClass implements matita.DocumentRenderControl {
  rootHtmlElement: HTMLElement;
  stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  viewControl: VirtualizedViewControl;
  topLevelContentReference: matita.ContentReference;
  htmlElementToNodeRenderControlMap: Map<HTMLElement, VirtualizedContentRenderControl | VirtualizedParagraphRenderControl>;
  dirtyParagraphIdQueue: UniqueStringQueue;
  relativeParagraphMeasurementCache: LruCache<string, RelativeParagraphMeasureCacheValue>;
  private $p_containerHtmlElement!: HTMLElement;
  private $p_toolbarContainerElement!: HTMLElement;
  private $p_topLevelContentViewContainerElement!: HTMLElement;
  private $p_selectionRectsViewContainerElement!: HTMLElement;
  private $p_selectionCursorsViewContainerElement!: HTMLElement;
  private $p_searchOverlayContainerElement!: HTMLElement;
  private $p_searchElementContainerElement!: HTMLElement;
  private $p_spellingMistakesOverlayContainerElement!: HTMLElement;
  private $p_spellingBoxElement!: HTMLElement;
  private $p_linkBoxElement!: HTMLElement;
  private $p_linkDetailsElement!: HTMLElement;
  private $p_searchInputRef = createRef<HTMLInputElement>();
  private $p_selectionView$: CurrentValueDistributor<SelectionViewMessage>;
  private $p_searchOverlay$: CurrentValueDistributor<SearchOverlayMessage>;
  private $p_spellingMistakesOverlay$: CurrentValueDistributor<SpellingMistakesOverlayMessage>;
  private $p_keyCommands: KeyCommands;
  private $p_commandRegister: VirtualizedCommandRegister;
  private $p_undoControl: LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  private $p_graphemeSegmenter: IntlSegmenter;
  constructor(
    rootHtmlElement: HTMLElement,
    stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    viewControl: VirtualizedViewControl,
    topLevelContentReference: matita.ContentReference,
  ) {
    super(() => this.$p_dispose());
    this.rootHtmlElement = rootHtmlElement;
    this.stateControl = stateControl;
    this.viewControl = viewControl;
    this.topLevelContentReference = topLevelContentReference;
    this.htmlElementToNodeRenderControlMap = new Map();
    this.dirtyParagraphIdQueue = new UniqueStringQueue([]);
    this.$p_selectionView$ = CurrentValueDistributor<SelectionViewMessage>({
      viewCursorAndRangeInfos: {
        viewCursorAndRangeInfosForSelectionRanges: [],
        isDragging: false,
      },
      renderSync: false,
    });
    this.$p_searchOverlay$ = CurrentValueDistributor<SearchOverlayMessage>({
      calculateMatchInfos: () => [],
      renderSync: false,
      roundCorners: isFirefox,
    });
    this.$p_spellingMistakesOverlay$ = CurrentValueDistributor<SpellingMistakesOverlayMessage>({
      spellingMistakeOverlayInfos: [],
    });
    this.relativeParagraphMeasurementCache = new LruCache(250);
    this.$p_keyCommands = defaultTextEditingKeyCommands;
    this.$p_commandRegister = combineCommandRegistersOverride<
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
    this.$p_undoControl = new LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(this.stateControl);
    this.add(this.$p_undoControl);
    this.$p_undoControl.registerCommands(this.$p_commandRegister);
    this.$p_graphemeSegmenter = new this.stateControl.stateControlConfig.IntlSegmenter();
  }
  private $p_listStyleInjectionControl!: ListStyleInjectionControl;
  private $p_commitDirtyChanges(): void {
    this.$p_listStyleInjectionControl.computeIndices();
    let paragraphId: string | null;
    while ((paragraphId = this.dirtyParagraphIdQueue.shift()) !== null) {
      const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
      const paragraphRenderControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
      const injectedStyle: ParagraphStyleInjection = {};
      this.$p_listStyleInjectionControl.injectStyle(paragraphReference, injectedStyle);
      paragraphRenderControl.commitDirtyChanges(injectedStyle);
    }
  }
  private $p_isDraggingSelection = false;
  private $p_endSelectionDrag$ = Distributor<undefined>();
  private $p_searchControl!: SingleParagraphPlainTextSearchControl;
  private $p_isSearchElementContainerVisible$ = CurrentValueDistributor<boolean>(false);
  private $p_searchElementSelectAllText$ = Distributor<undefined>();
  private $p_searchElementTrackAllControl: TrackAllControl | null = null;
  private $p_matchNumberMaybe$ = CurrentValueDistributor<Maybe<number>>(None);
  private $p_totalMatchesMaybe$ = CurrentValueDistributor<Maybe<TotalMatchesMessage>>(None);
  private $p_isSearchInComposition$ = CurrentValueDistributor<boolean>(false);
  private $p_renderOverlayAsync = false;
  private $p_changeQuery$ = Distributor<string>();
  private $p_selectionViewHasFocus$ = CurrentValueDistributor(false);
  private $p_resetSynchronizedCursorVisibility$ = CurrentValueDistributor<undefined>(undefined);
  private $p_inputControl!: FloatingVirtualizedTextInputControl;
  private $p_spellCheckControl: SpellCheckControl | null = null;
  private $p_spellingBoxQuickFixParagraphPoint$ = Distributor<matita.ParagraphPoint>();
  private $p_isSpellingBoxOpen = false;
  private $p_spellingBoxFocusedSuggestionIndex: number | null = null;
  private $p_moveSpellingBoxFocusedSuggestionIndexUpDown$ = Distributor<-1 | 1>();
  private $p_spellingBoxFixSpellingWithCurrentlyFocusedSuggestion$ = Distributor<undefined>();
  private $p_spellingBoxCancelCurrent$ = Distributor<undefined>();
  private $p_isToolbarOpen$ = CurrentValueDistributor<boolean>(false);
  private $p_closeToolbar$ = Distributor<unknown>();
  private $p_linkBoxRenderMessage$ = LastValueDistributor<LinkBoxRenderMessage | null>();
  private $p_linkDetailsRenderMessage$ = LastValueDistributor<LinkDetailsRenderMessage | null>();
  init(): void {
    this.$p_spellCheckControl = new SpellCheckControl(this.stateControl, this.topLevelContentReference);
    this.add(this.$p_spellCheckControl);
    this.$p_spellCheckControl.add(
      Disposable(() => {
        this.$p_spellCheckControl = null;
      }),
    );
    pipe(
      this.$p_spellCheckControl.didLoad$,
      subscribe((event) => {
        assert(event.type === EndType);
        this.stateControl.queueUpdate(() => {
          // HACK.
        });
      }, this),
    );
    this.$p_listStyleInjectionControl = new ListStyleInjectionControl(this.stateControl, this.viewControl, this.topLevelContentReference, (paragraphId) => {
      this.dirtyParagraphIdQueue.queue(paragraphId);
    });
    this.add(this.$p_listStyleInjectionControl);
    this.$p_containerHtmlElement = document.createElement('div');
    this.$p_toolbarContainerElement = document.createElement('div');
    this.$p_topLevelContentViewContainerElement = document.createElement('div');
    this.$p_selectionRectsViewContainerElement = document.createElement('div');
    this.$p_spellingMistakesOverlayContainerElement = document.createElement('div');
    this.$p_selectionCursorsViewContainerElement = document.createElement('div');
    this.$p_searchOverlayContainerElement = document.createElement('div');
    this.$p_spellingBoxElement = document.createElement('div');
    this.$p_linkBoxElement = document.createElement('div');
    this.$p_linkDetailsElement = document.createElement('div');
    this.$p_toolbarContainerElement.classList.add('toolbar');
    this.$p_topLevelContentViewContainerElement.style.paddingTop = '8px';
    pipe(
      this.stateControl.afterMutationPart$,
      map((message) => message.viewDelta),
      subscribe(this.$p_onViewDelta.bind(this), this),
    );
    pipe(this.stateControl.beforeUpdateBatch$, subscribe(this.$p_onBeforeUpdateBatch.bind(this), this));
    pipe(this.stateControl.afterUpdateBatch$, subscribe(this.$p_onAfterUpdateBatch.bind(this), this));
    pipe(this.stateControl.selectionChange$, subscribe(this.$p_onSelectionChange.bind(this), this));
    pipe(this.stateControl.customCollapsedSelectionTextConfigChange$, subscribe(this.$p_onCustomCollapsedSelectionTextConfigChange.bind(this), this));
    pipe(this.stateControl.afterMutationPart$, subscribe(this.$p_onAfterMutationPart.bind(this), this));
    const topLevelContentRenderControl = new VirtualizedContentRenderControl(this.topLevelContentReference, this.viewControl);
    this.viewControl.renderControlRegister.registerContentRenderControl(topLevelContentRenderControl);
    this.add(topLevelContentRenderControl);
    this.$p_inputControl = new FloatingVirtualizedTextInputControl(
      this.stateControl,
      this.$p_undoControl,
      this.runCommand.bind(this),
      () => this.$p_isDraggingSelection,
      () => {
        this.$p_endSelectionDrag$(Push(undefined));
      },
      () => this.makeActivatedSelectionSecondaryDataExpirationId(),
    );
    this.add(this.$p_inputControl);
    addEventListener(this.$p_inputControl.inputElement, 'focus', this.$p_onInputElementFocus.bind(this), this);
    addEventListener(this.$p_inputControl.inputElement, 'blur', this.$p_onInputElementBlur.bind(this), this);
    // TODO: Alt-pressing to drag new selection range while in composition breaks after as keys are cleared.
    addEventListener(this.$p_inputControl.inputElement, 'compositionend', this.$p_clearKeys.bind(this), this);
    addWindowEventListener('focus', () => this.$p_onWindowFocus.bind(this), this);
    addWindowEventListener('blur', this.$p_onWindowBlur.bind(this), this);
    const topLevelContentViewContainerElementReactiveResizeObserver = new ReactiveResizeObserver();
    this.add(topLevelContentViewContainerElementReactiveResizeObserver);
    const topLevelContentViewContentWidthResize$ = pipe(
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
      debounce(() => timer(400), true),
    );
    topLevelContentViewContainerElementReactiveResizeObserver.observe(this.$p_topLevelContentViewContainerElement, {
      box: 'border-box',
    });
    const pointerDownLeft$ = Distributor<PointerEvent>();
    const pointerUpLeft$ = Distributor<PointerEvent>();
    const filterLeft = filter<PointerEvent>((event) => event.pointerType === 'mouse' && event.button === 0);
    const mouseElements = [
      this.$p_topLevelContentViewContainerElement,
      this.$p_spellingMistakesOverlayContainerElement,
      this.$p_selectionRectsViewContainerElement,
      this.$p_selectionCursorsViewContainerElement,
      this.$p_searchOverlayContainerElement,
      this.$p_inputControl.inputElement,
    ];
    const mouseMove$ = Distributor<MouseEvent>();
    const mouseMoveElements = [...mouseElements, this.$p_spellingBoxElement];
    mouseMoveElements.forEach((element) => {
      pipe(
        fromReactiveValue<[MouseEvent]>((callback, disposable) => addEventListener(element, 'mousemove', callback, disposable, { passive: true })),
        map((args) => args[0]),
        subscribe(mouseMove$),
      );
    });
    const mouseLeave$ = pipe(
      fromReactiveValue<[MouseEvent]>((callback, disposable) =>
        addEventListener(this.$p_containerHtmlElement, 'mouseleave', callback, disposable, { passive: true }),
      ),
      map((args) => args[0]),
    );
    const spellingBoxRenderMessage$ = LastValueDistributor<SpellingBoxRenderMessage | null>();
    let didCancelMouseMove = false;
    let textDecorationInfos: TextDecorationInfo[] | null = null;
    const cancelSpellingBoxHandling = (): void => {
      didCancelMouseMove = true;
      requestAnimationFrameDisposable(() => {
        didCancelMouseMove = false;
      }, this);
      if (isSome(spellingBoxRenderMessage$.lastValue) && spellingBoxRenderMessage$.lastValue.value !== null) {
        spellingBoxRenderMessage$(Push(null));
        textDecorationInfos = null;
        this.$p_isSpellingBoxOpen = false;
        this.$p_spellingBoxFocusedSuggestionIndex = null;
        return;
      }
    };
    const scroll$ = pipe(
      fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
      share(),
    );
    const cancelMouseMove$ = pipe(
      fromArray<Source<unknown>>([
        pipe(
          mouseLeave$,
          filter(() => this.$p_spellingBoxFocusedSuggestionIndex === null),
        ),
        this.stateControl.afterMutationPart$,
        this.stateControl.selectionChange$,
        this.stateControl.customCollapsedSelectionTextConfigChange$,
        topLevelContentViewContentWidthResize$,
        fromReactiveValue<[globalThis.MouseEvent]>((callback, disposable) =>
          addEventListener(this.$p_toolbarContainerElement, 'mouseenter', callback, disposable, { passive: true }),
        ),
        fromReactiveValue<[globalThis.MouseEvent]>((callback, disposable) =>
          addEventListener(this.$p_linkBoxElement, 'mouseenter', callback, disposable, { passive: true }),
        ),
        fromReactiveValue<[globalThis.MouseEvent]>((callback, disposable) =>
          addEventListener(this.$p_linkDetailsElement, 'mouseenter', callback, disposable, { passive: true }),
        ),
      ]),
      flat(),
      share(),
    );
    pipe(
      cancelMouseMove$,
      subscribe((event) => {
        assert(event.type === PushType);
        cancelSpellingBoxHandling();
      }, this),
    );
    const spellingBoxRef = createRef<HTMLDivElement>();
    pipe(
      mouseMove$,
      subscribe<MouseEvent>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        if (
          didCancelMouseMove ||
          isNone(spellingBoxRenderMessage$.lastValue) ||
          spellingBoxRenderMessage$.lastValue.value === null ||
          spellingBoxRef.current === null
        ) {
          return;
        }
        assertIsNotNullish(textDecorationInfos);
        const mouseMoveEvent = event.value;
        const viewPosition: ViewPosition = {
          left: mouseMoveEvent.x,
          top: mouseMoveEvent.y,
        };
        const spellingBoxElement = spellingBoxRef.current;
        const spellingBoxBoundingRect = spellingBoxElement.getBoundingClientRect();
        if (
          spellingBoxBoundingRect.left <= viewPosition.left &&
          viewPosition.left <= spellingBoxBoundingRect.right &&
          spellingBoxBoundingRect.top <= viewPosition.top &&
          viewPosition.top <= spellingBoxBoundingRect.bottom
        ) {
          if (this.$p_spellingBoxFocusedSuggestionIndex === null) {
            return;
          }
          this.$p_spellingBoxFocusedSuggestionIndex = null;
          spellingBoxRenderMessage$(
            Push({
              ...spellingBoxRenderMessage$.lastValue.value,
              focusedSuggestionIndex: null,
            }),
          );
          return;
        }
        if (this.$p_spellingBoxFocusedSuggestionIndex !== null) {
          return;
        }
        const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
        const relativeViewPosition: ViewPosition = {
          left: viewPosition.left + relativeOffsetLeft,
          top: viewPosition.top + relativeOffsetTop,
        };
        for (let i = 0; i < textDecorationInfos.length; i++) {
          const textDecorationInfo = textDecorationInfos[i];
          const { charactersLineBoundingRectangle } = textDecorationInfo;
          if (
            charactersLineBoundingRectangle.left <= relativeViewPosition.left &&
            relativeViewPosition.left <= charactersLineBoundingRectangle.right &&
            charactersLineBoundingRectangle.top <= relativeViewPosition.top &&
            relativeViewPosition.top <= charactersLineBoundingRectangle.bottom
          ) {
            return;
          }
        }
        cancelSpellingBoxHandling();
      }, this),
    );
    pipe(
      this.$p_moveSpellingBoxFocusedSuggestionIndexUpDown$,
      subscribe<-1 | 1>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const moveDirection = event.value;
        if (
          this.$p_spellingBoxFocusedSuggestionIndex === null ||
          this.$p_spellingBoxFocusedSuggestionIndex === -1 ||
          isNone(spellingBoxRenderMessage$.lastValue) ||
          spellingBoxRenderMessage$.lastValue.value === null
        ) {
          throwUnreachable();
        }
        const suggestionsCount = spellingBoxRenderMessage$.lastValue.value.suggestions.length;
        assert(suggestionsCount > 0);
        this.$p_spellingBoxFocusedSuggestionIndex =
          (this.$p_spellingBoxFocusedSuggestionIndex + moveDirection + suggestionsCount) % spellingBoxRenderMessage$.lastValue.value.suggestions.length;
        spellingBoxRenderMessage$(
          Push({
            ...spellingBoxRenderMessage$.lastValue.value,
            focusedSuggestionIndex: this.$p_spellingBoxFocusedSuggestionIndex,
          }),
        );
      }, this),
    );
    pipe(
      this.$p_spellingBoxFixSpellingWithCurrentlyFocusedSuggestion$,
      subscribe((event) => {
        assert(event.type === PushType);
        if (
          this.$p_spellingBoxFocusedSuggestionIndex === null ||
          this.$p_spellingBoxFocusedSuggestionIndex === -1 ||
          isNone(spellingBoxRenderMessage$.lastValue) ||
          spellingBoxRenderMessage$.lastValue.value === null ||
          spellingBoxRenderMessage$.lastValue.value.suggestions.length === 0
        ) {
          throwUnreachable();
        }
        const replacementSuggestion = spellingBoxRenderMessage$.lastValue.value.suggestions[this.$p_spellingBoxFocusedSuggestionIndex];
        assertIsNotNullish(replacementSuggestion);
        spellingBoxRenderMessage$.lastValue.value.replaceWith(replacementSuggestion);
      }, this),
    );
    pipe(
      this.$p_spellingBoxCancelCurrent$,
      subscribe((event) => {
        assert(event.type === PushType);
        cancelSpellingBoxHandling();
      }, this),
    );
    const handleSpellingBoxParagraphPointWithIsPastPreviousCharacterHalfPoint = (
      paragraphPoint: matita.ParagraphPoint,
      isPastPreviousCharacterHalfPoint: boolean | null,
    ): void => {
      assertIsNotNullish(this.$p_spellCheckControl);
      const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(paragraphPoint);
      const { offset } = paragraphPoint;
      const spellingMistakes = this.$p_spellCheckControl.getSpellingMistakesInParagraphAtParagraphReference(paragraphReference);
      if (spellingMistakes === null) {
        return;
      }
      let hoveredSpellingMistake: ParagraphSpellingMistake | undefined;
      for (let i = 0; i < spellingMistakes.length; i++) {
        const spellingMistake = spellingMistakes[i];
        const { startOffset, endOffset } = spellingMistake;
        if (
          isPastPreviousCharacterHalfPoint === null
            ? startOffset <= offset && offset <= endOffset
            : (startOffset < offset && offset < endOffset) || (isPastPreviousCharacterHalfPoint ? offset === endOffset : offset === startOffset)
        ) {
          hoveredSpellingMistake = spellingMistake;
          break;
        }
      }
      if (hoveredSpellingMistake === undefined) {
        return;
      }
      const hoveredSpellingMistakeStartOffset = hoveredSpellingMistake.startOffset;
      const hoveredSpellingMistakeEndOffset = hoveredSpellingMistake.endOffset;
      const misspelledWord = matita
        .sliceParagraphChildren(
          matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, paragraphPoint),
          hoveredSpellingMistakeStartOffset,
          hoveredSpellingMistakeEndOffset,
        )
        .map((textNode) => {
          matita.assertIsText(textNode);
          return textNode.text;
        })
        .join('');
      const suggestions = this.$p_spellCheckControl.suggestMisspelledWord(misspelledWord);
      const { visibleLeft, visibleRight } = this.$p_getVisibleLeftAndRight();
      const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
      const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
      const visibleBoundingRect = makeViewRectangle(relativeOffsetLeft, relativeOffsetTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
      textDecorationInfos = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
        paragraphReference,
        hoveredSpellingMistakeStartOffset,
        hoveredSpellingMistakeEndOffset,
        this.$p_getContainerScrollWidth(),
        relativeOffsetLeft,
        relativeOffsetTop,
        paragraphMeasurement,
      );
      const wordBoundingRect = this.$p_makeWordBoundingRect(textDecorationInfos);
      const paragraphLength = matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, paragraphPoint));
      const fixedSuggestions = suggestions.filter((suggestion) => {
        const words = suggestion.normalize().toLowerCase().split(/[ -]/g);
        return words.every(
          (word, i) => word.length > 2 || (i === 0 && (word === 'a' || word === 'i')) || (word.length === 2 && commonTwoLetterWords.has(word)),
        );
      });
      this.$p_closeToolbarAndFocus();
      this.$p_isSpellingBoxOpen = true;
      this.$p_spellingBoxFocusedSuggestionIndex = isPastPreviousCharacterHalfPoint === null ? (suggestions.length === 0 ? -1 : 0) : null;
      this.$p_undoControl.forceNextChange(() => true);
      spellingBoxRenderMessage$(
        Push({
          misspelledWord,
          suggestions: fixedSuggestions,
          visibleBoundingRect,
          wordBoundingRect,
          replaceWith: (suggestion) => {
            this.stateControl.queueUpdate(
              () => {
                this.$p_inputControl.focusButDoNotScrollTo();
                let paragraph: matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig>;
                try {
                  paragraph = matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, paragraphPoint);
                } catch (error) {
                  return;
                }
                const paragraphLengthNow = matita.getParagraphLength(paragraph);
                if (paragraphLength !== paragraphLengthNow) {
                  return;
                }
                const inlineNodesWhereWordShouldBe = matita.sliceParagraphChildren(
                  paragraph,
                  hoveredSpellingMistakeStartOffset,
                  hoveredSpellingMistakeEndOffset,
                );
                if (
                  !inlineNodesWhereWordShouldBe.every(matita.isText) ||
                  inlineNodesWhereWordShouldBe.map((textNode) => textNode.text).join('') !== misspelledWord
                ) {
                  return;
                }
                const spellingMistakeStartPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(
                  paragraphReference,
                  hoveredSpellingMistakeStartOffset,
                );
                const spellingMistakeEndPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, hoveredSpellingMistakeEndOffset);
                const replaceRange = matita.makeRange(
                  matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference)),
                  spellingMistakeStartPoint,
                  spellingMistakeEndPoint,
                  matita.generateId(),
                );
                const currentSelectionRangeIds = new Set(this.stateControl.stateView.selection.selectionRanges.map((selectionRange) => selectionRange.id));
                this.stateControl.delta.applyUpdate(() => {
                  this.stateControl.delta.applyMutation(
                    matita.makeSpliceParagraphMutation(spellingMistakeStartPoint, hoveredSpellingMistakeEndOffset - hoveredSpellingMistakeStartOffset, [
                      matita.makeText(
                        getInsertTextConfigAtSelectionRange(
                          this.stateControl.stateView.document,
                          this.stateControl.stateView.customCollapsedSelectionTextConfig,
                          matita.makeSelectionRange(
                            [replaceRange],
                            replaceRange.id,
                            replaceRange.id,
                            matita.SelectionRangeIntention.Text,
                            {},
                            matita.generateId(),
                          ),
                        ),
                        suggestion,
                      ),
                    ]),
                    undefined,
                    (selectionRange) => {
                      if (!currentSelectionRangeIds.has(selectionRange.id) || !matita.isSelectionRangeCollapsedInText(selectionRange)) {
                        return undefined;
                      }
                      const collapsedRange = selectionRange.ranges[0];
                      const paragraphPoint = collapsedRange.startPoint;
                      matita.assertIsParagraphPoint(paragraphPoint);
                      if (!matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(paragraphPoint), paragraphReference)) {
                        return undefined;
                      }
                      let newOffset: number;
                      if (paragraphPoint.offset <= hoveredSpellingMistakeStartOffset) {
                        newOffset = paragraphPoint.offset;
                      } else if (paragraphPoint.offset > hoveredSpellingMistakeEndOffset) {
                        newOffset = paragraphPoint.offset + suggestion.length - (hoveredSpellingMistakeEndOffset - hoveredSpellingMistakeStartOffset);
                      } else {
                        newOffset = hoveredSpellingMistakeStartOffset + suggestion.length;
                      }
                      const newPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, newOffset);
                      const newRange = matita.makeRange(collapsedRange.contentReference, newPoint, newPoint, collapsedRange.id);
                      return matita.makeSelectionRange([newRange], newRange.id, newRange.id, selectionRange.intention, selectionRange.data, selectionRange.id);
                    },
                  );
                });
              },
              { [doNotScrollToSelectionAfterChangeDataKey]: true },
            );
          },
          focusedSuggestionIndex: this.$p_spellingBoxFocusedSuggestionIndex,
        }),
      );
    };
    pipe(
      mouseMove$,
      debounce(() => pipe(timer(250), takeUntil(cancelMouseMove$))),
      subscribe<MouseEvent>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const mouseMoveEvent = event.value;
        if (
          didCancelMouseMove ||
          mouseMoveEvent.buttons !== 0 ||
          this.$p_spellCheckControl === null ||
          !this.$p_spellCheckControl.getIsLoaded() ||
          (isSome(spellingBoxRenderMessage$.lastValue) && spellingBoxRenderMessage$.lastValue.value !== null)
        ) {
          return;
        }
        const viewPosition: ViewPosition = {
          left: mouseMoveEvent.x,
          top: mouseMoveEvent.y,
        };
        const position = this.$p_calculatePositionFromViewPosition(viewPosition, false, false, true);
        if (position === null) {
          return;
        }
        if (position.type !== HitPositionType.ParagraphText) {
          throwUnreachable();
        }
        const { isPastPreviousCharacterHalfPoint } = position;
        const { point } = position.pointWithContentReference;
        if (!matita.isParagraphPoint(point)) {
          return;
        }
        handleSpellingBoxParagraphPointWithIsPastPreviousCharacterHalfPoint(point, isPastPreviousCharacterHalfPoint);
      }, this),
    );
    pipe(
      this.$p_spellingBoxQuickFixParagraphPoint$,
      subscribe<matita.ParagraphPoint>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const paragraphPoint = event.value;
        cancelSpellingBoxHandling();
        handleSpellingBoxParagraphPointWithIsPastPreviousCharacterHalfPoint(paragraphPoint, null);
      }, this),
    );
    mouseElements.forEach((element) => {
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
          if (pointInfo.position.type === HitPositionType.CheckboxMarker) {
            try {
              matita.accessBlockFromBlockReference(this.stateControl.stateView.document, pointInfo.position.paragraphReference);
            } catch (error) {
              if (!(error instanceof matita.BlockNotInBlockStoreError)) {
                throw error;
              }
              return null;
            }
            return {
              point: matita.makeBlockPointFromBlockReference(pointInfo.position.paragraphReference),
              contentReference: matita.makeContentReferenceFromContent(
                matita.accessContentFromBlockReference(this.stateControl.stateView.document, pointInfo.position.paragraphReference),
              ),
            };
          }
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
            const position = this.$p_calculatePositionFromViewPosition(viewPosition, false, true);
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
              this.$p_isDraggingSelection = false;
              endSelectionDragDisposable.dispose();
              currentDebounceTimer$(End);
            };
            const currentDebounceSinkChildDisposable = Disposable(() => {
              pointerCaptureDisposable.add(endSelectionDragDisposable);
            });
            endSelectionDragDisposable.add(currentDebounceSinkChildDisposable);
            currentDebounceSink.add(currentDebounceSinkChildDisposable);
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
              this.$p_endSelectionDrag$,
              subscribe((event) => {
                assert(event.type === PushType);
                endSelectionDrag();
              }, endSelectionDragDisposable),
            );
            pipe(
              this.$p_keyDown$,
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
                const position = this.$p_calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold, false);
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
            const isExtendSelection = this.$p_keyDownSet.has('Shift');
            if (dragState) {
              dragState.selectionType = selectionType;
              dragState.lastViewPosition = viewPosition;
              dragState.isExtendSelection = isExtendSelection;
            }
            const pointerMove$ = pipe(
              fromArray(
                mouseElements.map((element) => {
                  return pipe(
                    fromReactiveValue<[PointerEvent]>((callback, disposable) => addEventListener(element, 'pointermove', callback, disposable)),
                    map((args) => args[0]),
                  );
                }),
              ),
              flat(),
            );
            let isMovedPastThreshold = false;
            const enum CalculateDraggingResultType {
              ToggleCheckbox = 'ToggleCheckbox',
              Selection = 'Selection',
            }
            type CalculateDraggingResult =
              | {
                  type: CalculateDraggingResultType.ToggleCheckbox;
                  paragraphReference: matita.BlockReference;
                }
              | {
                  type: CalculateDraggingResultType.Selection;
                  selection: matita.Selection;
                };
            const calculateDraggingResult = (endPointInfo: PointInfo | null): CalculateDraggingResult | null => {
              assertIsNotNullish(dragState);
              const transformedBeforeSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                { selection: dragState.beforeSelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix, shouldTransformAsSelection: true },
                dragState.startPointInfo.stateView,
                this.stateControl.stateView,
              );
              const finalPointInfo = endPointInfo ?? dragState.lastPointInfo;
              if (dragState.startPointInfo.position.type === HitPositionType.CheckboxMarker) {
                const startPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.startPointInfo);
                if (!startPointWithContentReference) {
                  return null;
                }
                matita.assertIsBlockPoint(startPointWithContentReference.point);
                const paragraph = matita.accessBlockFromBlockPoint(this.stateControl.stateView.document, startPointWithContentReference.point);
                matita.assertIsParagraph(paragraph);
                const topLevelContent = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
                if (
                  paragraph.config.type !== ParagraphType.ListItem ||
                  accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config) !== AccessedListStyleType.Checklist
                ) {
                  return null;
                }
                assert(typeof paragraph.config.ListItem_listId === 'string');
                const lastCheckboxMarkerParagraphReference =
                  finalPointInfo.position.type === HitPositionType.CheckboxMarker
                    ? finalPointInfo.position.paragraphReference
                    : finalPointInfo.position.checkboxMarkerParagraphReference;
                if (
                  lastCheckboxMarkerParagraphReference !== null &&
                  matita.areBlockReferencesAtSameBlock(dragState.startPointInfo.position.paragraphReference, lastCheckboxMarkerParagraphReference)
                ) {
                  if (endPointInfo === null) {
                    return null;
                  }
                  return {
                    type: CalculateDraggingResultType.ToggleCheckbox,
                    paragraphReference: dragState.startPointInfo.position.paragraphReference,
                  };
                }
                return null;
              }
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
              if (finalPointInfo.position.type === HitPositionType.CheckboxMarker) {
                throwUnreachable();
              }
              const originalIsWrappedLineStart = finalPointInfo.position.isWrappedLineStart;
              const originalIsWrappedLinePreviousEnd = finalPointInfo.position.isWrappedLinePreviousEnd;
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
                let isBackwards =
                  matita.compareKeys(this.stateControl.stateView.document, originalStartPointKey, originalEndPointKey) === matita.CompareKeysResult.After;
                let firstPointWithContentReference = isBackwards ? originalEndPointWithContentReference : originalStartPointWithContentReference;
                let secondPointWithContentReference = isBackwards ? originalStartPointWithContentReference : originalEndPointWithContentReference;
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
                      dummyFirstRange,
                      secondPointWithContentReference.point,
                      dummyFirstSelectionRange,
                    );
                  }
                  if (
                    isBackwards &&
                    matita.arePointWithContentReferencesEqual(
                      firstPointWithContentReference,
                      matita.makeDefaultPointTransformFn(matita.MovementGranularity.WordBoundary, matita.PointMovement.Previous)(
                        this.stateControl.stateView.document,
                        this.stateControl.stateControlConfig,
                        dummySecondRange,
                        secondPointWithContentReference.point,
                        dummySecondSelectionRange,
                      ),
                    )
                  ) {
                    isBackwards = false;
                  }
                  isFocusWrappedLineStart = originalIsWrappedLineStart
                    ? isBackwards
                      ? matita.arePointWithContentReferencesEqual(originalFirstPointWithContentReference, firstPointWithContentReference)
                      : matita.arePointWithContentReferencesEqual(originalSecondPointWithContentReference, secondPointWithContentReference)
                    : isBackwards && !originalIsWrappedLinePreviousEnd;
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
                    dummySecondRange,
                    secondPointWithContentReference.point,
                    dummySecondSelectionRange,
                  );
                  matita.assertIsParagraphPoint(firstPointWithContentReference.point);
                  matita.assertIsParagraphPoint(secondPointWithContentReference.point);
                  if (isBackwards && matita.areParagraphPointsAtSameParagraph(firstPointWithContentReference.point, secondPointWithContentReference.point)) {
                    isBackwards = false;
                  }
                  isFocusWrappedLineStart = false;
                }
                startPointWithContentReference = isBackwards ? secondPointWithContentReference : firstPointWithContentReference;
                endPointWithContentReference = isBackwards ? firstPointWithContentReference : secondPointWithContentReference;
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
                return { type: CalculateDraggingResultType.Selection, selection: matita.makeSelection([draggedSelectionRange]) };
              }
              if (isSome(extendedSelectionRangeIdMaybe)) {
                const extendedSelectionRangeId = extendedSelectionRangeIdMaybe.value;
                return {
                  type: CalculateDraggingResultType.Selection,
                  selection: matita.sortAndMergeAndFixSelectionRanges(
                    this.stateControl.stateView.document,
                    this.stateControl.stateControlConfig,
                    [
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      ...transformedBeforeSelection.selectionRanges.filter((selectionRange) => selectionRange.id !== extendedSelectionRangeId),
                      draggedSelectionRange,
                    ],
                    (info) => resolveOverlappingSelectionRanges(info, extendedSelectionRangeId),
                  ),
                };
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
                  return { type: CalculateDraggingResultType.Selection, selection: matita.makeSelection(withoutCollapsedAtSameSpotSelectionRanges) };
                }
              }
              return {
                type: CalculateDraggingResultType.Selection,
                selection: matita.sortAndMergeAndFixSelectionRanges(
                  this.stateControl.stateView.document,
                  this.stateControl.stateControlConfig,
                  [...transformedBeforeSelection.selectionRanges, draggedSelectionRange],
                  (info) => resolveOverlappingSelectionRanges(info, draggedSelectionRange.id),
                ),
              };
            };
            const queueSelectionUpdate = (endPointInfo: PointInfo | null): void => {
              this.$p_isDraggingSelection = !endPointInfo;
              this.stateControl.queueUpdate(() => {
                if (didEndSelectionDragManually) {
                  return;
                }
                const calculatedDraggingResult = calculateDraggingResult(endPointInfo);
                if (calculatedDraggingResult === null) {
                  this.$p_inputControl.focusButDoNotScrollTo();
                  endPointInfo = null;
                  return;
                }
                if (calculatedDraggingResult.type === CalculateDraggingResultType.ToggleCheckbox) {
                  assertIsNotNullish(endPointInfo);
                  const point = matita.makeBlockPointFromBlockReference(calculatedDraggingResult.paragraphReference);
                  const contentReference = matita.makeContentReferenceFromContent(
                    matita.accessContentFromBlockReference(this.stateControl.stateView.document, calculatedDraggingResult.paragraphReference),
                  );
                  const range = matita.makeRange(contentReference, point, point, matita.generateId());
                  const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Block, {}, matita.generateId());
                  const selection = matita.makeSelection([selectionRange]);
                  this.stateControl.delta.applyUpdate(
                    makeToggleChecklistCheckedAtSelectionUpdateFn(this.stateControl, this.topLevelContentReference, 'individually', selection),
                    { [doNotScrollToSelectionAfterChangeDataKey]: true },
                  );
                  return;
                }
                const newSelection = calculatedDraggingResult.selection;
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
                const position = this.$p_calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold, false);
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
            const separateSelectionId = this.$p_keyDownSet.get('Alt');
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
    this.$p_commitDirtyChanges();
    this.$p_topLevelContentViewContainerElement.appendChild(topLevelContentRenderControl.containerHtmlElement);
    const renderReactNodeIntoHtmlContainerElement = (element: React.ReactNode, containerElement: HTMLElement): void => {
      const root = createRoot(containerElement);
      root.render(element);
      this.add(
        Disposable(() => {
          root.unmount();
        }),
      );
    };
    pipe(
      fromArray([
        this.stateControl.afterMutationPart$,
        this.stateControl.selectionChange$,
        this.stateControl.customCollapsedSelectionTextConfigChange$,
        pipe(
          this.$p_selectionViewHasFocus$,
          filter<boolean>((hasFocus) => hasFocus),
        ),
        pipe(
          this.$p_isSearchElementContainerVisible$,
          filter<boolean>((isVisible) => isVisible),
        ),
      ]),
      flat()<unknown>,
      subscribe(this.$p_closeToolbar$),
    );
    const toolbarResetFocusSink = Sink((event) => {
      assert(event.type === PushType);
      this.$p_inputControl.focusButDoNotScrollTo();
    });
    pipe(
      this.$p_isToolbarOpen$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const isToolbarOpen = event.value;
        if (!isToolbarOpen) {
          return;
        }
        if (this.$p_isSearchElementContainerVisible$.currentValue) {
          this.$p_isSearchElementContainerVisible$(Push(false));
        }
        this.$p_closeLinkBox();
      }, this),
    );
    pipe(
      topLevelContentViewContentWidthResize$,
      subscribe(() => {
        this.$p_closeLinkBox();
      }, this),
    );
    renderReactNodeIntoHtmlContainerElement(
      <Toolbar
        close$={this.$p_closeToolbar$}
        isToolbarOpenSink={this.$p_isToolbarOpen$}
        resetFocusSink={toolbarResetFocusSink}
        runCommand={this.runCommand.bind(this)}
      />,
      this.$p_toolbarContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(
      <SelectionView
        selectionView$={this.$p_selectionView$}
        hasFocus$={this.$p_selectionViewHasFocus$}
        resetSynchronizedCursorVisibility$={this.$p_resetSynchronizedCursorVisibility$}
        cursorElement={this.$p_selectionCursorsViewContainerElement}
      />,
      this.$p_selectionRectsViewContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(
      <SpellingMistakesOverlay spellingMistakeOverlay$={this.$p_spellingMistakesOverlay$} />,
      this.$p_spellingMistakesOverlayContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(<SearchOverlay searchOverlay$={this.$p_searchOverlay$} />, this.$p_searchOverlayContainerElement);
    renderReactNodeIntoHtmlContainerElement(
      <SpellingBox renderMessage$={spellingBoxRenderMessage$} spellingBoxRef={spellingBoxRef} />,
      this.$p_spellingBoxElement,
    );
    renderReactNodeIntoHtmlContainerElement(<LinkBox renderMessage$={this.$p_linkBoxRenderMessage$} />, this.$p_linkBoxElement);
    renderReactNodeIntoHtmlContainerElement(<LinkDetails renderMessage$={this.$p_linkDetailsRenderMessage$} />, this.$p_linkDetailsElement);
    pipe(
      this.stateControl.beforeRunUpdate$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const { updateDataStack } = event.value;
        if (updateDataStack.some((updateData) => updateData[keepFloatingLinkBoxOpenUpdateKey])) {
          return;
        }
        this.$p_closeLinkBox();
      }, this),
    );
    this.$p_searchElementContainerElement = document.createElement('div');
    this.$p_containerHtmlElement.style.position = 'relative';
    this.$p_containerHtmlElement.append(
      this.$p_toolbarContainerElement,
      this.$p_inputControl.inputElement,
      this.$p_searchOverlayContainerElement,
      this.$p_selectionRectsViewContainerElement,
      this.$p_spellingMistakesOverlayContainerElement,
      this.$p_topLevelContentViewContainerElement,
      this.$p_selectionCursorsViewContainerElement,
      this.$p_linkDetailsElement,
      this.$p_searchElementContainerElement,
      this.$p_linkBoxElement,
      this.$p_spellingBoxElement,
    );
    let searchContainerWidth$: CurrentValueDistributor<number> | undefined;
    const getContainerWidth = (): number => {
      return this.$p_topLevelContentViewContainerElement.offsetWidth;
    };
    const initialGoToSearchResultImmediately = true;
    const initialQuery = '';
    const initialSearchControlConfig: SingleParagraphPlainTextSearchControlConfig = {
      ignoreCase: true,
      ignoreDiacritics: true,
      stripNonLettersAndNumbers: false,
      searchQueryWordsIndividually: false,
      wholeWords: false,
      replaceSimilarLooking: true,
    };
    this.$p_searchControl = new SingleParagraphPlainTextSearchControl(
      this.stateControl,
      initialQuery,
      initialSearchControlConfig,
      this.topLevelContentReference,
    );
    this.add(this.$p_searchControl);
    pipe(
      this.$p_isSearchElementContainerVisible$,
      skip(1),
      memoConsecutive<boolean>((previous, current) => previous === current),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const isVisible = event.value;
        this.$p_totalMatchesMaybe$(Push(None));
        if (isVisible) {
          assert(this.$p_searchElementTrackAllControl === null);
          this.$p_searchElementTrackAllControl = this.$p_searchControl.trackAll();
          pipe(
            this.$p_searchElementTrackAllControl.totalMatches$,
            map((value) => Some(value)),
            subscribe(this.$p_totalMatchesMaybe$),
          );
        } else {
          assertIsNotNullish(this.$p_searchElementTrackAllControl);
          this.$p_searchElementTrackAllControl.dispose();
          this.$p_searchElementTrackAllControl = null;
        }
      }, this.$p_searchControl),
    );
    requestAnimationFrameDisposable(() => {
      searchContainerWidth$ = CurrentValueDistributor(getContainerWidth());
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
        if (!goToSearchResultImmediately || !this.$p_searchElementTrackAllControl) {
          return;
        }
        assertIsNotNullish(goToSearchResultImmediatelyCancelDisposable);
        if (anchoredStateView === null) {
          if (!this.$p_isInSearchBox()) {
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
        const match$ = this.$p_searchElementTrackAllControl.wrapCurrentAlwaysOrFindNextMatch(findFromSelectionRange, matchDisposable);
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
              this.$p_useSearchScrollMargins = true;
              this.stateControl.delta.setSelection(selection, undefined, { [SearchQueryGoToSearchResultImmediatelyKey]: true });
            };
            if (this.stateControl.isInUpdate) {
              this.stateControl.delta.applyUpdate(updateFn);
            } else {
              this.$p_renderOverlayAsync = true;
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
          this.$p_renderOverlayAsync = true;
          this.$p_searchControl.config = newConfig;
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
          this.$p_renderOverlayAsync = true;
          this.$p_searchControl.query = query;
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
          isVisible$={this.$p_isSearchElementContainerVisible$}
          selectAllText$={this.$p_searchElementSelectAllText$}
          onAfterSelectAll={() => {
            this.$p_isSearchSelectAllTextWaiting = false;
          }}
          containerWidth$={searchContainerWidth$}
          goToSearchResultImmediatelySink={goToSearchResultImmediatelySink}
          querySink={searchQuerySink}
          configSink={searchConfigSink}
          goToPreviousMatchSink={goToPreviousMatchSink}
          goToNextMatchSink={goToNextMatchSink}
          closeSink={closeSearchSink}
          isInCompositionSink={this.$p_isSearchInComposition$}
          changeQuery$={this.$p_changeQuery$}
          matchNumberMaybe$={this.$p_matchNumberMaybe$}
          totalMatchesMaybe$={this.$p_totalMatchesMaybe$}
          initialGoToSearchResultImmediately={initialGoToSearchResultImmediately}
          initialQuery={initialQuery}
          initialConfig={{
            type: SearchBoxConfigType.SingleParagraphPlainText,
            config: initialSearchControlConfig,
          }}
          inputRef={this.$p_searchInputRef}
        />,
        this.$p_searchElementContainerElement,
      );
    }, this);
    this.rootHtmlElement.append(this.$p_containerHtmlElement);
    // TODO.
    const scrollAndResize$ = pipe(
      fromArray([
        topLevelContentViewContentWidthResize$,
        pipe(
          scroll$,
          throttle(() => timer(16)),
        ),
      ]),
      flat()<unknown>,
    );
    pipe(
      fromArray([
        this.$p_isSearchElementContainerVisible$,
        pipe(
          this.$p_isSearchElementContainerVisible$,
          map((isVisible) => (isVisible ? scrollAndResize$ : empty$)),
          switchEach,
        ),
      ]),
      flat(),
      subscribe(this.$p_replaceVisibleSearchResults.bind(this), this),
    );
    pipe(scrollAndResize$, subscribe(this.$p_replaceVisibleSpellingMistakes.bind(this), this));
    // TODO.
    pipe(scrollAndResize$, subscribe(this.$p_syncFloatingLinkDetails.bind(this), this));
    pipe(
      topLevelContentViewContentWidthResize$,
      map(getContainerWidth),
      memoConsecutive(),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        searchContainerWidth$?.(event);
      }, this),
    );
    pipe(
      fromArray([
        topLevelContentViewContentWidthResize$,
        pipe(
          fromReactiveValue((callback, disposable) => {
            if (isSafari) {
              const calculateKey = (): string => {
                return `${document.fonts.size}|${Array.from(document.fonts.values(), (fontFace) => fontFace.status).join(',')}`;
              };
              let lastKey = calculateKey();
              setIntervalDisposable(
                () => {
                  const key = calculateKey();
                  if (key !== lastKey) {
                    lastKey = key;
                    callback();
                  }
                },
                1000,
                disposable,
              );
              return;
            }
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
        this.$p_replaceVisibleSearchResults();
        this.$p_replaceVisibleSpellingMistakes();
        this.$p_replaceViewSelectionRanges(true);
        this.$p_syncFloatingLinkDetails();
      }, this),
    );
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
    addWindowEventListener('keydown', this.$p_onGlobalKeyDown.bind(this), this);
    addWindowEventListener('keyup', this.$p_onGlobalKeyUp.bind(this), this);
  }
  private $p_closeToolbarAndFocus(): void {
    this.$p_closeToolbar$(Push(undefined));
    this.$p_inputControl.focusButDoNotScrollTo();
  }
  private $p_makeWordBoundingRect(textDecorationInfos: TextDecorationInfo[]): ViewRectangle {
    assert(textDecorationInfos.length > 0);
    const firstTextDecorationInfo = textDecorationInfos[0];
    let wordBoundingRectLeft = firstTextDecorationInfo.charactersBoundingRectangle.left;
    let wordBoundingRectTop = firstTextDecorationInfo.charactersBoundingRectangle.top;
    let wordBoundingRectBottom = firstTextDecorationInfo.charactersBoundingRectangle.bottom;
    let wordBoundingRectRight = firstTextDecorationInfo.charactersBoundingRectangle.right;
    for (let i = 0; i < textDecorationInfos.length; i++) {
      const textDecorationInfo = textDecorationInfos[i];
      const { charactersBoundingRectangle } = textDecorationInfo;
      if (charactersBoundingRectangle.left < wordBoundingRectLeft) {
        wordBoundingRectLeft = charactersBoundingRectangle.left;
      }
      if (charactersBoundingRectangle.top < wordBoundingRectTop) {
        wordBoundingRectTop = charactersBoundingRectangle.top;
      }
      if (charactersBoundingRectangle.right > wordBoundingRectRight) {
        wordBoundingRectRight = charactersBoundingRectangle.right;
      }
      if (charactersBoundingRectangle.bottom > wordBoundingRectBottom) {
        wordBoundingRectBottom = charactersBoundingRectangle.bottom;
      }
    }
    const wordBoundingRect = makeViewRectangle(
      wordBoundingRectLeft,
      wordBoundingRectTop,
      wordBoundingRectRight - wordBoundingRectLeft,
      wordBoundingRectBottom - wordBoundingRectTop,
    );
    return wordBoundingRect;
  }
  $p_isLinkBoxOpen(): boolean {
    return isSome(this.$p_linkBoxRenderMessage$.lastValue) && this.$p_linkBoxRenderMessage$.lastValue.value !== null;
  }
  $p_closeLinkBox(): void {
    if (this.$p_isLinkBoxOpen()) {
      this.$p_linkBoxRenderMessage$(Push(null));
    }
  }
  private $p_makeWordBoundingRectMightBeEmpty(textDecorationInfos: TextDecorationInfo[], relativeOffsetLeft: number, relativeOffsetTop: number): ViewRectangle {
    if (textDecorationInfos.length > 0) {
      return this.$p_makeWordBoundingRect(textDecorationInfos);
    }
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    assertIsNotNullish(focusSelectionRange);
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    const focusPoint = matita.getFocusPointFromRange(focusRange);
    matita.assertIsParagraphPoint(focusPoint);
    const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(focusSelectionRange.data);
    const isMarkedLineWrapToNextLine =
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
      this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId);
    const cursorInfo = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(focusPoint, isMarkedLineWrapToNextLine);
    return makeViewRectangle(cursorInfo.position.left + relativeOffsetLeft, cursorInfo.position.top + relativeOffsetTop, 0, cursorInfo.height);
  }
  openFloatingLinkBoxAtSelection(startValues?: { text: string; link: string }): matita.RunUpdateFn {
    return () => {
      surroundNearestLink: if (!startValues) {
        const linkDetailsInfo = this.$p_getFloatingLinkDetailsInfo();
        if (linkDetailsInfo === null) {
          break surroundNearestLink;
        }
        // TODO.
        const contentReference = matita.makeContentReferenceFromContent(
          matita.accessContentFromBlockReference(this.stateControl.stateView.document, linkDetailsInfo.paragraphReference),
        );
        const startPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.paragraphReference, linkDetailsInfo.startOffset);
        const endPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.paragraphReference, linkDetailsInfo.endOffset);
        const range = matita.makeRange(contentReference, startPoint, endPoint, matita.generateId());
        const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
        const selection = matita.makeSelection([selectionRange]);
        startValues = {
          text: linkDetailsInfo.text,
          link: linkDetailsInfo.link,
        };
        this.stateControl.delta.setSelection(selection);
      }
      if (this.$p_isSpellingBoxOpen) {
        this.$p_spellingBoxCancelCurrent$(Push(undefined));
      }
      const selection = this.stateControl.stateView.selection;
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
      if (focusSelectionRange === null) {
        return;
      }
      this.$p_scrollSelectionIntoView();
      const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
      let hasSeenFocusRange = false;
      let isCoveringText = false;
      const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
      let containerWidth_: number | undefined;
      const containerWidth = (): number => {
        if (containerWidth_ === undefined) {
          containerWidth_ = this.$p_getContainerScrollWidth();
        }
        return containerWidth_;
      };
      const textDecorationInfos: TextDecorationInfo[] = [];
      for (let i = 0; i < selection.selectionRanges.length; i++) {
        const selectionRange = selection.selectionRanges[i];
        for (let i = 0; i < selectionRange.ranges.length; i++) {
          const range = selectionRange.ranges[i];
          const isFocusRange = range.id === focusRange.id;
          if (isFocusRange) {
            hasSeenFocusRange = true;
          }
          const rangeDirection = matita.getRangeDirection(this.stateControl.stateView.document, range);
          const firstPoint = rangeDirection === matita.RangeDirection.Forwards ? range.startPoint : range.endPoint;
          const lastPoint = rangeDirection === matita.RangeDirection.Forwards ? range.endPoint : range.startPoint;
          for (const paragraphReference of matita.iterParagraphsInRange(this.stateControl.stateView.document, focusRange)) {
            let startOffset: number;
            let endOffset: number;
            if (
              matita.isParagraphPoint(firstPoint) &&
              matita.areBlockReferencesAtSameBlock(paragraphReference, matita.makeBlockReferenceFromParagraphPoint(firstPoint))
            ) {
              startOffset = firstPoint.offset;
            } else {
              startOffset = 0;
            }
            if (
              matita.isParagraphPoint(lastPoint) &&
              matita.areBlockReferencesAtSameBlock(paragraphReference, matita.makeBlockReferenceFromParagraphPoint(lastPoint))
            ) {
              endOffset = lastPoint.offset;
            } else {
              const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
              matita.assertIsParagraph(paragraph);
              endOffset = matita.getParagraphLength(paragraph);
            }
            if (endOffset > startOffset) {
              isCoveringText = true;
              if (hasSeenFocusRange && !isFocusRange) {
                break;
              }
            }
            if (isFocusRange) {
              const textDecorationInfosForParagraph = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
                paragraphReference,
                startOffset,
                endOffset,
                containerWidth(),
                relativeOffsetLeft,
                relativeOffsetTop,
                this.$p_measureParagraphAtParagraphReference(paragraphReference),
              );
              textDecorationInfos.push(...textDecorationInfosForParagraph);
            }
          }
          if (isFocusRange && isCoveringText) {
            break;
          }
        }
      }
      const { visibleLeft, visibleRight } = this.$p_getVisibleLeftAndRight();
      const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
      const visibleBoundingRect = makeViewRectangle(relativeOffsetLeft, relativeOffsetTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
      const wordBoundingRect = this.$p_makeWordBoundingRectMightBeEmpty(textDecorationInfos, relativeOffsetLeft, relativeOffsetTop);
      const startTextValue = startValues?.text || '';
      const startLinkValue = startValues?.link || '';
      this.$p_linkBoxRenderMessage$(
        Push({
          visibleBoundingRect,
          wordBoundingRect,
          shouldGetText: !isCoveringText || startTextValue !== '',
          startTextValue,
          startLinkValue,
          applyLink: (link, text) => {
            assert(link !== '');
            this.$p_closeLinkBox();
            this.$p_inputControl.focusButDoNotScrollTo();
            this.stateControl.queueUpdate(() => {
              if (isCoveringText) {
                this.stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.stateControl, null, () => ({ link })));
                if (startTextValue !== '' && text !== startTextValue) {
                  this.stateControl.delta.applyUpdate(makeInsertPlainTextAtSelectionUpdateFn(this.stateControl, text));
                }
                return;
              }
              this.stateControl.delta.applyUpdate(
                makeInsertPlainTextAtSelectionUpdateFn(this.stateControl, text, undefined, undefined, (textConfig) => ({ ...textConfig, link })),
              );
            });
          },
        }),
      );
    };
  }
  private $p_isSearchSelectAllTextWaiting = false;
  openSearch(focusSearchInput = true): matita.RunUpdateFn {
    return () => {
      if (!this.$p_isSearchElementContainerVisible$.currentValue) {
        this.$p_isSearchElementContainerVisible$(Push(true));
      }
      if (focusSearchInput) {
        this.$p_isSearchSelectAllTextWaiting = true;
        this.$p_searchElementSelectAllText$(Push(undefined));
      }
    };
  }
  closeSearch(): matita.RunUpdateFn {
    return () => {
      if (this.$p_isSearchElementContainerVisible$.currentValue) {
        this.$p_isSearchElementContainerVisible$(Push(false));
      }
      this.$p_inputControl.focusButDoNotScrollTo();
    };
  }
  private $p_setSearchQuery(query: string): void {
    this.$p_searchControl.query = query;
    this.$p_changeQuery$(Push(query));
  }
  searchCurrentFocusSelectionRange(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  private $p_getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(
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
        givenRange,
        firstPoint,
        givenSelectionRange,
      );
      const nextLastBounded = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.NextBoundByEdge)(
        this.stateControl.stateView.document,
        this.stateControl.stateControlConfig,
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
      if (/[\n\r]/.test(word)) {
        return null;
      }
    }
    return {
      newSelectionRange,
      word,
      isAway,
    };
  }
  private $p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText(): {
    newSelectionRange: matita.SelectionRange;
    word: string;
    isAway: boolean;
  } | null {
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (!focusSelectionRange || focusSelectionRange.ranges.length > 1) {
      return null;
    }
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    return this.$p_getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(focusRange, focusSelectionRange);
  }
  selectAllInstancesOfWord(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word } = result;
      this.$p_setSearchQuery(word);
      this.stateControl.delta.applyUpdate(this.selectAllInstancesOfSearchQuery(newSelectionRange));
    };
  }
  selectAllInstancesOfSearchQuery(focusSelectionRange?: matita.SelectionRange): matita.RunUpdateFn {
    return () => {
      const paragraphIdToParagraphMatchesMap = this.$p_searchControl.findAllMatchesSyncLimitedToMaxAmount(200);
      if (paragraphIdToParagraphMatchesMap === null) {
        // TODO: Show feedback.
        return;
      }
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
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.$p_useSearchScrollMargins = true;
        this.stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.stateControl.delta.applyUpdate(this.selectNextSearchMatch(true));
      }
      this.stateControl.delta.applyUpdate(this.openSearch());
    };
  }
  selectPreviousInstanceOfWordAtFocus(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { newSelectionRange, word, isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.$p_useSearchScrollMargins = true;
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
      const match = this.$p_searchControl.wrapCurrentOrFindNextMatchSync(
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
      this.$p_useSearchScrollMargins = true;
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
      const match = this.$p_searchControl.wrapCurrentOrFindPreviousMatchSync(
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
      this.$p_useSearchScrollMargins = true;
      if (extendSelection) {
        this.stateControl.delta.setSelection(matita.makeSelection([selectionRange, ...this.stateControl.stateView.selection.selectionRanges]));
      } else {
        this.stateControl.delta.setSelection(matita.makeSelection([selectionRange]));
      }
    };
  }
  openQuickFixAtSelection(): matita.RunUpdateFn {
    return () => {
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
      if (focusSelectionRange === null || !matita.isSelectionRangeCollapsedInText(focusSelectionRange)) {
        return;
      }
      this.$p_scrollSelectionIntoView();
      const collapsedRange = focusSelectionRange.ranges[0];
      const paragraphPoint = collapsedRange.startPoint;
      matita.assertIsParagraphPoint(paragraphPoint);
      this.$p_spellingBoxQuickFixParagraphPoint$(Push(paragraphPoint));
    };
  }
  private $p_getSelectionViewHasFocusValue(): boolean {
    return (document.hasFocus() && this.$p_inputControl.getIsFocused()) || this.$p_isDraggingSelection;
  }
  private $p_updateSelectionViewHasFocus(): void {
    if (this.stateControl.isInUpdate) {
      this.$p_selectionViewHasFocus$(Push(this.$p_getSelectionViewHasFocusValue()));
    } else {
      this.stateControl.queueUpdate(() => {
        this.$p_selectionViewHasFocus$(Push(this.$p_getSelectionViewHasFocusValue()));
      });
    }
  }
  private $p_onInputElementFocus(): void {
    this.$p_updateSelectionViewHasFocus();
  }
  private $p_onInputElementBlur(): void {
    this.$p_updateSelectionViewHasFocus();
  }
  private $p_onWindowFocus(): void {
    this.$p_updateSelectionViewHasFocus();
  }
  private $p_onWindowBlur(): void {
    this.$p_updateSelectionViewHasFocus();
    requestAnimationFrameDisposable(() => {
      this.$p_clearKeys();
    }, this);
  }
  makeSoftLineStartEndFocusPointTransformFn(
    pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
  ): matita.PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
    return (document, _stateControlConfig, range, point, selectionRange) => {
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
      const { relativeParagraphMeasurement } = this.$p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
      const measuredParagraphLineRangeIndex = this.$p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
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
  private $p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
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
    range: matita.Range,
    point: matita.Point,
    selectionRange: matita.SelectionRange,
    overrideCursorOffsetLeft: number | undefined,
    isAnchor: boolean,
  ): { pointWithContentReference: matita.PointWithContentReference; isWrappedLineStart: boolean; horizontalOffset: number } {
    if (!matita.isParagraphPoint(point) || selectionRange.intention === matita.SelectionRangeIntention.Block) {
      throwUnreachable();
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (selectionRange.intention !== matita.SelectionRangeIntention.Text) {
      assertUnreachable(selectionRange.intention);
    }
    const lineWrapFocusCursorWrapToNextLineDataValue = isAnchor
      ? getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data)
      : getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
    const isLineWrapToNextLine =
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
      this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId) &&
      this.isParagraphPointAtWrappedLineWrapPoint(point);
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
    const measuredParagraphLineRangeIndex = this.$p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
      paragraphMeasurement,
      point,
      isLineWrapToNextLine,
    );
    const horizontalOffset =
      overrideCursorOffsetLeft ?? this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(point, isLineWrapToNextLine).position.left;
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
        const previousParagraphMeasurement = this.$p_measureParagraphAtParagraphReference(previousParagraphReference);
        const position = this.$p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
          previousParagraphMeasurement,
          previousParagraphReference,
          previousParagraphMeasurement.measuredParagraphLineRanges.length - 1,
          horizontalOffset,
          null,
        );
        assertIsNotNullish(position);
        return {
          pointWithContentReference: position.pointWithContentReference,
          isWrappedLineStart: position.isWrappedLineStart,
          horizontalOffset,
        };
      }
      const position = this.$p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
        paragraphMeasurement,
        paragraphReference,
        measuredParagraphLineRangeIndex - 1,
        horizontalOffset,
        null,
      );
      assertIsNotNullish(position);
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
      const nextParagraphMeasurement = this.$p_measureParagraphAtParagraphReference(nextParagraphReference);
      const position = this.$p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
        nextParagraphMeasurement,
        nextParagraphReference,
        0,
        horizontalOffset,
        null,
      );
      assertIsNotNullish(position);
      return {
        pointWithContentReference: position.pointWithContentReference,
        isWrappedLineStart: position.isWrappedLineStart,
        horizontalOffset,
      };
    }
    const position = this.$p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
      paragraphMeasurement,
      paragraphReference,
      measuredParagraphLineRangeIndex + 1,
      horizontalOffset,
      null,
    );
    assertIsNotNullish(position);
    return {
      pointWithContentReference: position.pointWithContentReference,
      isWrappedLineStart: position.isWrappedLineStart,
      horizontalOffset,
    };
  }
  private $p_scrollSelectionIntoViewWhenFinishedUpdating = false;
  private $p_isSearchFocused(): boolean {
    return !!this.$p_searchInputRef.current && document.activeElement === this.$p_searchInputRef.current;
  }
  private $p_isInSearchBox(): boolean {
    return (!!document.activeElement && this.$p_searchElementContainerElement.contains(document.activeElement)) || this.$p_isSearchSelectAllTextWaiting;
  }
  private $p_activeSelectionSecondaryDataExpirationIds = new Set<number>();
  private $p_activeSelectionSecondaryDataExpirationIdCounter = 0;
  makeActivatedSelectionSecondaryDataExpirationId(): number {
    const id = this.$p_activeSelectionSecondaryDataExpirationIdCounter++;
    this.$p_activeSelectionSecondaryDataExpirationIds.add(id);
    return id;
  }
  isSelectionSecondaryDataExpirationIdActive(expirationId: number): boolean {
    return this.$p_activeSelectionSecondaryDataExpirationIds.has(expirationId);
  }
  private $p_didResetCursorVisibility = false;
  private $p_onSelectionChange(event: Event<matita.SelectionChangeMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { previousSelection, data, updateDataStack } = event.value;
    if (
      !this.$p_isDraggingSelection &&
      !updateDataStack.some((data) => !!data[doNotScrollToSelectionAfterChangeDataKey]) &&
      !(data && !!data[doNotScrollToSelectionAfterChangeDataKey])
    ) {
      this.$p_scrollSelectionIntoViewWhenFinishedUpdating = true;
    }
    if (this.stateControl.stateView.selection.selectionRanges.length === 0) {
      if (this.$p_inputControl.getIsFocused()) {
        this.$p_inputControl.blur();
      }
    } else {
      if (!this.$p_inputControl.getIsFocused() && !this.$p_isInSearchBox()) {
        this.$p_inputControl.focusButDoNotScrollTo();
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
    if (data !== undefined && isSelectionChangeDataCompositionUpdate(data)) {
      for (let i = 0; i < this.stateControl.stateView.selection.selectionRanges.length; i++) {
        const selectionRange = this.stateControl.stateView.selection.selectionRanges[i];
        const compositionUpdateDataValue = getSelectionRangeCompositionUpdateDataValue(selectionRange.data);
        if (compositionUpdateDataValue !== undefined) {
          preserveSelectionSecondaryDataExpirationIds.add(compositionUpdateDataValue.expirationId);
        }
      }
    }
    for (const activeExpirationId of this.$p_activeSelectionSecondaryDataExpirationIds) {
      if (!preserveSelectionSecondaryDataExpirationIds.has(activeExpirationId)) {
        this.$p_activeSelectionSecondaryDataExpirationIds.delete(activeExpirationId);
      }
    }
    this.$p_resetSynchronizedCursorVisibility();
  }
  private $p_onCustomCollapsedSelectionTextConfigChange(): void {
    this.$p_resetSynchronizedCursorVisibility();
  }
  private $p_resetSynchronizedCursorVisibility(): void {
    if (!this.$p_didResetCursorVisibility) {
      this.$p_resetSynchronizedCursorVisibility$(Push(undefined));
      this.$p_didResetCursorVisibility = true;
    }
  }
  private $p_onAfterMutationPart(
    event: Event<matita.AfterMutationPartMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>,
  ): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const { updateDataStack } = event.value;
    if (!this.$p_isDraggingSelection && !updateDataStack.some((data) => !!data[doNotScrollToSelectionAfterChangeDataKey])) {
      this.$p_scrollSelectionIntoViewWhenFinishedUpdating = true;
    }
  }
  private $p_scrollSelectionIntoView(): void {
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (!focusSelectionRange) {
      return;
    }
    const focusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(focusSelectionRange));
    matita.assertIsParagraphPoint(focusPoint);
    const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(focusSelectionRange.data);
    const cursorPositionAndHeightFromParagraphPoint = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(
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
      this.$p_getScrollContainer(),
      this.$p_isElementScrollable,
      this.$p_getScrollElementAdditionalNonVisibleMargins,
    );
  }
  private $p_useSearchScrollMargins = false;
  private $p_getScrollElementAdditionalNonVisibleMargins = (element: Element): AdditionalMargins => {
    let visibleTop: number;
    let visibleBottom: number;
    let notVisibleTop: number;
    let notVisibleBottom: number;
    if (this.$p_isSearchElementContainerVisible$.currentValue && element === this.$p_getScrollContainer()) {
      const searchElementPaddingTop =
        ((this.$p_searchElementContainerElement.firstChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0) + searchBoxMargin * 2;
      const visibleTopAndBottom = this.$p_getVisibleTopAndBottom();
      const visibleHeight = visibleTopAndBottom.visibleBottom - visibleTopAndBottom.visibleTop;
      if (this.$p_useSearchScrollMargins) {
        visibleTop = searchElementPaddingTop;
        visibleBottom = visibleHeight / 5;
        notVisibleTop = Math.max(searchElementPaddingTop, searchElementPaddingTop + visibleHeight / 4);
        notVisibleBottom = Math.min((visibleHeight * 3) / 5, visibleHeight - searchElementPaddingTop);
      } else {
        visibleTop = searchElementPaddingTop;
        visibleBottom = 0;
        notVisibleTop = searchElementPaddingTop;
        notVisibleBottom = 0;
      }
    } else {
      visibleTop = 0;
      visibleBottom = 0;
      notVisibleTop = 0;
      notVisibleBottom = 0;
    }
    // TODO.
    visibleTop += 40;
    notVisibleTop += 40;
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
  private $p_isElementScrollable = (element: Element): boolean => {
    // TODO: Figure this out without forcing style calculation.
    return element === document.documentElement;
  };
  isParagraphPointAtWrappedLineWrapPoint(point: matita.ParagraphPoint): boolean {
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
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
  private $p_getCursorPositionAndHeightFromParagraphPointFillingLine(
    point: matita.ParagraphPoint,
    isMarkedLineWrapToNextLine: boolean,
  ): { position: ViewPosition; height: number; measuredParagraphLineRanges: MeasuredParagraphLineRange[]; measuredParagraphLineRangeIndex: number } {
    // TODO: This errored?
    const isLineWrapToNextLine = isMarkedLineWrapToNextLine && this.isParagraphPointAtWrappedLineWrapPoint(point);
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
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
                measuredParagraphLineRanges: paragraphMeasurement.measuredParagraphLineRanges,
                measuredParagraphLineRangeIndex: i + 1,
              };
            }
            return {
              position: {
                left: nextMeasuredParagraphLineRange.characterRectangles[0].left,
                top: nextMeasuredParagraphLineRange.boundingRect.top,
              },
              height: nextMeasuredParagraphLineRange.boundingRect.height,
              measuredParagraphLineRanges: paragraphMeasurement.measuredParagraphLineRanges,
              measuredParagraphLineRangeIndex: i + 1,
            };
          }
          if (measuredParagraphLineRange.characterRectangles.length === 0) {
            return {
              position: {
                left: measuredParagraphLineRange.boundingRect.left,
                top: measuredParagraphLineRange.boundingRect.top,
              },
              height: measuredParagraphLineRange.boundingRect.height,
              measuredParagraphLineRanges: paragraphMeasurement.measuredParagraphLineRanges,
              measuredParagraphLineRangeIndex: i,
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
            measuredParagraphLineRanges: paragraphMeasurement.measuredParagraphLineRanges,
            measuredParagraphLineRangeIndex: i,
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
          measuredParagraphLineRanges: paragraphMeasurement.measuredParagraphLineRanges,
          measuredParagraphLineRangeIndex: i,
        };
      }
    }
    throwUnreachable();
  }
  private $p_normalizeEventKey(event: KeyboardEvent): string {
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
      return event.key;
    }
    return event.code;
  }
  private $p_shortcutKeys: string[] = [
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
    'Tab',
    'Escape',
    'BracketLeft',
    'BracketRight',
    'Comma',
    'Period',
    'Backslash',
    'Semicolon',
  ];
  private $p_keyDownId = 0;
  private $p_keyDownSet = new Map<string, number>();
  private $p_clearKeys(): void {
    const downKeys = [...this.$p_keyDownSet.keys()];
    this.$p_keyDownSet.clear();
    for (const key of downKeys) {
      this.$p_keyUp$(Push({ key }));
    }
  }
  private $p_markKeyDown(key: string, keyboardEvent?: KeyboardEvent): void {
    this.$p_keyDownSet.set(key, this.$p_keyDownId++);
    this.$p_keyDown$(Push({ key, keyboardEvent }));
  }
  private $p_markKeyUp(key: string, keyboardEvent?: KeyboardEvent): void {
    this.$p_keyDownSet.delete(key);
    this.$p_keyUp$(Push({ key, keyboardEvent }));
  }
  private $p_keyDown$ = Distributor<{ key: string; keyboardEvent?: KeyboardEvent }>();
  private $p_keyUp$ = Distributor<{ key: string; keyboardEvent?: KeyboardEvent }>();
  private $p_onGlobalKeyDown(event: KeyboardEvent): void {
    const normalizedKey = this.$p_normalizeEventKey(event);
    if (platforms.includes(Platform.Apple) && (this.$p_keyDownSet.has('Meta') || normalizedKey === 'Meta')) {
      this.$p_clearKeys(); // MacOS track keyup events after Meta is pressed.
    }
    this.$p_markKeyDown(normalizedKey, event);
    if (!this.$p_shortcutKeys.includes(normalizedKey)) {
      return;
    }
    if (
      this.$p_isToolbarOpen$.currentValue &&
      normalizedKey === 'Escape' &&
      document.activeElement !== null &&
      this.$p_toolbarContainerElement.contains(document.activeElement)
    ) {
      this.$p_closeToolbarAndFocus();
      event.preventDefault();
      return;
    }
    if (this.$p_isLinkBoxOpen() && normalizedKey === 'Escape') {
      this.$p_closeLinkBox();
      this.$p_inputControl.focusButDoNotScrollTo();
      event.preventDefault();
      return;
    }
    if (this.$p_inputControl.getIsFocused()) {
      if (this.$p_spellingBoxFocusedSuggestionIndex !== null && this.$p_spellingBoxFocusedSuggestionIndex !== -1) {
        assert(this.$p_isSpellingBoxOpen);
        if (normalizedKey === 'ArrowDown') {
          this.$p_moveSpellingBoxFocusedSuggestionIndexUpDown$(Push(1));
          event.preventDefault();
          return;
        }
        if (normalizedKey === 'ArrowUp') {
          this.$p_moveSpellingBoxFocusedSuggestionIndexUpDown$(Push(-1));
          event.preventDefault();
          return;
        }
        if (normalizedKey === 'Enter') {
          this.$p_spellingBoxFixSpellingWithCurrentlyFocusedSuggestion$(Push(undefined));
          event.preventDefault();
          return;
        }
      }
      if (this.$p_isSpellingBoxOpen && normalizedKey === 'Escape') {
        this.$p_spellingBoxCancelCurrent$(Push(undefined));
        event.preventDefault();
        return;
      }
    }
    const hasMeta = event.metaKey;
    const hasControl = event.ctrlKey;
    const hasAlt = event.altKey;
    const hasShift = event.shiftKey;
    const activeContexts: Context[] = [];
    if (this.$p_inputControl.getIsFocused() && !this.$p_inputControl.getIsInComposition()) {
      activeContexts.push(Context.Editing);
    }
    if (this.$p_isDraggingSelection) {
      activeContexts.push(Context.DraggingSelection);
    }
    if (this.$p_isSearchFocused() && !this.$p_isSearchInComposition$.currentValue) {
      activeContexts.push(Context.Searching);
    }
    if (this.$p_isInSearchBox() && !this.$p_isSearchInComposition$.currentValue) {
      activeContexts.push(Context.InSearchBox);
    }
    let shouldCancel = false;
    for (let i = 0; i < this.$p_keyCommands.length; i++) {
      const keyCommand = this.$p_keyCommands[i];
      const { key, command, context, platform } = keyCommand;
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
        shouldCancel = true;
        this.$p_endSelectionDrag$(Push(undefined));
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
  private $p_onGlobalKeyUp(event: KeyboardEvent): void {
    const normalizedKey = this.$p_normalizeEventKey(event);
    this.$p_markKeyUp(normalizedKey, event);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runCommand(commandInfo: CommandInfo<any>): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { commandName, data } = commandInfo;
    const registeredCommand = this.$p_commandRegister.get(String(commandName));
    if (!registeredCommand) {
      return;
    }
    registeredCommand.execute(this.stateControl, this.viewControl, data);
  }
  onConfigChanged(): void {
    throwNotImplemented();
  }
  private $p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference: matita.BlockReference): {
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue;
    containerHtmlElementBoundingRect?: DOMRect;
  } {
    const cachedMeasurement = this.relativeParagraphMeasurementCache.get(paragraphReference.blockId);
    if (cachedMeasurement) {
      return { relativeParagraphMeasurement: cachedMeasurement };
    }
    this.$p_commitDirtyChanges();
    // TODO: Rtl.
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
        // We use getClientRects because in Safari, it returns 2 rectangles for the first character after a line wrapping point (I think one previous line and
        // one current line), whereas getBoundingClientRects returns a rectangle that envelops both, which breaks the measurement code.
        const measureRangeClientRects = measureRange.getClientRects();
        const measureRangeBoundingRect = measureRangeClientRects[measureRangeClientRects.length - 1];
        const left = measureRangeBoundingRect.left - containerHtmlElementBoundingRect.left;
        const top = measureRangeBoundingRect.top - containerHtmlElementBoundingRect.top;
        const width = measureRangeBoundingRect.width;
        const height = measureRangeBoundingRect.height;
        const characterRectangle = makeViewRectangle(left, top, width, height) as MutableViewRectangle;
        if (measuredParagraphLineRanges.length === 0) {
          paragraphCharacterRectangles.push(characterRectangle);
          measuredParagraphLineRanges.push({
            boundingRect: { ...characterRectangle },
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
        if (!isPreviousLineBreak) {
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
        paragraphCharacterRectangles.push(characterRectangle);
        measuredParagraphLineRanges.push({
          boundingRect: { ...characterRectangle },
          characterRectangles: [characterRectangle],
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
      for (const segmentData of this.$p_graphemeSegmenter.segment(relevantText)) {
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
  private $p_measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): AbsoluteParagraphMeasurement {
    const {
      relativeParagraphMeasurement,
      containerHtmlElementBoundingRect = this.viewControl
        .accessParagraphRenderControlAtBlockReference(paragraphReference)
        .containerHtmlElement.getBoundingClientRect(),
    } = this.$p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
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
  private $p_compareParagraphTopToOffsetTop(paragraphReference: matita.BlockReference, needle: number): number {
    const paragraphNodeControl = this.viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const boundingBox = paragraphNodeControl.containerHtmlElement.getBoundingClientRect();
    return boundingBox.top - needle;
  }
  private $p_positionCalculationEpsilon = 1;
  private $p_calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
    measuredParagraphLineRange: MeasuredParagraphLineRange,
    paragraphReference: matita.BlockReference,
    horizontalOffset: number,
    isFirstInParagraphOrIsPreviousLineEndingWithLineBreak: boolean,
    isLastInParagraph: boolean,
    checkboxMarkerParagraphReference: matita.BlockReference | null,
    isExact = false,
  ): ParagraphTextHitPosition | null {
    if (measuredParagraphLineRange.characterRectangles.length === 0) {
      return {
        type: HitPositionType.ParagraphText,
        checkboxMarkerParagraphReference,
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
      const previousCharacterRight =
        j === 0
          ? isExact
            ? characterRectangle.left
            : -Infinity
          : Math.min(measuredParagraphLineRange.characterRectangles[j - 1].right, characterRectangle.left);
      const characterRight = j === measuredParagraphLineRange.characterRectangles.length - 1 && !isExact ? Infinity : characterRectangle.right;
      if (
        !(
          previousCharacterRight - this.$p_positionCalculationEpsilon <= horizontalOffset &&
          horizontalOffset <= characterRight + this.$p_positionCalculationEpsilon
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
        type: HitPositionType.ParagraphText,
        checkboxMarkerParagraphReference,
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
    if (!isExact) {
      throwUnreachable();
    }
    return null;
  }
  private $p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue,
    paragraphReference: matita.BlockReference,
    measuredParagraphLineRangeIndex: number,
    horizontalOffset: number,
    checkboxMarkerParagraphReference: matita.BlockReference | null,
  ): ParagraphTextHitPosition | null {
    const measuredParagraphLineRange = relativeParagraphMeasurement.measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
    const isFirstInParagraphOrIsPreviousLineEndingWithLineBreak =
      measuredParagraphLineRangeIndex === 0 || relativeParagraphMeasurement.measuredParagraphLineRanges[measuredParagraphLineRangeIndex - 1].endsWithLineBreak;
    const isLastInParagraph = measuredParagraphLineRangeIndex === relativeParagraphMeasurement.measuredParagraphLineRanges.length - 1;
    return this.$p_calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
      measuredParagraphLineRange,
      paragraphReference,
      horizontalOffset,
      isFirstInParagraphOrIsPreviousLineEndingWithLineBreak,
      isLastInParagraph,
      checkboxMarkerParagraphReference,
    );
  }
  private $p_calculatePositionFromViewPosition(
    viewPosition: ViewPosition,
    isSnapIfPastBoundary: boolean,
    isReturnCheckboxMarkerHitIfHitCheckboxMarker: boolean,
    isExact = false,
  ): HitPosition | null {
    assert(!(isExact && (isSnapIfPastBoundary || isReturnCheckboxMarkerHitIfHitCheckboxMarker)));
    const hitElements = document.elementsFromPoint(viewPosition.left, viewPosition.top);
    const firstContentHitElement = hitElements.find(
      (hitElement) => hitElement === this.$p_topLevelContentViewContainerElement || this.$p_topLevelContentViewContainerElement.contains(hitElement),
    );
    let paragraphReferences: matita.BlockReference[];
    const nodeRenderControl = firstContentHitElement ? findClosestNodeRenderControl(this.viewControl, firstContentHitElement) : null;
    let checkboxMarkerParagraphReference: matita.BlockReference | null = null;
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
      if (firstContentHitElement === nodeRenderControl.listMarkerElement) {
        const topLevelContent = matita.accessContentFromContentReference(this.stateControl.stateView.document, this.topLevelContentReference);
        const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
        if (listType === AccessedListStyleType.Checklist) {
          if (isReturnCheckboxMarkerHitIfHitCheckboxMarker) {
            return {
              type: HitPositionType.CheckboxMarker,
              paragraphReference,
            };
          }
          checkboxMarkerParagraphReference = paragraphReference;
        }
      }
      paragraphReferences = [paragraphReference];
    } else {
      // TODO.
      paragraphReferences = matita
        .accessContentFromContentReference(this.stateControl.stateView.document, nodeRenderControl.contentReference)
        .blockIds.toArray()
        .map(matita.makeBlockReferenceFromBlockId);
    }
    const startIndex = Math.max(0, indexOfNearestLessThanEq(paragraphReferences, viewPosition.top, this.$p_compareParagraphTopToOffsetTop.bind(this)) - 1);
    const endIndex = Math.min(
      paragraphReferences.length - 1,
      indexOfNearestLessThanEq(paragraphReferences, viewPosition.top, this.$p_compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
    );
    const possibleLines: {
      paragraphReference: matita.BlockReference;
      measuredParagraphLineRange: MeasuredParagraphLineRange;
      isFirstInParagraph: boolean;
      isLastInParagraph: boolean;
    }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraphReference = paragraphReferences[i];
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
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
      const lineTop = i === 0 && !isExact ? -Infinity : boundingRect.top;
      const lineBottom =
        i === possibleLines.length - 1
          ? isExact
            ? boundingRect.bottom
            : Infinity
          : Math.max(possibleLines[i + 1].measuredParagraphLineRange.boundingRect.top, boundingRect.bottom);
      if (!(lineTop - this.$p_positionCalculationEpsilon <= viewPosition.top && viewPosition.top <= lineBottom + this.$p_positionCalculationEpsilon)) {
        continue;
      }
      if (isSnapIfPastBoundary) {
        if (i === 0 && viewPosition.top < possibleLine.measuredParagraphLineRange.boundingRect.top) {
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.stateControl.stateView.document, paragraphReference),
          );
          if (matita.getIndexOfBlockInContentFromBlockReference(this.stateControl.stateView.document, paragraphReference) === 0) {
            const paragraph = matita.accessBlockFromBlockReference(this.stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            return {
              type: HitPositionType.ParagraphText,
              checkboxMarkerParagraphReference,
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
        if (i === possibleLines.length - 1 && viewPosition.top > possibleLine.measuredParagraphLineRange.boundingRect.bottom) {
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
              type: HitPositionType.ParagraphText,
              checkboxMarkerParagraphReference,
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
      return this.$p_calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
        measuredParagraphLineRange,
        paragraphReference,
        viewPosition.left,
        isFirstInParagraph || possibleLines[i - 1].measuredParagraphLineRange.endsWithLineBreak,
        isLastInParagraph,
        checkboxMarkerParagraphReference,
        isExact,
      );
    }
    return null;
  }
  private $p_getScrollContainer(): HTMLElement {
    return findScrollContainer(this.$p_topLevelContentViewContainerElement, this.$p_isElementScrollable);
  }
  private $p_getVisibleTopAndBottom(): { visibleTop: number; visibleBottom: number } {
    // TODO.
    return {
      visibleTop: 0,
      visibleBottom: window.innerHeight,
    };
  }
  private $p_getVisibleLeftAndRight(): { visibleLeft: number; visibleRight: number } {
    // TODO.
    return {
      visibleLeft: 0,
      visibleRight: window.innerWidth,
    };
  }
  private $p_getContainerScrollWidth(): number {
    // TODO.
    return this.$p_topLevelContentViewContainerElement.scrollWidth;
  }
  private $p_onViewDelta(event: Event<matita.ViewDelta>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    this.viewControl.applyViewDelta(event.value);
  }
  private $p_onBeforeUpdateBatch(event: Event<matita.BeforeUpdateBatchMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    const message = event.value;
    const { updateQueue } = message;
    for (let i = 0; i < updateQueue.length - 1; i++) {
      const currentQueuedUpdate = updateQueue[i];
      const nextQueuedUpdate = updateQueue[i + 1];
      if (currentQueuedUpdate.data?.[selectionLeftRightDataKey] && nextQueuedUpdate.data?.[compositionStartDataKey]) {
        // Assume ArrowLeft/ArrowRight started composition here, so don't move/extend selection.
        updateQueue.splice(
          // Skip over next queued update in updateQueue so don't decrement here.
          i,
          1,
        );
      }
    }
  }
  private $p_onAfterUpdateBatch(event: Event<matita.AfterUpdateBatchMessage>): void {
    if (event.type !== PushType) {
      throwUnreachable();
    }
    this.$p_didResetCursorVisibility = false;
    const message = event.value;
    const { didApplyMutation } = message;
    if (didApplyMutation) {
      this.$p_commitDirtyChanges();
    }
    if (this.$p_scrollSelectionIntoViewWhenFinishedUpdating) {
      this.$p_scrollSelectionIntoView();
    }
    this.$p_scrollSelectionIntoViewWhenFinishedUpdating = false;
    this.$p_replaceViewSelectionRanges(didApplyMutation);
    if (this.$p_isSearchElementContainerVisible$.currentValue) {
      this.$p_replaceVisibleSearchResults();
    }
    this.$p_replaceVisibleSpellingMistakes();
    this.$p_inputControl.sync();
    this.$p_useSearchScrollMargins = false;
    this.$p_syncFloatingLinkDetails();
  }
  private $p_getFloatingLinkDetailsInfo(): {
    paragraphReference: matita.BlockReference;
    startOffset: number;
    endOffset: number;
    text: string;
    link: string;
  } | null {
    const selectionRanges = this.stateControl.stateView.selection.selectionRanges;
    if (selectionRanges.length !== 1) {
      return null;
    }
    const selectionRange = selectionRanges[0];
    if (selectionRange.ranges.length !== 1) {
      return null;
    }
    const range = selectionRange.ranges[0];
    const direction = matita.getRangeDirection(this.stateControl.stateView.document, range);
    const firstPoint = direction === matita.RangeDirection.Backwards ? range.endPoint : range.startPoint;
    const lastPoint = direction === matita.RangeDirection.Backwards ? range.startPoint : range.endPoint;
    if (!matita.isParagraphPoint(firstPoint) || !matita.isParagraphPoint(lastPoint) || !matita.areParagraphPointsAtSameParagraph(firstPoint, lastPoint)) {
      return null;
    }
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
    const firstInlineNodeWithStartOffset = matita.getInlineNodeWithStartOffsetAfterParagraphPoint(this.stateControl.stateView.document, firstPoint);
    if (firstInlineNodeWithStartOffset === null || !matita.isText(firstInlineNodeWithStartOffset.inline)) {
      return null;
    }
    const link = firstInlineNodeWithStartOffset.inline.config.link;
    if (typeof link !== 'string' || link === '') {
      return null;
    }
    let textNode = firstInlineNodeWithStartOffset.inline;
    let textNodeStartOffset = firstInlineNodeWithStartOffset.startOffset;
    while (true) {
      const nextInlineNodeWithStartOffset = matita.getInlineNodeWithStartOffsetAfterParagraphPoint(
        this.stateControl.stateView.document,
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, textNodeStartOffset + textNode.text.length),
      );
      if (nextInlineNodeWithStartOffset === null) {
        if (lastPoint.offset > textNodeStartOffset + textNode.text.length) {
          throwUnreachable();
        }
        break;
      }
      if (matita.isVoid(nextInlineNodeWithStartOffset.inline)) {
        if (lastPoint.offset > textNodeStartOffset + textNode.text.length) {
          return null;
        }
        break;
      }
      const nextTextNodeLink = nextInlineNodeWithStartOffset.inline.config.link;
      if (nextTextNodeLink !== link) {
        if (lastPoint.offset > textNodeStartOffset + textNode.text.length) {
          return null;
        }
        break;
      }
      textNode = nextInlineNodeWithStartOffset.inline;
      textNodeStartOffset = nextInlineNodeWithStartOffset.startOffset;
    }
    const endOffset = textNodeStartOffset + textNode.text.length;
    textNode = firstInlineNodeWithStartOffset.inline;
    textNodeStartOffset = firstInlineNodeWithStartOffset.startOffset;
    while (true) {
      const previousInlineNodeWithStartOffset = matita.getInlineNodeWithStartOffsetBeforeParagraphPoint(
        this.stateControl.stateView.document,
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, textNodeStartOffset),
      );
      if (previousInlineNodeWithStartOffset === null || matita.isVoid(previousInlineNodeWithStartOffset.inline)) {
        break;
      }
      const previousTextNodeLink = previousInlineNodeWithStartOffset.inline.config.link;
      if (previousTextNodeLink !== link) {
        break;
      }
      textNode = previousInlineNodeWithStartOffset.inline;
      textNodeStartOffset = previousInlineNodeWithStartOffset.startOffset;
    }
    const startOffset = textNodeStartOffset;
    const paragraph = matita.accessParagraphFromParagraphPoint(this.stateControl.stateView.document, firstPoint);
    const text = matita
      .sliceParagraphChildren(paragraph, startOffset, endOffset)
      .map((textNode) => {
        matita.assertIsText(textNode);
        return textNode.text;
      })
      .join('');
    return {
      paragraphReference,
      startOffset,
      endOffset,
      text,
      link,
    };
  }
  private $p_isLinkDetailsOpen(): boolean {
    return isSome(this.$p_linkDetailsRenderMessage$.lastValue) && this.$p_linkDetailsRenderMessage$.lastValue.value !== null;
  }
  private $p_closeLinkDetails(): void {
    if (this.$p_isLinkDetailsOpen()) {
      this.$p_linkDetailsRenderMessage$(Push(null));
    }
  }
  private $p_tempCloseLinkDetails = false;
  private $p_syncFloatingLinkDetails(): void {
    if (this.$p_tempCloseLinkDetails) {
      this.$p_tempCloseLinkDetails = false;
      this.$p_closeLinkDetails();
      return;
    }
    if (this.$p_isLinkBoxOpen() || this.$p_isInSearchBox()) {
      this.$p_closeLinkDetails();
      return;
    }
    const linkDetailsInfo = this.$p_getFloatingLinkDetailsInfo();
    if (linkDetailsInfo === null) {
      this.$p_closeLinkDetails();
      return;
    }
    const { visibleLeft, visibleRight } = this.$p_getVisibleLeftAndRight();
    const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const visibleBoundingRect = makeViewRectangle(relativeOffsetLeft, relativeOffsetTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(linkDetailsInfo.paragraphReference);
    const textDecorationInfos = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
      linkDetailsInfo.paragraphReference,
      linkDetailsInfo.startOffset,
      linkDetailsInfo.endOffset,
      this.$p_getContainerScrollWidth(),
      relativeOffsetLeft,
      relativeOffsetTop,
      paragraphMeasurement,
    );
    const wordBoundingRect = this.$p_makeWordBoundingRect(textDecorationInfos);
    const makeSelectionCoveringLink = (): matita.Selection => {
      const contentReference = matita.makeContentReferenceFromContent(
        matita.accessContentFromBlockReference(this.stateControl.stateView.document, linkDetailsInfo.paragraphReference),
      );
      const startPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.paragraphReference, linkDetailsInfo.startOffset);
      const endPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.paragraphReference, linkDetailsInfo.endOffset);
      const range = matita.makeRange(contentReference, startPoint, endPoint, matita.generateId());
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      const selection = matita.makeSelection([selectionRange]);
      return selection;
    };
    const isSelectionSame = (
      originalSelection: matita.Selection,
      originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    ): boolean => {
      const transformedSelection = this.stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
        {
          selection: originalSelection,
          fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
          shouldTransformAsSelection: true,
        },
        originalStateView,
        this.stateControl.stateView,
      );
      return matita.areSelectionsCoveringSameContent(originalSelection, transformedSelection);
    };
    const originalSelection = this.stateControl.stateView.selection;
    this.$p_linkDetailsRenderMessage$(
      Push({
        visibleBoundingRect,
        wordBoundingRect,
        link: linkDetailsInfo.link,
        tempClose: () => {
          this.$p_tempCloseLinkDetails = true;
          this.$p_inputControl.focusButDoNotScrollTo();
        },
        returnFocus: () => {
          this.$p_inputControl.focusButDoNotScrollTo();
        },
        editLink: () => {
          let originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null =
            this.stateControl.snapshotStateThroughStateView();
          this.stateControl.queueUpdate(() => {
            const originalSelectionCoveringLink = makeSelectionCoveringLink();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (isSelectionSame(originalSelectionCoveringLink, originalStateView!)) {
              this.stateControl.delta.setSelection(originalSelectionCoveringLink);
              this.stateControl.delta.applyUpdate(this.openFloatingLinkBoxAtSelection(linkDetailsInfo), { [keepFloatingLinkBoxOpenUpdateKey]: true });
            }
            originalStateView = null;
          });
        },
        removeLink: () => {
          let originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null =
            this.stateControl.snapshotStateThroughStateView();
          this.stateControl.queueUpdate(() => {
            const originalSelectionCoveringLink = makeSelectionCoveringLink();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (isSelectionSame(originalSelectionCoveringLink, originalStateView!)) {
              if (matita.isSelectionCollapsedInText(originalSelection)) {
                this.stateControl.delta.applyUpdate(
                  matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.stateControl, null, () => ({ link: undefined }), originalSelectionCoveringLink),
                );
              } else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (isSelectionSame(originalSelection, originalStateView!)) {
                  this.stateControl.delta.applyUpdate(
                    matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.stateControl, null, () => ({ link: undefined }), originalSelection),
                  );
                }
              }
            }
            originalStateView = null;
          });
        },
      }),
    );
  }
  private $p_trackMatchesDisposable: Disposable | null = null;
  private $p_calculateVisibleSearchResultsMatchInfos = (): SearchOverlayMatchInfo[] => {
    this.$p_trackMatchesDisposable?.dispose();
    this.$p_trackMatchesDisposable = Disposable();
    this.add(this.$p_trackMatchesDisposable);
    queueMicrotaskDisposable(() => {
      this.$p_matchNumberMaybe$(Push(None));
    }, this.$p_trackMatchesDisposable);
    if (!this.$p_isSearchElementContainerVisible$.currentValue) {
      return [];
    }
    // TODO: Lag when dragging selection with lots of results.
    const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const marginTopBottom = this.$p_getBufferMarginTopBottom();
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
        this.$p_compareParagraphTopToOffsetTop.bind(this),
      ) - 1,
    );
    const endIndex = Math.min(
      numParagraphReferences - 1,
      indexOfNearestLessThanEqDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleBottom + marginTopBottom,
        this.$p_compareParagraphTopToOffsetTop.bind(this),
        startIndex,
      ) + 1,
    );
    const matchInfos: SearchOverlayMatchInfo[] = [];
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    if (
      this.$p_searchElementTrackAllControl &&
      focusSelectionRange &&
      focusSelectionRange.ranges.length === 1 &&
      matita.isParagraphPoint(focusSelectionRange.ranges[0].startPoint) &&
      matita.isParagraphPoint(focusSelectionRange.ranges[0].endPoint) &&
      matita.areParagraphPointsAtSameParagraph(focusSelectionRange.ranges[0].startPoint, focusSelectionRange.ranges[0].endPoint)
    ) {
      const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(focusSelectionRange.ranges[0].startPoint);
      const focusStartOffset = focusSelectionRange.ranges[0].startPoint.offset;
      const focusEndOffset = focusSelectionRange.ranges[0].endPoint.offset;
      const paragraphMatches = this.$p_searchControl.getMatchesForParagraphAtBlockReference(paragraphReference);
      const matchIndexInParagraph = paragraphMatches.matches.findIndex(
        (otherMatch) =>
          (otherMatch.startOffset === focusStartOffset && otherMatch.endOffset === focusEndOffset) ||
          (otherMatch.startOffset === focusEndOffset && otherMatch.endOffset === focusStartOffset),
      );
      if (matchIndexInParagraph !== -1) {
        const totalMatchesBeforeParagraph$ = this.$p_searchElementTrackAllControl.trackTotalMatchesBeforeParagraphAtParagraphReferenceUntilStateOrSearchChange(
          paragraphReference,
          this.$p_trackMatchesDisposable,
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
            assertIsNotNullish(this.$p_trackMatchesDisposable);
            queueMicrotaskDisposable(() => {
              this.$p_matchNumberMaybe$(Push(Some(totalMatchesBeforeParagraph + matchIndexInParagraph + 1)));
            }, this.$p_trackMatchesDisposable);
          }, this.$p_trackMatchesDisposable),
        );
      }
    }
    let containerWidth_: number | undefined;
    const containerWidth = (): number => {
      if (containerWidth_ === undefined) {
        containerWidth_ = this.$p_getContainerScrollWidth();
      }
      return containerWidth_;
    };
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const paragraphMatches = this.$p_searchControl.getMatchesForParagraphAtBlockReference(paragraphReference);
      if (paragraphMatches.matches.length === 0) {
        continue;
      }
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
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
        const viewRangeInfos = this.$p_calculateViewRangeInfosForParagraphAtBlockReference(
          paragraphReference,
          startOffset,
          endOffset,
          true,
          containerWidth(),
          relativeOffsetLeft,
          relativeOffsetTop,
          paragraphMeasurement,
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
  private $p_replaceVisibleSearchResults(): void {
    this.$p_searchOverlay$(
      Push({
        calculateMatchInfos: this.$p_calculateVisibleSearchResultsMatchInfos.bind(this),
        renderSync: !this.$p_renderOverlayAsync && !this.$p_isDraggingSelection,
        onRender: () => {
          this.$p_renderOverlayAsync = false;
        },
        roundCorners: isFirefox,
      }),
    );
  }
  private $p_replaceVisibleSpellingMistakes(): void {
    if (this.$p_spellCheckControl === null || !this.$p_spellCheckControl.getIsLoaded()) {
      return;
    }
    const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const marginTopBottom = this.$p_getBufferMarginTopBottom();
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
        this.$p_compareParagraphTopToOffsetTop.bind(this),
      ) - 1,
    );
    const endIndex = Math.min(
      numParagraphReferences - 1,
      indexOfNearestLessThanEqDynamic(
        accessParagraphReferenceAtIndex,
        numParagraphReferences,
        visibleBottom + marginTopBottom,
        this.$p_compareParagraphTopToOffsetTop.bind(this),
        startIndex,
      ) + 1,
    );
    let containerWidth_: number | undefined;
    const containerWidth = (): number => {
      if (containerWidth_ === undefined) {
        containerWidth_ = this.$p_getContainerScrollWidth();
      }
      return containerWidth_;
    };
    const spellingMistakeOverlayInfos: SpellingMistakeOverlayInfo[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, this.topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const spellingMistakes = this.$p_spellCheckControl.getSpellingMistakesInParagraphAtParagraphReference(paragraphReference);
      if (spellingMistakes === null) {
        continue;
      }
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
      for (let j = 0; j < spellingMistakes.length; j++) {
        const spellingMistake = spellingMistakes[j];
        const textDecorationInfos = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
          paragraphReference,
          spellingMistake.startOffset,
          spellingMistake.endOffset,
          containerWidth(),
          relativeOffsetLeft,
          relativeOffsetTop,
          paragraphMeasurement,
        );
        spellingMistakeOverlayInfos.push({
          textDecorationInfos,
        });
      }
    }
    this.$p_spellingMistakesOverlay$(
      Push({
        spellingMistakeOverlayInfos,
      }),
    );
  }
  private $p_virtualSelectionDisposable: Disposable | null = null;
  private $p_lastRenderedSelection: matita.Selection | null = null;
  private $p_lastRenderedCustomCollapsedSelectionTextConfig: TextConfig | null = null;
  private $p_lastIsDraggingSelection = false;
  private $p_replaceViewSelectionRanges(forceUpdate?: boolean): void {
    if (
      forceUpdate === false &&
      this.$p_lastRenderedSelection === this.stateControl.stateView.selection &&
      this.$p_lastRenderedCustomCollapsedSelectionTextConfig === this.stateControl.stateView.customCollapsedSelectionTextConfig &&
      this.$p_lastIsDraggingSelection === this.$p_isDraggingSelection
    ) {
      return;
    }
    this.$p_lastRenderedSelection = this.stateControl.stateView.selection;
    this.$p_lastRenderedCustomCollapsedSelectionTextConfig = this.stateControl.stateView.customCollapsedSelectionTextConfig;
    this.$p_lastIsDraggingSelection = this.$p_isDraggingSelection;
    this.$p_virtualSelectionDisposable?.dispose();
    const virtualSelectionDisposable = Disposable();
    this.$p_virtualSelectionDisposable = virtualSelectionDisposable;
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.stateControl.stateView.selection);
    const { selectionRanges } = this.stateControl.stateView.selection;
    if (selectionRanges.length === 0) {
      this.$p_selectionView$(
        Push({
          viewCursorAndRangeInfos: {
            viewCursorAndRangeInfosForSelectionRanges: [],
            isDragging: this.$p_isDraggingSelection,
          },
          renderSync: false,
        }),
      );
      return;
    }
    const viewCursorAndRangeInfosForSelectionRangeSources = selectionRanges.map((selectionRange) => {
      assertIsNotNullish(focusSelectionRange);
      const viewCursorAndRangeInfosForSelectionRange$ = this.$p_makeViewCursorAndRangeInfosForSelectionRange(
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
            isDragging: this.$p_isDraggingSelection,
          },
          renderSync: !this.$p_renderOverlayAsync && (!isFirefox || i === 0),
        }),
      ),
      subscribe(this.$p_selectionView$),
    );
  }
  private $p_makeViewCursorAndRangeInfosForSelectionRange(
    selectionRange: matita.SelectionRange,
    isFocusSelectionRange: boolean,
    disposable: Disposable,
  ): Source<ViewCursorAndRangeInfosForSelectionRange> {
    const isInComposition = this.$p_inputControl.getIsInComposition();
    const viewCursorAndRangeInfoForRangeSources = selectionRange.ranges.map((range) => {
      const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
      const viewCursorAndRangeInfosForRange$ = this.$p_makeViewCursorAndRangeInfosForRange(
        range,
        range.id === selectionRange.anchorRangeId,
        range.id === selectionRange.focusRangeId,
        isFocusSelectionRange,
        lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
          this.isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.expirationId),
        isInComposition,
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
          isInComposition,
          roundCorners: isFirefox,
        }),
      ),
    );
  }
  private $p_calculateRelativeOffsets(): { relativeOffsetLeft: number; relativeOffsetTop: number } {
    const scrollContainer = this.$p_getScrollContainer();
    const { visibleLeft } = this.$p_getVisibleLeftAndRight();
    const { visibleTop } = this.$p_getVisibleTopAndBottom();
    const relativeOffsetLeft = scrollContainer.scrollLeft + visibleLeft;
    const relativeOffsetTop = scrollContainer.scrollTop + visibleTop;
    return {
      relativeOffsetLeft,
      relativeOffsetTop,
    };
  }
  private $p_calculateViewRangeInfosForParagraphAtBlockReference(
    paragraphReference: matita.BlockReference,
    includedParagraphStartOffset: number,
    includedParagraphEndOffset: number,
    isLastParagraphInRange: boolean,
    containerWidth: number,
    relativeOffsetLeft: number,
    relativeOffsetTop: number,
    paragraphMeasurement: AbsoluteParagraphMeasurement,
  ): ViewRangeInfo[] {
    const visibleLineBreakPadding = 9;
    const viewRangeInfos: ViewRangeInfo[] = [];
    for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
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
          let lineRect: ViewRectangle | undefined;
          if (measuredParagraphLineRange.characterRectangles.length === 0) {
            const lineRectLeft = measuredParagraphLineRange.boundingRect.left + relativeOffsetLeft;
            if (lineRectLeft < containerWidth) {
              lineRect = makeViewRectangle(
                lineRectLeft,
                measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
                Math.min(containerWidth - lineRectLeft, visibleLineBreakPadding),
                measuredParagraphLineRange.boundingRect.height,
              );
            }
          } else {
            const lineRectLeft = measuredParagraphLineRange.boundingRect.right + relativeOffsetLeft;
            if (lineRectLeft < containerWidth) {
              lineRect = makeViewRectangle(
                lineRectLeft,
                measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
                Math.min(containerWidth - lineRectLeft, visibleLineBreakPadding),
                measuredParagraphLineRange.boundingRect.height,
              );
            }
          }
          if (lineRect !== undefined) {
            viewRangeInfos.push({
              rectangle: lineRect,
              paragraphLineIndex: i,
              startOffset: 0,
              endOffset: 0,
              paragraphReference,
            });
          }
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
        lineRectWidth += visibleLineBreakPadding;
      } else if (includedLineStartOffset === includedLineEndOffset) {
        continue;
      }
      if (lineRectLeft < containerWidth) {
        viewRangeInfos.push({
          rectangle: makeViewRectangle(lineRectLeft, lineRectTop, Math.min(containerWidth - lineRectLeft, lineRectWidth), lineRectHeight),
          paragraphLineIndex: i,
          startOffset: includedLineStartOffset,
          endOffset: includedLineEndOffset,
          paragraphReference,
        });
      }
    }
    return viewRangeInfos;
  }
  private $p_calculateTextDecorationInfosForParagraphAtBlockReference(
    paragraphReference: matita.BlockReference,
    includedParagraphStartOffset: number,
    includedParagraphEndOffset: number,
    containerWidth: number,
    relativeOffsetLeft: number,
    relativeOffsetTop: number,
    paragraphMeasurement: AbsoluteParagraphMeasurement,
  ): TextDecorationInfo[] {
    const textDecorationInfos: TextDecorationInfo[] = [];
    for (let i = 0; i < paragraphMeasurement.measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.measuredParagraphLineRanges[i];
      const includedLineStartOffset = Math.max(measuredParagraphLineRange.startOffset, includedParagraphStartOffset);
      const includedLineEndOffset = Math.min(measuredParagraphLineRange.endOffset, includedParagraphEndOffset);
      if (
        includedLineStartOffset === includedLineEndOffset ||
        includedLineStartOffset > measuredParagraphLineRange.endOffset ||
        includedLineEndOffset < measuredParagraphLineRange.startOffset ||
        includedLineStartOffset === measuredParagraphLineRange.endOffset
      ) {
        continue;
      }
      const lineRectLeft =
        measuredParagraphLineRange.characterRectangles[includedLineStartOffset - measuredParagraphLineRange.startOffset].left + relativeOffsetLeft;
      let characterTopMinimum = Infinity;
      let characterBottomMaximum = -Infinity;
      for (let j = includedLineStartOffset; j < includedLineEndOffset; j++) {
        const characterRectangle = measuredParagraphLineRange.characterRectangles[j - measuredParagraphLineRange.startOffset];
        if (characterRectangle.top < characterTopMinimum) {
          characterTopMinimum = characterRectangle.top;
        }
        if (characterRectangle.bottom > characterBottomMaximum) {
          characterBottomMaximum = characterRectangle.bottom;
        }
      }
      const lineRectTop = characterTopMinimum + relativeOffsetTop;
      const lineRectHeight = characterBottomMaximum - characterTopMinimum;
      const lineRectWidth =
        measuredParagraphLineRange.characterRectangles[includedLineEndOffset - measuredParagraphLineRange.startOffset - 1].right +
        relativeOffsetLeft -
        lineRectLeft;
      const restrictedWidth = Math.min(containerWidth - lineRectLeft, lineRectWidth);
      if (lineRectLeft < containerWidth) {
        textDecorationInfos.push({
          charactersBoundingRectangle: makeViewRectangle(lineRectLeft, lineRectTop, restrictedWidth, lineRectHeight),
          charactersLineBoundingRectangle: makeViewRectangle(
            lineRectLeft,
            measuredParagraphLineRange.boundingRect.top + relativeOffsetTop,
            restrictedWidth,
            measuredParagraphLineRange.boundingRect.height,
          ),
          paragraphReference,
        });
      }
    }
    return textDecorationInfos;
  }
  private $p_getBufferMarginTopBottom(): number {
    return Math.min(600, window.innerHeight);
  }
  // TODO: Fix this mess.
  // TODO: check works when removing paragraphs?
  // TODO: Batch ranges w/ binary search?
  // TODO: Make general control for underlays/overlays (combine logic for selection, search, spelling, errors, warnings, conflicts, etc.).
  private $p_makeViewCursorAndRangeInfosForRange(
    range: matita.Range,
    isAnchor: boolean,
    isFocus: boolean,
    isFocusSelectionRange: boolean,
    isMarkedLineWrapFocusCursorWrapToNextLine: boolean,
    isInComposition: boolean,
    disposable: Disposable,
    selectionRange: matita.SelectionRange,
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
    for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.stateControl.stateView.document, contentReference, i);
      matita.assertIsParagraph(paragraph);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      observedParagraphReferences.push(paragraphReference);
    }
    const marginTopBottom = this.$p_getBufferMarginTopBottom();
    pipe(
      fromReactiveValue<[globalThis.Event]>((callback, disposable) => addWindowEventListener('scroll', callback, disposable, { passive: true })),
      throttle(() => timer(16)),
      subscribe((event) => {
        assert(event.type === PushType);
        viewCursorAndRangeInfosForRange$(Push(calculateViewCursorAndRangeInfosForVisibleParagraphsManually()));
      }, disposable),
    );
    const calculateViewRangeInfosForParagraphAtIndex = (
      observedParagraphIndex: number,
      containerWidth: number,
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
      return this.$p_calculateViewRangeInfosForParagraphAtBlockReference(
        paragraphReference,
        includedParagraphStartOffset,
        includedParagraphEndOffset,
        i === lastParagraphIndex,
        containerWidth,
        relativeOffsetLeft,
        relativeOffsetTop,
        this.$p_measureParagraphAtParagraphReference(paragraphReference),
      );
    };
    const focusPoint = matita.getFocusPointFromRange(range);
    matita.assertIsParagraphPoint(focusPoint);
    const focusParagraphReference = matita.makeBlockReferenceFromParagraphPoint(focusPoint);
    const compositionUpdateData = getSelectionRangeCompositionUpdateDataValue(selectionRange.data);
    let compositionRenderedSelectionRange: { startOffset: number; endOffset: number } | undefined;
    if (
      compositionUpdateData !== undefined &&
      this.isSelectionSecondaryDataExpirationIdActive(compositionUpdateData.expirationId) &&
      matita.areParagraphPointsAtSameParagraph(firstPoint, lastPoint) &&
      compositionUpdateData.selectionStartOffsetAdjustAmount >= 0 &&
      compositionUpdateData.selectionEndOffsetAdjustAmount <= 0 &&
      compositionUpdateData.selectionStartOffsetAdjustAmount - compositionUpdateData.selectionEndOffsetAdjustAmount <= lastPoint.offset - firstPoint.offset
    ) {
      compositionRenderedSelectionRange = {
        startOffset: firstPoint.offset + compositionUpdateData.selectionStartOffsetAdjustAmount,
        endOffset: lastPoint.offset + compositionUpdateData.selectionEndOffsetAdjustAmount,
      };
    }
    const calculateViewCursorInfoForFocusPoint = (containerWidth: number, relativeOffsetLeft: number, relativeOffsetTop: number): ViewCursorInfo => {
      const cursorPoint =
        compositionRenderedSelectionRange === undefined
          ? focusPoint
          : matita.changeParagraphPointOffset(firstPoint, compositionRenderedSelectionRange.endOffset);
      const cursorPositionAndHeight = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(cursorPoint, isMarkedLineWrapFocusCursorWrapToNextLine);
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
          cursorPositionAndHeight.measuredParagraphLineRanges,
          cursorPositionAndHeight.measuredParagraphLineRangeIndex,
        );
        cursorTop = cursorTopAndHeight.top + relativeOffsetTop;
        cursorHeight = cursorTopAndHeight.height;
      } else {
        cursorTop = cursorPositionAndHeight.position.top + relativeOffsetTop;
        cursorHeight = cursorPositionAndHeight.height;
      }
      const cursorLeft = Math.min(containerWidth - cursorWidth / 2, cursorPositionAndHeight.position.left + relativeOffsetLeft);
      const viewCursorInfo: ViewCursorInfo = {
        position: {
          left: cursorLeft,
          top: cursorTop,
        },
        height: cursorHeight,
        isAnchor,
        isFocus,
        isItalic: isCollapsed && insertTextConfig.italic === true,
        paragraphReference: focusParagraphReference,
        offset: cursorPoint.offset,
        rangeDirection: direction,
        insertTextConfig,
      };
      // TODO: Refactor so this function is pure?
      if (isFocusSelectionRange) {
        this.$p_inputControl.setPositionAndHeight(Math.min(cursorLeft, containerWidth - 32), cursorTop, cursorHeight);
      }
      return viewCursorInfo;
    };
    const calculateViewCursorAndRangeInfosForKnownVisibleParagraphs = (visibleStartIndex: number, visibleEndIndex: number): ViewCursorAndRangeInfosForRange => {
      const containerWidth = this.$p_getContainerScrollWidth();
      const { relativeOffsetLeft, relativeOffsetTop } = this.$p_calculateRelativeOffsets();
      const viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[] = [];
      if (direction === matita.RangeDirection.NeutralText) {
        const viewCursorInfo = calculateViewCursorInfoForFocusPoint(containerWidth, relativeOffsetLeft, relativeOffsetTop);
        viewParagraphInfos.push({
          paragraphReference: focusParagraphReference,
          viewRangeInfos: [],
          viewCursorInfos: [viewCursorInfo],
        });
      } else {
        for (let i = visibleStartIndex; i <= visibleEndIndex; i++) {
          const paragraphReference = observedParagraphReferences[i];
          const viewRangeInfos = calculateViewRangeInfosForParagraphAtIndex(i, containerWidth, relativeOffsetLeft, relativeOffsetTop);
          const viewCursorInfos: ViewCursorInfo[] = [];
          if (isFocus && matita.areBlockReferencesAtSameBlock(paragraphReference, focusParagraphReference)) {
            viewCursorInfos.push(calculateViewCursorInfoForFocusPoint(containerWidth, relativeOffsetLeft, relativeOffsetTop));
          }
          viewParagraphInfos.push({
            paragraphReference,
            viewRangeInfos,
            viewCursorInfos,
          });
        }
      }
      let compositionRangeInfos: ViewRangeInfosForParagraphInRange | undefined;
      if (compositionRenderedSelectionRange !== undefined) {
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
        compositionRangeInfos = {
          paragraphReference,
          viewRangeInfos: this.$p_calculateViewRangeInfosForParagraphAtBlockReference(
            paragraphReference,
            compositionRenderedSelectionRange.startOffset,
            compositionRenderedSelectionRange.endOffset,
            true,
            containerWidth,
            relativeOffsetLeft,
            relativeOffsetTop,
            this.$p_measureParagraphAtParagraphReference(paragraphReference),
          ),
        };
      }
      return {
        viewParagraphInfos,
        compositionRangeInfos,
      };
    };
    const calculateViewCursorAndRangeInfosForVisibleParagraphsManually = (): ViewCursorAndRangeInfosForRange => {
      const { visibleTop, visibleBottom } = this.$p_getVisibleTopAndBottom();
      const startIndex = Math.max(
        0,
        indexOfNearestLessThanEq(observedParagraphReferences, visibleTop - marginTopBottom, this.$p_compareParagraphTopToOffsetTop.bind(this)) - 1,
      );
      const endIndex = Math.min(
        observedParagraphReferences.length - 1,
        indexOfNearestLessThanEq(observedParagraphReferences, visibleBottom + marginTopBottom, this.$p_compareParagraphTopToOffsetTop.bind(this), startIndex) +
          1,
      );
      return calculateViewCursorAndRangeInfosForKnownVisibleParagraphs(startIndex, endIndex);
    };
    const viewCursorAndRangeInfosForRange$ = CurrentValueDistributor<ViewCursorAndRangeInfosForRange>(
      calculateViewCursorAndRangeInfosForVisibleParagraphsManually(),
    );
    return viewCursorAndRangeInfosForRange$;
  }
  private $p_dispose(): void {
    this.rootHtmlElement.removeChild(this.$p_containerHtmlElement);
  }
}
const rootHtmlElement = document.querySelector('#myEditor');
assertIsNotNullish(rootHtmlElement);
// eslint-disable-next-line import/order, import/no-unresolved
import dummyText from './dummyText.txt?raw';
// eslint-disable-next-line @typescript-eslint/no-floating-promises
makePromiseResolvingToNativeIntlSegmenterOrPolyfill().then((IntlSegmenter) => {
  const stateControlConfig: matita.StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = {
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
