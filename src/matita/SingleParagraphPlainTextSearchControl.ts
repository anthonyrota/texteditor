import { CountedIndexableUniqueStringList } from '../common/CountedIndexableUniqueStringList';
import { IntlSegmenter } from '../common/IntlSegmenter';
import { LpsArray, computeLpsArray, searchKmp } from '../common/Kmp';
import { UniqueStringQueue } from '../common/UniqueStringQueue';
import { assert, assertIsNotNullish, assertUnreachable, groupConsecutiveItemsInArray, throwNotImplemented, throwUnreachable } from '../common/util';
import { Disposable, DisposableClass, implDisposableMethods } from '../ruscel/disposable';
import { CurrentValueDistributor, CurrentValueSource, Distributor } from '../ruscel/distributor';
import { isNone, Maybe, None, Some } from '../ruscel/maybe';
import { End, EndType, Push, PushType, subscribe, take, takeUntil, ThrowType } from '../ruscel/source';
import { pipe, requestIdleCallbackDisposable } from '../ruscel/util';
import * as matita from '.';
interface SingleParagraphPlainTextSearchControlConfig {
  ignoreCase: boolean;
  ignoreDiacritics: boolean;
  ignorePunctuation: boolean;
  ignoreVoids: boolean;
  wholeWords: boolean;
  searchQueryWordsIndividually: boolean;
}
function areConfigsEqual(config1: SingleParagraphPlainTextSearchControlConfig, config2: SingleParagraphPlainTextSearchControlConfig): boolean {
  return (
    config1.ignoreCase === config2.ignoreCase &&
    config1.ignoreDiacritics === config2.ignoreDiacritics &&
    config1.ignorePunctuation === config2.ignorePunctuation &&
    config1.ignoreVoids === config2.ignoreVoids &&
    config1.wholeWords === config2.wholeWords &&
    config1.searchQueryWordsIndividually === config2.searchQueryWordsIndividually
  );
}
interface ParagraphMatch {
  paragraphReference: matita.BlockReference;
  startOffset: number;
  endOffset: number;
}
interface ParagraphMatches {
  matches: ParagraphMatch[];
}
enum WrapCurrentOrFindNextMatchStrategy {
  WrapCurrentOrFindNext = 'WrapCurrentOrFindNext',
  WrapCurrentIfNotExactOrFindNext = 'WrapCurrentIfNotExactOrFindNext',
}
interface WrapCurrentOrFindNextMatchResult {
  match: ParagraphMatch;
  matchIndex: number;
}
interface TrackAllControlBase {
  wrapCurrentOrFindNextMatchSync(
    selectionRange: matita.SelectionRange,
    strategy: WrapCurrentOrFindNextMatchStrategy,
  ): CurrentValueSource<WrapCurrentOrFindNextMatchResult> | null;
  totalMatches$: CurrentValueSource<number>;
}
interface TrackAllControl extends TrackAllControlBase, Disposable {}
interface TextPart {
  text: string;
  startOffset: number;
  endOffset: number;
}
interface TextPartGroup {
  textParts: TextPart[];
}
function normalizePunctuation(char: string): string {
  return char.replace(/[^\p{L}\p{N}\s]/gu, '');
}
function normalizeDiacritics(char: string): string {
  return char.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
function normalizeCase(char: string): string {
  return char.toLocaleLowerCase();
}
function normalizeTextPart(textPart: TextPart, config: SingleParagraphPlainTextSearchControlConfig, graphemeSegmenter: IntlSegmenter): TextPart[] {
  const { ignorePunctuation, ignoreDiacritics, ignoreCase } = config;
  if (!ignorePunctuation && !ignoreDiacritics && !ignoreCase) {
    return [textPart];
  }
  const segments = graphemeSegmenter.segment(textPart.text);
  const normalizedTextParts: TextPart[] = [];
  let previousNormalizedEndOffset = -1;
  for (const segment of segments) {
    const segmentOffset = segment.index;
    const char = segment.segment;
    let normalizedChar = char;
    if (ignoreCase) {
      normalizedChar = normalizeCase(normalizedChar);
    }
    if (ignoreDiacritics) {
      normalizedChar = normalizeDiacritics(normalizedChar);
    }
    if (ignorePunctuation) {
      normalizedChar = normalizePunctuation(normalizedChar);
    }
    if (normalizedChar.length === 0) {
      continue;
    }
    const endOffset = segmentOffset + char.length;
    if (previousNormalizedEndOffset === segmentOffset) {
      const previousNormalizedTextPart = normalizedTextParts[normalizedTextParts.length - 1];
      previousNormalizedTextPart.text += normalizedChar;
      previousNormalizedTextPart.endOffset = endOffset;
    } else {
      normalizedTextParts.push({
        text: normalizedChar,
        startOffset: segmentOffset,
        endOffset: endOffset,
      });
    }
    previousNormalizedEndOffset = segmentOffset + normalizedChar.length;
  }
  return normalizedTextParts;
}
function normalizeTextParts(textParts: TextPart[], config: SingleParagraphPlainTextSearchControlConfig, graphemeSegmenter: IntlSegmenter): TextPart[] {
  return textParts.flatMap((textPart) => normalizeTextPart(textPart, config, graphemeSegmenter));
}
function normalizeQuery(query: string, config: SingleParagraphPlainTextSearchControlConfig, graphemeSegmenter: IntlSegmenter): string {
  return normalizeTextPart({ text: query, startOffset: 0, endOffset: query.length }, config, graphemeSegmenter)
    .map((textPart) => textPart.text)
    .join('');
}
function* iterParagraphsInRange(
  document: matita.Document<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
  range: matita.Range,
): IterableIterator<{
  paragraphReference: matita.BlockReference;
  startOffset: number;
  endOffset: number;
  firstParagraphIndex: number;
  lastParagraphIndex: number;
  paragraphIndex: number;
}> {
  const { contentReference, startPoint, endPoint } = range;
  const direction = matita.getRangeDirection(document, range);
  if (direction === matita.RangeDirection.NeutralEmptyContent) {
    return;
  }
  const firstPoint = direction === matita.RangeDirection.Backwards ? endPoint : startPoint;
  const lastPoint = direction === matita.RangeDirection.Backwards ? startPoint : endPoint;
  const firstParagraphIndex = matita.isStartOfContentPoint(firstPoint)
    ? 0
    : matita.isEndOfContentPoint(firstPoint)
    ? matita.getNumberOfBlocksInContentAtContentReference(document, contentReference)
    : matita.getIndexOfBlockInContentFromBlockReference(
        document,
        matita.isParagraphPoint(firstPoint) ? matita.makeBlockReferenceFromParagraphPoint(firstPoint) : matita.makeBlockReferenceFromBlockPoint(firstPoint),
      );
  const lastParagraphIndex = matita.isStartOfContentPoint(lastPoint)
    ? 0
    : matita.isEndOfContentPoint(lastPoint)
    ? matita.getNumberOfBlocksInContentAtContentReference(document, contentReference)
    : matita.getIndexOfBlockInContentFromBlockReference(
        document,
        matita.isParagraphPoint(lastPoint) ? matita.makeBlockReferenceFromParagraphPoint(lastPoint) : matita.makeBlockReferenceFromBlockPoint(lastPoint),
      );
  for (let paragraphIndex = firstParagraphIndex; paragraphIndex <= lastParagraphIndex; paragraphIndex++) {
    const block = matita.accessBlockAtIndexInContentAtContentReference(document, contentReference, paragraphIndex);
    if (matita.isEmbed(block)) {
      continue;
    }
    const paragraphReference = matita.makeBlockReferenceFromBlock(block);
    if (paragraphIndex === firstParagraphIndex) {
      if (matita.isParagraphPoint(firstPoint)) {
        if (paragraphIndex === lastParagraphIndex && matita.isParagraphPoint(lastPoint)) {
          yield { paragraphReference, startOffset: firstPoint.offset, endOffset: lastPoint.offset, firstParagraphIndex, lastParagraphIndex, paragraphIndex };
        }
        yield {
          paragraphReference,
          startOffset: firstPoint.offset,
          endOffset: matita.getParagraphLength(block),
          firstParagraphIndex,
          lastParagraphIndex,
          paragraphIndex,
        };
      }
    } else if (paragraphIndex === lastParagraphIndex && matita.isParagraphPoint(lastPoint)) {
      yield { paragraphReference, startOffset: 0, endOffset: lastPoint.offset, firstParagraphIndex, lastParagraphIndex, paragraphIndex };
    }
    yield { paragraphReference, startOffset: 0, endOffset: matita.getParagraphLength(block), firstParagraphIndex, lastParagraphIndex, paragraphIndex };
  }
}
class AlreadyTrackingAllError extends Error {
  name = 'AlreadyTrackingAllError';
  constructor(options?: ErrorOptions) {
    super('Already tracking all paragraphs.', options);
  }
}
interface SearchPatternData {
  pattern: string;
  kmpLpsArray: LpsArray;
}
// TODO: Match return selection range instead of range, e.g. to exclude voids in middle of match.
class SingleParagraphPlainTextSearchControl extends DisposableClass {
  #stateControl: matita.StateControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>;
  #query: string;
  #config: SingleParagraphPlainTextSearchControlConfig;
  #topLevelContentReference: matita.ContentReference;
  #searchPatterns!: SearchPatternData[];
  #paragraphTextPartGroupCache = new Map<string, TextPartGroup[]>();
  #paragraphMatchesCache = new Map<string, ParagraphMatches>();
  #graphemeSegmenter: IntlSegmenter;
  #wordSegmenter: IntlSegmenter;
  #pendingParagraphIds: UniqueStringQueue | null = null;
  #pendingParagraphIdsQueued: Distributor<undefined>;
  #paragraphMatchCounts: CountedIndexableUniqueStringList | null = null;
  #trackChangesDisposable?: Disposable;
  #isTrackingAll = false;
  #endPendingQueries: Distributor<undefined>;
  constructor(
    stateControl: matita.StateControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    query: string,
    config: SingleParagraphPlainTextSearchControlConfig,
    topLevelContentReference: matita.ContentReference,
  ) {
    super();
    this.#stateControl = stateControl;
    this.#query = query;
    this.#config = config;
    this.#topLevelContentReference = topLevelContentReference;
    this.#graphemeSegmenter = new stateControl.stateControlConfig.IntlSegmenter();
    this.#wordSegmenter = new stateControl.stateControlConfig.IntlSegmenter(undefined, {
      granularity: 'word',
    });
    this.#pendingParagraphIdsQueued = Distributor<undefined>();
    this.#endPendingQueries = Distributor<undefined>();
    this.add(this.#endPendingQueries);
    this.#updateSearchPatterns(null);
    this.#trackChangesManually();
  }
  #trackChangesManually(): void {
    this.#trackChangesDisposable?.dispose();
    this.#trackChangesDisposable = Disposable();
    this.add(this.#trackChangesDisposable);
    pipe(
      this.#stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        this.#endPendingQueries(Push(undefined));
        const message = event.value;
        for (let i = 0; i < message.viewDelta.changes.length; i++) {
          const change = message.viewDelta.changes[i];
          switch (change.type) {
            case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
              const { blockReference } = change;
              if (change.isParagraphTextUpdated) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
              }
              break;
            }
            case matita.ViewDeltaChangeType.BlockRemoved: {
              const { blockReference } = change;
              const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
              if (matita.isParagraph(block)) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
              } else {
                for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.#stateControl.stateView.document, blockReference)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                  this.#paragraphTextPartGroupCache.delete(paragraphId);
                  this.#paragraphMatchesCache.delete(paragraphId);
                }
              }
              break;
            }
            case matita.ViewDeltaChangeType.ContentRemoved: {
              const { contentReference } = change;
              for (const subParagraphReference of matita.iterContentSubParagraphs(this.#stateControl.stateView.document, contentReference)) {
                const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
              }
              break;
            }
          }
        }
      }, this.#trackChangesDisposable),
    );
  }
  #trackChangesAutomatically(): void {
    this.#trackChangesDisposable?.dispose();
    this.#trackChangesDisposable = Disposable();
    this.add(this.#trackChangesDisposable);
    pipe(
      this.#stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        assertIsNotNullish(this.#pendingParagraphIds);
        assertIsNotNullish(this.#paragraphMatchCounts);
        this.#endPendingQueries(Push(undefined));
        const message = event.value;
        for (let i = 0; i < message.viewDelta.changes.length; i++) {
          const change = message.viewDelta.changes[i];
          switch (change.type) {
            case matita.ViewDeltaChangeType.BlockInserted: {
              const { blockReference } = change;
              pipe(
                this.#stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === PushType) {
                    this.#trackBlockAfterInserted(blockReference);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlockMoved: {
              const { blockReference } = change;
              const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
              if (matita.isParagraph(block)) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                const paragraphIndex = this.#paragraphMatchCounts.indexOf(paragraphId);
                this.#paragraphMatchCounts.remove(paragraphIndex, paragraphIndex);
              } else {
                for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.#stateControl.stateView.document, blockReference)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                  const paragraphIndex = this.#paragraphMatchCounts.indexOf(paragraphId);
                  this.#paragraphMatchCounts.remove(paragraphIndex, paragraphIndex);
                }
              }
              pipe(
                this.#stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === PushType) {
                    this.#trackBlockAfterInserted(blockReference);
                  }
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
              const { blockReference } = change;
              if (change.isParagraphTextUpdated) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                this.#pendingParagraphIds.queue(paragraphId);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
                this.#pendingParagraphIdsQueued(Push(undefined));
              }
              break;
            }
            case matita.ViewDeltaChangeType.BlockRemoved: {
              const { blockReference } = change;
              const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
              if (matita.isParagraph(block)) {
                const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
                this.#pendingParagraphIds.dequeue(paragraphId);
                const paragraphIndex = this.#paragraphMatchCounts.indexOf(paragraphId);
                this.#paragraphMatchCounts.remove(paragraphIndex, paragraphIndex);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
              } else {
                for (const subParagraphReference of matita.iterEmbedSubParagraphs(this.#stateControl.stateView.document, blockReference)) {
                  const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                  this.#pendingParagraphIds.dequeue(paragraphId);
                  const paragraphIndex = this.#paragraphMatchCounts.indexOf(paragraphId);
                  this.#paragraphMatchCounts.remove(paragraphIndex, paragraphIndex);
                  this.#paragraphTextPartGroupCache.delete(paragraphId);
                  this.#paragraphMatchesCache.delete(paragraphId);
                }
              }
              break;
            }
            case matita.ViewDeltaChangeType.ContentInserted: {
              const { contentReference } = change;
              pipe(
                this.#stateControl.afterMutationPart$,
                take(1),
                subscribe((event) => {
                  if (event.type === ThrowType) {
                    throw event.error;
                  }
                  if (event.type === EndType) {
                    return;
                  }
                  assertIsNotNullish(this.#pendingParagraphIds);
                  assertIsNotNullish(this.#paragraphMatchCounts);
                  let insertBeforeIndex = 0;
                  let nextBlockReference: matita.BlockReference | null | undefined;
                  let previousBlockReference: matita.BlockReference | null | undefined;
                  let tryNext = true;
                  while (true) {
                    if (tryNext) {
                      let nextPoint: matita.BlockPoint | null;
                      if (nextBlockReference === undefined) {
                        nextPoint = matita.accessFirstNextPointToContentAtContentReference(
                          this.#stateControl.stateView.document,
                          contentReference,
                          matita.SelectionRangeIntention.Block,
                        ) as matita.BlockPoint | null;
                      } else {
                        assertIsNotNullish(nextBlockReference);
                        nextPoint = matita.accessFirstNextPointToBlockAtBlockReference(
                          this.#stateControl.stateView.document,
                          nextBlockReference,
                          matita.SelectionRangeIntention.Block,
                        ) as matita.BlockPoint | null;
                      }
                      assert(nextPoint === null || matita.isBlockPoint(nextPoint));
                      if (nextPoint === null) {
                        if (previousBlockReference === null) {
                          assert(this.#paragraphMatchCounts.getLength() === 0);
                          break;
                        }
                        nextBlockReference = null;
                        tryNext = !tryNext;
                      } else {
                        nextBlockReference = matita.makeBlockReferenceFromBlockPoint(nextPoint);
                        const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, nextBlockReference);
                        if (matita.isParagraph(block)) {
                          insertBeforeIndex = matita.getIndexOfBlockInContentFromBlockReference(this.#stateControl.stateView.document, nextBlockReference);
                          break;
                        }
                        if (previousBlockReference !== null) {
                          tryNext = !tryNext;
                        }
                      }
                    } else {
                      let previousPoint: matita.BlockPoint | null;
                      if (previousBlockReference === undefined) {
                        previousPoint = matita.accessLastPreviousPointToContentAtContentReference(
                          this.#stateControl.stateView.document,
                          contentReference,
                          matita.SelectionRangeIntention.Block,
                        ) as matita.BlockPoint | null;
                      } else {
                        assertIsNotNullish(previousBlockReference);
                        previousPoint = matita.accessLastPreviousPointToBlockAtBlockReference(
                          this.#stateControl.stateView.document,
                          previousBlockReference,
                          matita.SelectionRangeIntention.Block,
                        ) as matita.BlockPoint | null;
                      }
                      assert(previousPoint === null || matita.isBlockPoint(previousPoint));
                      if (previousPoint === null) {
                        if (nextBlockReference === null) {
                          assert(this.#paragraphMatchCounts.getLength() === 0);
                          break;
                        }
                        previousBlockReference = null;
                        tryNext = !tryNext;
                      } else {
                        previousBlockReference = matita.makeBlockReferenceFromBlockPoint(previousPoint);
                        const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, previousBlockReference);
                        if (matita.isParagraph(block)) {
                          insertBeforeIndex =
                            matita.getIndexOfBlockInContentFromBlockReference(this.#stateControl.stateView.document, previousBlockReference) + 1;
                          break;
                        }
                        if (nextBlockReference !== null) {
                          tryNext = !tryNext;
                        }
                      }
                    }
                  }
                  const paragraphIdAndCounts: [string, number][] = [];
                  for (const paragraphReference of matita.iterContentSubParagraphs(this.#stateControl.stateView.document, contentReference)) {
                    const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
                    this.#pendingParagraphIds.queue(paragraphId);
                    paragraphIdAndCounts.push([paragraphId, 0]);
                  }
                  this.#paragraphMatchCounts.insertBefore(insertBeforeIndex, paragraphIdAndCounts);
                  this.#pendingParagraphIdsQueued(Push(undefined));
                }, this),
              );
              break;
            }
            case matita.ViewDeltaChangeType.ContentRemoved: {
              const { contentReference } = change;
              for (const subParagraphReference of matita.iterContentSubParagraphs(this.#stateControl.stateView.document, contentReference)) {
                const paragraphId = matita.getBlockIdFromBlockReference(subParagraphReference);
                this.#pendingParagraphIds.dequeue(paragraphId);
                const paragraphIndex = this.#paragraphMatchCounts.indexOf(paragraphId);
                this.#paragraphMatchCounts.remove(paragraphIndex, paragraphIndex);
                this.#paragraphTextPartGroupCache.delete(paragraphId);
                this.#paragraphMatchesCache.delete(paragraphId);
              }
              break;
            }
          }
        }
      }, this.#trackChangesDisposable),
    );
  }
  #trackBlockAfterInserted(blockReference: matita.BlockReference): void {
    assertIsNotNullish(this.#pendingParagraphIds);
    assertIsNotNullish(this.#paragraphMatchCounts);
    let insertBeforeIndex = 0;
    let nextBlockReference: matita.BlockReference | null = blockReference;
    let previousBlockReference: matita.BlockReference | null = blockReference;
    let tryNext = true;
    while (true) {
      if (tryNext) {
        assertIsNotNullish(nextBlockReference);
        const nextPoint = matita.accessFirstNextPointToBlockAtBlockReference(
          this.#stateControl.stateView.document,
          nextBlockReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(nextPoint === null || matita.isBlockPoint(nextPoint));
        if (nextPoint === null) {
          if (previousBlockReference === null) {
            assert(this.#paragraphMatchCounts.getLength() === 0);
            break;
          }
          nextBlockReference = null;
          tryNext = !tryNext;
        } else {
          nextBlockReference = matita.makeBlockReferenceFromBlockPoint(nextPoint);
          const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, nextBlockReference);
          if (matita.isParagraph(block)) {
            insertBeforeIndex = matita.getIndexOfBlockInContentFromBlockReference(this.#stateControl.stateView.document, nextBlockReference);
            break;
          }
          if (previousBlockReference !== null) {
            tryNext = !tryNext;
          }
        }
      } else {
        assertIsNotNullish(previousBlockReference);
        const previousPoint = matita.accessLastPreviousPointToBlockAtBlockReference(
          this.#stateControl.stateView.document,
          previousBlockReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(previousPoint === null || matita.isBlockPoint(previousPoint));
        if (previousPoint === null) {
          if (nextBlockReference === null) {
            assert(this.#paragraphMatchCounts.getLength() === 0);
            break;
          }
          previousBlockReference = null;
          tryNext = !tryNext;
        } else {
          previousBlockReference = matita.makeBlockReferenceFromBlockPoint(previousPoint);
          const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, previousBlockReference);
          if (matita.isParagraph(block)) {
            insertBeforeIndex = matita.getIndexOfBlockInContentFromBlockReference(this.#stateControl.stateView.document, previousBlockReference) + 1;
            break;
          }
          if (nextBlockReference !== null) {
            tryNext = !tryNext;
          }
        }
      }
    }
    const paragraphIdAndCounts: [string, number][] = [];
    const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
    if (matita.isParagraph(block)) {
      const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
      this.#pendingParagraphIds.queue(paragraphId);
      paragraphIdAndCounts.push([paragraphId, 0]);
    } else {
      for (const paragraphReference of matita.iterEmbedSubParagraphs(this.#stateControl.stateView.document, blockReference)) {
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        this.#pendingParagraphIds.queue(paragraphId);
        paragraphIdAndCounts.push([paragraphId, 0]);
      }
    }
    this.#paragraphMatchCounts.insertBefore(insertBeforeIndex, paragraphIdAndCounts);
    this.#pendingParagraphIdsQueued(Push(undefined));
  }
  #setQuery(query: string): void {
    if (this.#query === query) {
      return;
    }
    this.#query = query;
    this.#updateSearchPatterns(false);
  }
  #setConfig(config: SingleParagraphPlainTextSearchControlConfig): void {
    if (areConfigsEqual(this.#config, config)) {
      return;
    }
    this.#config = config;
    this.#updateSearchPatterns(true);
  }
  #updateSearchPatterns(didConfigChange: boolean | null): void {
    const newSearchPatterns: SearchPatternData[] = [];
    if (this.#config.searchQueryWordsIndividually) {
      const segments = this.#wordSegmenter.segment(this.#query);
      for (const segment of segments) {
        if (!segment.isWordLike) {
          continue;
        }
        const pattern = normalizeQuery(segment.segment, this.#config, this.#graphemeSegmenter);
        if (pattern.length === 0) {
          continue;
        }
        const kmpLpsArray = computeLpsArray(pattern);
        newSearchPatterns.push({ pattern, kmpLpsArray });
      }
    } else if (this.#query.length > 0) {
      const pattern = normalizeQuery(this.#query, this.#config, this.#graphemeSegmenter);
      if (pattern.length > 0) {
        const kmpLpsArray = computeLpsArray(pattern);
        newSearchPatterns.push({ pattern, kmpLpsArray });
      }
    }
    if (didConfigChange === null) {
      this.#searchPatterns = newSearchPatterns;
      return;
    }
    if (
      !didConfigChange &&
      this.#searchPatterns.length === newSearchPatterns.length &&
      this.#searchPatterns.every((searchPattern, i) => {
        const newSearchPattern = newSearchPatterns[i];
        return searchPattern.pattern === newSearchPattern.pattern;
      })
    ) {
      return;
    }
    this.#searchPatterns = newSearchPatterns;
    if (didConfigChange) {
      this.#paragraphTextPartGroupCache.clear();
    }
    this.#paragraphMatchesCache.clear();
    if (!this.#isTrackingAll) {
      return;
    }
    assertIsNotNullish(this.#pendingParagraphIds);
    assertIsNotNullish(this.#paragraphMatchCounts);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.#pendingParagraphIds = new UniqueStringQueue(
      (function* (): IterableIterator<string> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const paragraphIdAndCount of self.#paragraphMatchCounts!.iterBetween(0, self.#paragraphMatchCounts!.getLength() - 1)) {
          yield paragraphIdAndCount[0];
        }
      })(),
    );
    for (const paragraphIdAndCount of this.#paragraphMatchCounts.iterBetween(0, this.#paragraphMatchCounts.getLength() - 1)) {
      this.#paragraphMatchCounts.setCount(paragraphIdAndCount[0], 0);
    }
    this.#pendingParagraphIdsQueued(Push(undefined));
    this.#endPendingQueries(Push(undefined));
  }
  get query(): string {
    return this.#query;
  }
  set query(query: string) {
    this.#setQuery(query);
  }
  get config(): SingleParagraphPlainTextSearchControlConfig {
    return this.#config;
  }
  set config(config: SingleParagraphPlainTextSearchControlConfig) {
    this.#setConfig(config);
  }
  #splitParagraphAtParagraphReferenceIntoTextPartGroups(paragraphReference: matita.BlockReference): TextPartGroup[] {
    const { ignoreVoids } = this.#config;
    const paragraph = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    const textPartGroups: TextPartGroup[] = [];
    if (ignoreVoids) {
      const textParts: TextPart[] = [];
      const inlineGroups = groupConsecutiveItemsInArray(
        paragraph.children,
        (inline) => inline.type,
        (t1, t2) => t1 === t2,
      );
      let startOffset = 0;
      for (let i = 0; i < inlineGroups.length; i++) {
        const inlineGroup = inlineGroups[i];
        if (inlineGroup.groupInfos[0] === matita.NodeType.Void) {
          startOffset += inlineGroup.items.length;
          continue;
        }
        const textNodes = inlineGroup.items as matita.Text<matita.NodeConfig>[];
        let groupText = '';
        for (let j = 0; j < textNodes.length; j++) {
          const textNode = textNodes[j];
          groupText += textNode.text;
        }
        const endOffset = startOffset + groupText.length;
        textParts.push({
          text: groupText,
          startOffset,
          endOffset,
        });
        startOffset = endOffset;
      }
      const normalizedTextParts = normalizeTextParts(textParts, this.#config, this.#graphemeSegmenter);
      if (normalizedTextParts.length > 0) {
        textPartGroups.push({
          textParts: normalizedTextParts,
        });
      }
    } else {
      let startOffset = 0;
      for (let i = 0; i < paragraph.children.length; i++) {
        const inline = paragraph.children[i];
        if (matita.isVoid(inline)) {
          startOffset += 1;
          continue;
        }
        const { text } = inline;
        const endOffset = startOffset + text.length;
        const textPart: TextPart = {
          text,
          startOffset,
          endOffset,
        };
        const textParts: TextPart[] = [textPart];
        if (normalizeTextParts.length > 0) {
          textPartGroups.push({
            textParts: normalizeTextParts(textParts, this.#config, this.#graphemeSegmenter),
          });
        }
        startOffset = endOffset;
      }
    }
    return textPartGroups;
  }
  #matchTextPartGroupsAtParagraphReference(paragraphReference: matita.BlockReference, textPartGroups: TextPartGroup[]): ParagraphMatch[] {
    if (textPartGroups.length === 0) {
      return [];
    }
    const { wholeWords } = this.#config;
    if (wholeWords) {
      throwNotImplemented();
    }
    const matches: ParagraphMatch[] = [];
    for (let i = 0; i < textPartGroups.length; i++) {
      const textPartGroup = textPartGroups[i];
      const { textParts } = textPartGroup;
      const firstTextPart = textParts[0];
      let searchStringLength = firstTextPart.text.length;
      for (let j = 1; j < textParts.length; j++) {
        const textPart = textParts[j];
        searchStringLength += textPart.text.length;
      }
      const accessChar = (charIndex: number): string => {
        if (charIndex < firstTextPart.text.length) {
          return firstTextPart.text[charIndex];
        }
        charIndex -= firstTextPart.text.length;
        for (let j = 1; j < textParts.length; j++) {
          const textPart = textParts[j];
          if (charIndex < textPart.text.length) {
            return textPart.text[charIndex];
          }
          charIndex -= textPart.text.length;
        }
        throwUnreachable();
      };
      const mapMatchIndexToParagraphOffset = (matchIndex: number): number => {
        for (let j = 0; j < textParts.length; j++) {
          const textPart = textParts[j];
          if (matchIndex <= textPart.text.length) {
            return textPart.startOffset + matchIndex;
          }
          matchIndex -= textPart.text.length;
        }
        throwUnreachable();
      };
      for (let j = 0; j < this.#searchPatterns.length; j++) {
        const searchPattern = this.#searchPatterns[j];
        const { pattern, kmpLpsArray } = searchPattern;
        const matchStartIndices = searchKmp(accessChar, searchStringLength, pattern, kmpLpsArray);
        addMatches: for (let k = 0; k < matchStartIndices.length; k++) {
          const matchStartIndex = matchStartIndices[k];
          const matchEndIndex = matchStartIndex + searchPattern.pattern.length;
          const matchStartParagraphOffset = mapMatchIndexToParagraphOffset(matchStartIndex);
          const matchEndParagraphOffset = mapMatchIndexToParagraphOffset(matchEndIndex);
          for (let l = 0; l < matches.length; l++) {
            const existingMatch = matches[l];
            const existingMatchStartOffset = existingMatch.startOffset;
            const existingMatchEndOffset = existingMatch.endOffset;
            if (
              (existingMatchStartOffset < matchStartParagraphOffset && matchStartParagraphOffset < existingMatchEndOffset) ||
              (existingMatchStartOffset < matchEndParagraphOffset && matchEndParagraphOffset < existingMatchEndOffset)
            ) {
              continue addMatches;
            }
          }
          matches.push({
            paragraphReference,
            startOffset: matchStartParagraphOffset,
            endOffset: matchEndParagraphOffset,
          });
        }
      }
    }
    return matches;
  }
  #getMatchesForParagraphAtBlockReference(paragraphReference: matita.BlockReference, trackMatches: boolean): ParagraphMatches {
    if (this.#searchPatterns.length === 0) {
      return {
        matches: [],
      };
    }
    const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
    const cachedMatches = this.#paragraphMatchesCache.get(paragraphId);
    if (cachedMatches) {
      return {
        matches: cachedMatches.matches,
      };
    }
    let textPartGroups: TextPartGroup[] | undefined = this.#paragraphTextPartGroupCache.get(paragraphId);
    if (!textPartGroups) {
      textPartGroups = this.#splitParagraphAtParagraphReferenceIntoTextPartGroups(paragraphReference);
      this.#paragraphTextPartGroupCache.set(paragraphId, textPartGroups);
    }
    const matches = this.#matchTextPartGroupsAtParagraphReference(paragraphReference, textPartGroups);
    this.#paragraphMatchesCache.set(paragraphId, {
      matches,
    });
    const paragraphMatches: ParagraphMatches = {
      matches,
    };
    if (trackMatches && this.#isTrackingAll) {
      assertIsNotNullish(this.#paragraphMatchCounts);
      this.#paragraphMatchCounts.setCount(paragraphId, matches.length);
    }
    return paragraphMatches;
  }
  getMatchesForParagraphAtBlockReference(paragraphReference: matita.BlockReference): ParagraphMatches {
    return this.#getMatchesForParagraphAtBlockReference(paragraphReference, true);
  }
  getIsExactMatch(selectionRange: matita.SelectionRange, match: ParagraphMatch): boolean {
    if (selectionRange.ranges.length > 1) {
      return false;
    }
    const { startPoint, endPoint } = selectionRange.ranges[0];
    return (
      matita.isParagraphPoint(startPoint) &&
      matita.isParagraphPoint(endPoint) &&
      matita.areParagraphPointsAtSameParagraph(startPoint, endPoint) &&
      matita.areBlockReferencesAtSameBlock(matita.makeBlockReferenceFromParagraphPoint(startPoint), match.paragraphReference) &&
      ((startPoint.offset === match.startOffset && endPoint.offset === match.endOffset) ||
        (startPoint.offset === match.endOffset && endPoint.offset === match.startOffset))
    );
  }
  #wrapCurrentOrFindNextMatchWithIndexInParagraphSync(
    selectionRange: matita.SelectionRange,
    strategy: WrapCurrentOrFindNextMatchStrategy,
  ): WrapCurrentOrFindNextMatchResult | null {
    if (this.#searchPatterns.length === 0) {
      return null;
    }
    let foundExactMatchInPreviousParagraph = false;
    const firstRange = selectionRange.ranges[0];
    const firstRangeDirection = matita.getRangeDirection(this.#stateControl.stateView.document, firstRange);
    let blockReference: matita.BlockReference | null = null;
    if (firstRangeDirection === matita.RangeDirection.NeutralEmptyContent) {
      const previousBlockPoint = matita.accessLastPreviousPointToContentAtContentReference(
        this.#stateControl.stateView.document,
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
        ? matita.getNumberOfBlocksInContentAtContentReference(this.#stateControl.stateView.document, firstRange.contentReference) - 1
        : matita.getIndexOfBlockInContentFromBlockReference(
            this.#stateControl.stateView.document,
            matita.isParagraphPoint(firstPoint) ? matita.makeBlockReferenceFromParagraphPoint(firstPoint) : matita.makeBlockReferenceFromBlockPoint(firstPoint),
          );
      const firstBlock = matita.accessBlockAtIndexInContentAtContentReference(
        this.#stateControl.stateView.document,
        firstRange.contentReference,
        firstPointIndex,
      );
      blockReference = matita.makeBlockReferenceFromBlock(firstBlock);
      if (matita.isParagraph(firstBlock)) {
        const { matches } = this.#getMatchesForParagraphAtBlockReference(blockReference, false);
        const startOffset = matita.isParagraphPoint(firstPoint) ? firstPoint.offset : 0;
        const matchIndex = matches.findIndex((match) => startOffset <= match.endOffset);
        if (matchIndex !== -1) {
          const match = matches[matchIndex];
          if (strategy === WrapCurrentOrFindNextMatchStrategy.WrapCurrentOrFindNext) {
            return { match, matchIndex };
          }
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (strategy !== WrapCurrentOrFindNextMatchStrategy.WrapCurrentIfNotExactOrFindNext) {
            assertUnreachable(strategy);
          }
          const isExactMatch = this.getIsExactMatch(selectionRange, match);
          if (!isExactMatch) {
            return { match, matchIndex };
          }
          if (matchIndex === matches.length - 1) {
            foundExactMatchInPreviousParagraph = true;
          } else {
            return { match, matchIndex };
          }
        }
      }
    }
    const lastBlockReferenceOnSecondIteration = blockReference;
    if (blockReference !== null) {
      while (true) {
        const nextBlockPoint = matita.accessFirstNextPointToBlockAtBlockReference(
          this.#stateControl.stateView.document,
          blockReference,
          matita.SelectionRangeIntention.Block,
        ) as matita.BlockPoint | null;
        assert(nextBlockPoint === null || matita.isBlockPoint(nextBlockPoint));
        if (nextBlockPoint === null) {
          break;
        }
        blockReference = matita.makeBlockReferenceFromBlockPoint(nextBlockPoint);
        const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
        if (matita.isEmbed(block)) {
          continue;
        }
        const { matches } = this.#getMatchesForParagraphAtBlockReference(blockReference, false);
        if (matches.length === 0) {
          continue;
        }
        if (foundExactMatchInPreviousParagraph || strategy === WrapCurrentOrFindNextMatchStrategy.WrapCurrentOrFindNext) {
          return { match: matches[0], matchIndex: 0 };
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (strategy !== WrapCurrentOrFindNextMatchStrategy.WrapCurrentIfNotExactOrFindNext) {
          assertUnreachable(strategy);
        }
        const isExactMatch = this.getIsExactMatch(selectionRange, matches[0]);
        if (!isExactMatch) {
          return { match: matches[0], matchIndex: 0 };
        }
        if (matches.length === 1) {
          foundExactMatchInPreviousParagraph = true;
        } else {
          return { match: matches[1], matchIndex: 1 };
        }
      }
    }
    for (const blockReference of matita.iterContentSubBlocks(this.#stateControl.stateView.document, this.#topLevelContentReference)) {
      const isLast = lastBlockReferenceOnSecondIteration !== null && matita.areBlockReferencesAtSameBlock(blockReference, lastBlockReferenceOnSecondIteration);
      const block = matita.accessBlockFromBlockReference(this.#stateControl.stateView.document, blockReference);
      if (matita.isEmbed(block)) {
        if (isLast) {
          break;
        }
        continue;
      }
      const { matches } = this.#getMatchesForParagraphAtBlockReference(blockReference, false);
      if (matches.length === 0) {
        if (isLast) {
          break;
        }
        continue;
      }
      if (foundExactMatchInPreviousParagraph || strategy === WrapCurrentOrFindNextMatchStrategy.WrapCurrentOrFindNext) {
        return { match: matches[0], matchIndex: 0 };
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (strategy !== WrapCurrentOrFindNextMatchStrategy.WrapCurrentIfNotExactOrFindNext) {
        assertUnreachable(strategy);
      }
      const isExactMatch = this.getIsExactMatch(selectionRange, matches[0]);
      if (!isExactMatch) {
        return { match: matches[0], matchIndex: 0 };
      }
      if (matches.length === 1) {
        if (isLast) {
          return { match: matches[0], matchIndex: 0 };
        }
        foundExactMatchInPreviousParagraph = true;
      } else {
        return { match: matches[1], matchIndex: 1 };
      }
    }
    return null;
  }
  wrapCurrentOrFindNextMatchSync(selectionRange: matita.SelectionRange, strategy: WrapCurrentOrFindNextMatchStrategy): ParagraphMatch | null {
    const result = this.#wrapCurrentOrFindNextMatchWithIndexInParagraphSync(selectionRange, strategy);
    if (result === null) {
      return null;
    }
    return result.match;
  }
  trackAll(): TrackAllControl {
    if (this.#isTrackingAll) {
      throw new AlreadyTrackingAllError();
    }
    this.#isTrackingAll = true;
    assert(this.#pendingParagraphIds === null);
    assert(this.#paragraphMatchCounts === null);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.#pendingParagraphIds = new UniqueStringQueue(
      (function* (): IterableIterator<string> {
        for (const paragraphReference of matita.iterContentSubParagraphs(self.#stateControl.stateView.document, self.#topLevelContentReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          yield paragraphId;
        }
      })(),
    );
    this.#paragraphMatchCounts = new CountedIndexableUniqueStringList(
      (function* (): IterableIterator<[string, number]> {
        for (const paragraphReference of matita.iterContentSubParagraphs(self.#stateControl.stateView.document, self.#topLevelContentReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          const cachedMatches = self.#paragraphMatchesCache.get(paragraphId);
          if (cachedMatches) {
            yield [paragraphId, cachedMatches.matches.length];
          } else {
            yield [paragraphId, 0];
          }
        }
      })(),
    );
    this.#trackChangesAutomatically();
    const disposable = Disposable(() => {
      assertIsNotNullish(this.#pendingParagraphIds);
      assertIsNotNullish(this.#paragraphMatchCounts);
      this.#isTrackingAll = false;
      this.#pendingParagraphIds = null;
      this.#paragraphMatchCounts = null;
      if (!this.active) {
        return;
      }
      this.#trackChangesManually();
    });
    this.add(disposable);
    const recalculateIndex$ = Distributor<undefined>();
    disposable.add(recalculateIndex$);
    let idleCallbackDisposable: Disposable | null = null;
    const ensureWorkQueuedIfNeeded = (): void => {
      assertIsNotNullish(this.#pendingParagraphIds);
      if (idleCallbackDisposable !== null || this.#pendingParagraphIds.getQueueLength() === 0) {
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
      assertIsNotNullish(this.#pendingParagraphIds);
      assertIsNotNullish(this.#paragraphMatchCounts);
      if (this.#searchPatterns.length === 0) {
        if (!isFirstTime) {
          if (totalMatches$.currentValue !== 0) {
            totalMatches$(Push(0));
          }
        }
        return;
      }
      while (deadline.timeRemaining() > 0) {
        const paragraphIdMaybe = this.#pendingParagraphIds.shift();
        if (isNone(paragraphIdMaybe)) {
          break;
        }
        const paragraphId = paragraphIdMaybe.value;
        const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
        const { matches } = this.#getMatchesForParagraphAtBlockReference(paragraphReference, false);
        this.#paragraphMatchCounts.setCount(paragraphId, matches.length);
      }
      recalculateIndex$(Push(undefined));
      if (!isFirstTime) {
        const newTotalMatches = this.#paragraphMatchCounts.getTotalCount();
        if (totalMatches$.currentValue !== newTotalMatches) {
          totalMatches$(Push(newTotalMatches));
        }
      }
      ensureWorkQueuedIfNeeded();
    };
    if (this.#pendingParagraphIds.getQueueLength() > 0) {
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
      this.#pendingParagraphIdsQueued,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        ensureWorkQueuedIfNeeded();
      }, disposable),
    );
    const totalMatches$ = CurrentValueDistributor(this.#paragraphMatchCounts.getTotalCount());
    const trackAllControlBase: TrackAllControlBase = {
      wrapCurrentOrFindNextMatchSync: (selectionRange, strategy) => {
        assertIsNotNullish(this.#paragraphMatchCounts);
        const matchWithIndexInParagraph = this.#wrapCurrentOrFindNextMatchWithIndexInParagraphSync(selectionRange, strategy);
        if (matchWithIndexInParagraph === null) {
          return null;
        }
        const { match, matchIndex: matchIndexInParagraph } = matchWithIndexInParagraph;
        const { paragraphReference } = match;
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        const matchWithIndex$ = CurrentValueDistributor<WrapCurrentOrFindNextMatchResult>({
          match,
          matchIndex: this.#paragraphMatchCounts.calculatePrefixSumBefore(paragraphId) + matchIndexInParagraph,
        });
        pipe(
          recalculateIndex$,
          takeUntil(this.#endPendingQueries),
          subscribe((event) => {
            if (event.type !== PushType) {
              throwUnreachable();
            }
            assertIsNotNullish(this.#paragraphMatchCounts);
            matchWithIndex$(
              Push({
                match,
                matchIndex: this.#paragraphMatchCounts.calculatePrefixSumBefore(paragraphId) + matchIndexInParagraph,
              }),
            );
          }, disposable),
        );
        pipe(
          this.#endPendingQueries,
          subscribe((event) => {
            assert(event.type === PushType);
            matchWithIndex$(End);
          }, matchWithIndex$),
        );
        disposable.add(matchWithIndex$);
        return matchWithIndex$;
      },
      totalMatches$,
    };
    return implDisposableMethods(trackAllControlBase, disposable);
  }
  findAllMatchesSyncLimitedToMaxAmount(maxMatches: number): Maybe<Map<string, ParagraphMatches>> {
    if (this.#searchPatterns.length === 0) {
      return Some(new Map<string, ParagraphMatches>());
    }
    const paragraphIdToParagraphMatches = new Map<string, ParagraphMatches>();
    let totalMatches = 0;
    for (const paragraphReference of matita.iterContentSubParagraphs(this.#stateControl.stateView.document, this.#topLevelContentReference)) {
      const paragraphMatches = this.#getMatchesForParagraphAtBlockReference(paragraphReference, false);
      if (paragraphMatches.matches.length === 0) {
        continue;
      }
      totalMatches += paragraphMatches.matches.length;
      if (totalMatches > maxMatches) {
        return None;
      }
      const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
      paragraphIdToParagraphMatches.set(paragraphId, paragraphMatches);
    }
    return Some(paragraphIdToParagraphMatches);
  }
}
export {
  SingleParagraphPlainTextSearchControl,
  type SingleParagraphPlainTextSearchControlConfig,
  type ParagraphMatch,
  type ParagraphMatches,
  WrapCurrentOrFindNextMatchStrategy,
  type WrapCurrentOrFindNextMatchResult,
  type TrackAllControl,
};
