import { RefObject, createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Children, createContext, useContext } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { v4 } from 'uuid';
import { isFirefox, isSafari } from './common/browserDetection';
import { IndexableUniqueStringList } from './common/IndexableUniqueStringList';
import { IntlSegmenter, makePromiseResolvingToNativeIntlSegmenterOrPolyfill } from './common/IntlSegmenter';
import { LeftRightComparisonResult } from './common/LeftRightCompare';
import { LruCache } from './common/LruCache';
import { UniqueStringQueue } from './common/UniqueStringQueue';
import { isValidHttpUrl, sanitizeUrl } from './common/urls';
import { assert, assertIsNotNullish, assertUnreachable, groupArray, omit, throwNotImplemented, throwUnreachable } from './common/util';
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
const enum StoredListStyleType {
  UnorderedList = 'ul',
  OrderedList = 'ol',
  Checklist = 'checklist',
}
const enum OrderedListStyle {
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
const orderedListStyleCharacterSets = [
  new Set('0123456789'),
  new Set('abcdefghijklmnopqrstuvwxyz'),
  new Set('αβγδεζηθικλμνξοπρστυφχψω'),
  new Set('cdilmvx'),
  new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  new Set('ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'),
  new Set('CDILMVX'),
];
function isOneOfOrderedListStyleCharacterSets(string: string): boolean {
  return orderedListStyleCharacterSets.some((orderedListStyleCharacterSet) => {
    for (let i = 0; i < string.length; i++) {
      const character = string[i];
      if (!orderedListStyleCharacterSet.has(character)) {
        return false;
      }
    }
    return true;
  });
}
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
const orderedListStyleFirstChars: Record<string, OrderedListStyle> = {
  '1.': OrderedListStyle.Decimal,
  [`${makeLowerAlphaListMarkerText(1)}.`]: OrderedListStyle.LowerAlpha,
  [`${makeLowerGreekListMarkerText(1)}.`]: OrderedListStyle.LowerGreek,
  [`${romanize(1)}.`.toLowerCase()]: OrderedListStyle.LowerRoman,
  [`${makeUpperAlphaListMarkerText(1)}.`]: OrderedListStyle.UpperAlpha,
  [`${makeUpperGreekListMarkerText(1)}.`]: OrderedListStyle.UpperGreek,
  [`${romanize(1)}.`]: OrderedListStyle.UpperRoman,
};
function getListMarkerTextWithoutPoint(number: number, style: OrderedListStyle): string {
  switch (style) {
    case OrderedListStyle.Decimal: {
      return String(number);
    }
    case OrderedListStyle.LowerAlpha: {
      return makeLowerAlphaListMarkerText(number);
    }
    case OrderedListStyle.UpperAlpha: {
      return makeUpperAlphaListMarkerText(number);
    }
    case OrderedListStyle.LowerRoman: {
      return romanize(number).toLowerCase();
    }
    case OrderedListStyle.UpperRoman: {
      return romanize(number);
    }
    case OrderedListStyle.LowerGreek: {
      return makeLowerGreekListMarkerText(number);
    }
    case OrderedListStyle.UpperGreek: {
      return makeUpperGreekListMarkerText(number);
    }
  }
}
const enum AccessedListStyleType {
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
const enum ParagraphType {
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
const acceptedParagraphTypes = [
  ParagraphType.ListItem,
  ParagraphType.Quote,
  ParagraphType.Indent1,
  ParagraphType.IndentHanging1,
  ParagraphType.IndentFirstLine1,
  ParagraphType.Heading1,
  ParagraphType.Heading2,
  ParagraphType.Heading3,
  ParagraphType.Heading4,
  ParagraphType.Heading5,
  ParagraphType.Heading6,
];
const enum StoredParagraphAlignment {
  Center = 'center',
  Right = 'right',
  Justify = 'justify',
}
const enum AccessedParagraphAlignment {
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
const enum EmbedType {
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
const enum CodeLanguage {
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
const enum Color {
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
const linkFontColor = 'rgb(26, 115, 232)';
const enum TextConfigScript {
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
const enum VoidType {
  Image = 'image',
  FootnoteMarker = 'footnoteMarker',
  FileChip = 'fileChip',
  AudioChip = 'audioChip',
  Latex = 'latex',
}
const enum StoredVoidImageAlignment {
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
  $m_textStart: number;
  $m_textEnd: number;
  $m_textNode: Node;
  $m_endsWithLineBreak: boolean;
}
const getTextConfigTextRunSizingKey = (textConfig: TextConfig): string => {
  return [textConfig.script, textConfig.code].join('|');
};
interface ParagraphStyleInjection {
  $m_ListItem_type?: AccessedListStyleType;
  $m_ListItem_OrderedList_number?: number;
  $m_ListItem_OrderedList_style?: OrderedListStyle;
}
class VirtualizedParagraphRenderControl extends DisposableClass implements matita.ParagraphRenderControl {
  $m_paragraphReference: matita.BlockReference;
  private $p_viewControl: VirtualizedViewControl;
  $m_containerHtmlElement: HTMLElement;
  private $p_textContainerElement!: HTMLElement;
  $m_textNodeInfos: TextElementInfo[] = [];
  private $p_baseFontSize = 16;
  private $p_fontSize = this.$p_baseFontSize;
  private $p_lineHeight = 2;
  private $p_scriptFontSizeMultiplier = 0.85;
  private $p_dirtyChildren = true;
  private $p_dirtyContainer = true;
  constructor(paragraphReference: matita.BlockReference, viewControl: VirtualizedViewControl) {
    super();
    this.$m_paragraphReference = paragraphReference;
    this.$p_viewControl = viewControl;
    this.$m_containerHtmlElement = this.$p_makeContainerHtmlElement();
    this.$p_textContainerElement = this.$m_containerHtmlElement;
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
  get $m_fontSize(): number {
    return this.$p_fontSize;
  }
  $m_convertLineTopAndHeightAndInsertTextConfigAndMeasurementsToCursorTopAndHeightAndMaybeColor(
    lineTop: number,
    lineHeight: number,
    insertTextConfig: TextConfig,
    measuredParagraphLineRanges: MeasuredParagraphLineRange[],
    measuredParagraphLineRangeIndex: number,
  ): { $m_top: number; $m_height: number; $m_color?: string } {
    const insertLink = insertTextConfig.link;
    const insertColor = insertTextConfig.color;
    const hasLink = typeof insertLink === 'string' && insertLink !== '';
    const color = hasLink ? linkFontColor : (colors as (string | undefined)[]).includes(insertColor) ? colorHexValues[insertColor as Color] : undefined;
    const measuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
    if (measuredParagraphLineRange.$m_startOffset !== measuredParagraphLineRange.$m_endOffset) {
      const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
      const paragraph = matita.accessBlockFromBlockReference(documentRenderControl.$m_stateControl.stateView.document, this.$m_paragraphReference);
      matita.assertIsParagraph(paragraph);
      const sizingKey = getTextConfigTextRunSizingKey(insertTextConfig);
      for (const inlineNodeWithStartOffset of matita.iterateParagraphChildrenWholeWithStartOffset(
        paragraph,
        measuredParagraphLineRange.$m_startOffset,
        measuredParagraphLineRange.$m_endOffset,
      )) {
        if (matita.isText(inlineNodeWithStartOffset.inline) && getTextConfigTextRunSizingKey(inlineNodeWithStartOffset.inline.config) === sizingKey) {
          const characterMeasurementIndex = Math.max(inlineNodeWithStartOffset.startOffset - measuredParagraphLineRange.$m_startOffset, 0);
          const characterRectangle = measuredParagraphLineRange.$m_characterRectangles[characterMeasurementIndex];
          assertIsNotNullish(characterRectangle);
          return { $m_top: characterRectangle.$m_top, $m_height: characterRectangle.$m_height, $m_color: color };
        }
      }
    }
    // The line is empty, so we guess the positioning of the cursor.
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
    return { $m_top: top, $m_height: height, $m_color: color };
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
    let isUnderline = false;
    if (typeof textConfig.link === 'string' && textConfig.link !== '') {
      isUnderline = true;
      textElement.style.color = linkFontColor;
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
    if (textConfig.highlightColor !== undefined && colors.includes(textConfig.highlightColor)) {
      textElement.style.backgroundColor = highlightColorHexValues[textConfig.highlightColor];
    }
  }
  private $p_accessParagraph(): matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    const paragraph = matita.accessBlockFromBlockReference(documentRenderControl.$m_stateControl.stateView.document, this.$m_paragraphReference);
    matita.assertIsParagraph(paragraph);
    return paragraph;
  }
  private $p_previousRenderedConfig: ParagraphConfig | undefined;
  private $p_previousInjectedStyle: ParagraphStyleInjection | undefined;
  private $p_makeListMarker(paragraphConfig: ParagraphConfig, injectedStyle: ParagraphStyleInjection): HTMLElement {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(
      matita.accessContentFromContentReference(documentRenderControl.$m_stateControl.stateView.document, documentRenderControl.$m_topLevelContentReference)
        .config,
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
        assertIsNotNullish(injectedStyle.$m_ListItem_OrderedList_number);
        assertIsNotNullish(injectedStyle.$m_ListItem_OrderedList_style);
        const number = injectedStyle.$m_ListItem_OrderedList_number;
        const style = injectedStyle.$m_ListItem_OrderedList_style;
        const listMarkerText = getListMarkerTextWithoutPoint(number, style);
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
  $m_listMarkerElement: HTMLElement | null = null;
  private $p_getPaddingLeftStyleFromListIndent(listIndent: number): string {
    return `${16 + 32 * listIndent}px`;
  }
  private $p_updateContainer(injectedStyle: ParagraphStyleInjection): void {
    const paragraph = this.$p_accessParagraph();
    const previousAccessedParagraphAlignment =
      this.$p_previousRenderedConfig && convertStoredParagraphAlignmentToAccessedParagraphAlignment(this.$p_previousRenderedConfig.alignment);
    const accessedParagraphAlignment = convertStoredParagraphAlignmentToAccessedParagraphAlignment(paragraph.config.alignment);
    if (previousAccessedParagraphAlignment !== accessedParagraphAlignment) {
      this.$m_containerHtmlElement.style.textAlign = accessedParagraphAlignment;
      if (isSafari) {
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.$m_containerHtmlElement.style.whiteSpace = 'pre-wrap';
        } else if (previousAccessedParagraphAlignment === AccessedParagraphAlignment.Justify) {
          this.$m_containerHtmlElement.style.whiteSpace = 'break-spaces';
        }
      }
    }
    if (this.$p_previousRenderedConfig === undefined || this.$p_previousRenderedConfig.type !== paragraph.config.type) {
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.ListItem) {
        this.$m_containerHtmlElement.style.display = '';
        this.$m_containerHtmlElement.style.justifyContent = '';
        this.$m_containerHtmlElement.style.gap = '';
        this.$m_containerHtmlElement.style.paddingLeft = '';
        this.$m_containerHtmlElement.style.color = '';
        this.$p_textContainerElement.style.textDecoration = '';
        this.$m_containerHtmlElement.replaceChildren(...this.$p_textContainerElement.childNodes);
        this.$p_textContainerElement = this.$m_containerHtmlElement;
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.Quote) {
        this.$m_containerHtmlElement.style.display = '';
        this.$m_containerHtmlElement.style.width = '';
        this.$m_containerHtmlElement.style.color = '';
        this.$m_containerHtmlElement.style.borderLeft = '';
        this.$m_containerHtmlElement.style.paddingLeft = '';
        this.$m_containerHtmlElement.style.marginLeft = '';
        this.$m_containerHtmlElement.style.marginRight = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.Indent1) {
        this.$m_containerHtmlElement.style.paddingLeft = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.IndentFirstLine1) {
        this.$m_containerHtmlElement.style.textIndent = '';
      }
      if (this.$p_previousRenderedConfig !== undefined && this.$p_previousRenderedConfig.type === ParagraphType.IndentHanging1) {
        this.$m_containerHtmlElement.style.paddingLeft = '';
        this.$m_containerHtmlElement.style.textIndent = '';
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
        this.$m_containerHtmlElement.style.fontWeight = '';
        this.$p_fontSize = this.$p_baseFontSize;
        this.$m_containerHtmlElement.style.fontSize = `${this.$p_baseFontSize}px`;
      }
      switch (paragraph.config.type) {
        case undefined: {
          break;
        }
        case ParagraphType.Quote: {
          this.$m_containerHtmlElement.style.color = '#57606a';
          this.$m_containerHtmlElement.style.borderLeft = '0.2em solid #222';
          this.$m_containerHtmlElement.style.paddingLeft = '12px';
          if (accessedParagraphAlignment === AccessedParagraphAlignment.Center || accessedParagraphAlignment === AccessedParagraphAlignment.Right) {
            this.$m_containerHtmlElement.style.width = 'auto';
            this.$m_containerHtmlElement.style.display = 'table';
            this.$m_containerHtmlElement.style.marginLeft = 'auto';
          }
          if (accessedParagraphAlignment === AccessedParagraphAlignment.Center) {
            this.$m_containerHtmlElement.style.marginRight = 'auto';
          }
          break;
        }
        case ParagraphType.Indent1: {
          this.$m_containerHtmlElement.style.paddingLeft = '32px';
          break;
        }
        case ParagraphType.IndentFirstLine1: {
          this.$m_containerHtmlElement.style.textIndent = '32px';
          break;
        }
        case ParagraphType.IndentHanging1: {
          this.$m_containerHtmlElement.style.paddingLeft = '32px';
          this.$m_containerHtmlElement.style.textIndent = '-32px';
          break;
        }
        case ParagraphType.Heading1: {
          this.$p_fontSize = 2 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.Heading2: {
          this.$p_fontSize = 1.5 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.Heading3: {
          this.$p_fontSize = 1.25 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.Heading4: {
          this.$p_fontSize = 1.1 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.Heading5: {
          this.$p_fontSize = 0.94 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.Heading6: {
          this.$p_fontSize = 0.85 * this.$p_baseFontSize;
          this.$m_containerHtmlElement.style.fontWeight = 'bold';
          this.$m_containerHtmlElement.style.fontSize = `${this.$m_fontSize}px`;
          break;
        }
        case ParagraphType.ListItem: {
          this.$p_textContainerElement = document.createElement('span');
          this.$p_textContainerElement.append(...this.$m_containerHtmlElement.childNodes);
          this.$m_containerHtmlElement.style.display = 'flex';
          const justifyContent =
            accessedParagraphAlignment === AccessedParagraphAlignment.Right
              ? 'end'
              : accessedParagraphAlignment === AccessedParagraphAlignment.Center
              ? 'center'
              : 'start';
          this.$m_containerHtmlElement.style.justifyContent = justifyContent;
          this.$m_containerHtmlElement.style.gap = '0.5em';
          this.$m_containerHtmlElement.style.paddingLeft = this.$p_getPaddingLeftStyleFromListIndent(
            convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel),
          );
          this.$m_listMarkerElement = this.$p_makeListMarker(paragraph.config, injectedStyle);
          this.$m_containerHtmlElement.append(this.$m_listMarkerElement, this.$p_textContainerElement);
          if (injectedStyle.$m_ListItem_type === AccessedListStyleType.Checklist && paragraph.config.ListItem_Checklist_checked === true) {
            this.$m_containerHtmlElement.style.color = '#888';
            this.$p_textContainerElement.style.textDecoration = 'line-through';
          }
          break;
        }
        default: {
          console.error('bad paragraph type', paragraph.config.type);
        }
      }
    } else {
      assertIsNotNullish(this.$p_previousInjectedStyle);
      if (paragraph.config.type === ParagraphType.Quote) {
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Center || accessedParagraphAlignment === AccessedParagraphAlignment.Right) {
          this.$m_containerHtmlElement.style.width = 'auto';
          this.$m_containerHtmlElement.style.display = 'table';
          this.$m_containerHtmlElement.style.marginLeft = 'auto';
        } else {
          this.$m_containerHtmlElement.style.width = '';
          this.$m_containerHtmlElement.style.display = '';
          this.$m_containerHtmlElement.style.marginLeft = '';
        }
        if (accessedParagraphAlignment === AccessedParagraphAlignment.Center) {
          this.$m_containerHtmlElement.style.marginRight = 'auto';
        } else {
          this.$m_containerHtmlElement.style.marginRight = '';
        }
      }
      if (paragraph.config.type === ParagraphType.ListItem) {
        assertIsNotNullish(this.$m_listMarkerElement);
        assertIsNotNullish(this.$p_previousInjectedStyle.$m_ListItem_type);
        assertIsNotNullish(injectedStyle.$m_ListItem_type);
        const recreateMarker =
          this.$p_previousInjectedStyle.$m_ListItem_type !== injectedStyle.$m_ListItem_type ||
          this.$p_previousInjectedStyle.$m_ListItem_OrderedList_number !== injectedStyle.$m_ListItem_OrderedList_number ||
          this.$p_previousInjectedStyle.$m_ListItem_OrderedList_style !== injectedStyle.$m_ListItem_OrderedList_style;
        if (recreateMarker) {
          const previousListMarkerElement = this.$m_listMarkerElement;
          this.$m_listMarkerElement = this.$p_makeListMarker(paragraph.config, injectedStyle);
          previousListMarkerElement.replaceWith(this.$m_listMarkerElement);
        }
        const justifyContent =
          accessedParagraphAlignment === AccessedParagraphAlignment.Right
            ? 'end'
            : accessedParagraphAlignment === AccessedParagraphAlignment.Center
            ? 'center'
            : 'start';
        this.$m_containerHtmlElement.style.justifyContent = justifyContent;
        const previousListIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(this.$p_previousRenderedConfig.ListItem_indentLevel);
        const listIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel);
        if (previousListIndentLevel !== listIndentLevel) {
          this.$m_containerHtmlElement.style.paddingLeft = this.$p_getPaddingLeftStyleFromListIndent(listIndentLevel);
        }
        if (
          injectedStyle.$m_ListItem_type === AccessedListStyleType.Checklist &&
          !recreateMarker &&
          this.$p_previousRenderedConfig.ListItem_Checklist_checked !== paragraph.config.ListItem_Checklist_checked
        ) {
          if (paragraph.config.ListItem_Checklist_checked === true) {
            this.$m_listMarkerElement.classList.add('list-item--checklist__checkbox--checked');
          } else {
            this.$m_listMarkerElement.classList.remove('list-item--checklist__checkbox--checked');
          }
        }
        if (injectedStyle.$m_ListItem_type === AccessedListStyleType.Checklist && paragraph.config.ListItem_Checklist_checked) {
          this.$m_containerHtmlElement.style.color = '#888';
          this.$p_textContainerElement.style.textDecoration = 'line-through';
        } else {
          this.$m_containerHtmlElement.style.color = '';
          this.$p_textContainerElement.style.textDecoration = '';
        }
      }
    }
    if (paragraph.config.type !== ParagraphType.ListItem) {
      this.$m_listMarkerElement = null;
    }
    this.$p_previousRenderedConfig = paragraph.config;
    this.$p_previousInjectedStyle = injectedStyle;
  }
  private $p_updateChildren(): void {
    const paragraph = this.$p_accessParagraph();
    this.$m_textNodeInfos.length = 0;
    if (paragraph.children.length === 0) {
      const textNode = document.createTextNode('\u200b');
      this.$m_textNodeInfos.push({
        $m_textStart: 0,
        $m_textEnd: 0,
        $m_textNode: textNode,
        $m_endsWithLineBreak: false,
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
        if (indexOfNewline === 0 && this.$m_textNodeInfos.length > 0) {
          const isFirstAfterLineBreak_ = isFirstAfterLineBreak;
          isFirstAfterLineBreak = true;
          if (isFirstAfterLineBreak_) {
            const dummyTextElement = document.createElement('span');
            dummyTextElement.style.display = 'block';
            const textNode = document.createTextNode('\u200b');
            dummyTextElement.appendChild(textNode);
            newChildren.push(dummyTextElement);
            this.$m_textNodeInfos.push({
              $m_textStart: textStart,
              $m_textEnd: textStart,
              $m_textNode: textNode,
              $m_endsWithLineBreak: true,
            });
          } else {
            this.$m_textNodeInfos[this.$m_textNodeInfos.length - 1].$m_endsWithLineBreak = true;
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
        this.$m_textNodeInfos.push({
          $m_textStart: textStart,
          $m_textEnd: textEnd,
          $m_textNode: textNode,
          $m_endsWithLineBreak: true,
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
      this.$m_textNodeInfos.push({
        $m_textStart: textStart,
        $m_textEnd: textEnd,
        $m_textNode: textNode,
        $m_endsWithLineBreak: false,
      });
      textStart = textEnd;
    }
    if (isFirstAfterLineBreak) {
      const dummyTextElement = document.createElement('span');
      dummyTextElement.style.display = 'block';
      const textNode = document.createTextNode('\u200b');
      dummyTextElement.appendChild(textNode);
      newChildren.push(dummyTextElement);
      this.$m_textNodeInfos.push({
        $m_textStart: textStart,
        $m_textEnd: textStart,
        $m_textNode: textNode,
        $m_endsWithLineBreak: true,
      });
    }
    this.$p_textContainerElement.replaceChildren(...newChildren);
  }
  $m_onConfigOrChildrenChanged(isParagraphChildrenUpdated: boolean): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.$m_dirtyParagraphIdQueue.$m_queue(matita.getBlockIdFromBlockReference(this.$m_paragraphReference));
    if (isParagraphChildrenUpdated) {
      this.$p_dirtyChildren = true;
    } else {
      this.$p_dirtyContainer = true;
    }
  }
  $m_commitDirtyChanges(injectedStyle: ParagraphStyleInjection): void {
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
  $m_markDirtyContainer(): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.$m_relativeParagraphMeasurementCache.$m_invalidate(matita.getBlockIdFromBlockReference(this.$m_paragraphReference));
    this.$p_dirtyContainer = true;
  }
}
class VirtualizedContentRenderControl extends DisposableClass implements matita.ContentRenderControl {
  $m_contentReference: matita.ContentReference;
  private $p_viewControl: VirtualizedViewControl;
  $m_containerHtmlElement: HTMLElement;
  private $p_children: VirtualizedParagraphRenderControl[];
  constructor(contentReference: matita.ContentReference, viewControl: VirtualizedViewControl) {
    super();
    this.$m_contentReference = contentReference;
    this.$p_viewControl = viewControl;
    this.$m_containerHtmlElement = this.$p_makeContainerHtmlElement();
    this.$p_children = [];
    this.$p_init();
  }
  private $p_makeContainerHtmlElement(): HTMLElement {
    const containerHtmlElement = document.createElement('div');
    return containerHtmlElement;
  }
  private $p_init(): void {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    documentRenderControl.$m_htmlElementToNodeRenderControlMap.set(this.$m_containerHtmlElement, this);
    const numberOfBlocks = matita.getNumberOfBlocksInContentAtContentReference(
      documentRenderControl.$m_stateControl.stateView.document,
      this.$m_contentReference,
    );
    const documentFragment = document.createDocumentFragment();
    for (let i = 0; i < numberOfBlocks; i++) {
      const block = matita.accessBlockAtIndexInContentAtContentReference(documentRenderControl.$m_stateControl.stateView.document, this.$m_contentReference, i);
      matita.assertIsParagraph(block);
      const paragraphReference = matita.makeBlockReferenceFromBlock(block);
      const paragraphRenderControl = this.$p_makeParagraphRenderControl(paragraphReference);
      this.$p_children.push(paragraphRenderControl);
      documentFragment.appendChild(paragraphRenderControl.$m_containerHtmlElement);
    }
    this.$m_containerHtmlElement.appendChild(documentFragment);
  }
  private $p_makeParagraphRenderControl(paragraphReference: matita.BlockReference): VirtualizedParagraphRenderControl {
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    const paragraphRenderControl = new VirtualizedParagraphRenderControl(paragraphReference, this.$p_viewControl);
    this.add(paragraphRenderControl);
    this.$p_viewControl.renderControlRegister.registerParagraphRenderControl(paragraphRenderControl);
    documentRenderControl.$m_htmlElementToNodeRenderControlMap.set(paragraphRenderControl.$m_containerHtmlElement, paragraphRenderControl);
    documentRenderControl.$m_dirtyParagraphIdQueue.$m_queue(matita.getBlockIdFromBlockReference(paragraphReference));
    return paragraphRenderControl;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  $m_onConfigChanged(): void {}
  $m_onBlocksRemoved(blockReferences: matita.BlockReference[]): void {
    const firstBlockReference = blockReferences[0];
    const firstChildIndex = this.$p_children.findIndex((paragraphRenderControl) => {
      return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.$m_paragraphReference, firstBlockReference);
    });
    assert(firstChildIndex !== -1);
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const childIndex = firstChildIndex + i;
      const childRenderControl = this.$p_children[childIndex];
      documentRenderControl.$m_htmlElementToNodeRenderControlMap.delete(childRenderControl.$m_containerHtmlElement);
      documentRenderControl.$m_dirtyParagraphIdQueue.$m_dequeue(matita.getBlockIdFromBlockReference(childRenderControl.$m_paragraphReference));
      if (childRenderControl instanceof VirtualizedParagraphRenderControl) {
        this.$p_viewControl.renderControlRegister.unregisterParagraphRenderControl(childRenderControl);
      } else {
        throwNotImplemented();
      }
      childRenderControl.$m_containerHtmlElement.remove();
      childRenderControl.dispose();
    }
    this.$p_children.splice(firstChildIndex, blockReferences.length);
  }
  $m_onBlocksInsertedAfter(blockReferences: matita.BlockReference[], insertAfterBlockReference: matita.BlockReference | null): void {
    const insertionIndex =
      insertAfterBlockReference === null
        ? 0
        : this.$p_children.findIndex((paragraphRenderControl) => {
            return matita.areBlockReferencesAtSameBlock(paragraphRenderControl.$m_paragraphReference, insertAfterBlockReference);
          }) + 1;
    const childRenderControls: VirtualizedParagraphRenderControl[] = [];
    const documentFragment = document.createDocumentFragment();
    const documentRenderControl = this.$p_viewControl.accessDocumentRenderControl();
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(documentRenderControl.$m_stateControl.stateView.document, blockReference);
      let childRenderControl: VirtualizedParagraphRenderControl;
      if (matita.isParagraph(block)) {
        childRenderControl = this.$p_makeParagraphRenderControl(blockReference);
      } else {
        throwNotImplemented();
      }
      childRenderControls.push(childRenderControl);
      documentFragment.appendChild(childRenderControl.$m_containerHtmlElement);
    }
    this.$m_containerHtmlElement.insertBefore(
      documentFragment,
      insertionIndex === this.$p_children.length ? null : this.$p_children[insertionIndex].$m_containerHtmlElement,
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
  const { $m_htmlElementToNodeRenderControlMap: htmlElementToNodeRenderControlMap } = viewControl.accessDocumentRenderControl();
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
      if (isNone(currentValue) ? isNone(newMaybe) : isSome(newMaybe) && currentValue.$m_value === newMaybe.$m_value) {
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
    top: currentLineRect.$m_top,
    left: currentLineRect.$m_left,
    width: currentLineRect.$m_width,
    height: currentLineRect.$m_height,
    backgroundColor,
  };
  if (previousLineRect === undefined) {
    cssProperties.borderTopLeftRadius = borderRadius;
    cssProperties.borderTopRightRadius = borderRadius;
  } else {
    if (previousLineRect.$m_left !== currentLineRect.$m_left) {
      if (previousLineRect.$m_left < currentLineRect.$m_left && currentLineRect.$m_left <= previousLineRect.$m_right) {
        const restrictedBorderRadiusTopLeft = Math.min(borderRadius, (currentLineRect.$m_left - previousLineRect.$m_left) / 2);
        jsxElements.push(
          <span
            key={key + 'tl'}
            style={{
              position: 'absolute',
              top: currentLineRect.$m_top,
              left: currentLineRect.$m_left - restrictedBorderRadiusTopLeft,
              width: restrictedBorderRadiusTopLeft,
              height: restrictedBorderRadiusTopLeft,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at bottom left, transparent 0, transparent ${restrictedBorderRadiusTopLeft}px, ${backgroundColor} ${restrictedBorderRadiusTopLeft}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusTopLeft =
          previousLineRect.$m_left > currentLineRect.$m_left ? Math.min(borderRadius, (previousLineRect.$m_left - currentLineRect.$m_left) / 2) : borderRadius;
        cssProperties.borderTopLeftRadius = restrictedBorderRadiusTopLeft;
      }
    }
    if (previousLineRect.$m_right !== currentLineRect.$m_right) {
      if (previousLineRect.$m_left <= currentLineRect.$m_right && currentLineRect.$m_right < previousLineRect.$m_right) {
        const restrictedBorderRadiusTopRight = Math.min(borderRadius, (previousLineRect.$m_right - currentLineRect.$m_right) / 2);
        jsxElements.push(
          <span
            key={key + 'tr'}
            style={{
              position: 'absolute',
              top: currentLineRect.$m_top,
              left: currentLineRect.$m_right,
              width: restrictedBorderRadiusTopRight,
              height: restrictedBorderRadiusTopRight,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at bottom right, transparent 0, transparent ${restrictedBorderRadiusTopRight}px, ${backgroundColor} ${restrictedBorderRadiusTopRight}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusTopRight =
          currentLineRect.$m_right > previousLineRect.$m_right
            ? Math.min(borderRadius, (currentLineRect.$m_right - previousLineRect.$m_right) / 2)
            : borderRadius;
        cssProperties.borderTopRightRadius = restrictedBorderRadiusTopRight;
      }
    }
  }
  if (nextLineRect === undefined) {
    cssProperties.borderBottomLeftRadius = borderRadius;
    cssProperties.borderBottomRightRadius = borderRadius;
  } else {
    if (nextLineRect.$m_left !== currentLineRect.$m_left) {
      if (nextLineRect.$m_left < currentLineRect.$m_left && currentLineRect.$m_left <= nextLineRect.$m_right) {
        const restrictedBorderRadiusBottomLeft = Math.min(borderRadius, (currentLineRect.$m_left - nextLineRect.$m_left) / 2);
        jsxElements.push(
          <span
            key={key + 'bl'}
            style={{
              position: 'absolute',
              top: currentLineRect.$m_bottom - restrictedBorderRadiusBottomLeft,
              left: currentLineRect.$m_left - restrictedBorderRadiusBottomLeft,
              width: restrictedBorderRadiusBottomLeft,
              height: restrictedBorderRadiusBottomLeft,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at top left, transparent 0, transparent ${restrictedBorderRadiusBottomLeft}px, ${backgroundColor} ${restrictedBorderRadiusBottomLeft}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusBottomLeft =
          nextLineRect.$m_left > currentLineRect.$m_left ? Math.min(borderRadius, (nextLineRect.$m_left - currentLineRect.$m_left) / 2) : borderRadius;
        cssProperties.borderBottomLeftRadius = restrictedBorderRadiusBottomLeft;
      }
    }
    if (nextLineRect.$m_right !== currentLineRect.$m_right) {
      if (nextLineRect.$m_left <= currentLineRect.$m_right && currentLineRect.$m_right < nextLineRect.$m_right) {
        const restrictedBorderRadiusBottomRight = Math.min(borderRadius, (nextLineRect.$m_right - currentLineRect.$m_right) / 2);
        jsxElements.push(
          <span
            key={key + 'br'}
            style={{
              position: 'absolute',
              top: currentLineRect.$m_bottom - restrictedBorderRadiusBottomRight,
              left: currentLineRect.$m_right,
              width: restrictedBorderRadiusBottomRight,
              height: restrictedBorderRadiusBottomRight,
              // eslint-disable-next-line max-len
              background: `radial-gradient(circle at top right, transparent 0, transparent ${restrictedBorderRadiusBottomRight}px, ${backgroundColor} ${restrictedBorderRadiusBottomRight}px`,
            }}
          />,
        );
      } else {
        const restrictedBorderRadiusBottomRight =
          currentLineRect.$m_right > nextLineRect.$m_right ? Math.min(borderRadius, (currentLineRect.$m_right - nextLineRect.$m_right) / 2) : borderRadius;
        cssProperties.borderBottomRightRadius = restrictedBorderRadiusBottomRight;
      }
    }
  }
  jsxElements.push(<span key={key} style={cssProperties} />);
}
class UniqueKeyControl {
  private $p_keyCount = new Map<string, number>();
  $m_makeUniqueKey(key: string): string {
    const count = this.$p_keyCount.get(key);
    if (count !== undefined) {
      this.$p_keyCount.set(key, count + 1);
      return JSON.stringify([key, count]);
    }
    this.$p_keyCount.set(key, 1);
    return JSON.stringify([key, 0]);
  }
}
const enum HitPositionType {
  CheckboxMarker = 'CheckboxMarker',
  ParagraphText = 'ParagraphText',
}
interface CheckboxMarkerHitPosition {
  $m_type: HitPositionType.CheckboxMarker;
  $m_paragraphReference: matita.BlockReference;
}
interface ParagraphTextHitPosition {
  $m_type: HitPositionType.ParagraphText;
  $m_checkboxMarkerParagraphReference: matita.BlockReference | null;
  $m_pointWithContentReference: matita.PointWithContentReference;
  $m_isPastPreviousCharacterHalfPoint: boolean;
  $m_isWrappedLineStart: boolean;
  $m_isWrappedLinePreviousEnd: boolean;
}
type HitPosition = CheckboxMarkerHitPosition | ParagraphTextHitPosition;
interface ViewPosition {
  readonly $m_left: number;
  readonly $m_top: number;
}
interface ViewCursorInfo {
  $m_position: ViewPosition;
  $m_height: number;
  $m_isAnchor: boolean;
  $m_isFocus: boolean;
  $m_isItalic: boolean;
  $m_insertTextConfig: TextConfig;
  $m_paragraphReference: matita.BlockReference;
  $m_offset: number;
  $m_rangeDirection: matita.RangeDirection;
  $m_customColor?: string;
}
interface ViewRangeInfo {
  $m_rectangle: ViewRectangle;
  $m_paragraphLineIndex: number;
  $m_startOffset: number;
  $m_endOffset: number;
  $m_paragraphReference: matita.BlockReference;
}
interface ViewRangeInfosForParagraphInRange {
  $m_paragraphReference: matita.BlockReference;
  $m_viewRangeInfos: ViewRangeInfo[];
}
interface ViewCursorAndRangeInfosForParagraphInRange extends ViewRangeInfosForParagraphInRange {
  $m_viewCursorInfos: ViewCursorInfo[];
}
interface ViewCursorAndRangeInfosForRange {
  $m_viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[];
  $m_compositionRangeInfos?: ViewRangeInfosForParagraphInRange;
}
interface ViewCursorAndRangeInfosForSelectionRange {
  $m_viewCursorAndRangeInfosForRanges: ViewCursorAndRangeInfosForRange[];
  $m_selectionRangeId: string;
  $m_isInComposition: boolean;
  $m_roundCorners: boolean;
}
interface ViewCursorAndRangeInfos {
  $m_viewCursorAndRangeInfosForSelectionRanges: ViewCursorAndRangeInfosForSelectionRange[];
  $m_isDragging: boolean;
}
interface SelectionViewMessage {
  $m_viewCursorAndRangeInfos: ViewCursorAndRangeInfos;
  $m_renderSync: boolean;
}
interface SelectionViewProps {
  $m_selectionView$: Source<SelectionViewMessage>;
  $m_hasFocus$: Source<boolean>;
  $m_resetSynchronizedCursorVisibility$: Source<undefined>;
  $m_cursorElement: HTMLElement;
}
// TODO: Vanilla JS.
function SelectionView(props: SelectionViewProps): JSX.Element | null {
  const {
    $m_selectionView$: selectionView$,
    $m_hasFocus$: hasFocus$,
    $m_resetSynchronizedCursorVisibility$: resetSynchronizedCursorVisibility$,
    $m_cursorElement: cursorElement,
  } = props;
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
      return isSome(maybe) && maybe.$m_value.$m_renderSync;
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
  const hasFocus = isSome(hasFocusMaybe) && hasFocusMaybe.$m_value;
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
  const { $m_viewCursorAndRangeInfos: viewCursorAndRangeInfos } = selectionViewMaybe.$m_value;
  const { $m_viewCursorAndRangeInfosForSelectionRanges: viewCursorAndRangeInfosForSelectionRanges, $m_isDragging: isDragging } = viewCursorAndRangeInfos;
  if (viewCursorAndRangeInfosForSelectionRanges.length === 0) {
    return null;
  }
  const uniqueKeyControl = new UniqueKeyControl();
  const selectionRectElements: JSX.Element[] = [];
  const cursorElements: JSX.Element[] = [];
  for (let i = 0; i < viewCursorAndRangeInfosForSelectionRanges.length; i++) {
    const viewCursorAndRangeInfosForSelectionRange = viewCursorAndRangeInfosForSelectionRanges[i];
    const {
      $m_viewCursorAndRangeInfosForRanges: viewCursorAndRangeInfosForRanges,
      $m_isInComposition: isInComposition,
      $m_selectionRangeId: selectionRangeId,
      $m_roundCorners: roundCorners,
    } = viewCursorAndRangeInfosForSelectionRange;
    for (let j = 0; j < viewCursorAndRangeInfosForRanges.length; j++) {
      const viewCursorAndRangeInfosForRange = viewCursorAndRangeInfosForRanges[j];
      const { $m_viewParagraphInfos: viewParagraphInfos, $m_compositionRangeInfos: compositionRangeInfos } = viewCursorAndRangeInfosForRange;
      if (compositionRangeInfos !== undefined) {
        const { $m_viewRangeInfos: viewRangeInfos, $m_paragraphReference: paragraphReference } = compositionRangeInfos;
        for (let k = 0; k < viewRangeInfos.length; k++) {
          const viewRangeInfo = viewRangeInfos[k];
          const { $m_paragraphLineIndex: paragraphLineIndex, $m_rectangle: rectangle } = viewRangeInfo;
          const key = uniqueKeyControl.$m_makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, false, 2]));
          selectionRectElements.push(
            <span
              key={key}
              style={{
                position: 'absolute',
                top: rectangle.$m_top,
                left: rectangle.$m_left,
                width: rectangle.$m_width,
                height: rectangle.$m_height,
                backgroundColor: '#accef7cc',
              }}
            />,
          );
        }
      }
      for (let k = 0; k < viewParagraphInfos.length; k++) {
        const viewCursorAndRangeInfosForParagraphInRange = viewParagraphInfos[k];
        const {
          $m_viewCursorInfos: viewCursorInfos,
          $m_viewRangeInfos: viewRangeInfos,
          $m_paragraphReference: paragraphReference,
        } = viewCursorAndRangeInfosForParagraphInRange;
        for (let l = 0; l < viewRangeInfos.length; l++) {
          const viewRangeInfo = viewRangeInfos[l];
          const { $m_paragraphLineIndex: paragraphLineIndex, $m_rectangle: rectangle } = viewRangeInfo;
          const key = uniqueKeyControl.$m_makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, 0]));
          if (isInComposition) {
            selectionRectElements.push(
              <span
                key={uniqueKeyControl.$m_makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex, 1]))}
                style={{
                  position: 'absolute',
                  top: rectangle.$m_bottom - 2,
                  left: rectangle.$m_left,
                  width: rectangle.$m_width,
                  height: 2,
                  backgroundColor: '#222',
                }}
              />,
            );
            continue;
          }
          const backgroundColor = hasFocus || isDragging ? '#accef7cc' : '#d3d3d36c';
          if (roundCorners) {
            let previousLineRect = viewRangeInfos[l - 1]?.$m_rectangle as ViewRectangle | undefined;
            if (previousLineRect === undefined && k > 0) {
              const previousParagraphViewRangeInfos = viewCursorAndRangeInfosForRange.$m_viewParagraphInfos[k - 1].$m_viewRangeInfos;
              previousLineRect = previousParagraphViewRangeInfos[previousParagraphViewRangeInfos.length - 1]?.$m_rectangle;
            }
            let nextLineRect = viewRangeInfos[l + 1]?.$m_rectangle as ViewRectangle | undefined;
            if (nextLineRect === undefined && k < viewCursorAndRangeInfosForRange.$m_viewParagraphInfos.length - 1) {
              const nextParagraphViewRangeInfos = viewCursorAndRangeInfosForRange.$m_viewParagraphInfos[k + 1].$m_viewRangeInfos;
              nextLineRect = nextParagraphViewRangeInfos[0]?.$m_rectangle;
            }
            pushCurvedLineRectSpans(selectionRectElements, previousLineRect, rectangle, nextLineRect, 4, key, backgroundColor);
            continue;
          }
          selectionRectElements.push(
            <span
              key={key}
              style={{
                position: 'absolute',
                top: rectangle.$m_top,
                left: rectangle.$m_left,
                width: rectangle.$m_width,
                height: rectangle.$m_height,
                backgroundColor,
              }}
            />,
          );
        }
        for (let l = 0; l < viewCursorInfos.length; l++) {
          const viewCursorInfo = viewCursorInfos[l];
          const {
            $m_isAnchor: isAnchor,
            $m_isFocus: isFocus,
            $m_isItalic: isItalic,
            $m_offset: offset,
            $m_paragraphReference: paragraphReference,
            $m_rangeDirection: rangeDirection,
            $m_insertTextConfig: insertTextConfig,
            $m_customColor: customColor,
          } = viewCursorInfo;
          cursorElements.push(
            <BlinkingCursor
              key={uniqueKeyControl.$m_makeUniqueKey(
                JSON.stringify([paragraphReference.blockId, isAnchor, isFocus, offset, rangeDirection, selectionRangeId, insertTextConfig]),
              )}
              $m_viewCursorInfo={viewCursorInfo}
              $m_synchronizedCursorVisibility$={synchronizedCursorVisibility$}
              $m_hasFocus={hasFocus}
              $m_isDragging={isDragging}
              $m_isItalic={isItalic}
              $m_customColor={customColor}
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
  $m_viewCursorInfo: ViewCursorInfo;
  $m_synchronizedCursorVisibility$: Source<boolean>;
  $m_hasFocus: boolean;
  $m_isDragging: boolean;
  $m_isItalic: boolean;
  $m_customColor?: string;
}
const cursorWidth = 2;
function BlinkingCursor(props: BlinkingCursorProps): JSX.Element | null {
  const {
    $m_viewCursorInfo: viewCursorInfo,
    $m_synchronizedCursorVisibility$: synchronizedCursorVisibility$,
    $m_hasFocus: hasFocus,
    $m_isDragging: isDragging, // TODO.
    $m_isItalic: isItalic,
    $m_customColor: customColor,
  } = props;
  if (!viewCursorInfo.$m_isFocus) {
    return null;
  }
  const isVisibleMaybe = use$(
    useMemo(
      () =>
        pipe(
          pipe(synchronizedCursorVisibility$),
          debounce(() => ofEvent(End, scheduleMicrotask)),
        ),
      [],
    ),
    Some(true),
    true,
  );
  return (
    <span
      style={{
        position: 'absolute',
        top: viewCursorInfo.$m_position.$m_top,
        left: viewCursorInfo.$m_position.$m_left - cursorWidth / 2,
        width: cursorWidth,
        height: viewCursorInfo.$m_height,
        backgroundColor: hasFocus ? customColor ?? '#222' : '#88888899',
        transform: isItalic ? 'skew(-7deg)' : undefined,
        visibility: isVisibleMaybe.$m_value ? 'visible' : 'hidden',
      }}
    />
  );
}
interface TextDecorationInfo {
  $m_charactersBoundingRectangle: ViewRectangle;
  $m_charactersLineBoundingRectangle: ViewRectangle;
  $m_paragraphReference: matita.BlockReference;
}
interface SpellingMistakeOverlayInfo {
  $m_textDecorationInfos: TextDecorationInfo[];
}
interface SpellingMistakesOverlayMessage {
  $m_spellingMistakeOverlayInfos: SpellingMistakeOverlayInfo[];
}
interface SpellingMistakesOverlayProps {
  $m_spellingMistakeOverlay$: Source<SpellingMistakesOverlayMessage>;
}
function SpellingMistakesOverlay(props: SpellingMistakesOverlayProps): JSX.Element | null {
  const { $m_spellingMistakeOverlay$: spellingMistakeOverlay$ } = props;
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
  const { $m_spellingMistakeOverlayInfos: spellingMistakeOverlayInfos } = spellingMistakesOverlayMaybe.$m_value;
  const uniqueKeyControl = new UniqueKeyControl();
  const fragmentChildren: JSX.Element[] = [];
  for (let i = 0; i < spellingMistakeOverlayInfos.length; i++) {
    const spellingMistakeInfo = spellingMistakeOverlayInfos[i];
    const { $m_textDecorationInfos: textDecorationInfos } = spellingMistakeInfo;
    for (let j = 0; j < textDecorationInfos.length; j++) {
      const viewRangeInfo = textDecorationInfos[j];
      const { $m_charactersBoundingRectangle: charactersBoundingRectangle, $m_paragraphReference: paragraphReference } = viewRangeInfo;
      const key = uniqueKeyControl.$m_makeUniqueKey(paragraphReference.blockId);
      fragmentChildren.push(
        <span
          key={key}
          style={{
            position: 'absolute',
            top: charactersBoundingRectangle.$m_top,
            left: charactersBoundingRectangle.$m_left,
            width: charactersBoundingRectangle.$m_width,
            height: charactersBoundingRectangle.$m_height,
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
  $m_viewRangeInfos: ViewRangeInfo[];
  $m_isSelected: boolean;
  $m_hasFocus: boolean;
}
interface SearchOverlayMessage {
  $m_calculateMatchInfos: () => SearchOverlayMatchInfo[];
  $m_roundCorners: boolean;
  $m_renderSync: boolean;
  $m_onRender?: () => void;
}
interface SearchOverlayProps {
  $m_searchOverlay$: Source<SearchOverlayMessage>;
}
function SearchOverlay(props: SearchOverlayProps): JSX.Element | null {
  const { $m_searchOverlay$: searchOverlay$ } = props;
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
      return isSome(maybe) && maybe.$m_value.$m_renderSync;
    },
  );
  if (isNone(searchOverlayMaybe)) {
    return null;
  }
  const { $m_calculateMatchInfos: calculateMatchInfos, $m_roundCorners: roundCorners, $m_onRender: onRender } = searchOverlayMaybe.$m_value;
  onRender?.();
  const matchInfos = calculateMatchInfos();
  const uniqueKeyControl = new UniqueKeyControl();
  const fragmentChildren: JSX.Element[] = [];
  for (let i = 0; i < matchInfos.length; i++) {
    const matchInfo = matchInfos[i];
    const { $m_viewRangeInfos: viewRangeInfos, $m_isSelected: isSelected, $m_hasFocus: hasFocus } = matchInfo;
    for (let j = 0; j < viewRangeInfos.length; j++) {
      const viewRangeInfo = viewRangeInfos[j];
      const { $m_rectangle: rectangle, $m_paragraphReference: paragraphReference, $m_paragraphLineIndex: paragraphLineIndex } = viewRangeInfo;
      const previousLineRect = viewRangeInfos[j - 1]?.$m_rectangle;
      const nextLineRect = viewRangeInfos[j + 1]?.$m_rectangle;
      const key = uniqueKeyControl.$m_makeUniqueKey(JSON.stringify([paragraphReference.blockId, paragraphLineIndex]));
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
            top: rectangle.$m_top,
            left: rectangle.$m_left,
            width: rectangle.$m_width,
            height: rectangle.$m_height,
            backgroundColor,
          }}
        />,
      );
    }
  }
  return <>{fragmentChildren}</>;
}
const enum SearchBoxConfigType {
  SingleParagraphPlainText = 'SingleParagraphPlainText',
}
interface SearchBoxControlConfig {
  $m_type: SearchBoxConfigType.SingleParagraphPlainText;
  $m_config: SingleParagraphPlainTextSearchControlConfig;
}
interface SearchBoxProps {
  $m_isVisible$: CurrentValueSource<boolean>;
  $m_selectAllText$: Source<undefined>;
  $m_onAfterSelectAll: () => void;
  $m_containerWidth$: CurrentValueSource<number>;
  $m_goToSearchResultImmediatelySink: Sink<boolean>;
  $m_querySink: Sink<string>;
  $m_configSink: Sink<SearchBoxControlConfig>;
  $m_goToPreviousMatchSink: Sink<undefined>;
  $m_goToNextMatchSink: Sink<undefined>;
  $m_closeSink: Sink<undefined>;
  $m_isInCompositionSink: Sink<boolean>;
  $m_changeQuery$: Source<string>;
  $m_matchNumberMaybe$: CurrentValueSource<Maybe<number>>;
  $m_totalMatchesMaybe$: CurrentValueSource<Maybe<TotalMatchesMessage>>;
  $m_initialGoToSearchResultImmediately: boolean;
  $m_initialQuery: string;
  $m_initialConfig: SearchBoxControlConfig;
  $m_inputRef: React.RefObject<HTMLInputElement>;
}
function useToggle(initialValue = false): [value: boolean, toggleValue: () => void] {
  const [value, setValue] = useState<boolean>(initialValue);
  const toggleValue = useCallback(() => setValue((value) => !value), []);
  return [value, toggleValue];
}
const searchBoxMargin = 8;
function SearchBox(props: SearchBoxProps): JSX.Element | null {
  const {
    $m_isVisible$: isVisible$,
    $m_selectAllText$: selectAllText$,
    $m_onAfterSelectAll: onAfterSelectAll,
    $m_containerWidth$: containerWidth$,
    $m_goToSearchResultImmediatelySink: goToSearchResultImmediatelySink,
    $m_querySink: querySink,
    $m_configSink: configSink,
    $m_closeSink: closeSink,
    $m_goToPreviousMatchSink: goToPreviousMatchSink,
    $m_goToNextMatchSink: goToNextMatchSink,
    $m_isInCompositionSink: isInCompositionSink,
    $m_changeQuery$: changeQuery$,
    $m_matchNumberMaybe$: matchNumberMaybe$,
    $m_totalMatchesMaybe$: totalMatchesMaybe$,
    $m_initialGoToSearchResultImmediately: initialGoToSearchResultImmediately,
    $m_initialQuery: initialQuery,
    $m_initialConfig: initialConfig,
    $m_inputRef: inputRef,
  } = props;
  type Position = {
    $m_width: number;
    $m_dropDownPercent: number;
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
  const { $m_value: position } = use$<Position>(
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
          $m_width: width,
          $m_dropDownPercent: dropDownPercent,
        })),
        memoConsecutive((a, b) => a.$m_width === b.$m_width && a.$m_dropDownPercent === b.$m_dropDownPercent),
        skip(1),
      );
    }, []),
    useMemo(
      () =>
        Some<Position>({
          $m_width: calculateWidthFromContainerWidth(containerWidth$.currentValue),
          $m_dropDownPercent: isVisible$.currentValue ? 1 : 0,
        }),
      [],
    ),
  );
  const matchNumberMaybe = use$(matchNumberMaybe$, Some(matchNumberMaybe$.currentValue), true).$m_value;
  const totalMatchesMaybe = use$(totalMatchesMaybe$, Some(totalMatchesMaybe$.currentValue), true).$m_value;
  const [isOptionsShown, toggleIsOptionsShown] = useToggle();
  const tabIndex = position.$m_dropDownPercent < 1 ? -1 : undefined;
  const [config, setConfigState] = useState(initialConfig.$m_config);
  const setConfig = (newConfig: SingleParagraphPlainTextSearchControlConfig): void => {
    setConfigState(newConfig);
    configSink(
      Push({
        $m_type: SearchBoxConfigType.SingleParagraphPlainText,
        $m_config: newConfig,
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
  const isLoading = isSome(totalMatchesMaybe) && !totalMatchesMaybe.$m_value.$m_isComplete;
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
      resultInfoText = `${matchNumberMaybe.$m_value} of ${totalMatchesMaybe.$m_value.$m_totalMatches}`;
    } else if (totalMatchesMaybe.$m_value.$m_totalMatches === 0) {
      resultInfoText = 'No matches';
    } else if (totalMatchesMaybe.$m_value.$m_totalMatches === 1) {
      resultInfoText = '1 match';
    } else {
      resultInfoText = `${totalMatchesMaybe.$m_value.$m_totalMatches} matches`;
    }
    if (!totalMatchesMaybe.$m_value.$m_isComplete && loadingIndicatorState !== null) {
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
    ['$m_ignoreCase', 'Match Case', true],
    ['$m_ignoreDiacritics', 'Match Diacritics', true],
    ['$m_replaceSimilarLooking', 'Similar Looking Characters', false],
    ['$m_stripNonLettersAndNumbers', 'Strip Non Letters And Numbers', false],
    ['$m_wholeWords', 'Whole Words', false],
    ['$m_searchQueryWordsIndividually', 'Search Query Words Individually', false],
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
          '--search-box_translate-y': `${
            searchBoxMargin * (position.$m_dropDownPercent === 0 ? -100000 : 1.5 * Math.sqrt(position.$m_dropDownPercent) - 0.5)
          }px`,
          '--search-box_opacity': isVisible$.currentValue ? 1 - (1 - position.$m_dropDownPercent) ** 2 : position.$m_dropDownPercent ** 2,
          '--search-box_margin': `${searchBoxMargin}px`,
          '--search-box_max-width': `${position.$m_width}px`,
        } as React.CSSProperties
      }
    >
      {searchBoxChildren}
    </div>
  );
}
function useFloatingBoxPosition(
  boundingRects: { $m_visibleBoundingRect: ViewRectangle; $m_wordBoundingRect: ViewRectangle } | null,
  domRef: RefObject<HTMLElement>,
): { $m_positionLeft: number; $m_positionTop: number; $m_maxWidth: number; $m_maxHeight: number; $m_isCalculated: boolean } | null {
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
  const { $m_visibleBoundingRect: visibleBoundingRect, $m_wordBoundingRect: wordBoundingRect } = boundingRects;
  const domBoundingRect = domBoundingRectRef.current;
  let positionLeft: number;
  let positionTop: number;
  const isCalculated = domBoundingRect !== null;
  if (isCalculated) {
    if (wordBoundingRect.$m_left + domBoundingRect.width <= visibleBoundingRect.$m_right) {
      positionLeft = wordBoundingRect.$m_left;
    } else {
      positionLeft = Math.max(visibleBoundingRect.$m_right - domBoundingRect.width, visibleBoundingRect.$m_left);
    }
    if (wordBoundingRect.$m_top - domBoundingRect.height >= visibleBoundingRect.$m_top) {
      positionTop = wordBoundingRect.$m_top - domBoundingRect.height;
    } else {
      positionTop = wordBoundingRect.$m_bottom;
    }
  } else {
    positionLeft = 0;
    positionTop = 0;
  }
  return {
    $m_positionLeft: positionLeft,
    $m_positionTop: positionTop,
    // TODO.
    $m_maxWidth: visibleBoundingRect.$m_right - positionLeft,
    $m_maxHeight: visibleBoundingRect.$m_bottom - positionTop,
    $m_isCalculated: isCalculated,
  };
}
interface SpellingBoxRenderMessage {
  $m_misspelledWord: string;
  $m_suggestions: string[];
  $m_visibleBoundingRect: ViewRectangle;
  $m_wordBoundingRect: ViewRectangle;
  $m_replaceWith: (suggestion: string) => void;
  $m_focusedSuggestionIndex: number | null;
}
interface SpellingBoxProps {
  $m_renderMessage$: Source<SpellingBoxRenderMessage | null>;
  $m_spellingBoxRef: RefObject<HTMLDivElement>;
}
function SpellingBox(props: SpellingBoxProps): JSX.Element | null {
  const { $m_renderMessage$: renderMessage$, $m_spellingBoxRef: spellingBoxRef } = props;
  const renderMessageMaybe = use$(renderMessage$, undefined, true);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.$m_value : null;
  const positions = useFloatingBoxPosition(renderMessage, spellingBoxRef);
  if (renderMessage === null) {
    return null;
  }
  if (!doViewRectanglesIntersect(renderMessage.$m_visibleBoundingRect, renderMessage.$m_wordBoundingRect)) {
    return null;
  }
  const { $m_suggestions: suggestions, $m_replaceWith: replaceWith, $m_focusedSuggestionIndex: focusedSuggestionIndex } = renderMessage;
  assertIsNotNullish(positions);
  const { $m_positionLeft: positionLeft, $m_positionTop: positionTop, $m_maxWidth: maxWidth, $m_maxHeight: maxHeight } = positions;
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
  $m_startTextValue: string;
  $m_startLinkValue: string;
  $m_shouldGetText: boolean;
  $m_visibleBoundingRect: ViewRectangle;
  $m_wordBoundingRect: ViewRectangle;
  $m_applyLink: (link: string, text: string) => void;
}
interface LinkBoxProps {
  $m_renderMessage$: Source<LinkBoxRenderMessage | null>;
}
function LinkBox(props: LinkBoxProps): JSX.Element | null {
  const { $m_renderMessage$: renderMessage$ } = props;
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [hasError, setHasError] = useState(false);
  const renderMessageMaybe = use$(renderMessage$, undefined, true, (maybe) => {
    const renderMessage = isSome(maybe) ? maybe.$m_value : null;
    setHasError(false);
    if (renderMessage === null) {
      setText('');
      setUrl('');
      return;
    }
    const { $m_startTextValue: startTextValue, $m_startLinkValue: startLinkValue } = renderMessage;
    setText(startTextValue);
    setUrl(startLinkValue);
  });
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.$m_value : null;
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
    if (renderMessage.$m_shouldGetText) {
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
  const { $m_shouldGetText: shouldGetText, $m_applyLink: applyLink } = renderMessage;
  assertIsNotNullish(positions);
  const { $m_positionLeft: positionLeft, $m_positionTop: positionTop, $m_maxWidth: maxWidth, $m_maxHeight: maxHeight } = positions;
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
  $m_link: string;
  $m_visibleBoundingRect: ViewRectangle;
  $m_wordBoundingRect: ViewRectangle;
  $m_tempClose: () => void;
  $m_returnFocus: () => void;
  $m_editLink: () => void;
  $m_removeLink: () => void;
}
interface LinkDetailsProps {
  $m_renderMessage$: Source<LinkDetailsRenderMessage | null>;
}
function LinkDetails(props: LinkDetailsProps): JSX.Element | null {
  const { $m_renderMessage$: renderMessage$ } = props;
  const renderMessageMaybe = use$(renderMessage$, undefined, true);
  const linkDetailsRef = useRef<HTMLDivElement>(null);
  const renderMessage = isSome(renderMessageMaybe) ? renderMessageMaybe.$m_value : null;
  const positions = useFloatingBoxPosition(renderMessage, linkDetailsRef);
  if (renderMessage === null) {
    return null;
  }
  const { $m_link: link, $m_tempClose: tempClose, $m_returnFocus: returnFocus, $m_editLink: editLink, $m_removeLink: removeLink } = renderMessage;
  assertIsNotNullish(positions);
  const { $m_positionLeft: positionLeft, $m_positionTop: positionTop, $m_maxWidth: maxWidth, $m_maxHeight: maxHeight } = positions;
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
  readonly $m_right: number;
  readonly $m_bottom: number;
  readonly $m_width: number;
  readonly $m_height: number;
}
function makeViewRectangle(left: number, top: number, width: number, height: number): ViewRectangle {
  return {
    $m_left: left,
    $m_top: top,
    $m_right: left + width,
    $m_bottom: top + height,
    $m_width: width,
    $m_height: height,
  };
}
function areViewRectanglesEqual(viewRectangle1: ViewRectangle, viewRectangle2: ViewRectangle): boolean {
  return (
    viewRectangle1.$m_left === viewRectangle2.$m_left &&
    viewRectangle1.$m_top === viewRectangle2.$m_top &&
    viewRectangle1.$m_width === viewRectangle2.$m_width &&
    viewRectangle1.$m_height === viewRectangle2.$m_height
  );
}
function doViewRectanglesIntersect(viewRectangle1: ViewRectangle, viewRectangle2: ViewRectangle): boolean {
  return (
    viewRectangle1.$m_right >= viewRectangle2.$m_left &&
    viewRectangle1.$m_left <= viewRectangle2.$m_right &&
    viewRectangle1.$m_top <= viewRectangle2.$m_bottom &&
    viewRectangle2.$m_bottom >= viewRectangle1.$m_top
  );
}
function shiftViewRectangle(rectangle: ViewRectangle, deltaRight: number, deltaDown: number): ViewRectangle {
  return makeViewRectangle(rectangle.$m_left + deltaRight, rectangle.$m_top + deltaDown, rectangle.$m_width, rectangle.$m_height);
}
interface MeasuredParagraphLineRange {
  $m_startOffset: number;
  $m_endOffset: number;
  $m_boundingRect: ViewRectangle;
  $m_characterRectangles: ViewRectangle[];
  $m_endsWithLineBreak: boolean;
}
interface RelativeParagraphMeasureCacheValue {
  $m_characterRectangles: (ViewRectangle | null)[];
  $m_measuredParagraphLineRanges: MeasuredParagraphLineRange[];
}
interface AbsoluteParagraphMeasurement extends RelativeParagraphMeasureCacheValue {
  $m_boundingRect: ViewRectangle;
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
const enum Platform {
  Apple = 'Apple',
  NotApple = 'NotApple',
  MacOS = 'MacOS',
  Windows = 'Windows',
  Linux = 'Linux',
  Ios = 'Ios',
  Android = 'Android',
}
const enum Context {
  Editing = 'Editing',
  Searching = 'Searching',
  InSearchBox = 'InSearchBox',
  DraggingSelection = 'DraggingSelection',
}
type Selector<T extends string> = T | { $m_not: Selector<T> } | { $m_all: Selector<T>[] } | { $m_any: Selector<T>[] };
function satisfiesSelector<T extends string>(values: T[], selector: Selector<T>): boolean {
  if (typeof selector === 'string') {
    return values.includes(selector);
  }
  if ('$m_not' in selector) {
    return !satisfiesSelector(values, selector.$m_not);
  }
  if ('$m_all' in selector) {
    return selector.$m_all.every((selector) => satisfiesSelector(values, selector));
  }
  return selector.$m_any.some((selector) => satisfiesSelector(values, selector));
}
type CommandName = string | number;
type KeyCommands = {
  $m_key: string | null;
  $m_command: CommandName | null;
  $m_platform?: Selector<Platform> | null;
  $m_context?: Selector<Context> | null;
}[];
const defaultTextEditingKeyCommands: KeyCommands = [
  { $m_key: 'ArrowLeft,Control+KeyB', $m_command: StandardCommand.MoveSelectionGraphemeBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+ArrowLeft', $m_command: StandardCommand.MoveSelectionWordBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+ArrowUp', $m_command: StandardCommand.MoveSelectionParagraphBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+KeyA', $m_command: StandardCommand.MoveSelectionParagraphStart, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'ArrowRight,Control+KeyF', $m_command: StandardCommand.MoveSelectionGraphemeForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+ArrowRight', $m_command: StandardCommand.MoveSelectionWordForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+ArrowDown', $m_command: StandardCommand.MoveSelectionParagraphForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+KeyE', $m_command: StandardCommand.MoveSelectionParagraphEnd, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+ArrowLeft', $m_command: StandardCommand.MoveSelectionSoftLineStart, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+ArrowRight', $m_command: StandardCommand.MoveSelectionSoftLineEnd, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'ArrowDown,Control+KeyN', $m_command: StandardCommand.MoveSelectionSoftLineDown, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'ArrowUp,Control+KeyP', $m_command: StandardCommand.MoveSelectionSoftLineUp, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+ArrowUp', $m_command: StandardCommand.MoveSelectionStartOfDocument, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+ArrowDown', $m_command: StandardCommand.MoveSelectionEndOfDocument, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Shift+ArrowLeft,Control+Shift+KeyB',
    $m_command: StandardCommand.ExtendSelectionGraphemeBackwards,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  { $m_key: 'Alt+Shift+ArrowLeft', $m_command: StandardCommand.ExtendSelectionWordBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+Shift+ArrowUp', $m_command: StandardCommand.ExtendSelectionParagraphBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Shift+KeyA', $m_command: StandardCommand.ExtendSelectionParagraphStart, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Shift+ArrowRight,Control+Shift+KeyF',
    $m_command: StandardCommand.ExtendSelectionGraphemeForwards,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  { $m_key: 'Alt+Shift+ArrowRight', $m_command: StandardCommand.ExtendSelectionWordForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Alt+Shift+ArrowDown', $m_command: StandardCommand.ExtendSelectionParagraphForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Shift+KeyE', $m_command: StandardCommand.ExtendSelectionParagraphEnd, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+ArrowLeft', $m_command: StandardCommand.ExtendSelectionSoftLineStart, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+ArrowRight', $m_command: StandardCommand.ExtendSelectionSoftLineEnd, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Shift+ArrowDown,Control+Shift+KeyN',
    $m_command: StandardCommand.ExtendSelectionSoftLineDown,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  {
    $m_key: 'Shift+ArrowUp,Control+Shift+KeyP',
    $m_command: StandardCommand.ExtendSelectionSoftLineUp,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  { $m_key: 'Meta+Shift+ArrowUp', $m_command: StandardCommand.ExtendSelectionStartOfDocument, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+ArrowDown', $m_command: StandardCommand.ExtendSelectionEndOfDocument, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Shift?+Backspace', $m_command: StandardCommand.RemoveSelectionGraphemeBackwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Alt+Shift?+Backspace,Control+Shift?+Backspace,Control+Alt+Shift?+Backspace',
    $m_command: StandardCommand.RemoveSelectionWordBackwards,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  { $m_key: 'Shift?+Delete', $m_command: StandardCommand.RemoveSelectionGraphemeForwards, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Alt+Shift?+Delete,Control+Shift?+Delete,Control+Alt+Shift?+Delete',
    $m_command: StandardCommand.RemoveSelectionWordForwards,
    $m_platform: Platform.Apple,
    $m_context: Context.Editing,
  },
  { $m_key: 'Meta+Shift?+Backspace', $m_command: StandardCommand.RemoveSelectionSoftLineStart, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift?+Delete', $m_command: StandardCommand.RemoveSelectionSoftLineEnd, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+KeyT', $m_command: StandardCommand.TransposeGraphemes, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Enter', $m_command: StandardCommand.InsertParagraphAbove, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+Enter', $m_command: StandardCommand.InsertParagraphBelow, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyA', $m_command: StandardCommand.SelectAll, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Shift+Enter,Control+KeyO', $m_command: StandardCommand.InsertLineBreak, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyK', $m_command: StandardCommand.OpenFloatingLinkBoxAtSelection, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Enter', $m_command: StandardCommand.SplitParagraph, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyZ,Meta+Shift+KeyY', $m_command: StandardCommand.Undo, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+KeyZ,Meta+KeyY', $m_command: StandardCommand.Redo, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Escape',
    $m_command: StandardCommand.CollapseMultipleSelectionRangesToAnchorRange,
    $m_platform: Platform.Apple,
    $m_context: { $m_all: [Context.Editing, { $m_not: Context.DraggingSelection }] },
  },
  {
    $m_key: 'Shift+Escape',
    $m_command: StandardCommand.CollapseMultipleSelectionRangesToFocusRange,
    $m_platform: Platform.Apple,
    $m_context: { $m_all: [Context.Editing, { $m_not: Context.DraggingSelection }] },
  },
  { $m_key: 'Meta+KeyF', $m_command: StandardCommand.OpenSearch, $m_platform: Platform.Apple },
  { $m_key: 'Meta+KeyG', $m_command: StandardCommand.SearchCurrentFocusSelectionRange, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+KeyG', $m_command: StandardCommand.SearchCurrentFocusSelectionRange, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Enter,Meta+KeyG', $m_command: StandardCommand.SelectNextSearchMatch, $m_platform: Platform.Apple, $m_context: Context.Searching },
  { $m_key: 'Shift+Enter,Meta+Shift+KeyG', $m_command: StandardCommand.SelectPreviousSearchMatch, $m_platform: Platform.Apple, $m_context: Context.Searching },
  { $m_key: 'Escape', $m_command: StandardCommand.CloseSearch, $m_platform: Platform.Apple, $m_context: Context.InSearchBox },
  { $m_key: 'Meta+Shift+KeyL', $m_command: StandardCommand.SelectAllInstancesOfWord, $m_platform: Platform.Apple, $m_context: Context.Editing },
  {
    $m_key: 'Alt+Enter,Meta+Shift+KeyL',
    $m_command: StandardCommand.SelectAllInstancesOfSearchQuery,
    $m_platform: Platform.Apple,
    $m_context: Context.Searching,
  },
  { $m_key: 'Meta+Shift+KeyD', $m_command: StandardCommand.SelectPreviousInstanceOfWordAtFocus, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyD', $m_command: StandardCommand.SelectNextInstanceOfWordAtFocus, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+KeyD', $m_command: StandardCommand.SelectPreviousInstanceOfSearchQuery, $m_platform: Platform.Apple, $m_context: Context.Searching },
  { $m_key: 'Meta+KeyD', $m_command: StandardCommand.SelectNextInstanceOfSearchQuery, $m_platform: Platform.Apple, $m_context: Context.Searching },
  { $m_key: 'Control+Alt+ArrowUp', $m_command: StandardCommand.MoveCurrentBlocksAbove, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Alt+ArrowDown', $m_command: StandardCommand.MoveCurrentBlocksBelow, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Alt+Shift+ArrowUp', $m_command: StandardCommand.CloneCurrentBlocksBelow, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Alt+Shift+ArrowDown', $m_command: StandardCommand.CloneCurrentBlocksAbove, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyB', $m_command: StandardCommand.ApplyBold, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyI', $m_command: StandardCommand.ApplyItalic, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+KeyU', $m_command: StandardCommand.ApplyUnderline, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+KeyJ', $m_command: StandardCommand.ApplyCode, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+KeyX', $m_command: StandardCommand.ApplyStrikethrough, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+Comma', $m_command: StandardCommand.ApplySubscript, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Shift+Period', $m_command: StandardCommand.ApplySuperscript, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Backslash', $m_command: StandardCommand.ResetInlineStyle, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+KeyL', $m_command: StandardCommand.AlignParagraphLeft, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+KeyE', $m_command: StandardCommand.AlignParagraphCenter, $m_platform: Platform.Apple, $m_context: Context.Editing },
  // TODO: Doesn't work for safari, reloads page.
  { $m_key: 'Meta+Alt+KeyR', $m_command: StandardCommand.AlignParagraphRight, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+KeyJ', $m_command: StandardCommand.AlignParagraphJustify, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Tab', $m_command: StandardCommand.IncreaseListIndent, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Shift+Tab', $m_command: StandardCommand.DecreaseListIndent, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+BracketRight', $m_command: StandardCommand.IncreaseListIndent, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+BracketLeft', $m_command: StandardCommand.DecreaseListIndent, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit1', $m_command: StandardCommand.ApplyHeading1, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit2', $m_command: StandardCommand.ApplyHeading2, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit3', $m_command: StandardCommand.ApplyHeading3, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit4', $m_command: StandardCommand.ApplyHeading4, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit7', $m_command: StandardCommand.ApplyUnorderedList, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit8', $m_command: StandardCommand.ApplyOrderedList, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Shift+Digit8', $m_command: StandardCommand.CycleOrderedListStyle, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit9', $m_command: StandardCommand.ApplyChecklist, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Digit0', $m_command: StandardCommand.ApplyBlockquote, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Shift+Digit0', $m_command: StandardCommand.ApplyIndent1, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Semicolon', $m_command: StandardCommand.ApplyIndentFirstLine1, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Shift+Semicolon', $m_command: StandardCommand.ApplyHangingIndent1, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Alt+Backslash', $m_command: StandardCommand.ResetParagraphStyle, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Enter', $m_command: StandardCommand.ToggleChecklistChecked, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Control+Alt+Enter', $m_command: StandardCommand.ToggleChecklistCheckedIndividually, $m_platform: Platform.Apple, $m_context: Context.Editing },
  { $m_key: 'Meta+Period', $m_command: StandardCommand.OpenQuickFixAtSelection, $m_platform: Platform.Apple, $m_context: Context.Editing },
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
  $m_commandName: CommandName;
  $m_data: Data;
}
interface InsertPlainTextCommandData {
  $m_insertText: string;
}
function makeInsertPlainTextCommandInfo(insertText: string): CommandInfo<InsertPlainTextCommandData> {
  return {
    $m_commandName: StandardCommand.InsertPlainText,
    $m_data: {
      $m_insertText: insertText,
    },
  };
}
interface InsertPastedPlainTextCommandData {
  $m_pasteText: string;
}
function makeInsertPastedPlainTextCommandInfo(pasteText: string): CommandInfo<InsertPastedPlainTextCommandData> {
  return {
    $m_commandName: StandardCommand.InsertPastedPlainText,
    $m_data: {
      $m_pasteText: pasteText,
    },
  };
}
interface InsertDroppedPlainTextCommandData {
  $m_dropText: string;
}
function makeInsertDroppedPlainTextCommandInfo(dropText: string): CommandInfo<InsertDroppedPlainTextCommandData> {
  return {
    $m_commandName: StandardCommand.InsertDroppedPlainText,
    $m_data: {
      $m_dropText: dropText,
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
const enum VirtualizedDataKey {
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
  $m_cursorOffsetLeft: number;
  $m_expirationId: number;
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
      '$m_cursorOffsetLeft' in value &&
      typeof value.$m_cursorOffsetLeft === 'number' &&
      '$m_expirationId' in value &&
      typeof value.$m_expirationId === 'number',
  );
  return value as MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue;
}
function makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
  cursorOffsetLeft: number,
  expirationId: number,
): MoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue {
  return {
    $m_cursorOffsetLeft: cursorOffsetLeft,
    $m_expirationId: expirationId,
  };
}
interface LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  $m_expirationId: number;
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
  assert(value != null && typeof value === 'object' && !Array.isArray(value) && '$m_expirationId' in value && typeof value.$m_expirationId === 'number');
  return value as LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue;
}
function makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  expirationId: number,
): LineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  return {
    $m_expirationId: expirationId,
  };
}
interface LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  $m_expirationId: number;
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
  assert(value != null && typeof value === 'object' && !Array.isArray(value) && '$m_expirationId' in value && typeof value.$m_expirationId === 'number');
  return value as LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue;
}
function makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
  expirationId: number,
): LineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue {
  return {
    $m_expirationId: expirationId,
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
    documentRenderControl.$m_stateControl.delta.applyUpdate(
      matita.makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn(
        documentRenderControl.$m_stateControl,
        shouldSelectionRangeCollapse,
        pointTransformFn,
        (_oldSelectionRange, newSelectionRange) => {
          const newFocusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(newSelectionRange));
          if (matita.isParagraphPoint(newFocusPoint) && documentRenderControl.$m_isParagraphPointAtWrappedLineWrapPoint(newFocusPoint)) {
            preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            return {
              ...newSelectionRange.data,
              [VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId]:
                makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                  documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
                ),
              [VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId]:
                makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                  documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
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
    documentRenderControl.$m_stateControl.delta.applyUpdate(
      matita.makeMoveSelectionByPointTransformFnThroughAnchorPointUpdateFn(
        documentRenderControl.$m_stateControl,
        (_document, _stateControlConfig, _selectionRange) => false,
        (_document, _stateControlConfig, range, anchorPoint, selectionRange) => {
          const compareAnchorToFocusResult = matita.compareSelectionRangeAnchorToFocus(
            documentRenderControl.$m_stateControl.stateView.document,
            selectionRange,
          );
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
            documentRenderControl.$m_isSelectionSecondaryDataExpirationIdActive(cursorOffsetLeftDataValue.$m_expirationId) &&
            moveFromFocus
          ) {
            cursorOffsetLeft = cursorOffsetLeftDataValue.$m_cursorOffsetLeft;
          }
          let result: ReturnType<(typeof documentRenderControl)['$m_transformPointSoftLineUpDownWithOffsetLeft']>;
          if (moveFromFocus) {
            const focusPoint = matita.getFocusPointFromRange(range);
            result = documentRenderControl.$m_transformPointSoftLineUpDownWithOffsetLeft(
              pointMovement,
              range,
              focusPoint,
              selectionRange,
              cursorOffsetLeft,
              false,
            );
          } else {
            result = documentRenderControl.$m_transformPointSoftLineUpDownWithOffsetLeft(
              pointMovement,
              range,
              anchorPoint,
              selectionRange,
              cursorOffsetLeft,
              true,
            );
          }
          horizontalOffset = result.$m_horizontalOffset;
          isWrappedLineStart = result.$m_isWrappedLineStart;
          return result.$m_pointWithContentReference;
        },
        (_oldSelectionRange, newSelectionRange) => {
          const newSelectionRangeData: matita.SelectionRangeData = {
            ...newSelectionRange.data,
            [VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId]:
              makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
                horizontalOffset,
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
              ),
          };
          if (isWrappedLineStart) {
            preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapAnchorCursorWrapToNextLineWithExpirationId] =
              makeLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
              );
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
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
    documentRenderControl.$m_stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.$m_stateControl,
        (_document, _stateControlConfig, _selectionRange) => true,
        undefined,
        (_document, _stateControlConfig, range, focusPoint, selectionRange) => {
          let cursorOffsetLeft: number | undefined;
          const cursorOffsetLeftDataValue = getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(selectionRange.data);
          if (
            cursorOffsetLeftDataValue !== undefined &&
            documentRenderControl.$m_isSelectionSecondaryDataExpirationIdActive(cursorOffsetLeftDataValue.$m_expirationId)
          ) {
            cursorOffsetLeft = cursorOffsetLeftDataValue.$m_cursorOffsetLeft;
          }
          const result = documentRenderControl.$m_transformPointSoftLineUpDownWithOffsetLeft(
            pointMovement,
            range,
            focusPoint,
            selectionRange,
            cursorOffsetLeft,
            false,
          );
          horizontalOffset = result.$m_horizontalOffset;
          isWrappedLineStart = result.$m_isWrappedLineStart;
          return result.$m_pointWithContentReference;
        },
        (oldSelectionRange, newSelectionRange) => {
          const newSelectionRangeData: matita.SelectionRangeData = {
            ...newSelectionRange.data,
            [VirtualizedDataKey.SelectionRangeDataMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationId]:
              makeMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
                horizontalOffset,
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
              ),
          };
          const oldAnchorPoint = matita.getAnchorPointFromRange(matita.getAnchorRangeFromSelectionRange(oldSelectionRange));
          if (matita.isParagraphPoint(oldAnchorPoint)) {
            const lineWrapAnchorCursorWrapToNextLineDataValue = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
              oldSelectionRange.data,
            );
            if (
              lineWrapAnchorCursorWrapToNextLineDataValue &&
              documentRenderControl.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.$m_expirationId)
            ) {
              preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
            }
          }
          if (isWrappedLineStart) {
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
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
    documentRenderControl.$m_stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.$m_stateControl,
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
                documentRenderControl.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.$m_expirationId)
              ) {
                preserveAnchorLineWrapSelectionRangeIds.push(newSelectionRange.id);
              }
            }
          }
          const newFocusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(newSelectionRange));
          if (matita.isParagraphPoint(newFocusPoint) && documentRenderControl.$m_isParagraphPointAtWrappedLineWrapPoint(newFocusPoint)) {
            preserveFocusLineWrapSelectionRangeIds.push(newSelectionRange.id);
            newSelectionRangeData[VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId] =
              makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(
                documentRenderControl.$m_makeActivatedSelectionSecondaryDataExpirationId(),
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
    documentRenderControl.$m_stateControl.delta.applyUpdate(
      matita.makeExtendSelectionByPointTransformFnsUpdateFn(
        documentRenderControl.$m_stateControl,
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
                documentRenderControl.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapAnchorCursorWrapToNextLineDataValue.$m_expirationId)
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
  listStyleInjectionControl: ListStyleInjectionControl,
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
        inlineNodeText === '######' ||
        inlineNodeText in orderedListStyleFirstChars ||
        inlineNodeText === '-[]' ||
        inlineNodeText === '-[ ]' ||
        inlineNodeText === '-[x]' ||
        (inlineNodeText.length > 1 && inlineNodeText[inlineNodeText.length - 1] === '.' && isOneOfOrderedListStyleCharacterSets(inlineNodeText.slice(0, -1)))
      ) {
        trackedSelectionRangeIds.add(selectionRange.id);
      }
    }
    stateControl.delta.applyUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, ' '), { [matita.RedoUndoUpdateKey.InsertText]: true });
    const mutations: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const applyUnorderedListSelectionRanges: matita.SelectionRange[] = [];
    const applyOrderedListSelectionRanges: { $m_selectionRange: matita.SelectionRange; $m_orderedListStyle: OrderedListStyle }[] = [];
    const applyChecklistSelectionRanges: { $m_selectionRange: matita.SelectionRange; $m_isChecked: boolean }[] = [];
    const handledParagraphIds = new Set<string>();
    const potentialOrderedListPast1ToCheck: { $m_paragraphPoint: matita.ParagraphPoint; $m_text: string }[] = [];
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
      if (inlineNodeText[inlineNodeText.length - 1] === ' ' && inlineNodeText.slice(0, -1) in orderedListStyleFirstChars) {
        if (paragraph.config.type === ParagraphType.ListItem) {
          continue;
        }
        const firstChars = inlineNodeText.slice(0, -1);
        const orderedListStyle = orderedListStyleFirstChars[firstChars];
        const pointAtBeginningOfParagraph = matita.changeParagraphPointOffset(point, 0);
        mutations.push(matita.makeSpliceParagraphMutation(pointAtBeginningOfParagraph, point.offset, []));
        applyOrderedListSelectionRanges.push({ $m_selectionRange: selectionRange, $m_orderedListStyle: orderedListStyle });
        continue;
      }
      if (inlineNodeText === '-[] ' || inlineNodeText === '-[ ] ' || inlineNodeText === '-[x] ') {
        if (paragraph.config.type === ParagraphType.ListItem) {
          continue;
        }
        const isChecked = inlineNodeText === '-[x] ';
        const pointAtBeginningOfParagraph = matita.changeParagraphPointOffset(point, 0);
        mutations.push(matita.makeSpliceParagraphMutation(pointAtBeginningOfParagraph, point.offset, []));
        applyChecklistSelectionRanges.push({ $m_selectionRange: selectionRange, $m_isChecked: isChecked });
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
        continue;
      }
      if (
        inlineNodeText.length > 2 &&
        inlineNodeText[inlineNodeText.length - 1] === ' ' &&
        inlineNodeText[inlineNodeText.length - 2] === '.' &&
        paragraph.config.type !== ParagraphType.ListItem &&
        isOneOfOrderedListStyleCharacterSets(inlineNodeText.slice(0, -2))
      ) {
        potentialOrderedListPast1ToCheck.push({ $m_paragraphPoint: point, $m_text: inlineNodeText.slice(0, -2) });
      }
    }
    assert(
      new Set(potentialOrderedListPast1ToCheck.map((item) => matita.getParagraphIdFromParagraphPoint(item.$m_paragraphPoint))).size ===
        potentialOrderedListPast1ToCheck.length,
    );
    potentialOrderedListPast1ToCheck.sort((item1, item2) => {
      const point1BlockIndices = matita.indexBlockAtBlockReference(
        stateControl.stateView.document,
        matita.makeBlockReferenceFromParagraphPoint(item1.$m_paragraphPoint),
      );
      const point2BlockIndices = matita.indexBlockAtBlockReference(
        stateControl.stateView.document,
        matita.makeBlockReferenceFromParagraphPoint(item2.$m_paragraphPoint),
      );
      return matita.compareBlockIndicesForUniqueParagraphsAtBlockReferences(point1BlockIndices, point2BlockIndices) === LeftRightComparisonResult.IsLeft
        ? -1
        : 1;
    });
    const topLevelContent = matita.accessContentFromContentReference(stateControl.stateView.document, topLevelContentReference);
    let potentialOrderedListPast1ToCheckMutationsOnConfig: matita.Mutation<
      DocumentConfig,
      ContentConfig,
      ParagraphConfig,
      EmbedConfig,
      TextConfig,
      VoidConfig
    >[] = [];
    const goThroughPotentialOrderedListPast1ToCheck = (): void => {
      listStyleInjectionControl.$m_computeIndices();
      for (let i = 0; i < potentialOrderedListPast1ToCheck.length; i++) {
        const item = potentialOrderedListPast1ToCheck[i];
        const { $m_paragraphPoint: point, $m_text: text } = item;
        const paragraph = matita.accessParagraphFromParagraphPoint(stateControl.stateView.document, point);
        assert(paragraph.config.type !== ParagraphType.ListItem);
        const contentReference = matita.makeContentReferenceFromContent(matita.accessContentFromParagraphPoint(stateControl.stateView.document, point));
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
        const paragraphIndex = matita.getIndexOfBlockInContentFromBlockReference(stateControl.stateView.document, paragraphReference);
        let minimumListIndent = Infinity;
        let listId: string | undefined;
        for (let j = paragraphIndex - 1; j >= 0; j--) {
          const block = matita.accessBlockAtIndexInContentAtContentReference(stateControl.stateView.document, contentReference, j);
          if (matita.isEmbed(block) || block.config.type !== ParagraphType.ListItem || typeof block.config.ListItem_listId !== 'string') {
            break;
          }
          if (listId === undefined) {
            listId = block.config.ListItem_listId;
          } else if (block.config.ListItem_listId !== listId) {
            break;
          }
          const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, block.config);
          if (listType !== AccessedListStyleType.OrderedList) {
            continue;
          }
          const listIndent = convertStoredListIndentLevelToNumberedIndentLevel(block.config.ListItem_indentLevel);
          if (listIndent >= minimumListIndent) {
            continue;
          }
          const listIndexer = listStyleInjectionControl.$m_getNumberedListIndexerAtListId(block.config.ListItem_listId);
          const blockListNumber = listIndexer.$m_getListItemNumber(block.id);
          const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, block.config);
          const nextListMarkerText = getListMarkerTextWithoutPoint(blockListNumber + 1, orderedListStyle);
          if (nextListMarkerText === text) {
            const pointAtBeginningOfParagraph = matita.changeParagraphPointOffset(point, 0);
            mutations.push(matita.makeSpliceParagraphMutation(pointAtBeginningOfParagraph, point.offset, []));
            potentialOrderedListPast1ToCheckMutationsOnConfig.push(
              matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, {
                type: ParagraphType.ListItem,
                ListItem_listId: listId,
                ListItem_indentLevel: listIndent,
              }),
            );
            potentialOrderedListPast1ToCheck.splice(i--, 1);
            break;
          }
          if (listIndent === 0) {
            break;
          }
          minimumListIndent = listIndent;
        }
      }
    };
    const doPotentialOrderedListCheckLoop = (): void => {
      while (potentialOrderedListPast1ToCheck.length > 0) {
        goThroughPotentialOrderedListPast1ToCheck();
        if (potentialOrderedListPast1ToCheckMutationsOnConfig.length === 0) {
          break;
        }
        const batchMutation = matita.makeBatchMutation(potentialOrderedListPast1ToCheckMutationsOnConfig);
        potentialOrderedListPast1ToCheckMutationsOnConfig = [];
        stateControl.delta.applyMutation(batchMutation);
      }
    };
    stateControl.delta.applyUpdate(
      () => {
        if (applyUnorderedListSelectionRanges.length > 0) {
          const applyUnorderedListSelection = matita.makeSelection(applyUnorderedListSelectionRanges);
          stateControl.delta.applyUpdate(
            makeApplyListTypeAtSelectionUpdateFn(stateControl, topLevelContentReference, AccessedListStyleType.UnorderedList, applyUnorderedListSelection),
          );
        }
        if (applyOrderedListSelectionRanges.length > 0) {
          doPotentialOrderedListCheckLoop();
          for (const [orderedListStyle, items] of groupArray(applyOrderedListSelectionRanges, (item) => item.$m_orderedListStyle)) {
            const applyOrderedListSelectionForThisOrderedListStyle = matita.makeSelection(items.map((item) => item.$m_selectionRange));
            stateControl.delta.applyUpdate(
              makeApplyListTypeAtSelectionUpdateFn(
                stateControl,
                topLevelContentReference,
                AccessedListStyleType.OrderedList,
                applyOrderedListSelectionForThisOrderedListStyle,
                orderedListStyle,
              ),
            );
          }
        }
        if (applyChecklistSelectionRanges.length > 0) {
          const applyChecklistSelection = matita.makeSelection(applyChecklistSelectionRanges.map((item) => item.$m_selectionRange));
          stateControl.delta.applyUpdate(
            makeApplyListTypeAtSelectionUpdateFn(stateControl, topLevelContentReference, AccessedListStyleType.Checklist, applyChecklistSelection),
          );
          stateControl.delta.applyUpdate(
            makeToggleChecklistCheckedAtSelectionUpdateFn(
              stateControl,
              topLevelContentReference,
              'individually',
              matita.makeSelection(applyChecklistSelectionRanges.filter((item) => item.$m_isChecked).map((item) => item.$m_selectionRange)),
            ),
          );
        }
        doPotentialOrderedListCheckLoop();
        if (mutations.length === 0) {
          return;
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
  orderedListStyleForNewListItemAdded?: OrderedListStyle,
): matita.RunUpdateFn {
  return () => {
    if (orderedListStyleForNewListItemAdded !== undefined) {
      assert(listType === AccessedListStyleType.OrderedList);
    }
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
          assert(orderedListStyleForNewListItemAdded === undefined);
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
        (accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraphConfig) === listType &&
          (orderedListStyleForNewListItemAdded === undefined ||
            accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraphConfig) ===
              orderedListStyleForNewListItemAdded))
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
        if (orderedListStyleForNewListItemAdded !== undefined && orderedListStyleForNewListItemAdded !== OrderedListStyle.Decimal) {
          topLevelContentConfigMutations.push(
            matita.makeUpdateContentConfigMutation(
              topLevelContentReference,
              matita.makeNodeConfigDeltaSetInObjectAtPathAtKey(
                ['listStyles', 'listIdToStyle', listId, 'indentLevelToStyle', '0', 'OrderedList_style'],
                orderedListStyleForNewListItemAdded,
              ),
            ),
          );
        }
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
    const cycledSerializedListIdAndIndentCombinations = new Set<string>();
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
      const numberedIndentLevel = convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel);
      const serializedListIdAndNumberedIndentCombination = serializeListIdAndNumberedIndentCombination(listId, numberedIndentLevel);
      if (cycledSerializedListIdAndIndentCombinations.has(serializedListIdAndNumberedIndentCombination)) {
        continue;
      }
      cycledSerializedListIdAndIndentCombinations.add(serializedListIdAndNumberedIndentCombination);
      const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
      const newOrderedListStyle = mapOrderedListStyle(orderedListStyle);
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Previous),
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
          documentRenderControl.$m_makeSoftLineStartEndFocusPointTransformFn(matita.PointMovement.Next),
        ),
      );
    },
  },
  [StandardCommand.OpenSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_openSearch());
    },
  },
  [StandardCommand.CloseSearch]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_closeSearch());
    },
  },
  [StandardCommand.SearchCurrentFocusSelectionRange]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_searchCurrentFocusSelectionRange());
    },
  },
  [StandardCommand.SelectAllInstancesOfWord]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectAllInstancesOfWord());
    },
  },
  [StandardCommand.SelectAllInstancesOfSearchQuery]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectAllInstancesOfSearchQuery());
    },
  },
  [StandardCommand.SelectNextInstanceOfWordAtFocus]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectNextInstanceOfWordAtFocus());
    },
  },
  [StandardCommand.SelectPreviousInstanceOfWordAtFocus]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectPreviousInstanceOfWordAtFocus());
    },
  },
  [StandardCommand.SelectNextInstanceOfSearchQuery]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectNextSearchMatch(true));
    },
  },
  [StandardCommand.SelectPreviousInstanceOfSearchQuery]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectPreviousSearchMatch(true));
    },
  },
  [StandardCommand.SelectNextSearchMatch]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectNextSearchMatch());
    },
  },
  [StandardCommand.SelectPreviousSearchMatch]: {
    execute(stateControl, viewControl) {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_selectPreviousSearchMatch());
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
      stateControl.queueUpdate(makeToggleChecklistCheckedAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, 'synced'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.ToggleChecklistCheckedIndividually]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(makeToggleChecklistCheckedAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, 'individually'), {
        [doNotScrollToSelectionAfterChangeDataKey]: true,
      });
    },
  },
  [StandardCommand.IncreaseListIndent]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeIndentOrDedentListUpdateFn(documentRenderControl.$m_stateControl, documentRenderControl.$m_topLevelContentReference, 'indent'),
        {
          [doNotScrollToSelectionAfterChangeDataKey]: true,
        },
      );
    },
  },
  [StandardCommand.DecreaseListIndent]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(
        makeIndentOrDedentListUpdateFn(documentRenderControl.$m_stateControl, documentRenderControl.$m_topLevelContentReference, 'dedent'),
        {
          [doNotScrollToSelectionAfterChangeDataKey]: true,
        },
      );
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
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, AccessedListStyleType.OrderedList),
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
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, AccessedListStyleType.UnorderedList),
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
        makeApplyListTypeAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, AccessedListStyleType.Checklist),
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
        makeMapOrderedListStyleAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, (orderedListStyle) => {
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
        makeMapOrderedListStyleAtSelectionUpdateFn(stateControl, documentRenderControl.$m_topLevelContentReference, () => newOrderedListStyle),
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
      const { $m_insertText: insertText } = data;
      // TODO: Hybrid approach here? E.g. Japanese composition, hitting space bar doesn't insert space.
      if (insertText === ' ') {
        const documentRenderControl = viewControl.accessDocumentRenderControl();
        stateControl.queueUpdate(
          makePressedSpaceBarToInsertSpaceAtSelectionUpdateFn(
            stateControl,
            documentRenderControl.$m_topLevelContentReference,
            documentRenderControl.$m_listStyleInjectionControl,
          ),
        );
        return;
      }
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, insertText), { [matita.RedoUndoUpdateKey.InsertText]: true });
    },
  },
  [StandardCommand.InsertPastedPlainText]: {
    execute(stateControl, _viewControl, data: InsertPastedPlainTextCommandData): void {
      const { $m_pasteText: pasteText } = data;
      stateControl.queueUpdate(makeInsertPlainTextAtSelectionUpdateFn(stateControl, pasteText));
    },
  },
  [StandardCommand.InsertDroppedPlainText]: {
    execute(stateControl, _viewControl, data: InsertDroppedPlainTextCommandData): void {
      const { $m_dropText: dropText } = data;
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
      stateControl.queueUpdate(documentRenderControl.$m_openFloatingLinkBoxAtSelection(), { [keepFloatingLinkBoxOpenUpdateKey]: true });
    },
  },
  [StandardCommand.SplitParagraph]: {
    execute(stateControl): void {
      stateControl.queueUpdate(
        () => {
          stateControl.delta.applyUpdate(
            matita.makeInsertContentFragmentAtSelectionUpdateFn(stateControl, (selectionRange) => {
              const focusRange = matita.getFocusRangeFromSelectionRange(selectionRange);
              const rangeDirection = matita.getRangeDirection(stateControl.stateView.document, focusRange);
              const firstPoint = rangeDirection === matita.RangeDirection.Forwards ? focusRange.startPoint : focusRange.endPoint;
              const secondPoint = rangeDirection === matita.RangeDirection.Forwards ? focusRange.endPoint : focusRange.startPoint;
              let secondParagraphConfig: ParagraphConfig = {};
              if (matita.isParagraphPoint(firstPoint)) {
                const paragraph = matita.accessParagraphFromParagraphPoint(stateControl.stateView.document, firstPoint);
                const paragraphLength = matita.getParagraphLength(paragraph);
                secondParagraphConfig = { ...paragraph.config };
                const shouldResetType = (
                  [
                    ParagraphType.Heading1,
                    ParagraphType.Heading2,
                    ParagraphType.Heading3,
                    ParagraphType.Heading4,
                    ParagraphType.Heading5,
                    ParagraphType.Heading6,
                    ParagraphType.Indent1,
                    ParagraphType.IndentFirstLine1,
                    ParagraphType.IndentHanging1,
                  ] as unknown[]
                ).includes(paragraph.config.type);
                if (
                  firstPoint.offset === 0 &&
                  matita.isParagraphPoint(secondPoint) &&
                  matita.areParagraphPointsAtSameParagraph(firstPoint, secondPoint) &&
                  secondPoint.offset < paragraphLength
                ) {
                  const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
                  const mergeParagraphConfig: ParagraphConfig = {
                    ListItem_Checklist_checked: undefined,
                  };
                  if (shouldResetType) {
                    mergeParagraphConfig.type = undefined;
                  }
                  // TODO: Split backwards somehow instead in insert content fragment function?
                  stateControl.delta.applyMutation(
                    matita.makeUpdateParagraphConfigBetweenBlockReferencesMutation(paragraphReference, paragraphReference, mergeParagraphConfig),
                  );
                } else {
                  delete secondParagraphConfig.ListItem_Checklist_checked;
                }
                if (firstPoint.offset === paragraphLength && shouldResetType) {
                  delete secondParagraphConfig.type;
                }
              }
              return matita.makeContentFragment([
                matita.makeContentFragmentParagraph(matita.makeParagraph({}, [], matita.generateId())),
                matita.makeContentFragmentParagraph(matita.makeParagraph(secondParagraphConfig, [], matita.generateId())),
              ]);
            }),
          );
        },
        { [matita.RedoUndoUpdateKey.UniqueGroupedUpdate]: matita.makeUniqueGroupedChangeType() },
      );
    },
  },
  [StandardCommand.OpenQuickFixAtSelection]: {
    execute(stateControl, viewControl): void {
      const documentRenderControl = viewControl.accessDocumentRenderControl();
      stateControl.queueUpdate(documentRenderControl.$m_openQuickFixAtSelection());
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
  $m_visible: {
    $m_top: number;
    $m_left: number;
    $m_right: number;
    $m_bottom: number;
  };
  $m_notVisible: {
    $m_top: number;
    $m_left: number;
    $m_right: number;
    $m_bottom: number;
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
  const cursorTop = cursorRect.$m_top + yOffset - scrollElementTop;
  const cursorLeft = cursorRect.$m_left + xOffset - scrollElementLeft;
  const isVisible = !(
    cursorLeft < xOffset ||
    cursorLeft + cursorRect.$m_width + scrollElementBordersX > xOffset + width ||
    cursorTop < yOffset ||
    cursorTop + cursorRect.$m_height + scrollElementBordersY > yOffset + height
  );
  const additionalMargins = isVisible ? additionalMarginsAll.$m_visible : additionalMarginsAll.$m_notVisible;
  let x: number;
  let y: number;
  if (cursorLeft - additionalMargins.$m_left < xOffset) {
    x = cursorLeft - scrollElementPaddingLeft - additionalMargins.$m_left;
  } else if (cursorLeft + cursorRect.$m_width + scrollElementBordersX + additionalMargins.$m_right > xOffset + width) {
    x = cursorLeft + scrollElementBordersX + scrollElementPaddingRight + additionalMargins.$m_right - width;
  } else {
    x = xOffset;
  }
  if (cursorTop - additionalMargins.$m_top < yOffset) {
    y = cursorTop - scrollElementPaddingTop - additionalMargins.$m_top;
  } else if (cursorTop + cursorRect.$m_height + scrollElementBordersY + additionalMargins.$m_bottom > yOffset + height) {
    y = cursorTop + scrollElementBordersY + scrollElementPaddingBottom + additionalMargins.$m_bottom + cursorRect.$m_height - height;
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
  $m_mutationPart: matita.Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  $m_result: matita.ChangedMutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
interface LocalUndoStateDifference<
  DocumentConfig extends matita.NodeConfig,
  ContentConfig extends matita.NodeConfig,
  ParagraphConfig extends matita.NodeConfig,
  EmbedConfig extends matita.NodeConfig,
  TextConfig extends matita.NodeConfig,
  VoidConfig extends matita.NodeConfig,
> {
  $m_mutationResults: MutationResultWithMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
  $m_selectionBefore: matita.Selection;
  $m_selectionAfter: matita.Selection;
}
const enum LocalUndoControlLastChangeType {
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
    if (isSome(lastUpdateData) && !!lastUpdateData.$m_value[matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]) {
      return;
    }
    this.$p_redoStateDifferencesStack = [];
    let changeType: string;
    if (isSome(lastUpdateData) && !!lastUpdateData.$m_value[matita.RedoUndoUpdateKey.InsertText]) {
      changeType = LocalUndoControlLastChangeType.InsertPlainText;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.$m_value[matita.RedoUndoUpdateKey.RemoveTextBackwards]) {
      changeType = LocalUndoControlLastChangeType.RemoveTextBackwards;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.$m_value[matita.RedoUndoUpdateKey.RemoveTextForwards]) {
      changeType = LocalUndoControlLastChangeType.RemoveTextForwards;
    } else if (isSome(lastUpdateData) && !!lastUpdateData.$m_value[matita.RedoUndoUpdateKey.CompositionUpdate]) {
      changeType = LocalUndoControlLastChangeType.CompositionUpdate;
    } else if (isSome(lastUpdateData) && typeof lastUpdateData.$m_value[matita.RedoUndoUpdateKey.UniqueGroupedUpdate] === 'string') {
      changeType = lastUpdateData.$m_value[matita.RedoUndoUpdateKey.UniqueGroupedUpdate];
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
        $m_mutationPart: mutationPart,
        $m_result: result,
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
      $m_mutationResults: mutationResults,
      $m_selectionBefore: selectionBefore,
      $m_selectionAfter: selectionAfter,
    });
  }
  $m_forceNextChange(shouldForceChange: (changeType: string) => boolean): void {
    this.$p_forceChange = shouldForceChange;
  }
  $m_tryUndo(): void {
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
        const { $m_mutationResults: mutationResults, $m_selectionBefore: selectionBefore } = lastStateDifference;
        const reverseMutations: matita.BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
        for (let i = mutationResults.length - 1; i >= 0; i--) {
          const mutationResult = mutationResults[i];
          const { reverseMutation } = mutationResult.$m_result;
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
  $m_tryRedo(): void {
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
        const { $m_mutationResults: mutationResults, $m_selectionAfter: selectionAfter } = lastStateDifference;
        this.$p_stateControl.delta.applyMutation(matita.makeBatchMutation(mutationResults.map((mutationResult) => mutationResult.$m_mutationPart)));
        if (selectionAfter.selectionRanges.length > 0) {
          this.$p_stateControl.delta.setSelection(selectionAfter);
        }
      },
      { [matita.RedoUndoUpdateKey.IgnoreRecursiveUpdate]: true },
    );
  }
  $m_registerCommands<
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
      execute: this.$m_tryUndo.bind(this),
    });
    commandRegister.set(String(StandardCommand.Redo), {
      execute: this.$m_tryRedo.bind(this),
    });
  }
}
function getNodeBoundingRect(textNode: Node) {
  const range = document.createRange();
  range.selectNodeContents(textNode);
  return range.getBoundingClientRect();
}
class ReactiveMutationObserver extends DisposableClass {
  $m_records$: Source<MutationRecord[]>;
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
    this.$m_records$ = this.$p_records$;
    this.$p_mutationObserver = new MutationObserver((records) => {
      this.$p_records$(Push(records));
    });
  }
  $m_observe(target: Node, options?: MutationObserverInit): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_observerTargets.push({ target, options });
    this.$p_mutationObserver.observe(target, options);
    return Disposable(() => {
      this.$m_unobserve(target);
    });
  }
  $m_unobserve(target: Node): void {
    if (!this.active) {
      return;
    }
    const newObserverTargets = this.$p_observerTargets.filter((ot) => ot.target !== target);
    this.$p_observerTargets = [];
    const records = this.$p_mutationObserver.takeRecords();
    this.$p_records$(Push(records.filter((record) => record.target !== target)));
    this.$p_mutationObserver.disconnect();
    newObserverTargets.forEach((otherTarget) => {
      this.$m_observe(otherTarget.target, otherTarget.options);
    });
  }
  private $p_dispose(): void {
    this.$p_mutationObserver.disconnect();
    this.$p_observerTargets = [];
  }
}
class ReactiveIntersectionObserver extends DisposableClass {
  $m_entries$: Source<IntersectionObserverEntry[]>;
  private $p_entries$: Distributor<IntersectionObserverEntry[]>;
  private $p_intersectionObserver: IntersectionObserver;
  constructor(options?: IntersectionObserverInit) {
    super(() => this.$p_dispose());
    this.$p_entries$ = Distributor();
    this.add(this.$p_entries$);
    this.$m_entries$ = this.$p_entries$;
    this.$p_intersectionObserver = new IntersectionObserver((entries) => {
      this.$p_entries$(Push(entries));
    }, options);
  }
  $m_observe(target: Element): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_intersectionObserver.observe(target);
    return Disposable(() => {
      this.$m_unobserve(target);
    });
  }
  $m_unobserve(target: Element): void {
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
  $m_entries$: Source<ResizeObserverEntry[]>;
  private $p_entries$: Distributor<ResizeObserverEntry[]>;
  private $p_resizeObserver: ResizeObserver;
  constructor() {
    super(() => this.$p_dispose());
    this.$p_entries$ = Distributor();
    this.add(this.$p_entries$);
    this.$m_entries$ = this.$p_entries$;
    this.$p_resizeObserver = new ResizeObserver((entries) => {
      this.$p_entries$(Push(entries));
    });
  }
  $m_observe(target: Element, options?: ResizeObserverOptions): Disposable {
    if (!this.active) {
      return disposed;
    }
    this.$p_resizeObserver.observe(target, options);
    return Disposable(() => {
      this.$m_unobserve(target);
    });
  }
  $m_unobserve(target: Element): void {
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
  $m_paragraphId: string;
  $m_indentLevel: NumberedListIndent;
}
class ListIndexer {
  private $p_listItemInfos: IndexableUniqueStringList;
  private $p_paragraphIdToNumber = Object.create(null) as Record<string, number>;
  private $p_paragraphIdToIndentLevel = Object.create(null) as Record<string, NumberedListIndent>;
  private $p_isDirty = false;
  constructor() {
    this.$p_listItemInfos = new IndexableUniqueStringList([]);
  }
  $m_iterateParagraphIds(): IterableIterator<string> {
    return this.$p_listItemInfos.$m_iterBetween(0, this.$p_listItemInfos.$m_getLength() - 1);
  }
  $m_markDirty(): void {
    this.$p_isDirty = true;
  }
  $m_getIsDirty(): boolean {
    return this.$p_isDirty;
  }
  $m_recomputeListNumbers(viewControl: VirtualizedViewControl, numberedIndentLevels: Map<number, number>): void {
    assert(this.$p_isDirty);
    const documentRenderControl = viewControl.accessDocumentRenderControl();
    const numberOfListItemInfos = this.$p_listItemInfos.$m_getLength();
    const indices: number[] = Array<number>(maxListIndentLevel + 1);
    indices.fill(0);
    let previousIndentLevel = -1;
    for (let i = 0; i < numberOfListItemInfos; i++) {
      const paragraphId = this.$p_listItemInfos.$m_access(i);
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
          paragraphRenderControl.$m_markDirtyContainer();
          documentRenderControl.$m_dirtyParagraphIdQueue.$m_queue(paragraphId);
        }
      }
      previousIndentLevel = indentLevel;
    }
    this.$p_isDirty = false;
  }
  $m_setListItemIndentLevel(paragraphId: string, indentLevel: NumberedListIndent): void {
    assert(this.$p_listItemInfos.$m_has(paragraphId));
    const currentIndentLevel = this.$p_paragraphIdToIndentLevel[paragraphId];
    if (currentIndentLevel !== indentLevel) {
      this.$p_isDirty = true;
      this.$p_paragraphIdToIndentLevel[paragraphId] = indentLevel;
    }
  }
  $m_insertListItems(
    document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    listItemInfoToInsert: NumberedListItemInfo[],
  ): void {
    assert(listItemInfoToInsert.length > 0);
    this.$p_isDirty = true;
    for (let i = 0; i < listItemInfoToInsert.length; i++) {
      const listItemInfo = listItemInfoToInsert[i];
      assert(!this.$p_listItemInfos.$m_has(listItemInfo.$m_paragraphId));
      this.$p_paragraphIdToIndentLevel[listItemInfo.$m_paragraphId] = listItemInfo.$m_indentLevel;
      const paragraphReference = matita.makeBlockReferenceFromBlockId(listItemInfo.$m_paragraphId);
      const paragraphBlockIndices = matita.indexBlockAtBlockReference(document, paragraphReference);
      this.$p_listItemInfos.$m_insertValueUsingComparisonFunction(listItemInfo.$m_paragraphId, (paragraphId) => {
        const compareWithParagraphBlockReference = matita.makeBlockReferenceFromBlockId(paragraphId);
        const compareWithParagraphBlockIndices = matita.indexBlockAtBlockReference(document, compareWithParagraphBlockReference);
        return matita.compareBlockIndicesForUniqueParagraphsAtBlockReferences(paragraphBlockIndices, compareWithParagraphBlockIndices);
      });
    }
  }
  $m_onListItemRemoved(paragraphId: string): void {
    assert(this.$p_listItemInfos.$m_has(paragraphId));
    this.$p_isDirty = true;
    const index = this.$p_listItemInfos.$m_indexOf(paragraphId);
    this.$p_listItemInfos.$m_remove(index, index);
    delete this.$p_paragraphIdToNumber[paragraphId];
    delete this.$p_paragraphIdToIndentLevel[paragraphId];
  }
  $m_getListItemNumber(paragraphId: string): number {
    assert(this.$p_listItemInfos.$m_has(paragraphId) && !this.$p_isDirty);
    const value = this.$p_paragraphIdToNumber[paragraphId];
    assertIsNotNullish(value);
    return value;
  }
  $m_getItemCount(): number {
    return this.$p_listItemInfos.$m_getLength();
  }
}
const compositionStartDataKey = 'virtualized.compositionStart';
interface CompositionUpdateSelectionDataValue {
  $m_expirationId: number;
  $m_selectionStartOffsetAdjustAmount: number;
  $m_selectionEndOffsetAdjustAmount: number;
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
      '$m_expirationId' in value &&
      typeof value.$m_expirationId === 'number' &&
      '$m_selectionStartOffsetAdjustAmount' in value &&
      typeof value.$m_selectionStartOffsetAdjustAmount === 'number' &&
      '$m_selectionEndOffsetAdjustAmount' in value &&
      typeof value.$m_selectionEndOffsetAdjustAmount === 'number',
  );
  return value as CompositionUpdateSelectionDataValue;
}
function makeSelectionRangeCompositionUpdateDataValue(
  expirationId: number,
  selectionStartOffsetAdjustAmount: number,
  selectionEndOffsetAdjustAmount: number,
): CompositionUpdateSelectionDataValue {
  return {
    $m_expirationId: expirationId,
    $m_selectionStartOffsetAdjustAmount: selectionStartOffsetAdjustAmount,
    $m_selectionEndOffsetAdjustAmount: selectionEndOffsetAdjustAmount,
  };
}
type PendingCompositionSelectionOffsets = { $m_offsets?: { $m_startOffset: number; $m_endOffset: number } };
class FloatingVirtualizedTextInputControl extends DisposableClass {
  $m_inputElement: HTMLElement;
  private $p_isInComposition_syncedToQueueUpdate = false;
  private $p_isInComposition_syncStartDelayedEnd = false;
  private $p_lastNativeOffset = 0;
  private $p_unexpectedCompositionInterruption = false;
  private $p_lastCompositionSelectionTextInputUpdateOffsets: {
    $m_startOffset: number;
    $m_endOffset: number;
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
    this.$m_inputElement = document.createElement('span');
    this.$m_inputElement.contentEditable = 'true';
    this.$m_inputElement.spellcheck = false;
    this.$m_inputElement.style.position = 'absolute';
    this.$m_inputElement.style.outline = 'none';
    this.$m_inputElement.style.caretColor = 'transparent';
    this.$m_inputElement.style.fontFamily = 'initial';
    this.$m_inputElement.style.whiteSpace = 'nowrap';
    this.$m_inputElement.style.opacity = '0';
    this.$m_inputElement.style.textAlign = 'right';
    this.$m_inputElement.style.lineHeight = '1';
    const inputElementReactiveMutationObserver = new ReactiveMutationObserver();
    pipe(
      inputElementReactiveMutationObserver.$m_records$,
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
    inputElementReactiveMutationObserver.$m_observe(this.$m_inputElement, {
      childList: true,
    });
    addEventListener(this.$m_inputElement, 'selectionchange', this.$p_syncInputElement.bind(this), this);
    addEventListener(this.$m_inputElement, 'compositionstart', this.$p_onCompositionStart.bind(this), this);
    addWindowEventListener('compositionend', this.$p_onCompositionEnd.bind(this), this);
    addEventListener(this.$m_inputElement, 'beforeinput', this.$p_onBeforeInput.bind(this), this);
    if (!isSafari) {
      addEventListener(this.$m_inputElement, 'input', this.$p_onInput.bind(this), this);
    }
  }
  $m_setPositionAndHeight(left: number, top: number, height: number) {
    this.$m_inputElement.style.fontSize = `${height}px`;
    this.$m_inputElement.style.right = `calc(100% - ${left}px)`;
    this.$m_inputElement.style.top = `${top}px`;
  }
  $m_getIsInComposition(): boolean {
    return this.$p_isInComposition_syncedToQueueUpdate || this.$p_isInComposition_syncStartDelayedEnd;
  }
  $m_sync(): void {
    this.$p_syncInputElement();
  }
  $m_getIsFocused(): boolean {
    return document.activeElement === this.$m_inputElement;
  }
  $m_focusButDoNotScrollTo(): void {
    this.$m_inputElement.focus({
      preventScroll: true,
    });
  }
  $m_blur(): void {
    this.$m_inputElement.blur();
  }
  private $p_syncInputElement(): void {
    if (!this.$m_getIsFocused() || this.$m_getIsInComposition()) {
      return;
    }
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$p_stateControl.stateView.selection);
    if (!focusSelectionRange) {
      this.$m_inputElement.replaceChildren();
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
      !(this.$m_inputElement.childNodes.length === 0 && lastWord === '') &&
      !(
        this.$m_inputElement.childNodes.length === 1 &&
        this.$m_inputElement.childNodes[0] instanceof Text &&
        this.$m_inputElement.childNodes[0].nodeValue === lastWord
      )
    ) {
      if (lastWord === '') {
        this.$m_inputElement.replaceChildren();
      } else {
        const textNode = document.createTextNode(lastWord);
        this.$m_inputElement.replaceChildren(textNode);
      }
    }
    let newNativeNode: Node;
    if (lastWord === '') {
      newNativeNode = this.$m_inputElement;
    } else {
      newNativeNode = this.$m_inputElement.childNodes[0];
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
          this.$p_lastNativeOffset = this.$p_lastCompositionSelectionTextInputUpdateOffsets.$m_endOffset;
          // We reset this on compositionend, instead of compositionstart, because safari can run beforeinput before compositionstart.
          this.$p_lastCompositionSelectionTextInputUpdateOffsets = null;
        }
        this.$p_undoControl.$m_forceNextChange(
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
      if (nativeRange.startContainer === nativeRange.endContainer && this.$m_inputElement.contains(nativeRange.startContainer)) {
        this.$p_pendingCompositionBeforeInputSelectionOffsets.$m_offsets = {
          $m_startOffset: nativeRange.startOffset,
          $m_endOffset: nativeRange.endOffset,
        };
      }
    }
  }
  private $p_onInput(event: globalThis.Event): void {
    if (
      this.$p_pendingCompositionBeforeInputSelectionOffsets === undefined ||
      this.$p_pendingCompositionBeforeInputSelectionOffsets.$m_offsets !== undefined ||
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
        startOffsetAdjustAmount = startOffset - this.$p_lastCompositionSelectionTextInputUpdateOffsets.$m_startOffset;
        endOffsetAdjustAmount = endOffset - this.$p_lastCompositionSelectionTextInputUpdateOffsets.$m_endOffset;
      }
      this.$p_insertTextWithAdjustAmounts(text, startOffsetAdjustAmount, endOffsetAdjustAmount);
      const compositionSelectionTextInputUpdateOffsetsStartOffset = startOffset;
      const compositionSelectionTextInputUpdateOffsetsEndOffset = startOffset + text.length;
      this.$p_lastCompositionSelectionTextInputUpdateOffsets = {
        $m_startOffset: compositionSelectionTextInputUpdateOffsetsStartOffset,
        $m_endOffset: compositionSelectionTextInputUpdateOffsetsEndOffset,
      };
      if (text !== '') {
        if (isSafari) {
          this.$p_calculatePendingCompositionOffsets();
        }
        let updateSelectionRangeData: matita.UpdateSelectionRangeDataFn | undefined;
        let getSelectionChangeData: matita.GetSelectionChangeDataFn | undefined;
        assertIsNotNullish(pendingOffsets);
        const { $m_offsets: offsets } = pendingOffsets;
        if (offsets !== undefined) {
          updateSelectionRangeData = (_oldSelectionRange, newSelectionRange) => ({
            ...newSelectionRange.data,
            [compositionUpdateSelectionRangeDataKey]: makeSelectionRangeCompositionUpdateDataValue(
              this.$p_makeSelectionDataExpirationId(),
              offsets.$m_startOffset - compositionSelectionTextInputUpdateOffsetsStartOffset,
              offsets.$m_endOffset - compositionSelectionTextInputUpdateOffsetsEndOffset,
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
  $m_injectStyle(paragraphReference: matita.BlockReference, injectedStyle: ParagraphStyleInjection): void {
    const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    if (paragraph.config.type === ParagraphType.ListItem) {
      const topLevelContent = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
      const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
      injectedStyle.$m_ListItem_type = listType;
      if (listType === AccessedListStyleType.OrderedList) {
        assert(typeof paragraph.config.ListItem_listId === 'string');
        const numberedListIndexer = this.$m_getNumberedListIndexerAtListId(paragraph.config.ListItem_listId as string);
        injectedStyle.$m_ListItem_OrderedList_number = numberedListIndexer.$m_getListItemNumber(paragraph.id);
        const orderedListStyle = accessOrderedListStyleInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
        injectedStyle.$m_ListItem_OrderedList_style = orderedListStyle;
      }
    }
  }
  $m_getNumberedListIndexerAtListId(listId: string): ListIndexer {
    const numberedListIndexer = this.$p_numberedListIndexerMap.get(listId);
    assertIsNotNullish(numberedListIndexer);
    return numberedListIndexer;
  }
  $m_computeIndices(): void {
    const topLevelContent = matita.accessContentFromContentReference(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
    const { listStyles } = topLevelContent.config;
    if (matita.isJsonMap(listStyles)) {
      const { listIdToStyle } = listStyles;
      if (matita.isJsonMap(listIdToStyle)) {
        for (const [listId, numberedListIndexer] of this.$p_numberedListIndexerMap.entries()) {
          if (!numberedListIndexer.$m_getIsDirty()) {
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
              numberedListIndexer.$m_recomputeListNumbers(this.$p_viewControl, numberedIndentLevels);
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
      indexer.$m_insertListItems(this.$p_stateControl.stateView.document, [{ $m_paragraphId: paragraphId, $m_indentLevel: indentLevel }]);
    };
    const unregisterParagraphAtParagraphIdWithListId = (paragraphId: string, listId: string) => {
      const indexer = this.$p_numberedListIndexerMap.get(listId);
      assertIsNotNullish(indexer);
      indexer.$m_onListItemRemoved(paragraphId);
      if (indexer.$m_getItemCount() === 0) {
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
                          indexer.$m_setListItemIndentLevel(block.id, currentIndentLevel);
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
                        for (const paragraphId of numberedListIndexer.$m_iterateParagraphIds()) {
                          const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
                          const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
                          matita.assertIsParagraph(paragraph);
                          if (convertStoredListIndentLevelToNumberedIndentLevel(paragraph.config.ListItem_indentLevel) === indentLevel) {
                            if (listType === AccessedListStyleType.OrderedList) {
                              numberedListIndexer.$m_markDirty();
                            }
                            const paragraphRenderControl = this.$p_viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
                            paragraphRenderControl.$m_markDirtyContainer();
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
  $m_activeChildText: string | null;
  $m_setActiveChildText: (newActiveParent: string | null) => void;
}
const ToolbarDropdownItemContext = createContext<ToolbarDropdownItemContextValue | null>(null);
const ToolbarDropdownItemContextProvider = ToolbarDropdownItemContext.Provider;
type ToolbarPropsRunCommandFn = (commandInfo: CommandInfo<any>) => void;
interface ToolbarProps {
  $m_close$: Source<unknown>;
  $m_isToolbarOpenSink: Sink<boolean>;
  $m_resetFocusSink: Sink<undefined>;
  $m_runCommand: ToolbarPropsRunCommandFn;
}
function Toolbar(props: ToolbarProps): JSX.Element | null {
  const { $m_close$: close$, $m_isToolbarOpenSink: isToolbarOpenSink, $m_resetFocusSink: resetFocusSink, $m_runCommand: runCommand } = props;
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
        $m_commandName: commandName,
        $m_data: data,
      });
      unsetAsActive();
    };
  };
  return (
    <>
      <ToolbarDropdown
        $m_dropdown={WhichDropdown.Mark}
        $m_activeDropdown={activeDropdown}
        $m_setAsActive={() => setActiveDropdown(WhichDropdown.Mark)}
        $m_unsetAsActive={unsetAsActive}
        $m_isFirst={true}
        $m_text="Mark"
      >
        <ToolbarDropdownItem $m_text="Bold" $m_action={makeRunCommandAction(StandardCommand.ApplyBold)} />
        <ToolbarDropdownItem $m_text="Italic" $m_action={makeRunCommandAction(StandardCommand.ApplyItalic)} />
        <ToolbarDropdownItem $m_text="Underline" $m_action={makeRunCommandAction(StandardCommand.ApplyUnderline)} />
        <ToolbarDropdownItem $m_text="Code" $m_action={makeRunCommandAction(StandardCommand.ApplyCode)} />
        <ToolbarDropdownItem $m_text="Strikethrough" $m_action={makeRunCommandAction(StandardCommand.ApplyStrikethrough)} />
        <ToolbarDropdownItem $m_text="Script">
          <ToolbarDropdownItem $m_text="Default" $m_action={makeRunCommandAction(StandardCommand.ResetTextScript)} />
          <ToolbarDropdownItem $m_text="Superscript" $m_action={makeRunCommandAction(StandardCommand.ApplySuperscript)} />
          <ToolbarDropdownItem $m_text="Subscript" $m_action={makeRunCommandAction(StandardCommand.ApplySubscript)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Color">
          <ToolbarDropdownItem $m_text="Default" $m_action={makeRunCommandAction(StandardCommand.ResetTextColor)} />
          {colors.map((color) => (
            <ToolbarDropdownItem
              $m_text={colorLabels[color]}
              $m_color={colorHexValues[color]}
              key={color}
              $m_action={makeRunCommandAction(StandardCommand.ApplyTextColor, color)}
            />
          ))}
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Highlight">
          <ToolbarDropdownItem $m_text="Default" $m_action={makeRunCommandAction(StandardCommand.ResetHighlightColor)} />
          {colors.map((color) => (
            <ToolbarDropdownItem
              $m_text={colorLabels[color]}
              $m_backgroundColor={highlightColorHexValues[color]}
              $m_hoverBackgroundColor={darkerHighlightColorHexValues[color]}
              key={color}
              $m_action={makeRunCommandAction(StandardCommand.ApplyHighlightColor, color)}
            />
          ))}
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Link" $m_action={makeRunCommandAction(StandardCommand.OpenFloatingLinkBoxAtSelection)} />
        <ToolbarDropdownItem $m_text="Clear All" $m_action={makeRunCommandAction(StandardCommand.ResetInlineStyle)} />
      </ToolbarDropdown>
      <ToolbarDropdown
        $m_dropdown={WhichDropdown.Paragraph}
        $m_activeDropdown={activeDropdown}
        $m_setAsActive={() => setActiveDropdown(WhichDropdown.Paragraph)}
        $m_unsetAsActive={unsetAsActive}
        $m_isFirst={false}
        $m_text="Paragraph"
      >
        <ToolbarDropdownItem $m_text="Default" $m_action={makeRunCommandAction(StandardCommand.ResetParagraphType)} />
        <ToolbarDropdownItem $m_text="Heading">
          <ToolbarDropdownItem $m_text="Heading 1" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading1)} />
          <ToolbarDropdownItem $m_text="Heading 2" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading2)} />
          <ToolbarDropdownItem $m_text="Heading 3" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading3)} />
          <ToolbarDropdownItem $m_text="Heading 4" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading4)} />
          <ToolbarDropdownItem $m_text="Heading 5" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading5)} />
          <ToolbarDropdownItem $m_text="Heading 6" $m_action={makeRunCommandAction(StandardCommand.ApplyHeading6)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Blockquote" $m_action={makeRunCommandAction(StandardCommand.ApplyBlockquote)} />
        <ToolbarDropdownItem $m_text="List">
          <ToolbarDropdownItem $m_text="Bullet List" $m_action={makeRunCommandAction(StandardCommand.ApplyUnorderedList)} />
          <ToolbarDropdownItem $m_text="Ordered List" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedList)} />
          <ToolbarDropdownItem $m_text="Checklist" $m_action={makeRunCommandAction(StandardCommand.ApplyChecklist)} />
          <ToolbarDropdownItem $m_text="Ordered List Style">
            <ToolbarDropdownItem $m_text="Decimal" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.Decimal)} />
            <ToolbarDropdownItem $m_text="Lower Alpha" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerAlpha)} />
            <ToolbarDropdownItem $m_text="Lower Roman" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerRoman)} />
            <ToolbarDropdownItem $m_text="Lower Greek" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.LowerGreek)} />
            <ToolbarDropdownItem $m_text="Upper Alpha" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperAlpha)} />
            <ToolbarDropdownItem $m_text="Upper Roman" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperRoman)} />
            <ToolbarDropdownItem $m_text="Upper Greek" $m_action={makeRunCommandAction(StandardCommand.ApplyOrderedListStyle, OrderedListStyle.UpperGreek)} />
          </ToolbarDropdownItem>
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Alignment">
          <ToolbarDropdownItem $m_text="Left" $m_action={makeRunCommandAction(StandardCommand.AlignParagraphLeft)} />
          <ToolbarDropdownItem $m_text="Right" $m_action={makeRunCommandAction(StandardCommand.AlignParagraphRight)} />
          <ToolbarDropdownItem $m_text="Center" $m_action={makeRunCommandAction(StandardCommand.AlignParagraphCenter)} />
          <ToolbarDropdownItem $m_text="Justify" $m_action={makeRunCommandAction(StandardCommand.AlignParagraphJustify)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Indent">
          <ToolbarDropdownItem $m_text="Indented" $m_action={makeRunCommandAction(StandardCommand.ApplyIndent1)} />
          <ToolbarDropdownItem $m_text="Hanging Indent" $m_action={makeRunCommandAction(StandardCommand.ApplyHangingIndent1)} />
          <ToolbarDropdownItem $m_text="First Line Indent" $m_action={makeRunCommandAction(StandardCommand.ApplyIndentFirstLine1)} />
        </ToolbarDropdownItem>
        <ToolbarDropdownItem $m_text="Insert Above" $m_action={makeRunCommandAction(StandardCommand.InsertParagraphAbove)} />
        <ToolbarDropdownItem $m_text="Insert Below" $m_action={makeRunCommandAction(StandardCommand.InsertParagraphBelow)} />
        <ToolbarDropdownItem $m_text="Clear All" $m_action={makeRunCommandAction(StandardCommand.ResetParagraphStyle)} />
      </ToolbarDropdown>
      <ToolbarDropdown
        $m_dropdown={WhichDropdown.Insert}
        $m_activeDropdown={activeDropdown}
        $m_setAsActive={() => setActiveDropdown(WhichDropdown.Insert)}
        $m_unsetAsActive={unsetAsActive}
        $m_isFirst={false}
        $m_text="Insert"
      >
        <ToolbarDropdownItem $m_text="Image" />
        <ToolbarDropdownItem $m_text="Chip" />
        <ToolbarDropdownItem $m_text="Footnote" />
        <ToolbarDropdownItem $m_text="Latex" />
        <ToolbarDropdownItem $m_text="Table" />
        <ToolbarDropdownItem $m_text="Collapsible" />
        <ToolbarDropdownItem $m_text="Video" />
        <ToolbarDropdownItem $m_text="Callout" />
        <ToolbarDropdownItem $m_text="Code" />
        <ToolbarDropdownItem $m_text="Tabs" />
        <ToolbarDropdownItem $m_text="Divider" />
        <ToolbarDropdownItem $m_text="Spoiler" />
        <ToolbarDropdownItem $m_text="Latex" />
        <ToolbarDropdownItem $m_text="Mermaid" />
        <ToolbarDropdownItem $m_text="Excalidraw" />
        <ToolbarDropdownItem $m_text="Tweet" />
        <ToolbarDropdownItem $m_text="Poll" />
        <ToolbarDropdownItem $m_text="Web Link" />
        <ToolbarDropdownItem $m_text="Giphy" />
      </ToolbarDropdown>
    </>
  );
}
function useToolbarDropdownItemContextValue(isActive: boolean): ToolbarDropdownItemContextValue {
  const [activeChildText, setActiveChildText] = useState<string | null>(null);
  if (!isActive && activeChildText !== null) {
    setActiveChildText(null);
  }
  const childToolbarDropdownItemContextValue = useMemo(
    () => ({ $m_activeChildText: activeChildText, $m_setActiveChildText: setActiveChildText }),
    [activeChildText],
  );
  return childToolbarDropdownItemContextValue;
}
interface ToolbarDropdownProps extends React.PropsWithChildren {
  $m_dropdown: WhichDropdown;
  $m_activeDropdown: WhichDropdown | null;
  $m_setAsActive: () => void;
  $m_unsetAsActive: () => void;
  $m_text: string;
  $m_isFirst: boolean;
}
function ToolbarDropdown(props: ToolbarDropdownProps): JSX.Element | null {
  const {
    $m_dropdown: dropdown,
    $m_activeDropdown: activeDropdown,
    $m_setAsActive: setAsActive,
    $m_unsetAsActive: unsetAsActive,
    $m_text: text,
    $m_isFirst: isFirst,
    children,
  } = props;
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
  $m_text: string;
  $m_color?: string;
  $m_backgroundColor?: string;
  $m_hoverBackgroundColor?: string;
  $m_action?: () => void; // TODO.
}
function ToolbarDropdownItem(props: ToolbarDropdownItemProps): JSX.Element | null {
  const {
    $m_text: text,
    $m_color: color,
    $m_backgroundColor: backgroundColor,
    $m_hoverBackgroundColor: hoverBackgroundColor,
    $m_action: action,
    children,
  } = props;
  const parentToolbarDropdownItemContextValue = useContext(ToolbarDropdownItemContext);
  assertIsNotNullish(parentToolbarDropdownItemContextValue);
  const { $m_activeChildText: activeChildText, $m_setActiveChildText: setActiveChildText } = parentToolbarDropdownItemContextValue;
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
  $m_rootHtmlElement: HTMLElement;
  $m_stateControl: matita.StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  $m_viewControl: VirtualizedViewControl;
  $m_topLevelContentReference: matita.ContentReference;
  $m_htmlElementToNodeRenderControlMap: Map<HTMLElement, VirtualizedContentRenderControl | VirtualizedParagraphRenderControl>;
  $m_dirtyParagraphIdQueue: UniqueStringQueue;
  $m_relativeParagraphMeasurementCache: LruCache<string, RelativeParagraphMeasureCacheValue>;
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
    this.$m_rootHtmlElement = rootHtmlElement;
    this.$m_stateControl = stateControl;
    this.$m_viewControl = viewControl;
    this.$m_topLevelContentReference = topLevelContentReference;
    this.$m_htmlElementToNodeRenderControlMap = new Map();
    this.$m_dirtyParagraphIdQueue = new UniqueStringQueue([]);
    this.$p_selectionView$ = CurrentValueDistributor<SelectionViewMessage>({
      $m_viewCursorAndRangeInfos: {
        $m_viewCursorAndRangeInfosForSelectionRanges: [],
        $m_isDragging: false,
      },
      $m_renderSync: false,
    });
    this.$p_searchOverlay$ = CurrentValueDistributor<SearchOverlayMessage>({
      $m_calculateMatchInfos: () => [],
      $m_renderSync: false,
      $m_roundCorners: isFirefox,
    });
    this.$p_spellingMistakesOverlay$ = CurrentValueDistributor<SpellingMistakesOverlayMessage>({
      $m_spellingMistakeOverlayInfos: [],
    });
    this.$m_relativeParagraphMeasurementCache = new LruCache(250);
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
    this.$p_undoControl = new LocalUndoControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(this.$m_stateControl);
    this.add(this.$p_undoControl);
    this.$p_undoControl.$m_registerCommands(this.$p_commandRegister);
    this.$p_graphemeSegmenter = new this.$m_stateControl.stateControlConfig.IntlSegmenter();
  }
  $m_listStyleInjectionControl!: ListStyleInjectionControl;
  private $p_commitDirtyChanges(): void {
    this.$m_listStyleInjectionControl.$m_computeIndices();
    let paragraphId: string | null;
    while ((paragraphId = this.$m_dirtyParagraphIdQueue.$m_shift()) !== null) {
      const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
      const paragraphRenderControl = this.$m_viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
      const injectedStyle: ParagraphStyleInjection = {};
      this.$m_listStyleInjectionControl.$m_injectStyle(paragraphReference, injectedStyle);
      paragraphRenderControl.$m_commitDirtyChanges(injectedStyle);
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
  private $p_spellCheckControl: SpellCheckControl<TextConfig> | null = null;
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
  $m_init(): void {
    this.$p_spellCheckControl = new SpellCheckControl(
      this.$m_stateControl,
      this.$m_topLevelContentReference,
      (textConfig) => typeof textConfig.link === 'string' && textConfig.link !== '',
    );
    this.add(this.$p_spellCheckControl);
    this.$p_spellCheckControl.add(
      Disposable(() => {
        this.$p_spellCheckControl = null;
      }),
    );
    pipe(
      this.$p_spellCheckControl.$m_didLoad$,
      subscribe((event) => {
        assert(event.type === EndType);
        this.$m_stateControl.queueUpdate(() => {
          // HACK.
        });
      }, this),
    );
    this.$m_listStyleInjectionControl = new ListStyleInjectionControl(
      this.$m_stateControl,
      this.$m_viewControl,
      this.$m_topLevelContentReference,
      (paragraphId) => {
        this.$m_dirtyParagraphIdQueue.$m_queue(paragraphId);
      },
    );
    this.add(this.$m_listStyleInjectionControl);
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
      this.$m_stateControl.afterMutationPart$,
      map((message) => message.viewDelta),
      subscribe(this.$p_onViewDelta.bind(this), this),
    );
    pipe(this.$m_stateControl.beforeUpdateBatch$, subscribe(this.$p_onBeforeUpdateBatch.bind(this), this));
    pipe(this.$m_stateControl.afterUpdateBatch$, subscribe(this.$p_onAfterUpdateBatch.bind(this), this));
    pipe(this.$m_stateControl.selectionChange$, subscribe(this.$p_onSelectionChange.bind(this), this));
    pipe(this.$m_stateControl.customCollapsedSelectionTextConfigChange$, subscribe(this.$p_onCustomCollapsedSelectionTextConfigChange.bind(this), this));
    pipe(this.$m_stateControl.afterMutationPart$, subscribe(this.$p_onAfterMutationPart.bind(this), this));
    const topLevelContentRenderControl = new VirtualizedContentRenderControl(this.$m_topLevelContentReference, this.$m_viewControl);
    this.$m_viewControl.renderControlRegister.registerContentRenderControl(topLevelContentRenderControl);
    this.add(topLevelContentRenderControl);
    this.$p_inputControl = new FloatingVirtualizedTextInputControl(
      this.$m_stateControl,
      this.$p_undoControl,
      this.$m_runCommand.bind(this),
      () => this.$p_isDraggingSelection,
      () => {
        this.$p_endSelectionDrag$(Push(undefined));
      },
      () => this.$m_makeActivatedSelectionSecondaryDataExpirationId(),
    );
    this.add(this.$p_inputControl);
    addEventListener(this.$p_inputControl.$m_inputElement, 'focus', this.$p_onInputElementFocus.bind(this), this);
    addEventListener(this.$p_inputControl.$m_inputElement, 'blur', this.$p_onInputElementBlur.bind(this), this);
    // TODO: Alt-pressing to drag new selection range while in composition breaks after as keys are cleared.
    addEventListener(this.$p_inputControl.$m_inputElement, 'compositionend', () => this.$p_clearKeys(), this);
    addWindowEventListener('focus', () => this.$p_onWindowFocus.bind(this), this);
    addWindowEventListener('blur', this.$p_onWindowBlur.bind(this), this);
    const topLevelContentViewContainerElementReactiveResizeObserver = new ReactiveResizeObserver();
    this.add(topLevelContentViewContainerElementReactiveResizeObserver);
    const topLevelContentViewContentWidthResize$ = pipe(
      topLevelContentViewContainerElementReactiveResizeObserver.$m_entries$,
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
    topLevelContentViewContainerElementReactiveResizeObserver.$m_observe(this.$p_topLevelContentViewContainerElement, {
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
      this.$p_inputControl.$m_inputElement,
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
      if (isSome(spellingBoxRenderMessage$.lastValue) && spellingBoxRenderMessage$.lastValue.$m_value !== null) {
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
        this.$m_stateControl.afterMutationPart$,
        this.$m_stateControl.selectionChange$,
        this.$m_stateControl.customCollapsedSelectionTextConfigChange$,
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
          spellingBoxRenderMessage$.lastValue.$m_value === null ||
          spellingBoxRef.current === null
        ) {
          return;
        }
        assertIsNotNullish(textDecorationInfos);
        const mouseMoveEvent = event.value;
        const viewPosition: ViewPosition = {
          $m_left: mouseMoveEvent.x,
          $m_top: mouseMoveEvent.y,
        };
        const spellingBoxElement = spellingBoxRef.current;
        const spellingBoxBoundingRect = spellingBoxElement.getBoundingClientRect();
        if (
          spellingBoxBoundingRect.left <= viewPosition.$m_left &&
          viewPosition.$m_left <= spellingBoxBoundingRect.right &&
          spellingBoxBoundingRect.top <= viewPosition.$m_top &&
          viewPosition.$m_top <= spellingBoxBoundingRect.bottom
        ) {
          if (this.$p_spellingBoxFocusedSuggestionIndex === null) {
            return;
          }
          this.$p_spellingBoxFocusedSuggestionIndex = null;
          spellingBoxRenderMessage$(
            Push({
              ...spellingBoxRenderMessage$.lastValue.$m_value,
              focusedSuggestionIndex: null,
            }),
          );
          return;
        }
        if (this.$p_spellingBoxFocusedSuggestionIndex !== null) {
          return;
        }
        const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
        const relativeViewPosition: ViewPosition = {
          $m_left: viewPosition.$m_left + relativeOffsetLeft,
          $m_top: viewPosition.$m_top + relativeOffsetTop,
        };
        for (let i = 0; i < textDecorationInfos.length; i++) {
          const textDecorationInfo = textDecorationInfos[i];
          const { $m_charactersLineBoundingRectangle: charactersLineBoundingRectangle } = textDecorationInfo;
          if (
            charactersLineBoundingRectangle.$m_left <= relativeViewPosition.$m_left &&
            relativeViewPosition.$m_left <= charactersLineBoundingRectangle.$m_right &&
            charactersLineBoundingRectangle.$m_top <= relativeViewPosition.$m_top &&
            relativeViewPosition.$m_top <= charactersLineBoundingRectangle.$m_bottom
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
          spellingBoxRenderMessage$.lastValue.$m_value === null
        ) {
          throwUnreachable();
        }
        const suggestionsCount = spellingBoxRenderMessage$.lastValue.$m_value.$m_suggestions.length;
        assert(suggestionsCount > 0);
        this.$p_spellingBoxFocusedSuggestionIndex =
          (this.$p_spellingBoxFocusedSuggestionIndex + moveDirection + suggestionsCount) % spellingBoxRenderMessage$.lastValue.$m_value.$m_suggestions.length;
        spellingBoxRenderMessage$(
          Push({
            ...spellingBoxRenderMessage$.lastValue.$m_value,
            $m_focusedSuggestionIndex: this.$p_spellingBoxFocusedSuggestionIndex,
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
          spellingBoxRenderMessage$.lastValue.$m_value === null ||
          spellingBoxRenderMessage$.lastValue.$m_value.$m_suggestions.length === 0
        ) {
          throwUnreachable();
        }
        const replacementSuggestion = spellingBoxRenderMessage$.lastValue.$m_value.$m_suggestions[this.$p_spellingBoxFocusedSuggestionIndex];
        assertIsNotNullish(replacementSuggestion);
        spellingBoxRenderMessage$.lastValue.$m_value.$m_replaceWith(replacementSuggestion);
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
      const spellingMistakes = this.$p_spellCheckControl.$m_getSpellingMistakesInParagraphAtParagraphReference(paragraphReference);
      if (spellingMistakes === null) {
        return;
      }
      let hoveredSpellingMistake: ParagraphSpellingMistake | undefined;
      for (let i = 0; i < spellingMistakes.length; i++) {
        const spellingMistake = spellingMistakes[i];
        const { $m_startOffset: startOffset, $m_endOffset: endOffset } = spellingMistake;
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
      const hoveredSpellingMistakeStartOffset = hoveredSpellingMistake.$m_startOffset;
      const hoveredSpellingMistakeEndOffset = hoveredSpellingMistake.$m_endOffset;
      const misspelledWord = matita
        .sliceParagraphChildren(
          matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, paragraphPoint),
          hoveredSpellingMistakeStartOffset,
          hoveredSpellingMistakeEndOffset,
        )
        .map((textNode) => {
          matita.assertIsText(textNode);
          return textNode.text;
        })
        .join('');
      const suggestions = this.$p_spellCheckControl.$m_suggestMisspelledWord(misspelledWord);
      const { $m_visibleLeft: visibleLeft, $m_visibleRight: visibleRight } = this.$p_getVisibleLeftAndRight();
      const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
      const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
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
      const paragraphLength = matita.getParagraphLength(matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, paragraphPoint));
      const fixedSuggestions = suggestions.filter((suggestion) => {
        const words = suggestion.normalize().toLowerCase().split(/[ -]/g);
        return words.every(
          (word, i) => word.length > 2 || (i === 0 && (word === 'a' || word === 'i')) || (word.length === 2 && commonTwoLetterWords.has(word)),
        );
      });
      this.$p_closeToolbarAndFocus();
      this.$p_isSpellingBoxOpen = true;
      this.$p_spellingBoxFocusedSuggestionIndex = isPastPreviousCharacterHalfPoint === null ? (suggestions.length === 0 ? -1 : 0) : null;
      this.$p_undoControl.$m_forceNextChange(() => true);
      spellingBoxRenderMessage$(
        Push({
          $m_misspelledWord: misspelledWord,
          $m_suggestions: fixedSuggestions,
          $m_visibleBoundingRect: visibleBoundingRect,
          $m_wordBoundingRect: wordBoundingRect,
          $m_replaceWith: (suggestion) => {
            this.$m_stateControl.queueUpdate(
              () => {
                this.$p_inputControl.$m_focusButDoNotScrollTo();
                let paragraph: matita.Paragraph<ParagraphConfig, TextConfig, VoidConfig>;
                try {
                  paragraph = matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, paragraphPoint);
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
                  matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference)),
                  spellingMistakeStartPoint,
                  spellingMistakeEndPoint,
                  matita.generateId(),
                );
                const currentSelectionRangeIds = new Set(this.$m_stateControl.stateView.selection.selectionRanges.map((selectionRange) => selectionRange.id));
                this.$m_stateControl.delta.applyUpdate(() => {
                  this.$m_stateControl.delta.applyMutation(
                    matita.makeSpliceParagraphMutation(spellingMistakeStartPoint, hoveredSpellingMistakeEndOffset - hoveredSpellingMistakeStartOffset, [
                      matita.makeText(
                        getInsertTextConfigAtSelectionRange(
                          this.$m_stateControl.stateView.document,
                          this.$m_stateControl.stateView.customCollapsedSelectionTextConfig,
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
          $m_focusedSuggestionIndex: this.$p_spellingBoxFocusedSuggestionIndex,
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
          !this.$p_spellCheckControl.$m_getIsLoaded() ||
          (isSome(spellingBoxRenderMessage$.lastValue) && spellingBoxRenderMessage$.lastValue.$m_value !== null)
        ) {
          return;
        }
        const viewPosition: ViewPosition = {
          $m_left: mouseMoveEvent.x,
          $m_top: mouseMoveEvent.y,
        };
        const position = this.$p_calculatePositionFromViewPosition(viewPosition, false, false, true);
        if (position === null) {
          return;
        }
        if (position.$m_type !== HitPositionType.ParagraphText) {
          throwUnreachable();
        }
        const { $m_isPastPreviousCharacterHalfPoint: isPastPreviousCharacterHalfPoint } = position;
        const { point } = position.$m_pointWithContentReference;
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
        const enum SelectionType {
          Grapheme,
          Word,
          Paragraph,
        }
        interface PointInfo {
          position: HitPosition;
          stateView: matita.StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
        }
        const enum SelectionJoiningType {
          Overwrite,
          Separate,
          DisjointExtend,
        }
        let dragState:
          | {
              $m_startViewPosition: ViewPosition;
              $m_lastViewPosition: ViewPosition;
              $m_startPointInfo: PointInfo;
              $m_lastPointInfo: PointInfo;
              $m_originalSelection: matita.Selection;
              $m_beforeSelection: matita.Selection;
              $m_selectionType: SelectionType;
              $m_isExtendSelection: boolean;
              $m_selectionJoiningType: SelectionJoiningType;
            }
          | undefined;
        const transformPointInfoToCurrentPointWithContentReference = (pointInfo: PointInfo): matita.PointWithContentReference | null => {
          if (pointInfo.position.$m_type === HitPositionType.CheckboxMarker) {
            try {
              matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, pointInfo.position.$m_paragraphReference);
            } catch (error) {
              if (!(error instanceof matita.BlockNotInBlockStoreError)) {
                throw error;
              }
              return null;
            }
            return {
              point: matita.makeBlockPointFromBlockReference(pointInfo.position.$m_paragraphReference),
              contentReference: matita.makeContentReferenceFromContent(
                matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, pointInfo.position.$m_paragraphReference),
              ),
            };
          }
          const dummyRange = matita.makeRange(
            pointInfo.position.$m_pointWithContentReference.contentReference,
            pointInfo.position.$m_pointWithContentReference.point,
            pointInfo.position.$m_pointWithContentReference.point,
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
          const startSelection = this.$m_stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
            {
              selection: matita.makeSelection([dummySelectionRange]),
              fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
              shouldTransformAsSelection: true,
            },
            pointInfo.stateView,
            this.$m_stateControl.stateView,
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
              $m_left: pointerEvent.x,
              $m_top: pointerEvent.y,
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
              filterMap<{ $m_key: string; $m_keyboardEvent?: KeyboardEvent }, KeyboardEvent | undefined>(({ $m_key: key, $m_keyboardEvent: keyboardEvent }) =>
                key === 'Escape' ? Some(keyboardEvent) : None,
              ),
              subscribe((event) => {
                if (event.type !== PushType) {
                  throwUnreachable();
                }
                const keyboardEvent = event.value;
                keyboardEvent?.preventDefault();
                this.$m_stateControl.queueUpdate(() => {
                  assertIsNotNullish(dragState);
                  endSelectionDrag();
                  this.$m_stateControl.delta.setSelection(
                    this.$m_stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                      { selection: dragState.$m_originalSelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix, shouldTransformAsSelection: true },
                      dragState.$m_startPointInfo.stateView,
                      this.$m_stateControl.stateView,
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
                  $m_left: pointerEvent.x,
                  $m_top: pointerEvent.y,
                };
                const position = this.$p_calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold, false);
                queueSelectionUpdate(
                  position && {
                    position,
                    stateView: this.$m_stateControl.snapshotStateThroughStateView(),
                  },
                );
              }, pointerCaptureDisposable),
            );
            const selectionType: SelectionType = index === 0 ? SelectionType.Grapheme : (index - 1) % 2 === 0 ? SelectionType.Word : SelectionType.Paragraph;
            index++;
            const isExtendSelection = this.$p_keyDownSet.has('Shift');
            if (dragState) {
              dragState.$m_selectionType = selectionType;
              dragState.$m_lastViewPosition = viewPosition;
              dragState.$m_isExtendSelection = isExtendSelection;
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
                  $m_type: CalculateDraggingResultType.ToggleCheckbox;
                  $m_paragraphReference: matita.BlockReference;
                }
              | {
                  $m_type: CalculateDraggingResultType.Selection;
                  $m_selection: matita.Selection;
                };
            const calculateDraggingResult = (endPointInfo: PointInfo | null): CalculateDraggingResult | null => {
              assertIsNotNullish(dragState);
              const transformedBeforeSelection = this.$m_stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
                { selection: dragState.$m_beforeSelection, fixWhen: matita.MutationSelectionTransformFixWhen.NoFix, shouldTransformAsSelection: true },
                dragState.$m_startPointInfo.stateView,
                this.$m_stateControl.stateView,
              );
              const finalPointInfo = endPointInfo ?? dragState.$m_lastPointInfo;
              if (dragState.$m_startPointInfo.position.$m_type === HitPositionType.CheckboxMarker) {
                const startPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.$m_startPointInfo);
                if (!startPointWithContentReference) {
                  return null;
                }
                matita.assertIsBlockPoint(startPointWithContentReference.point);
                const paragraph = matita.accessBlockFromBlockPoint(this.$m_stateControl.stateView.document, startPointWithContentReference.point);
                matita.assertIsParagraph(paragraph);
                const topLevelContent = matita.accessContentFromContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference);
                if (
                  paragraph.config.type !== ParagraphType.ListItem ||
                  accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config) !== AccessedListStyleType.Checklist
                ) {
                  return null;
                }
                assert(typeof paragraph.config.ListItem_listId === 'string');
                const lastCheckboxMarkerParagraphReference =
                  finalPointInfo.position.$m_type === HitPositionType.CheckboxMarker
                    ? finalPointInfo.position.$m_paragraphReference
                    : finalPointInfo.position.$m_checkboxMarkerParagraphReference;
                if (
                  lastCheckboxMarkerParagraphReference !== null &&
                  matita.areBlockReferencesAtSameBlock(dragState.$m_startPointInfo.position.$m_paragraphReference, lastCheckboxMarkerParagraphReference)
                ) {
                  if (endPointInfo === null) {
                    return null;
                  }
                  return {
                    $m_type: CalculateDraggingResultType.ToggleCheckbox,
                    $m_paragraphReference: dragState.$m_startPointInfo.position.$m_paragraphReference,
                  };
                }
                return null;
              }
              let originalStartPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.$m_startPointInfo);
              if (!originalStartPointWithContentReference) {
                return null;
              }
              let originalEndPointWithContentReference: matita.PointWithContentReference | null;
              if (endPointInfo) {
                originalEndPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(endPointInfo);
              } else if (dragState.$m_lastPointInfo === dragState.$m_startPointInfo) {
                originalEndPointWithContentReference = originalStartPointWithContentReference;
              } else {
                originalEndPointWithContentReference = transformPointInfoToCurrentPointWithContentReference(dragState.$m_lastPointInfo);
              }
              if (!originalEndPointWithContentReference) {
                return null;
              }
              if (finalPointInfo.position.$m_type === HitPositionType.CheckboxMarker) {
                throwUnreachable();
              }
              const originalIsWrappedLineStart = finalPointInfo.position.$m_isWrappedLineStart;
              const originalIsWrappedLinePreviousEnd = finalPointInfo.position.$m_isWrappedLinePreviousEnd;
              endPointInfo = null;
              let extendedSelectionRangeId: string | null;
              if (dragState.$m_isExtendSelection && transformedBeforeSelection.selectionRanges.length > 0) {
                const selectionRangeToExtend =
                  dragState.$m_selectionJoiningType === SelectionJoiningType.Overwrite
                    ? matita.getAnchorSelectionRangeFromSelection(transformedBeforeSelection)
                    : matita.getFocusSelectionRangeFromSelection(transformedBeforeSelection);
                assertIsNotNullish(selectionRangeToExtend);
                const rangeToExtend =
                  dragState.$m_selectionJoiningType === SelectionJoiningType.DisjointExtend
                    ? matita.getFocusRangeFromSelectionRange(selectionRangeToExtend)
                    : matita.getAnchorRangeFromSelectionRange(selectionRangeToExtend);
                originalStartPointWithContentReference = {
                  contentReference: rangeToExtend.contentReference,
                  point: matita.getAnchorPointFromRange(rangeToExtend),
                };
                extendedSelectionRangeId = selectionRangeToExtend.id;
              } else {
                extendedSelectionRangeId = null;
              }
              let startPointWithContentReference: matita.PointWithContentReference;
              let endPointWithContentReference: matita.PointWithContentReference;
              let isFocusWrappedLineStart: boolean;
              if (dragState.$m_selectionType === SelectionType.Grapheme) {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalEndPointWithContentReference;
                isFocusWrappedLineStart = originalIsWrappedLineStart;
              } else if (
                matita.isParagraphPoint(originalStartPointWithContentReference.point) &&
                matita.arePointWithContentReferencesEqual(originalStartPointWithContentReference, originalEndPointWithContentReference) &&
                matita.getParagraphLength(
                  matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, originalStartPointWithContentReference.point),
                ) === 0
              ) {
                startPointWithContentReference = originalStartPointWithContentReference;
                endPointWithContentReference = originalStartPointWithContentReference;
                isFocusWrappedLineStart = false;
              } else {
                const originalStartPointKey = matita.makePointKeyFromPoint(
                  this.$m_stateControl.stateView.document,
                  originalStartPointWithContentReference.contentReference,
                  originalStartPointWithContentReference.point,
                );
                const originalEndPointKey = matita.makePointKeyFromPoint(
                  this.$m_stateControl.stateView.document,
                  originalEndPointWithContentReference.contentReference,
                  originalEndPointWithContentReference.point,
                );
                let isBackwards =
                  matita.compareKeys(this.$m_stateControl.stateView.document, originalStartPointKey, originalEndPointKey) === matita.CompareKeysResult.After;
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
                if (dragState.$m_selectionType === SelectionType.Word) {
                  const originalFirstPointWithContentReference = firstPointWithContentReference;
                  firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.WordBoundary,
                    matita.PointMovement.PreviousBoundByEdge,
                  )(
                    this.$m_stateControl.stateView.document,
                    this.$m_stateControl.stateControlConfig,
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
                    if (dragState.$m_startPointInfo.position.$m_isPastPreviousCharacterHalfPoint) {
                      // Try backwards.
                      firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                        matita.MovementGranularity.WordBoundary,
                        matita.PointMovement.Previous,
                      )(
                        this.$m_stateControl.stateView.document,
                        this.$m_stateControl.stateControlConfig,
                        dummyFirstRange,
                        firstPointWithContentReference.point,
                        dummyFirstSelectionRange,
                      );
                      tryForwards = matita.arePointWithContentReferencesEqual(firstPointWithContentReference, secondPointWithContentReference);
                    }
                    if (tryForwards) {
                      secondPointWithContentReference = matita.makeDefaultPointTransformFn(matita.MovementGranularity.WordBoundary, matita.PointMovement.Next)(
                        this.$m_stateControl.stateView.document,
                        this.$m_stateControl.stateControlConfig,
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
                      this.$m_stateControl.stateView.document,
                      this.$m_stateControl.stateControlConfig,
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
                        this.$m_stateControl.stateView.document,
                        this.$m_stateControl.stateControlConfig,
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
                  if (dragState.$m_selectionType !== SelectionType.Paragraph) {
                    assertUnreachable(dragState.$m_selectionType);
                  }
                  firstPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.Paragraph,
                    matita.PointMovement.PreviousBoundByEdge,
                  )(
                    this.$m_stateControl.stateView.document,
                    this.$m_stateControl.stateControlConfig,
                    dummyFirstRange,
                    firstPointWithContentReference.point,
                    dummyFirstSelectionRange,
                  );
                  secondPointWithContentReference = matita.makeDefaultPointTransformFn(
                    matita.MovementGranularity.Paragraph,
                    matita.PointMovement.NextBoundByEdge,
                  )(
                    this.$m_stateControl.stateView.document,
                    this.$m_stateControl.stateControlConfig,
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
                priorityRangeId?: string,
              ): matita.ResolveOverlappingSelectionRangesResult | null => {
                if (info.range1WithKeys.selectionRangeId === prioritySelectionRangeId && info.range2WithKeys.selectionRangeId !== prioritySelectionRangeId) {
                  const newSelectionRangeId = info.updateSelectionRangeId(info.range2WithKeys.selectionRangeId, prioritySelectionRangeId);
                  return {
                    newRangeWithKeys: {
                      ...info.range1WithKeys,
                      selectionRangeId: newSelectionRangeId,
                    },
                    rangeIdsToRemove: new Set(
                      info.rangesWithKeys
                        .filter((rangeWithKeys) => rangeWithKeys.selectionRangeId === info.range2WithKeys.selectionRangeId)
                        .map((rangeWithKeys) => rangeWithKeys.range.id),
                    ),
                  };
                }
                if (info.range1WithKeys.selectionRangeId !== prioritySelectionRangeId && info.range2WithKeys.selectionRangeId === prioritySelectionRangeId) {
                  const newSelectionRangeId = info.updateSelectionRangeId(info.range1WithKeys.selectionRangeId, prioritySelectionRangeId);
                  return {
                    newRangeWithKeys: {
                      ...info.range2WithKeys,
                      selectionRangeId: newSelectionRangeId,
                    },
                    rangeIdsToRemove: new Set(
                      info.rangesWithKeys
                        .filter((rangeWithKeys) => rangeWithKeys.selectionRangeId === info.range1WithKeys.selectionRangeId)
                        .map((rangeWithKeys) => rangeWithKeys.range.id),
                    ),
                  };
                }
                if (info.range1WithKeys.selectionRangeId === prioritySelectionRangeId && info.range2WithKeys.selectionRangeId === prioritySelectionRangeId) {
                  if (info.range1WithKeys.range.id === priorityRangeId) {
                    return { newRangeWithKeys: info.range1WithKeys, rangeIdsToRemove: null };
                  }
                  if (info.range2WithKeys.range.id === priorityRangeId) {
                    return { newRangeWithKeys: info.range2WithKeys, rangeIdsToRemove: null };
                  }
                }
                return null;
              };
              const draggedSelectionRanges = matita.makeRangesConnectingPointsAtContentReferences(
                this.$m_stateControl.stateView.document,
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
                isFocusWrappedLineStart
                  ? {
                      [VirtualizedDataKey.SelectionRangeDataLineWrapFocusCursorWrapToNextLineWithExpirationId]:
                        makeLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(this.$m_makeActivatedSelectionSecondaryDataExpirationId()),
                    }
                  : {},
                extendedSelectionRangeId === null ? matita.generateId() : extendedSelectionRangeId,
                true,
              );
              if (dragState.$m_selectionJoiningType === SelectionJoiningType.Overwrite || transformedBeforeSelection.selectionRanges.length === 0) {
                return { $m_type: CalculateDraggingResultType.Selection, $m_selection: matita.makeSelection([draggedSelectionRange]) };
              }
              if (dragState.$m_selectionJoiningType === SelectionJoiningType.DisjointExtend) {
                const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(transformedBeforeSelection);
                assertIsNotNullish(focusSelectionRange);
                const focusDraggedRange = matita.getFocusRangeFromSelectionRange(draggedSelectionRange);
                return {
                  $m_type: CalculateDraggingResultType.Selection,
                  $m_selection: matita.sortAndMergeAndFixSelectionRanges(
                    this.$m_stateControl.stateView.document,
                    this.$m_stateControl.stateControlConfig,
                    [
                      ...transformedBeforeSelection.selectionRanges.filter((selectionRange) => selectionRange.id !== focusSelectionRange.id),
                      matita.makeSelectionRange(
                        [
                          ...(extendedSelectionRangeId === null
                            ? focusSelectionRange.ranges
                            : focusSelectionRange.ranges.filter((range) => range.id !== focusSelectionRange.focusRangeId)),
                          ...draggedSelectionRange.ranges,
                        ],
                        focusSelectionRange.anchorRangeId,
                        draggedSelectionRange.focusRangeId,
                        matita.SelectionRangeIntention.Text,
                        { ...focusSelectionRange.data, ...draggedSelectionRange.data },
                        focusSelectionRange.id,
                      ),
                    ],
                    (info) => resolveOverlappingSelectionRanges(info, focusSelectionRange.id, focusDraggedRange.id),
                  ),
                };
              }
              if (extendedSelectionRangeId !== null) {
                return {
                  $m_type: CalculateDraggingResultType.Selection,
                  $m_selection: matita.sortAndMergeAndFixSelectionRanges(
                    this.$m_stateControl.stateView.document,
                    this.$m_stateControl.stateControlConfig,
                    [
                      ...transformedBeforeSelection.selectionRanges.filter((selectionRange) => selectionRange.id !== extendedSelectionRangeId),
                      draggedSelectionRange,
                    ],
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    (info) => resolveOverlappingSelectionRanges(info, extendedSelectionRangeId!),
                  ),
                };
              }
              if (
                !isMovedPastThreshold &&
                dragState.$m_selectionType === SelectionType.Grapheme &&
                matita.arePointWithContentReferencesEqual(originalStartPointWithContentReference, originalEndPointWithContentReference) &&
                transformedBeforeSelection.selectionRanges.length > 1
              ) {
                const withoutCollapsedAtSameSpotSelectionRanges = transformedBeforeSelection.selectionRanges.filter(
                  (selectionRange) => !matita.areSelectionRangesCoveringSameContent(selectionRange, draggedSelectionRange),
                );
                if (withoutCollapsedAtSameSpotSelectionRanges.length !== transformedBeforeSelection.selectionRanges.length) {
                  return { $m_type: CalculateDraggingResultType.Selection, $m_selection: matita.makeSelection(withoutCollapsedAtSameSpotSelectionRanges) };
                }
              }
              return {
                $m_type: CalculateDraggingResultType.Selection,
                $m_selection: matita.sortAndMergeAndFixSelectionRanges(
                  this.$m_stateControl.stateView.document,
                  this.$m_stateControl.stateControlConfig,
                  [...transformedBeforeSelection.selectionRanges, draggedSelectionRange],
                  (info) => resolveOverlappingSelectionRanges(info, draggedSelectionRange.id),
                ),
              };
            };
            const queueSelectionUpdate = (endPointInfo: PointInfo | null): void => {
              this.$p_isDraggingSelection = !endPointInfo;
              this.$m_stateControl.queueUpdate(() => {
                if (didEndSelectionDragManually) {
                  return;
                }
                const calculatedDraggingResult = calculateDraggingResult(endPointInfo);
                if (calculatedDraggingResult === null) {
                  this.$p_inputControl.$m_focusButDoNotScrollTo();
                  endPointInfo = null;
                  return;
                }
                if (calculatedDraggingResult.$m_type === CalculateDraggingResultType.ToggleCheckbox) {
                  assertIsNotNullish(endPointInfo);
                  const point = matita.makeBlockPointFromBlockReference(calculatedDraggingResult.$m_paragraphReference);
                  const contentReference = matita.makeContentReferenceFromContent(
                    matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, calculatedDraggingResult.$m_paragraphReference),
                  );
                  const range = matita.makeRange(contentReference, point, point, matita.generateId());
                  const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Block, {}, matita.generateId());
                  const selection = matita.makeSelection([selectionRange]);
                  this.$m_stateControl.delta.applyUpdate(
                    makeToggleChecklistCheckedAtSelectionUpdateFn(this.$m_stateControl, this.$m_topLevelContentReference, 'individually', selection),
                    { [doNotScrollToSelectionAfterChangeDataKey]: true },
                  );
                  return;
                }
                const newSelection = calculatedDraggingResult.$m_selection;
                const allSelectionIds = newSelection.selectionRanges.map((selectionRange) => selectionRange.id);
                this.$m_stateControl.delta.setSelection(newSelection, undefined, {
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
                  $m_left: pointerEvent.x,
                  $m_top: pointerEvent.y,
                };
                const deltaX = viewPosition.$m_left - dragState.$m_startViewPosition.$m_left;
                const deltaY = viewPosition.$m_top - dragState.$m_startViewPosition.$m_top;
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
                  $m_left: pointerEvent.x,
                  $m_top: pointerEvent.y,
                };
                dragState.$m_lastViewPosition = viewPosition;
                const position = this.$p_calculatePositionFromViewPosition(viewPosition, isMovedPastThreshold, false);
                if (position) {
                  dragState.$m_lastPointInfo = {
                    position,
                    stateView: this.$m_stateControl.snapshotStateThroughStateView(),
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
              stateView: this.$m_stateControl.snapshotStateThroughStateView(),
            };
            if (dragState) {
              dragState.$m_lastPointInfo = pointInfo;
              pointInfo = null;
              queueSelectionUpdate(null);
              return;
            }
            const isSeparateSelection = this.$p_keyDownSet.get('Alt') !== undefined;
            const isDisjointExtend = this.$p_keyDownSet.get('Meta') !== undefined;
            dragState = {
              $m_startViewPosition: viewPosition,
              $m_lastViewPosition: viewPosition,
              $m_startPointInfo: pointInfo,
              $m_lastPointInfo: pointInfo,
              $m_originalSelection: this.$m_stateControl.stateView.selection,
              $m_beforeSelection: this.$m_stateControl.stateView.selection,
              $m_selectionType: selectionType,
              $m_isExtendSelection: isExtendSelection,
              $m_selectionJoiningType: isSeparateSelection
                ? SelectionJoiningType.Separate
                : isDisjointExtend
                ? SelectionJoiningType.DisjointExtend
                : SelectionJoiningType.Overwrite,
            };
            pointInfo = null;
            queueSelectionUpdate(null);
          }, this),
        );
      }, this),
    );
    this.$p_commitDirtyChanges();
    this.$p_topLevelContentViewContainerElement.appendChild(topLevelContentRenderControl.$m_containerHtmlElement);
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
        this.$m_stateControl.afterMutationPart$,
        this.$m_stateControl.selectionChange$,
        this.$m_stateControl.customCollapsedSelectionTextConfigChange$,
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
      this.$p_inputControl.$m_focusButDoNotScrollTo();
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
        $m_close$={this.$p_closeToolbar$}
        $m_isToolbarOpenSink={this.$p_isToolbarOpen$}
        $m_resetFocusSink={toolbarResetFocusSink}
        $m_runCommand={this.$m_runCommand.bind(this)}
      />,
      this.$p_toolbarContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(
      <SelectionView
        $m_selectionView$={this.$p_selectionView$}
        $m_hasFocus$={this.$p_selectionViewHasFocus$}
        $m_resetSynchronizedCursorVisibility$={this.$p_resetSynchronizedCursorVisibility$}
        $m_cursorElement={this.$p_selectionCursorsViewContainerElement}
      />,
      this.$p_selectionRectsViewContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(
      <SpellingMistakesOverlay $m_spellingMistakeOverlay$={this.$p_spellingMistakesOverlay$} />,
      this.$p_spellingMistakesOverlayContainerElement,
    );
    renderReactNodeIntoHtmlContainerElement(<SearchOverlay $m_searchOverlay$={this.$p_searchOverlay$} />, this.$p_searchOverlayContainerElement);
    renderReactNodeIntoHtmlContainerElement(
      <SpellingBox $m_renderMessage$={spellingBoxRenderMessage$} $m_spellingBoxRef={spellingBoxRef} />,
      this.$p_spellingBoxElement,
    );
    renderReactNodeIntoHtmlContainerElement(<LinkBox $m_renderMessage$={this.$p_linkBoxRenderMessage$} />, this.$p_linkBoxElement);
    renderReactNodeIntoHtmlContainerElement(<LinkDetails $m_renderMessage$={this.$p_linkDetailsRenderMessage$} />, this.$p_linkDetailsElement);
    pipe(
      this.$m_stateControl.beforeRunUpdate$,
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
      this.$p_inputControl.$m_inputElement,
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
      $m_ignoreCase: true,
      $m_ignoreDiacritics: true,
      $m_stripNonLettersAndNumbers: false,
      $m_searchQueryWordsIndividually: false,
      $m_wholeWords: false,
      $m_replaceSimilarLooking: true,
    };
    this.$p_searchControl = new SingleParagraphPlainTextSearchControl(
      this.$m_stateControl,
      initialQuery,
      initialSearchControlConfig,
      this.$m_topLevelContentReference,
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
          this.$p_searchElementTrackAllControl = this.$p_searchControl.$m_trackAll();
          pipe(
            this.$p_searchElementTrackAllControl.$m_totalMatches$,
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
          anchoredStateView = [this.$m_stateControl.stateView.selection, this.$m_stateControl.snapshotStateThroughStateView()];
          const resetAnchoredStateViewDisposable = Disposable(() => {
            anchoredStateView = null;
          });
          this.add(resetAnchoredStateViewDisposable);
          goToSearchResultImmediatelyCancelDisposable.add(resetAnchoredStateViewDisposable);
          pipe(
            this.$m_stateControl.selectionChange$,
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
          this.$m_stateControl.selectionChange$,
          subscribe((event) => {
            assert(event.type === PushType);
            assertIsNotNullish(matchDisposable);
            matchDisposable.dispose();
          }, matchDisposable),
        );
        assertIsNotNullish(anchoredStateView);
        const findFromSelection = this.$m_stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
          {
            selection: anchoredStateView[0],
            fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
            shouldTransformAsSelection: true,
          },
          anchoredStateView[1],
          this.$m_stateControl.stateView,
        );
        const findFromSelectionRange = matita.getFocusSelectionRangeFromSelection(findFromSelection);
        const match$ = this.$p_searchElementTrackAllControl.$m_wrapCurrentAlwaysOrFindNextMatch(findFromSelectionRange, matchDisposable);
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
                matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphMatch.$m_paragraphReference),
              );
              const range = matita.makeRange(
                contentReference,
                matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphMatch.$m_paragraphReference, paragraphMatch.$m_startOffset),
                matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphMatch.$m_paragraphReference, paragraphMatch.$m_endOffset),
                matita.generateId(),
              );
              const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
              const selection = matita.makeSelection([selectionRange]);
              this.$p_useSearchScrollMargins = true;
              this.$m_stateControl.delta.setSelection(selection, undefined, { [SearchQueryGoToSearchResultImmediatelyKey]: true });
            };
            if (this.$m_stateControl.isInUpdate) {
              this.$m_stateControl.delta.applyUpdate(updateFn);
            } else {
              this.$p_renderOverlayAsync = true;
              this.$m_stateControl.queueUpdate(updateFn);
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
        if (searchBoxControlConfig.$m_type !== SearchBoxConfigType.SingleParagraphPlainText) {
          assertUnreachable(searchBoxControlConfig.$m_type);
        }
        const newConfig = searchBoxControlConfig.$m_config;
        const requestIndex = ++currentTryGoToSearchResultImmediatelyRequestIndex;
        this.$m_stateControl.queueUpdate(() => {
          this.$p_renderOverlayAsync = true;
          this.$p_searchControl.$m_config = newConfig;
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
        this.$m_stateControl.queueUpdate(() => {
          this.$p_renderOverlayAsync = true;
          this.$p_searchControl.$m_query = query;
          if (requestIndex === currentTryGoToSearchResultImmediatelyRequestIndex) {
            tryGoToSearchResultImmediately();
          }
        });
      });
      const closeSearchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$m_stateControl.queueUpdate(this.$m_closeSearch());
      });
      const goToPreviousMatchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$m_runCommand({
          $m_commandName: StandardCommand.SelectPreviousSearchMatch,
          $m_data: null,
        });
      });
      const goToNextMatchSink = Sink<undefined>((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$m_runCommand({
          $m_commandName: StandardCommand.SelectNextSearchMatch,
          $m_data: null,
        });
      });
      renderReactNodeIntoHtmlContainerElement(
        <SearchBox
          $m_isVisible$={this.$p_isSearchElementContainerVisible$}
          $m_selectAllText$={this.$p_searchElementSelectAllText$}
          $m_onAfterSelectAll={() => {
            this.$p_isSearchSelectAllTextWaiting = false;
          }}
          $m_containerWidth$={searchContainerWidth$}
          $m_goToSearchResultImmediatelySink={goToSearchResultImmediatelySink}
          $m_querySink={searchQuerySink}
          $m_configSink={searchConfigSink}
          $m_goToPreviousMatchSink={goToPreviousMatchSink}
          $m_goToNextMatchSink={goToNextMatchSink}
          $m_closeSink={closeSearchSink}
          $m_isInCompositionSink={this.$p_isSearchInComposition$}
          $m_changeQuery$={this.$p_changeQuery$}
          $m_matchNumberMaybe$={this.$p_matchNumberMaybe$}
          $m_totalMatchesMaybe$={this.$p_totalMatchesMaybe$}
          $m_initialGoToSearchResultImmediately={initialGoToSearchResultImmediately}
          $m_initialQuery={initialQuery}
          $m_initialConfig={{
            $m_type: SearchBoxConfigType.SingleParagraphPlainText,
            $m_config: initialSearchControlConfig,
          }}
          $m_inputRef={this.$p_searchInputRef}
        />,
        this.$p_searchElementContainerElement,
      );
    }, this);
    this.$m_rootHtmlElement.append(this.$p_containerHtmlElement);
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
        this.$m_relativeParagraphMeasurementCache.$m_clear();
        this.$p_replaceVisibleSearchResults();
        this.$p_replaceVisibleSpellingMistakes();
        this.$p_replaceViewSelectionRanges(true);
        this.$p_syncFloatingLinkDetails();
      }, this),
    );
    pipe(
      fromArray([
        pipe(
          this.$m_viewControl.renderControlRegister.paragraphRenderControlRegisterUnregister$,
          filterMap((value) => {
            if (value.type === matita.RegisterUnregisterEventType.Unregister) {
              return Some(value.paragraphRenderControl.$m_paragraphReference);
            }
            return None;
          }),
        ),
        pipe(
          this.$m_stateControl.afterMutationPart$,
          flatMap((message) => fromArray(message.viewDelta.changes)),
          filterMap((viewDeltaChange) => {
            if (viewDeltaChange.type !== matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated) {
              return None;
            }
            const { blockReference } = viewDeltaChange;
            matita.assertIsParagraph(matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, blockReference));
            return Some(blockReference);
          }),
        ),
      ]),
      flat(),
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$m_relativeParagraphMeasurementCache.$m_invalidate(event.value.blockId);
      }, this),
    );
    addWindowEventListener('keydown', this.$p_onGlobalKeyDown.bind(this), this);
    addWindowEventListener('keyup', this.$p_onGlobalKeyUp.bind(this), this);
  }
  private $p_closeToolbarAndFocus(): void {
    this.$p_closeToolbar$(Push(undefined));
    this.$p_inputControl.$m_focusButDoNotScrollTo();
  }
  private $p_makeWordBoundingRect(textDecorationInfos: TextDecorationInfo[]): ViewRectangle {
    assert(textDecorationInfos.length > 0);
    const firstTextDecorationInfo = textDecorationInfos[0];
    let wordBoundingRectLeft = firstTextDecorationInfo.$m_charactersBoundingRectangle.$m_left;
    let wordBoundingRectTop = firstTextDecorationInfo.$m_charactersBoundingRectangle.$m_top;
    let wordBoundingRectBottom = firstTextDecorationInfo.$m_charactersBoundingRectangle.$m_bottom;
    let wordBoundingRectRight = firstTextDecorationInfo.$m_charactersBoundingRectangle.$m_right;
    for (let i = 0; i < textDecorationInfos.length; i++) {
      const textDecorationInfo = textDecorationInfos[i];
      const { $m_charactersBoundingRectangle: charactersBoundingRectangle } = textDecorationInfo;
      if (charactersBoundingRectangle.$m_left < wordBoundingRectLeft) {
        wordBoundingRectLeft = charactersBoundingRectangle.$m_left;
      }
      if (charactersBoundingRectangle.$m_top < wordBoundingRectTop) {
        wordBoundingRectTop = charactersBoundingRectangle.$m_top;
      }
      if (charactersBoundingRectangle.$m_right > wordBoundingRectRight) {
        wordBoundingRectRight = charactersBoundingRectangle.$m_right;
      }
      if (charactersBoundingRectangle.$m_bottom > wordBoundingRectBottom) {
        wordBoundingRectBottom = charactersBoundingRectangle.$m_bottom;
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
  private $p_isLinkBoxOpen(): boolean {
    return isSome(this.$p_linkBoxRenderMessage$.lastValue) && this.$p_linkBoxRenderMessage$.lastValue.$m_value !== null;
  }
  private $p_closeLinkBox(): void {
    if (this.$p_isLinkBoxOpen()) {
      this.$p_linkBoxRenderMessage$(Push(null));
    }
  }
  private $p_makeWordBoundingRectMightBeEmpty(textDecorationInfos: TextDecorationInfo[], relativeOffsetLeft: number, relativeOffsetTop: number): ViewRectangle {
    if (textDecorationInfos.length > 0) {
      return this.$p_makeWordBoundingRect(textDecorationInfos);
    }
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
    assertIsNotNullish(focusSelectionRange);
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    const focusPoint = matita.getFocusPointFromRange(focusRange);
    matita.assertIsParagraphPoint(focusPoint);
    const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(focusSelectionRange.data);
    const isMarkedLineWrapToNextLine =
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
      this.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.$m_expirationId);
    const cursorInfo = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(focusPoint, isMarkedLineWrapToNextLine);
    return makeViewRectangle(cursorInfo.position.$m_left + relativeOffsetLeft, cursorInfo.position.$m_top + relativeOffsetTop, 0, cursorInfo.height);
  }
  $m_openFloatingLinkBoxAtSelection(startValues?: { $m_text?: string; $m_link?: string }): matita.RunUpdateFn {
    return () => {
      surroundNearestLink: if (!startValues) {
        const linkDetailsInfo = this.$p_getFloatingLinkDetailsInfo();
        if (linkDetailsInfo === null) {
          break surroundNearestLink;
        }
        // TODO.
        const contentReference = matita.makeContentReferenceFromContent(
          matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, linkDetailsInfo.$m_paragraphReference),
        );
        const startPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.$m_paragraphReference, linkDetailsInfo.$m_startOffset);
        const endPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.$m_paragraphReference, linkDetailsInfo.$m_endOffset);
        const range = matita.makeRange(contentReference, startPoint, endPoint, matita.generateId());
        const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
        const selection = matita.makeSelection([selectionRange]);
        startValues = {
          $m_text: linkDetailsInfo.$m_text,
          $m_link: linkDetailsInfo.$m_link,
        };
        this.$m_stateControl.delta.setSelection(selection);
      }
      if (this.$p_isSpellingBoxOpen) {
        this.$p_spellingBoxCancelCurrent$(Push(undefined));
      }
      const selection = this.$m_stateControl.stateView.selection;
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
      if (focusSelectionRange === null) {
        return;
      }
      this.$p_scrollSelectionIntoView();
      const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
      let hasSeenFocusRange = false;
      let isCoveringText = false;
      const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
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
          const rangeDirection = matita.getRangeDirection(this.$m_stateControl.stateView.document, range);
          const firstPoint = rangeDirection === matita.RangeDirection.Forwards ? range.startPoint : range.endPoint;
          const lastPoint = rangeDirection === matita.RangeDirection.Forwards ? range.endPoint : range.startPoint;
          for (const paragraphReference of matita.iterParagraphsInRange(this.$m_stateControl.stateView.document, focusRange)) {
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
              const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
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
      getStartingLinkText: if (!startValues && selection.selectionRanges.length === 1) {
        const selectionRange = selection.selectionRanges[0];
        if (selectionRange.ranges.length === 1) {
          const range = selectionRange.ranges[0];
          if (
            matita.isParagraphPoint(range.startPoint) &&
            matita.isParagraphPoint(range.endPoint) &&
            matita.areParagraphPointsAtSameParagraph(range.startPoint, range.endPoint)
          ) {
            const paragraph = matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, range.startPoint);
            if (range.startPoint.offset === range.endPoint.offset) {
              break getStartingLinkText;
            }
            const startOffset = Math.min(range.startPoint.offset, range.endPoint.offset);
            const endOffset = Math.max(range.startPoint.offset, range.endPoint.offset);
            const inlineNodes = matita.sliceParagraphChildren(paragraph, startOffset, endOffset);
            let niceContainedText = '';
            assert(inlineNodes.length > 0);
            for (let i = 0; i < inlineNodes.length; i++) {
              const inlineNode = inlineNodes[i];
              if (!matita.isText(inlineNode) || typeof inlineNode.config.link === 'string') {
                break getStartingLinkText;
              }
              niceContainedText += inlineNode.text;
            }
            if (isValidHttpUrl(niceContainedText)) {
              startValues = {
                $m_link: niceContainedText,
              };
            }
          }
        }
      }
      const { $m_visibleLeft: visibleLeft, $m_visibleRight: visibleRight } = this.$p_getVisibleLeftAndRight();
      const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
      const visibleBoundingRect = makeViewRectangle(relativeOffsetLeft, relativeOffsetTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
      const wordBoundingRect = this.$p_makeWordBoundingRectMightBeEmpty(textDecorationInfos, relativeOffsetLeft, relativeOffsetTop);
      const startTextValue = startValues?.$m_text || '';
      const startLinkValue = startValues?.$m_link || '';
      this.$p_linkBoxRenderMessage$(
        Push({
          $m_visibleBoundingRect: visibleBoundingRect,
          $m_wordBoundingRect: wordBoundingRect,
          $m_shouldGetText: !isCoveringText || startTextValue !== '',
          $m_startTextValue: startTextValue,
          $m_startLinkValue: startLinkValue,
          $m_applyLink: (link, text) => {
            assert(link !== '');
            this.$p_closeLinkBox();
            this.$p_inputControl.$m_focusButDoNotScrollTo();
            this.$m_stateControl.queueUpdate(() => {
              if (isCoveringText) {
                this.$m_stateControl.delta.applyUpdate(matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.$m_stateControl, null, () => ({ link })));
                if (startTextValue !== '' && text !== startTextValue) {
                  this.$m_stateControl.delta.applyUpdate(makeInsertPlainTextAtSelectionUpdateFn(this.$m_stateControl, text));
                }
                return;
              }
              this.$m_stateControl.delta.applyUpdate(
                makeInsertPlainTextAtSelectionUpdateFn(this.$m_stateControl, text, undefined, undefined, (textConfig) => ({ ...textConfig, link })),
              );
            });
          },
        }),
      );
    };
  }
  private $p_isSearchSelectAllTextWaiting = false;
  $m_openSearch(focusSearchInput = true): matita.RunUpdateFn {
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
  $m_closeSearch(): matita.RunUpdateFn {
    return () => {
      if (this.$p_isSearchElementContainerVisible$.currentValue) {
        this.$p_isSearchElementContainerVisible$(Push(false));
      }
      this.$p_inputControl.$m_focusButDoNotScrollTo();
    };
  }
  private $p_setSearchQuery(query: string): void {
    this.$p_searchControl.$m_query = query;
    this.$p_changeQuery$(Push(query));
  }
  $m_searchCurrentFocusSelectionRange(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { $m_newSelectionRange: newSelectionRange, $m_word: word, $m_isAway: isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.$m_stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      }
      this.$m_stateControl.delta.applyUpdate(this.$m_openSearch());
    };
  }
  private $p_getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(
    givenRange: matita.Range,
    givenSelectionRange: matita.SelectionRange,
  ): {
    $m_newSelectionRange: matita.SelectionRange;
    $m_word: string;
    $m_isAway: boolean;
  } | null {
    if (
      !matita.isParagraphPoint(givenRange.startPoint) ||
      !matita.isParagraphPoint(givenRange.endPoint) ||
      !matita.areParagraphPointsAtSameParagraph(givenRange.startPoint, givenRange.endPoint)
    ) {
      return null;
    }
    const paragraph = matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, givenRange.startPoint);
    let wordSegmenter: IntlSegmenter | null = null;
    const makeWordSegmenter = (): IntlSegmenter => {
      if (wordSegmenter === null) {
        wordSegmenter = new this.$m_stateControl.stateControlConfig.IntlSegmenter(undefined, {
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
      if (isNone(textMaybe) || !isTermIntlWordLike(textMaybe.$m_value)) {
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
        this.$m_stateControl.stateView.document,
        this.$m_stateControl.stateControlConfig,
        givenRange,
        firstPoint,
        givenSelectionRange,
      );
      const nextLastBounded = matita.makeDefaultPointTransformFn(matita.MovementGranularity.Word, matita.PointMovement.NextBoundByEdge)(
        this.$m_stateControl.stateView.document,
        this.$m_stateControl.stateControlConfig,
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
          this.$m_stateControl.stateView.document,
          this.$m_stateControl.stateControlConfig,
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
            this.$m_stateControl.stateView.document,
            this.$m_stateControl.stateControlConfig,
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
        const segments = segmenter.segment(textMaybe.$m_value);
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
      word = textMaybe.$m_value;
    } else {
      newSelectionRange = givenSelectionRange;
      const textMaybe = extractText(firstPoint.offset, lastPoint.offset);
      if (isNone(textMaybe)) {
        return null;
      }
      word = textMaybe.$m_value;
      if (/[\n\r]/.test(word)) {
        return null;
      }
    }
    return {
      $m_newSelectionRange: newSelectionRange,
      $m_word: word,
      $m_isAway: isAway,
    };
  }
  private $p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText(): {
    $m_newSelectionRange: matita.SelectionRange;
    $m_word: string;
    $m_isAway: boolean;
  } | null {
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
    if (!focusSelectionRange || focusSelectionRange.ranges.length > 1) {
      return null;
    }
    const focusRange = matita.getFocusRangeFromSelectionRange(focusSelectionRange);
    return this.$p_getNearestWordToRangeInSelectionRangeIfCollapsedElseFocusSelectionRangeText(focusRange, focusSelectionRange);
  }
  $m_selectAllInstancesOfWord(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { $m_newSelectionRange: newSelectionRange, $m_word: word } = result;
      this.$p_setSearchQuery(word);
      this.$m_stateControl.delta.applyUpdate(this.$m_selectAllInstancesOfSearchQuery(newSelectionRange));
    };
  }
  $m_selectAllInstancesOfSearchQuery(focusSelectionRange?: matita.SelectionRange): matita.RunUpdateFn {
    return () => {
      const paragraphIdToParagraphMatchesMap = this.$p_searchControl.$m_findAllMatchesSyncLimitedToMaxAmount(200);
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
          matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference),
        );
        for (let i = 0; i < paragraphMatches.$m_matches.length; i++) {
          const match = paragraphMatches.$m_matches[i];
          const { $m_startOffset: startOffset, $m_endOffset: endOffset } = match;
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
      this.$m_stateControl.delta.setSelection(selection);
      this.$m_stateControl.delta.applyUpdate(this.$m_closeSearch());
    };
  }
  $m_selectNextInstanceOfWordAtFocus(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { $m_newSelectionRange: newSelectionRange, $m_word: word, $m_isAway: isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.$p_useSearchScrollMargins = true;
        this.$m_stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.$m_stateControl.delta.applyUpdate(this.$m_selectNextSearchMatch(true));
      }
      this.$m_stateControl.delta.applyUpdate(this.$m_openSearch());
    };
  }
  $m_selectPreviousInstanceOfWordAtFocus(): matita.RunUpdateFn {
    return () => {
      const result = this.$p_getNearestWordToFocusSelectionRangeIfCollapsedElseFocusSelectionRangeText();
      if (result === null) {
        return;
      }
      const { $m_newSelectionRange: newSelectionRange, $m_word: word, $m_isAway: isAway } = result;
      this.$p_setSearchQuery(word);
      if (isAway) {
        this.$p_useSearchScrollMargins = true;
        this.$m_stateControl.delta.setSelection(matita.makeSelection([newSelectionRange]));
      } else {
        this.$m_stateControl.delta.applyUpdate(this.$m_selectPreviousSearchMatch(true));
      }
      this.$m_stateControl.delta.applyUpdate(this.$m_openSearch());
    };
  }
  $m_selectNextSearchMatch(extendSelection?: boolean): matita.RunUpdateFn {
    return () => {
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
      const match = this.$p_searchControl.$m_wrapCurrentOrFindNextMatchSync(
        focusSelectionRange,
        WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther,
      );
      if (!match) {
        return;
      }
      const { $m_paragraphReference: paragraphReference, $m_startOffset: startOffset, $m_endOffset: endOffset } = match;
      const range = matita.makeRange(
        matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference)),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
        matita.generateId(),
      );
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      this.$p_useSearchScrollMargins = true;
      if (extendSelection) {
        this.$m_stateControl.delta.setSelection(matita.makeSelection([...this.$m_stateControl.stateView.selection.selectionRanges, selectionRange]));
      } else {
        this.$m_stateControl.delta.setSelection(matita.makeSelection([selectionRange]));
      }
    };
  }
  $m_selectPreviousSearchMatch(extendSelection?: boolean): matita.RunUpdateFn {
    return () => {
      const anchorSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
      const match = this.$p_searchControl.$m_wrapCurrentOrFindPreviousMatchSync(
        anchorSelectionRange,
        WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther,
      );
      if (!match) {
        return;
      }
      const { $m_paragraphReference: paragraphReference, $m_startOffset: startOffset, $m_endOffset: endOffset } = match;
      const range = matita.makeRange(
        matita.makeContentReferenceFromContent(matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference)),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, startOffset),
        matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, endOffset),
        matita.generateId(),
      );
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      this.$p_useSearchScrollMargins = true;
      if (extendSelection) {
        this.$m_stateControl.delta.setSelection(matita.makeSelection([selectionRange, ...this.$m_stateControl.stateView.selection.selectionRanges]));
      } else {
        this.$m_stateControl.delta.setSelection(matita.makeSelection([selectionRange]));
      }
    };
  }
  $m_openQuickFixAtSelection(): matita.RunUpdateFn {
    return () => {
      const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
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
    return (document.hasFocus() && this.$p_inputControl.$m_getIsFocused()) || this.$p_isDraggingSelection;
  }
  private $p_updateSelectionViewHasFocus(): void {
    if (this.$m_stateControl.isInUpdate) {
      this.$p_selectionViewHasFocus$(Push(this.$p_getSelectionViewHasFocusValue()));
    } else {
      this.$m_stateControl.queueUpdate(() => {
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
  $m_makeSoftLineStartEndFocusPointTransformFn(
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
        this.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.$m_expirationId) &&
        this.$m_isParagraphPointAtWrappedLineWrapPoint(point);
      const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
      const { $m_relativeParagraphMeasurement: relativeParagraphMeasurement } = this.$p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
      const measuredParagraphLineRangeIndex = this.$p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
        relativeParagraphMeasurement,
        point,
        isLineWrapToNextLine,
      );
      const measuredParagraphLineRange = relativeParagraphMeasurement.$m_measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
      return {
        contentReference: range.contentReference,
        point: matita.changeParagraphPointOffset(
          point,
          pointMovement === matita.PointMovement.Previous ? measuredParagraphLineRange.$m_startOffset : measuredParagraphLineRange.$m_endOffset,
        ),
      };
    };
  }
  private $p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
    relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue,
    point: matita.ParagraphPoint,
    isLineWrapToNextLine: boolean,
  ): number {
    for (let i = 0; i < relativeParagraphMeasurement.$m_measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = relativeParagraphMeasurement.$m_measuredParagraphLineRanges[i];
      if (
        measuredParagraphLineRange.$m_startOffset <= point.offset &&
        point.offset <= measuredParagraphLineRange.$m_endOffset &&
        !(
          point.offset === measuredParagraphLineRange.$m_endOffset &&
          isLineWrapToNextLine &&
          i !== relativeParagraphMeasurement.$m_measuredParagraphLineRanges.length - 1
        )
      ) {
        return i;
      }
    }
    throwUnreachable();
  }
  $m_transformPointSoftLineUpDownWithOffsetLeft(
    pointMovement: matita.PointMovement.Previous | matita.PointMovement.Next,
    range: matita.Range,
    point: matita.Point,
    selectionRange: matita.SelectionRange,
    overrideCursorOffsetLeft: number | undefined,
    isAnchor: boolean,
  ): { $m_pointWithContentReference: matita.PointWithContentReference; $m_isWrappedLineStart: boolean; $m_horizontalOffset: number } {
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
      this.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.$m_expirationId) &&
      this.$m_isParagraphPointAtWrappedLineWrapPoint(point);
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
    const measuredParagraphLineRangeIndex = this.$p_getIndexOfMeasuredParagraphLineRangeInParagraphMeasurementAtParagraphPoint(
      paragraphMeasurement,
      point,
      isLineWrapToNextLine,
    );
    const horizontalOffset =
      overrideCursorOffsetLeft ?? this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(point, isLineWrapToNextLine).position.$m_left;
    if (pointMovement === matita.PointMovement.Previous) {
      if (measuredParagraphLineRangeIndex === 0) {
        const paragraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
        if (paragraphIndex === 0) {
          return {
            $m_pointWithContentReference: {
              contentReference: range.contentReference,
              point: matita.changeParagraphPointOffset(point, 0),
            },
            $m_isWrappedLineStart: false,
            $m_horizontalOffset: horizontalOffset,
          };
        }
        const previousBlock = matita.accessBlockAtIndexInContentAtContentReference(
          this.$m_stateControl.stateView.document,
          range.contentReference,
          paragraphIndex - 1,
        );
        if (matita.isEmbed(previousBlock)) {
          return {
            $m_pointWithContentReference: {
              contentReference: range.contentReference,
              point: matita.makeBlockPointFromBlock(previousBlock),
            },
            $m_isWrappedLineStart: false,
            $m_horizontalOffset: horizontalOffset,
          };
        }
        const previousParagraphReference = matita.makeBlockReferenceFromBlock(previousBlock);
        const previousParagraphMeasurement = this.$p_measureParagraphAtParagraphReference(previousParagraphReference);
        const position = this.$p_calculatePositionInRelativeParagraphMeasurementInParagraphReferenceAtMeasuredParagraphLineRangeIndexAtHorizontalOffset(
          previousParagraphMeasurement,
          previousParagraphReference,
          previousParagraphMeasurement.$m_measuredParagraphLineRanges.length - 1,
          horizontalOffset,
          null,
        );
        assertIsNotNullish(position);
        return {
          $m_pointWithContentReference: position.$m_pointWithContentReference,
          $m_isWrappedLineStart: position.$m_isWrappedLineStart,
          $m_horizontalOffset: horizontalOffset,
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
        $m_pointWithContentReference: position.$m_pointWithContentReference,
        $m_isWrappedLineStart: position.$m_isWrappedLineStart,
        $m_horizontalOffset: horizontalOffset,
      };
    }
    if (measuredParagraphLineRangeIndex === paragraphMeasurement.$m_measuredParagraphLineRanges.length - 1) {
      const paragraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
      if (paragraphIndex === matita.getNumberOfBlocksInContentAtContentReference(this.$m_stateControl.stateView.document, range.contentReference) - 1) {
        const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        return {
          $m_pointWithContentReference: {
            contentReference: range.contentReference,
            point: matita.changeParagraphPointOffset(point, matita.getParagraphLength(paragraph)),
          },
          $m_isWrappedLineStart: false,
          $m_horizontalOffset: horizontalOffset,
        };
      }
      const nextBlock = matita.accessBlockAtIndexInContentAtContentReference(
        this.$m_stateControl.stateView.document,
        range.contentReference,
        paragraphIndex + 1,
      );
      if (matita.isEmbed(nextBlock)) {
        return {
          $m_pointWithContentReference: {
            contentReference: range.contentReference,
            point: matita.makeBlockPointFromBlock(nextBlock),
          },
          $m_isWrappedLineStart: false,
          $m_horizontalOffset: horizontalOffset,
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
        $m_pointWithContentReference: position.$m_pointWithContentReference,
        $m_isWrappedLineStart: position.$m_isWrappedLineStart,
        $m_horizontalOffset: horizontalOffset,
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
      $m_pointWithContentReference: position.$m_pointWithContentReference,
      $m_isWrappedLineStart: position.$m_isWrappedLineStart,
      $m_horizontalOffset: horizontalOffset,
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
  $m_makeActivatedSelectionSecondaryDataExpirationId(): number {
    const id = this.$p_activeSelectionSecondaryDataExpirationIdCounter++;
    this.$p_activeSelectionSecondaryDataExpirationIds.add(id);
    return id;
  }
  $m_isSelectionSecondaryDataExpirationIdActive(expirationId: number): boolean {
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
    if (this.$m_stateControl.stateView.selection.selectionRanges.length === 0) {
      if (this.$p_inputControl.$m_getIsFocused()) {
        this.$p_inputControl.$m_blur();
      }
    } else {
      if (!this.$p_inputControl.$m_getIsFocused() && !this.$p_isInSearchBox()) {
        this.$p_inputControl.$m_focusButDoNotScrollTo();
      }
    }
    const preserveSelectionSecondaryDataExpirationIds = new Set<number>();
    const isSelectionCoveringTheSameContentAsBefore = matita.areSelectionsCoveringSameContent(previousSelection, this.$m_stateControl.stateView.selection);
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
        for (let i = 0; i < this.$m_stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = this.$m_stateControl.stateView.selection.selectionRanges[i];
          if (
            isSelectionCoveringTheSameContentAsBefore ||
            preserveLineWrapFocusCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.has(selectionRange.id)
          ) {
            const focusLineWrapSelectionRangeData = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
            if (focusLineWrapSelectionRangeData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(focusLineWrapSelectionRangeData.$m_expirationId);
            }
          }
          if (
            isSelectionCoveringTheSameContentAsBefore ||
            preserveLineWrapAnchorCursorWrapToNextLineSelectionRangeDataForSelectionRangesWithIds.has(selectionRange.id)
          ) {
            const anchorLineWrapSelectionRangeData = getLineWrapAnchorCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
            if (anchorLineWrapSelectionRangeData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(anchorLineWrapSelectionRangeData.$m_expirationId);
            }
          }
        }
      }
      if (data !== undefined) {
        if (isSelectionChangeDataPreservingMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeft(data)) {
          for (let i = 0; i < this.$m_stateControl.stateView.selection.selectionRanges.length; i++) {
            const selectionRange = this.$m_stateControl.stateView.selection.selectionRanges[i];
            const moveOrExtendCursorOffsetData = getMoveOrExtendSoftLineUpOrDownOriginalCursorOffsetLeftWithExpirationIdSelectionRangeDataValue(
              selectionRange.data,
            );
            if (moveOrExtendCursorOffsetData !== undefined) {
              preserveSelectionSecondaryDataExpirationIds.add(moveOrExtendCursorOffsetData.$m_expirationId);
            }
          }
        }
      }
    }
    if (data !== undefined && isSelectionChangeDataCompositionUpdate(data)) {
      for (let i = 0; i < this.$m_stateControl.stateView.selection.selectionRanges.length; i++) {
        const selectionRange = this.$m_stateControl.stateView.selection.selectionRanges[i];
        const compositionUpdateDataValue = getSelectionRangeCompositionUpdateDataValue(selectionRange.data);
        if (compositionUpdateDataValue !== undefined) {
          preserveSelectionSecondaryDataExpirationIds.add(compositionUpdateDataValue.$m_expirationId);
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
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
    if (!focusSelectionRange) {
      return;
    }
    const focusPoint = matita.getFocusPointFromRange(matita.getFocusRangeFromSelectionRange(focusSelectionRange));
    matita.assertIsParagraphPoint(focusPoint);
    const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(focusSelectionRange.data);
    const cursorPositionAndHeightFromParagraphPoint = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(
      focusPoint,
      lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
        this.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.$m_expirationId),
    );
    // TODO: Fix in case of multiple selections.
    scrollCursorRectIntoView(
      makeViewRectangle(
        cursorPositionAndHeightFromParagraphPoint.position.$m_left,
        cursorPositionAndHeightFromParagraphPoint.position.$m_top,
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
      const visibleHeight = visibleTopAndBottom.$m_visibleBottom - visibleTopAndBottom.$m_visibleTop;
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
      $m_visible: {
        $m_top: visibleTop,
        $m_bottom: visibleBottom,
        $m_left: 0,
        $m_right: 0,
      },
      $m_notVisible: {
        $m_top: notVisibleTop,
        $m_bottom: notVisibleBottom,
        $m_left: 0,
        $m_right: 0,
      },
    };
  };
  private $p_isElementScrollable = (element: Element): boolean => {
    // TODO: Figure this out without forcing style calculation.
    return element === document.documentElement;
  };
  $m_isParagraphPointAtWrappedLineWrapPoint(point: matita.ParagraphPoint): boolean {
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
    const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    if (matita.isParagraphEmpty(paragraph)) {
      return false;
    }
    for (let i = 0; i < paragraphMeasurement.$m_measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[i];
      if (measuredParagraphLineRange.$m_startOffset <= point.offset && point.offset <= measuredParagraphLineRange.$m_endOffset) {
        if (point.offset === measuredParagraphLineRange.$m_endOffset) {
          return !measuredParagraphLineRange.$m_endsWithLineBreak;
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
    const isLineWrapToNextLine = isMarkedLineWrapToNextLine && this.$m_isParagraphPointAtWrappedLineWrapPoint(point);
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(point);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
    const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    for (let i = 0; i < paragraphMeasurement.$m_measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[i];
      if (measuredParagraphLineRange.$m_startOffset <= point.offset && point.offset <= measuredParagraphLineRange.$m_endOffset) {
        if (point.offset === measuredParagraphLineRange.$m_endOffset) {
          if (isLineWrapToNextLine && i !== paragraphMeasurement.$m_measuredParagraphLineRanges.length - 1) {
            const nextMeasuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[i + 1];
            assertIsNotNullish(nextMeasuredParagraphLineRange);
            if (nextMeasuredParagraphLineRange.$m_characterRectangles.length === 0) {
              return {
                position: {
                  $m_left: nextMeasuredParagraphLineRange.$m_boundingRect.$m_left,
                  $m_top: nextMeasuredParagraphLineRange.$m_boundingRect.$m_top,
                },
                height: nextMeasuredParagraphLineRange.$m_boundingRect.$m_height,
                measuredParagraphLineRanges: paragraphMeasurement.$m_measuredParagraphLineRanges,
                measuredParagraphLineRangeIndex: i + 1,
              };
            }
            return {
              position: {
                $m_left: nextMeasuredParagraphLineRange.$m_characterRectangles[0].$m_left,
                $m_top: nextMeasuredParagraphLineRange.$m_boundingRect.$m_top,
              },
              height: nextMeasuredParagraphLineRange.$m_boundingRect.$m_height,
              measuredParagraphLineRanges: paragraphMeasurement.$m_measuredParagraphLineRanges,
              measuredParagraphLineRangeIndex: i + 1,
            };
          }
          if (measuredParagraphLineRange.$m_characterRectangles.length === 0) {
            return {
              position: {
                $m_left: measuredParagraphLineRange.$m_boundingRect.$m_left,
                $m_top: measuredParagraphLineRange.$m_boundingRect.$m_top,
              },
              height: measuredParagraphLineRange.$m_boundingRect.$m_height,
              measuredParagraphLineRanges: paragraphMeasurement.$m_measuredParagraphLineRanges,
              measuredParagraphLineRangeIndex: i,
            };
          }
          const characterRectangle = paragraphMeasurement.$m_characterRectangles[point.offset - 1];
          assertIsNotNullish(characterRectangle);
          return {
            position: {
              $m_left: characterRectangle.$m_right,
              $m_top: measuredParagraphLineRange.$m_boundingRect.$m_top,
            },
            height: measuredParagraphLineRange.$m_boundingRect.$m_height,
            measuredParagraphLineRanges: paragraphMeasurement.$m_measuredParagraphLineRanges,
            measuredParagraphLineRangeIndex: i,
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const characterRectangle = paragraphMeasurement.$m_characterRectangles[point.offset];
        assertIsNotNullish(characterRectangle);
        return {
          position: {
            $m_left: characterRectangle.$m_left,
            $m_top: measuredParagraphLineRange.$m_boundingRect.$m_top,
          },
          height: measuredParagraphLineRange.$m_boundingRect.$m_height,
          measuredParagraphLineRanges: paragraphMeasurement.$m_measuredParagraphLineRanges,
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
  private $p_clearKeys(exceptFor = new Set<string>()): void {
    for (const key of this.$p_keyDownSet.keys()) {
      if (!exceptFor.has(key)) {
        this.$p_keyUp$(Push({ $m_key: key }));
        this.$p_keyDownSet.delete(key);
      }
    }
  }
  private $p_markKeyDown(key: string, keyboardEvent?: KeyboardEvent): void {
    this.$p_keyDownSet.set(key, this.$p_keyDownId++);
    this.$p_keyDown$(Push({ $m_key: key, $m_keyboardEvent: keyboardEvent }));
  }
  private $p_markKeyUp(key: string, keyboardEvent?: KeyboardEvent): void {
    this.$p_keyDownSet.delete(key);
    this.$p_keyUp$(Push({ $m_key: key, $m_keyboardEvent: keyboardEvent }));
  }
  private $p_keyDown$ = Distributor<{ $m_key: string; $m_keyboardEvent?: KeyboardEvent }>();
  private $p_keyUp$ = Distributor<{ $m_key: string; $m_keyboardEvent?: KeyboardEvent }>();
  private $p_onGlobalKeyDown(event: KeyboardEvent): void {
    const normalizedKey = this.$p_normalizeEventKey(event);
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
      this.$p_inputControl.$m_focusButDoNotScrollTo();
      event.preventDefault();
      return;
    }
    if (this.$p_inputControl.$m_getIsFocused()) {
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
    if (this.$p_inputControl.$m_getIsFocused() && !this.$p_inputControl.$m_getIsInComposition()) {
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
      const { $m_key: key, $m_command: command, $m_context: context, $m_platform: platform } = keyCommand;
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
        this.$m_runCommand({
          $m_commandName: command,
          $m_data: null,
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
    if (platforms.includes(Platform.Apple) && normalizedKey === 'Meta') {
      this.$p_clearKeys(new Set(['Shift'])); // MacOS drops keyup events after Meta is pressed?
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $m_runCommand(commandInfo: CommandInfo<any>): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { $m_commandName: commandName, $m_data: data } = commandInfo;
    const registeredCommand = this.$p_commandRegister.get(String(commandName));
    if (!registeredCommand) {
      return;
    }
    registeredCommand.execute(this.$m_stateControl, this.$m_viewControl, data);
  }
  $m_onConfigChanged(): void {
    throwNotImplemented();
  }
  private $p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference: matita.BlockReference): {
    $m_relativeParagraphMeasurement: RelativeParagraphMeasureCacheValue;
    $m_containerHtmlElementBoundingRect?: DOMRect;
  } {
    const cachedMeasurement = this.$m_relativeParagraphMeasurementCache.$m_get(paragraphReference.blockId);
    if (cachedMeasurement) {
      return { $m_relativeParagraphMeasurement: cachedMeasurement };
    }
    this.$p_commitDirtyChanges();
    // TODO: Rtl.
    const paragraphRenderControl = this.$m_viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const containerHtmlElement = paragraphRenderControl.$m_containerHtmlElement;
    const containerHtmlElementBoundingRect = containerHtmlElement.getBoundingClientRect();
    const measureRange = document.createRange();
    const measuredParagraphLineRanges: MeasuredParagraphLineRange[] = [];
    const paragraphCharacterRectangles: (ViewRectangle | null)[] = [];
    const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    let isPreviousLineBreak = false;
    type MutableViewRectangle = { -readonly [P in keyof ViewRectangle]: ViewRectangle[P] };
    for (let i = 0; i < paragraphRenderControl.$m_textNodeInfos.length; i++) {
      const textNodeInfo = paragraphRenderControl.$m_textNodeInfos[i];
      const { $m_textStart: textStart, $m_textEnd: textEnd, $m_textNode: textNode, $m_endsWithLineBreak: endsWithLineBreak } = textNodeInfo;
      if (textStart === textEnd) {
        const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
        matita.assertIsParagraph(paragraph);
        const isEmpty = matita.isParagraphEmpty(paragraph);
        assert(i === paragraphRenderControl.$m_textNodeInfos.length - 1 || ((endsWithLineBreak || isEmpty) && !(endsWithLineBreak && isEmpty)));
        isPreviousLineBreak = true;
        if (endsWithLineBreak) {
          paragraphCharacterRectangles.push(null);
        }
        const textNodeBoundingRect = getNodeBoundingRect(textNode);
        measuredParagraphLineRanges.push({
          $m_boundingRect: makeViewRectangle(
            textNodeBoundingRect.left - containerHtmlElementBoundingRect.left,
            textNodeBoundingRect.top - containerHtmlElementBoundingRect.top,
            textNodeBoundingRect.width,
            textNodeBoundingRect.height,
          ),
          $m_characterRectangles: [],
          $m_startOffset: textStart,
          $m_endOffset: textStart,
          $m_endsWithLineBreak: endsWithLineBreak,
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
            $m_boundingRect: { ...characterRectangle },
            $m_characterRectangles: [characterRectangle],
            $m_startOffset: textStart + startIndex,
            $m_endOffset: textStart + j + 1,
            $m_endsWithLineBreak: false,
          });
          return;
        }
        const previousCharacterRectangle = paragraphCharacterRectangles[paragraphCharacterRectangles.length - 1];
        const minDifferenceToBeConsideredTheSame = (5 / 16) * paragraphRenderControl.$m_fontSize;
        const isSameLineSameFontSize =
          previousCharacterRectangle &&
          (previousCharacterRectangle.$m_top === characterRectangle.$m_top || previousCharacterRectangle.$m_bottom === characterRectangle.$m_bottom) &&
          characterRectangle.$m_left - previousCharacterRectangle.$m_right <= minDifferenceToBeConsideredTheSame;
        const isSameLineDifferentFontSize =
          !isSameLineSameFontSize &&
          previousCharacterRectangle &&
          characterRectangle.$m_left >= previousCharacterRectangle.$m_right - minDifferenceToBeConsideredTheSame &&
          characterRectangle.$m_left - previousCharacterRectangle.$m_right <= 2 * paragraphRenderControl.$m_fontSize &&
          (Math.abs(previousCharacterRectangle.$m_top - characterRectangle.$m_bottom) <= 2 * paragraphRenderControl.$m_fontSize ||
            Math.abs(previousCharacterRectangle.$m_bottom - characterRectangle.$m_top) <= 2 * paragraphRenderControl.$m_fontSize);
        if (!isPreviousLineBreak) {
          assertIsNotNullish(previousCharacterRectangle);
          if (isSameLineSameFontSize || isSameLineDifferentFontSize) {
            const currentMeasuredParagraphLineRange = measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1];
            const expandedLeft = Math.min(currentMeasuredParagraphLineRange.$m_boundingRect.$m_left, characterRectangle.$m_left);
            const expandedTop = Math.min(currentMeasuredParagraphLineRange.$m_boundingRect.$m_top, characterRectangle.$m_top);
            const expandedRight = Math.max(currentMeasuredParagraphLineRange.$m_boundingRect.$m_right, characterRectangle.$m_right);
            const expandedBottom = Math.max(currentMeasuredParagraphLineRange.$m_boundingRect.$m_bottom, characterRectangle.$m_bottom);
            currentMeasuredParagraphLineRange.$m_boundingRect = makeViewRectangle(
              expandedLeft,
              expandedTop,
              expandedRight - expandedLeft,
              expandedBottom - expandedTop,
            );
            const lastCharacterRectangle =
              currentMeasuredParagraphLineRange.$m_characterRectangles[currentMeasuredParagraphLineRange.$m_characterRectangles.length - 1];
            characterRectangle.$m_left = lastCharacterRectangle.$m_right;
            characterRectangle.$m_width = characterRectangle.$m_right - characterRectangle.$m_left;
            paragraphCharacterRectangles.push(characterRectangle);
            currentMeasuredParagraphLineRange.$m_characterRectangles.push(characterRectangle);
            currentMeasuredParagraphLineRange.$m_endOffset = textStart + j + 1;
            return;
          }
        }
        isPreviousLineBreak = false;
        paragraphCharacterRectangles.push(characterRectangle);
        measuredParagraphLineRanges.push({
          $m_boundingRect: { ...characterRectangle },
          $m_characterRectangles: [characterRectangle],
          $m_startOffset: textStart + startIndex,
          $m_endOffset: textStart + j + 1,
          $m_endsWithLineBreak: false,
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
          const lastCharacterRectangle = measuredParagraphLineRange.$m_characterRectangles[measuredParagraphLineRange.$m_characterRectangles.length - 1];
          assertIsNotNullish(lastCharacterRectangle);
          const characterRectangle = makeViewRectangle(lastCharacterRectangle.$m_left, lastCharacterRectangle.$m_top, 0, lastCharacterRectangle.$m_height);
          paragraphCharacterRectangles.splice(paragraphCharacterRectangles.length - 1, 0, characterRectangle);
          measuredParagraphLineRange.$m_characterRectangles.splice(measuredParagraphLineRange.$m_characterRectangles.length - 1, 0, characterRectangle);
        }
      }
      measuredParagraphLineRanges[measuredParagraphLineRanges.length - 1].$m_endsWithLineBreak = endsWithLineBreak;
      if (endsWithLineBreak) {
        isPreviousLineBreak = true;
        paragraphCharacterRectangles.push(null);
      }
    }
    const linesTopAndBottomAndHeightBefore = measuredParagraphLineRanges.map((measuredParagraphLineRange) => ({
      $m_top: measuredParagraphLineRange.$m_boundingRect.$m_top,
      $m_bottom: measuredParagraphLineRange.$m_boundingRect.$m_bottom,
      $m_height: measuredParagraphLineRange.$m_boundingRect.$m_height,
    }));
    for (let i = 0; i < measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = measuredParagraphLineRanges[i];
      const boundingRect = measuredParagraphLineRange.$m_boundingRect as MutableViewRectangle;
      if (i === 0) {
        boundingRect.$m_top = 0;
      } else {
        const previous = linesTopAndBottomAndHeightBefore[i - 1];
        const current = linesTopAndBottomAndHeightBefore[i];
        boundingRect.$m_top = (previous.$m_bottom * previous.$m_height + current.$m_top * current.$m_height) / (previous.$m_height + current.$m_height);
      }
      if (i === measuredParagraphLineRanges.length - 1) {
        boundingRect.$m_bottom = containerHtmlElementBoundingRect.bottom - containerHtmlElementBoundingRect.top;
      } else {
        const current = linesTopAndBottomAndHeightBefore[i];
        const next = linesTopAndBottomAndHeightBefore[i + 1];
        boundingRect.$m_bottom = (current.$m_bottom * current.$m_height + next.$m_top * next.$m_height) / (current.$m_height + next.$m_height);
      }
      boundingRect.$m_height = boundingRect.$m_bottom - boundingRect.$m_top;
    }
    const newCachedMeasurement: RelativeParagraphMeasureCacheValue = {
      $m_characterRectangles: paragraphCharacterRectangles,
      $m_measuredParagraphLineRanges: measuredParagraphLineRanges,
    };
    this.$m_relativeParagraphMeasurementCache.$m_set(paragraphReference.blockId, newCachedMeasurement);
    return { $m_relativeParagraphMeasurement: newCachedMeasurement, $m_containerHtmlElementBoundingRect: containerHtmlElementBoundingRect };
  }
  private $p_measureParagraphAtParagraphReference(paragraphReference: matita.BlockReference): AbsoluteParagraphMeasurement {
    const {
      $m_relativeParagraphMeasurement: relativeParagraphMeasurement,
      $m_containerHtmlElementBoundingRect: containerHtmlElementBoundingRect = this.$m_viewControl
        .accessParagraphRenderControlAtBlockReference(paragraphReference)
        .$m_containerHtmlElement.getBoundingClientRect(),
    } = this.$p_getRelativeParagraphMeasurementAtParagraphReference(paragraphReference);
    function shiftRelativeCharacterRectangle(relativeCharacterRectangle: ViewRectangle): ViewRectangle {
      return shiftViewRectangle(relativeCharacterRectangle, containerHtmlElementBoundingRect.left, containerHtmlElementBoundingRect.top);
    }
    return {
      $m_characterRectangles: relativeParagraphMeasurement.$m_characterRectangles.map(
        (characterRectangle) => characterRectangle && shiftRelativeCharacterRectangle(characterRectangle),
      ),
      $m_measuredParagraphLineRanges: relativeParagraphMeasurement.$m_measuredParagraphLineRanges.map((measuredParagraphLineRange) => {
        return {
          $m_boundingRect: shiftRelativeCharacterRectangle(measuredParagraphLineRange.$m_boundingRect),
          $m_characterRectangles: measuredParagraphLineRange.$m_characterRectangles.map(shiftRelativeCharacterRectangle),
          $m_startOffset: measuredParagraphLineRange.$m_startOffset,
          $m_endOffset: measuredParagraphLineRange.$m_endOffset,
          $m_endsWithLineBreak: measuredParagraphLineRange.$m_endsWithLineBreak,
        };
      }),
      $m_boundingRect: makeViewRectangle(
        containerHtmlElementBoundingRect.left,
        containerHtmlElementBoundingRect.top,
        containerHtmlElementBoundingRect.width,
        containerHtmlElementBoundingRect.height,
      ),
    };
  }
  private $p_compareParagraphTopToOffsetTop(paragraphReference: matita.BlockReference, needle: number): number {
    const paragraphNodeControl = this.$m_viewControl.accessParagraphRenderControlAtBlockReference(paragraphReference);
    const boundingBox = paragraphNodeControl.$m_containerHtmlElement.getBoundingClientRect();
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
    if (measuredParagraphLineRange.$m_characterRectangles.length === 0) {
      return {
        $m_type: HitPositionType.ParagraphText,
        $m_checkboxMarkerParagraphReference: checkboxMarkerParagraphReference,
        $m_pointWithContentReference: {
          contentReference: matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference),
          ),
          point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, measuredParagraphLineRange.$m_startOffset),
        },
        $m_isPastPreviousCharacterHalfPoint: false,
        $m_isWrappedLineStart: false,
        $m_isWrappedLinePreviousEnd: false,
      };
    }
    for (let j = 0; j < measuredParagraphLineRange.$m_characterRectangles.length; j++) {
      const characterRectangle = measuredParagraphLineRange.$m_characterRectangles[j];
      const previousCharacterRightWithoutInfinity =
        j === 0 ? characterRectangle.$m_left : Math.min(measuredParagraphLineRange.$m_characterRectangles[j - 1].$m_right, characterRectangle.$m_left);
      const previousCharacterRight =
        j === 0
          ? isExact
            ? characterRectangle.$m_left
            : -Infinity
          : Math.min(measuredParagraphLineRange.$m_characterRectangles[j - 1].$m_right, characterRectangle.$m_left);
      const characterRight = j === measuredParagraphLineRange.$m_characterRectangles.length - 1 && !isExact ? Infinity : characterRectangle.$m_right;
      if (
        !(
          previousCharacterRight - this.$p_positionCalculationEpsilon <= horizontalOffset &&
          horizontalOffset <= characterRight + this.$p_positionCalculationEpsilon
        )
      ) {
        continue;
      }
      const isPastPreviousCharacterHalfPoint = horizontalOffset > (characterRectangle.$m_right + previousCharacterRightWithoutInfinity) / 2;
      if (isPastPreviousCharacterHalfPoint) {
        j += 1;
      }
      // In Safari some malformed character measurements are negative???
      while (j > 0 && measuredParagraphLineRange.$m_characterRectangles[j - 1].$m_width <= 0) {
        // The preceding character has a width of 0, so it combines with the current character.
        j--;
      }
      const pointOffset = measuredParagraphLineRange.$m_startOffset + j;
      return {
        $m_type: HitPositionType.ParagraphText,
        $m_checkboxMarkerParagraphReference: checkboxMarkerParagraphReference,
        $m_pointWithContentReference: {
          contentReference: matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference),
          ),
          point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, pointOffset),
        },
        $m_isPastPreviousCharacterHalfPoint: isPastPreviousCharacterHalfPoint,
        $m_isWrappedLineStart: !isFirstInParagraphOrIsPreviousLineEndingWithLineBreak && pointOffset === measuredParagraphLineRange.$m_startOffset,
        $m_isWrappedLinePreviousEnd:
          !isLastInParagraph && !measuredParagraphLineRange.$m_endsWithLineBreak && pointOffset === measuredParagraphLineRange.$m_endOffset,
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
    const measuredParagraphLineRange = relativeParagraphMeasurement.$m_measuredParagraphLineRanges[measuredParagraphLineRangeIndex];
    const isFirstInParagraphOrIsPreviousLineEndingWithLineBreak =
      measuredParagraphLineRangeIndex === 0 ||
      relativeParagraphMeasurement.$m_measuredParagraphLineRanges[measuredParagraphLineRangeIndex - 1].$m_endsWithLineBreak;
    const isLastInParagraph = measuredParagraphLineRangeIndex === relativeParagraphMeasurement.$m_measuredParagraphLineRanges.length - 1;
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
    const hitElements = document.elementsFromPoint(viewPosition.$m_left, viewPosition.$m_top);
    const firstContentHitElement = hitElements.find(
      (hitElement) => hitElement === this.$p_topLevelContentViewContainerElement || this.$p_topLevelContentViewContainerElement.contains(hitElement),
    );
    let paragraphReferences: matita.BlockReference[];
    const nodeRenderControl = firstContentHitElement ? findClosestNodeRenderControl(this.$m_viewControl, firstContentHitElement) : null;
    let checkboxMarkerParagraphReference: matita.BlockReference | null = null;
    if (!nodeRenderControl) {
      // TODO.
      paragraphReferences = matita
        .accessContentFromContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference)
        .blockIds.$m_toArray()
        .map(matita.makeBlockReferenceFromBlockId);
    } else if (nodeRenderControl instanceof VirtualizedParagraphRenderControl) {
      const { $m_paragraphReference: paragraphReference } = nodeRenderControl;
      const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
      matita.assertIsParagraph(paragraph);
      if (firstContentHitElement === nodeRenderControl.$m_listMarkerElement) {
        const topLevelContent = matita.accessContentFromContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference);
        const listType = accessListTypeInTopLevelContentConfigFromListParagraphConfig(topLevelContent.config, paragraph.config);
        if (listType === AccessedListStyleType.Checklist) {
          if (isReturnCheckboxMarkerHitIfHitCheckboxMarker) {
            return {
              $m_type: HitPositionType.CheckboxMarker,
              $m_paragraphReference: paragraphReference,
            };
          }
          checkboxMarkerParagraphReference = paragraphReference;
        }
      }
      paragraphReferences = [paragraphReference];
    } else {
      // TODO.
      paragraphReferences = matita
        .accessContentFromContentReference(this.$m_stateControl.stateView.document, nodeRenderControl.$m_contentReference)
        .blockIds.$m_toArray()
        .map(matita.makeBlockReferenceFromBlockId);
    }
    const startIndex = Math.max(0, indexOfNearestLessThanEq(paragraphReferences, viewPosition.$m_top, this.$p_compareParagraphTopToOffsetTop.bind(this)) - 1);
    const endIndex = Math.min(
      paragraphReferences.length - 1,
      indexOfNearestLessThanEq(paragraphReferences, viewPosition.$m_top, this.$p_compareParagraphTopToOffsetTop.bind(this), startIndex) + 1,
    );
    const possibleLines: {
      $m_paragraphReference: matita.BlockReference;
      $m_measuredParagraphLineRange: MeasuredParagraphLineRange;
      $m_isFirstInParagraph: boolean;
      $m_isLastInParagraph: boolean;
    }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const paragraphReference = paragraphReferences[i];
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
      for (let j = 0; j < paragraphMeasurement.$m_measuredParagraphLineRanges.length; j++) {
        const measuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[j];
        possibleLines.push({
          $m_paragraphReference: paragraphReference,
          $m_measuredParagraphLineRange: measuredParagraphLineRange,
          $m_isFirstInParagraph: j === 0,
          $m_isLastInParagraph: j === paragraphMeasurement.$m_measuredParagraphLineRanges.length - 1,
        });
      }
    }
    for (let i = 0; i < possibleLines.length; i++) {
      const possibleLine = possibleLines[i];
      const {
        $m_paragraphReference: paragraphReference,
        $m_measuredParagraphLineRange: measuredParagraphLineRange,
        $m_isFirstInParagraph: isFirstInParagraph,
        $m_isLastInParagraph: isLastInParagraph,
      } = possibleLine;
      const { $m_boundingRect: boundingRect } = measuredParagraphLineRange;
      const lineTop = i === 0 && !isExact ? -Infinity : boundingRect.$m_top;
      const lineBottom =
        i === possibleLines.length - 1
          ? isExact
            ? boundingRect.$m_bottom
            : Infinity
          : Math.max(possibleLines[i + 1].$m_measuredParagraphLineRange.$m_boundingRect.$m_top, boundingRect.$m_bottom);
      if (!(lineTop - this.$p_positionCalculationEpsilon <= viewPosition.$m_top && viewPosition.$m_top <= lineBottom + this.$p_positionCalculationEpsilon)) {
        continue;
      }
      if (isSnapIfPastBoundary) {
        if (i === 0 && viewPosition.$m_top < possibleLine.$m_measuredParagraphLineRange.$m_boundingRect.$m_top) {
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference),
          );
          if (matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference) === 0) {
            const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            return {
              $m_type: HitPositionType.ParagraphText,
              $m_checkboxMarkerParagraphReference: checkboxMarkerParagraphReference,
              $m_pointWithContentReference: {
                contentReference,
                point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, 0),
              },
              $m_isPastPreviousCharacterHalfPoint: false,
              $m_isWrappedLineStart: false,
              $m_isWrappedLinePreviousEnd: false,
            };
          }
        }
        if (i === possibleLines.length - 1 && viewPosition.$m_top > possibleLine.$m_measuredParagraphLineRange.$m_boundingRect.$m_bottom) {
          const contentReference = matita.makeContentReferenceFromContent(
            matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference),
          );
          if (
            matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference) ===
            matita.getNumberOfBlocksInContentAtContentReference(this.$m_stateControl.stateView.document, contentReference) - 1
          ) {
            const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
            matita.assertIsParagraph(paragraph);
            const paragraphLength = matita.getParagraphLength(paragraph);
            return {
              $m_type: HitPositionType.ParagraphText,
              $m_checkboxMarkerParagraphReference: checkboxMarkerParagraphReference,
              $m_pointWithContentReference: {
                contentReference,
                point: matita.makeParagraphPointFromParagraphReferenceAndOffset(paragraphReference, paragraphLength),
              },
              $m_isPastPreviousCharacterHalfPoint: paragraphLength > 0,
              $m_isWrappedLineStart: false,
              $m_isWrappedLinePreviousEnd: false,
            };
          }
        }
      }
      return this.$p_calculatePositionInMeasuredParagraphLineRangeInParagraphReferenceAtHorizontalOffset(
        measuredParagraphLineRange,
        paragraphReference,
        viewPosition.$m_left,
        isFirstInParagraph || possibleLines[i - 1].$m_measuredParagraphLineRange.$m_endsWithLineBreak,
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
  private $p_getVisibleTopAndBottom(): { $m_visibleTop: number; $m_visibleBottom: number } {
    // TODO.
    return {
      $m_visibleTop: 0,
      $m_visibleBottom: window.innerHeight,
    };
  }
  private $p_getVisibleLeftAndRight(): { $m_visibleLeft: number; $m_visibleRight: number } {
    // TODO.
    return {
      $m_visibleLeft: 0,
      $m_visibleRight: window.innerWidth,
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
    this.$m_viewControl.applyViewDelta(event.value);
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
    this.$p_inputControl.$m_sync();
    this.$p_useSearchScrollMargins = false;
    this.$p_syncFloatingLinkDetails();
  }
  private $p_getFloatingLinkDetailsInfo(): {
    $m_paragraphReference: matita.BlockReference;
    $m_startOffset: number;
    $m_endOffset: number;
    $m_text: string;
    $m_link: string;
  } | null {
    const selectionRanges = this.$m_stateControl.stateView.selection.selectionRanges;
    if (selectionRanges.length !== 1) {
      return null;
    }
    const selectionRange = selectionRanges[0];
    if (selectionRange.ranges.length !== 1) {
      return null;
    }
    const range = selectionRange.ranges[0];
    const direction = matita.getRangeDirection(this.$m_stateControl.stateView.document, range);
    const firstPoint = direction === matita.RangeDirection.Backwards ? range.endPoint : range.startPoint;
    const lastPoint = direction === matita.RangeDirection.Backwards ? range.startPoint : range.endPoint;
    if (!matita.isParagraphPoint(firstPoint) || !matita.isParagraphPoint(lastPoint) || !matita.areParagraphPointsAtSameParagraph(firstPoint, lastPoint)) {
      return null;
    }
    const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
    const firstInlineNodeWithStartOffset = matita.getInlineNodeWithStartOffsetAfterParagraphPoint(this.$m_stateControl.stateView.document, firstPoint);
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
        this.$m_stateControl.stateView.document,
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
        this.$m_stateControl.stateView.document,
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
    const paragraph = matita.accessParagraphFromParagraphPoint(this.$m_stateControl.stateView.document, firstPoint);
    const text = matita
      .sliceParagraphChildren(paragraph, startOffset, endOffset)
      .map((textNode) => {
        matita.assertIsText(textNode);
        return textNode.text;
      })
      .join('');
    return {
      $m_paragraphReference: paragraphReference,
      $m_startOffset: startOffset,
      $m_endOffset: endOffset,
      $m_text: text,
      $m_link: link,
    };
  }
  private $p_isLinkDetailsOpen(): boolean {
    return isSome(this.$p_linkDetailsRenderMessage$.lastValue) && this.$p_linkDetailsRenderMessage$.lastValue.$m_value !== null;
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
    const { $m_visibleLeft: visibleLeft, $m_visibleRight: visibleRight } = this.$p_getVisibleLeftAndRight();
    const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const visibleBoundingRect = makeViewRectangle(relativeOffsetLeft, relativeOffsetTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
    const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(linkDetailsInfo.$m_paragraphReference);
    const textDecorationInfos = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
      linkDetailsInfo.$m_paragraphReference,
      linkDetailsInfo.$m_startOffset,
      linkDetailsInfo.$m_endOffset,
      this.$p_getContainerScrollWidth(),
      relativeOffsetLeft,
      relativeOffsetTop,
      paragraphMeasurement,
    );
    const wordBoundingRect = this.$p_makeWordBoundingRect(textDecorationInfos);
    const makeSelectionCoveringLink = (): matita.Selection => {
      const contentReference = matita.makeContentReferenceFromContent(
        matita.accessContentFromBlockReference(this.$m_stateControl.stateView.document, linkDetailsInfo.$m_paragraphReference),
      );
      const startPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.$m_paragraphReference, linkDetailsInfo.$m_startOffset);
      const endPoint = matita.makeParagraphPointFromParagraphReferenceAndOffset(linkDetailsInfo.$m_paragraphReference, linkDetailsInfo.$m_endOffset);
      const range = matita.makeRange(contentReference, startPoint, endPoint, matita.generateId());
      const selectionRange = matita.makeSelectionRange([range], range.id, range.id, matita.SelectionRangeIntention.Text, {}, matita.generateId());
      const selection = matita.makeSelection([selectionRange]);
      return selection;
    };
    const isSelectionSame = (
      originalSelection: matita.Selection,
      originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    ): boolean => {
      const transformedSelection = this.$m_stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
        {
          selection: originalSelection,
          fixWhen: matita.MutationSelectionTransformFixWhen.NoFix,
          shouldTransformAsSelection: true,
        },
        originalStateView,
        this.$m_stateControl.stateView,
      );
      return matita.areSelectionsCoveringSameContent(originalSelection, transformedSelection);
    };
    const originalSelection = this.$m_stateControl.stateView.selection;
    this.$p_linkDetailsRenderMessage$(
      Push({
        $m_visibleBoundingRect: visibleBoundingRect,
        $m_wordBoundingRect: wordBoundingRect,
        $m_link: linkDetailsInfo.$m_link,
        $m_tempClose: () => {
          this.$p_tempCloseLinkDetails = true;
          this.$p_inputControl.$m_focusButDoNotScrollTo();
        },
        $m_returnFocus: () => {
          this.$p_inputControl.$m_focusButDoNotScrollTo();
        },
        $m_editLink: () => {
          let originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null =
            this.$m_stateControl.snapshotStateThroughStateView();
          this.$m_stateControl.queueUpdate(() => {
            const originalSelectionCoveringLink = makeSelectionCoveringLink();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (isSelectionSame(originalSelectionCoveringLink, originalStateView!)) {
              this.$m_stateControl.delta.setSelection(originalSelectionCoveringLink);
              this.$m_stateControl.delta.applyUpdate(this.$m_openFloatingLinkBoxAtSelection(linkDetailsInfo), { [keepFloatingLinkBoxOpenUpdateKey]: true });
            }
            originalStateView = null;
          });
        },
        $m_removeLink: () => {
          let originalStateView: matita.StateView<DocumentConfig, TopLevelContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null =
            this.$m_stateControl.snapshotStateThroughStateView();
          this.$m_stateControl.queueUpdate(() => {
            const originalSelectionCoveringLink = makeSelectionCoveringLink();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (isSelectionSame(originalSelectionCoveringLink, originalStateView!)) {
              if (matita.isSelectionCollapsedInText(originalSelection)) {
                this.$m_stateControl.delta.applyUpdate(
                  matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.$m_stateControl, null, () => ({ link: undefined }), originalSelectionCoveringLink),
                );
              } else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (isSelectionSame(originalSelection, originalStateView!)) {
                  this.$m_stateControl.delta.applyUpdate(
                    matita.makeToggleUpdateTextConfigAtSelectionUpdateFn(this.$m_stateControl, null, () => ({ link: undefined }), originalSelection),
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
    const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const marginTopBottom = this.$p_getBufferMarginTopBottom();
    const accessParagraphReferenceAtIndex = (index: number) => {
      return matita.makeBlockReferenceFromBlock(
        matita.accessBlockAtIndexInContentAtContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference, index),
      );
    };
    const numParagraphReferences = matita.getNumberOfBlocksInContentAtContentReference(
      this.$m_stateControl.stateView.document,
      this.$m_topLevelContentReference,
    );
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
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
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
      const paragraphMatches = this.$p_searchControl.$m_getMatchesForParagraphAtBlockReference(paragraphReference);
      const matchIndexInParagraph = paragraphMatches.$m_matches.findIndex(
        (otherMatch) =>
          (otherMatch.$m_startOffset === focusStartOffset && otherMatch.$m_endOffset === focusEndOffset) ||
          (otherMatch.$m_startOffset === focusEndOffset && otherMatch.$m_endOffset === focusStartOffset),
      );
      if (matchIndexInParagraph !== -1) {
        const totalMatchesBeforeParagraph$ =
          this.$p_searchElementTrackAllControl.$m_trackTotalMatchesBeforeParagraphAtParagraphReferenceUntilStateOrSearchChange(
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
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const paragraphMatches = this.$p_searchControl.$m_getMatchesForParagraphAtBlockReference(paragraphReference);
      if (paragraphMatches.$m_matches.length === 0) {
        continue;
      }
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
      for (let i = 0; i < paragraphMatches.$m_matches.length; i++) {
        const match = paragraphMatches.$m_matches[i];
        const { $m_startOffset: startOffset, $m_endOffset: endOffset } = match;
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
          this.$m_stateControl.stateView.selection.selectionRanges.some(
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
          $m_viewRangeInfos: viewRangeInfos,
          $m_isSelected: isSelected,
          $m_hasFocus: hasFocus,
        });
      }
    }
    return matchInfos;
  };
  private $p_replaceVisibleSearchResults(): void {
    this.$p_searchOverlay$(
      Push({
        $m_calculateMatchInfos: this.$p_calculateVisibleSearchResultsMatchInfos.bind(this),
        $m_renderSync: !this.$p_renderOverlayAsync && !this.$p_isDraggingSelection,
        $m_onRender: () => {
          this.$p_renderOverlayAsync = false;
        },
        $m_roundCorners: isFirefox,
      }),
    );
  }
  private $p_replaceVisibleSpellingMistakes(): void {
    if (this.$p_spellCheckControl === null || !this.$p_spellCheckControl.$m_getIsLoaded()) {
      return;
    }
    const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
    const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
    const marginTopBottom = this.$p_getBufferMarginTopBottom();
    const accessParagraphReferenceAtIndex = (index: number) => {
      return matita.makeBlockReferenceFromBlock(
        matita.accessBlockAtIndexInContentAtContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference, index),
      );
    };
    const numParagraphReferences = matita.getNumberOfBlocksInContentAtContentReference(
      this.$m_stateControl.stateView.document,
      this.$m_topLevelContentReference,
    );
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
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.$m_stateControl.stateView.document, this.$m_topLevelContentReference, i);
      const paragraphReference = matita.makeBlockReferenceFromBlock(paragraph);
      const spellingMistakes = this.$p_spellCheckControl.$m_getSpellingMistakesInParagraphAtParagraphReference(paragraphReference);
      if (spellingMistakes === null) {
        continue;
      }
      const paragraphMeasurement = this.$p_measureParagraphAtParagraphReference(paragraphReference);
      for (let j = 0; j < spellingMistakes.length; j++) {
        const spellingMistake = spellingMistakes[j];
        const textDecorationInfos = this.$p_calculateTextDecorationInfosForParagraphAtBlockReference(
          paragraphReference,
          spellingMistake.$m_startOffset,
          spellingMistake.$m_endOffset,
          containerWidth(),
          relativeOffsetLeft,
          relativeOffsetTop,
          paragraphMeasurement,
        );
        spellingMistakeOverlayInfos.push({
          $m_textDecorationInfos: textDecorationInfos,
        });
      }
    }
    this.$p_spellingMistakesOverlay$(
      Push({
        $m_spellingMistakeOverlayInfos: spellingMistakeOverlayInfos,
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
      this.$p_lastRenderedSelection === this.$m_stateControl.stateView.selection &&
      this.$p_lastRenderedCustomCollapsedSelectionTextConfig === this.$m_stateControl.stateView.customCollapsedSelectionTextConfig &&
      this.$p_lastIsDraggingSelection === this.$p_isDraggingSelection
    ) {
      return;
    }
    this.$p_lastRenderedSelection = this.$m_stateControl.stateView.selection;
    this.$p_lastRenderedCustomCollapsedSelectionTextConfig = this.$m_stateControl.stateView.customCollapsedSelectionTextConfig;
    this.$p_lastIsDraggingSelection = this.$p_isDraggingSelection;
    this.$p_virtualSelectionDisposable?.dispose();
    const virtualSelectionDisposable = Disposable();
    this.$p_virtualSelectionDisposable = virtualSelectionDisposable;
    const focusSelectionRange = matita.getFocusSelectionRangeFromSelection(this.$m_stateControl.stateView.selection);
    const { selectionRanges } = this.$m_stateControl.stateView.selection;
    if (selectionRanges.length === 0) {
      this.$p_selectionView$(
        Push({
          $m_viewCursorAndRangeInfos: {
            $m_viewCursorAndRangeInfosForSelectionRanges: [],
            $m_isDragging: this.$p_isDraggingSelection,
          },
          $m_renderSync: false,
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
          $m_viewCursorAndRangeInfos: {
            $m_viewCursorAndRangeInfosForSelectionRanges: viewCursorAndRangeInfosForSelectionRanges,
            $m_isDragging: this.$p_isDraggingSelection,
          },
          $m_renderSync: !this.$p_renderOverlayAsync && (!isFirefox || i === 0),
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
    const isInComposition = this.$p_inputControl.$m_getIsInComposition();
    const viewCursorAndRangeInfoForRangeSources = selectionRange.ranges.map((range) => {
      const lineWrapFocusCursorWrapToNextLineDataValue = getLineWrapFocusCursorWrapToNextLineWithExpirationIdSelectionRangeDataValue(selectionRange.data);
      const viewCursorAndRangeInfosForRange$ = this.$p_makeViewCursorAndRangeInfosForRange(
        range,
        range.id === selectionRange.anchorRangeId,
        range.id === selectionRange.focusRangeId,
        isFocusSelectionRange,
        lineWrapFocusCursorWrapToNextLineDataValue !== undefined &&
          this.$m_isSelectionSecondaryDataExpirationIdActive(lineWrapFocusCursorWrapToNextLineDataValue.$m_expirationId),
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
          $m_viewCursorAndRangeInfosForRanges: viewCursorAndRangeInfosForRanges,
          $m_selectionRangeId: selectionRange.id,
          $m_isInComposition: isInComposition,
          $m_roundCorners: isFirefox,
        }),
      ),
    );
  }
  private $p_calculateRelativeOffsets(): { $m_relativeOffsetLeft: number; $m_relativeOffsetTop: number } {
    const scrollContainer = this.$p_getScrollContainer();
    const { $m_visibleLeft: visibleLeft } = this.$p_getVisibleLeftAndRight();
    const { $m_visibleTop: visibleTop } = this.$p_getVisibleTopAndBottom();
    const relativeOffsetLeft = scrollContainer.scrollLeft + visibleLeft;
    const relativeOffsetTop = scrollContainer.scrollTop + visibleTop;
    return {
      $m_relativeOffsetLeft: relativeOffsetLeft,
      $m_relativeOffsetTop: relativeOffsetTop,
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
    for (let i = 0; i < paragraphMeasurement.$m_measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[i];
      const includedLineStartOffset = Math.max(measuredParagraphLineRange.$m_startOffset, includedParagraphStartOffset);
      const includedLineEndOffset = Math.min(measuredParagraphLineRange.$m_endOffset, includedParagraphEndOffset);
      if (includedLineStartOffset > measuredParagraphLineRange.$m_endOffset || includedLineEndOffset < measuredParagraphLineRange.$m_startOffset) {
        continue;
      }
      const hasVisibleLineBreakPaddingIfEndOfLine =
        (includedLineEndOffset === measuredParagraphLineRange.$m_endOffset &&
          measuredParagraphLineRange.$m_endsWithLineBreak &&
          !(includedLineEndOffset === includedParagraphEndOffset && isLastParagraphInRange)) ||
        (includedLineEndOffset === includedParagraphEndOffset && !isLastParagraphInRange);
      if (includedLineStartOffset === measuredParagraphLineRange.$m_endOffset) {
        if (hasVisibleLineBreakPaddingIfEndOfLine) {
          let lineRect: ViewRectangle | undefined;
          if (measuredParagraphLineRange.$m_characterRectangles.length === 0) {
            const lineRectLeft = measuredParagraphLineRange.$m_boundingRect.$m_left + relativeOffsetLeft;
            if (lineRectLeft < containerWidth) {
              lineRect = makeViewRectangle(
                lineRectLeft,
                measuredParagraphLineRange.$m_boundingRect.$m_top + relativeOffsetTop,
                Math.min(containerWidth - lineRectLeft, visibleLineBreakPadding),
                measuredParagraphLineRange.$m_boundingRect.$m_height,
              );
            }
          } else {
            const lineRectLeft = measuredParagraphLineRange.$m_boundingRect.$m_right + relativeOffsetLeft;
            if (lineRectLeft < containerWidth) {
              lineRect = makeViewRectangle(
                lineRectLeft,
                measuredParagraphLineRange.$m_boundingRect.$m_top + relativeOffsetTop,
                Math.min(containerWidth - lineRectLeft, visibleLineBreakPadding),
                measuredParagraphLineRange.$m_boundingRect.$m_height,
              );
            }
          }
          if (lineRect !== undefined) {
            viewRangeInfos.push({
              $m_rectangle: lineRect,
              $m_paragraphLineIndex: i,
              $m_startOffset: 0,
              $m_endOffset: 0,
              $m_paragraphReference: paragraphReference,
            });
          }
        }
        continue;
      }
      const lineRectLeft =
        (includedLineStartOffset === measuredParagraphLineRange.$m_endOffset
          ? measuredParagraphLineRange.$m_characterRectangles[includedLineStartOffset - measuredParagraphLineRange.$m_startOffset - 1].$m_right
          : measuredParagraphLineRange.$m_characterRectangles[includedLineStartOffset - measuredParagraphLineRange.$m_startOffset].$m_left) +
        relativeOffsetLeft;
      const lineRectTop = measuredParagraphLineRange.$m_boundingRect.$m_top + relativeOffsetTop;
      const lineRectHeight = measuredParagraphLineRange.$m_boundingRect.$m_height;
      let lineRectWidth: number =
        includedLineStartOffset === includedLineEndOffset
          ? 0
          : measuredParagraphLineRange.$m_characterRectangles[includedLineEndOffset - measuredParagraphLineRange.$m_startOffset - 1].$m_right +
            relativeOffsetLeft -
            lineRectLeft;
      if (hasVisibleLineBreakPaddingIfEndOfLine) {
        lineRectWidth += visibleLineBreakPadding;
      } else if (includedLineStartOffset === includedLineEndOffset) {
        continue;
      }
      if (lineRectLeft < containerWidth) {
        viewRangeInfos.push({
          $m_rectangle: makeViewRectangle(lineRectLeft, lineRectTop, Math.min(containerWidth - lineRectLeft, lineRectWidth), lineRectHeight),
          $m_paragraphLineIndex: i,
          $m_startOffset: includedLineStartOffset,
          $m_endOffset: includedLineEndOffset,
          $m_paragraphReference: paragraphReference,
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
    for (let i = 0; i < paragraphMeasurement.$m_measuredParagraphLineRanges.length; i++) {
      const measuredParagraphLineRange = paragraphMeasurement.$m_measuredParagraphLineRanges[i];
      const includedLineStartOffset = Math.max(measuredParagraphLineRange.$m_startOffset, includedParagraphStartOffset);
      const includedLineEndOffset = Math.min(measuredParagraphLineRange.$m_endOffset, includedParagraphEndOffset);
      if (
        includedLineStartOffset === includedLineEndOffset ||
        includedLineStartOffset > measuredParagraphLineRange.$m_endOffset ||
        includedLineEndOffset < measuredParagraphLineRange.$m_startOffset ||
        includedLineStartOffset === measuredParagraphLineRange.$m_endOffset
      ) {
        continue;
      }
      const lineRectLeft =
        measuredParagraphLineRange.$m_characterRectangles[includedLineStartOffset - measuredParagraphLineRange.$m_startOffset].$m_left + relativeOffsetLeft;
      let characterTopMinimum = Infinity;
      let characterBottomMaximum = -Infinity;
      for (let j = includedLineStartOffset; j < includedLineEndOffset; j++) {
        const characterRectangle = measuredParagraphLineRange.$m_characterRectangles[j - measuredParagraphLineRange.$m_startOffset];
        if (characterRectangle.$m_top < characterTopMinimum) {
          characterTopMinimum = characterRectangle.$m_top;
        }
        if (characterRectangle.$m_bottom > characterBottomMaximum) {
          characterBottomMaximum = characterRectangle.$m_bottom;
        }
      }
      const lineRectTop = characterTopMinimum + relativeOffsetTop;
      const lineRectHeight = characterBottomMaximum - characterTopMinimum;
      const lineRectWidth =
        measuredParagraphLineRange.$m_characterRectangles[includedLineEndOffset - measuredParagraphLineRange.$m_startOffset - 1].$m_right +
        relativeOffsetLeft -
        lineRectLeft;
      const restrictedWidth = Math.min(containerWidth - lineRectLeft, lineRectWidth);
      if (lineRectLeft < containerWidth) {
        textDecorationInfos.push({
          $m_charactersBoundingRectangle: makeViewRectangle(lineRectLeft, lineRectTop, restrictedWidth, lineRectHeight),
          $m_charactersLineBoundingRectangle: makeViewRectangle(
            lineRectLeft,
            measuredParagraphLineRange.$m_boundingRect.$m_top + relativeOffsetTop,
            restrictedWidth,
            measuredParagraphLineRange.$m_boundingRect.$m_height,
          ),
          $m_paragraphReference: paragraphReference,
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
    const direction = matita.getRangeDirection(this.$m_stateControl.stateView.document, range);
    assert(direction === matita.RangeDirection.Backwards || direction === matita.RangeDirection.Forwards || direction === matita.RangeDirection.NeutralText);
    const firstPoint = direction === matita.RangeDirection.Backwards ? range.endPoint : range.startPoint;
    const lastPoint = direction === matita.RangeDirection.Backwards ? range.startPoint : range.endPoint;
    matita.assertIsParagraphPoint(firstPoint);
    matita.assertIsParagraphPoint(lastPoint);
    const firstParagraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
    const lastParagraphReference = matita.makeBlockReferenceFromParagraphPoint(lastPoint);
    const firstParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, firstParagraphReference);
    const lastParagraphIndex = matita.getIndexOfBlockInContentFromBlockReference(this.$m_stateControl.stateView.document, lastParagraphReference);
    const observedParagraphReferences: matita.BlockReference[] = [];
    for (let i = firstParagraphIndex; i <= lastParagraphIndex; i++) {
      const paragraph = matita.accessBlockAtIndexInContentAtContentReference(this.$m_stateControl.stateView.document, contentReference, i);
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
      const paragraph = matita.accessBlockFromBlockReference(this.$m_stateControl.stateView.document, paragraphReference);
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
      this.$m_isSelectionSecondaryDataExpirationIdActive(compositionUpdateData.$m_expirationId) &&
      matita.areParagraphPointsAtSameParagraph(firstPoint, lastPoint) &&
      compositionUpdateData.$m_selectionStartOffsetAdjustAmount >= 0 &&
      compositionUpdateData.$m_selectionEndOffsetAdjustAmount <= 0 &&
      compositionUpdateData.$m_selectionStartOffsetAdjustAmount - compositionUpdateData.$m_selectionEndOffsetAdjustAmount <=
        lastPoint.offset - firstPoint.offset
    ) {
      compositionRenderedSelectionRange = {
        startOffset: firstPoint.offset + compositionUpdateData.$m_selectionStartOffsetAdjustAmount,
        endOffset: lastPoint.offset + compositionUpdateData.$m_selectionEndOffsetAdjustAmount,
      };
    }
    const calculateViewCursorInfoForFocusPoint = (containerWidth: number, relativeOffsetLeft: number, relativeOffsetTop: number): ViewCursorInfo => {
      const cursorPoint =
        compositionRenderedSelectionRange === undefined
          ? focusPoint
          : matita.changeParagraphPointOffset(firstPoint, compositionRenderedSelectionRange.endOffset);
      const cursorPositionAndHeight = this.$p_getCursorPositionAndHeightFromParagraphPointFillingLine(cursorPoint, isMarkedLineWrapFocusCursorWrapToNextLine);
      const insertTextConfig = getInsertTextConfigAtSelectionRange(
        this.$m_stateControl.stateView.document,
        this.$m_stateControl.stateView.customCollapsedSelectionTextConfig,
        selectionRange,
      );
      let cursorTop: number;
      let cursorHeight: number;
      let cursorColor: string | undefined;
      const isCollapsed = direction === matita.RangeDirection.NeutralText;
      if (isCollapsed) {
        const firstParagraphRenderControl = this.$m_viewControl.accessParagraphRenderControlAtBlockReference(firstParagraphReference);
        const cursorTopAndHeightAndMaybeColor =
          firstParagraphRenderControl.$m_convertLineTopAndHeightAndInsertTextConfigAndMeasurementsToCursorTopAndHeightAndMaybeColor(
            cursorPositionAndHeight.position.$m_top,
            cursorPositionAndHeight.height,
            insertTextConfig,
            cursorPositionAndHeight.measuredParagraphLineRanges,
            cursorPositionAndHeight.measuredParagraphLineRangeIndex,
          );
        cursorTop = cursorTopAndHeightAndMaybeColor.$m_top + relativeOffsetTop;
        cursorHeight = cursorTopAndHeightAndMaybeColor.$m_height;
        cursorColor = cursorTopAndHeightAndMaybeColor.$m_color;
      } else {
        cursorTop = cursorPositionAndHeight.position.$m_top + relativeOffsetTop;
        cursorHeight = cursorPositionAndHeight.height;
      }
      const cursorLeft = Math.min(containerWidth - cursorWidth / 2, cursorPositionAndHeight.position.$m_left + relativeOffsetLeft);
      const viewCursorInfo: ViewCursorInfo = {
        $m_position: {
          $m_left: cursorLeft,
          $m_top: cursorTop,
        },
        $m_height: cursorHeight,
        $m_isAnchor: isAnchor,
        $m_isFocus: isFocus,
        $m_isItalic: isCollapsed && insertTextConfig.italic === true,
        $m_paragraphReference: focusParagraphReference,
        $m_offset: cursorPoint.offset,
        $m_rangeDirection: direction,
        $m_insertTextConfig: insertTextConfig,
        $m_customColor: cursorColor,
      };
      // TODO: Refactor so this function is pure?
      if (isFocusSelectionRange) {
        this.$p_inputControl.$m_setPositionAndHeight(Math.min(cursorLeft, containerWidth - 32), cursorTop, cursorHeight);
      }
      return viewCursorInfo;
    };
    const calculateViewCursorAndRangeInfosForKnownVisibleParagraphs = (visibleStartIndex: number, visibleEndIndex: number): ViewCursorAndRangeInfosForRange => {
      const containerWidth = this.$p_getContainerScrollWidth();
      const { $m_relativeOffsetLeft: relativeOffsetLeft, $m_relativeOffsetTop: relativeOffsetTop } = this.$p_calculateRelativeOffsets();
      const viewParagraphInfos: ViewCursorAndRangeInfosForParagraphInRange[] = [];
      if (direction === matita.RangeDirection.NeutralText) {
        const viewCursorInfo = calculateViewCursorInfoForFocusPoint(containerWidth, relativeOffsetLeft, relativeOffsetTop);
        viewParagraphInfos.push({
          $m_paragraphReference: focusParagraphReference,
          $m_viewRangeInfos: [],
          $m_viewCursorInfos: [viewCursorInfo],
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
            $m_paragraphReference: paragraphReference,
            $m_viewRangeInfos: viewRangeInfos,
            $m_viewCursorInfos: viewCursorInfos,
          });
        }
      }
      let compositionRangeInfos: ViewRangeInfosForParagraphInRange | undefined;
      if (compositionRenderedSelectionRange !== undefined) {
        const paragraphReference = matita.makeBlockReferenceFromParagraphPoint(firstPoint);
        compositionRangeInfos = {
          $m_paragraphReference: paragraphReference,
          $m_viewRangeInfos: this.$p_calculateViewRangeInfosForParagraphAtBlockReference(
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
        $m_viewParagraphInfos: viewParagraphInfos,
        $m_compositionRangeInfos: compositionRangeInfos,
      };
    };
    const calculateViewCursorAndRangeInfosForVisibleParagraphsManually = (): ViewCursorAndRangeInfosForRange => {
      const { $m_visibleTop: visibleTop, $m_visibleBottom: visibleBottom } = this.$p_getVisibleTopAndBottom();
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
    this.$m_rootHtmlElement.removeChild(this.$p_containerHtmlElement);
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
      let newRanges: matita.Range[] | null = null;
      let j = 0;
      for (let i = 0; i < selectionRange.ranges.length; i++) {
        const range = selectionRange.ranges[i];
        if (
          range.id !== selectionRange.focusRangeId &&
          matita.isParagraphPoint(range.startPoint) &&
          matita.isParagraphPoint(range.endPoint) &&
          matita.areParagraphPointsAtSameOffsetInSameParagraph(range.startPoint, range.endPoint)
        ) {
          if (newRanges === null) {
            newRanges = selectionRange.ranges.filter((otherRange) => otherRange.id !== range.id);
            j--;
          } else {
            newRanges.splice(j--, 1);
          }
        }
        j++;
      }
      if (newRanges !== null) {
        return matita.makeSelectionRange(
          newRanges,
          newRanges.some((range) => range.id === selectionRange.anchorRangeId) ? selectionRange.anchorRangeId : newRanges[0].id,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      }
      return selectionRange;
    },
    IntlSegmenter,
    shouldKeepEmptyFirstParagraphConfigWhenRemoving(firstParagraphConfig, secondParagraphConfig) {
      return (
        (acceptedParagraphTypes as (ParagraphType | undefined)[]).includes(firstParagraphConfig.type) ||
        (convertStoredParagraphAlignmentToAccessedParagraphAlignment(firstParagraphConfig.alignment) !== AccessedParagraphAlignment.Left &&
          !(acceptedParagraphTypes as (ParagraphType | undefined)[]).includes(secondParagraphConfig.type))
      );
    },
    getSplitParagraphConfigWhenInsertingEmbed(paragraphConfig) {
      return omit(paragraphConfig, ['ListItem_Checklist_checked']);
    },
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
