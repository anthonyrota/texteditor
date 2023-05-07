import { lookup } from 'bcp-47-match';
import { CountedIndexableUniqueStringList } from '../common/CountedIndexableUniqueStringList';
import { IntlSegmenter } from '../common/IntlSegmenter';
import { UniqueStringQueue } from '../common/UniqueStringQueue';
import { assert, throwUnreachable } from '../common/util';
import { Dictionaries } from '../dictionaries';
import { Hunspell, HunspellFactory, loadModule } from '../hunspell';
import { Disposable, DisposableClass } from '../ruscel/disposable';
import { PushType, ThrowType, subscribe, take } from '../ruscel/source';
import { pipe, requestIdleCallbackDisposable } from '../ruscel/util';
import * as matita from '.';
enum LanguageIdentifier {
  EnglishGeneral = 'en',
  EnglishAmerica = 'en-US',
  EnglishBritain = 'en-GB',
  EnglishCanada = 'en-CA',
  EnglishAustralia = 'en-AU',
}
const acceptedLanguageIdentifiers = [
  LanguageIdentifier.EnglishGeneral,
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
  if (matchedTag === LanguageIdentifier.EnglishGeneral || matchedTag === LanguageIdentifier.EnglishAmerica) {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    if (timeZone.includes('Australia')) {
      return LanguageIdentifier.EnglishAustralia;
    }
  }
  assert((acceptedLanguageIdentifiers as string[]).includes(matchedTag));
  return matchedTag as LanguageIdentifier;
}
function loadDictionariesForLanguageIdentifier(languageIdentifier: LanguageIdentifier): Promise<Dictionaries> {
  switch (languageIdentifier) {
    case LanguageIdentifier.EnglishGeneral: {
      return import('../dictionaries/EnglishGeneral');
    }
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
const hunspellFactoryPromise: Promise<HunspellFactory> | null = null;
function loadHunspellAsm(): Promise<HunspellFactory> {
  if (hunspellFactoryPromise !== null) {
    return hunspellFactoryPromise;
  }
  return loadModule();
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
      if (mountedFileInfo.refCount > 1) {
        mountedFileInfo.refCount--;
        return;
      }
      mountedFileInfoMap.delete(fileIdentifier);
      hunspellFactory.unmount(fileIdentifier);
    }),
  );
  return filePath;
}
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
  private $p_spellchecker!: Hunspell;
  private $p_pendingParagraphIds!: UniqueStringQueue;
  private $p_spellingMistakesMap = new Map<string, ParagraphSpellingMistake[]>();
  private $p_spellingMistakesParagraphCounts = new CountedIndexableUniqueStringList([]);
  private $p_wordSegmenter: IntlSegmenter;
  constructor(
    stateControl: matita.StateControl<matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig, matita.NodeConfig>,
    topLevelContentReference: matita.ContentReference,
    dictionaries: Dictionaries,
  ) {
    super();
    this.$p_stateControl = stateControl;
    this.$p_topLevelContentReference = topLevelContentReference;
    this.$p_wordSegmenter = new stateControl.stateControlConfig.IntlSegmenter(undefined, {
      granularity: 'word',
    });
    loadHunspellAsm()
      .then((hunspellFactory) => {
        if (!this.active) {
          return;
        }
        const affFilePath = ensureMounted(hunspellFactory, JSON.stringify([dictionaries.identifier, 'aff']), dictionaries.aff, this);
        const dicFilePath = ensureMounted(hunspellFactory, JSON.stringify([dictionaries.identifier, 'dic']), dictionaries.dic, this);
        this.$p_spellchecker = hunspellFactory.create(affFilePath, dicFilePath);
        this.add(
          Disposable(() => {
            this.$p_spellchecker.dispose();
          }),
        );
        this.$p_pendingParagraphIds = new UniqueStringQueue(this.$p_iterateAllParagraphIds());
        this.$p_queueWorkIfNeeded();
        this.$p_trackChanges();
      })
      .catch((error) => {
        console.error('error loading hunspell asm', error);
      });
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
  private $p_trackChanges(): void {
    pipe(
      this.$p_stateControl.beforeMutationPart$,
      subscribe((event) => {
        if (event.type !== PushType) {
          throwUnreachable();
        }
        const message = event.value;
        for (let i = 0; i < message.viewDelta.changes.length; i++) {
          const change = message.viewDelta.changes[i];
          this.$p_onViewDeltaChange(change);
        }
      }, this),
    );
  }
  private $p_handleBlockReferencesAfterInserted(blockReferences: matita.BlockReference[]): void {
    for (let i = 0; i < blockReferences.length; i++) {
      const blockReference = blockReferences[i];
      const block = matita.accessBlockFromBlockReference(this.$p_stateControl.stateView.document, blockReference);
      if (matita.isParagraph(block)) {
        this.$p_pendingParagraphIds.queue(block.id);
      } else {
        for (const paragraphReference of matita.iterEmbedSubParagraphs(this.$p_stateControl.stateView.document, blockReference)) {
          this.$p_pendingParagraphIds.queue(matita.getBlockIdFromBlockReference(paragraphReference));
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
  private $p_handleContentReferencesAfterInserted(contentReferences: matita.ContentReference[]): void {
    for (let i = 0; i < contentReferences.length; i++) {
      const contentReference = contentReferences[i];
      for (const paragraphReference of matita.iterContentSubParagraphs(this.$p_stateControl.stateView.document, contentReference)) {
        const paragraphId = matita.getBlockIdFromBlockReference(paragraphReference);
        this.$p_pendingParagraphIds.queue(paragraphId);
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
  private $p_onViewDeltaChange(change: matita.ViewDeltaChange): void {
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
              this.$p_handleBlockReferencesAfterInserted(blockReferences);
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
              this.$p_handleBlockReferencesAfterInserted(blockReferences);
            }
          }, this),
        );
        break;
      }
      case matita.ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
        const { blockReference, isParagraphTextUpdated } = change;
        if (isParagraphTextUpdated) {
          const paragraphId = matita.getBlockIdFromBlockReference(blockReference);
          this.$p_pendingParagraphIds.queue(paragraphId);
          this.$p_queueWorkIfNeeded();
        }
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
              this.$p_handleContentReferencesAfterInserted(contentReferences);
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
          paragraphSpellingMistakes.push(...this.$p_findMistakesInTextAtStartOffset(text, textStartOffset));
        }
        text = '';
        textStartOffset += text.length + 1;
        continue;
      }
      text += inlineNode.text;
    }
    if (text.length > 0) {
      paragraphSpellingMistakes.push(...this.$p_findMistakesInTextAtStartOffset(text, textStartOffset));
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
  private *$p_findMistakesInTextAtStartOffset(text: string, textStartOffset: number): IterableIterator<ParagraphSpellingMistake> {
    const segments = this.$p_wordSegmenter.segment(text);
    for (const segmentData of segments) {
      if (!segmentData.isWordLike) {
        continue;
      }
      const paragraphSpellingMistake = this.$p_spellCheckWordAtOffsetInParagraph(segmentData.segment, textStartOffset + segmentData.index);
      if (paragraphSpellingMistake !== null) {
        yield paragraphSpellingMistake;
      }
    }
  }
  private $p_spellCheckWordAtOffsetInParagraph(word: string, offsetInParagraph: number): ParagraphSpellingMistake | null {
    const isCorrect = this.$p_spellchecker.spell(word);
    if (isCorrect) {
      return null;
    }
    return {
      startOffset: offsetInParagraph,
      endOffset: offsetInParagraph + word.length,
    };
  }
}
export { LanguageIdentifier, getDefaultLanguageIdentifier, type Dictionaries, loadDictionariesForLanguageIdentifier, SpellCheckControl };
