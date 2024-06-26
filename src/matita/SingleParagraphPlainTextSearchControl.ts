import { CountedIndexableUniqueStringList } from '../common/CountedIndexableUniqueStringList';
import { IntlSegmenter } from '../common/IntlSegmenter';
import { UniqueStringQueue } from '../common/UniqueStringQueue';
import { assert, assertIsNotNullish, assertUnreachable, throwUnreachable } from '../common/util';
import { Disposable, DisposableClass, implDisposableMethods } from '../ruscel/disposable';
import { CurrentValueDistributor, CurrentValueSource, Distributor, LastValueDistributor, LastValueSource } from '../ruscel/distributor';
import { End, EndType, Push, PushType, subscribe, take, takeUntil, ThrowType } from '../ruscel/source';
import { pipe, requestIdleCallbackDisposable } from '../ruscel/util';
import * as matita from '.';
interface SingleParagraphPlainTextSearchControlConfig {
  $m_ignoreCase: boolean;
  $m_ignoreDiacritics: boolean;
  $m_stripNonLettersAndNumbers: boolean;
  $m_wholeWords: boolean;
  $m_searchQueryWordsIndividually: boolean;
  $m_replaceSimilarLooking: boolean;
}
function areConfigsEqual(config1: SingleParagraphPlainTextSearchControlConfig, config2: SingleParagraphPlainTextSearchControlConfig): boolean {
  return (
    config1.$m_ignoreCase === config2.$m_ignoreCase &&
    config1.$m_ignoreDiacritics === config2.$m_ignoreDiacritics &&
    config1.$m_stripNonLettersAndNumbers === config2.$m_stripNonLettersAndNumbers &&
    config1.$m_wholeWords === config2.$m_wholeWords &&
    config1.$m_searchQueryWordsIndividually === config2.$m_searchQueryWordsIndividually &&
    config1.$m_replaceSimilarLooking === config2.$m_replaceSimilarLooking
  );
}
interface ParagraphMatch {
  $m_paragraphReference: matita.BlockReference;
  $m_startOffset: number;
  $m_endOffset: number;
}
interface ParagraphMatches {
  $m_matches: ParagraphMatch[];
}
const enum WrapCurrentOrSearchFurtherMatchStrategy {
  WrapCurrentOrSearchFurther = 'WrapCurrentOrSearchFurther',
  WrapCurrentIfNotExactOrSearchFurther = 'WrapCurrentIfNotExactOrSearchFurther',
}
interface WrapCurrentOrSearchFurtherMatchResult {
  $m_match: ParagraphMatch;
  $m_matchIndex: number;
}
interface TotalMatchesMessage {
  $m_totalMatches: number;
  $m_isComplete: boolean;
}
interface TrackAllControlBase {
  $m_trackTotalMatchesBeforeParagraphAtParagraphReferenceUntilStateOrSearchChange: (
    paragraphReference: matita.BlockReference,
    disposable: Disposable,
  ) => CurrentValueSource<number>;
  $m_wrapCurrentAlwaysOrFindNextMatch(selectionRange: matita.SelectionRange | null, matchDisposable: Disposable): LastValueSource<ParagraphMatch | null>;
  $m_totalMatches$: CurrentValueSource<TotalMatchesMessage>;
}
interface TrackAllControl extends TrackAllControlBase, Disposable {}
interface TextPart {
  $m_text: string;
  $m_startOffset: number;
  $m_endOffset: number;
  $m_isSingleLongChar: boolean;
}
function makeTextPart(text: string, startOffset: number, endOffset: number, isSingleLongChar: boolean): TextPart {
  return {
    $m_text: text,
    $m_startOffset: startOffset,
    $m_endOffset: endOffset,
    $m_isSingleLongChar: isSingleLongChar,
  };
}
const similarCharacterMapping = new Map([
  ['‘', "'"],
  ['’', "'"],
  ['“', '"'],
  ['”', '"'],
]);
interface TextPartGroup {
  $m_textParts: TextPart[];
  $m_badOffsets: Set<number> | null;
}
function normalizeTextPart(textPart: TextPart, config: SingleParagraphPlainTextSearchControlConfig, graphemeSegmenter: IntlSegmenter): TextPartGroup {
  const {
    $m_stripNonLettersAndNumbers: stripNonLettersAndNumbers,
    $m_ignoreDiacritics: ignoreDiacritics,
    $m_ignoreCase: ignoreCase,
    $m_replaceSimilarLooking: replaceSimilarLooking,
  } = config;
  let badOffsets: Set<number> | null = null;
  const segments = graphemeSegmenter.segment(textPart.$m_text);
  const normalizedTextParts: TextPart[] = [];
  let isPreviousGood = false;
  let normalizedTextRunStartOffset = 0;
  for (const segment of segments) {
    const segmentOffset = segment.index;
    const char = segment.segment;
    let normalizedChar = char;
    if (ignoreDiacritics) {
      const normalizedNfd = normalizedChar.normalize('NFD');
      const withoutDiacritics = normalizedNfd.replace(/\p{Diacritic}/gu, '');
      if (withoutDiacritics.length === 0) {
        normalizedChar = normalizedNfd;
      } else {
        normalizedChar = withoutDiacritics;
      }
    }
    if (stripNonLettersAndNumbers) {
      normalizedChar = normalizedChar.replace(/[^\p{L}\p{N}]/gu, '');
    }
    if (replaceSimilarLooking) {
      const normalizedNfkc = normalizedChar.normalize('NFKC');
      const similarCharacter = similarCharacterMapping.get(normalizedChar);
      if (similarCharacter === undefined) {
        normalizedChar = normalizedNfkc;
      } else {
        normalizedChar = similarCharacter;
      }
    }
    if (ignoreCase) {
      normalizedChar = normalizedChar.toLowerCase();
    }
    normalizedChar = normalizedChar.normalize('NFC');
    if (normalizedChar.length === 0) {
      isPreviousGood = false;
      continue;
    }
    const endOffset = segmentOffset + char.length;
    const isCharGood = char.length === 1 && normalizedChar.length === 1;
    const normalizedTextRunEndOffset = normalizedTextRunStartOffset + normalizedChar.length;
    if (isPreviousGood && isCharGood) {
      const previousNormalizedTextPart = normalizedTextParts[normalizedTextParts.length - 1];
      previousNormalizedTextPart.$m_text += normalizedChar;
      previousNormalizedTextPart.$m_endOffset = endOffset;
    } else {
      const isCharBad = !isCharGood;
      if (normalizedChar.length > 1) {
        if (badOffsets === null) {
          badOffsets = new Set();
        }
        for (let i = normalizedTextRunStartOffset + 1; i < normalizedTextRunEndOffset; i++) {
          badOffsets.add(i);
        }
      }
      normalizedTextParts.push(makeTextPart(normalizedChar, textPart.$m_startOffset + segmentOffset, textPart.$m_startOffset + endOffset, isCharBad));
      isPreviousGood = isCharGood;
    }
    normalizedTextRunStartOffset = normalizedTextRunEndOffset;
  }
  return {
    $m_textParts: normalizedTextParts,
    $m_badOffsets: badOffsets,
  };
}
function normalizeQuery(query: string, config: SingleParagraphPlainTextSearchControlConfig, graphemeSegmenter: IntlSegmenter): string {
  return normalizeTextPart(makeTextPart(query, 0, query.length, false), config, graphemeSegmenter)
    .$m_textParts.map((textPart) => textPart.$m_text)
    .join('');
}
class AlreadyTrackingAllError extends Error {
  name = 'AlreadyTrackingAllError';
  constructor(options?: ErrorOptions) {
    super('Already tracking all paragraphs.', options);
  }
}
interface ProcessedParagraph {
  $m_textPartGroups: TextPartGroup[];
  $m_wordBoundaryIndices: number[] | null;
}
function makeProcessedParagraph(textPartGroups: TextPartGroup[], wordBoundaryIndices: number[] | null): ProcessedParagraph {
  return {
    $m_textPartGroups: textPartGroups,
    $m_wordBoundaryIndices: wordBoundaryIndices,
  };
}
type LpsArray = number[];
function computeLpsArray(pattern: string): number[] {
  assert(pattern.length > 0);
  const lps: number[] = [];
  const M = pattern.length;
  let len = 0;
  let i = 1;
  lps[0] = 0;
  while (i < M) {
    if (pattern.charAt(i) === pattern.charAt(len)) {
      len++;
      lps[i] = len;
      i++;
    } else {
      if (len !== 0) {
        len = lps[len - 1];
      } else {
        lps[i] = len;
        i++;
      }
    }
  }
  return lps;
}
function searchKmp(
  accessChar: (i: number) => string,
  N: number,
  pattern: string,
  lps: LpsArray,
  getShouldRejectMatch: (matchStartIndex: number) => boolean,
): number[] {
  const M = pattern.length;
  let j = 0;
  let i = 0;
  const startIndices: number[] = [];
  while (N - i >= M - j) {
    if (pattern[j] === accessChar(i)) {
      j++;
      i++;
    }
    if (j === M) {
      const matchStartIndex = i - M;
      j = 0;
      if (getShouldRejectMatch(matchStartIndex)) {
        i = matchStartIndex + 1;
      } else {
        startIndices.push(matchStartIndex);
      }
    } else if (i < N && pattern[j] !== accessChar(i)) {
      if (j !== 0) {
        j = lps[j - 1];
      } else {
        i++;
      }
    }
  }
  return startIndices;
}
interface SearchPatternData {
  $m_pattern: string;
  $m_kmpLpsArray: LpsArray;
}
// TODO: Match return selection range instead of range, e.g. to exclude voids in middle of match.
// TODO: Simplify with previous and next paragraph iterator.
class SingleParagraphPlainTextSearchControl extends DisposableClass {
  private $p_stateControl: matita.StateControl<
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig
  >;
  private $p_query: string;
  private $p_config: SingleParagraphPlainTextSearchControlConfig;
  private $p_topLevelContentReference: matita.ContentReference;
  private $p_searchPatterns!: SearchPatternData[];
  private $p_processedParagraphCache = new Map<string, ProcessedParagraph>();
  private $p_paragraphMatchesCache = new Map<string, ParagraphMatches>();
  private $p_graphemeSegmenter: IntlSegmenter;
  private $p_wordSegmenter: IntlSegmenter;
  private $p_pendingParagraphIds: UniqueStringQueue | null = null;
  private $p_pendingParagraphIdsQueued: Distributor<undefined>;
  private $p_paragraphMatchCounts: CountedIndexableUniqueStringList | null = null;
  private $p_trackChangesDisposable?: Disposable;
  private $p_isTrackingAll = false;
  private $p_endPendingQueries: Distributor<undefined>;
  constructor(
    stateControl: matita.StateControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    query: string,
    config: SingleParagraphPlainTextSearchControlConfig,
    topLevelContentReference: matita.ContentReference,
  ) {
    super();
    this.$p_stateControl = stateControl;
    this.$p_query = query;
    this.$p_config = config;
    this.$p_topLevelContentReference = topLevelContentReference;
    this.$p_graphemeSegmenter = new stateControl.stateControlConfig.IntlSegmenter();
    this.$p_wordSegmenter = new stateControl.stateControlConfig.IntlSegmenter(undefined, {
      granularity: 'word',
    });
    this.$p_pendingParagraphIdsQueued = Distributor<undefined>();
    this.$p_endPendingQueries = Distributor<undefined>();
    this.add(this.$p_pendingParagraphIdsQueued);
    this.add(this.$p_endPendingQueries);
    this.$p_updateSearchPatterns(null);
    this.$p_trackChangesManually();
  }
  private $p_trackChangesManually(): void {
    this.$p_trackChangesDisposable?.dispose();
    this.$p_trackChangesDisposable = Disposable();
    this.add(this.$p_trackChangesDisposable);
    pipe(
      this.$p_stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$p_endPendingQueries(Push(undefined));
        const message = event.value;
        for (let i = 0; i < message.viewDelta.changes.length; i++) {
          const change = message.viewDelta.changes[i];
          switch (change.type) {
            case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
              const { blockReference } = change;
              if (change.isParagraphTextUpdated) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                this.$p_processedParagraphCache.delete(paragraphId);
                this.$p_paragraphMatchesCache.delete(paragraphId);
              }
              break;
            }
            case matita.ViewDeltaChangeType.BlocksRemoved: {
              const { blockReferences } = change;
              for (let j = 0; j < blockReferences.length; j++) {
                const blockReference = blockReferences[j];
                const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
                if (matita.isParagraph(block)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                  this.$p_processedParagraphCache.delete(paragraphId);
                  this.$p_paragraphMatchesCache.delete(paragraphId);
                } else {
                  for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
                    const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                    this.$p_processedParagraphCache.delete(paragraphId);
                    this.$p_paragraphMatchesCache.delete(paragraphId);
                  }
                }
              }
              break;
            }
            case matita.ViewDeltaChangeType.ContentsRemoved: {
              const { contentReferences } = change;
              for (let j = 0; j < contentReferences.length; j++) {
                const contentReference = contentReferences[j];
                for (const subParagraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                  this.$p_processedParagraphCache.delete(paragraphId);
                  this.$p_paragraphMatchesCache.delete(paragraphId);
                }
              }
              break;
            }
          }
        }
      }, this.$p_trackChangesDisposable),
    );
  }
  private $p_trackChangesAutomatically(): void {
    this.$p_trackChangesDisposable?.dispose();
    this.$p_trackChangesDisposable = Disposable();
    this.add(this.$p_trackChangesDisposable);
    pipe(
      this.$p_stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.$p_endPendingQueries(Push(undefined));
        assertIsNotNullish(this.$p_pendingParagraphIds);
        assertIsNotNullish(this.$p_paragraphMatchCounts);
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
                    this.$p_trackBlocksAfterInserted(blockReferences);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlocksMoved: {
              const { blockReferences } = change;
              for (let j = 0; j < blockReferences.length; j++) {
                const blockReference = blockReferences[j];
                const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
                if (matita.isParagraph(block)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                  const paragraphIndex = this.$p_paragraphMatchCounts.$m_indexOf(paragraphId);
                  this.$p_paragraphMatchCounts.$m_remove(paragraphIndex, paragraphIndex);
                } else {
                  for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
                    const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                    const paragraphIndex = this.$p_paragraphMatchCounts.$m_indexOf(paragraphId);
                    this.$p_paragraphMatchCounts.$m_remove(paragraphIndex, paragraphIndex);
                  }
                }
              }
              pipe(
                this.$p_stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === PushType) {
                    this.$p_trackBlocksAfterInserted(blockReferences);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
              const { blockReference, isParagraphTextUpdated } = change;
              if (!isParagraphTextUpdated) {
                break;
              }
              const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
              this.$p_pendingParagraphIds.$m_queue(paragraphId);
              this.$p_processedParagraphCache.delete(paragraphId);
              this.$p_paragraphMatchesCache.delete(paragraphId);
              this.$p_pendingParagraphIdsQueued(Push(undefined));
              break;
            }
            case matita.ViewDeltaChangeType.BlocksRemoved: {
              const { blockReferences } = change;
              for (let j = 0; j < blockReferences.length; j++) {
                const blockReference = blockReferences[j];
                const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
                if (matita.isParagraph(block)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                  this.$p_pendingParagraphIds.$m_dequeue(paragraphId);
                  const paragraphIndex = this.$p_paragraphMatchCounts.$m_indexOf(paragraphId);
                  this.$p_paragraphMatchCounts.$m_remove(paragraphIndex, paragraphIndex);
                  this.$p_processedParagraphCache.delete(paragraphId);
                  this.$p_paragraphMatchesCache.delete(paragraphId);
                } else {
                  for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
                    const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                    this.$p_pendingParagraphIds.$m_dequeue(paragraphId);
                    const paragraphIndex = this.$p_paragraphMatchCounts.$m_indexOf(paragraphId);
                    this.$p_paragraphMatchCounts.$m_remove(paragraphIndex, paragraphIndex);
                    this.$p_processedParagraphCache.delete(paragraphId);
                    this.$p_paragraphMatchesCache.delete(paragraphId);
                  }
                }
              }
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
                  assertIsNotNullish(this.$p_pendingParagraphIds);
                  assertIsNotNullish(this.$p_paragraphMatchCounts);
                  let insertBeforeIndex = 0;
                  let previousBlockReference: matita.BlockReference | null | undefined;
                  while (true) {
                    let previousPoint: matita.BlockPoint | null;
                    if (previousBlockReference === undefined) {
                      previousPoint = matita.accessLastPreviousPointToContentAtContentReference(
                        this.$p_stateControl.stateView.document,
                        contentReferences[0],
                        matita.SelectionRangeIntention.Block,
                      ) as matita.BlockPoint | null;
                    } else {
                      assertIsNotNullish(previousBlockReference);
                      previousPoint = matita.accessLastPreviousPointToBlockAtBlockReference(
                        this.$p_stateControl.stateView.document,
                        previousBlockReference,
                        matita.SelectionRangeIntention.Block,
                      ) as matita.BlockPoint | null;
                    }
                    assert(previousPoint === null || matita.isBlockPoint(previousPoint));
                    if (previousPoint === null) {
                      break;
                    } else {
                      previousBlockReference = matita.makeBlockReferenceFromBlockPoint(previousPoint);
                      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, previousBlockReference);
                      if (matita.isParagraph(block)) {
                        insertBeforeIndex =
                          matita.getIndexOfBlockInContentFromBlockReference(this.$p_stateControl.stateView.document, previousBlockReference) + 1;
                        break;
                      }
                    }
                  }
                  const paragraphIdAndCounts: [string, number][] = [];
                  for (let i = 0; i < contentReferences.length; i++) {
                    const contentReference = contentReferences[i];
                    for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
                      const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
                      this.$p_pendingParagraphIds.$m_queue(paragraphId);
                      paragraphIdAndCounts.push([paragraphId, 0]);
                    }
                  }
                  this.$p_paragraphMatchCounts.$m_insertBefore(insertBeforeIndex, paragraphIdAndCounts);
                  this.$p_pendingParagraphIdsQueued(Push(undefined));
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.ContentsRemoved: {
              const { contentReferences } = change;
              for (let i = 0; i < contentReferences.length; i++) {
                const contentReference = contentReferences[i];
                for (const subParagraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                  this.$p_pendingParagraphIds.$m_dequeue(paragraphId);
                  const paragraphIndex = this.$p_paragraphMatchCounts.$m_indexOf(paragraphId);
                  this.$p_paragraphMatchCounts.$m_remove(paragraphIndex, paragraphIndex);
                  this.$p_processedParagraphCache.delete(paragraphId);
                  this.$p_paragraphMatchesCache.delete(paragraphId);
                }
              }
              break;
            }
          }
        }
      }, this.$p_trackChangesDisposable),
    );
  }
  private $p_trackBlocksAfterInserted(blockReferences: matita.BlockReference[]): void {
    assertIsNotNullish(this.$p_pendingParagraphIds);
    assertIsNotNullish(this.$p_paragraphMatchCounts);
    let insertBeforeIndex = 0;
    let previousBlockReference: matita.BlockReference | null = blockReferences[0];
    while (true) {
      assertIsNotNullish(previousBlockReference);
      const previousPoint = matita.accessLastPreviousPointToBlockAtBlockReference(
        this.$p_stateControl.stateView.document,
        previousBlockReference,
        matita.SelectionRangeIntention.Block,
      ) as matita.BlockPoint | null;
      assert(previousPoint === null || matita.isBlockPoint(previousPoint));
      if (previousPoint === null) {
        break;
      } else {
        previousBlockReference = matita.makeBlockReferenceFromBlockPoint(previousPoint);
        const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, previousBlockReference);
        if (matita.isParagraph(block)) {
          insertBeforeIndex = matita.getIndexOfBlockInContentFromBlockReference(this.$p_stateControl.stateView.document, previousBlockReference) + 1;
          break;
        }
      }
    }
    const paragraphIdAndCounts: [string, number][] = [];
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isParagraph(block)) {
        const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
        this.$p_pendingParagraphIds.$m_queue(paragraphId);
        paragraphIdAndCounts.push([paragraphId, 0]);
      } else {
        for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          this.$p_pendingParagraphIds.$m_queue(paragraphId);
          paragraphIdAndCounts.push([paragraphId, 0]);
        }
      }
    }
    this.$p_paragraphMatchCounts.$m_insertBefore(insertBeforeIndex, paragraphIdAndCounts);
    this.$p_pendingParagraphIdsQueued(Push(undefined));
  }
  private $p_setQuery(query: string): void {
    if (this.$p_query === query) {
      return;
    }
    this.$p_query = query;
    this.$p_updateSearchPatterns(false);
  }
  private $p_setConfig(config: SingleParagraphPlainTextSearchControlConfig): void {
    if (areConfigsEqual(this.$p_config, config)) {
      return;
    }
    this.$p_config = config;
    this.$p_updateSearchPatterns(true);
  }
  private $p_updateSearchPatterns(didConfigChange: boolean | null): void {
    const newSearchPatterns: SearchPatternData[] = [];
    if (this.$p_config.$m_searchQueryWordsIndividually) {
      const segments = this.$p_wordSegmenter.segment(this.$p_query);
      const queryPatterns = new Set<string>();
      for (const segment of segments) {
        if (!segment.isWordLike) {
          continue;
        }
        const pattern = normalizeQuery(segment.segment, this.$p_config, this.$p_graphemeSegmenter);
        queryPatterns.add(pattern);
      }
      for (const pattern of queryPatterns) {
        const kmpLpsArray = computeLpsArray(pattern);
        newSearchPatterns.push({ $m_pattern: pattern, $m_kmpLpsArray: kmpLpsArray });
      }
    } else if (this.$p_query.length > 0) {
      const pattern = normalizeQuery(this.$p_query, this.$p_config, this.$p_graphemeSegmenter);
      if (pattern.length > 0) {
        const kmpLpsArray = computeLpsArray(pattern);
        newSearchPatterns.push({ $m_pattern: pattern, $m_kmpLpsArray: kmpLpsArray });
      }
    }
    if (didConfigChange === null) {
      this.$p_searchPatterns = newSearchPatterns;
      return;
    }
    if (
      !didConfigChange &&
      this.$p_searchPatterns.length === newSearchPatterns.length &&
      this.$p_searchPatterns.every((searchPattern, i) => {
        const newSearchPattern = newSearchPatterns[i];
        return searchPattern.$m_pattern === newSearchPattern.$m_pattern;
      })
    ) {
      return;
    }
    this.$p_searchPatterns = newSearchPatterns;
    if (didConfigChange) {
      this.$p_processedParagraphCache.clear();
    }
    this.$p_paragraphMatchesCache.clear();
    if (!this.$p_isTrackingAll) {
      return;
    }
    assertIsNotNullish(this.$p_pendingParagraphIds);
    assertIsNotNullish(this.$p_paragraphMatchCounts);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.$p_pendingParagraphIds = new UniqueStringQueue(
      (function* (): IterableIterator<string> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const paragraphIdAndCount of self.$p_paragraphMatchCounts!.$m_iterBetween(0, self.$p_paragraphMatchCounts!.$m_getLength() - 1)) {
          yield paragraphIdAndCount[0];
        }
      })(),
    );
    for (const paragraphIdAndCount of this.$p_paragraphMatchCounts.$m_iterBetween(0, this.$p_paragraphMatchCounts.$m_getLength() - 1)) {
      this.$p_paragraphMatchCounts.$m_setCount(paragraphIdAndCount[0], 0);
    }
    this.$p_pendingParagraphIdsQueued(Push(undefined));
    this.$p_endPendingQueries(Push(undefined));
  }
  get $m_query(): string {
    return this.$p_query;
  }
  set $m_query(query: string) {
    this.$p_setQuery(query);
  }
  get $m_config(): SingleParagraphPlainTextSearchControlConfig {
    return this.$p_config;
  }
  set $m_config(config: SingleParagraphPlainTextSearchControlConfig) {
    this.$p_setConfig(config);
  }
  private $p_processParagraphAtParagraphReference(paragraphReference: matita.BlockReference): ProcessedParagraph {
    const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    const textPartGroups: TextPartGroup[] = [];
    let startOffset = 0;
    const wordBoundaryIndices: number[] | null = this.$p_config.$m_wholeWords ? [] : null;
    let i = 0;
    while (i < paragraph.children.length) {
      const inline = paragraph.children[i];
      if (matita.isVoid(inline)) {
        startOffset += 1;
        i++;
        continue;
      }
      let text = inline.text;
      const textRunStartOffset = startOffset;
      while (++i < paragraph.children.length) {
        const inline = paragraph.children[i];
        if (matita.isVoid(inline)) {
          startOffset += 1;
          i++;
          break;
        }
        text += inline.text;
      }
      const textRunEndOffset = textRunStartOffset + text.length;
      const textPart = makeTextPart(text, textRunStartOffset, textRunEndOffset, false);
      const textPartGroup = normalizeTextPart(textPart, this.$p_config, this.$p_graphemeSegmenter);
      if (textPartGroup.$m_textParts.length > 0) {
        textPartGroups.push(textPartGroup);
      }
      if (this.$p_config.$m_wholeWords) {
        const segments = this.$p_wordSegmenter.segment(text);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        wordBoundaryIndices!.push(startOffset);
        for (const segment of segments) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          wordBoundaryIndices!.push(startOffset + segment.index + segment.segment.length);
        }
      }
    }
    return makeProcessedParagraph(textPartGroups, wordBoundaryIndices);
  }
  private $p_matchTextPartGroupsAtParagraphReference(paragraphReference: matita.BlockReference, processedParagraph: ProcessedParagraph): ParagraphMatch[] {
    const { $m_textPartGroups: textPartGroups, $m_wordBoundaryIndices: wordBoundaryIndices } = processedParagraph;
    if (this.$p_config.$m_wholeWords) {
      assertIsNotNullish(wordBoundaryIndices);
    }
    if (textPartGroups.length === 0) {
      return [];
    }
    const matches: ParagraphMatch[] = [];
    for (let i = 0; i < textPartGroups.length; i++) {
      const textPartGroup = textPartGroups[i];
      const { $m_textParts: textParts, $m_badOffsets: badOffsets } = textPartGroup;
      const firstTextPart = textParts[0];
      let searchStringLength = firstTextPart.$m_text.length;
      for (let j = 1; j < textParts.length; j++) {
        const textPart = textParts[j];
        searchStringLength += textPart.$m_text.length;
      }
      const accessChar = (charIndex: number): string => {
        if (charIndex < firstTextPart.$m_text.length) {
          return firstTextPart.$m_text[charIndex];
        }
        charIndex -= firstTextPart.$m_text.length;
        for (let j = 1; j < textParts.length; j++) {
          const textPart = textParts[j];
          if (charIndex < textPart.$m_text.length) {
            return textPart.$m_text[charIndex];
          }
          charIndex -= textPart.$m_text.length;
        }
        throwUnreachable();
      };
      const mapMatchIndexToParagraphOffset = (matchIndex: number, isEnd: boolean): number => {
        for (let j = 0; j < textParts.length; j++) {
          const textPart = textParts[j];
          if (isEnd || j === textParts.length - 1 ? matchIndex <= textPart.$m_text.length : matchIndex < textPart.$m_text.length) {
            if (textPart.$m_isSingleLongChar && matchIndex > 0) {
              return textPart.$m_endOffset;
            }
            return textPart.$m_startOffset + matchIndex;
          }
          matchIndex -= textPart.$m_text.length;
        }
        throwUnreachable();
      };
      for (let j = 0; j < this.$p_searchPatterns.length; j++) {
        const searchPattern = this.$p_searchPatterns[j];
        const { $m_pattern: pattern, $m_kmpLpsArray: kmpLpsArray } = searchPattern;
        const getShouldRejectMatch = (matchStartIndex: number): boolean => {
          return badOffsets !== null && (badOffsets.has(matchStartIndex) || badOffsets.has(matchStartIndex + pattern.length));
        };
        const matchStartIndices = searchKmp(accessChar, searchStringLength, pattern, kmpLpsArray, getShouldRejectMatch);
        addMatches: for (let k = 0; k < matchStartIndices.length; k++) {
          const matchStartIndex = matchStartIndices[k];
          const matchEndIndex = matchStartIndex + searchPattern.$m_pattern.length;
          const matchStartParagraphOffset = mapMatchIndexToParagraphOffset(matchStartIndex, false);
          if (wordBoundaryIndices && !wordBoundaryIndices.includes(matchStartParagraphOffset)) {
            continue;
          }
          const matchEndParagraphOffset = mapMatchIndexToParagraphOffset(matchEndIndex, true);
          if (wordBoundaryIndices && !wordBoundaryIndices.includes(matchEndParagraphOffset)) {
            continue;
          }
          const newMatch: ParagraphMatch = {
            $m_paragraphReference: paragraphReference,
            $m_startOffset: matchStartParagraphOffset,
            $m_endOffset: matchEndParagraphOffset,
          };
          if (j > 0) {
            for (let l = 0; l < matches.length; l++) {
              const existingMatch = matches[l];
              if (
                (existingMatch.$m_startOffset <= matchStartParagraphOffset && matchStartParagraphOffset < existingMatch.$m_endOffset) ||
                (existingMatch.$m_startOffset < matchEndParagraphOffset && matchEndParagraphOffset <= existingMatch.$m_endOffset)
              ) {
                continue addMatches;
              }
              if (existingMatch.$m_startOffset >= matchEndParagraphOffset) {
                matches.splice(l, 0, newMatch);
                continue addMatches;
              }
            }
          }
          matches.push(newMatch);
        }
      }
    }
    return matches;
  }
  private $p_getMatchesForParagraphAtBlockReference(paragraphReference: matita.BlockReference, updateMatchCount: boolean): ParagraphMatches {
    if (this.$p_searchPatterns.length === 0) {
      return {
        $m_matches: [],
      };
    }
    const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
    const cachedMatches = this.$p_paragraphMatchesCache.get(paragraphId);
    if (cachedMatches) {
      return {
        $m_matches: cachedMatches.$m_matches,
      };
    }
    let processedParagraph: ProcessedParagraph | undefined = this.$p_processedParagraphCache.get(paragraphId);
    if (!processedParagraph) {
      processedParagraph = this.$p_processParagraphAtParagraphReference(paragraphReference);
      this.$p_processedParagraphCache.set(paragraphId, processedParagraph);
    }
    const matches = this.$p_matchTextPartGroupsAtParagraphReference(paragraphReference, processedParagraph);
    this.$p_paragraphMatchesCache.set(paragraphId, {
      $m_matches: matches,
    });
    const paragraphMatches: ParagraphMatches = {
      $m_matches: matches,
    };
    if (updateMatchCount && this.$p_isTrackingAll) {
      assertIsNotNullish(this.$p_paragraphMatchCounts);
      this.$p_paragraphMatchCounts.$m_setCount(paragraphId, matches.length);
    }
    return paragraphMatches;
  }
  $m_getMatchesForParagraphAtBlockReference(paragraphReference: matita.BlockReference): ParagraphMatches {
    return this.$p_getMatchesForParagraphAtBlockReference(paragraphReference, true);
  }
  $m_getIsExactMatch(selectionRange: matita.SelectionRange, match: ParagraphMatch): boolean {
    if (selectionRange.ranges.length > 1) {
      return false;
    }
    const { startPoint, endPoint } = selectionRange.ranges[0];
    return (
      matita.isParagraphPoint(startPoint) &&
      matita.isParagraphPoint(endPoint) &&
      matita.areParagraphPointsAtSameParagraph(startPoint, endPoint) &&
      matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(startPoint), match.$m_paragraphReference) &&
      ((startPoint.offset === match.$m_startOffset && endPoint.offset === match.$m_endOffset) ||
        (startPoint.offset === match.$m_endOffset && endPoint.offset === match.$m_startOffset))
    );
  }
  $m_wrapCurrentOrFindPreviousMatchSync(
    selectionRange: matita.SelectionRange | null,
    strategy: WrapCurrentOrSearchFurtherMatchStrategy,
  ): ParagraphMatch | null {
    if (this.$p_searchPatterns.length === 0) {
      return null;
    }
    let blockReference: matita.BlockReference | null = null;
    if (selectionRange) {
      const firstRange = selectionRange.ranges[0];
      const firstRangeDirection = matita.getRangeDirection(this.$p_stateControl.stateView.document, firstRange);
      if (firstRangeDirection === matita.RangeDirection.NeutralEmptyContent) {
        const nextBlockPoint = matita.accessFirstNextPointToContentAtContentReference(
          this.$p_stateControl.stateView.document,
          firstRange.contentReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(nextBlockPoint === null || matita.isBlockPoint(nextBlockPoint));
        if (nextBlockPoint !== null) {
          blockReference = matita.makeBlockReferenceFromBlockPoint(nextBlockPoint);
        }
      } else {
        const lastPoint = firstRangeDirection === matita.RangeDirection.Backwards ? firstRange.startPoint : firstRange.endPoint;
        const lastPointIndex = matita.getIndexOfBlockAtPointInNonEmptyContentAtContentReference(
          this.$p_stateControl.stateView.document,
          lastPoint,
          firstRange.contentReference,
        );
        const lastBlock = matita.accessBlockAtIndexInContentAtContentReference(
          this.$p_stateControl.stateView.document,
          firstRange.contentReference,
          lastPointIndex,
        );
        blockReference = matita.makeBlockReferenceFromBlock(lastBlock);
        if (matita.isParagraph(lastBlock)) {
          const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
          const endOffset = matita.isParagraphPoint(lastPoint) ? lastPoint.offset : matita.getParagraphLength(lastBlock);
          let matchIndex = -1;
          for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            if (endOffset > match.$m_startOffset) {
              matchIndex = i;
              break;
            }
          }
          if (matchIndex !== -1) {
            const match = matches[matchIndex];
            if (strategy === WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentOrSearchFurther) {
              return match;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (strategy !== WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther) {
              assertUnreachable(strategy);
            }
            const isExactMatch = this.$m_getIsExactMatch(selectionRange, match);
            if (!isExactMatch) {
              return match;
            }
            if (matchIndex > 0) {
              return matches[matchIndex - 1];
            }
          }
        }
      }
    }
    const lastBlockReferenceOnSecondIteration = blockReference;
    if (blockReference !== null) {
      while (true) {
        const previousBlockPoint = matita.accessLastPreviousPointToBlockAtBlockReference(
          this.$p_stateControl.stateView.document,
          blockReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(previousBlockPoint === null || matita.isBlockPoint(previousBlockPoint));
        if (previousBlockPoint === null) {
          break;
        }
        blockReference = matita.makeBlockReferenceFromBlockPoint(previousBlockPoint);
        const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
        if (matita.isEmbed(block)) {
          continue;
        }
        const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
        if (matches.length === 0) {
          continue;
        }
        return matches[matches.length - 1];
      }
    }
    for (const blockReference of matita.iterContentSubBlocksBackwards(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference)) {
      const isLast = lastBlockReferenceOnSecondIteration !== null && matita.areBlockReferencesAtSameBlock(blockReference, lastBlockReferenceOnSecondIteration);
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isEmbed(block)) {
        if (isLast) {
          break;
        }
        continue;
      }
      const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
      if (matches.length === 0) {
        if (isLast) {
          break;
        }
        continue;
      }
      return matches[matches.length - 1];
    }
    return null;
  }
  $m_wrapCurrentOrFindNextMatchSync(selectionRange: matita.SelectionRange | null, strategy: WrapCurrentOrSearchFurtherMatchStrategy): ParagraphMatch | null {
    if (this.$p_searchPatterns.length === 0) {
      return null;
    }
    let blockReference: matita.BlockReference | null = null;
    if (selectionRange) {
      const firstRange = selectionRange.ranges[0];
      const firstRangeDirection = matita.getRangeDirection(this.$p_stateControl.stateView.document, firstRange);
      if (firstRangeDirection === matita.RangeDirection.NeutralEmptyContent) {
        const previousBlockPoint = matita.accessLastPreviousPointToContentAtContentReference(
          this.$p_stateControl.stateView.document,
          firstRange.contentReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(previousBlockPoint === null || matita.isBlockPoint(previousBlockPoint));
        if (previousBlockPoint !== null) {
          blockReference = matita.makeBlockReferenceFromBlockPoint(previousBlockPoint);
        }
      } else {
        const firstPoint = firstRangeDirection === matita.RangeDirection.Backwards ? firstRange.endPoint : firstRange.startPoint;
        const firstPointIndex = matita.isStartOfContentPoint(firstPoint)
          ? 0
          : matita.isEndOfContentPoint(firstPoint)
          ? matita.getNumberOfBlocksInContentAtContentReference(this.$p_stateControl.stateView.document, firstRange.contentReference) - 1
          : matita.getIndexOfBlockInContentFromBlockReference(
              this.$p_stateControl.stateView.document,
              matita.isParagraphPoint(firstPoint)
                ? matita.makeBlockReferenceFromParagraphPoint(firstPoint)
                : matita.makeBlockReferenceFromBlockPoint(firstPoint),
            );
        const firstBlock = matita.accessBlockAtIndexInContentAtContentReference(
          this.$p_stateControl.stateView.document,
          firstRange.contentReference,
          firstPointIndex,
        );
        blockReference = matita.makeBlockReferenceFromBlock(firstBlock);
        if (matita.isParagraph(firstBlock)) {
          const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
          const startOffset = matita.isParagraphPoint(firstPoint) ? firstPoint.offset : 0;
          const matchIndex = matches.findIndex((match) => startOffset < match.$m_endOffset);
          if (matchIndex !== -1) {
            const match = matches[matchIndex];
            if (strategy === WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentOrSearchFurther) {
              return match;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (strategy !== WrapCurrentOrSearchFurtherMatchStrategy.WrapCurrentIfNotExactOrSearchFurther) {
              assertUnreachable(strategy);
            }
            const isExactMatch = this.$m_getIsExactMatch(selectionRange, match);
            if (!isExactMatch) {
              return match;
            }
            if (matchIndex < matches.length - 1) {
              return matches[matchIndex + 1];
            }
          }
        }
      }
    }
    const lastBlockReferenceOnSecondIteration = blockReference;
    if (blockReference !== null) {
      while (true) {
        const nextBlockPoint = matita.accessFirstNextPointToBlockAtBlockReference(
          this.$p_stateControl.stateView.document,
          blockReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(nextBlockPoint === null || matita.isBlockPoint(nextBlockPoint));
        if (nextBlockPoint === null) {
          break;
        }
        blockReference = matita.makeBlockReferenceFromBlockPoint(nextBlockPoint);
        const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
        if (matita.isEmbed(block)) {
          continue;
        }
        const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
        if (matches.length === 0) {
          continue;
        }
        return matches[0];
      }
    }
    for (const blockReference of matita.iterContentSubBlocks(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference)) {
      const isLast = lastBlockReferenceOnSecondIteration !== null && matita.areBlockReferencesAtSameBlock(blockReference, lastBlockReferenceOnSecondIteration);
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isEmbed(block)) {
        if (isLast) {
          break;
        }
        continue;
      }
      const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
      if (matches.length === 0) {
        if (isLast) {
          break;
        }
        continue;
      }
      return matches[0];
    }
    return null;
  }
  $m_trackAll(): TrackAllControl {
    if (this.$p_isTrackingAll) {
      throw new AlreadyTrackingAllError();
    }
    this.$p_isTrackingAll = true;
    assert(this.$p_pendingParagraphIds === null);
    assert(this.$p_paragraphMatchCounts === null);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.$p_pendingParagraphIds = new UniqueStringQueue(
      (function* (): IterableIterator<string> {
        for (const paragraphReference of matita.iterContentSubParagraphs(self.$p_stateControl.stateView.document, self.$p_topLevelContentReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          yield paragraphId;
        }
      })(),
    );
    this.$p_paragraphMatchCounts = new CountedIndexableUniqueStringList(
      (function* (): IterableIterator<[string, number]> {
        for (const paragraphReference of matita.iterContentSubParagraphs(self.$p_stateControl.stateView.document, self.$p_topLevelContentReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          const cachedMatches = self.$p_paragraphMatchesCache.get(paragraphId);
          if (cachedMatches) {
            yield [paragraphId, cachedMatches.$m_matches.length];
          } else {
            yield [paragraphId, 0];
          }
        }
      })(),
    );
    this.$p_trackChangesAutomatically();
    const disposable = Disposable(() => {
      assertIsNotNullish(this.$p_pendingParagraphIds);
      assertIsNotNullish(this.$p_paragraphMatchCounts);
      this.$p_isTrackingAll = false;
      this.$p_pendingParagraphIds = null;
      this.$p_paragraphMatchCounts = null;
      if (!this.active) {
        return;
      }
      this.$p_trackChangesManually();
    });
    this.add(disposable);
    const recalculateIndex$ = Distributor<undefined>();
    disposable.add(recalculateIndex$);
    let idleCallbackDisposable: Disposable | null = null;
    const ensureWorkQueuedIfNeeded = (): void => {
      assertIsNotNullish(this.$p_pendingParagraphIds);
      if (idleCallbackDisposable !== null || this.$p_pendingParagraphIds.$m_getQueueLength() === 0) {
        return;
      }
      idleCallbackDisposable = Disposable();
      disposable.add(idleCallbackDisposable);
      requestIdleCallbackDisposable((deadline) => {
        idleCallbackDisposable = null;
        performWork(deadline, false);
      }, idleCallbackDisposable);
    };
    const performWork = (deadline: IdleDeadline, isFirstTime: boolean): void => {
      assertIsNotNullish(this.$p_pendingParagraphIds);
      assertIsNotNullish(this.$p_paragraphMatchCounts);
      if (this.$p_searchPatterns.length === 0) {
        if (!isFirstTime) {
          if (!totalMatches$.currentValue.$m_isComplete || totalMatches$.currentValue.$m_totalMatches !== 0) {
            totalMatches$(
              Push({
                $m_isComplete: true,
                $m_totalMatches: 0,
              }),
            );
          }
        }
        return;
      }
      while (deadline.timeRemaining() > 0) {
        const paragraphId = this.$p_pendingParagraphIds.$m_shift();
        if (paragraphId === null) {
          break;
        }
        const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
        const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(paragraphReference, false);
        this.$p_paragraphMatchCounts.$m_setCount(paragraphId, matches.length);
      }
      recalculateIndex$(Push(undefined));
      if (!isFirstTime) {
        const totalMatchesMessage = makeTotalMatchesMessage();
        if (
          totalMatches$.currentValue.$m_totalMatches !== totalMatchesMessage.$m_totalMatches ||
          totalMatches$.currentValue.$m_isComplete !== totalMatchesMessage.$m_isComplete
        ) {
          totalMatches$(Push(totalMatchesMessage));
        }
      }
      ensureWorkQueuedIfNeeded();
    };
    if (this.$p_pendingParagraphIds.$m_getQueueLength() > 0) {
      const startTime = performance.now();
      const deadline: IdleDeadline = {
        didTimeout: false,
        timeRemaining() {
          return Math.max(0, startTime + 10 - performance.now());
        },
      };
      performWork(deadline, true);
    }
    pipe(
      this.$p_pendingParagraphIdsQueued,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        ensureWorkQueuedIfNeeded();
      }, disposable),
    );
    const makeTotalMatchesMessage = (): TotalMatchesMessage => {
      assertIsNotNullish(this.$p_pendingParagraphIds);
      assertIsNotNullish(this.$p_paragraphMatchCounts);
      if (this.$p_searchPatterns.length === 0) {
        return {
          $m_isComplete: true,
          $m_totalMatches: 0,
        };
      }
      const totalMatches = this.$p_paragraphMatchCounts.$m_getTotalCount();
      return {
        $m_isComplete: this.$p_pendingParagraphIds.$m_getQueueLength() === 0,
        $m_totalMatches: totalMatches,
      };
    };
    const totalMatches$ = CurrentValueDistributor<TotalMatchesMessage>(makeTotalMatchesMessage());
    let isFindingNextMatch = false;
    const trackAllControlBase: TrackAllControlBase = {
      $m_trackTotalMatchesBeforeParagraphAtParagraphReferenceUntilStateOrSearchChange: (paragraphReference, matchDisposable) => {
        assertIsNotNullish(this.$p_paragraphMatchCounts);
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        const totalMatchesBeforeParagraph$ = CurrentValueDistributor<number>(this.$p_paragraphMatchCounts.$m_calculatePrefixSumBefore(paragraphId));
        matchDisposable.add(totalMatchesBeforeParagraph$);
        disposable.add(totalMatchesBeforeParagraph$);
        pipe(
          recalculateIndex$,
          takeUntil(this.$p_endPendingQueries),
          subscribe((event) => {
            if (event.type === ThrowType) {
              throw event.error;
            }
            if (event.type === EndType) {
              return;
            }
            assertIsNotNullish(this.$p_paragraphMatchCounts);
            totalMatchesBeforeParagraph$(Push(this.$p_paragraphMatchCounts.$m_calculatePrefixSumBefore(paragraphId)));
          }, totalMatchesBeforeParagraph$),
        );
        pipe(
          this.$p_endPendingQueries,
          subscribe((event) => {
            assert(event.type === PushType);
            totalMatchesBeforeParagraph$(End);
          }, totalMatchesBeforeParagraph$),
        );
        return totalMatchesBeforeParagraph$;
      },
      // TODO: Don't stop when collaborating.
      $m_wrapCurrentAlwaysOrFindNextMatch: (selectionRange, matchDisposable) => {
        if (isFindingNextMatch) {
          throw new Error('Can only asynchronously compute one match at a time.');
        }
        const match$ = LastValueDistributor<ParagraphMatch | null>();
        if (this.$p_searchPatterns.length === 0) {
          match$(Push(null));
          match$(End);
          return match$;
        }
        matchDisposable.add(match$);
        disposable.add(match$);
        match$.add(
          Disposable(() => {
            isFindingNextMatch = false;
          }),
        );
        let blockReference: matita.BlockReference | null = null;
        if (selectionRange) {
          const firstRange = selectionRange.ranges[0];
          const firstRangeDirection = matita.getRangeDirection(this.$p_stateControl.stateView.document, firstRange);
          if (firstRangeDirection === matita.RangeDirection.NeutralEmptyContent) {
            const previousBlockPoint = matita.accessLastPreviousPointToContentAtContentReference(
              this.$p_stateControl.stateView.document,
              firstRange.contentReference,
              matita.SelectionRangeIntention.Block,
            ) as matita.BlockPoint | null;
            assert(previousBlockPoint === null || matita.isBlockPoint(previousBlockPoint));
            if (previousBlockPoint !== null) {
              blockReference = matita.makeBlockReferenceFromBlockPoint(previousBlockPoint);
            }
          } else {
            const firstPoint = firstRangeDirection === matita.RangeDirection.Backwards ? firstRange.endPoint : firstRange.startPoint;
            const firstPointIndex = matita.isStartOfContentPoint(firstPoint)
              ? 0
              : matita.isEndOfContentPoint(firstPoint)
              ? matita.getNumberOfBlocksInContentAtContentReference(this.$p_stateControl.stateView.document, firstRange.contentReference) - 1
              : matita.getIndexOfBlockInContentFromBlockReference(
                  this.$p_stateControl.stateView.document,
                  matita.isParagraphPoint(firstPoint)
                    ? matita.makeBlockReferenceFromParagraphPoint(firstPoint)
                    : matita.makeBlockReferenceFromBlockPoint(firstPoint),
                );
            const firstBlock = matita.accessBlockAtIndexInContentAtContentReference(
              this.$p_stateControl.stateView.document,
              firstRange.contentReference,
              firstPointIndex,
            );
            blockReference = matita.makeBlockReferenceFromBlock(firstBlock);
            if (matita.isParagraph(firstBlock)) {
              const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
              const startOffset = matita.isParagraphPoint(firstPoint) ? firstPoint.offset : 0;
              const matchIndex = matches.findIndex((match) => startOffset < match.$m_endOffset);
              if (matchIndex !== -1) {
                const match = matches[matchIndex];
                match$(Push(match));
                match$(End);
                return match$;
              }
            }
          }
        }
        const lastBlockReferenceOnSecondIteration = blockReference;
        let blockReferenceIterator: Iterator<matita.BlockReference> | null = null;
        const stepSearch = (): void => {
          if (blockReference !== null) {
            const nextBlockPoint = matita.accessFirstNextPointToBlockAtBlockReference(
              this.$p_stateControl.stateView.document,
              blockReference,
              matita.SelectionRangeIntention.Block,
            ) as matita.BlockPoint | null;
            assert(nextBlockPoint === null || matita.isBlockPoint(nextBlockPoint));
            if (nextBlockPoint === null) {
              blockReference = null;
              return;
            }
            blockReference = matita.makeBlockReferenceFromBlockPoint(nextBlockPoint);
            const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
            if (matita.isEmbed(block)) {
              return;
            }
            const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(blockReference, true);
            if (matches.length === 0) {
              return;
            }
            match$(Push(matches[0]));
            match$(End);
            return;
          }
          if (blockReferenceIterator === null) {
            blockReferenceIterator = matita.iterContentSubBlocks(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference);
          }
          const result = blockReferenceIterator.next();
          if (result.done) {
            match$(Push(null));
            match$(End);
            return;
          }
          const iteratorBlockReference = result.value;
          const isLast =
            lastBlockReferenceOnSecondIteration !== null && matita.areBlockReferencesAtSameBlock(iteratorBlockReference, lastBlockReferenceOnSecondIteration);
          const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, iteratorBlockReference);
          if (matita.isEmbed(block)) {
            if (isLast) {
              match$(Push(null));
              match$(End);
            }
            return;
          }
          const { $m_matches: matches } = this.$p_getMatchesForParagraphAtBlockReference(iteratorBlockReference, true);
          if (matches.length === 0) {
            if (isLast) {
              match$(Push(null));
              match$(End);
            }
            return;
          }
          match$(Push(matches[0]));
          match$(End);
        };
        function performSearchForMatchWork(deadline: IdleDeadline): void {
          while (deadline.timeRemaining() > 0 && match$.active) {
            stepSearch();
          }
          if (match$.active) {
            requestIdleCallbackDisposable(performSearchForMatchWork, match$);
          }
        }
        pipe(
          this.$p_endPendingQueries,
          subscribe((event) => {
            assert(event.type === PushType);
            match$(End);
          }, match$),
        );
        const startTime = performance.now();
        const deadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining() {
            return Math.max(0, startTime + 5 - performance.now());
          },
        };
        performSearchForMatchWork(deadline);
        if (match$.active) {
          requestIdleCallbackDisposable(performSearchForMatchWork, match$);
        }
        return match$;
      },
      $m_totalMatches$: totalMatches$,
    };
    return implDisposableMethods(trackAllControlBase, disposable);
  }
  $m_findAllMatchesSyncLimitedToMaxAmount(maxMatches: number): Map<string, ParagraphMatches> | null {
    if (this.$p_searchPatterns.length === 0) {
      return new Map<string, ParagraphMatches>();
    }
    const paragraphIdToParagraphMatches = new Map<string, ParagraphMatches>();
    let totalMatches = 0;
    for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference)) {
      const paragraphMatches = this.$p_getMatchesForParagraphAtBlockReference(paragraphReference, false);
      if (paragraphMatches.$m_matches.length === 0) {
        continue;
      }
      totalMatches += paragraphMatches.$m_matches.length;
      if (totalMatches > maxMatches) {
        return null;
      }
      const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
      paragraphIdToParagraphMatches.set(paragraphId, paragraphMatches);
    }
    return paragraphIdToParagraphMatches;
  }
}
export {
  SingleParagraphPlainTextSearchControl,
  type SingleParagraphPlainTextSearchControlConfig,
  type ParagraphMatch,
  type ParagraphMatches,
  WrapCurrentOrSearchFurtherMatchStrategy,
  type WrapCurrentOrSearchFurtherMatchResult,
  type TotalMatchesMessage,
  type TrackAllControl,
};
