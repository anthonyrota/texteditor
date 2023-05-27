import { lookup } from 'bcp-47-match';
import { CountedIndexableUniqueStringList } from '../common/CountedIndexableUniqueStringList';
import { IntlSegmenter } from '../common/IntlSegmenter';
import { UniqueStringQueue } from '../common/UniqueStringQueue';
import { assert, throwUnreachable } from '../common/util';
import { Dictionaries } from '../dictionaries';
import { Hunspell, HunspellFactory, loadModule } from '../hunspell';
import { Disposable, DisposableClass } from '../ruscel/disposable';
import { Distributor } from '../ruscel/distributor';
import { isNone } from '../ruscel/maybe';
import { End, PushType, ThrowType, subscribe, take } from '../ruscel/source';
import { pipe, requestIdleCallbackDisposable } from '../ruscel/util';
import { nonLatinLettersRegexp } from './nonLatinLettersRegexp';
import * as matita from '.';
enum LanguageIdentifier {
  EnglishAmerica = 'en-US',
  EnglishBritain = 'en-GB',
  EnglishCanada = 'en-CA',
  EnglishAustralia = 'en-AU',
}
const acceptedLanguageIdentifiers = [
  'en',
  LanguageIdentifier.EnglishAmerica,
  LanguageIdentifier.EnglishBritain,
  LanguageIdentifier.EnglishCanada,
  LanguageIdentifier.EnglishAustralia,
];
function getDefaultLanguageIdentifier(): LanguageIdentifier | null {
  const matchedTag = lookup(acceptedLanguageIdentifiers, navigator.languages as string[]);
  if (matchedTag === undefined) {
    return null;
  }
  if (matchedTag === 'en' || matchedTag === LanguageIdentifier.EnglishAmerica) {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    if (timeZone.includes('Australia')) {
      return LanguageIdentifier.EnglishAustralia;
    }
  }
  assert(acceptedLanguageIdentifiers.includes(matchedTag));
  return matchedTag === 'en' ? LanguageIdentifier.EnglishAmerica : (matchedTag as LanguageIdentifier);
}
function loadDictionariesForLanguageIdentifier(languageIdentifier: LanguageIdentifier): Promise<Dictionaries> {
  switch (languageIdentifier) {
    case LanguageIdentifier.EnglishAmerica: {
      return import('../dictionaries/EnglishAmerica');
    }
    case LanguageIdentifier.EnglishBritain: {
      return import('../dictionaries/EnglishBritain');
    }
    case LanguageIdentifier.EnglishCanada: {
      return import('../dictionaries/EnglishCanada');
    }
    case LanguageIdentifier.EnglishAustralia: {
      return import('../dictionaries/EnglishAustralia');
    }
  }
}
interface ParagraphSpellingMistake {
  startOffset: number;
  endOffset: number;
}
const mountedFileInfoMap = new Map<string, { filePath: string; refCount: number }>();
function ensureMounted(hunspellFactory: HunspellFactory, fileIdentifier: string, fileContents: string, disposable: Disposable): string {
  const existingMountedFileInfo = mountedFileInfoMap.get(fileIdentifier);
  if (existingMountedFileInfo !== undefined) {
    existingMountedFileInfo.refCount++;
    return existingMountedFileInfo.filePath;
  }
  const fileContentsBuffer = new TextEncoder().encode(fileContents);
  const filePath = hunspellFactory.mountBuffer(fileContentsBuffer);
  const mountedFileInfo = {
    filePath,
    refCount: 1,
  };
  mountedFileInfoMap.set(fileIdentifier, mountedFileInfo);
  disposable.add(
    Disposable(() => {
      mountedFileInfo.refCount--;
      if (mountedFileInfo.refCount > 0) {
        return;
      }
      mountedFileInfoMap.delete(fileIdentifier);
      hunspellFactory.unmount(fileIdentifier);
    }),
  );
  return filePath;
}
interface TextUpdateRange {
  startOffset: number;
  endOffset: number;
}
enum TextEditUpdateType {
  Composition = 'Composition',
  InsertOrRemove = 'InsertOrRemove',
}
interface TextEditUpdateData {
  updateType: TextEditUpdateType;
  force: boolean;
}
const forceSpellCheckControlTextEditUpdateDataKey = 'forceSpellCheckControlTextEditUpdateKey';
// TODO: Special code spell checking.
class SpellCheckControl extends DisposableClass {
  private $p_stateControl: matita.StateControl<
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig,
    matita.NodeConfig
  >;
  private $p_topLevelContentReference: matita.ContentReference;
  private $p_spellChecker!: Hunspell;
  private $p_pendingParagraphIds!: UniqueStringQueue;
  private $p_insertTextParagraphsIds = new Set<string>();
  private $p_pendingTextEditParagraphTextUpdateRangesMap = new Map<string, TextUpdateRange[]>();
  private $p_spellingMistakesMap = new Map<string, ParagraphSpellingMistake[]>();
  private $p_spellingMistakesParagraphCounts = new CountedIndexableUniqueStringList([]);
  private $p_wordSegmenter: IntlSegmenter;
  private $p_isLoaded = false;
  didLoad$: Distributor<never>;
  constructor(
    stateControl: matita.StateControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    topLevelContentReference: matita.ContentReference,
  ) {
    super();
    this.$p_stateControl = stateControl;
    this.$p_topLevelContentReference = topLevelContentReference;
    this.$p_wordSegmenter = new stateControl.stateControlConfig.IntlSegmenter(undefined, {
      granularity: 'word',
    });
    this.didLoad$ = Distributor<never>();
    this.add(this.didLoad$);
    const languageIdentifier = getDefaultLanguageIdentifier();
    if (languageIdentifier === null) {
      this.dispose();
      return;
    }
    Promise.all([loadDictionariesForLanguageIdentifier(languageIdentifier), loadModule()])
      .then(([dictionaries, hunspellFactory]) => {
        this.$p_isLoaded = true;
        const affFilePath = ensureMounted(hunspellFactory, JSON.stringify([dictionaries.identifier, 'aff']), dictionaries.aff, this);
        const dicFilePath = ensureMounted(hunspellFactory, JSON.stringify([dictionaries.identifier, 'dic']), dictionaries.dic, this);
        this.$p_spellChecker = hunspellFactory.create(affFilePath, dicFilePath);
        this.add(
          Disposable(() => {
            this.$p_spellChecker.dispose();
          }),
        );
        this.$p_pendingParagraphIds = new UniqueStringQueue(this.$p_iterateAllParagraphIds());
        this.$p_queueWorkIfNeeded();
        this.$p_trackChanges();
        this.didLoad$(End);
      })
      .catch((error) => {
        console.log('error loading spellchecker resources', error);
        this.dispose();
      });
  }
  getIsLoaded(): boolean {
    return this.$p_isLoaded;
  }
  getSpellingMistakesInParagraphAtParagraphReference(paragraphReference: matita.BlockReference): ParagraphSpellingMistake[] | null {
    const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
    if (this.$p_pendingParagraphIds.dequeue(paragraphId)) {
      this.$p_checkParagraph(paragraphId);
    }
    const paragraphSpellingMistakes = this.$p_spellingMistakesMap.get(paragraphId);
    if (paragraphSpellingMistakes === undefined) {
      return null;
    }
    return paragraphSpellingMistakes;
  }
  private $p_getTextEditUpdateDataFromUpdateDataStack(updateDataStack: matita.UpdateData[]): TextEditUpdateData | null {
    for (let i = 0; i < updateDataStack.length; i++) {
      const updateData = updateDataStack[i];
      if (forceSpellCheckControlTextEditUpdateDataKey in updateData) {
        const updateType = updateData[forceSpellCheckControlTextEditUpdateDataKey];
        assert(updateType === TextEditUpdateType.Composition || updateType === TextEditUpdateType.InsertOrRemove);
        return { updateType: updateType as TextEditUpdateType, force: true };
      }
    }
    const updateDataMaybe = matita.getLastWithRedoUndoUpdateDataInUpdateDataStack(updateDataStack);
    if (isNone(updateDataMaybe)) {
      return null;
    }
    const updateData = updateDataMaybe.value;
    if (
      matita.RedoUndoUpdateKey.InsertText in updateData ||
      matita.RedoUndoUpdateKey.RemoveTextForwards in updateData ||
      matita.RedoUndoUpdateKey.RemoveTextBackwards in updateData
    ) {
      return { updateType: TextEditUpdateType.InsertOrRemove, force: false };
    }
    if (matita.RedoUndoUpdateKey.CompositionUpdate in updateData) {
      return { updateType: TextEditUpdateType.Composition, force: false };
    }
    return null;
  }
  private $p_trackChanges(): void {
    let nestedUpdateCount = 0;
    const updateDataList: (TextEditUpdateData | null)[] = [];
    pipe(
      this.$p_stateControl.beforeRunUpdate$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const message = event.value;
        const { updateDataStack } = message;
        const updateData = this.$p_getTextEditUpdateDataFromUpdateDataStack(updateDataStack);
        updateDataList.push(updateData);
        if (++nestedUpdateCount > 1) {
          return;
        }
        for (const paragraphId of this.$p_pendingTextEditParagraphTextUpdateRangesMap.keys()) {
          this.$p_pendingParagraphIds.queue(paragraphId);
        }
        this.$p_pendingTextEditParagraphTextUpdateRangesMap.clear();
      }, this),
    );
    pipe(
      this.$p_stateControl.afterRunUpdate$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        if (--nestedUpdateCount > 0) {
          return;
        }
        const textEditUpdateData = updateDataList.find((updateData): updateData is TextEditUpdateData => updateData !== null);
        updateDataList.length = 0;
        if (textEditUpdateData === undefined) {
          return;
        }
        for (let i = 0; i < this.$p_stateControl.stateView.selection.selectionRanges.length; i++) {
          const selectionRange = this.$p_stateControl.stateView.selection.selectionRanges[i];
          if (selectionRange.ranges.length > 1) {
            continue;
          }
          const range = selectionRange.ranges[0];
          if (
            !matita.isParagraphPoint(range.startPoint) ||
            !matita.isParagraphPoint(range.endPoint) ||
            !matita.areParagraphPointsAtSameParagraph(range.startPoint, range.endPoint) ||
            (textEditUpdateData.updateType === TextEditUpdateType.InsertOrRemove && range.startPoint.offset !== range.endPoint.offset)
          ) {
            continue;
          }
          const paragraphId = matita.getParagraphIdFromParagraphPoint(range.startPoint);
          if (!textEditUpdateData.force && !this.$p_insertTextParagraphsIds.has(paragraphId)) {
            continue;
          }
          const textUpdateRange: TextUpdateRange = {
            startOffset: Math.min(range.startPoint.offset, range.endPoint.offset),
            endOffset: Math.max(range.startPoint.offset, range.endPoint.offset),
          };
          const textUpdateRangesForParagraph = this.$p_pendingTextEditParagraphTextUpdateRangesMap.get(paragraphId);
          if (textUpdateRangesForParagraph === undefined) {
            this.$p_pendingTextEditParagraphTextUpdateRangesMap.set(paragraphId, [textUpdateRange]);
            continue;
          }
          textUpdateRangesForParagraph.push(textUpdateRange);
        }
        this.$p_insertTextParagraphsIds.clear();
      }, this),
    );
    pipe(
      this.$p_stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const message = event.value;
        const { viewDelta, updateDataStack } = message;
        const updateType = this.$p_getTextEditUpdateDataFromUpdateDataStack(updateDataStack);
        const isTextEditUpdate = updateType !== null;
        for (let i = 0; i < viewDelta.changes.length; i++) {
          const change = viewDelta.changes[i];
          this.$p_onViewDeltaChange(change, isTextEditUpdate);
        }
      }, this),
    );
  }
  private $p_queueParagraphWithParagraphId(paragraphId: string, isTextEditUpdate: boolean): void {
    this.$p_pendingParagraphIds.queue(paragraphId);
    if (isTextEditUpdate) {
      this.$p_insertTextParagraphsIds.add(paragraphId);
    }
  }
  private $p_handleBlockReferencesAfterInserted(blockReferences: matita.BlockReference[], isTextEditUpdate: boolean): void {
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isParagraph(block)) {
        this.$p_queueParagraphWithParagraphId(block.id, isTextEditUpdate);
      } else {
        for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
          this.$p_queueParagraphWithParagraphId(matita.getBlockIdFromBlockReference(paragraphReference), isTextEditUpdate);
        }
      }
    }
    this.$p_queueWorkIfNeeded();
  }
  private $p_removeCachedSpellingMistakesOfParagraphWithParagraphId(paragraphId: string): void {
    if (this.$p_spellingMistakesMap.has(paragraphId)) {
      this.$p_spellingMistakesMap.delete(paragraphId);
      const indexToRemove = this.$p_spellingMistakesParagraphCounts.indexOf(paragraphId);
      this.$p_spellingMistakesParagraphCounts.remove(indexToRemove, indexToRemove);
    }
  }
  private $p_removeParagraphWithParagraphId(paragraphId: string): void {
    this.$p_pendingParagraphIds.dequeue(paragraphId);
    this.$p_insertTextParagraphsIds.delete(paragraphId);
    this.$p_removeCachedSpellingMistakesOfParagraphWithParagraphId(paragraphId);
  }
  private $p_handleBlockReferencesBeforeRemoved(blockReferences: matita.BlockReference[]): void {
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isParagraph(block)) {
        this.$p_removeParagraphWithParagraphId(block.id);
      } else {
        for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
          const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
          this.$p_removeParagraphWithParagraphId(paragraphId);
        }
      }
    }
  }
  private $p_handleContentReferencesAfterInserted(contentReferences: matita.ContentReference[], isTextEditUpdate: boolean): void {
    for (let i = 0; i < contentReferences.length; i++) {
      const contentReference = contentReferences[i];
      for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        this.$p_queueParagraphWithParagraphId(paragraphId, isTextEditUpdate);
      }
    }
    this.$p_queueWorkIfNeeded();
  }
  private $p_handleContentReferencesBeforeRemoved(contentReferences: matita.ContentReference[]): void {
    for (let i = 0; i < contentReferences.length; i++) {
      const contentReference = contentReferences[i];
      for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        this.$p_removeParagraphWithParagraphId(paragraphId);
      }
    }
  }
  private $p_onViewDeltaChange(change: matita.ViewDeltaChange, isTextEditUpdate: boolean): void {
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
              this.$p_handleBlockReferencesAfterInserted(blockReferences, isTextEditUpdate);
            }
          }, this),
        );
        break;
      }
      case matita.ViewDeltaChangeType.BlocksMoved: {
        const { blockReferences } = change;
        this.$p_handleBlockReferencesBeforeRemoved(blockReferences);
        pipe(
          this.$p_stateControl.afterMutationPart$,
          take(1),
          subscribe((event) => {
            if (event.type === ThrowType) {
              throw event.error;
            }
            if (event.type === PushType) {
              this.$p_handleBlockReferencesAfterInserted(blockReferences, isTextEditUpdate);
            }
          }, this),
        );
        break;
      }
      case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
        const { blockReference, isParagraphTextUpdated } = change;
        if (!isParagraphTextUpdated) {
          return;
        }
        const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
        this.$p_queueParagraphWithParagraphId(paragraphId, isTextEditUpdate);
        this.$p_queueWorkIfNeeded();
        break;
      }
      case matita.ViewDeltaChangeType.BlocksRemoved: {
        const { blockReferences } = change;
        this.$p_handleBlockReferencesBeforeRemoved(blockReferences);
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
            if (event.type === PushType) {
              this.$p_handleContentReferencesAfterInserted(contentReferences, isTextEditUpdate);
            }
          }, this),
        );
        break;
      }
      case matita.ViewDeltaChangeType.ContentsRemoved: {
        const { contentReferences } = change;
        this.$p_handleContentReferencesBeforeRemoved(contentReferences);
      }
    }
  }
  private *$p_iterateAllParagraphIds(): IterableIterator<string> {
    for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, this.$p_topLevelContentReference)) {
      yield matita.getBlockIdFromBlockReference(paragraphReference);
    }
  }
  private $p_workDisposable: Disposable | null = null;
  private $p_queueWorkIfNeeded(): void {
    if (this.$p_pendingParagraphIds.getQueueLength() > 0) {
      if (this.$p_workDisposable === null) {
        this.$p_workDisposable = Disposable();
        this.add(this.$p_workDisposable);
        requestIdleCallbackDisposable(this.$p_performWork, this.$p_workDisposable);
      }
    } else if (this.$p_workDisposable !== null) {
      this.$p_workDisposable.dispose();
    }
  }
  private $p_performWork = (deadline: IdleDeadline): void => {
    this.$p_workDisposable = null;
    let paragraphId: string | null;
    while (deadline.timeRemaining() > 0 && (paragraphId = this.$p_pendingParagraphIds.shift())) {
      this.$p_checkParagraph(paragraphId);
    }
    this.$p_queueWorkIfNeeded();
  };
  private $p_checkParagraph(paragraphId: string): void {
    const pendingTextEditParagraphTextUpdateRanges = this.$p_pendingTextEditParagraphTextUpdateRangesMap.get(paragraphId);
    const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
    const paragraph = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
    matita.assertIsParagraph(paragraph);
    const paragraphSpellingMistakes: ParagraphSpellingMistake[] = [];
    let textStartOffset = 0;
    let text = '';
    for (let i = 0; i < paragraph.children.length; i++) {
      const inlineNode = paragraph.children[i];
      if (matita.isVoid(inlineNode)) {
        if (text.length > 0) {
          paragraphSpellingMistakes.push(...this.$p_findMistakesInTextAtStartOffset(text, textStartOffset, pendingTextEditParagraphTextUpdateRanges));
        }
        text = '';
        textStartOffset += text.length + 1;
        continue;
      }
      text += inlineNode.text;
    }
    if (text.length > 0) {
      paragraphSpellingMistakes.push(...this.$p_findMistakesInTextAtStartOffset(text, textStartOffset, pendingTextEditParagraphTextUpdateRanges));
    }
    if (paragraphSpellingMistakes.length === 0) {
      this.$p_removeCachedSpellingMistakesOfParagraphWithParagraphId(paragraphId);
      return;
    }
    this.$p_spellingMistakesMap.set(paragraphId, paragraphSpellingMistakes);
    if (this.$p_spellingMistakesParagraphCounts.has(paragraphId)) {
      this.$p_spellingMistakesParagraphCounts.setCount(paragraphId, paragraphSpellingMistakes.length);
    } else {
      const paragraphReference = matita.makeBlockReferenceFromBlockId(paragraphId);
      const paragraphBlockIndices = matita.indexBlockAtBlockReference(this.$p_stateControl.stateView.document, paragraphReference);
      this.$p_spellingMistakesParagraphCounts.insertValueAndCountUsingComparisonFunction(
        paragraphId,
        paragraphSpellingMistakes.length,
        (compareWithParagraphId) => {
          const compareWithParagraphBlockReference = matita.makeBlockReferenceFromBlockId(compareWithParagraphId);
          const compareWithBlockIndices = matita.indexBlockAtBlockReference(this.$p_stateControl.stateView.document, compareWithParagraphBlockReference);
          return matita.compareBlockIndicesForUniqueParagraphsAtBlockReferences(paragraphBlockIndices, compareWithBlockIndices);
        },
      );
    }
  }
  private *$p_findMistakesInTextAtStartOffset(
    text: string,
    textStartOffset: number,
    pendingTextEditParagraphTextUpdateRanges: TextUpdateRange[] | undefined,
  ): IterableIterator<ParagraphSpellingMistake> {
    const segments = this.$p_wordSegmenter.segment(text);
    const getSpellingMistakeForWordAtIndex = (word: string, index: number): ParagraphSpellingMistake | null => {
      const wordStartParagraphOffset = textStartOffset + index;
      if (pendingTextEditParagraphTextUpdateRanges !== undefined) {
        const wordEndParagraphOffset = wordStartParagraphOffset + word.length;
        for (let i = 0; i < pendingTextEditParagraphTextUpdateRanges.length; i++) {
          const pendingTextEditParagraphTextUpdateRange = pendingTextEditParagraphTextUpdateRanges[i];
          const { startOffset, endOffset } = pendingTextEditParagraphTextUpdateRange;
          if (wordStartParagraphOffset <= endOffset && wordEndParagraphOffset >= startOffset) {
            return null;
          }
        }
      }
      return this.$p_spellCheckWordAtOffsetInParagraph(word, wordStartParagraphOffset);
    };
    for (const segmentData of segments) {
      const { segment, isWordLike } = segmentData;
      const originalIndex = segmentData.index;
      let index = segmentData.index;
      if (!isWordLike) {
        continue;
      }
      let underscoreIndex = segment.indexOf('_');
      while (underscoreIndex !== -1) {
        const indexBeforeUnderscore = originalIndex + underscoreIndex;
        if (indexBeforeUnderscore > index) {
          const paragraphSpellingMistake = getSpellingMistakeForWordAtIndex(text.slice(index, indexBeforeUnderscore), index);
          if (paragraphSpellingMistake !== null) {
            yield paragraphSpellingMistake;
          }
        }
        index = indexBeforeUnderscore + 1;
        underscoreIndex = segment.indexOf('_', underscoreIndex + 1);
      }
      const wordEndIndex = originalIndex + segment.length;
      if (index !== wordEndIndex) {
        const paragraphSpellingMistake = getSpellingMistakeForWordAtIndex(index === originalIndex ? segment : text.slice(index, wordEndIndex), index);
        if (paragraphSpellingMistake !== null) {
          yield paragraphSpellingMistake;
        }
      }
    }
  }
  private $p_spellCheckWordAtOffsetInParagraph(word: string, offsetInParagraph: number): ParagraphSpellingMistake | null {
    if (nonLatinLettersRegexp.test(word.normalize()) || this.$p_spellChecker.spell(word)) {
      return null;
    }
    return {
      startOffset: offsetInParagraph,
      endOffset: offsetInParagraph + word.length,
    };
  }
  suggestMisspelledWord(misspelledWord: string): string[] {
    const suggestions = this.$p_spellChecker.suggest(misspelledWord);
    if (misspelledWord.includes('’') && !misspelledWord.includes("'")) {
      for (let i = 0; i < suggestions.length; i++) {
        suggestions[i] = suggestions[i].replaceAll("'", '’');
      }
    }
    return suggestions;
  }
}
export { SpellCheckControl, forceSpellCheckControlTextEditUpdateDataKey, TextEditUpdateType, type ParagraphSpellingMistake };
