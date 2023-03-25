// TODO: void behavior.
// TODO: collaboration.
// TODO: don't allow accessing nodes directly?
// TODO: make config immutable and out its update operations.
import { v4 as makeUuidV4 } from 'uuid';
import { Disposable, implDisposableMethods } from '../ruscel/disposable';
import { Distributor } from '../ruscel/distributor';
import { End, Push, Source } from '../ruscel/source';
import { requestAnimationFrameDisposable } from '../ruscel/util';
import { assertUnreachable, throwUnreachable, throwNotImplemented, assert, assertIsNotNullish } from '../util';
type JsonPrimitive = undefined | null | string | number | boolean;
type JsonMap = {
  [key: string]: Json;
};
type JsonArray = Array<Json>;
type Json = JsonPrimitive | JsonMap | JsonArray;
function isJsonPrimitive(j: unknown): j is JsonPrimitive {
  if (j === undefined || j === null) {
    return true;
  }
  const jType = typeof j;
  return jType === 'string' || jType === 'number' || jType === 'boolean';
}
function cloneJson<J extends Json>(j: J): J {
  if (isJsonPrimitive(j)) {
    return j;
  }
  if (Array.isArray(j)) {
    return j.map(cloneJson) as J;
  }
  return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, cloneJson(v)])) as J;
}
function areJsonEqual(j1: Json, j2: Json): boolean {
  if (isJsonPrimitive(j1) || isJsonPrimitive(j2)) {
    return j1 === j2;
  }
  if (Array.isArray(j1)) {
    if (!Array.isArray(j2)) {
      return false;
    }
    return j1.every((v, i) => areJsonEqual(v, j2[i]));
  }
  if (Array.isArray(j2)) {
    return false;
  }
  return Object.entries(j1).every(([k, v]) => areJsonEqual(v, j2[k]));
}
interface GroupConsecutiveItemsInArrayGroup<T, GI> {
  groupInfos: GI[];
  items: T[];
}
function groupConsecutiveItemsInArray<T, GI>(
  items: T[],
  getGroup: (item: T) => GI,
  compareGroups: (a: GI, b: GI) => boolean,
): GroupConsecutiveItemsInArrayGroup<T, GI>[] {
  const groups: GroupConsecutiveItemsInArrayGroup<T, GI>[] = [];
  let lastGroupInfo: GI;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const groupInfo = getGroup(item);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (i === 0 || !compareGroups(lastGroupInfo!, groupInfo)) {
      groups.push({ groupInfos: [groupInfo], items: [item] });
    } else {
      const lastGroup = groups[groups.length - 1];
      lastGroup.groupInfos.push(groupInfo);
      lastGroup.items.push(item);
    }
    lastGroupInfo = groupInfo;
  }
  return groups;
}
function groupArray<T, K>(items: T[], getGroupKey: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  items.forEach((item) => {
    const key = getGroupKey(item);
    const groupItems = groups.get(key);
    if (groupItems) {
      groupItems.push(item);
    } else {
      groups.set(key, [item]);
    }
  });
  return groups;
}
function makeArrayWithNumbersFromStartToEndInclusive(start: number, endInclusive: number): number[] {
  const numbers: number[] = [];
  for (let i = start; i <= endInclusive; i++) {
    numbers.push(i);
  }
  return numbers;
}
enum NodeType {
  Document = 'Document',
  Content = 'Content',
  Paragraph = 'Paragraph',
  Embed = 'Embed',
  Text = 'Text',
  Void = 'Void',
}
type AnyNode =
  | Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>
  | Content<NodeConfig>
  | Paragraph<NodeConfig, NodeConfig, NodeConfig>
  | Embed<NodeConfig>
  | Text<NodeConfig>
  | Void<NodeConfig>;
function isDocument(node: AnyNode): node is Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig> {
  return node.type === NodeType.Document;
}
function isContent(node: AnyNode): node is Content<NodeConfig> {
  return node.type === NodeType.Content;
}
function isParagraph(node: AnyNode): node is Paragraph<NodeConfig, NodeConfig, NodeConfig> {
  return node.type === NodeType.Paragraph;
}
function isEmbed(node: AnyNode): node is Embed<NodeConfig> {
  return node.type === NodeType.Embed;
}
function isText(node: AnyNode): node is Text<NodeConfig> {
  return node.type === NodeType.Text;
}
function isVoid(node: AnyNode): node is Void<NodeConfig> {
  return node.type === NodeType.Void;
}
class NodeNotOfTypeError extends Error {
  name = 'NodeNotOfTypeError';
  constructor(public expectedNodeType: NodeType, options?: ErrorOptions) {
    super(`Expected node to be of type ${expectedNodeType}`, options);
  }
}
function assertIsDocument(node: AnyNode): asserts node is Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig> {
  if (!isDocument(node)) {
    throw new NodeNotOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsContent(node: AnyNode): asserts node is Content<NodeConfig> {
  if (!isContent(node)) {
    throw new NodeNotOfTypeError(NodeType.Content, {
      cause: {
        node,
      },
    });
  }
}
function assertIsParagraph(node: AnyNode): asserts node is Paragraph<NodeConfig, NodeConfig, NodeConfig> {
  if (!isParagraph(node)) {
    throw new NodeNotOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsEmbed(node: AnyNode): asserts node is Embed<NodeConfig> {
  if (!isParagraph(node)) {
    throw new NodeNotOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsText(node: AnyNode): asserts node is Text<NodeConfig> {
  if (!isText(node)) {
    throw new NodeNotOfTypeError(NodeType.Text, {
      cause: {
        node,
      },
    });
  }
}
function assertIsVoid(node: AnyNode): asserts node is Void<NodeConfig> {
  if (!isVoid(node)) {
    throw new NodeNotOfTypeError(NodeType.Void, {
      cause: {
        node,
      },
    });
  }
}
class NodeOfTypeError extends Error {
  name = 'NodeOfTypeError';
  constructor(public expectedNotNodeType: NodeType, options?: ErrorOptions) {
    super(`Expected node to not be of type ${expectedNotNodeType}`, options);
  }
}
function assertIsNotDocument(
  node: AnyNode,
): asserts node is Exclude<AnyNode, Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>> {
  if (isDocument(node)) {
    throw new NodeOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsNotContent(node: AnyNode): asserts node is Exclude<AnyNode, Content<NodeConfig>> {
  if (isContent(node)) {
    throw new NodeOfTypeError(NodeType.Content, {
      cause: {
        node,
      },
    });
  }
}
function assertIsNotParagraph(node: AnyNode): asserts node is Exclude<AnyNode, Paragraph<NodeConfig, NodeConfig, NodeConfig>> {
  if (isParagraph(node)) {
    throw new NodeOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsNotEmbed(node: AnyNode): asserts node is Exclude<AnyNode, Embed<NodeConfig>> {
  if (isParagraph(node)) {
    throw new NodeOfTypeError(NodeType.Paragraph, {
      cause: {
        node,
      },
    });
  }
}
function assertIsNotText(node: AnyNode): asserts node is Exclude<AnyNode, Text<NodeConfig>> {
  if (isText(node)) {
    throw new NodeOfTypeError(NodeType.Text, {
      cause: {
        node,
      },
    });
  }
}
function assertIsNotVoid(node: AnyNode): asserts node is Exclude<AnyNode, Void<NodeConfig>> {
  if (isVoid(node)) {
    throw new NodeOfTypeError(NodeType.Void, {
      cause: {
        node,
      },
    });
  }
}
function cloneNodeConfig<Config extends NodeConfig>(config: Config): Config {
  return cloneJson(config);
}
function areNodeConfigsEqual<Config extends NodeConfig>(config1: Config, config2: Config): boolean {
  return areJsonEqual(config1, config2);
}
function cloneParagraph<ParagraphConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
): Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
  return makeParagraph(cloneNodeConfig(paragraph.config), paragraph.children.map(cloneInline), paragraph.id);
}
function cloneEmbed<EmbedConfig extends NodeConfig>(embed: Embed<EmbedConfig>): Embed<EmbedConfig> {
  return makeEmbed(cloneNodeConfig(embed.config), embed.contentReferences.slice(), embed.id);
}
function cloneBlock<ParagraphConfig extends NodeConfig, EmbedConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (isParagraph(block)) {
    return cloneParagraph(block);
  }
  return cloneEmbed(block);
}
function cloneParagraphAndChangeIds<ParagraphConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
): Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
  return makeParagraph(cloneNodeConfig(paragraph.config), paragraph.children.map(cloneInlineAndChangeIds), generateId());
}
function cloneEmbedAndChangeIds<EmbedConfig extends NodeConfig>(embed: Embed<EmbedConfig>): Embed<EmbedConfig> {
  return makeEmbed(cloneNodeConfig(embed.config), embed.contentReferences.slice(), generateId());
}
function cloneBlockAndChangeIds<
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (isParagraph(block)) {
    return cloneParagraphAndChangeIds(block);
  }
  return cloneEmbedAndChangeIds(block);
}
function cloneVoid<VoidConfig extends NodeConfig>(voidNode: Void<VoidConfig>): Void<VoidConfig> {
  return makeVoid(cloneNodeConfig(voidNode.config), voidNode.id);
}
function cloneVoidAndChangeIds<VoidConfig extends NodeConfig>(voidNode: Void<VoidConfig>): Void<VoidConfig> {
  return makeVoid(cloneNodeConfig(voidNode.config), generateId());
}
function cloneInline<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(inline: Inline<TextConfig, VoidConfig>): Inline<TextConfig, VoidConfig> {
  if (isText(inline)) {
    return inline;
  }
  return cloneVoid(inline);
}
function cloneInlineAndChangeIds<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  inline: Inline<TextConfig, VoidConfig>,
): Inline<TextConfig, VoidConfig> {
  if (isText(inline)) {
    return inline;
  }
  return cloneVoidAndChangeIds(inline);
}
function cloneContent<ContentConfig extends NodeConfig>(content: Content<ContentConfig>): Content<ContentConfig> {
  return makeContent(content.config, content.blockReferences.slice(), content.id);
}
function cloneContentAndChangeIds<ContentConfig extends NodeConfig>(content: Content<ContentConfig>): Content<ContentConfig> {
  return makeContent(content.config, content.blockReferences.slice(), generateId());
}
function cloneContentFragmentAndChangeIds<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return makeContentFragment(contentFragment.contentFragmentBlocks.map(cloneContentFragmentBlockAndChangeIds));
}
function cloneContentFragmentBlockAndChangeIds<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragmentBlock: ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (isContentFragmentParagraph(contentFragmentBlock)) {
    return cloneContentFragmentParagraphAndChangeIds(contentFragmentBlock);
  }
  return cloneContentFragmentEmbedAndChangeIds(contentFragmentBlock);
}
function cloneContentFragmentParagraphAndChangeIds<ParagraphConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  contentFragmentParagraph: ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig>,
): ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig> {
  return makeContentFragmentParagraph(cloneParagraphAndChangeIds(contentFragmentParagraph.paragraph));
}
function cloneContentFragmentEmbedAndChangeIds<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragmentEmbed: ContentFragmentEmbed<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): ContentFragmentEmbed<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return makeContentFragmentEmbed(
    cloneEmbedAndChangeIds(contentFragmentEmbed.embed),
    contentFragmentEmbed.nestedContents.map(cloneNestedContentAndChangeIds),
    contentFragmentEmbed.nestedBlocks.map(cloneNestedBlockAndChangeIds),
  );
}
function cloneContentListFragmentAndChangeIds<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return makeContentListFragment(contentListFragment.contentListFragmentContents.map(cloneContentListFragmentContentAndChangeIds));
}
function cloneContentListFragmentContentAndChangeIds<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentListFragmentContent: ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return makeContentListFragmentContent(
    contentListFragmentContent.content,
    contentListFragmentContent.nestedContents.map(cloneNestedContentAndChangeIds),
    contentListFragmentContent.nestedBlocks.map(cloneNestedBlockAndChangeIds),
  );
}
function cloneNestedContentAndChangeIds<ContentConfig extends NodeConfig>(nestedContent: NestedContent<ContentConfig>): NestedContent<ContentConfig> {
  return makeNestedContent(cloneContentAndChangeIds(nestedContent.content), nestedContent.embedReference);
}
function cloneNestedBlockAndChangeIds<
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(nestedBlock: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>): NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return makeNestedBlock(cloneBlockAndChangeIds(nestedBlock.block), nestedBlock.contentReference);
}
type NodeConfig = JsonMap;
interface NodeBase<Type extends NodeType, Config extends NodeConfig> {
  readonly type: Type;
  readonly id: string;
  config: Config;
}
function generateId(): string {
  return makeUuidV4();
}
interface Text<Config extends NodeConfig> {
  readonly type: NodeType.Text;
  readonly config: Config;
  readonly text: string;
}
function makeText<Config extends NodeConfig>(config: Config, text: string): Text<Config> {
  assert(text.length > 0, 'Text node text cannot be empty.');
  return {
    type: NodeType.Text,
    config,
    text,
  };
}
interface Void<Config extends NodeConfig> extends NodeBase<NodeType.Void, Config> {}
function makeVoid<Config extends NodeConfig>(config: Config, id: string): Void<Config> {
  return {
    type: NodeType.Void,
    config,
    id,
  };
}
type Inline<TextConfig extends NodeConfig, VoidConfig extends NodeConfig> = Text<TextConfig> | Void<VoidConfig>;
interface Paragraph<Config extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig> extends NodeBase<NodeType.Paragraph, Config> {
  children: Inline<TextConfig, VoidConfig>[];
}
function makeParagraph<Config extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  config: Config,
  children: Inline<TextConfig, VoidConfig>[],
  id: string,
): Paragraph<Config, TextConfig, VoidConfig> {
  return {
    type: NodeType.Paragraph,
    config,
    children,
    id,
  };
}
function getInlineLength(inline: Inline<NodeConfig, NodeConfig>): number {
  return isVoid(inline) ? 1 : inline.text.length;
}
class InvalidBoundsError extends Error {
  name = 'InvalidBoundsError';
  constructor(options?: ErrorOptions) {
    super('Invalid indices', options);
  }
}
function sliceText<TextConfig extends NodeConfig>(text: Text<TextConfig>, fromIndex: number, toIndex: number): Text<TextConfig> {
  if (fromIndex < 0 || toIndex < fromIndex) {
    throw new InvalidBoundsError({
      cause: { text, fromIndex, toIndex },
    });
  }
  return makeText(cloneNodeConfig(text.config), text.text.slice(fromIndex, toIndex));
}
function* iterateParagraphInlineNodes<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  inlineNodes: Inline<TextConfig, VoidConfig>[],
  fromIndex: number,
  toIndex: number,
): Generator<Inline<TextConfig, VoidConfig>, void> {
  if (fromIndex < 0 || toIndex < fromIndex) {
    throw new InvalidBoundsError({
      cause: { inlineNodes, fromIndex, toIndex },
    });
  }
  if (toIndex === fromIndex) {
    return;
  }
  let end = 0;
  for (let i = 0; i < inlineNodes.length; i++) {
    const inline = inlineNodes[i];
    const start = end;
    end += getInlineLength(inline);
    if (end <= fromIndex) {
      continue;
    }
    if (start >= toIndex) {
      break;
    }
    if (isVoid(inline)) {
      yield inline;
      continue;
    }
    if (fromIndex > start) {
      if (toIndex < end) {
        yield sliceText(inline, fromIndex - start, toIndex - start);
        continue;
      }
      yield sliceText(inline, fromIndex - start, inline.text.length);
      continue;
    }
    if (toIndex < end) {
      yield sliceText(inline, 0, toIndex - start);
      continue;
    }
    yield inline;
  }
}
function sliceParagraphInlineNodes<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  inlineNodes: Inline<TextConfig, VoidConfig>[],
  fromIndex: number,
  toIndex: number,
): Inline<TextConfig, VoidConfig>[] {
  return Array.from(iterateParagraphInlineNodes(inlineNodes, fromIndex, toIndex));
}
function iterateParagraphChildren<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<NodeConfig, TextConfig, VoidConfig>,
  fromIndex: number,
  toIndex: number,
): Generator<Inline<TextConfig, VoidConfig>, void> {
  return iterateParagraphInlineNodes(paragraph.children, fromIndex, toIndex);
}
function sliceParagraphChildren<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<NodeConfig, TextConfig, VoidConfig>,
  fromIndex: number,
  toIndex: number,
): Inline<TextConfig, VoidConfig>[] {
  return sliceParagraphInlineNodes(paragraph.children, fromIndex, toIndex);
}
interface InlineNodeWithStartOffset<TextConfig extends NodeConfig, VoidConfig extends NodeConfig> {
  inline: Inline<TextConfig, VoidConfig>;
  startOffset: number;
}
function* iterateParagraphInlineNodesWholeWithStartOffset<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  inlineNodes: Inline<TextConfig, VoidConfig>[],
  fromIndex: number,
  toIndex: number,
): Generator<InlineNodeWithStartOffset<TextConfig, VoidConfig>, void> {
  if (fromIndex < 0 || toIndex < fromIndex) {
    throw new InvalidBoundsError({
      cause: { inlineNodes, fromIndex, toIndex },
    });
  }
  if (toIndex === fromIndex) {
    return;
  }
  let end = 0;
  for (let i = 0; i < inlineNodes.length; i++) {
    const inline = inlineNodes[i];
    const start = end;
    end += getInlineLength(inline);
    if (end <= fromIndex) {
      continue;
    }
    if (start >= toIndex) {
      break;
    }
    yield { inline, startOffset: start };
  }
}
function getInlineNodeWithStartOffsetBeforeParagraphPoint<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, TextConfig, VoidConfig>,
  paragraphPoint: ParagraphPoint,
): InlineNodeWithStartOffset<TextConfig, VoidConfig> | null {
  if (paragraphPoint.offset === 0) {
    return null;
  }
  const paragraph = accessParagraphFromParagraphPoint(document, paragraphPoint);
  const iterator = iterateParagraphInlineNodesWholeWithStartOffset(paragraph.children, paragraphPoint.offset - 1, paragraphPoint.offset);
  const iteratorResult = iterator.next();
  assertIsNotNullish(iteratorResult.value);
  return iteratorResult.value;
}
function getInlineNodeWithStartOffsetAfterParagraphPoint<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, TextConfig, VoidConfig>,
  paragraphPoint: ParagraphPoint,
): InlineNodeWithStartOffset<TextConfig, VoidConfig> | null {
  const paragraph = accessParagraphFromParagraphPoint(document, paragraphPoint);
  if (paragraphPoint.offset === getParagraphLength(paragraph)) {
    return null;
  }
  const iterator = iterateParagraphInlineNodesWholeWithStartOffset(paragraph.children, paragraphPoint.offset, paragraphPoint.offset + 1);
  const iteratorResult = iterator.next();
  assertIsNotNullish(iteratorResult.value);
  return iteratorResult.value;
}
function mergeTextsWithEqualConfigs<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(inlineNodes: Inline<TextConfig, VoidConfig>[]): void {
  for (let i = 0; i < inlineNodes.length - 1; i++) {
    const current = inlineNodes[i];
    const next = inlineNodes[i + 1];
    if (isText(current) && isText(next) && areNodeConfigsEqual<TextConfig>(current.config, next.config)) {
      inlineNodes.splice(i--, 2, makeText(current.config, current.text + next.text));
    }
  }
}
function spliceParagraphInlineNodes<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  inlineNodes: Inline<TextConfig, VoidConfig>[],
  fromOffset: number,
  removeCount: number,
  insertChildren: Inline<TextConfig, VoidConfig>[],
): Inline<TextConfig, VoidConfig>[] {
  if (fromOffset < 0 || removeCount < 0) {
    throw new InvalidBoundsError();
  }
  const startChildren = sliceParagraphInlineNodes(inlineNodes, 0, fromOffset);
  const endChildren = sliceParagraphInlineNodes(inlineNodes, fromOffset + removeCount, getLengthOfParagraphInlineNodes(inlineNodes));
  const newInlineNodes = ([] as Inline<TextConfig, VoidConfig>[]).concat(startChildren, insertChildren, endChildren);
  mergeTextsWithEqualConfigs(newInlineNodes);
  return newInlineNodes;
}
function spliceParagraphChildren<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<NodeConfig, TextConfig, VoidConfig>,
  fromOffset: number,
  removeCount: number,
  insertChildren: Inline<TextConfig, VoidConfig>[],
): void {
  paragraph.children = spliceParagraphInlineNodes(paragraph.children, fromOffset, removeCount, insertChildren);
}
function getLengthOfParagraphInlineNodes(inlineNodes: Inline<NodeConfig, NodeConfig>[]): number {
  let length = 0;
  inlineNodes.forEach((inline) => {
    length += getInlineLength(inline);
  });
  return length;
}
function getParagraphLength(paragraph: Paragraph<NodeConfig, NodeConfig, NodeConfig>): number {
  return getLengthOfParagraphInlineNodes(paragraph.children);
}
function isParagraphEmpty(paragraph: Paragraph<NodeConfig, NodeConfig, NodeConfig>): boolean {
  return paragraph.children.length === 0;
}
interface Embed<Config extends NodeConfig> extends NodeBase<NodeType.Embed, Config> {
  contentReferences: ContentReference[];
}
function makeEmbed<Config extends NodeConfig>(config: Config, contentReferences: ContentReference[], id: string): Embed<Config> {
  return {
    type: NodeType.Embed,
    config,
    contentReferences,
    id,
  };
}
type Block<ParagraphConfig extends NodeConfig, EmbedConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig> =
  | Paragraph<ParagraphConfig, TextConfig, VoidConfig>
  | Embed<EmbedConfig>;
interface BlockReference {
  readonly blockId: string;
}
function makeBlockReferenceFromBlockId(blockId: string): BlockReference {
  return {
    blockId,
  };
}
function makeBlockReferenceFromBlock(block: Block<NodeConfig, NodeConfig, NodeConfig, NodeConfig>): BlockReference {
  return makeBlockReferenceFromBlockId(block.id);
}
function makeBlockReferenceFromBlockPoint(blockPoint: BlockPoint): BlockReference {
  return blockPoint.blockReference;
}
function makeBlockReferenceFromParagraphPoint(paragraphPoint: ParagraphPoint): BlockReference {
  return paragraphPoint.paragraphBlockReference;
}
function areBlockReferencesAtSameBlock(blockReference1: BlockReference, blockReference2: BlockReference): boolean {
  return blockReference1.blockId === blockReference2.blockId;
}
function getBlockIdFromBlockReference(blockReference: BlockReference): string {
  return blockReference.blockId;
}
function getBlockIdFromBlockPoint(blockPoint: BlockPoint): string {
  return getBlockIdFromBlockReference(makeBlockReferenceFromBlockPoint(blockPoint));
}
function getBlockIdFromParagraphPoint(paragraphPoint: ParagraphPoint): string {
  return getBlockIdFromBlockReference(makeBlockReferenceFromParagraphPoint(paragraphPoint));
}
interface Content<Config extends NodeConfig> extends NodeBase<NodeType.Content, Config> {
  blockReferences: BlockReference[];
}
function makeContent<Config extends NodeConfig>(config: Config, blockReferences: BlockReference[], id: string): Content<Config> {
  return {
    type: NodeType.Content,
    config,
    blockReferences,
    id,
  };
}
interface ContentReference {
  readonly contentId: string;
}
function makeContentReferenceFromContentId(contentId: string): ContentReference {
  return {
    contentId,
  };
}
function makeContentReferenceFromContent(content: Content<NodeConfig>): ContentReference {
  return makeContentReferenceFromContentId(content.id);
}
function areContentReferencesAtSameContent(contentReference1: ContentReference, contentReference2: ContentReference): boolean {
  return contentReference1.contentId === contentReference2.contentId;
}
interface ContentStore<ContentConfig extends NodeConfig> {
  [contentId: string]: {
    content: Content<ContentConfig>;
    embedReference?: BlockReference;
  };
}
interface BlockStore<ParagraphConfig extends NodeConfig, EmbedConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig> {
  [blockId: string]: {
    block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
    contentReference: ContentReference;
  };
}
interface Document<
  Config extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> extends NodeBase<NodeType.Document, Config> {
  contentStore: ContentStore<ContentConfig>;
  blockStore: BlockStore<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeDocument<
  Config extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  config: Config,
  contentStore: ContentStore<ContentConfig>,
  blockStore: BlockStore<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  id: string,
): Document<Config, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: NodeType.Document,
    config,
    contentStore,
    blockStore,
    id,
  };
}
class BlockAlreadyInDocumentError extends Error {
  name = 'BlockAlreadyInDocumentError';
  constructor(options?: ErrorOptions) {
    super('Tried to register a block when a block with the same id is already registered in the document.', options);
  }
}
function registerBlockInDocument<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
): void {
  if (block.id in document.blockStore) {
    throw new BlockAlreadyInDocumentError({
      cause: {
        document,
        block,
      },
    });
  }
  assertContentReferenceIsInContentStore(document, contentReference);
  document.blockStore[block.id] = {
    block,
    contentReference,
  };
}
class ContentAlreadyInDocumentError extends Error {
  name = 'ContentAlreadyInDocumentError';
  constructor(options?: ErrorOptions) {
    super('Tried to register a content when a content with the same id is already registered in the document.', options);
  }
}
function registerContentInDocument<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  content: Content<ContentConfig>,
  embedReference: BlockReference,
): void {
  if (content.id in document.contentStore) {
    throw new ContentAlreadyInDocumentError({
      cause: {
        document,
        content,
      },
    });
  }
  assertIsEmbed(accessBlockFromBlockReference(document, embedReference));
  document.contentStore[content.id] = {
    content,
    embedReference,
  };
}
function unregisterBlockAtBlockReferenceInDocument<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, blockReference: BlockReference): void {
  assertBlockReferenceIsInBlockStore(document, blockReference);
  delete document.blockStore[blockReference.blockId];
}
function unregisterContentAtContentReferenceInDocument<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, contentReference: ContentReference): void {
  assertContentReferenceIsInContentStore(document, contentReference);
  delete document.contentStore[contentReference.contentId];
}
class ContentNotInContentStoreError extends Error {
  name = 'ContentNotInContentStoreError';
  constructor(options?: ErrorOptions) {
    super('Tried to access a content node that is not in the content store.', options);
  }
}
class BlockNotInBlockStoreError extends Error {
  name = 'BlockNotInBlockStoreError';
  constructor(options?: ErrorOptions) {
    super('Tried to access a block node that is not in the block store.', options);
  }
}
function assertContentReferenceIsInContentStore(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
): void {
  if (!(contentReference.contentId in document.contentStore)) {
    throw new ContentNotInContentStoreError({
      cause: {
        document,
        contentReference,
      },
    });
  }
}
function accessContentFromContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
): Content<ContentConfig> {
  assertContentReferenceIsInContentStore(document, contentReference);
  return document.contentStore[contentReference.contentId].content;
}
class ContentReferenceMissingEmbedReferenceError extends Error {
  name = 'ContentReferenceMissingEmbedReferenceError';
  constructor(options?: ErrorOptions) {
    super('Tried to access the parent embed of a nested content, but the embed reference is missing.', options);
  }
}
function isContentAtContentReferenceInEmbed(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
): boolean {
  return !!document.contentStore[contentReference.contentId].embedReference;
}
function accessEmbedFromContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
): Embed<EmbedConfig> {
  assertContentReferenceIsInContentStore(document, contentReference);
  const embedReference = document.contentStore[contentReference.contentId].embedReference;
  if (!embedReference) {
    throw new ContentReferenceMissingEmbedReferenceError({
      cause: {
        document,
        contentReference,
      },
    });
  }
  const embed = accessBlockFromBlockReference(document, embedReference);
  assertIsEmbed(embed);
  return embed;
}
function assertBlockReferenceIsInBlockStore(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  blockReference: BlockReference,
): void {
  if (!(blockReference.blockId in document.blockStore)) {
    throw new BlockNotInBlockStoreError({
      cause: {
        document,
        blockReference,
      },
    });
  }
}
function accessContentFromBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  blockReference: BlockReference,
): Content<ContentConfig> {
  assertBlockReferenceIsInBlockStore(document, blockReference);
  return accessContentFromContentReference(document, document.blockStore[blockReference.blockId].contentReference);
}
function accessBlockFromBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  blockReference: BlockReference,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  assertBlockReferenceIsInBlockStore(document, blockReference);
  return document.blockStore[blockReference.blockId].block;
}
interface NestedContent<ContentConfig extends NodeConfig> {
  content: Content<ContentConfig>;
  embedReference: BlockReference;
}
function makeNestedContent<ContentConfig extends NodeConfig>(content: Content<ContentConfig>, embedReference: BlockReference): NestedContent<ContentConfig> {
  return {
    content,
    embedReference,
  };
}
interface NestedBlock<ParagraphConfig extends NodeConfig, EmbedConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig> {
  block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  contentReference: ContentReference;
}
function makeNestedBlock<ParagraphConfig extends NodeConfig, EmbedConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  block: Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
): NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    block,
    contentReference,
  };
}
enum ContentFragmentBlockType {
  Paragraph,
  Embed,
}
interface ContentFragmentParagraph<ParagraphConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig> {
  type: ContentFragmentBlockType.Paragraph;
  paragraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>;
}
function makeContentFragmentParagraph<ParagraphConfig extends NodeConfig, TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
): ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig> {
  return {
    type: ContentFragmentBlockType.Paragraph,
    paragraph,
  };
}
interface ContentFragmentEmbed<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: ContentFragmentBlockType.Embed;
  embed: Embed<EmbedConfig>;
  nestedContents: NestedContent<ContentConfig>[];
  nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
}
function makeContentFragmentEmbed<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  embed: Embed<EmbedConfig>,
  nestedContents: NestedContent<ContentConfig>[],
  nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
): ContentFragmentEmbed<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: ContentFragmentBlockType.Embed,
    embed,
    nestedContents,
    nestedBlocks,
  };
}
type ContentFragmentBlock<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> =
  | ContentFragmentParagraph<ParagraphConfig, TextConfig, VoidConfig>
  | ContentFragmentEmbed<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
function isContentFragmentParagraph(
  contentFragmentBlock: ContentFragmentBlock<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
): contentFragmentBlock is ContentFragmentParagraph<NodeConfig, NodeConfig, NodeConfig> {
  return contentFragmentBlock.type === ContentFragmentBlockType.Paragraph;
}
function isContentFragmentEmbed(
  contentFragmentBlock: ContentFragmentBlock<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
): contentFragmentBlock is ContentFragmentEmbed<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig> {
  return contentFragmentBlock.type === ContentFragmentBlockType.Embed;
}
function getBlockFromContentFragmentBlock<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragmentBlock: ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return isContentFragmentParagraph(contentFragmentBlock) ? contentFragmentBlock.paragraph : contentFragmentBlock.embed;
}
// Note that this is immutable.
interface ContentFragment<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  contentFragmentBlocks: ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
}
function makeContentFragment<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragmentBlocks: ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
): ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  assert(contentFragmentBlocks.length > 0);
  return {
    contentFragmentBlocks,
  };
}
interface ContentListFragmentContent<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  content: Content<ContentConfig>;
  nestedContents: NestedContent<ContentConfig>[];
  nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
}
function makeContentListFragmentContent<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  content: Content<ContentConfig>,
  nestedContents: NestedContent<ContentConfig>[],
  nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
): ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    content,
    nestedContents,
    nestedBlocks,
  };
}
// Note that this is immutable.
interface ContentListFragment<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  contentListFragmentContents: ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[];
}
function makeContentListFragment<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentListFragmentContents: ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
): ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  assert(contentListFragmentContents.length > 0);
  return {
    contentListFragmentContents,
  };
}
enum PointType {
  Paragraph = 'Paragraph',
  Block = 'Block',
  StartOfContent = 'StartOfContent',
  EndOfContent = 'EndOfContent',
}
interface PointBase<Type extends PointType> {
  readonly type: Type;
}
interface ParagraphPoint extends PointBase<PointType.Paragraph> {
  readonly paragraphBlockReference: BlockReference;
  readonly offset: number;
}
function makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphBlockReference: BlockReference, offset: number): ParagraphPoint {
  assert(offset >= 0, 'Paragraph point offset should not be negative', {
    cause: {
      paragraphBlockReference,
      offset,
    },
  });
  return {
    type: PointType.Paragraph,
    paragraphBlockReference,
    offset,
  };
}
function makeParagraphPointFromParagraphAndOffset(paragraph: Paragraph<NodeConfig, NodeConfig, NodeConfig>, offset: number): ParagraphPoint {
  return makeParagraphPointFromParagraphBlockReferenceAndOffset(makeBlockReferenceFromBlock(paragraph), offset);
}
function changeParagraphPointOffset(paragraphPoint: ParagraphPoint, newOffset: number): ParagraphPoint {
  return makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphPoint.paragraphBlockReference, newOffset);
}
function isBlockReferenceAtBlock(blockReference: BlockReference, block: Block<NodeConfig, NodeConfig, NodeConfig, NodeConfig>): boolean {
  return blockReference.blockId === block.id;
}
function isBlockPointAtBlock(blockPoint: BlockPoint, block: Block<NodeConfig, NodeConfig, NodeConfig, NodeConfig>): boolean {
  return isBlockReferenceAtBlock(makeBlockReferenceFromBlockPoint(blockPoint), block);
}
function isParagraphPointAtParagraph(paragraphPoint: ParagraphPoint, paragraph: Paragraph<NodeConfig, NodeConfig, NodeConfig>): boolean {
  return isBlockPointAtBlock(makeBlockPointFromParagraphPoint(paragraphPoint), paragraph);
}
function areBlockPointsAtSameBlock(blockPoint1: BlockPoint, blockPoint2: BlockPoint): boolean {
  return areBlockReferencesAtSameBlock(makeBlockReferenceFromBlockPoint(blockPoint1), makeBlockReferenceFromBlockPoint(blockPoint2));
}
function areParagraphPointsAtSameParagraph(paragraphPoint1: ParagraphPoint, paragraphPoint2: ParagraphPoint): boolean {
  return areBlockReferencesAtSameBlock(makeBlockReferenceFromParagraphPoint(paragraphPoint1), makeBlockReferenceFromParagraphPoint(paragraphPoint2));
}
function areParagraphPointsAtSameOffsetInSameParagraph(paragraphPoint1: ParagraphPoint, paragraphPoint2: ParagraphPoint): boolean {
  return areParagraphPointsAtSameParagraph(paragraphPoint1, paragraphPoint2) && paragraphPoint1.offset === paragraphPoint2.offset;
}
function arePointsEqual(point1: Point, point2: Point): boolean {
  return isBlockPoint(point1)
    ? isBlockPoint(point2) && areBlockPointsAtSameBlock(point1, point2)
    : isParagraphPoint(point1)
    ? isParagraphPoint(point2) && areParagraphPointsAtSameOffsetInSameParagraph(point1, point2)
    : isStartOfContentPoint(point1)
    ? isStartOfContentPoint(point2)
    : isEndOfContentPoint(point2);
}
function isPointAtBlock(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
  point: Point,
  block: Block<NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
): boolean {
  return matchPointOnType(point, {
    Block(point) {
      return isBlockPointAtBlock(point, block);
    },
    Paragraph(point) {
      return isBlockPointAtBlock(makeBlockPointFromParagraphPoint(point), block);
    },
    StartOfContent(_point) {
      return (
        !isContentAtContentReferenceEmpty(document, contentReference) &&
        isBlockReferenceAtBlock(makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)), block)
      );
    },
    EndOfContent(_point) {
      return (
        !isContentAtContentReferenceEmpty(document, contentReference) &&
        isBlockReferenceAtBlock(makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)), block)
      );
    },
  });
}
interface BlockPoint extends PointBase<PointType.Block> {
  readonly blockReference: BlockReference;
}
function makeBlockPointFromBlockReference(blockReference: BlockReference): BlockPoint {
  return {
    type: PointType.Block,
    blockReference,
  };
}
function makeBlockPointFromBlock(block: Block<NodeConfig, NodeConfig, NodeConfig, NodeConfig>): BlockPoint {
  return makeBlockPointFromBlockReference(makeBlockReferenceFromBlock(block));
}
function makeBlockPointFromParagraphPoint(paragraphPoint: ParagraphPoint): BlockPoint {
  return {
    type: PointType.Block,
    blockReference: paragraphPoint.paragraphBlockReference,
  };
}
interface StartOfContentPoint extends PointBase<PointType.StartOfContent> {}
function makeStartOfContentPoint(): StartOfContentPoint {
  return {
    type: PointType.StartOfContent,
  };
}
interface EndOfContentPoint extends PointBase<PointType.EndOfContent> {}
function makeEndOfContentPoint(): EndOfContentPoint {
  return {
    type: PointType.EndOfContent,
  };
}
type Point = ParagraphPoint | BlockPoint | StartOfContentPoint | EndOfContentPoint;
function isParagraphPoint(point: Point): point is ParagraphPoint {
  return point.type === PointType.Paragraph;
}
function isBlockPoint(point: Point): point is BlockPoint {
  return point.type === PointType.Block;
}
function isStartOfContentPoint(point: Point): point is StartOfContentPoint {
  return point.type === PointType.StartOfContent;
}
function isEndOfContentPoint(point: Point): point is EndOfContentPoint {
  return point.type === PointType.EndOfContent;
}
class PointNotOfTypeError extends Error {
  name = 'PointNotOfTypeError';
  constructor(public expectedPointType: PointType, options?: ErrorOptions) {
    super(`Expected point to be of type ${expectedPointType}`, options);
  }
}
function assertIsParagraphPoint(point: Point): asserts point is ParagraphPoint {
  if (!isParagraphPoint(point)) {
    throw new PointNotOfTypeError(PointType.Paragraph, {
      cause: {
        point,
      },
    });
  }
}
function assertIsBlockPoint(point: Point): asserts point is BlockPoint {
  if (!isBlockPoint(point)) {
    throw new PointNotOfTypeError(PointType.Block, {
      cause: {
        point,
      },
    });
  }
}
function assertIsStartOfContentPoint(point: Point): asserts point is StartOfContentPoint {
  if (!isStartOfContentPoint(point)) {
    throw new PointNotOfTypeError(PointType.StartOfContent, {
      cause: {
        point,
      },
    });
  }
}
function assertIsEndOfContentPoint(point: Point): asserts point is EndOfContentPoint {
  if (!isEndOfContentPoint(point)) {
    throw new PointNotOfTypeError(PointType.EndOfContent, {
      cause: {
        point,
      },
    });
  }
}
class PointShouldNotBeOfTypeError extends Error {
  name = 'PointShouldNotBeOfTypeError';
  constructor(public expectedNotPointType: PointType, options?: ErrorOptions) {
    super(`Expected point to not be of type ${expectedNotPointType}`, options);
  }
}
function assertIsNotEndOfContentPoint<T extends Point>(point: T): asserts point is Exclude<T, EndOfContentPoint> {
  if (isEndOfContentPoint(point)) {
    throw new PointShouldNotBeOfTypeError(PointType.EndOfContent, {
      cause: {
        point,
      },
    });
  }
}
function assertIsNotParagraphPoint<T extends Point>(point: T): asserts point is Exclude<T, ParagraphPoint> {
  if (isParagraphPoint(point)) {
    throw new PointShouldNotBeOfTypeError(PointType.Paragraph, {
      cause: {
        point,
      },
    });
  }
}
function assertIsNotBlockPoint<T extends Point>(point: T): asserts point is Exclude<T, BlockPoint> {
  if (isBlockPoint(point)) {
    throw new PointShouldNotBeOfTypeError(PointType.Block, {
      cause: {
        point,
      },
    });
  }
}
function assertIsNotStartOfContentPoint<T extends Point>(point: T): asserts point is Exclude<T, StartOfContentPoint> {
  if (isStartOfContentPoint(point)) {
    throw new PointShouldNotBeOfTypeError(PointType.StartOfContent, {
      cause: {
        point,
      },
    });
  }
}
interface MatchPointOnTypeAccessors<T> {
  StartOfContent: (point: StartOfContentPoint) => T;
  EndOfContent: (point: EndOfContentPoint) => T;
  Block: (point: BlockPoint) => T;
  Paragraph: (point: ParagraphPoint) => T;
}
function matchPointOnType<T>(point: Point, accessors: MatchPointOnTypeAccessors<T>): T {
  if (isParagraphPoint(point)) {
    return accessors.Paragraph(point);
  }
  if (isBlockPoint(point)) {
    return accessors.Block(point);
  }
  if (isStartOfContentPoint(point)) {
    return accessors.StartOfContent(point);
  }
  return accessors.EndOfContent(point);
}
function accessBlockFromBlockPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  blockPoint: BlockPoint,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return accessBlockFromBlockReference(document, blockPoint.blockReference);
}
function accessParagraphFromParagraphPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  paragraphPoint: ParagraphPoint,
): Paragraph<ParagraphConfig, TextConfig, VoidConfig> {
  const block = accessBlockFromBlockReference(document, paragraphPoint.paragraphBlockReference);
  assertIsParagraph(block);
  return block;
}
class BlockNotInContentError extends Error {
  name = 'BlockNotInContentError';
  constructor(options?: ErrorOptions) {
    super('Tried to access a block node that is not in the content.', options);
  }
}
function getNumberOfBlocksInContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, contentReference: ContentReference): number {
  const content = accessContentFromContentReference(document, contentReference);
  return content.blockReferences.length;
}
function isContentAtContentReferenceEmpty<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, contentReference: ContentReference): boolean {
  return getNumberOfBlocksInContentAtContentReference(document, contentReference) === 0;
}
function getIndexOfBlockInContentFromBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, blockReference: BlockReference): number {
  const content = accessContentFromBlockReference(document, blockReference);
  const index = content.blockReferences.findIndex((candidateBlockReference) => areBlockReferencesAtSameBlock(candidateBlockReference, blockReference));
  if (index === -1) {
    throw new BlockNotInContentError({
      cause: {
        document,
        content,
        blockReference,
      },
    });
  }
  return index;
}
function accessBlockAtIndexInContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  index: number,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  const content = accessContentFromContentReference(document, contentReference);
  if (index < 0 || index >= content.blockReferences.length) {
    throw new BlockNotInContentError({
      cause: {
        document,
        contentReference,
        index,
      },
    });
  }
  return accessBlockFromBlockReference(document, content.blockReferences[index]);
}
function accessLastBlockInContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return accessBlockAtIndexInContentAtContentReference(
    document,
    contentReference,
    getNumberOfBlocksInContentAtContentReference(document, contentReference) - 1,
  );
}
function accessPreviousBlockToBlockAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  relativeBlockReference: BlockReference,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return accessBlockAtIndexInContentAtContentReference(
    document,
    makeContentReferenceFromContent(accessContentFromBlockReference(document, relativeBlockReference)),
    getIndexOfBlockInContentFromBlockReference(document, relativeBlockReference) - 1,
  );
}
function accessNextBlockToBlockAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  relativeBlockReference: BlockReference,
): Block<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return accessBlockAtIndexInContentAtContentReference(
    document,
    makeContentReferenceFromContent(accessContentFromBlockReference(document, relativeBlockReference)),
    getIndexOfBlockInContentFromBlockReference(document, relativeBlockReference) + 1,
  );
}
class ContentNotInEmbedError extends Error {
  name = 'ContentNotInEmbedError';
  constructor(options?: ErrorOptions) {
    super('Tried to access content node that is not in the embed.', options);
  }
}
function getNumberOfEmbedContentsInEmbedAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, embedReference: BlockReference): number {
  const embed = accessBlockFromBlockReference(document, embedReference);
  assertIsEmbed(embed);
  return embed.contentReferences.length;
}
function isEmbedAtBlockReferenceEmpty<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, embedReference: BlockReference): boolean {
  return getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference) === 0;
}
function makeListOfAllParentContentReferencesOfContentAtContentReference(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
): ContentReference[] {
  const parentContentReferences: ContentReference[] = [];
  let currentContentReference = contentReference;
  while (isContentAtContentReferenceInEmbed(document, contentReference)) {
    const embedReference = makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, currentContentReference));
    currentContentReference = makeContentReferenceFromContent(accessContentFromBlockReference(document, embedReference));
    parentContentReferences.push(currentContentReference);
  }
  return parentContentReferences;
}
function makeListOfAllParentContentReferencesWithEmbedReferencesOfContentAtContentReference(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
): { contentReference: ContentReference; embedReference: BlockReference }[] {
  const parentContentReferences: { contentReference: ContentReference; embedReference: BlockReference }[] = [];
  let currentContentReference = contentReference;
  while (isContentAtContentReferenceInEmbed(document, contentReference)) {
    const embedReference = makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, currentContentReference));
    currentContentReference = makeContentReferenceFromContent(accessContentFromBlockReference(document, embedReference));
    parentContentReferences.push({ contentReference: currentContentReference, embedReference });
  }
  return parentContentReferences;
}
function getIndexOfEmbedContentFromContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, contentReference: ContentReference): number {
  const embed = accessEmbedFromContentReference(document, contentReference);
  const index = embed.contentReferences.findIndex((candidateContentReference) =>
    areContentReferencesAtSameContent(candidateContentReference, contentReference),
  );
  if (index === -1) {
    throw new ContentNotInEmbedError({
      cause: { document, embed, contentReference },
    });
  }
  return index;
}
function accessContentAtIndexInEmbedAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
  index: number,
): Content<ContentConfig> {
  const embed = accessBlockFromBlockReference(document, embedReference);
  assertIsEmbed(embed);
  if (index < 0 || index >= embed.contentReferences.length) {
    throw new ContentNotInEmbedError({
      cause: {
        document,
        embedReference,
        index,
      },
    });
  }
  return accessContentFromContentReference(document, embed.contentReferences[index]);
}
function accessLastContentInEmbedAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
): Content<ContentConfig> {
  const embed = accessBlockFromBlockReference(document, embedReference);
  assertIsEmbed(embed);
  return accessContentAtIndexInEmbedAtBlockReference(document, embedReference, getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference) - 1);
}
function accessPreviousContentToContentInEmbedAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  relativeContentReference: ContentReference,
): Content<ContentConfig> {
  return accessContentAtIndexInEmbedAtBlockReference(
    document,
    makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, relativeContentReference)),
    getIndexOfEmbedContentFromContentReference(document, relativeContentReference) - 1,
  );
}
function accessNextContentToContentInEmbedAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  relativeContentReference: ContentReference,
): Content<ContentConfig> {
  return accessContentAtIndexInEmbedAtBlockReference(
    document,
    makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, relativeContentReference)),
    getIndexOfEmbedContentFromContentReference(document, relativeContentReference) + 1,
  );
}
function accessLastPointInContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
  blockShallow?: boolean,
): BlockPoint | ParagraphPoint | null {
  if (isContentAtContentReferenceEmpty(document, contentReference)) {
    return null;
  }
  const lastBlock = accessLastBlockInContentAtContentReference(document, contentReference);
  if (isEmbed(lastBlock)) {
    const embedReference = makeBlockReferenceFromBlock(lastBlock);
    return accessLastPointInEmbedAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  if (intention === SelectionRangeIntention.Block) {
    return makeBlockPointFromBlock(lastBlock);
  }
  return makeParagraphPointFromParagraphAndOffset(lastBlock, getParagraphLength(lastBlock));
}
function accessLastPreviousPointToContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
): BlockPoint | ParagraphPoint | null {
  if (!isContentAtContentReferenceInEmbed(document, contentReference)) {
    return null;
  }
  const embedReference = makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, contentReference));
  if (
    areContentReferencesAtSameContent(
      contentReference,
      makeContentReferenceFromContent(accessContentAtIndexInEmbedAtBlockReference(document, embedReference, 0)),
    )
  ) {
    if (intention === SelectionRangeIntention.Block) {
      return makeBlockPointFromBlockReference(embedReference);
    }
    return accessLastPreviousPointToBlockAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  const previousContentReference = makeContentReferenceFromContent(accessPreviousContentToContentInEmbedAtContentReference(document, contentReference));
  return (
    accessLastPointInContentAtContentReference(document, previousContentReference, intention) ??
    accessLastPreviousPointToContentAtContentReference(document, previousContentReference, intention)
  );
}
function accessLastPointInEmbedAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
): BlockPoint | ParagraphPoint | null {
  if (isEmbedAtBlockReferenceEmpty(document, embedReference)) {
    return null;
  }
  const lastContentReference = makeContentReferenceFromContent(accessLastContentInEmbedAtBlockReference(document, embedReference));
  return (
    accessLastPointInContentAtContentReference(document, lastContentReference, intention) ??
    accessLastPreviousPointToContentAtContentReference(document, lastContentReference, intention)
  );
}
function accessLastPreviousPointToBlockAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  blockReference: BlockReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
  blockShallow?: true,
): BlockPoint | ParagraphPoint | null {
  const contentReference = makeContentReferenceFromContent(accessContentFromBlockReference(document, blockReference));
  if (
    areBlockReferencesAtSameBlock(blockReference, makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)))
  ) {
    return accessLastPreviousPointToContentAtContentReference(document, contentReference, intention);
  }
  const previousBlock = accessPreviousBlockToBlockAtBlockReference(document, blockReference);
  if (isEmbed(previousBlock)) {
    if (blockShallow && intention === SelectionRangeIntention.Block) {
      return makeBlockPointFromBlock(previousBlock);
    }
    const embedReference = makeBlockReferenceFromBlock(previousBlock);
    return accessLastPointInEmbedAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  if (intention === SelectionRangeIntention.Block) {
    return makeBlockPointFromBlock(previousBlock);
  }
  return makeParagraphPointFromParagraphAndOffset(previousBlock, getParagraphLength(previousBlock));
}
function accessFirstPointInContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
): BlockPoint | ParagraphPoint | null {
  if (isContentAtContentReferenceEmpty(document, contentReference)) {
    return null;
  }
  const firstBlock = accessBlockAtIndexInContentAtContentReference(document, contentReference, 0);
  if (isEmbed(firstBlock)) {
    const embedReference = makeBlockReferenceFromBlock(firstBlock);
    return accessFirstPointInEmbedAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  if (intention === SelectionRangeIntention.Block) {
    return makeBlockPointFromBlock(firstBlock);
  }
  return makeParagraphPointFromParagraphAndOffset(firstBlock, 0);
}
function accessFirstNextPointToContentAtContentReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
): BlockPoint | ParagraphPoint | null {
  if (!isContentAtContentReferenceInEmbed(document, contentReference)) {
    return null;
  }
  const embedReference = makeBlockReferenceFromBlock(accessEmbedFromContentReference(document, contentReference));
  if (
    areContentReferencesAtSameContent(contentReference, makeContentReferenceFromContent(accessLastContentInEmbedAtBlockReference(document, embedReference)))
  ) {
    if (intention === SelectionRangeIntention.Block) {
      return makeBlockPointFromBlockReference(embedReference);
    }
    return accessFirstNextPointToBlockAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  const nextContentReference = makeContentReferenceFromContent(accessNextContentToContentInEmbedAtContentReference(document, contentReference));
  return (
    accessFirstPointInContentAtContentReference(document, nextContentReference, intention) ??
    accessFirstNextPointToContentAtContentReference(document, nextContentReference, intention)
  );
}
function accessFirstPointInEmbedAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
): BlockPoint | ParagraphPoint | null {
  if (isEmbedAtBlockReferenceEmpty(document, embedReference)) {
    return null;
  }
  const firstContentReference = makeContentReferenceFromContent(accessContentAtIndexInEmbedAtBlockReference(document, embedReference, 0));
  return (
    accessFirstPointInContentAtContentReference(document, firstContentReference, intention) ??
    accessFirstNextPointToContentAtContentReference(document, firstContentReference, intention)
  );
}
function accessFirstNextPointToBlockAtBlockReference<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  blockReference: BlockReference,
  intention: SelectionRangeIntention.Block | SelectionRangeIntention.Text,
  blockShallow?: boolean,
): BlockPoint | ParagraphPoint | null {
  const contentReference = makeContentReferenceFromContent(accessContentFromBlockReference(document, blockReference));
  if (areBlockReferencesAtSameBlock(blockReference, makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)))) {
    return accessFirstNextPointToContentAtContentReference(document, contentReference, intention);
  }
  const nextBlock = accessNextBlockToBlockAtBlockReference(document, blockReference);
  if (isEmbed(nextBlock)) {
    if (blockShallow && intention === SelectionRangeIntention.Block) {
      return makeBlockPointFromBlock(nextBlock);
    }
    const embedReference = makeBlockReferenceFromBlock(nextBlock);
    return accessFirstPointInEmbedAtBlockReference(document, embedReference, intention) ?? makeBlockPointFromBlockReference(embedReference);
  }
  if (intention === SelectionRangeIntention.Block) {
    return makeBlockPointFromBlock(nextBlock);
  }
  return makeParagraphPointFromParagraphAndOffset(nextBlock, 0);
}
function accessContentFromBlockPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, blockPoint: BlockPoint): Content<ContentConfig> {
  return accessContentFromBlockReference(document, blockPoint.blockReference);
}
function accessContentFromParagraphPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  paragraphPoint: ParagraphPoint,
): Content<ContentConfig> {
  return accessContentFromBlockReference(document, paragraphPoint.paragraphBlockReference);
}
class AlreadyInitializedPropertyError extends Error {
  name = 'AlreadyInitializedPropertyError';
  constructor(propertyName: string, options?: ErrorOptions) {
    super(`The '${propertyName}' property was already initialized`, options);
  }
}
interface Range {
  readonly contentReference: ContentReference;
  readonly startPoint: StartOfContentPoint | BlockPoint | ParagraphPoint;
  readonly endPoint: BlockPoint | ParagraphPoint | EndOfContentPoint;
  readonly id: string;
}
class InvalidRangeError extends Error {
  name = 'InvalidRangeError';
  constructor(options?: ErrorOptions) {
    super('Invalid range parameters', options);
  }
}
function makeRange(contentReference: ContentReference, startPoint: Point, endPoint: Point, id: string): Range {
  if (
    (isBlockPoint(startPoint) && isParagraphPoint(endPoint) && areBlockReferencesAtSameBlock(startPoint.blockReference, endPoint.paragraphBlockReference)) ||
    (isParagraphPoint(startPoint) && isBlockPoint(endPoint) && areBlockReferencesAtSameBlock(startPoint.paragraphBlockReference, endPoint.blockReference)) ||
    isEndOfContentPoint(startPoint) ||
    isStartOfContentPoint(endPoint)
  ) {
    throw new InvalidRangeError({
      cause: {
        contentReference,
        startPoint,
        endPoint,
      },
    });
  }
  return {
    contentReference,
    startPoint,
    endPoint,
    id,
  };
}
interface MatchRangeOnPointTypesAccessors<T> {
  StartOfContent_EndOfContent: (startPoint: StartOfContentPoint, endPoint: EndOfContentPoint) => T;
  StartOfContent_Block: (startPoint: StartOfContentPoint, endPoint: BlockPoint) => T;
  StartOfContent_Paragraph: (startPoint: StartOfContentPoint, endPoint: ParagraphPoint) => T;
  EndOfContent_StartOfContent: (startPoint: EndOfContentPoint, endPoint: StartOfContentPoint) => T;
  EndOfContent_Block: (startPoint: EndOfContentPoint, endPoint: BlockPoint) => T;
  EndOfContent_Paragraph: (startPoint: EndOfContentPoint, endPoint: ParagraphPoint) => T;
  Block_StartOfContent: (startPoint: BlockPoint, endPoint: StartOfContentPoint) => T;
  Block_EndOfContent: (startPoint: BlockPoint, endPoint: EndOfContentPoint) => T;
  Block_Block: (startPoint: BlockPoint, endPoint: BlockPoint) => T;
  Block_Paragraph: (startPoint: BlockPoint, endPoint: ParagraphPoint) => T;
  Paragraph_StartOfContent: (startPoint: ParagraphPoint, endPoint: StartOfContentPoint) => T;
  Paragraph_EndOfContent: (startPoint: ParagraphPoint, endPoint: EndOfContentPoint) => T;
  Paragraph_Block: (startPoint: ParagraphPoint, endPoint: BlockPoint) => T;
  Paragraph_Paragraph: (startPoint: ParagraphPoint, endPoint: ParagraphPoint) => T;
}
function matchRangeOnPointTypes<T>(range: Range, accessors: MatchRangeOnPointTypesAccessors<T>): T {
  const { startPoint, endPoint } = range;
  if (isParagraphPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.Paragraph_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.Paragraph_Block(startPoint, endPoint);
    }
    if (isStartOfContentPoint(endPoint)) {
      return accessors.Paragraph_StartOfContent(startPoint, endPoint);
    }
    return accessors.Paragraph_EndOfContent(startPoint, endPoint);
  }
  if (isBlockPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.Block_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.Block_Block(startPoint, endPoint);
    }
    if (isStartOfContentPoint(endPoint)) {
      return accessors.Block_StartOfContent(startPoint, endPoint);
    }
    return accessors.Block_EndOfContent(startPoint, endPoint);
  }
  if (isStartOfContentPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.StartOfContent_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.StartOfContent_Block(startPoint, endPoint);
    }
    assertIsEndOfContentPoint(endPoint);
    return accessors.StartOfContent_EndOfContent(startPoint, endPoint);
  }
  if (isParagraphPoint(endPoint)) {
    return accessors.EndOfContent_Paragraph(startPoint, endPoint);
  }
  if (isBlockPoint(endPoint)) {
    return accessors.EndOfContent_Block(startPoint, endPoint);
  }
  if (isStartOfContentPoint(endPoint)) {
    return accessors.EndOfContent_StartOfContent(startPoint, endPoint);
  }
  throwUnreachable();
}
interface MatchRangeOnPointTypesWithoutDirectionAccessors<T> {
  StartOfContent_EndOfContent: (startOfContentPoint: StartOfContentPoint, endOfContentPoint: EndOfContentPoint) => T;
  StartOfContent_Block: (startOfContentPoint: StartOfContentPoint, blockPoint: BlockPoint) => T;
  StartOfContent_Paragraph: (startOfContentPoint: StartOfContentPoint, paragraphPoint: ParagraphPoint) => T;
  EndOfContent_Block: (endOfContentPoint: EndOfContentPoint, blockPoint: BlockPoint) => T;
  EndOfContent_Paragraph: (endOfContentPoint: EndOfContentPoint, paragraphPoint: ParagraphPoint) => T;
  Block_Block: (blockPoint1: BlockPoint, blockPoint2: BlockPoint) => T;
  Block_Paragraph: (blockPoint: BlockPoint, paragraphPoint: ParagraphPoint) => T;
  Paragraph_Paragraph: (paragraphPoint1: ParagraphPoint, paragraphPoint2: ParagraphPoint) => T;
}
function matchRangeOnPointTypesWithoutDirection<T>(range: Range, accessors: MatchRangeOnPointTypesWithoutDirectionAccessors<T>): T {
  const { startPoint, endPoint } = range;
  if (isParagraphPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.Paragraph_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.Block_Paragraph(endPoint, startPoint);
    }
    if (isStartOfContentPoint(endPoint)) {
      return accessors.StartOfContent_Paragraph(endPoint, startPoint);
    }
    return accessors.EndOfContent_Paragraph(endPoint, startPoint);
  }
  if (isBlockPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.Block_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.Block_Block(startPoint, endPoint);
    }
    if (isStartOfContentPoint(endPoint)) {
      return accessors.StartOfContent_Block(endPoint, startPoint);
    }
    return accessors.EndOfContent_Block(endPoint, startPoint);
  }
  if (isStartOfContentPoint(startPoint)) {
    if (isParagraphPoint(endPoint)) {
      return accessors.StartOfContent_Paragraph(startPoint, endPoint);
    }
    if (isBlockPoint(endPoint)) {
      return accessors.StartOfContent_Block(startPoint, endPoint);
    }
    assertIsEndOfContentPoint(endPoint);
    return accessors.StartOfContent_EndOfContent(startPoint, endPoint);
  }
  if (isParagraphPoint(endPoint)) {
    return accessors.EndOfContent_Paragraph(startPoint, endPoint);
  }
  if (isBlockPoint(endPoint)) {
    return accessors.EndOfContent_Block(startPoint, endPoint);
  }
  if (isStartOfContentPoint(endPoint)) {
    return accessors.StartOfContent_EndOfContent(endPoint, startPoint);
  }
  throwUnreachable();
}
enum RangeDirection {
  Forwards = 'Forwards',
  Backwards = 'Backwards',
  NeutralText = 'NeutralText',
  NeutralBlock = 'NeutralBlock',
  NeutralEmptyContent = 'NeutralEmptyContent',
}
function getRangeDirection(document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>, range: Range): RangeDirection {
  const { contentReference, startPoint, endPoint } = range;
  switch (startPoint.type) {
    case PointType.StartOfContent: {
      if (isContentAtContentReferenceEmpty(document, contentReference)) {
        return RangeDirection.NeutralEmptyContent;
      }
      return RangeDirection.Forwards;
    }
    case PointType.Block: {
      switch (endPoint.type) {
        case PointType.EndOfContent: {
          return RangeDirection.Forwards;
        }
        case PointType.Block:
        case PointType.Paragraph: {
          const startIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(startPoint));
          const endIndex = getIndexOfBlockInContentFromBlockReference(
            document,
            isParagraphPoint(endPoint) ? makeBlockReferenceFromParagraphPoint(endPoint) : makeBlockReferenceFromBlockPoint(endPoint),
          );
          return startIndex < endIndex ? RangeDirection.Backwards : startIndex === endIndex ? RangeDirection.NeutralBlock : RangeDirection.Forwards;
        }
        default: {
          assertUnreachable(endPoint);
        }
      }
    }
    case PointType.Paragraph: {
      switch (endPoint.type) {
        case PointType.EndOfContent: {
          return RangeDirection.Forwards;
        }
        case PointType.Block: {
          const startIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(startPoint));
          const endIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(endPoint));
          return startIndex < endIndex ? RangeDirection.Backwards : RangeDirection.Forwards;
        }
        case PointType.Paragraph: {
          const startIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(startPoint));
          const endIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(endPoint));
          return startIndex > endIndex
            ? RangeDirection.Backwards
            : startIndex === endIndex
            ? startPoint.offset > endPoint.offset
              ? RangeDirection.Backwards
              : startPoint.offset === endPoint.offset
              ? RangeDirection.NeutralText
              : RangeDirection.Forwards
            : RangeDirection.Forwards;
        }
        default: {
          assertUnreachable(endPoint);
        }
      }
    }
    default: {
      assertUnreachable(startPoint);
    }
  }
}
enum SelectionRangeIntention {
  Block = 'Block',
  Text = 'Text',
}
type SelectionRangeData = Record<string, unknown>;
interface SelectionRange {
  readonly ranges: readonly Range[]; // TODO: remove text collapsed non focus/anchor ranges.
  readonly anchorRangeId: string;
  readonly focusRangeId: string;
  readonly intention: SelectionRangeIntention;
  readonly data: SelectionRangeData;
  readonly id: string;
}
const SelectionRangeDataCreatedAtKey = 'createdAt';
function makeSelectionRange(
  ranges: readonly Range[],
  anchorRangeId: string,
  focusRangeId: string,
  intention: SelectionRangeIntention,
  data: SelectionRangeData,
  id: string,
): SelectionRange {
  assert(ranges.length > 0, 'SelectionRange must have at least one range.', {
    cause: { ranges, anchorRangeId, focusRangeId, id },
  });
  if (!(SelectionRangeDataCreatedAtKey in data)) {
    data = { ...data, [SelectionRangeDataCreatedAtKey]: performance.now() };
  }
  return {
    ranges,
    anchorRangeId,
    focusRangeId,
    intention,
    data,
    id,
  };
}
function getAnchorPointFromRange(anchorRange: Range): StartOfContentPoint | BlockPoint | ParagraphPoint {
  return isStartOfContentPoint(anchorRange.startPoint) && !isEndOfContentPoint(anchorRange.endPoint) ? anchorRange.endPoint : anchorRange.startPoint;
}
function getFocusPointFromRange(focusRange: Range): BlockPoint | ParagraphPoint | EndOfContentPoint {
  return isEndOfContentPoint(focusRange.endPoint) && !isStartOfContentPoint(focusRange.startPoint) ? focusRange.startPoint : focusRange.endPoint;
}
interface Selection {
  readonly selectionRanges: readonly SelectionRange[];
}
function makeSelection(selectionRanges: readonly SelectionRange[]): Selection {
  return {
    selectionRanges,
  };
}
function getFocusSelectionRangeFromSelection(selection: Selection): SelectionRange | null {
  if (selection.selectionRanges.length === 0) {
    return null;
  }
  let maximumCreatedAt = selection.selectionRanges[0].data[SelectionRangeDataCreatedAtKey] as number;
  let mostRecentlyCreatedSelectionRange = selection.selectionRanges[0];
  for (let i = 1; i < selection.selectionRanges.length; i++) {
    const selectionRange = selection.selectionRanges[i];
    const createdAt = selectionRange.data[SelectionRangeDataCreatedAtKey] as number;
    if (createdAt >= maximumCreatedAt) {
      maximumCreatedAt = createdAt;
      mostRecentlyCreatedSelectionRange = selectionRange;
    }
  }
  return mostRecentlyCreatedSelectionRange;
}
function areSelectionsCoveringSameContent(selection1: Selection, selection2: Selection): boolean {
  return (
    selection1.selectionRanges.length === selection2.selectionRanges.length &&
    selection1.selectionRanges.every((selectionRange, i) => areSelectionRangesCoveringSameContent(selectionRange, selection2.selectionRanges[i]))
  );
}
function areSelectionRangesCoveringSameContent(selectionRange1: SelectionRange, selectionRange2: SelectionRange): boolean {
  return (
    selectionRange1.ranges.length === selectionRange2.ranges.length &&
    selectionRange1.ranges.every((range, i) => areRangesCoveringSameContent(range, selectionRange2.ranges[i]))
  );
}
function areRangesCoveringSameContent(range1: Range, range2: Range): boolean {
  return (
    areContentReferencesAtSameContent(range1.contentReference, range2.contentReference) &&
    ((arePointsEqual(range1.startPoint, range2.startPoint) && arePointsEqual(range1.endPoint, range2.endPoint)) ||
      (arePointsEqual(range1.endPoint, range2.startPoint) && arePointsEqual(range1.startPoint, range2.endPoint)))
  );
}
function areSelectionsEqual(selection1: Selection, selection2: Selection): boolean {
  return (
    selection1.selectionRanges.length === selection2.selectionRanges.length &&
    selection1.selectionRanges.every((selectionRange, i) => areSelectionRangesEqual(selectionRange, selection2.selectionRanges[i]))
  );
}
function areSelectionRangesEqual(selectionRange1: SelectionRange, selectionRange2: SelectionRange): boolean {
  return (
    selectionRange1.ranges.length === selectionRange2.ranges.length &&
    selectionRange1.ranges.every((range, i) => areRangesEqual(range, selectionRange2.ranges[i])) &&
    selectionRange1.anchorRangeId === selectionRange2.anchorRangeId &&
    selectionRange1.focusRangeId === selectionRange2.focusRangeId &&
    Object.keys(selectionRange1.data).length === Object.keys(selectionRange2).length &&
    Object.keys(selectionRange1.data).every((key) => selectionRange1.data[key] === selectionRange2.data[key]) &&
    selectionRange1.id === selectionRange2.id
  );
}
function areRangesEqual(range1: Range, range2: Range): boolean {
  return (
    areContentReferencesAtSameContent(range1.contentReference, range2.contentReference) &&
    arePointsEqual(range1.startPoint, range2.startPoint) &&
    arePointsEqual(range1.endPoint, range2.endPoint) &&
    range1.id === range2.id
  );
}
interface EmbedRenderControl {
  embedReference: BlockReference;
  onConfigChanged(): void;
  onContentRemoved(contentReference: ContentReference): void;
  onContentInsertedAfter(contentReference: ContentReference, insertAfterContentReference: ContentReference | null): void;
}
interface ParagraphRenderControl {
  paragraphReference: BlockReference;
  onConfigOrChildrenChanged(): void;
}
interface ContentRenderControl {
  contentReference: ContentReference;
  onConfigChanged(): void;
  onBlockRemoved(blockReference: BlockReference): void;
  onParagraphInsertedAfter(paragraphReference: BlockReference, insertAfterBlockReference: BlockReference | null): void;
  onEmbedInsertedAfter(embedReference: BlockReference, insertAfterBlockReference: BlockReference | null): void;
}
interface DocumentRenderControl extends Disposable {
  onConfigChanged(): void;
  init: () => void;
}
interface BaseRenderControl<MyDocumentRenderControl extends DocumentRenderControl> {
  makeDocumentRenderControl(rootHtmlElement: HTMLElement): MyDocumentRenderControl;
}
enum ViewDeltaChangeType {
  BlockInserted = 'BlockInserted',
  BlockMoved = 'BlockMoved',
  BlockConfigOrParagraphChildrenUpdated = 'BlockConfigOrParagraphChildrenUpdated',
  BlockRemoved = 'BlockRemoved',
  ContentInserted = 'ContentInserted',
  ContentConfigUpdated = 'ContentConfigUpdated',
  ContentRemoved = 'ContentRemoved',
  DocumentConfigUpdated = 'DocumentConfigUpdated',
}
type ViewDeltaChange =
  | {
      type: ViewDeltaChangeType.BlockInserted;
      blockReference: BlockReference;
      insertAfterBlockReference: BlockReference | null;
      contentReference: ContentReference;
    }
  | {
      type: ViewDeltaChangeType.BlockMoved;
      blockReference: BlockReference;
      moveAfterBlockReference: BlockReference | null;
      contentReference: ContentReference;
    }
  | {
      type: ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated;
      blockReference: BlockReference;
    }
  | {
      type: ViewDeltaChangeType.BlockRemoved;
      blockReference: BlockReference;
      contentReference: ContentReference;
    }
  | {
      type: ViewDeltaChangeType.ContentInserted;
      contentReference: ContentReference;
      insertAfterContentReference: ContentReference | null;
      embedReference: BlockReference;
    }
  | {
      type: ViewDeltaChangeType.ContentConfigUpdated;
      contentReference: ContentReference;
    }
  | {
      type: ViewDeltaChangeType.ContentRemoved;
      contentReference: ContentReference;
      embedReference: BlockReference;
    }
  | {
      type: ViewDeltaChangeType.DocumentConfigUpdated;
    };
type ViewDelta = {
  changes: ViewDeltaChange[];
};
interface ViewDeltaControl {
  // Null means at start.
  markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference: (
    blockReference: BlockReference,
    insertAfterBlockReference: BlockReference | null,
    contentReference: ContentReference,
  ) => void;
  markBlockAtBlockReferenceMovedAfterBlockReferenceInContentAtContentReference: (
    blockReference: BlockReference,
    moveAfterBlockReference: BlockReference | null,
    contentReference: ContentReference,
  ) => void;
  markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated: (blockReference: BlockReference) => void;
  markBlockAtBlockReferenceRemovedInContentAtContentReference: (blockReference: BlockReference, contentReference: ContentReference) => void;
  markContentAtContentReferenceInsertedAfterContentReferenceInEmbedAtBlockReference: (
    contentReference: ContentReference,
    insertAfterContentReference: ContentReference | null,
    embedReference: BlockReference,
  ) => void;
  markContentAtContentReferenceConfigUpdated: (contentReference: ContentReference) => void;
  markContentAtContentReferenceRemovedInEmbedAtBlockReference: (contentReference: ContentReference, embedReference: BlockReference) => void;
  markDocumentConfigUpdated: () => void;
}
function makeViewDeltaAndViewDeltaControl() {
  const viewDeltaChanges: ViewDeltaChange[] = [];
  const viewDeltaControl: ViewDeltaControl = {
    markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference(blockReference, insertAfterBlockReference, contentReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.BlockInserted,
        blockReference,
        insertAfterBlockReference,
        contentReference,
      });
    },
    markBlockAtBlockReferenceMovedAfterBlockReferenceInContentAtContentReference(blockReference, moveAfterBlockReference, contentReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.BlockMoved,
        blockReference,
        moveAfterBlockReference,
        contentReference,
      });
    },
    markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(blockReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated,
        blockReference,
      });
    },
    markBlockAtBlockReferenceRemovedInContentAtContentReference(blockReference, contentReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.BlockRemoved,
        blockReference,
        contentReference,
      });
    },
    markContentAtContentReferenceInsertedAfterContentReferenceInEmbedAtBlockReference(contentReference, insertAfterContentReference, embedReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.ContentInserted,
        contentReference,
        insertAfterContentReference,
        embedReference,
      });
    },
    markContentAtContentReferenceConfigUpdated(contentReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.ContentConfigUpdated,
        contentReference,
      });
    },
    markContentAtContentReferenceRemovedInEmbedAtBlockReference(contentReference, embedReference: BlockReference) {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.ContentRemoved,
        contentReference,
        embedReference,
      });
    },
    markDocumentConfigUpdated() {
      viewDeltaChanges.push({
        type: ViewDeltaChangeType.DocumentConfigUpdated,
      });
    },
  };
  return { viewDelta: { changes: viewDeltaChanges }, viewDeltaControl };
}
enum RegisterUnregisterEventType {
  Register = 'Register',
  Unregister = 'Unregister',
}
type ContentRenderControlRegisterUnregisterEvent<MyContentRenderControl extends ContentRenderControl> = {
  type: RegisterUnregisterEventType;
  contentRenderControl: MyContentRenderControl;
};
type ParagraphRenderControlRegisterUnregisterEvent<MyParagraphRenderControl extends ParagraphRenderControl> = {
  type: RegisterUnregisterEventType;
  paragraphRenderControl: MyParagraphRenderControl;
};
type EmbedRenderControlRegisterUnregisterEvent<MyEmbedRenderControl extends EmbedRenderControl> = {
  type: RegisterUnregisterEventType;
  embedRenderControl: MyEmbedRenderControl;
};
interface RenderControlRegister<
  MyContentRenderControl extends ContentRenderControl,
  MyParagraphRenderControl extends ParagraphRenderControl,
  MyEmbedRenderControl extends EmbedRenderControl,
> {
  registerContentRenderControl: (contentRenderControl: MyContentRenderControl) => void;
  unregisterContentRenderControl: (contentRenderControl: MyContentRenderControl) => void;
  registerParagraphRenderControl: (paragraphRenderControl: MyParagraphRenderControl) => void;
  unregisterParagraphRenderControl: (paragraphRenderControl: MyParagraphRenderControl) => void;
  registerEmbedRenderControl: (embedRenderControl: MyEmbedRenderControl) => void;
  unregisterEmbedRenderControl: (embedRenderControl: MyEmbedRenderControl) => void;
  contentRenderControlRegisterUnregister$: Source<ContentRenderControlRegisterUnregisterEvent<MyContentRenderControl>>;
  paragraphRenderControlRegisterUnregister$: Source<ParagraphRenderControlRegisterUnregisterEvent<MyParagraphRenderControl>>;
  embedRenderControlRegisterUnregister$: Source<EmbedRenderControlRegisterUnregisterEvent<MyEmbedRenderControl>>;
}
interface ViewControl<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
  MyDocumentRenderControl extends DocumentRenderControl,
  MyContentRenderControl extends ContentRenderControl,
  MyParagraphRenderControl extends ParagraphRenderControl,
  MyEmbedRenderControl extends EmbedRenderControl,
> extends Disposable {
  bindStateControl: (stateControl: StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>) => void;
  insertIntoRootHtmlElement: (rootHtmlElement: HTMLElement) => void;
  applyViewDelta: (viewDelta: ViewDelta) => void;
  renderControlRegister: RenderControlRegister<MyContentRenderControl, MyParagraphRenderControl, MyEmbedRenderControl>;
  accessDocumentRenderControl(): MyDocumentRenderControl;
  accessContentRenderControlAtContentReference: (contentReference: ContentReference) => MyContentRenderControl;
  accessEmbedRenderControlAtBlockReference: (blockReference: BlockReference) => MyEmbedRenderControl;
  accessParagraphRenderControlAtBlockReference: (blockReference: BlockReference) => MyParagraphRenderControl;
}
function makeViewControl<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
  MyDocumentRenderControl extends DocumentRenderControl,
  MyContentRenderControl extends ContentRenderControl,
  MyParagraphRenderControl extends ParagraphRenderControl,
  MyEmbedRenderControl extends EmbedRenderControl,
>(
  baseRenderControl: BaseRenderControl<MyDocumentRenderControl>,
): ViewControl<
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
  const disposable = Disposable();
  let stateControl: StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null = null;
  function bindStateControl(stateControl_: StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>): void {
    if (stateControl !== null) {
      throw new AlreadyInitializedPropertyError('stateControl', {
        cause: {
          viewControl,
          currentStateControl: stateControl,
          candidateStateControl: stateControl_,
        },
      });
    }
    stateControl = stateControl_;
  }
  let documentRenderControl: MyDocumentRenderControl | null = null;
  function insertIntoRootHtmlElement(rootHtmlElement: HTMLElement): void {
    if (documentRenderControl !== null) {
      throw new AlreadyInitializedPropertyError('documentRenderControl', {
        cause: {
          viewControl,
          rootHtmlElement,
          currentDocumentRenderControl: documentRenderControl,
        },
      });
    }
    documentRenderControl = baseRenderControl.makeDocumentRenderControl(rootHtmlElement);
    viewControl.add(documentRenderControl);
    documentRenderControl.init();
  }
  type RenderControlMap = {
    contents: Record<string, MyContentRenderControl | undefined>;
    embeds: Record<string, MyEmbedRenderControl | undefined>;
    paragraphs: Record<string, MyParagraphRenderControl | undefined>;
  };
  const renderControlMap: RenderControlMap = {
    contents: {},
    embeds: {},
    paragraphs: {},
  };
  function applyViewDeltaChange(viewDeltaChange: ViewDeltaChange): void {
    assertIsNotNullish(stateControl);
    assertIsNotNullish(documentRenderControl);
    switch (viewDeltaChange.type) {
      case ViewDeltaChangeType.BlockInserted: {
        const { blockReference, contentReference, insertAfterBlockReference } = viewDeltaChange;
        const contentRenderControl = renderControlMap.contents[contentReference.contentId];
        assertIsNotNullish(contentRenderControl);
        const block = accessBlockFromBlockReference(stateControl.stateView.document, blockReference);
        if (isEmbed(block)) {
          contentRenderControl.onEmbedInsertedAfter(blockReference, insertAfterBlockReference);
        } else {
          contentRenderControl.onParagraphInsertedAfter(blockReference, insertAfterBlockReference);
        }
        break;
      }
      case ViewDeltaChangeType.BlockMoved: {
        const { blockReference, contentReference, moveAfterBlockReference } = viewDeltaChange;
        const contentRenderControl = renderControlMap.contents[contentReference.contentId];
        assertIsNotNullish(contentRenderControl);
        contentRenderControl.onBlockRemoved(blockReference);
        const block = accessBlockFromBlockReference(stateControl.stateView.document, blockReference);
        if (isEmbed(block)) {
          contentRenderControl.onEmbedInsertedAfter(blockReference, moveAfterBlockReference);
        } else {
          contentRenderControl.onParagraphInsertedAfter(blockReference, moveAfterBlockReference);
        }
        break;
      }
      case ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated: {
        const { blockReference } = viewDeltaChange;
        const block = accessBlockFromBlockReference(stateControl.stateView.document, blockReference);
        if (isEmbed(block)) {
          const embedRenderControl = renderControlMap.embeds[blockReference.blockId];
          assertIsNotNullish(embedRenderControl);
          embedRenderControl.onConfigChanged();
        } else {
          const paragraphRenderControl = renderControlMap.paragraphs[blockReference.blockId];
          assertIsNotNullish(paragraphRenderControl);
          paragraphRenderControl.onConfigOrChildrenChanged();
        }
        break;
      }
      case ViewDeltaChangeType.BlockRemoved: {
        const { blockReference, contentReference } = viewDeltaChange;
        const contentRenderControl = renderControlMap.contents[contentReference.contentId];
        assertIsNotNullish(contentRenderControl);
        contentRenderControl.onBlockRemoved(blockReference);
        break;
      }
      case ViewDeltaChangeType.ContentInserted: {
        const { contentReference, embedReference, insertAfterContentReference } = viewDeltaChange;
        const embedRenderControl = renderControlMap.embeds[embedReference.blockId];
        assertIsNotNullish(embedRenderControl);
        embedRenderControl.onContentInsertedAfter(contentReference, insertAfterContentReference);
        break;
      }
      case ViewDeltaChangeType.ContentConfigUpdated: {
        const { contentReference } = viewDeltaChange;
        const contentRenderControl = renderControlMap.contents[contentReference.contentId];
        assertIsNotNullish(contentRenderControl);
        contentRenderControl.onConfigChanged();
        break;
      }
      case ViewDeltaChangeType.ContentRemoved: {
        const { contentReference, embedReference } = viewDeltaChange;
        const embedRenderControl = renderControlMap.embeds[embedReference.blockId];
        assertIsNotNullish(embedRenderControl);
        embedRenderControl.onContentRemoved(contentReference);
        break;
      }
      case ViewDeltaChangeType.DocumentConfigUpdated: {
        documentRenderControl.onConfigChanged();
        break;
      }
      default: {
        assertUnreachable(viewDeltaChange);
      }
    }
  }
  function applyViewDelta(viewDelta: ViewDelta): void {
    groupConsecutiveItemsInArray(
      viewDelta.changes,
      (change) => change,
      (a, b) => {
        if (a.type === ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated && b.type === ViewDeltaChangeType.BlockConfigOrParagraphChildrenUpdated) {
          return areBlockReferencesAtSameBlock(a.blockReference, b.blockReference);
        }
        if (a.type === ViewDeltaChangeType.ContentConfigUpdated && b.type === ViewDeltaChangeType.ContentConfigUpdated) {
          return areContentReferencesAtSameContent(a.contentReference, b.contentReference);
        }
        if (a.type === ViewDeltaChangeType.DocumentConfigUpdated && b.type === ViewDeltaChangeType.DocumentConfigUpdated) {
          return true;
        }
        return false;
      },
    ).forEach((group) => {
      applyViewDeltaChange(group.items[0]);
    });
  }
  const contentRenderControlRegisterUnregister$ = Distributor<ContentRenderControlRegisterUnregisterEvent<MyContentRenderControl>>();
  const paragraphRenderControlRegisterUnregister$ = Distributor<ParagraphRenderControlRegisterUnregisterEvent<MyParagraphRenderControl>>();
  const embedRenderControlRegisterUnregister$ = Distributor<EmbedRenderControlRegisterUnregisterEvent<MyEmbedRenderControl>>();
  disposable.add(contentRenderControlRegisterUnregister$);
  disposable.add(paragraphRenderControlRegisterUnregister$);
  disposable.add(embedRenderControlRegisterUnregister$);
  const renderControlRegister: RenderControlRegister<MyContentRenderControl, MyParagraphRenderControl, MyEmbedRenderControl> = {
    registerContentRenderControl(contentRenderControl) {
      assert(!(contentRenderControl.contentReference.contentId in renderControlMap.contents));
      renderControlMap.contents[contentRenderControl.contentReference.contentId] = contentRenderControl;
      contentRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Register, contentRenderControl }));
    },
    unregisterContentRenderControl(contentRenderControl) {
      assert(contentRenderControl.contentReference.contentId in renderControlMap.contents);
      delete renderControlMap.contents[contentRenderControl.contentReference.contentId];
      contentRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Unregister, contentRenderControl }));
    },
    registerParagraphRenderControl(paragraphRenderControl) {
      assert(!(paragraphRenderControl.paragraphReference.blockId in renderControlMap.paragraphs));
      renderControlMap.paragraphs[paragraphRenderControl.paragraphReference.blockId] = paragraphRenderControl;
      paragraphRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Register, paragraphRenderControl }));
    },
    unregisterParagraphRenderControl(paragraphRenderControl) {
      assert(paragraphRenderControl.paragraphReference.blockId in renderControlMap.paragraphs);
      delete renderControlMap.paragraphs[paragraphRenderControl.paragraphReference.blockId];
      paragraphRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Unregister, paragraphRenderControl }));
    },
    registerEmbedRenderControl(embedRenderControl) {
      assert(!(embedRenderControl.embedReference.blockId in renderControlMap.embeds));
      renderControlMap.embeds[embedRenderControl.embedReference.blockId] = embedRenderControl;
      embedRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Register, embedRenderControl }));
    },
    unregisterEmbedRenderControl(embedRenderControl) {
      assert(embedRenderControl.embedReference.blockId in renderControlMap.embeds);
      delete renderControlMap.embeds[embedRenderControl.embedReference.blockId];
      embedRenderControlRegisterUnregister$(Push({ type: RegisterUnregisterEventType.Unregister, embedRenderControl }));
    },
    contentRenderControlRegisterUnregister$,
    paragraphRenderControlRegisterUnregister$,
    embedRenderControlRegisterUnregister$,
  };
  function accessDocumentRenderControl(): MyDocumentRenderControl {
    assertIsNotNullish(documentRenderControl);
    return documentRenderControl;
  }
  function accessContentRenderControlAtContentReference(contentReference: ContentReference): MyContentRenderControl {
    const contentRenderControl = renderControlMap.contents[contentReference.contentId];
    assertIsNotNullish(contentRenderControl);
    return contentRenderControl;
  }
  function accessEmbedRenderControlAtBlockReference(blockReference: BlockReference): MyEmbedRenderControl {
    const embedRenderControl = renderControlMap.embeds[blockReference.blockId];
    assertIsNotNullish(embedRenderControl);
    return embedRenderControl;
  }
  function accessParagraphRenderControlAtBlockReference(blockReference: BlockReference): MyParagraphRenderControl {
    const paragraphRenderControl = renderControlMap.paragraphs[blockReference.blockId];
    assertIsNotNullish(paragraphRenderControl);
    return paragraphRenderControl;
  }
  const viewControl: ViewControl<
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
  > = implDisposableMethods(
    {
      bindStateControl,
      insertIntoRootHtmlElement,
      applyViewDelta,
      renderControlRegister,
      accessDocumentRenderControl,
      accessContentRenderControlAtContentReference,
      accessEmbedRenderControlAtBlockReference,
      accessParagraphRenderControlAtBlockReference,
    },
    disposable,
  );
  return viewControl;
}
interface PointWithContentReference {
  contentReference: ContentReference;
  point: Point;
}
function arePointWithContentReferencesEqual(a: PointWithContentReference, b: PointWithContentReference): boolean {
  return areContentReferencesAtSameContent(a.contentReference, b.contentReference) && arePointsEqual(a.point, b.point);
}
interface PointKey extends PointWithContentReference {
  point: Point;
  contentReference: ContentReference;
  indices: number[];
}
function makePointKeyFromPoint(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  contentReference: ContentReference,
  point: Point,
): PointKey {
  const indices =
    isStartOfContentPoint(point) || isEndOfContentPoint(point)
      ? []
      : isBlockPoint(point)
      ? [getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(point))]
      : [getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(point)), point.offset];
  let lastContentReference = contentReference;
  while (isContentAtContentReferenceInEmbed(document, lastContentReference)) {
    indices.unshift(getIndexOfEmbedContentFromContentReference(document, lastContentReference));
    const embed = accessEmbedFromContentReference(document, lastContentReference);
    const embedReference = makeBlockReferenceFromBlock(embed);
    indices.unshift(getIndexOfBlockInContentFromBlockReference(document, embedReference));
    lastContentReference = makeContentReferenceFromContent(accessContentFromBlockReference(document, embedReference));
  }
  return {
    point,
    contentReference,
    indices,
  };
}
enum CompareKeysResult {
  Before = 'Before',
  After = 'After',
  OverlapPreferKey1Before = 'OverlapPreferKey1Before',
  OverlapPreferKey1After = 'OverlapPreferKey1After',
  OverlapSameNonText = 'OverlapSameNonText',
  OverlapSameText = 'OverlapSame',
}
function compareKeys(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  key1: PointKey,
  key2: PointKey,
): CompareKeysResult {
  const firstUnequalBlockIndex = makeArrayWithNumbersFromStartToEndInclusive(
    0,
    Math.min(
      isParagraphPoint(key1.point) ? key1.indices.length - 2 : key1.indices.length - 1,
      isParagraphPoint(key2.point) ? key2.indices.length - 2 : key2.indices.length - 1,
    ),
  ).find((i) => key1.indices[i] !== key2.indices[i]);
  if (firstUnequalBlockIndex !== undefined) {
    // SOC/EOC & block/paragraph at different contents, or
    // block/paragraph & SOC/EOC at different contents, or
    // SOC & EOC or EOC & SOC at different contents, or
    // block & block at different blocks, or
    // paragraph & paragraph at different paragraphs.
    return key1.indices[firstUnequalBlockIndex] - key2.indices[firstUnequalBlockIndex] < 0 ? CompareKeysResult.Before : CompareKeysResult.After;
  }
  if (isStartOfContentPoint(key1.point)) {
    // SOC & any w/ one at or nested in other.
    if (isEndOfContentPoint(key2.point)) {
      // SOC & EOC w/ one at or nested in other.
      if (key1.indices.length === key2.indices.length) {
        // SOC & EOC at same content.
        if (isContentAtContentReferenceEmpty(document, key1.contentReference)) {
          // SOC & EOC at empty content.
          return CompareKeysResult.OverlapPreferKey1Before;
        }
        if (getNumberOfBlocksInContentAtContentReference(document, key1.contentReference) === 1) {
          // SOC & EOC at content with single block.
          const singleBlock = accessBlockAtIndexInContentAtContentReference(document, key1.contentReference, 0);
          if (isEmbed(singleBlock) || isParagraphEmpty(singleBlock)) {
            // SOC & EOC at content with single embed or single empty paragraph.
            return CompareKeysResult.OverlapPreferKey1Before;
          }
        }
        // SOC & EOC but not overlapping.
        return CompareKeysResult.Before;
      }
      if (key1.indices.length > key2.indices.length) {
        // Nested SOC & EOC.
        if (key1.indices[key2.indices.length] === getNumberOfBlocksInContentAtContentReference(document, key2.contentReference) - 1) {
          // Nested SOC at last block & EOC.
          return CompareKeysResult.OverlapPreferKey1Before;
        }
        // Nested SOC not at last block & EOC.
        return CompareKeysResult.Before;
      }
      // SOC & nested EOC.
      if (key2.indices[key1.indices.length] === 0) {
        // SOC & nested EOC at first block.
        return CompareKeysResult.OverlapPreferKey1Before;
      }
      // SOC & nested EOC not at first block.
      return CompareKeysResult.Before;
    }
    // SOC & any (not EOC) w/ one at or nested in other.
    if (key1.indices.length > key2.indices.length) {
      // Nested SOC & SOC/embed.
      assertIsNotParagraphPoint(key2.point);
      if (isBlockPoint(key2.point)) {
        // Nested SOC & embed.
        return CompareKeysResult.OverlapPreferKey1After;
      }
      // Nested SOC & SOC.
      return key1.indices[key2.indices.length] === 0 ? CompareKeysResult.OverlapPreferKey1After : CompareKeysResult.After;
    }
    if (key1.indices.length === key2.indices.length) {
      // SOC & SOC at same content.
      assertIsStartOfContentPoint(key2.point);
      return CompareKeysResult.OverlapSameNonText;
    }
    // SOC & block/paragraph at same or nested content.
    if (key2.indices[key1.indices.length] === 0) {
      // SOC & block/paragraph at or nested in first block.
      if (key2.indices.length === key1.indices.length + 1) {
        // SOC & paragraph at first block.
        assertIsParagraphPoint(key2.point);
        return key2.indices[key1.indices.length + 1] === 0 ? CompareKeysResult.OverlapPreferKey1Before : CompareKeysResult.Before;
      }
      // SOC & block at or nested in first block, or SOC & paragraph nested in first block.
      return CompareKeysResult.OverlapPreferKey1Before;
    }
    // SOC & block/paragraph, not at first block.
    return CompareKeysResult.Before;
  }
  if (isStartOfContentPoint(key2.point)) {
    // Any (not SOC) & SOC w/ one at or nested in other.
    if (isEndOfContentPoint(key1.point)) {
      // EOC & SOC w/ one at or nested in other.
      if (key2.indices.length === key1.indices.length) {
        // EOC & SOC at same content.
        if (isContentAtContentReferenceEmpty(document, key2.contentReference)) {
          // EOC & SOC at empty content.
          return CompareKeysResult.OverlapPreferKey1After;
        }
        if (getNumberOfBlocksInContentAtContentReference(document, key2.contentReference) === 1) {
          // EOC & SOC at content with single block.
          const singleBlock = accessBlockAtIndexInContentAtContentReference(document, key2.contentReference, 0);
          if (isEmbed(singleBlock) || isParagraphEmpty(singleBlock)) {
            // EOC & SOC at content with single embed or single empty paragraph.
            return CompareKeysResult.OverlapPreferKey1After;
          }
        }
        // EOC & SOC but not overlapping.
        return CompareKeysResult.After;
      }
      if (key2.indices.length > key1.indices.length) {
        // EOC & nested SOC.
        if (key2.indices[key1.indices.length] === getNumberOfBlocksInContentAtContentReference(document, key1.contentReference) - 1) {
          // EOC & nested SOC at last block.
          return CompareKeysResult.OverlapPreferKey1After;
        }
        // EOC & nested SOC not at last block.
        return CompareKeysResult.After;
      }
      // Nested EOC & SOC.
      if (key1.indices[key2.indices.length] === 0) {
        // Nested EOC at first block & SOC.
        return CompareKeysResult.OverlapPreferKey1After;
      }
      // Nested EOC not at first block & SOC.
      return CompareKeysResult.After;
    }
    // Any (not SOC or EOC) & SOC w/ one at or nested in other.
    if (key2.indices.length > key1.indices.length) {
      // Embed & nested SOC.
      assertIsBlockPoint(key1.point);
      return CompareKeysResult.OverlapPreferKey1Before;
    }
    // Block/paragraph & SOC at same or nested content.
    if (key1.indices[key2.indices.length] === 0) {
      // Block/paragraph & SOC at or nested in first block.
      if (key1.indices.length === key2.indices.length + 1) {
        // Paragraph & SOC at first block.
        assertIsParagraphPoint(key1.point);
        return key1.indices[key2.indices.length + 1] === 0 ? CompareKeysResult.OverlapPreferKey1After : CompareKeysResult.After;
      }
      // Block & SOC at or nested in first block, or paragraph nested in first block & SOC.
      return CompareKeysResult.OverlapPreferKey1After;
    }
    // Block/paragraph & SOC, not at first block.
    return CompareKeysResult.After;
  }
  if (isEndOfContentPoint(key1.point)) {
    // EOC & any (not SOC) w/ one nested in other.
    if (key1.indices.length > key2.indices.length) {
      // Nested EOC & embed.
      assertIsNotParagraphPoint(key2.point);
      if (isBlockPoint(key2.point)) {
        // Nested SOC & embed.
        return CompareKeysResult.OverlapPreferKey1After;
      }
      // Nested EOC & EOC.
      return key1.indices[key2.indices.length] === getNumberOfBlocksInContentAtContentReference(document, key2.contentReference) - 1
        ? CompareKeysResult.OverlapPreferKey1After
        : CompareKeysResult.After;
    }
    if (key1.indices.length === key2.indices.length) {
      // EOC & EOC at same content.
      assertIsStartOfContentPoint(key2.point);
      return CompareKeysResult.OverlapSameNonText;
    }
    // EOC & block/paragraph at same or nested content.
    if (key2.indices[key1.indices.length] === getNumberOfBlocksInContentAtContentReference(document, key1.contentReference) - 1) {
      // EOC & block/paragraph at or nested in last block.
      if (key2.indices.length === key1.indices.length + 1) {
        assertIsParagraphPoint(key2.point);
        // EOC & paragraph at last block.
        return key2.indices[key1.indices.length + 1] === getParagraphLength(accessParagraphFromParagraphPoint(document, key2.point))
          ? CompareKeysResult.OverlapPreferKey1After
          : CompareKeysResult.After;
      }
      // EOC & block at or nested in last block, or EOC & paragraph nested in last block.
      return CompareKeysResult.OverlapPreferKey1After;
    }
    // EOC & block/paragraph, not at last block.
    return CompareKeysResult.After;
  }
  if (isEndOfContentPoint(key2.point)) {
    // Any (not SOC or EOC) & EOC w/ one nested in other (not SOC & SOC at same content).
    if (key2.indices.length > key1.indices.length) {
      // Embed & nested EOC.
      assertIsBlockPoint(key1.point);
      return CompareKeysResult.OverlapPreferKey1Before;
    }
    // Block/paragraph & EOC at same or nested content.
    if (key1.indices[key2.indices.length] === getNumberOfBlocksInContentAtContentReference(document, key2.contentReference) - 1) {
      // Block/paragraph & EOC at or nested in last block.
      if (key1.indices.length === key2.indices.length + 1) {
        assertIsParagraphPoint(key1.point);
        // Paragraph & EOC at last block.
        return key1.indices[key2.indices.length + 1] === getParagraphLength(accessParagraphFromParagraphPoint(document, key1.point))
          ? CompareKeysResult.OverlapPreferKey1Before
          : CompareKeysResult.Before;
      }
      // Block & EOC at or nested in last block, or Paragraph & EOC nested in last block.
      return CompareKeysResult.OverlapPreferKey1Before;
    }
    // Block/paragraph & EOC, not at last block.
    return CompareKeysResult.Before;
  }
  // No SOCs and no EOCs.
  if (key1.indices.length === key2.indices.length) {
    // Block & block at same block or paragraph & paragraph at same paragraph.
    if (isParagraphPoint(key1.point)) {
      assertIsParagraphPoint(key2.point);
      // Paragraph & paragraph at same paragraph.
      return key1.point.offset < key2.point.offset
        ? CompareKeysResult.Before
        : key1.point.offset === key2.point.offset
        ? CompareKeysResult.OverlapSameText
        : CompareKeysResult.After;
    }
    // Block & block at same block.
    return CompareKeysResult.OverlapSameNonText;
  }
  // Can't both be paragraphs, because:
  // Case 1: at same paragraph, then handled above.
  // Case 2: at different paragraphs, then firstUnequalBlockIndex would not be undefined.
  if (isParagraphPoint(key1.point)) {
    assertIsBlockPoint(key2.point);
    // Nested paragraph & embed or paragraph & block at same paragraph.
    return CompareKeysResult.OverlapPreferKey1After;
  }
  if (isParagraphPoint(key2.point)) {
    assertIsBlockPoint(key1.point);
    // Embed & nested paragraph or block & paragraph at same paragraph.
    return CompareKeysResult.OverlapPreferKey1Before;
  }
  // Now left with embed & block or block & embed.
  return key1.indices.length < key2.indices.length ? CompareKeysResult.OverlapPreferKey1Before : CompareKeysResult.OverlapPreferKey1After;
}
function getIsSelectionRangeAnchorAfterFocus(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  selectionRange: SelectionRange,
): boolean {
  const anchorRange = selectionRange.ranges.find((range) => range.id === selectionRange.anchorRangeId);
  const focusRange = selectionRange.ranges.find((range) => range.id === selectionRange.focusRangeId);
  assertIsNotNullish(anchorRange);
  assertIsNotNullish(focusRange);
  const anchorPoint = getAnchorPointFromRange(anchorRange);
  const focusPoint = getFocusPointFromRange(focusRange);
  const anchorPointKey = makePointKeyFromPoint(document, anchorRange.contentReference, anchorPoint);
  const focusPointKey = makePointKeyFromPoint(document, focusRange.contentReference, focusPoint);
  return compareKeys(document, anchorPointKey, focusPointKey) === CompareKeysResult.After;
}
function getSelectionRangeAnchorAndFocusPointWithContentReferences(selectionRange: SelectionRange): {
  anchorPointWithContentReference: PointWithContentReference;
  focusPointWithContentReference: PointWithContentReference;
} {
  const anchorRange = selectionRange.ranges.find((range) => range.id === selectionRange.anchorRangeId);
  const focusRange = selectionRange.ranges.find((range) => range.id === selectionRange.focusRangeId);
  assertIsNotNullish(anchorRange);
  assertIsNotNullish(focusRange);
  const anchorPoint = getAnchorPointFromRange(anchorRange);
  const focusPoint = getFocusPointFromRange(focusRange);
  return {
    anchorPointWithContentReference: {
      contentReference: anchorRange.contentReference,
      point: anchorPoint,
    },
    focusPointWithContentReference: {
      contentReference: focusRange.contentReference,
      point: focusPoint,
    },
  };
}
interface RangeWithKeys {
  range: Range;
  isAnchor: boolean;
  isFocus: boolean;
  selectionRangeId: string;
  startKey: PointKey;
  endKey: PointKey;
  sortedStartPoint: Point;
  sortedEndPoint: Point;
  sortedStartKey: PointKey;
  sortedEndKey: PointKey;
}
function makeSortedRangeWithKeysFromRange(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  range: Range,
  isAnchor: boolean,
  isFocus: boolean,
  selectionRangeId: string,
): RangeWithKeys {
  const startKey = makePointKeyFromPoint(document, range.contentReference, range.startPoint);
  const endKey = makePointKeyFromPoint(document, range.contentReference, range.endPoint);
  const compare_start_to_end = compareKeys(document, startKey, endKey);
  let sortedStartPoint: Point;
  let sortedEndPoint: Point;
  let sortedStartKey: PointKey;
  let sortedEndKey: PointKey;
  if (compare_start_to_end === CompareKeysResult.Before || compare_start_to_end === CompareKeysResult.OverlapPreferKey1Before) {
    sortedStartPoint = range.startPoint;
    sortedEndPoint = range.endPoint;
    sortedStartKey = startKey;
    sortedEndKey = endKey;
  } else {
    sortedStartPoint = range.endPoint;
    sortedEndPoint = range.startPoint;
    sortedStartKey = endKey;
    sortedEndKey = startKey;
  }
  return {
    range,
    isAnchor,
    isFocus,
    selectionRangeId,
    startKey,
    endKey,
    sortedStartPoint,
    sortedEndPoint,
    sortedStartKey,
    sortedEndKey,
  };
}
function sortAndMergeAndFixSelectionRanges<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selectionRanges: readonly SelectionRange[],
  resolveOverlappingSelectionRanges?: (info: {
    range1WithKeys: RangeWithKeys;
    range2WithKeys: RangeWithKeys;
    compare_range1SortedStart_to_range2SortedStart: CompareKeysResult;
    compare_range1SortedStart_to_range2SortedEnd: CompareKeysResult;
    compare_range1SortedEnd_to_range2SortedStart: CompareKeysResult;
    compare_range1SortedEnd_to_range2SortedEnd: CompareKeysResult;
    updateSelectionRangeId: (removedSelectionRangeId: string, newSelectionRangeId: string) => void;
  }) => RangeWithKeys | null,
): Selection {
  if (selectionRanges.length === 0) {
    return makeSelection(selectionRanges);
  }
  const eqAny = [
    CompareKeysResult.OverlapPreferKey1Before,
    CompareKeysResult.OverlapPreferKey1After,
    CompareKeysResult.OverlapSameNonText,
    CompareKeysResult.OverlapSameText,
  ];
  const leNonText = [
    CompareKeysResult.Before,
    CompareKeysResult.OverlapPreferKey1Before,
    CompareKeysResult.OverlapPreferKey1After,
    CompareKeysResult.OverlapSameNonText,
  ];
  const geNonText = [
    CompareKeysResult.After,
    CompareKeysResult.OverlapPreferKey1Before,
    CompareKeysResult.OverlapPreferKey1After,
    CompareKeysResult.OverlapSameNonText,
  ];
  const eqNonText = [CompareKeysResult.OverlapPreferKey1Before, CompareKeysResult.OverlapPreferKey1After, CompareKeysResult.OverlapSameNonText];
  function sortAndMergeAndFix(selectionRanges: readonly SelectionRange[], isFirstTime: boolean): Selection {
    const rangesWithKeys = selectionRanges.flatMap((selectionRange) =>
      selectionRange.ranges.map((range) =>
        makeSortedRangeWithKeysFromRange(
          document,
          range,
          selectionRange.anchorRangeId === range.id,
          selectionRange.focusRangeId === range.id,
          selectionRange.id,
        ),
      ),
    );
    rangesWithKeys.sort((range1WithKeys, range2WithKeys) => {
      const compare_range1SortedStart_to_range2SortedStart = compareKeys(document, range1WithKeys.sortedStartKey, range2WithKeys.sortedStartKey);
      return compare_range1SortedStart_to_range2SortedStart === CompareKeysResult.Before ||
        compare_range1SortedStart_to_range2SortedStart === CompareKeysResult.OverlapPreferKey1Before
        ? -1
        : compare_range1SortedStart_to_range2SortedStart === CompareKeysResult.OverlapSameNonText ||
          compare_range1SortedStart_to_range2SortedStart === CompareKeysResult.OverlapSameText
        ? 0
        : 1;
    });
    let didChange = false;
    const changedSelectionRangeIds: Record<string, string> = {};
    const updateSelectionRangeId = (removedSelectionRangeId: string, newSelectionRangeId: string): void => {
      if (removedSelectionRangeId in changedSelectionRangeIds) {
        if (newSelectionRangeId in changedSelectionRangeIds) {
          newSelectionRangeId = changedSelectionRangeIds[newSelectionRangeId];
        } else {
          const newSelectionRangeId_ = changedSelectionRangeIds[removedSelectionRangeId];
          changedSelectionRangeIds[newSelectionRangeId] = newSelectionRangeId_;
          newSelectionRangeId = newSelectionRangeId_;
        }
      } else if (newSelectionRangeId in changedSelectionRangeIds) {
        newSelectionRangeId = changedSelectionRangeIds[newSelectionRangeId];
        changedSelectionRangeIds[removedSelectionRangeId] = newSelectionRangeId;
      } else {
        changedSelectionRangeIds[removedSelectionRangeId] = newSelectionRangeId;
      }
    };
    for (let i = 0; i < rangesWithKeys.length - 1; i++) {
      const range1WithKeys = rangesWithKeys[i];
      const range2WithKeys = rangesWithKeys[i + 1];
      const compare_range1SortedStart_to_range2SortedStart = compareKeys(document, range1WithKeys.sortedStartKey, range2WithKeys.sortedStartKey);
      const compare_range1SortedStart_to_range2SortedEnd = compareKeys(document, range1WithKeys.sortedStartKey, range2WithKeys.sortedEndKey);
      const compare_range1SortedEnd_to_range2SortedStart = compareKeys(document, range1WithKeys.sortedEndKey, range2WithKeys.sortedStartKey);
      const compare_range1SortedEnd_to_range2SortedEnd = compareKeys(document, range1WithKeys.sortedEndKey, range2WithKeys.sortedEndKey);
      // Overlaps: R1S=R2S or R1E=R2E or R1S <=(non text) R2S <=(non text) R1E or R1S <=(non text) R2E <=(non text) R1E or R1E(non text)=R2S.
      if (
        eqAny.includes(compare_range1SortedStart_to_range2SortedStart) || // TODO: if same selection range, then if touching text, merge.
        eqAny.includes(compare_range1SortedEnd_to_range2SortedEnd) ||
        (leNonText.includes(compare_range1SortedStart_to_range2SortedStart) && geNonText.includes(compare_range1SortedEnd_to_range2SortedStart)) ||
        (leNonText.includes(compare_range1SortedStart_to_range2SortedEnd) && geNonText.includes(compare_range1SortedEnd_to_range2SortedEnd)) ||
        eqNonText.includes(compare_range1SortedEnd_to_range2SortedStart)
      ) {
        if (resolveOverlappingSelectionRanges !== undefined) {
          // TODO?
          const newRangeWithKeys = resolveOverlappingSelectionRanges({
            range1WithKeys,
            range2WithKeys,
            compare_range1SortedStart_to_range2SortedStart,
            compare_range1SortedStart_to_range2SortedEnd,
            compare_range1SortedEnd_to_range2SortedStart,
            compare_range1SortedEnd_to_range2SortedEnd,
            updateSelectionRangeId,
          });
          if (newRangeWithKeys !== null) {
            didChange = true;
            rangesWithKeys.splice(i--, 2);
            continue;
          }
        }
        // R1S(strict)<=R2S by sort.
        const newRangeContentReference: ContentReference = range1WithKeys.range.contentReference;
        const newRangeId: string = range1WithKeys.range.id;
        const isAnchor = range1WithKeys.isAnchor;
        const isFocus = range1WithKeys.isFocus;
        const newSelectionRangeId: string = range1WithKeys.selectionRangeId;
        const removedSelectionRangeId: string = range2WithKeys.selectionRangeId;
        let newStartPoint: Point;
        let newEndPoint: Point;
        let newStartKey: PointKey;
        let newEndKey: PointKey;
        const newSortedStartPoint: Point = range1WithKeys.sortedStartPoint;
        const newSortedStartKey: PointKey = range1WithKeys.startKey;
        let newSortedEndPoint: Point;
        let newSortedEndKey: PointKey;
        if (areContentReferencesAtSameContent(range1WithKeys.range.contentReference, range2WithKeys.range.contentReference)) {
          if (leNonText.includes(compare_range1SortedEnd_to_range2SortedEnd)) {
            newSortedEndPoint = range2WithKeys.sortedEndPoint;
            newSortedEndKey = range2WithKeys.sortedEndKey;
          } else {
            newSortedEndPoint = range1WithKeys.sortedEndPoint;
            newSortedEndKey = range2WithKeys.sortedEndKey;
          }
          const firstRangeDirection = getRangeDirection(document, range1WithKeys.range);
          if (firstRangeDirection === RangeDirection.Backwards) {
            newStartPoint = newSortedEndPoint;
            newStartKey = newSortedEndKey;
            newEndPoint = newSortedStartPoint;
            newEndKey = newSortedStartKey;
          } else {
            newStartPoint = newSortedStartPoint;
            newStartKey = newSortedStartKey;
            newEndPoint = newSortedEndPoint;
            newEndKey = newSortedEndKey;
          }
        } else {
          // R2 must be contained in R1, i.e. R2E<=R1E. (The other case, if R1 is contained in R2, then the ranges would have to share the same start
          // point as R1S(strict)<=R2S by sort so would share the same content reference, and the above if branch would be executed instead).
          newStartPoint = range1WithKeys.range.startPoint;
          newEndPoint = range1WithKeys.range.endPoint;
          newStartKey = range1WithKeys.startKey;
          newEndKey = range1WithKeys.endKey;
          newSortedEndPoint = range1WithKeys.sortedEndPoint;
          newSortedEndKey = range1WithKeys.sortedEndKey;
        }
        updateSelectionRangeId(removedSelectionRangeId, newSelectionRangeId);
        didChange = true;
        rangesWithKeys.splice(i--, 2, {
          range: makeRange(newRangeContentReference, newStartPoint, newEndPoint, newRangeId),
          isAnchor,
          isFocus,
          selectionRangeId: newSelectionRangeId,
          startKey: newStartKey,
          endKey: newEndKey,
          sortedStartPoint: newSortedStartPoint,
          sortedEndPoint: newSortedEndPoint,
          sortedStartKey: newSortedStartKey,
          sortedEndKey: newSortedEndKey,
        });
      }
    }
    rangesWithKeys.forEach((rangeWithKey) => {
      if (rangeWithKey.selectionRangeId in changedSelectionRangeIds) {
        rangeWithKey.selectionRangeId = changedSelectionRangeIds[rangeWithKey.selectionRangeId];
      }
    });
    const mergedSelectionRanges: SelectionRange[] = [];
    groupArray(rangesWithKeys, (rangeWithKeys) => rangeWithKeys.selectionRangeId).forEach((rangesWithKeys, selectionRangeId) => {
      const anchorRange = rangesWithKeys.find((rangeWithKey) => rangeWithKey.isAnchor);
      assertIsNotNullish(anchorRange);
      const focusRange = rangesWithKeys.find((rangeWithKey) => rangeWithKey.isFocus);
      assertIsNotNullish(focusRange);
      const selectionRange = selectionRanges.find((selectionRange) => selectionRange.id === selectionRangeId);
      assertIsNotNullish(selectionRange);
      mergedSelectionRanges.push(
        makeSelectionRange(
          rangesWithKeys.map((rangeWithKey) => rangeWithKey.range),
          anchorRange.range.id,
          focusRange.range.id,
          selectionRange.intention,
          selectionRange.data,
          selectionRangeId,
        ),
      );
    });
    const selection = makeSelection(mergedSelectionRanges);
    if (didChange || isFirstTime) {
      let didFix = false;
      const newSelectionRanges = selection.selectionRanges.flatMap((selectionRange) => {
        const fixedSelectionRange = stateControlConfig.fixSelectionRange(document, selectionRange);
        if (fixedSelectionRange === null) {
          return [];
        }
        didFix = true;
        assert(fixedSelectionRange.id === selectionRange.id, 'StateControlConfig#fixSelectionRange must preserve SelectionRange#id.');
        return [fixedSelectionRange];
      });
      if (didFix) {
        return sortAndMergeAndFix(newSelectionRanges, false);
      }
    }
    return selection;
  }
  return fixSelectionIntentions(document, sortAndMergeAndFix(selectionRanges, true));
}
type TransformSelectionRangeFn = (selectionRange: SelectionRange) => SelectionRange | null;
function fixAndTransformSelectionByTransformingSelectionRanges<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection: Selection,
  transformSelectionRange: TransformSelectionRangeFn,
): Selection {
  const newSelectionRanges: readonly SelectionRange[] = selection.selectionRanges.flatMap((selectionRange) => {
    const transformedSelectionRange = transformSelectionRange(selectionRange);
    if (transformedSelectionRange === null) {
      return [];
    }
    assert(transformedSelectionRange.id === selectionRange.id, 'TransformSelectionRangeFn must preserve SelectionRange#id.');
    return [transformedSelectionRange];
  });
  return sortAndMergeAndFixSelectionRanges(document, stateControlConfig, newSelectionRanges);
}
function transformSelectionByTransformingSelectionRanges<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection: Selection,
  transformSelectionRange: TransformSelectionRangeFn,
): Selection {
  // TODO: fix this stuff.
  let didTransform = false;
  const newSelectionRanges: readonly SelectionRange[] = selection.selectionRanges.flatMap((selectionRange) => {
    const transformedSelectionRange = transformSelectionRange(selectionRange);
    if (!didTransform && transformedSelectionRange && !areSelectionRangesEqual(selectionRange, transformedSelectionRange)) {
      didTransform = true;
    }
    if (transformedSelectionRange === null) {
      return [];
    }
    assert(transformedSelectionRange.id === selectionRange.id, 'TransformSelectionRangeFn must preserve SelectionRange#id.');
    return [transformedSelectionRange];
  });
  return didTransform ? sortAndMergeAndFixSelectionRanges(document, stateControlConfig, newSelectionRanges) : makeSelection(selection.selectionRanges);
}
function fixSelectionIntentions(document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>, selection: Selection): Selection {
  return makeSelection(
    selection.selectionRanges.map((selectionRange) => {
      if (
        selectionRange.intention === SelectionRangeIntention.Block &&
        selectionRange.ranges.some((range) => isParagraphPoint(range.startPoint) || isParagraphPoint(range.endPoint))
      ) {
        return makeSelectionRange(
          selectionRange.ranges,
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          SelectionRangeIntention.Text,
          selectionRange.data,
          selectionRange.id,
        );
      }
      return selectionRange;
    }),
  );
}
function makeRangesConnectingPointsAtContentReferences(
  document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>,
  startPointContentReference: ContentReference,
  startPoint: Point,
  endPointContentReference: ContentReference,
  endPoint: Point,
  lastRangeId: string,
): Range[] {
  if (
    (isBlockPoint(startPoint) &&
      !areContentReferencesAtSameContent(startPointContentReference, makeContentReferenceFromContent(accessContentFromBlockPoint(document, startPoint)))) ||
    (isParagraphPoint(startPoint) &&
      !areContentReferencesAtSameContent(startPointContentReference, makeContentReferenceFromContent(accessContentFromParagraphPoint(document, startPoint))))
  ) {
    throw new Error('startPointContentReference does not match the content that startPoint is contained in.', {
      cause: { startPointContentReference, startPoint },
    });
  }
  if (
    (isBlockPoint(endPoint) &&
      !areContentReferencesAtSameContent(endPointContentReference, makeContentReferenceFromContent(accessContentFromBlockPoint(document, endPoint)))) ||
    (isParagraphPoint(endPoint) &&
      !areContentReferencesAtSameContent(endPointContentReference, makeContentReferenceFromContent(accessContentFromParagraphPoint(document, endPoint))))
  ) {
    throw new Error('endPointContentReference does not match the content that endPoint is contained in.', {
      cause: { endPointContentReference, endPoint },
    });
  }
  if (areContentReferencesAtSameContent(startPointContentReference, endPointContentReference)) {
    return [makeRange(startPointContentReference, startPoint, endPoint, lastRangeId)];
  }
  const startPointSocPointKey = makePointKeyFromPoint(document, startPointContentReference, makeStartOfContentPoint());
  const endPointSocPointKey = makePointKeyFromPoint(document, endPointContentReference, makeStartOfContentPoint());
  let isBackwards: boolean;
  let sortedStartPointContentReference: ContentReference;
  let sortedStartPoint: Point;
  let sortedEndPointContentReference: ContentReference;
  let sortedEndPoint: Point;
  if ([CompareKeysResult.Before, CompareKeysResult.OverlapPreferKey1Before].includes(compareKeys(document, startPointSocPointKey, endPointSocPointKey))) {
    isBackwards = false;
    sortedStartPointContentReference = startPointContentReference;
    sortedStartPoint = startPoint;
    sortedEndPointContentReference = endPointContentReference;
    sortedEndPoint = endPoint;
  } else {
    isBackwards = true;
    sortedStartPointContentReference = endPointContentReference;
    sortedStartPoint = endPoint;
    sortedEndPointContentReference = startPointContentReference;
    sortedEndPoint = startPoint;
  }
  const ranges: Range[] = [];
  const sortedStartPointParentContentReferencesWithEmbedReferences = makeListOfAllParentContentReferencesWithEmbedReferencesOfContentAtContentReference(
    document,
    sortedStartPointContentReference,
  );
  sortedStartPointParentContentReferencesWithEmbedReferences.reverse();
  const sortedEndPointParentContentReferencesWithEmbedReferences = makeListOfAllParentContentReferencesWithEmbedReferencesOfContentAtContentReference(
    document,
    sortedEndPointContentReference,
  );
  sortedEndPointParentContentReferencesWithEmbedReferences.reverse();
  if (sortedStartPointParentContentReferencesWithEmbedReferences.length > 0 && !isEndOfContentPoint(sortedStartPoint)) {
    ranges.push(makeRange(sortedStartPointContentReference, sortedStartPoint, makeEndOfContentPoint(), generateId()));
  }
  let lastSharedParentContentReferenceIndex = -1;
  for (
    ;
    lastSharedParentContentReferenceIndex <
      Math.min(sortedStartPointParentContentReferencesWithEmbedReferences.length, sortedEndPointParentContentReferencesWithEmbedReferences.length) - 1 &&
    areContentReferencesAtSameContent(
      sortedStartPointParentContentReferencesWithEmbedReferences[lastSharedParentContentReferenceIndex + 1].contentReference,
      sortedEndPointParentContentReferencesWithEmbedReferences[lastSharedParentContentReferenceIndex + 1].contentReference,
    );
    lastSharedParentContentReferenceIndex++ // eslint-disable-next-line no-empty
  ) {}
  for (let i = sortedStartPointParentContentReferencesWithEmbedReferences.length - 1; i > lastSharedParentContentReferenceIndex; i--) {
    const { contentReference, embedReference } = sortedStartPointParentContentReferencesWithEmbedReferences[i];
    if (!areBlockReferencesAtSameBlock(embedReference, makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)))) {
      ranges.push(
        makeRange(
          contentReference,
          makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, embedReference)),
          makeEndOfContentPoint(),
          generateId(),
        ),
      );
    }
  }
  if (lastSharedParentContentReferenceIndex === -1) {
    if (sortedStartPointParentContentReferencesWithEmbedReferences.length === 0) {
      assert(sortedEndPointParentContentReferencesWithEmbedReferences.length !== 0);
      const topLevelStartPoint = sortedStartPoint;
      assertIsNotEndOfContentPoint(topLevelStartPoint);
      const topLevelEndBlockReference = sortedEndPointParentContentReferencesWithEmbedReferences[0].embedReference;
      const blockReferenceAtPreviousBlockToTopLevelEndBlock = makeBlockReferenceFromBlock(
        accessPreviousBlockToBlockAtBlockReference(document, topLevelEndBlockReference),
      );
      ranges.push(
        makeRange(
          startPointContentReference,
          topLevelStartPoint,
          isStartOfContentPoint(topLevelStartPoint) ||
            isBlockPoint(topLevelStartPoint) ||
            (isParagraphPoint(topLevelStartPoint) &&
              !areBlockReferencesAtSameBlock(makeBlockReferenceFromParagraphPoint(topLevelStartPoint), blockReferenceAtPreviousBlockToTopLevelEndBlock))
            ? makeBlockPointFromBlockReference(blockReferenceAtPreviousBlockToTopLevelEndBlock)
            : changeParagraphPointOffset(topLevelStartPoint, getParagraphLength(accessParagraphFromParagraphPoint(document, topLevelStartPoint))),
          generateId(),
        ),
      );
    } else {
      assert(sortedEndPointParentContentReferencesWithEmbedReferences.length === 0);
      const topLevelEndPoint = sortedEndPoint;
      assertIsNotStartOfContentPoint(topLevelEndPoint);
      const topLevelStartPoint = makeBlockPointFromBlockReference(sortedStartPointParentContentReferencesWithEmbedReferences[0].embedReference);
      const topLevelStartBlockReference = sortedStartPointParentContentReferencesWithEmbedReferences[0].embedReference;
      const blockReferenceAtNextBlockToTopLevelStartBlock = makeBlockReferenceFromBlock(
        accessNextBlockToBlockAtBlockReference(document, topLevelStartBlockReference),
      );
      ranges.push(
        makeRange(
          startPointContentReference,
          isEndOfContentPoint(topLevelEndPoint) ||
            isBlockPoint(topLevelEndPoint) ||
            (isParagraphPoint(topLevelEndPoint) &&
              !areBlockReferencesAtSameBlock(makeBlockReferenceFromParagraphPoint(topLevelEndPoint), blockReferenceAtNextBlockToTopLevelStartBlock))
            ? makeBlockPointFromBlockReference(blockReferenceAtNextBlockToTopLevelStartBlock)
            : changeParagraphPointOffset(topLevelEndPoint, 0),
          topLevelStartPoint,
          generateId(),
        ),
      );
    }
  } else {
    const { contentReference, embedReference: sharedParentSortedStartEmbedReference } =
      sortedStartPointParentContentReferencesWithEmbedReferences[lastSharedParentContentReferenceIndex];
    const sharedParentSortedEndEmbedReference = sortedEndPointParentContentReferencesWithEmbedReferences[lastSharedParentContentReferenceIndex].embedReference;
    if (
      !areBlockReferencesAtSameBlock(
        sharedParentSortedStartEmbedReference,
        makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
      ) &&
      !areBlockReferencesAtSameBlock(
        sharedParentSortedEndEmbedReference,
        makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)),
      )
    ) {
      const sharedParentSortedStartNextBlockReference = makeBlockReferenceFromBlock(
        accessNextBlockToBlockAtBlockReference(document, sharedParentSortedStartEmbedReference),
      );
      const sharedParentSortedEndPreviousBlockReference = makeBlockReferenceFromBlock(
        accessPreviousBlockToBlockAtBlockReference(document, sharedParentSortedEndEmbedReference),
      );
      if (
        !areBlockReferencesAtSameBlock(sharedParentSortedStartEmbedReference, sharedParentSortedEndEmbedReference) &&
        !areBlockReferencesAtSameBlock(sharedParentSortedStartEmbedReference, sharedParentSortedEndPreviousBlockReference)
      ) {
        if (isBackwards) {
          ranges.push(
            makeRange(
              contentReference,
              makeBlockPointFromBlockReference(sharedParentSortedEndPreviousBlockReference),
              makeBlockPointFromBlockReference(sharedParentSortedStartNextBlockReference),
              generateId(),
            ),
          );
        } else {
          ranges.push(
            makeRange(
              contentReference,
              makeBlockPointFromBlockReference(sharedParentSortedStartNextBlockReference),
              makeBlockPointFromBlockReference(sharedParentSortedEndPreviousBlockReference),
              generateId(),
            ),
          );
        }
      }
    }
  }
  for (let i = lastSharedParentContentReferenceIndex + 1; i < sortedEndPointParentContentReferencesWithEmbedReferences.length; i++) {
    const { contentReference, embedReference } = sortedStartPointParentContentReferencesWithEmbedReferences[i];
    if (
      !areBlockReferencesAtSameBlock(embedReference, makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)))
    ) {
      ranges.push(
        makeRange(
          contentReference,
          makeStartOfContentPoint(),
          makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, embedReference)),
          generateId(),
        ),
      );
    }
  }
  if (sortedEndPointParentContentReferencesWithEmbedReferences.length > 0 && !isStartOfContentPoint(sortedEndPoint)) {
    ranges.push(makeRange(sortedEndPointContentReference, makeStartOfContentPoint(), sortedEndPoint, generateId()));
  }
  assert(ranges.length > 0); // TODO.
  const lastRange = ranges[ranges.length - 1];
  ranges[ranges.length - 1] = makeRange(lastRange.contentReference, lastRange.startPoint, lastRange.endPoint, lastRangeId);
  return ranges;
}
interface State<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  readonly document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  selection: Selection;
  customCollapsedSelectionTextConfig: TextConfig | null;
}
function makeInitialStateFromDocument<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): State<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    document,
    selection: makeSelection([]),
    customCollapsedSelectionTextConfig: null,
  };
}
interface DocumentView<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> extends Readonly<Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>> {}
interface StateView<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> extends Readonly<State<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>> {
  readonly mutationIdToTimeTravelAfter: string | null;
  readonly document: DocumentView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
enum MutationSelectionTransformFixWhen {
  NoFix = 'NoFix',
  FixEvery = 'FixEvery',
}
interface MutationSelectionToTransform {
  selection: Selection;
  fixWhen: MutationSelectionTransformFixWhen;
  shouldTransformAsSelection?: boolean;
}
type CustomTransformStateSelectionRangeFn = (selectionRange: SelectionRange) => SelectionRange | null | undefined; // Undefined means defer back to default.
type SelectionChangeData = Record<string, unknown>;
interface Delta<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  applyMutation: (
    mutation:
      | Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
      | BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    keepCollapsedSelectionTextConfigWhenSelectionChanges?: boolean,
    customTransformStateSelectionRangeFn?: CustomTransformStateSelectionRangeFn,
  ) => void;
  applyUpdate: (runUpdate: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, data?: UpdateData) => void;
  setSelection: (selection: Selection, keepCollapsedSelectionTextConfigWhenSelectionChanges?: boolean, data?: SelectionChangeData) => void;
  setCustomCollapsedSelectionTextConfig: (newTextConfig: TextConfig) => void;
}
type RunUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> = (stateControl: StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>) => void;
interface QueuedUpdate<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  runUpdate: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  data?: UpdateData;
}
interface StateControlConfig<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  canContentAtContentReferenceBeRemovedWhenRemovingSelection: (
    document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    contentReference: ContentReference,
  ) => boolean;
  fixSelectionRange: (
    document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    selectionRange: SelectionRange,
  ) => SelectionRange | null;
  IntlSegmenter: import('../IntlSegmenter').IntlSegmenterConstructor;
}
interface FinishedUpdatingMessage {
  didApplyMutation: boolean;
}
interface SelectionChangeMessage {
  previousSelection: Selection;
  data?: SelectionChangeData;
  updateDataStack: UpdateData[];
}
type UpdateData = Record<string, unknown>;
interface MutationResultMessage<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  mutationPart: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  updateDataStack: UpdateData[];
  result: MutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  afterMutation$: Source<never>;
  isFirstMutationPart: boolean;
  isLastMutationPart: boolean;
}
interface StateControl<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> extends Disposable {
  readonly stateView: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  readonly stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  readonly delta: Delta<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  readonly isInUpdate: boolean;
  queueUpdate: (runUpdate: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, data?: UpdateData) => Disposable;
  mutationPartResult$: Source<MutationResultMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>;
  viewDelta$: Source<ViewDelta>;
  finishedUpdating$: Source<FinishedUpdatingMessage>;
  selectionChange$: Source<SelectionChangeMessage>;
  snapshotStateThroughStateView: () => StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  transformSelectionForwardsFromFirstStateViewToSecondStateView: (
    selectionToTransform: MutationSelectionToTransform,
    firstStateView: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    secondStateView: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  ) => Selection;
}
function isSelectionCollapsedInText(document: Document<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig>, selection: Selection): boolean {
  return (
    selection.selectionRanges.length > 0 &&
    selection.selectionRanges.every((selectionRange) =>
      selectionRange.ranges.every((range) => getRangeDirection(document, range) === RangeDirection.NeutralText),
    )
  );
}
interface MutationReference {
  mutationId: string | null;
}
function makeStateControl<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  const disposable = Disposable();
  const state = makeInitialStateFromDocument(document);
  let updateQueue: QueuedUpdate<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
  let updateDisposable: Disposable | null = null;
  let latestMutationReference: MutationReference = {
    mutationId: null,
  };
  type CommittedMutationInfoForReversingBase = {
    mutationReferenceWeakRef: WeakRef<MutationReference>;
    currentSelection: Selection;
    currentCustomCollapsedSelectionTextConfig: TextConfig | null;
  };
  type CommittedMutationInfoForReversingDummyFirst = CommittedMutationInfoForReversingBase & {
    mutationId: null;
    reverseMutation: null;
  };
  type CommittedMutationInfoForReversingMutation = CommittedMutationInfoForReversingBase & {
    mutation: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
    mutationId: string;
    // Undefined means part of batch mutation with previous custom transform.
    customTransformStateSelectionRangeFn: CustomTransformStateSelectionRangeFn | null | undefined;
    transformSelectionRange: TransformSelectionRangeFn | null;
    reverseMutation: BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  };
  const committedMutationInfosForReversing: (CommittedMutationInfoForReversingDummyFirst | CommittedMutationInfoForReversingMutation)[] = [
    {
      mutationReferenceWeakRef: new WeakRef(latestMutationReference),
      mutationId: null,
      currentSelection: state.selection,
      currentCustomCollapsedSelectionTextConfig: state.customCollapsedSelectionTextConfig,
      reverseMutation: null,
    },
  ]; // TODO: garbage collect.
  let currentTimeTravelInfo: {
    timeTraveledToAfterMutationId: string | null;
  } | null = null;
  function timeTravelDocumentToAfterMutationId(mutationId: string | null): void {
    if (mutationId === (currentTimeTravelInfo === null ? latestMutationReference.mutationId : currentTimeTravelInfo.timeTraveledToAfterMutationId)) {
      return;
    }
    const indexToTimeTravelTo = committedMutationInfosForReversing.findIndex(
      (committedMutationInfoForReversing) => committedMutationInfoForReversing.mutationId === mutationId,
    );
    const currentTimeTravelInfo_ = currentTimeTravelInfo;
    const indexToTimeTravelFrom =
      currentTimeTravelInfo_ === null
        ? committedMutationInfosForReversing.length - 1
        : committedMutationInfosForReversing.findIndex(
            (committedMutationInfoForReversing) => committedMutationInfoForReversing.mutationId === currentTimeTravelInfo_.timeTraveledToAfterMutationId,
          );
    assert(indexToTimeTravelFrom !== indexToTimeTravelTo);
    if (indexToTimeTravelFrom < indexToTimeTravelTo) {
      assertIsNotNullish(currentTimeTravelInfo);
      // Time travel forwards.
      for (let i = indexToTimeTravelFrom + 1; i <= indexToTimeTravelTo; i++) {
        const committedMutationInfoForReversing = committedMutationInfosForReversing[i] as CommittedMutationInfoForReversingMutation;
        applyMutation(state.document, committedMutationInfoForReversing.mutation, null, null);
      }
      if (indexToTimeTravelTo === committedMutationInfosForReversing.length - 1) {
        currentTimeTravelInfo = null;
      } else {
        currentTimeTravelInfo.timeTraveledToAfterMutationId = mutationId;
      }
    } else {
      // Time travel backwards.
      for (let i = indexToTimeTravelFrom; i > indexToTimeTravelTo; i--) {
        const committedMutationInfoForReversing = committedMutationInfosForReversing[i];
        const { reverseMutation } = committedMutationInfoForReversing;
        assertIsNotNullish(reverseMutation);
        forEachMutationInBatchMutation(reverseMutation, (reverseMutationPart) => {
          const mutationPartResult = applyMutation(state.document, reverseMutationPart, null, null);
          assert(mutationPartResult.didChange);
        });
        if (currentTimeTravelInfo) {
          currentTimeTravelInfo.timeTraveledToAfterMutationId = mutationId;
        } else {
          currentTimeTravelInfo = {
            timeTraveledToAfterMutationId: mutationId,
          };
        }
      }
    }
  }
  function makeStateViewOfStateAfterDynamicMutationReferenceId(
    getMutationIdToTimeTravelAfter: () => string | null,
    reflectNonDocumentPropertiesThroughCurrentState: boolean,
  ): StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
    const getDocument = (): Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
      const mutationId = getMutationIdToTimeTravelAfter();
      timeTravelDocumentToAfterMutationId(mutationId);
      return state.document;
    };
    const documentView: DocumentView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = {
      type: NodeType.Document,
      get id() {
        return getDocument().id;
      },
      get config() {
        return getDocument().config;
      },
      get contentStore() {
        return getDocument().contentStore;
      },
      get blockStore() {
        return getDocument().blockStore;
      },
    };
    return {
      document: documentView,
      get selection() {
        if (reflectNonDocumentPropertiesThroughCurrentState) {
          return state.selection;
        }
        const mutationId = getMutationIdToTimeTravelAfter();
        const committedMutationInfoForReversing = committedMutationInfosForReversing.find((item) => item.mutationId === mutationId);
        assertIsNotNullish(committedMutationInfoForReversing);
        return committedMutationInfoForReversing.currentSelection;
      },
      get customCollapsedSelectionTextConfig() {
        if (reflectNonDocumentPropertiesThroughCurrentState) {
          return state.customCollapsedSelectionTextConfig;
        }
        const mutationId = getMutationIdToTimeTravelAfter();
        const committedMutationInfoForReversing = committedMutationInfosForReversing.find((item) => item.mutationId === mutationId);
        assertIsNotNullish(committedMutationInfoForReversing);
        return committedMutationInfoForReversing.currentCustomCollapsedSelectionTextConfig;
      },
      get mutationIdToTimeTravelAfter() {
        return getMutationIdToTimeTravelAfter();
      },
    };
  }
  function transformSelectionForwardsFromFirstStateViewToSecondStateView(
    selectionToTransform: MutationSelectionToTransform,
    firstStateView: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    secondStateView: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  ): Selection {
    const { fixWhen, shouldTransformAsSelection } = selectionToTransform;
    let selection = selectionToTransform.selection;
    const firstStateViewMutationIdToTimeTravelAfter = firstStateView.mutationIdToTimeTravelAfter;
    const secondStateViewMutationIdToTimeTravelAfter = secondStateView.mutationIdToTimeTravelAfter;
    if (firstStateViewMutationIdToTimeTravelAfter === secondStateViewMutationIdToTimeTravelAfter) {
      return selection;
    }
    const firstStateViewCommittedMutationInfoForReversingIndex = committedMutationInfosForReversing.findIndex(
      (committedMutationInfoForReversing) => committedMutationInfoForReversing.mutationId === firstStateViewMutationIdToTimeTravelAfter,
    );
    const secondStateViewCommittedMutationInfoForReversingIndex = committedMutationInfosForReversing.findIndex(
      (committedMutationInfoForReversing) => committedMutationInfoForReversing.mutationId === secondStateViewMutationIdToTimeTravelAfter,
    );
    assert(
      firstStateViewCommittedMutationInfoForReversingIndex < secondStateViewCommittedMutationInfoForReversingIndex,
      'secondStateView must be snapshot >= firstStateView, not before',
    );
    for (let i = firstStateViewCommittedMutationInfoForReversingIndex + 1; i <= secondStateViewCommittedMutationInfoForReversingIndex; i++) {
      const committedMutationInfoForReversing = committedMutationInfosForReversing[i];
      assertIsNotNullish(committedMutationInfoForReversing.mutationId);
      const { mutationId } = committedMutationInfoForReversing;
      let myTransformSelectionRange: TransformSelectionRangeFn | null;
      if (shouldTransformAsSelection && committedMutationInfoForReversing.customTransformStateSelectionRangeFn) {
        const { customTransformStateSelectionRangeFn } = committedMutationInfoForReversing;
        myTransformSelectionRange = (selectionRange) => {
          const transformedSelectionRange = customTransformStateSelectionRangeFn(selectionRange);
          if (transformedSelectionRange === undefined) {
            if (committedMutationInfoForReversing.transformSelectionRange) {
              return committedMutationInfoForReversing.transformSelectionRange(selectionRange);
            }
            return null;
          }
          return transformedSelectionRange;
        };
      } else {
        myTransformSelectionRange = committedMutationInfoForReversing.transformSelectionRange;
      }
      if (myTransformSelectionRange) {
        selection =
          fixWhen === MutationSelectionTransformFixWhen.FixEvery // TODO.
            ? fixAndTransformSelectionByTransformingSelectionRanges(
                makeStateViewOfStateAfterDynamicMutationReferenceId(() => mutationId, false).document,
                stateControlConfig,
                selection,
                myTransformSelectionRange,
              )
            : transformSelectionByTransformingSelectionRanges(
                makeStateViewOfStateAfterDynamicMutationReferenceId(() => mutationId, false).document,
                stateControlConfig,
                selection,
                myTransformSelectionRange,
              );
      } else if (fixWhen === MutationSelectionTransformFixWhen.FixEvery) {
        selection = sortAndMergeAndFixSelectionRanges(
          makeStateViewOfStateAfterDynamicMutationReferenceId(() => mutationId, false).document,
          stateControlConfig,
          selection.selectionRanges,
        );
      }
    }
    return selection;
  }
  const stateView = makeStateViewOfStateAfterDynamicMutationReferenceId(() => latestMutationReference.mutationId, true);
  function queueUpdate(
    runUpdate: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
    data?: UpdateData,
  ): Disposable {
    if (updateDisposable === null) {
      updateDisposable = Disposable();
      disposable.add(updateDisposable);
      requestAnimationFrameDisposable(runUpdates, updateDisposable);
    }
    let isRemoved = false;
    const queuedUpdate: QueuedUpdate<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = {
      runUpdate(stateControl) {
        isRemoved = true;
        runUpdate(stateControl);
      },
      data,
    };
    updateQueue.push(queuedUpdate);
    let isUpdateStarting = false;
    const updateDisposable_ = updateDisposable;
    const cancelDisposable = Disposable(() => {
      if (!isUpdateStarting && !isRemoved) {
        isRemoved = true;
        const index = updateQueue.indexOf(queuedUpdate);
        assert(index !== -1);
        updateQueue.splice(index, 1);
      }
    });
    updateDisposable_.add(
      Disposable(() => {
        isUpdateStarting = true;
        cancelDisposable.dispose();
      }),
    );
    return cancelDisposable;
  }
  function snapshotStateThroughStateView(): StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
    const latestMutationReference_ = latestMutationReference;
    return makeStateViewOfStateAfterDynamicMutationReferenceId(() => latestMutationReference_.mutationId, false);
  }
  let delta: Delta<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null = null;
  const mutationPartResult$ = Distributor<MutationResultMessage<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>>();
  const viewDelta$ = Distributor<ViewDelta>();
  disposable.add(viewDelta$);
  const finishedUpdating$ = Distributor<FinishedUpdatingMessage>();
  disposable.add(finishedUpdating$);
  const selectionChange$ = Distributor<SelectionChangeMessage>();
  let updateDataStack: UpdateData[] | null = null;
  function runUpdates(): void {
    let didApplyMutation = false;
    function deltaApplyMutation(
      mutation:
        | Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
        | BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
      keepCollapsedSelectionTextConfigWhenSelectionChanges?: boolean,
      customTransformStateSelectionRangeFn?: CustomTransformStateSelectionRangeFn,
    ): void {
      didApplyMutation = true;
      const customTransformStateSelectionRangeDidTransformSelectionRanges: SelectionRange[] = [];
      let customTransformStateSelectionRangeDidTransformSelectionRangesFocusSelectionRangeId: string | null | undefined;
      let selectionRangesToTransform = stateView.selection.selectionRanges;
      const onMutation = (
        mutationPart: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
        mutationIndex: number,
        isLastMutationPart: boolean,
      ): void => {
        const { viewDelta, viewDeltaControl } = makeViewDeltaAndViewDeltaControl();
        const mutationPartResult: MutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = applyMutation(
          stateView.document,
          mutationPart,
          viewDeltaControl,
          makeStateViewOfStateAfterDynamicMutationReferenceId(() => mutationId, false),
        );
        if (!mutationPartResult.didChange) {
          return;
        }
        const { reverseMutation, transformSelectionRange } = mutationPartResult;
        const mutationId = generateId();
        latestMutationReference = {
          mutationId,
        };
        const mutationReferenceWeakRef = new WeakRef(latestMutationReference);
        committedMutationInfosForReversing.push({
          mutation: mutationPart,
          mutationReferenceWeakRef,
          mutationId,
          currentSelection: stateView.selection,
          currentCustomCollapsedSelectionTextConfig:
            stateView.customCollapsedSelectionTextConfig && cloneNodeConfig(stateView.customCollapsedSelectionTextConfig),
          customTransformStateSelectionRangeFn:
            customTransformStateSelectionRangeFn === undefined ? null : mutationIndex === 0 ? customTransformStateSelectionRangeFn : undefined,
          transformSelectionRange,
          reverseMutation,
        });
        if (customTransformStateSelectionRangeFn && mutationIndex === 0) {
          selectionRangesToTransform = selectionRangesToTransform.flatMap((selectionRange) => {
            const transformedSelectionRange = customTransformStateSelectionRangeFn(selectionRange);
            if (transformedSelectionRange === undefined) {
              return [selectionRange];
            }
            if (transformedSelectionRange !== null) {
              assert(transformedSelectionRange.id === selectionRange.id, 'TransformSelectionRangeFn must preserve SelectionRange#id.');
              customTransformStateSelectionRangeDidTransformSelectionRanges.push(transformedSelectionRange);
            }
            return [];
          });
        }
        if (transformSelectionRange && selectionRangesToTransform.length > 0) {
          selectionRangesToTransform = selectionRangesToTransform.flatMap((selectionRange) => {
            const transformedSelectionRange = transformSelectionRange(selectionRange);
            if (transformedSelectionRange === null) {
              return [];
            }
            assert(transformedSelectionRange.id === selectionRange.id, 'TransformSelectionRangeFn must preserve SelectionRange#id.');
            return [transformedSelectionRange];
          });
          if (selectionRangesToTransform.length > 0) {
            const fixedSelection = sortAndMergeAndFixSelectionRanges(stateView.document, stateControlConfig, selectionRangesToTransform);
            selectionRangesToTransform = fixedSelection.selectionRanges;
          }
        }
        viewDelta$(Push(viewDelta));
        assertIsNotNullish(updateDataStack);
        mutationPartResult$(
          Push({
            mutationPart,
            updateDataStack,
            result: mutationPartResult,
            afterMutation$,
            isFirstMutationPart: mutationIndex === 0,
            isLastMutationPart,
          }),
        );
      };
      const afterMutation$ = Distributor<never>();
      if (isBatchMutation(mutation)) {
        forEachMutationInBatchMutation(mutation, onMutation);
      } else {
        onMutation(mutation, 0, true);
      }
      assertIsNotNullish(delta);
      if (customTransformStateSelectionRangeDidTransformSelectionRanges && customTransformStateSelectionRangeDidTransformSelectionRanges.length > 0) {
        delta.setSelection(
          sortAndMergeAndFixSelectionRanges(
            stateView.document,
            stateControlConfig,
            customTransformStateSelectionRangeDidTransformSelectionRanges
              ? customTransformStateSelectionRangeDidTransformSelectionRanges.concat(selectionRangesToTransform)
              : selectionRangesToTransform,
          ),
          keepCollapsedSelectionTextConfigWhenSelectionChanges,
        );
      } else {
        delta.setSelection(makeSelection(selectionRangesToTransform), keepCollapsedSelectionTextConfigWhenSelectionChanges);
      }
      afterMutation$(End);
    }
    function deltaApplyUpdate(
      runUpdate: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
      data?: UpdateData,
    ): void {
      assertIsNotNullish(updateDataStack);
      if (data) {
        updateDataStack.push(data);
      }
      runUpdate(stateControl);
      if (data) {
        updateDataStack.pop();
      }
    }
    delta = {
      applyMutation: deltaApplyMutation,
      applyUpdate: deltaApplyUpdate,
      setSelection: (selection, keepCollapsedSelectionTextConfigWhenSelectionChanges, data?: SelectionChangeData) => {
        if (!areSelectionsEqual(stateView.selection, selection)) {
          const currentSelection = sortAndMergeAndFixSelectionRanges(stateView.document, stateControlConfig, selection.selectionRanges);
          const previousSelection = stateView.selection;
          state.selection = currentSelection;
          const isCollapsedInText = isSelectionCollapsedInText(stateView.document, selection);
          if (!isCollapsedInText || !keepCollapsedSelectionTextConfigWhenSelectionChanges) {
            state.customCollapsedSelectionTextConfig = null;
          }
          assertIsNotNullish(updateDataStack);
          selectionChange$(
            Push({
              previousSelection,
              data,
              updateDataStack,
            }),
          );
        }
      },
      setCustomCollapsedSelectionTextConfig: (newTextConfig) => {
        state.customCollapsedSelectionTextConfig = newTextConfig;
      },
    };
    const updateQueue_ = updateQueue;
    updateQueue = [];
    updateDisposable = null;
    updateDataStack = [];
    updateQueue_.forEach((update) => {
      assertIsNotNullish(updateDataStack);
      if (update.data) {
        updateDataStack.push(update.data);
      }
      update.runUpdate(stateControl);
      if (update.data) {
        updateDataStack.push(update.data);
      }
    });
    updateDataStack = null;
    delta = null;
    finishedUpdating$(
      Push({
        didApplyMutation,
      }),
    );
  }
  const stateControl: StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> = implDisposableMethods<
    Omit<StateControl<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, keyof Disposable>
  >(
    {
      stateView,
      stateControlConfig,
      get delta() {
        if (delta === null) {
          throw new Error('Cannot access StateControl.prototype.delta outside of an update function.', {
            cause: { stateControl },
          });
        }
        return delta;
      },
      get isInUpdate() {
        return delta !== null;
      },
      queueUpdate,
      mutationPartResult$,
      viewDelta$: Source(viewDelta$),
      finishedUpdating$: Source(finishedUpdating$),
      selectionChange$: Source(selectionChange$),
      snapshotStateThroughStateView,
      transformSelectionForwardsFromFirstStateViewToSecondStateView,
    },
    disposable,
  );
  return stateControl;
}
enum MutationType {
  InsertContentsBefore = 'InsertContentsBefore',
  InsertContentsAfter = 'InsertContentsAfter',
  InsertContentsAtEnd = 'InsertContentsAtEnd',
  InsertBlocksBefore = 'InsertBlocksBefore',
  InsertBlocksAfter = 'InsertBlocksAfter',
  InsertBlocksAtEnd = 'InsertBlocksAtEnd',
  MoveContentsBefore = 'MoveContentsBefore',
  MoveContentsAfter = 'MoveContentsAfter',
  MoveContentsAtEnd = 'MoveContentsAtEnd',
  MoveBlocksBefore = 'MoveBlocksBefore',
  MoveBlocksAfter = 'MoveBlocksAfter',
  MoveBlocksAtEnd = 'MoveBlocksAtEnd',
  SplitParagraphBackwards = 'SplitParagraphBackwards',
  SplitParagraphForwards = 'SplitParagraphForwards',
  JoinParagraphsBackwards = 'JoinParagraphsBackwards',
  JoinParagraphsForwards = 'JoinParagraphsForwards',
  RemoveContents = 'RemoveContents',
  RemoveBlocks = 'RemoveBlocks',
  SpliceParagraph = 'SpliceParagraph',
  UpdateTextConfigBetweenParagraphPoints = 'UpdateTextConfigBetweenParagraphPoints',
  UpdateParagraphConfigBetweenBlockPoints = 'UpdateParagraphConfigBetweenBlockPoints',
  ChangeTextConfigBetweenParagraphPoints = 'ChangeTextConfigBetweenParagraphPoints',
  ChangeParagraphConfigBetweenBlockPoints = 'ChangeParagraphConfigBetweenBlockPoints',
  UpdateDocumentConfig = 'UpdateDocumentConfig',
  UpdateContentConfig = 'UpdateContentConfig',
  UpdateEmbedConfig = 'UpdateEmbedConfig',
  UpdateVoidConfig = 'UpdateVoidConfig',
  ChangeDocumentConfig = 'ChangeDocumentConfig',
  ChangeContentConfig = 'ChangeContentConfig',
  ChangeEmbedConfig = 'ChangeEmbedConfig',
  ChangeVoidConfig = 'ChangeVoidConfig',
  RegisterTopLevelContent = 'RegisterTopLevelContent',
}
interface InsertContentsBeforeMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertContentsBefore;
  insertBeforeContentReference: ContentReference;
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertContentsBeforeMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  insertBeforeContentReference: ContentReference,
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertContentsBeforeMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertContentsBefore,
    insertBeforeContentReference,
    contentListFragment,
  };
}
interface InsertContentsAfterMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertContentsAfter;
  insertAfterContentReference: ContentReference;
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertContentsAfterMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  insertAfterContentReference: ContentReference,
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertContentsAfterMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertContentsAfter,
    insertAfterContentReference,
    contentListFragment,
  };
}
interface InsertContentsAtEndMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertContentsAtEnd;
  embedPoint: BlockPoint;
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertContentsAtEndMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  embedPoint: BlockPoint,
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertContentsAtEndMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertContentsAtEnd,
    embedPoint,
    contentListFragment,
  };
}
interface InsertBlocksBeforeMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertBlocksBefore;
  insertBeforeBlockPoint: BlockPoint;
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertBlocksBeforeMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  insertBeforeBlockPoint: BlockPoint,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertBlocksBeforeMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertBlocksBefore,
    insertBeforeBlockPoint,
    contentFragment,
  };
}
interface InsertBlocksAfterMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertBlocksAfter;
  insertAfterBlockPoint: BlockPoint;
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertBlocksAfterMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  insertAfterBlockPoint: BlockPoint,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertBlocksAfterMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertBlocksAfter,
    insertAfterBlockPoint,
    contentFragment,
  };
}
interface InsertBlocksAtEndMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.InsertBlocksAtEnd;
  contentReference: ContentReference;
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeInsertBlocksAtEndMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentReference: ContentReference,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): InsertBlocksAtEndMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.InsertBlocksAtEnd,
    contentReference,
    contentFragment,
  };
}
interface MoveContentsBeforeMutation {
  type: MutationType.MoveContentsBefore;
  startContentReference: ContentReference;
  endContentReference: ContentReference;
  moveBeforeContentReference: ContentReference;
}
function makeMoveContentsBeforeMutation(
  startContentReference: ContentReference,
  endContentReference: ContentReference,
  moveBeforeContentReference: ContentReference,
): MoveContentsBeforeMutation {
  return {
    type: MutationType.MoveContentsBefore,
    startContentReference,
    endContentReference,
    moveBeforeContentReference,
  };
}
interface MoveContentsAfterMutation {
  type: MutationType.MoveContentsAfter;
  startContentReference: ContentReference;
  endContentReference: ContentReference;
  moveAfterContentReference: ContentReference;
}
function makeMoveContentsAfterMutation(
  startContentReference: ContentReference,
  endContentReference: ContentReference,
  moveAfterContentReference: ContentReference,
): MoveContentsAfterMutation {
  return {
    type: MutationType.MoveContentsAfter,
    startContentReference,
    endContentReference,
    moveAfterContentReference,
  };
}
interface MoveContentsAtEndMutation {
  type: MutationType.MoveContentsAtEnd;
  startContentReference: ContentReference;
  endContentReference: ContentReference;
  embedPoint: BlockPoint;
}
function makeMoveContentsAtEndMutation(
  startContentReference: ContentReference,
  endContentReference: ContentReference,
  embedPoint: BlockPoint,
): MoveContentsAtEndMutation {
  return {
    type: MutationType.MoveContentsAtEnd,
    startContentReference,
    endContentReference,
    embedPoint,
  };
}
interface MoveBlocksBeforeMutation {
  type: MutationType.MoveBlocksBefore;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
  moveBeforeBlockPoint: BlockPoint;
}
function makeMoveBlocksBeforeMutation(startBlockPoint: BlockPoint, endBlockPoint: BlockPoint, moveBeforeBlockPoint: BlockPoint): MoveBlocksBeforeMutation {
  return {
    type: MutationType.MoveBlocksBefore,
    startBlockPoint,
    endBlockPoint,
    moveBeforeBlockPoint,
  };
}
interface MoveBlocksAfterMutation {
  type: MutationType.MoveBlocksAfter;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
  moveAfterBlockPoint: BlockPoint;
}
function makeMoveBlocksAfterMutation(startBlockPoint: BlockPoint, endBlockPoint: BlockPoint, moveAfterBlockPoint: BlockPoint): MoveBlocksAfterMutation {
  return {
    type: MutationType.MoveBlocksAfter,
    startBlockPoint,
    endBlockPoint,
    moveAfterBlockPoint,
  };
}
interface MoveBlocksAtEndMutation {
  type: MutationType.MoveBlocksAtEnd;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
  contentReference: ContentReference;
}
function makeMoveBlocksAtEndMutation(startBlockPoint: BlockPoint, endBlockPoint: BlockPoint, contentReference: ContentReference): MoveBlocksAtEndMutation {
  return {
    type: MutationType.MoveBlocksAtEnd,
    startBlockPoint,
    endBlockPoint,
    contentReference,
  };
}
interface SplitParagraphBackwardsMutation<ParagraphConfig extends NodeConfig> {
  type: MutationType.SplitParagraphBackwards;
  splitAtParagraphPoint: ParagraphPoint;
  newParagraphConfig: ParagraphConfig;
  newParagraphId: string;
}
function makeSplitParagraphBackwardsMutation<ParagraphConfig extends NodeConfig>(
  splitAtParagraphPoint: ParagraphPoint,
  newParagraphConfig: ParagraphConfig,
  newParagraphId: string,
): SplitParagraphBackwardsMutation<ParagraphConfig> {
  return {
    type: MutationType.SplitParagraphBackwards,
    splitAtParagraphPoint,
    newParagraphConfig,
    newParagraphId,
  };
}
interface SplitParagraphForwardsMutation<ParagraphConfig extends NodeConfig> {
  type: MutationType.SplitParagraphForwards;
  splitAtParagraphPoint: ParagraphPoint;
  newParagraphConfig: ParagraphConfig;
  newParagraphId: string;
}
function makeSplitParagraphForwardsMutation<ParagraphConfig extends NodeConfig>(
  splitAtParagraphPoint: ParagraphPoint,
  newParagraphConfig: ParagraphConfig,
  newParagraphId: string,
): SplitParagraphForwardsMutation<ParagraphConfig> {
  return {
    type: MutationType.SplitParagraphForwards,
    splitAtParagraphPoint,
    newParagraphConfig,
    newParagraphId,
  };
}
interface JoinParagraphsBackwardsMutation {
  type: MutationType.JoinParagraphsBackwards;
  firstParagraphPoint: ParagraphPoint;
}
function makeJoinParagraphsBackwardsMutation(firstParagraphPoint: ParagraphPoint): JoinParagraphsBackwardsMutation {
  return {
    type: MutationType.JoinParagraphsBackwards,
    firstParagraphPoint,
  };
}
interface JoinParagraphsForwardsMutation {
  type: MutationType.JoinParagraphsForwards;
  secondParagraphPoint: ParagraphPoint;
}
function makeJoinParagraphsForwardsMutation(secondParagraphPoint: ParagraphPoint): JoinParagraphsForwardsMutation {
  return {
    type: MutationType.JoinParagraphsForwards,
    secondParagraphPoint,
  };
}
interface RemoveContentsMutation {
  type: MutationType.RemoveContents;
  startContentReference: ContentReference;
  endContentReference: ContentReference;
}
function makeRemoveContentsMutation(startContentReference: ContentReference, endContentReference: ContentReference): RemoveContentsMutation {
  return {
    type: MutationType.RemoveContents,
    startContentReference,
    endContentReference,
  };
}
interface RemoveBlocksMutation {
  type: MutationType.RemoveBlocks;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
}
function makeRemoveBlocksMutation(startBlockPoint: BlockPoint, endBlockPoint: BlockPoint): RemoveBlocksMutation {
  return {
    type: MutationType.RemoveBlocks,
    startBlockPoint,
    endBlockPoint,
  };
}
interface SpliceParagraphMutation<TextConfig extends NodeConfig, VoidConfig extends NodeConfig> {
  type: MutationType.SpliceParagraph;
  paragraphPoint: ParagraphPoint;
  removeCount: number;
  insertChildren: Inline<TextConfig, VoidConfig>[];
}
function makeSpliceParagraphMutation<TextConfig extends NodeConfig, VoidConfig extends NodeConfig>(
  paragraphPoint: ParagraphPoint,
  removeCount: number,
  insertChildren: Inline<TextConfig, VoidConfig>[],
): SpliceParagraphMutation<TextConfig, VoidConfig> {
  return {
    type: MutationType.SpliceParagraph,
    paragraphPoint,
    removeCount,
    insertChildren,
  };
}
interface UpdateTextConfigBetweenParagraphPointsMutation<TextConfig extends NodeConfig> {
  type: MutationType.UpdateTextConfigBetweenParagraphPoints;
  startParagraphPoint: ParagraphPoint;
  endParagraphPoint: ParagraphPoint;
}
function makeUpdateTextConfigBetweenParagraphPointsMutation<TextConfig extends NodeConfig>(
  startParagraphPoint: ParagraphPoint,
  endParagraphPoint: ParagraphPoint,
): UpdateTextConfigBetweenParagraphPointsMutation<TextConfig> {
  return {
    type: MutationType.UpdateTextConfigBetweenParagraphPoints,
    startParagraphPoint,
    endParagraphPoint,
  };
}
interface UpdateParagraphConfigBetweenBlockPointsMutation<ParagraphConfig extends NodeConfig> {
  type: MutationType.UpdateParagraphConfigBetweenBlockPoints;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
}
function makeUpdateParagraphConfigBetweenBlockPointsMutation<ParagraphConfig extends NodeConfig>(
  startBlockPoint: BlockPoint,
  endBlockPoint: BlockPoint,
): UpdateParagraphConfigBetweenBlockPointsMutation<ParagraphConfig> {
  return {
    type: MutationType.UpdateParagraphConfigBetweenBlockPoints,
    startBlockPoint,
    endBlockPoint,
  };
}
interface ChangeTextConfigBetweenParagraphPointsMutation<TextConfig extends NodeConfig> {
  type: MutationType.ChangeTextConfigBetweenParagraphPoints;
  startParagraphPoint: ParagraphPoint;
  endParagraphPoint: ParagraphPoint;
  newTextConfig: TextConfig;
}
function makeChangeTextConfigBetweenParagraphPoints<TextConfig extends NodeConfig>(
  startParagraphPoint: ParagraphPoint,
  endParagraphPoint: ParagraphPoint,
  newTextConfig: TextConfig,
): ChangeTextConfigBetweenParagraphPointsMutation<TextConfig> {
  return {
    type: MutationType.ChangeTextConfigBetweenParagraphPoints,
    startParagraphPoint,
    endParagraphPoint,
    newTextConfig,
  };
}
interface ChangeParagraphConfigBetweenBlockPointsMutation<ParagraphConfig extends NodeConfig> {
  type: MutationType.ChangeParagraphConfigBetweenBlockPoints;
  startBlockPoint: BlockPoint;
  endBlockPoint: BlockPoint;
  paragraphConfig: ParagraphConfig;
}
function makeChangeParagraphConfigBetweenBlockPointsMutation<ParagraphConfig extends NodeConfig>(
  startBlockPoint: BlockPoint,
  endBlockPoint: BlockPoint,
  paragraphConfig: ParagraphConfig,
): ChangeParagraphConfigBetweenBlockPointsMutation<ParagraphConfig> {
  return {
    type: MutationType.ChangeParagraphConfigBetweenBlockPoints,
    startBlockPoint,
    endBlockPoint,
    paragraphConfig,
  };
}
interface UpdateDocumentConfigMutation<DocumentConfig extends NodeConfig> {
  type: MutationType.UpdateDocumentConfig;
}
function makeUpdateDocumentConfigMutation<DocumentConfig extends NodeConfig>(): UpdateDocumentConfigMutation<DocumentConfig> {
  return {
    type: MutationType.UpdateDocumentConfig,
  };
}
interface UpdateContentConfigMutation<ContentConfig extends NodeConfig> {
  type: MutationType.UpdateContentConfig;
  contentReference: ContentReference;
}
function makeUpdateContentConfigMutation<ContentConfig extends NodeConfig>(contentReference: ContentReference): UpdateContentConfigMutation<ContentConfig> {
  return {
    type: MutationType.UpdateContentConfig,
    contentReference,
  };
}
interface UpdateEmbedConfigMutation<EmbedConfig extends NodeConfig> {
  type: MutationType.UpdateEmbedConfig;
  embedBlockPoint: BlockPoint;
}
function makeUpdateEmbedConfigMutation<EmbedConfig extends NodeConfig>(embedBlockPoint: BlockPoint): UpdateEmbedConfigMutation<EmbedConfig> {
  return {
    type: MutationType.UpdateEmbedConfig,
    embedBlockPoint,
  };
}
interface UpdateVoidConfigMutation<VoidConfig extends NodeConfig> {
  type: MutationType.UpdateVoidConfig;
  voidStartParagraphPoint: ParagraphPoint;
}
function makeUpdateVoidConfigMutation<VoidConfig extends NodeConfig>(voidStartParagraphPoint: ParagraphPoint): UpdateVoidConfigMutation<VoidConfig> {
  return {
    type: MutationType.UpdateVoidConfig,
    voidStartParagraphPoint,
  };
}
interface ChangeDocumentConfigMutation<DocumentConfig extends NodeConfig> {
  type: MutationType.ChangeDocumentConfig;
  newDocumentConfig: DocumentConfig;
}
function makeChangeDocumentConfigMutation<DocumentConfig extends NodeConfig>(newDocumentConfig: DocumentConfig): ChangeDocumentConfigMutation<DocumentConfig> {
  return {
    type: MutationType.ChangeDocumentConfig,
    newDocumentConfig,
  };
}
interface ChangeContentConfigMutation<ContentConfig extends NodeConfig> {
  type: MutationType.ChangeContentConfig;
  contentReference: ContentReference;
  newContentConfig: ContentConfig;
}
function makeChangeContentConfigMutation<ContentConfig extends NodeConfig>(
  contentReference: ContentReference,
  newContentConfig: ContentConfig,
): ChangeContentConfigMutation<ContentConfig> {
  return {
    type: MutationType.ChangeContentConfig,
    contentReference,
    newContentConfig,
  };
}
interface ChangeEmbedConfigMutation<EmbedConfig extends NodeConfig> {
  type: MutationType.ChangeEmbedConfig;
  embedBlockPoint: BlockPoint;
  newEmbedConfig: EmbedConfig;
}
function makeChangeEmbedConfigMutation<EmbedConfig extends NodeConfig>(
  embedBlockPoint: BlockPoint,
  newEmbedConfig: EmbedConfig,
): ChangeEmbedConfigMutation<EmbedConfig> {
  return {
    type: MutationType.ChangeEmbedConfig,
    embedBlockPoint,
    newEmbedConfig,
  };
}
interface ChangeVoidConfigMutation<VoidConfig extends NodeConfig> {
  type: MutationType.ChangeVoidConfig;
  voidStartParagraphPoint: ParagraphPoint;
  newVoidConfig: VoidConfig;
}
function makeChangeVoidConfigMutation<VoidConfig extends NodeConfig>(
  voidStartParagraphPoint: ParagraphPoint,
  newVoidConfig: VoidConfig,
): ChangeVoidConfigMutation<VoidConfig> {
  return {
    type: MutationType.ChangeVoidConfig,
    voidStartParagraphPoint,
    newVoidConfig,
  };
}
interface RegisterTopLevelContentMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  type: MutationType.RegisterTopLevelContent;
  contentId: string;
  contentConfig: ContentConfig;
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
}
function makeRegisterTopLevelContentMutation<
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentId: string,
  contentConfig: ContentConfig,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): RegisterTopLevelContentMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    type: MutationType.RegisterTopLevelContent,
    contentId,
    contentConfig,
    contentFragment,
  };
}
type Mutation<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> =
  | InsertContentsBeforeMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | InsertContentsAfterMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | InsertContentsAtEndMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | InsertBlocksBeforeMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | InsertBlocksAfterMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | InsertBlocksAtEndMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  | MoveContentsBeforeMutation
  | MoveContentsAfterMutation
  | MoveContentsAtEndMutation
  | MoveBlocksBeforeMutation
  | MoveBlocksAfterMutation
  | MoveBlocksAtEndMutation
  | SplitParagraphBackwardsMutation<ParagraphConfig>
  | SplitParagraphForwardsMutation<ParagraphConfig>
  | JoinParagraphsBackwardsMutation
  | JoinParagraphsForwardsMutation
  | RemoveContentsMutation
  | RemoveBlocksMutation
  | SpliceParagraphMutation<TextConfig, VoidConfig>
  | UpdateTextConfigBetweenParagraphPointsMutation<TextConfig>
  | UpdateParagraphConfigBetweenBlockPointsMutation<ParagraphConfig>
  | ChangeTextConfigBetweenParagraphPointsMutation<TextConfig>
  | ChangeParagraphConfigBetweenBlockPointsMutation<ParagraphConfig>
  | UpdateDocumentConfigMutation<DocumentConfig>
  | UpdateContentConfigMutation<ContentConfig>
  | UpdateEmbedConfigMutation<EmbedConfig>
  | UpdateVoidConfigMutation<VoidConfig>
  | ChangeDocumentConfigMutation<DocumentConfig>
  | ChangeContentConfigMutation<ContentConfig>
  | ChangeEmbedConfigMutation<EmbedConfig>
  | ChangeVoidConfigMutation<VoidConfig>
  | RegisterTopLevelContentMutation<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
const BatchMutationBrandSymbol = Symbol('BatchMutationBrand');
interface BatchMutation<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  [BatchMutationBrandSymbol]: undefined;
  readonly mutations: readonly (
    | Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
    | BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  )[];
}
class BatchMutationMustContainMutationsError extends Error {
  name = 'BatchMutationMustContainMutationsError';
  constructor(options?: ErrorOptions) {
    super('Batch mutation was made without any mutations.', options);
  }
}
function makeBatchMutation<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  mutations: (
    | Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
    | BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>
  )[],
): BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (mutations.length === 0) {
    throw new BatchMutationMustContainMutationsError();
  }
  return {
    [BatchMutationBrandSymbol]: undefined,
    mutations,
  };
}
function isBatchMutation(candidate: unknown): candidate is BatchMutation<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig> {
  return typeof candidate === 'object' && candidate !== null && BatchMutationBrandSymbol in candidate;
}
function forEachMutationInBatchMutation<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  batchMutation: BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  onMutation: (mutation: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, index: number, isLast: boolean) => void,
  index = { value: 0 },
  isLast = true,
): number {
  batchMutation.mutations.forEach((mutation, i) => {
    const isLast_ = isLast && i === batchMutation.mutations.length - 1;
    if (isBatchMutation(mutation)) {
      forEachMutationInBatchMutation(mutation, onMutation, index, isLast_);
    } else {
      onMutation(mutation, index.value, isLast_);
      index.value++;
    }
  });
  return index.value;
}
interface NoChangeMutationResult {
  didChange: false;
}
interface ChangedMutationResult<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> {
  didChange: true;
  reverseMutation: BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
  transformSelectionRange: TransformSelectionRangeFn | null;
}
type MutationResult<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> = NoChangeMutationResult | ChangedMutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
function makeChangedMutationResult<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  reverseMutation: BatchMutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  transformSelectionRange: TransformSelectionRangeFn | null,
): ChangedMutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return {
    didChange: true,
    reverseMutation,
    transformSelectionRange,
  };
}
function makeNoChangeMutationResult(): NoChangeMutationResult {
  return {
    didChange: false,
  };
}
class MutationNodeEndBeforeStartError extends Error {
  name = 'MutationNodeEndBeforeStartError';
  constructor(options?: ErrorOptions) {
    super('The end node is before the start node in a mutation.', options);
  }
}
function removeContentsFromEmbedAtBlockReferenceBetweenContentReferences<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
  startContentIndex: number,
  endContentIndex: number,
  viewDeltaControl: ViewDeltaControl | null,
  moveAfter: {
    contentReference: ContentReference | null;
    embedReference: BlockReference;
  } | null,
): ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (endContentIndex < startContentIndex) {
    throw new MutationNodeEndBeforeStartError({
      cause: {
        document,
        embedReference,
        startContentIndex,
        endContentIndex,
      },
    });
  }
  const contentListFragmentContents: ContentListFragmentContent<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
  const onNestedEmbed = (
    embed: Embed<EmbedConfig>,
    nestedContents: NestedContent<ContentConfig>[],
    nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
  ): void => {
    const embedReference = makeBlockReferenceFromBlock(embed);
    for (let i = 0; i <= getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference); i++) {
      const content = accessContentAtIndexInEmbedAtBlockReference(document, embedReference, i);
      nestedContents.push(makeNestedContent(cloneContent(content), embedReference));
      onContent(content, nestedContents, nestedBlocks);
    }
  };
  const onContent = (
    content: Content<ContentConfig>,
    nestedContents: NestedContent<ContentConfig>[],
    nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
  ): void => {
    const contentReference = makeContentReferenceFromContent(content);
    const numberOfBlocks = getNumberOfBlocksInContentAtContentReference(document, contentReference);
    for (let i = 0; i < numberOfBlocks; i++) {
      const block = accessBlockAtIndexInContentAtContentReference(document, contentReference, i);
      nestedBlocks.push(makeNestedBlock(cloneBlock(block), contentReference));
      if (isEmbed(block)) {
        onNestedEmbed(block, nestedContents, nestedBlocks);
      }
      unregisterBlockAtBlockReferenceInDocument(document, makeBlockReferenceFromBlock(block));
    }
    unregisterContentAtContentReferenceInDocument(document, contentReference);
  };
  for (let i = startContentIndex; i <= endContentIndex; i++) {
    const content = accessContentAtIndexInEmbedAtBlockReference(document, embedReference, i);
    const nestedContents: NestedContent<ContentConfig>[] = [];
    const nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    contentListFragmentContents.push(makeContentListFragmentContent(content, nestedContents, nestedBlocks));
    onContent(content, nestedContents, nestedBlocks);
    const contentReference = makeContentReferenceFromContent(content);
    viewDeltaControl?.markContentAtContentReferenceRemovedInEmbedAtBlockReference(contentReference, embedReference);
    if (moveAfter) {
      viewDeltaControl?.markContentAtContentReferenceInsertedAfterContentReferenceInEmbedAtBlockReference(
        contentReference,
        moveAfter.contentReference,
        moveAfter.embedReference,
      );
    }
  }
  const embed = accessBlockFromBlockReference(document, embedReference);
  assertIsEmbed(embed);
  embed.contentReferences.splice(startContentIndex, endContentIndex - startContentIndex + 1);
  return makeContentListFragment(contentListFragmentContents);
}
function removeBlocksFromContentAtContentReferenceBetweenBlockPoints<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  startBlockIndex: number,
  endBlockIndex: number,
  viewDeltaControl: ViewDeltaControl | null,
  moveAfter: {
    blockReference: BlockReference | null;
    contentReference: ContentReference;
  } | null,
): ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  if (endBlockIndex < startBlockIndex) {
    throw new MutationNodeEndBeforeStartError({
      cause: {
        document,
        contentReference,
        startBlockIndex,
        endBlockIndex,
      },
    });
  }
  const contentFragmentBlocks: ContentFragmentBlock<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
  const onNestedEmbed = (
    embed: Embed<EmbedConfig>,
    nestedContents: NestedContent<ContentConfig>[],
    nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
  ): void => {
    const embedReference = makeBlockReferenceFromBlock(embed);
    for (let i = 0; i <= getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference); i++) {
      const content = accessContentAtIndexInEmbedAtBlockReference(document, embedReference, i);
      nestedContents.push(makeNestedContent(cloneContent(content), embedReference));
      onContent(content, nestedContents, nestedBlocks);
    }
  };
  const onContent = (
    content: Content<ContentConfig>,
    nestedContents: NestedContent<ContentConfig>[],
    nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[],
  ): void => {
    const contentReference = makeContentReferenceFromContent(content);
    const numberOfBlocks = getNumberOfBlocksInContentAtContentReference(document, contentReference);
    for (let i = 0; i < numberOfBlocks; i++) {
      const block = accessBlockAtIndexInContentAtContentReference(document, contentReference, i);
      nestedBlocks.push(makeNestedBlock(cloneBlock(block), contentReference));
      if (isEmbed(block)) {
        onNestedEmbed(block, nestedContents, nestedBlocks);
      }
      unregisterBlockAtBlockReferenceInDocument(document, makeBlockReferenceFromBlock(block));
    }
    unregisterContentAtContentReferenceInDocument(document, contentReference);
  };
  for (let i = startBlockIndex; i <= endBlockIndex; i++) {
    const block = accessBlockAtIndexInContentAtContentReference(document, contentReference, i);
    if (isParagraph(block)) {
      contentFragmentBlocks.push(makeContentFragmentParagraph(cloneParagraph(block)));
    } else {
      const nestedContents: NestedContent<ContentConfig>[] = [];
      const nestedBlocks: NestedBlock<ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
      contentFragmentBlocks.push(makeContentFragmentEmbed(block, nestedContents, nestedBlocks));
      onNestedEmbed(block, nestedContents, nestedBlocks);
    }
    const blockReference = makeBlockReferenceFromBlock(block);
    unregisterBlockAtBlockReferenceInDocument(document, blockReference);
    if (moveAfter) {
      viewDeltaControl?.markBlockAtBlockReferenceMovedAfterBlockReferenceInContentAtContentReference(
        blockReference,
        moveAfter.blockReference,
        moveAfter.contentReference,
      );
    } else {
      viewDeltaControl?.markBlockAtBlockReferenceRemovedInContentAtContentReference(blockReference, contentReference);
    }
  }
  const content = accessContentFromContentReference(document, contentReference);
  content.blockReferences.splice(startBlockIndex, endBlockIndex - startBlockIndex + 1);
  return makeContentFragment(contentFragmentBlocks);
}
function registerContentListFragmentContents<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  embedReference: BlockReference,
  contentListFragment: ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): void {
  contentListFragment.contentListFragmentContents.forEach(({ content, nestedBlocks, nestedContents }) => {
    registerContentInDocument(document, cloneContent(content), embedReference);
    nestedContents.forEach(({ content, embedReference }) => {
      registerContentInDocument(document, cloneContent(content), embedReference);
    });
    nestedBlocks.forEach(({ block, contentReference }) => {
      registerBlockInDocument(document, cloneBlock(block), contentReference);
    });
  });
}
function registerContentFragmentBlocks<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  contentReference: ContentReference,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): void {
  contentFragment.contentFragmentBlocks.forEach((contentFragmentBlock) => {
    if (isContentFragmentParagraph(contentFragmentBlock)) {
      const { paragraph } = contentFragmentBlock;
      registerBlockInDocument(document, cloneParagraph(paragraph), contentReference);
    } else {
      const { nestedBlocks, nestedContents } = contentFragmentBlock;
      nestedContents.forEach(({ content, embedReference }) => {
        registerContentInDocument(document, cloneContent(content), embedReference);
      });
      nestedBlocks.forEach(({ block, contentReference }) => {
        registerBlockInDocument(document, cloneBlock(block), contentReference);
      });
    }
  });
}
function makeRemoveContentsSelectionTransformFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  startContentReference: ContentReference,
  getContentListFragment: () => ContentListFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateViewAfterMutation: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, // TODO: do without time travel?.
): TransformSelectionRangeFn {
  const lastPreviousPointText = accessLastPreviousPointToContentAtContentReference(document, startContentReference, SelectionRangeIntention.Text);
  const lastPreviousPointBlock = accessLastPreviousPointToContentAtContentReference(document, startContentReference, SelectionRangeIntention.Block);
  const lastPreviousPointTextContentReference =
    lastPreviousPointText &&
    makeContentReferenceFromContent(
      isBlockPoint(lastPreviousPointText)
        ? accessContentFromBlockPoint(document, lastPreviousPointText)
        : accessContentFromParagraphPoint(document, lastPreviousPointText),
    );
  const lastPreviousPointBlockContentReference =
    lastPreviousPointBlock &&
    makeContentReferenceFromContent(
      isBlockPoint(lastPreviousPointBlock)
        ? accessContentFromBlockPoint(document, lastPreviousPointBlock)
        : accessContentFromParagraphPoint(document, lastPreviousPointBlock),
    );
  return (selectionRange) => {
    const newSelectionRanges = selectionRange.ranges.filter((range) => {
      return !getContentListFragment().contentListFragmentContents.some(
        (contentListFragmentContent) =>
          areContentReferencesAtSameContent(range.contentReference, makeContentReferenceFromContent(contentListFragmentContent.content)) ||
          contentListFragmentContent.nestedContents.some((nestedContent) =>
            areContentReferencesAtSameContent(range.contentReference, makeContentReferenceFromContent(nestedContent.content)),
          ),
      );
    });
    if (newSelectionRanges.length === 0) {
      const lastPreviousPoint =
        selectionRange.intention === SelectionRangeIntention.Text
          ? lastPreviousPointText
          : selectionRange.intention === SelectionRangeIntention.Block
          ? lastPreviousPointBlock
          : assertUnreachable(selectionRange.intention);
      const lastPreviousPointContentReference =
        selectionRange.intention === SelectionRangeIntention.Text
          ? lastPreviousPointTextContentReference
          : selectionRange.intention === SelectionRangeIntention.Block
          ? lastPreviousPointBlockContentReference
          : assertUnreachable(selectionRange.intention);
      if (lastPreviousPoint === null) {
        return null;
      }
      const rangeId = generateId();
      assertIsNotNullish(lastPreviousPointContentReference);
      return makeSelectionRange(
        [makeRange(lastPreviousPointContentReference, lastPreviousPoint, lastPreviousPoint, rangeId)],
        rangeId,
        rangeId,
        selectionRange.intention,
        selectionRange.data,
        selectionRange.id,
      );
    }
    let isSelectionRangeAnchorAfterFocus: boolean | null = null;
    const getIsSelectionRangeAnchorAfterFocusCached = (): boolean => {
      if (isSelectionRangeAnchorAfterFocus === null) {
        isSelectionRangeAnchorAfterFocus = getIsSelectionRangeAnchorAfterFocus(stateViewAfterMutation.document, selectionRange);
      }
      return isSelectionRangeAnchorAfterFocus;
    };
    return makeSelectionRange(
      newSelectionRanges,
      newSelectionRanges.find((range) => range.id === selectionRange.anchorRangeId)?.id ??
        (getIsSelectionRangeAnchorAfterFocusCached() ? newSelectionRanges[newSelectionRanges.length - 1] : newSelectionRanges[0]).id,
      newSelectionRanges.find((range) => range.id === selectionRange.focusRangeId)?.id ??
        (getIsSelectionRangeAnchorAfterFocusCached() ? newSelectionRanges[0] : newSelectionRanges[newSelectionRanges.length - 1]).id,
      selectionRange.intention,
      selectionRange.data,
      selectionRange.id,
    );
  };
}
function makeRemoveBlocksSelectionTransformFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  startBlockPoint: BlockPoint,
  contentReference: ContentReference,
  startBlockIndex: number,
  endBlockIndex: number,
  getContentFragment: () => ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateViewAfterMutation: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>, // TODO: do without time travel?.
): TransformSelectionRangeFn {
  const lastPreviousPointText = accessLastPreviousPointToBlockAtBlockReference(
    document,
    makeBlockReferenceFromBlockPoint(startBlockPoint),
    SelectionRangeIntention.Text,
  );
  const lastPreviousPointBlock = accessLastPreviousPointToBlockAtBlockReference(
    document,
    makeBlockReferenceFromBlockPoint(startBlockPoint),
    SelectionRangeIntention.Block,
  );
  const lastPreviousPointTextContentReference =
    lastPreviousPointText &&
    makeContentReferenceFromContent(
      isBlockPoint(lastPreviousPointText)
        ? accessContentFromBlockPoint(document, lastPreviousPointText)
        : accessContentFromParagraphPoint(document, lastPreviousPointText),
    );
  const lastPreviousPointBlockContentReference =
    lastPreviousPointBlock &&
    makeContentReferenceFromContent(
      isBlockPoint(lastPreviousPointBlock)
        ? accessContentFromBlockPoint(document, lastPreviousPointBlock)
        : accessContentFromParagraphPoint(document, lastPreviousPointBlock),
    );
  return (selectionRange) => {
    const lastPreviousPoint =
      selectionRange.intention === SelectionRangeIntention.Text
        ? lastPreviousPointText
        : selectionRange.intention === SelectionRangeIntention.Block
        ? lastPreviousPointBlock
        : assertUnreachable(selectionRange.intention);
    const lastPreviousPointContentReference =
      selectionRange.intention === SelectionRangeIntention.Text
        ? lastPreviousPointTextContentReference
        : selectionRange.intention === SelectionRangeIntention.Block
        ? lastPreviousPointBlockContentReference
        : assertUnreachable(selectionRange.intention);
    const newSelectionRanges = selectionRange.ranges.flatMap((range) => {
      if (
        getContentFragment().contentFragmentBlocks.some(
          (contentFragmentBlock) =>
            isContentFragmentEmbed(contentFragmentBlock) &&
            contentFragmentBlock.nestedContents.some((nestedContent) =>
              areContentReferencesAtSameContent(range.contentReference, makeContentReferenceFromContent(nestedContent.content)),
            ),
        )
      ) {
        return [];
      }
      if (!areContentReferencesAtSameContent(range.contentReference, contentReference)) {
        return [range];
      }
      function makePointNullIfRemoved(point: Point): Point | null {
        if (isStartOfContentPoint(point) || isEndOfContentPoint(point)) {
          return point;
        }
        const pointBlockReference = isBlockPoint(point) ? makeBlockReferenceFromBlockPoint(point) : makeBlockReferenceFromParagraphPoint(point);
        return getContentFragment().contentFragmentBlocks.some((contentFragmentBlock) =>
          areBlockReferencesAtSameBlock(pointBlockReference, makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock))),
        )
          ? null
          : point;
      }
      let transformedStartPoint = makePointNullIfRemoved(range.startPoint);
      let transformedEndPoint = makePointNullIfRemoved(range.endPoint);
      if (transformedStartPoint === null && transformedEndPoint === null) {
        return [];
      }
      const transformedStartPointContentReference = transformedStartPoint === null ? lastPreviousPointContentReference : range.contentReference;
      const transformedEndPointContentReference = transformedEndPoint === null ? lastPreviousPointContentReference : range.contentReference;
      transformedStartPoint ??= lastPreviousPoint;
      transformedEndPoint ??= lastPreviousPoint;
      if (transformedStartPoint === null || transformedEndPoint === null) {
        return [];
      }
      assertIsNotNullish(transformedStartPointContentReference);
      assertIsNotNullish(transformedEndPointContentReference);
      return makeRangesConnectingPointsAtContentReferences(
        stateViewAfterMutation.document,
        transformedStartPointContentReference,
        transformedStartPoint,
        transformedEndPointContentReference,
        transformedEndPoint,
        range.id,
      );
    });
    if (newSelectionRanges.length === 0) {
      if (lastPreviousPoint === null) {
        return null;
      }
      const rangeId = generateId();
      assertIsNotNullish(lastPreviousPointContentReference);
      return makeSelectionRange(
        [makeRange(lastPreviousPointContentReference, lastPreviousPoint, lastPreviousPoint, rangeId)],
        rangeId,
        rangeId,
        selectionRange.intention,
        selectionRange.data,
        selectionRange.id,
      );
    }
    let isSelectionRangeAnchorAfterFocus: boolean | null = null;
    const getIsSelectionRangeAnchorAfterFocusCached = (): boolean => {
      if (isSelectionRangeAnchorAfterFocus === null) {
        isSelectionRangeAnchorAfterFocus = getIsSelectionRangeAnchorAfterFocus(stateViewAfterMutation.document, selectionRange);
      }
      return isSelectionRangeAnchorAfterFocus;
    };
    return makeSelectionRange(
      newSelectionRanges,
      newSelectionRanges.find((range) => range.id === selectionRange.anchorRangeId)?.id ??
        (getIsSelectionRangeAnchorAfterFocusCached() ? newSelectionRanges[newSelectionRanges.length - 1] : newSelectionRanges[0]).id,
      newSelectionRanges.find((range) => range.id === selectionRange.focusRangeId)?.id ??
        (getIsSelectionRangeAnchorAfterFocusCached() ? newSelectionRanges[0] : newSelectionRanges[newSelectionRanges.length - 1]).id,
      selectionRange.intention,
      selectionRange.data,
      selectionRange.id,
    );
  };
}
function applyMutation<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  mutation: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  viewDeltaControl: ViewDeltaControl | null,
  stateViewAfterMutation: StateView<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> | null,
): MutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  switch (mutation.type) {
    case MutationType.InsertContentsBefore:
    case MutationType.InsertContentsAfter: {
      const { contentListFragment } = mutation;
      const { contentListFragmentContents } = contentListFragment;
      const insertionContentReference =
        mutation.type === MutationType.InsertContentsBefore ? mutation.insertBeforeContentReference : mutation.insertAfterContentReference;
      const embed = accessEmbedFromContentReference(document, insertionContentReference);
      const embedReference = makeBlockReferenceFromBlock(embed);
      registerContentListFragmentContents(document, embedReference, contentListFragment);
      const contentIndex = getIndexOfEmbedContentFromContentReference(document, insertionContentReference);
      if (viewDeltaControl) {
        let previousContentReference =
          mutation.type === MutationType.InsertContentsBefore
            ? contentIndex === 0
              ? null
              : makeContentReferenceFromContent(accessPreviousContentToContentInEmbedAtContentReference(document, insertionContentReference))
            : insertionContentReference;
        contentListFragmentContents.map(({ content }) => {
          const contentReference = makeContentReferenceFromContent(content);
          viewDeltaControl.markContentAtContentReferenceInsertedAfterContentReferenceInEmbedAtBlockReference(
            contentReference,
            previousContentReference,
            embedReference,
          );
          previousContentReference = contentReference;
        });
      }
      embed.contentReferences.splice(
        contentIndex + (mutation.type === MutationType.InsertContentsBefore ? 0 : 1),
        0,
        ...contentListFragmentContents.map(({ content }) => makeContentReferenceFromContent(content)),
      );
      return makeChangedMutationResult(
        makeBatchMutation([
          makeRemoveContentsMutation(
            makeContentReferenceFromContent(contentListFragmentContents[0].content),
            makeContentReferenceFromContent(contentListFragmentContents[contentListFragmentContents.length - 1].content),
          ),
        ]),
        null,
      );
    }
    case MutationType.InsertContentsAtEnd: {
      const { embedPoint } = mutation;
      const { contentListFragment } = mutation;
      const { contentListFragmentContents } = contentListFragment;
      const embedReference = makeBlockReferenceFromBlockPoint(embedPoint);
      registerContentListFragmentContents(document, makeBlockReferenceFromBlockPoint(embedPoint), contentListFragment);
      if (viewDeltaControl) {
        let previousContentReference =
          getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference) === 0
            ? null
            : makeContentReferenceFromContent(accessLastContentInEmbedAtBlockReference(document, embedReference));
        contentListFragmentContents.map(({ content }) => {
          const contentReference = makeContentReferenceFromContent(content);
          viewDeltaControl.markContentAtContentReferenceInsertedAfterContentReferenceInEmbedAtBlockReference(
            contentReference,
            previousContentReference,
            embedReference,
          );
          previousContentReference = contentReference;
        });
      }
      const embed = accessBlockFromBlockPoint(document, embedPoint);
      assertIsEmbed(embed);
      embed.contentReferences.push(...contentListFragmentContents.map(({ content }) => makeContentReferenceFromContent(content)));
      return makeChangedMutationResult(
        makeBatchMutation([
          makeRemoveContentsMutation(
            makeContentReferenceFromContent(contentListFragmentContents[0].content),
            makeContentReferenceFromContent(contentListFragmentContents[contentListFragmentContents.length - 1].content),
          ),
        ]),
        null,
      );
    }
    case MutationType.InsertBlocksBefore:
    case MutationType.InsertBlocksAfter: {
      const { contentFragment } = mutation;
      const { contentFragmentBlocks } = contentFragment;
      const insertionBlockPoint = mutation.type === MutationType.InsertBlocksBefore ? mutation.insertBeforeBlockPoint : mutation.insertAfterBlockPoint;
      const content = accessContentFromBlockPoint(document, insertionBlockPoint);
      const contentReference = makeContentReferenceFromContent(content);
      registerContentFragmentBlocks(document, contentReference, contentFragment);
      const blockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(insertionBlockPoint));
      if (viewDeltaControl) {
        let previousBlockReference =
          mutation.type === MutationType.InsertBlocksBefore
            ? blockIndex === 0
              ? null
              : makeBlockReferenceFromBlock(accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(insertionBlockPoint)))
            : makeBlockReferenceFromBlockPoint(insertionBlockPoint);
        contentFragmentBlocks.forEach((contentFragmentBlock) => {
          const blockReference = makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock));
          viewDeltaControl.markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference(
            blockReference,
            previousBlockReference,
            contentReference,
          );
          previousBlockReference = blockReference;
        });
      }
      content.blockReferences.splice(
        blockIndex + (mutation.type === MutationType.InsertBlocksBefore ? 0 : 1),
        0,
        ...contentFragmentBlocks.map((contentFragmentBlock) => makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock))),
      );
      return makeChangedMutationResult(
        makeBatchMutation([
          makeRemoveBlocksMutation(
            makeBlockPointFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlocks[0])),
            makeBlockPointFromBlockReference(
              makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlocks[contentFragmentBlocks.length - 1])),
            ),
          ),
        ]),
        null,
      );
    }
    case MutationType.InsertBlocksAtEnd: {
      const { contentReference } = mutation;
      const { contentFragment } = mutation;
      const { contentFragmentBlocks } = contentFragment;
      registerContentFragmentBlocks(document, contentReference, contentFragment);
      if (viewDeltaControl) {
        let previousBlockReference =
          getNumberOfBlocksInContentAtContentReference(document, contentReference) === 0
            ? null
            : makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference));
        contentFragmentBlocks.forEach((contentFragmentBlock) => {
          const blockReference = makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock));
          viewDeltaControl.markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference(
            blockReference,
            previousBlockReference,
            contentReference,
          );
          previousBlockReference = blockReference;
        });
      }
      const content = accessContentFromContentReference(document, contentReference);
      content.blockReferences.push(
        ...contentFragmentBlocks.map((contentFragmentBlock) => makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock))),
      );
      return makeChangedMutationResult(
        makeBatchMutation([
          makeRemoveBlocksMutation(
            makeBlockPointFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlocks[0])),
            makeBlockPointFromBlockReference(
              makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlocks[contentFragmentBlocks.length - 1])),
            ),
          ),
        ]),
        null,
      );
    }
    case MutationType.MoveContentsBefore:
    case MutationType.MoveContentsAfter:
    case MutationType.MoveContentsAtEnd: {
      const { startContentReference, endContentReference } = mutation;
      const embed = accessEmbedFromContentReference(document, startContentReference);
      const embedReference = makeBlockReferenceFromBlock(embed);
      const startContentIndex = getIndexOfEmbedContentFromContentReference(document, startContentReference);
      const endContentIndex = getIndexOfEmbedContentFromContentReference(document, endContentReference);
      const transformSelectionRange =
        stateViewAfterMutation && makeRemoveContentsSelectionTransformFn(document, startContentReference, () => contentListFragment, stateViewAfterMutation);
      const contentListFragment = removeContentsFromEmbedAtBlockReferenceBetweenContentReferences(
        document,
        embedReference,
        startContentIndex,
        endContentIndex,
        viewDeltaControl,
        {
          contentReference:
            mutation.type === MutationType.MoveContentsAfter
              ? mutation.moveAfterContentReference
              : mutation.type === MutationType.MoveContentsBefore
              ? areContentReferencesAtSameContent(
                  mutation.moveBeforeContentReference,
                  makeContentReferenceFromContent(accessContentAtIndexInEmbedAtBlockReference(document, embedReference, 0)),
                )
                ? null
                : makeContentReferenceFromContent(accessPreviousContentToContentInEmbedAtContentReference(document, mutation.moveBeforeContentReference))
              : getNumberOfEmbedContentsInEmbedAtBlockReference(document, embedReference) === 0
              ? null
              : makeContentReferenceFromContent(accessLastContentInEmbedAtBlockReference(document, embedReference)),
          embedReference,
        },
      );
      if (mutation.type !== MutationType.MoveContentsAtEnd) {
        const insertionContentReference =
          mutation.type === MutationType.MoveContentsBefore ? mutation.moveBeforeContentReference : mutation.moveAfterContentReference;
        const moveIntoEmbed = accessEmbedFromContentReference(document, insertionContentReference);
        registerContentListFragmentContents(document, makeBlockReferenceFromBlock(moveIntoEmbed), contentListFragment);
        const contentIndex = getIndexOfEmbedContentFromContentReference(document, insertionContentReference);
        moveIntoEmbed.contentReferences.splice(
          contentIndex + (mutation.type === MutationType.MoveContentsBefore ? 0 : 1),
          0,
          ...contentListFragment.contentListFragmentContents.map(({ content }) => makeContentReferenceFromContent(content)),
        );
      } else {
        const moveIntoEmbedPoint = mutation.embedPoint;
        registerContentListFragmentContents(document, makeBlockReferenceFromBlockPoint(moveIntoEmbedPoint), contentListFragment);
        const moveIntoEmbed = accessBlockFromBlockPoint(document, moveIntoEmbedPoint);
        assertIsEmbed(moveIntoEmbed);
        moveIntoEmbed.contentReferences.push(...contentListFragment.contentListFragmentContents.map(({ content }) => makeContentReferenceFromContent(content)));
      }
      if (startContentIndex > 0) {
        const previousContentReference = makeContentReferenceFromContent(
          accessContentAtIndexInEmbedAtBlockReference(document, embedReference, startContentIndex - 1),
        );
        return makeChangedMutationResult(
          makeBatchMutation([makeMoveContentsAfterMutation(startContentReference, endContentReference, previousContentReference)]),
          transformSelectionRange,
        );
      }
      if (endContentIndex === 0) {
        return makeChangedMutationResult(
          makeBatchMutation([makeMoveContentsAtEndMutation(startContentReference, endContentReference, makeBlockPointFromBlock(embed))]),
          transformSelectionRange,
        );
      }
      const nextContentReference = makeContentReferenceFromContent(accessContentAtIndexInEmbedAtBlockReference(document, embedReference, endContentIndex + 1));
      return makeChangedMutationResult(
        makeBatchMutation([makeMoveContentsBeforeMutation(startContentReference, endContentReference, nextContentReference)]),
        transformSelectionRange,
      );
    }
    case MutationType.MoveBlocksBefore:
    case MutationType.MoveBlocksAfter:
    case MutationType.MoveBlocksAtEnd: {
      const { startBlockPoint, endBlockPoint } = mutation;
      const content = accessContentFromBlockPoint(document, startBlockPoint);
      const contentReference = makeContentReferenceFromContent(content);
      const startBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(startBlockPoint));
      const endBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(endBlockPoint));
      const transformSelectionRange =
        stateViewAfterMutation &&
        makeRemoveBlocksSelectionTransformFn(
          document,
          startBlockPoint,
          contentReference,
          startBlockIndex,
          endBlockIndex,
          () => contentFragment,
          stateViewAfterMutation,
        );
      const contentFragment = removeBlocksFromContentAtContentReferenceBetweenBlockPoints(
        document,
        contentReference,
        startBlockIndex,
        endBlockIndex,
        viewDeltaControl,
        {
          blockReference:
            mutation.type === MutationType.MoveBlocksAfter
              ? makeBlockReferenceFromBlockPoint(mutation.moveAfterBlockPoint)
              : mutation.type === MutationType.MoveBlocksBefore
              ? areBlockReferencesAtSameBlock(
                  makeBlockReferenceFromBlockPoint(mutation.moveBeforeBlockPoint),
                  makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
                )
                ? null
                : makeBlockReferenceFromBlock(
                    accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(mutation.moveBeforeBlockPoint)),
                  )
              : getNumberOfBlocksInContentAtContentReference(document, contentReference) === 0
              ? null
              : makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)),
          contentReference,
        },
      );
      if (mutation.type !== MutationType.MoveBlocksAtEnd) {
        const insertionBlockPoint = mutation.type === MutationType.MoveBlocksBefore ? mutation.moveBeforeBlockPoint : mutation.moveAfterBlockPoint;
        const moveIntoContent = accessContentFromBlockPoint(document, insertionBlockPoint);
        registerContentFragmentBlocks(document, makeContentReferenceFromContent(moveIntoContent), contentFragment);
        const blockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(insertionBlockPoint));
        moveIntoContent.blockReferences.splice(
          blockIndex + (mutation.type === MutationType.MoveBlocksBefore ? 0 : 1),
          0,
          ...contentFragment.contentFragmentBlocks.map((contentFragmentBlock) =>
            makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock)),
          ),
        );
      } else {
        const moveIntoContentReference = mutation.contentReference;
        registerContentFragmentBlocks(document, moveIntoContentReference, contentFragment);
        const moveIntoContent = accessContentFromContentReference(document, moveIntoContentReference);
        moveIntoContent.blockReferences.push(
          ...contentFragment.contentFragmentBlocks.map((contentFragmentBlock) =>
            makeBlockReferenceFromBlock(getBlockFromContentFragmentBlock(contentFragmentBlock)),
          ),
        );
      }
      if (startBlockIndex > 0) {
        const previousBlockPoint = makeBlockPointFromBlockReference(
          makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, startBlockIndex - 1)),
        );
        return makeChangedMutationResult(
          makeBatchMutation([makeMoveBlocksAfterMutation(startBlockPoint, endBlockPoint, previousBlockPoint)]),
          transformSelectionRange,
        );
      }
      if (endBlockIndex === 0) {
        return makeChangedMutationResult(
          makeBatchMutation([makeMoveBlocksAtEndMutation(startBlockPoint, endBlockPoint, contentReference)]),
          transformSelectionRange,
        );
      }
      const nextBlockPoint = makeBlockPointFromBlockReference(
        makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, endBlockIndex + 1)),
      );
      return makeChangedMutationResult(
        makeBatchMutation([makeMoveBlocksBeforeMutation(startBlockPoint, endBlockPoint, nextBlockPoint)]),
        transformSelectionRange,
      );
    }
    case MutationType.SplitParagraphBackwards: {
      const { splitAtParagraphPoint, newParagraphConfig, newParagraphId } = mutation;
      const content = accessContentFromParagraphPoint(document, splitAtParagraphPoint);
      const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(splitAtParagraphPoint));
      const paragraph = accessParagraphFromParagraphPoint(document, splitAtParagraphPoint);
      const paragraphChildrenBeforePoint = sliceParagraphChildren(paragraph, 0, splitAtParagraphPoint.offset);
      spliceParagraphChildren(paragraph, 0, splitAtParagraphPoint.offset, []);
      const newParagraph = makeParagraph(newParagraphConfig, paragraphChildrenBeforePoint, newParagraphId);
      const contentReference = makeContentReferenceFromContent(content);
      registerBlockInDocument(document, newParagraph, contentReference);
      content.blockReferences.splice(paragraphIndex, 0, makeBlockReferenceFromBlock(newParagraph));
      if (viewDeltaControl) {
        const paragraphReference = makeBlockReferenceFromBlock(paragraph);
        if (splitAtParagraphPoint.offset > 0) {
          viewDeltaControl.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(paragraphReference);
        }
        const newParagraphReference = makeBlockReferenceFromBlock(newParagraph);
        const previousParagraphReference = areBlockReferencesAtSameBlock(
          newParagraphReference,
          makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
        )
          ? null
          : makeBlockReferenceFromBlock(accessPreviousBlockToBlockAtBlockReference(document, newParagraphReference));
        viewDeltaControl.markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference(
          newParagraphReference,
          previousParagraphReference,
          contentReference,
        );
      }
      const transformSelectionRange: TransformSelectionRangeFn = (selectionRange) => {
        return makeSelectionRange(
          selectionRange.ranges.map((range) => {
            const { contentReference, startPoint, endPoint } = range;
            if (
              isBlockPoint(startPoint) &&
              isBlockPointAtBlock(startPoint, paragraph) &&
              (isEndOfContentPoint(endPoint) || (isBlockPoint(endPoint) && isBlockPointAtBlock(endPoint, paragraph)))
            ) {
              // Expand to cover the post-split paragraph.
              return makeRange(contentReference, makeBlockPointFromBlock(newParagraph), endPoint, range.id);
            }
            let rangeDirection: RangeDirection | null = null;
            const transformPoint = (point: Point): Point => {
              return matchPointOnType<Point>(point, {
                Paragraph(point) {
                  if (isParagraphPointAtParagraph(point, paragraph) && point.offset < splitAtParagraphPoint.offset) {
                    return makeParagraphPointFromParagraphAndOffset(newParagraph, point.offset);
                  }
                  return point;
                },
                Block(point) {
                  if (!isBlockPointAtBlock(point, paragraph)) {
                    return point;
                  }
                  const direction = rangeDirection ?? (rangeDirection = getRangeDirection(document, range));
                  if (direction === RangeDirection.Forwards) {
                    if (point === startPoint) {
                      return makeBlockPointFromBlock(newParagraph);
                    }
                    return point;
                  }
                  if (direction === RangeDirection.Backwards) {
                    if (point === startPoint) {
                      return point;
                    }
                    return makeBlockPointFromBlock(newParagraph);
                  }
                  throwUnreachable();
                },
                StartOfContent(point) {
                  return point;
                },
                EndOfContent(point) {
                  return point;
                },
              });
            };
            return makeRange(contentReference, transformPoint(startPoint), transformPoint(endPoint), range.id);
          }),
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      };
      return makeChangedMutationResult(makeBatchMutation([makeJoinParagraphsForwardsMutation(splitAtParagraphPoint)]), transformSelectionRange);
    }
    case MutationType.SplitParagraphForwards: {
      const { splitAtParagraphPoint, newParagraphConfig, newParagraphId } = mutation;
      const content = accessContentFromParagraphPoint(document, splitAtParagraphPoint);
      const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(splitAtParagraphPoint));
      const paragraph = accessParagraphFromParagraphPoint(document, splitAtParagraphPoint);
      const paragraphLength = getParagraphLength(paragraph);
      const paragraphChildrenAfterPoint = sliceParagraphChildren(paragraph, splitAtParagraphPoint.offset, paragraphLength);
      spliceParagraphChildren(paragraph, splitAtParagraphPoint.offset, paragraphLength - splitAtParagraphPoint.offset, []);
      const newParagraph = makeParagraph(newParagraphConfig, paragraphChildrenAfterPoint, newParagraphId);
      const contentReference = makeContentReferenceFromContent(content);
      registerBlockInDocument(document, newParagraph, contentReference);
      if (viewDeltaControl) {
        const paragraphReference = makeBlockReferenceFromBlock(paragraph);
        if (splitAtParagraphPoint.offset < paragraphLength) {
          viewDeltaControl.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(paragraphReference);
        }
        const newParagraphReference = makeBlockReferenceFromBlock(newParagraph);
        viewDeltaControl.markBlockAtBlockReferenceInsertedAfterBlockReferenceInContentAtContentReference(
          newParagraphReference,
          paragraphReference,
          contentReference,
        );
      }
      content.blockReferences.splice(paragraphIndex + 1, 0, makeBlockReferenceFromBlock(newParagraph));
      const transformSelectionRange: TransformSelectionRangeFn = (selectionRange) => {
        return makeSelectionRange(
          selectionRange.ranges.map((range) => {
            const { contentReference, startPoint, endPoint } = range;
            if (
              isBlockPoint(endPoint) &&
              isBlockPointAtBlock(endPoint, paragraph) &&
              (isStartOfContentPoint(startPoint) || (isBlockPoint(startPoint) && isBlockPointAtBlock(startPoint, paragraph)))
            ) {
              // Expand to cover the post-split paragraph.
              return makeRange(contentReference, startPoint, makeBlockPointFromBlock(newParagraph), range.id);
            }
            let rangeDirection: RangeDirection | null = null;
            const transformPoint = (point: Point): Point => {
              return matchPointOnType<Point>(point, {
                Paragraph(point) {
                  if (isParagraphPointAtParagraph(point, paragraph) && point.offset > splitAtParagraphPoint.offset) {
                    return makeParagraphPointFromParagraphAndOffset(newParagraph, point.offset - splitAtParagraphPoint.offset);
                  }
                  return point;
                },
                Block(point) {
                  if (!isBlockPointAtBlock(point, paragraph)) {
                    return point;
                  }
                  const direction = rangeDirection ?? (rangeDirection = getRangeDirection(document, range));
                  if (direction === RangeDirection.Forwards) {
                    if (point === startPoint) {
                      return point;
                    }
                    return makeBlockPointFromBlock(newParagraph);
                  }
                  if (direction === RangeDirection.Backwards) {
                    if (point === startPoint) {
                      return makeBlockPointFromBlock(newParagraph);
                    }
                    return point;
                  }
                  throwUnreachable();
                },
                StartOfContent(point) {
                  return point;
                },
                EndOfContent(point) {
                  return point;
                },
              });
            };
            return makeRange(contentReference, transformPoint(startPoint), transformPoint(endPoint), range.id);
          }),
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      };
      return makeChangedMutationResult(makeBatchMutation([makeJoinParagraphsBackwardsMutation(splitAtParagraphPoint)]), transformSelectionRange);
    }
    case MutationType.JoinParagraphsBackwards: {
      const { firstParagraphPoint } = mutation;
      const firstParagraph = accessParagraphFromParagraphPoint(document, firstParagraphPoint);
      const content = accessContentFromParagraphPoint(document, firstParagraphPoint);
      const contentReference = makeContentReferenceFromContent(content);
      const secondParagraph = accessBlockAtIndexInContentAtContentReference(
        document,
        contentReference,
        getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(firstParagraphPoint)) + 1,
      );
      assertIsParagraph(secondParagraph);
      const firstParagraphLength = getParagraphLength(firstParagraph);
      spliceParagraphChildren(firstParagraph, firstParagraphLength, 0, secondParagraph.children);
      unregisterBlockAtBlockReferenceInDocument(document, makeBlockReferenceFromBlock(secondParagraph));
      if (getLengthOfParagraphInlineNodes(secondParagraph.children) > 0) {
        viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromBlock(firstParagraph));
      }
      viewDeltaControl?.markBlockAtBlockReferenceRemovedInContentAtContentReference(makeBlockReferenceFromBlock(secondParagraph), contentReference);
      const firstParagraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(firstParagraphPoint));
      content.blockReferences.splice(firstParagraphIndex + 1, 1);
      const transformSelectionRange: TransformSelectionRangeFn = (selectionRange) => {
        return makeSelectionRange(
          selectionRange.ranges.map((range) => {
            const { contentReference, startPoint, endPoint } = range;
            const transformPoint = (point: Point): Point => {
              return matchPointOnType<Point>(point, {
                Paragraph(point) {
                  if (isParagraphPointAtParagraph(point, secondParagraph)) {
                    return makeParagraphPointFromParagraphAndOffset(firstParagraph, point.offset + firstParagraphLength);
                  }
                  return point;
                },
                Block(point) {
                  if (isBlockPointAtBlock(point, secondParagraph)) {
                    return makeBlockPointFromBlock(firstParagraph);
                  }
                  return point;
                },
                StartOfContent(point) {
                  return point;
                },
                EndOfContent(point) {
                  return point;
                },
              });
            };
            return makeRange(contentReference, transformPoint(startPoint), transformPoint(endPoint), range.id);
          }),
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      };
      return makeChangedMutationResult(
        makeBatchMutation([
          makeSplitParagraphForwardsMutation(
            makeParagraphPointFromParagraphBlockReferenceAndOffset(makeBlockReferenceFromBlock(firstParagraph), firstParagraphLength),
            cloneNodeConfig(secondParagraph.config),
            secondParagraph.id,
          ),
        ]),
        transformSelectionRange,
      );
    }
    case MutationType.JoinParagraphsForwards: {
      const { secondParagraphPoint } = mutation;
      const secondParagraph = accessParagraphFromParagraphPoint(document, secondParagraphPoint);
      const content = accessContentFromParagraphPoint(document, secondParagraphPoint);
      const contentReference = makeContentReferenceFromContent(content);
      const secondParagraphReference = makeBlockReferenceFromParagraphPoint(secondParagraphPoint);
      const firstParagraph = accessBlockAtIndexInContentAtContentReference(
        document,
        contentReference,
        getIndexOfBlockInContentFromBlockReference(document, secondParagraphReference) - 1,
      );
      assertIsParagraph(firstParagraph);
      const firstParagraphLength = getParagraphLength(firstParagraph);
      spliceParagraphChildren(secondParagraph, 0, 0, firstParagraph.children);
      unregisterBlockAtBlockReferenceInDocument(document, makeBlockReferenceFromBlock(firstParagraph));
      if (getLengthOfParagraphInlineNodes(firstParagraph.children) > 0) {
        viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromBlock(secondParagraph));
      }
      viewDeltaControl?.markBlockAtBlockReferenceRemovedInContentAtContentReference(makeBlockReferenceFromBlock(firstParagraph), contentReference);
      const secondParagraphIndex = getIndexOfBlockInContentFromBlockReference(document, secondParagraphReference);
      content.blockReferences.splice(secondParagraphIndex - 1, 1);
      const transformSelectionRange: TransformSelectionRangeFn = (selectionRange) => {
        return makeSelectionRange(
          selectionRange.ranges.map((range) => {
            const { contentReference, startPoint, endPoint } = range;
            const transformPoint = (point: Point): Point => {
              return matchPointOnType<Point>(point, {
                Paragraph(point) {
                  if (isParagraphPointAtParagraph(point, firstParagraph)) {
                    return makeParagraphPointFromParagraphAndOffset(secondParagraph, point.offset);
                  }
                  if (isParagraphPointAtParagraph(point, secondParagraph)) {
                    return makeParagraphPointFromParagraphAndOffset(secondParagraph, point.offset + firstParagraphLength);
                  }
                  return point;
                },
                Block(point) {
                  if (isBlockPointAtBlock(point, firstParagraph)) {
                    return makeBlockPointFromBlock(secondParagraph);
                  }
                  return point;
                },
                StartOfContent(point) {
                  return point;
                },
                EndOfContent(point) {
                  return point;
                },
              });
            };
            return makeRange(contentReference, transformPoint(startPoint), transformPoint(endPoint), range.id);
          }),
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      };
      return makeChangedMutationResult(
        makeBatchMutation([
          makeSplitParagraphBackwardsMutation(
            makeParagraphPointFromParagraphBlockReferenceAndOffset(makeBlockReferenceFromBlock(secondParagraph), firstParagraphLength),
            cloneNodeConfig(firstParagraph.config),
            firstParagraph.id,
          ),
        ]),
        transformSelectionRange,
      );
    }
    case MutationType.RemoveContents: {
      const { startContentReference, endContentReference } = mutation;
      const embed = accessEmbedFromContentReference(document, startContentReference);
      const embedReference = makeBlockReferenceFromBlock(embed);
      const startContentIndex = getIndexOfEmbedContentFromContentReference(document, startContentReference);
      const endContentIndex = getIndexOfEmbedContentFromContentReference(document, endContentReference);
      const transformSelectionRange =
        stateViewAfterMutation && makeRemoveContentsSelectionTransformFn(document, startContentReference, () => contentListFragment, stateViewAfterMutation);
      const contentListFragment = removeContentsFromEmbedAtBlockReferenceBetweenContentReferences(
        document,
        embedReference,
        startContentIndex,
        endContentIndex,
        viewDeltaControl,
        null,
      );
      contentListFragment.contentListFragmentContents.map(({ content }) => {
        viewDeltaControl?.markContentAtContentReferenceRemovedInEmbedAtBlockReference(makeContentReferenceFromContent(content), embedReference);
      });
      if (startContentIndex > 0) {
        const previousContentReference = makeContentReferenceFromContent(
          accessContentAtIndexInEmbedAtBlockReference(document, embedReference, startContentIndex - 1),
        );
        return makeChangedMutationResult(
          makeBatchMutation([makeInsertContentsAfterMutation(previousContentReference, contentListFragment)]),
          transformSelectionRange,
        );
      }
      const nextContentReference = makeContentReferenceFromContent(accessContentAtIndexInEmbedAtBlockReference(document, embedReference, endContentIndex + 1));
      return makeChangedMutationResult(
        makeBatchMutation([makeInsertContentsBeforeMutation(nextContentReference, contentListFragment)]),
        transformSelectionRange,
      );
    }
    case MutationType.RemoveBlocks: {
      const { startBlockPoint, endBlockPoint } = mutation;
      const content = accessContentFromBlockPoint(document, startBlockPoint);
      const contentReference = makeContentReferenceFromContent(content);
      const startBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(startBlockPoint));
      const endBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(endBlockPoint));
      const transformSelectionRange =
        stateViewAfterMutation &&
        makeRemoveBlocksSelectionTransformFn(
          document,
          startBlockPoint,
          contentReference,
          startBlockIndex,
          endBlockIndex,
          () => contentFragment,
          stateViewAfterMutation,
        );
      const contentFragment = removeBlocksFromContentAtContentReferenceBetweenBlockPoints(
        document,
        contentReference,
        startBlockIndex,
        endBlockIndex,
        viewDeltaControl,
        null,
      );
      if (startBlockIndex > 0) {
        const previousBlockPoint = makeBlockPointFromBlockReference(
          makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, startBlockIndex - 1)),
        );
        return makeChangedMutationResult(makeBatchMutation([makeInsertBlocksAfterMutation(previousBlockPoint, contentFragment)]), transformSelectionRange);
      }
      if (endBlockIndex === 0) {
        return makeChangedMutationResult(makeBatchMutation([makeInsertBlocksAtEndMutation(contentReference, contentFragment)]), transformSelectionRange);
      }
      const nextBlockPoint = makeBlockPointFromBlockReference(
        makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, endBlockIndex + 1)),
      );
      return makeChangedMutationResult(makeBatchMutation([makeInsertBlocksBeforeMutation(nextBlockPoint, contentFragment)]), transformSelectionRange);
    }
    case MutationType.SpliceParagraph: {
      const { paragraphPoint, removeCount, insertChildren } = mutation;
      const paragraph = accessParagraphFromParagraphPoint(document, paragraphPoint);
      const removedInlineNodes = sliceParagraphChildren(paragraph, paragraphPoint.offset, paragraphPoint.offset + removeCount);
      spliceParagraphChildren(paragraph, paragraphPoint.offset, removeCount, insertChildren);
      viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromBlock(paragraph));
      const insertChildrenLength = getLengthOfParagraphInlineNodes(insertChildren);
      const transformSelectionRange: TransformSelectionRangeFn = (selectionRange) => {
        return makeSelectionRange(
          selectionRange.ranges.map((range) => {
            const { contentReference, startPoint, endPoint } = range;
            const transformParagraphPointAtParagraph = (point: ParagraphPoint): ParagraphPoint => {
              if (point.offset <= paragraphPoint.offset) {
                return point;
              }
              return changeParagraphPointOffset(
                point,
                paragraphPoint.offset + Math.max(point.offset - paragraphPoint.offset - removeCount, 0) + insertChildrenLength,
              );
            };
            return makeRange(
              contentReference,
              isParagraphPoint(startPoint) && isParagraphPointAtParagraph(startPoint, paragraph) ? transformParagraphPointAtParagraph(startPoint) : startPoint,
              isParagraphPoint(endPoint) && isParagraphPointAtParagraph(endPoint, paragraph) ? transformParagraphPointAtParagraph(endPoint) : endPoint,
              range.id,
            );
          }),
          selectionRange.anchorRangeId,
          selectionRange.focusRangeId,
          selectionRange.intention,
          selectionRange.data,
          selectionRange.id,
        );
      };
      return makeChangedMutationResult(
        makeBatchMutation([makeSpliceParagraphMutation(paragraphPoint, getLengthOfParagraphInlineNodes(insertChildren), removedInlineNodes.map(cloneInline))]),
        transformSelectionRange,
      );
    }
    case MutationType.UpdateTextConfigBetweenParagraphPoints:
    case MutationType.UpdateParagraphConfigBetweenBlockPoints: {
      throwNotImplemented();
    }
    case MutationType.ChangeTextConfigBetweenParagraphPoints: {
      const { startParagraphPoint, endParagraphPoint, newTextConfig } = mutation;
      const contentReference = makeContentReferenceFromContent(accessContentFromParagraphPoint(document, startParagraphPoint));
      const formatTextBetween = (
        startBlockIndex: number,
        startOffset: number | null,
        endBlockIndex: number,
        endOffset: number | null,
      ): MutationResult<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> => {
        type ChangedGroupInfo = {
          didChange: true;
          config: TextConfig;
          startParagraphPoint: ParagraphPoint;
          endParagraphPoint: ParagraphPoint;
        };
        type NotChangedGroupInfo = {
          didChange: false;
        };
        type GroupInfo = ChangedGroupInfo | NotChangedGroupInfo;
        const textsBetweenParagraphPoints: GroupInfo[] = [];
        function formatPortionOfTextInParagraph(paragraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>, fromOffset: number, toOffset: number): void {
          const paragraphReference = makeBlockReferenceFromBlock(paragraph);
          let startInlineOffset = fromOffset;
          let didChangeInline = false;
          const inlineNodesToChangeConfig = sliceParagraphChildren(paragraph, fromOffset, toOffset).map((inline) => {
            const inlineLength = getInlineLength(inline);
            if (isText(inline) && !areNodeConfigsEqual(inline.config, newTextConfig)) {
              if (!didChangeInline) {
                viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(paragraphReference);
                didChangeInline = true;
              }
              textsBetweenParagraphPoints.push({
                didChange: true,
                config: inline.config,
                startParagraphPoint: makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startInlineOffset),
                endParagraphPoint: makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startInlineOffset + inlineLength),
              });
              startInlineOffset += inlineLength;
              return makeText(cloneNodeConfig(newTextConfig), inline.text);
            }
            textsBetweenParagraphPoints.push({
              didChange: false,
            });
            startInlineOffset += inlineLength;
            return inline;
          });
          spliceParagraphChildren(paragraph, fromOffset, toOffset - fromOffset, inlineNodesToChangeConfig);
        }
        for (let i = startBlockIndex; i <= endBlockIndex; i++) {
          const block = accessBlockAtIndexInContentAtContentReference(document, contentReference, i);
          if (i === startBlockIndex && startOffset !== null) {
            assertIsParagraph(block);
            const paragraphLength = getParagraphLength(block);
            let endOffsetForThisLine: number;
            if (i === endBlockIndex) {
              assertIsNotNullish(endOffset);
              endOffsetForThisLine = endOffset;
            } else {
              endOffsetForThisLine = paragraphLength;
            }
            formatPortionOfTextInParagraph(block, startOffset, endOffsetForThisLine);
            if (startBlockIndex !== endBlockIndex && endOffsetForThisLine < paragraphLength) {
              textsBetweenParagraphPoints.push({
                didChange: false,
              });
            }
          } else if (i === endBlockIndex && endOffset !== null) {
            assertIsParagraph(block);
            formatPortionOfTextInParagraph(block, 0, endOffset);
          } else {
            if (!isParagraph(block)) {
              continue;
            }
            const paragraphReference = makeBlockReferenceFromBlock(block);
            let startInlineOffset = 0;
            let didChangeInline = false;
            for (let j = 0; j < block.children.length; j++) {
              const inline = block.children[i];
              const inlineLength = getInlineLength(inline);
              if (isText(inline) && !areNodeConfigsEqual(inline.config, newTextConfig)) {
                if (!didChangeInline) {
                  viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(paragraphReference);
                  didChangeInline = true;
                }
                textsBetweenParagraphPoints.push({
                  didChange: true,
                  config: inline.config,
                  startParagraphPoint: makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startInlineOffset),
                  endParagraphPoint: makeParagraphPointFromParagraphBlockReferenceAndOffset(paragraphReference, startInlineOffset + inlineLength),
                });
                block.children[i] = makeText(cloneNodeConfig(newTextConfig), inline.text);
              } else {
                textsBetweenParagraphPoints.push({
                  didChange: false,
                });
              }
              startInlineOffset += inlineLength;
            }
          }
        }
        const reverseMutations: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = groupConsecutiveItemsInArray(
          textsBetweenParagraphPoints,
          (item) => item,
          (a, b) => (!a.didChange && !b.didChange) || (a.didChange && b.didChange && areNodeConfigsEqual(a.config, b.config)),
        )
          .filter((group): group is GroupConsecutiveItemsInArrayGroup<GroupInfo, ChangedGroupInfo> => group.groupInfos[0].didChange)
          .map((group) => {
            return makeChangeTextConfigBetweenParagraphPoints(
              group.groupInfos[0].startParagraphPoint,
              group.groupInfos[group.groupInfos.length - 1].endParagraphPoint,
              group.groupInfos[0].config,
            );
          });
        return reverseMutations.length === 0 ? makeNoChangeMutationResult() : makeChangedMutationResult(makeBatchMutation(reverseMutations), null);
      };
      const startParagraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(startParagraphPoint));
      const endParagraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(endParagraphPoint));
      if (startParagraphIndex < endParagraphIndex) {
        return formatTextBetween(startParagraphIndex, startParagraphPoint.offset, endParagraphIndex, endParagraphPoint.offset);
      }
      if (startParagraphIndex === endParagraphIndex) {
        if (startParagraphPoint.offset < endParagraphPoint.offset) {
          return formatTextBetween(startParagraphIndex, startParagraphPoint.offset, endParagraphIndex, endParagraphPoint.offset);
        }
        if (startParagraphPoint.offset > endParagraphPoint.offset) {
          return formatTextBetween(endParagraphIndex, endParagraphPoint.offset, startParagraphIndex, startParagraphPoint.offset);
        }
        return makeNoChangeMutationResult();
      }
      return formatTextBetween(endParagraphIndex, endParagraphPoint.offset, startParagraphIndex, startParagraphPoint.offset);
    }
    case MutationType.ChangeParagraphConfigBetweenBlockPoints: {
      const { startBlockPoint, endBlockPoint, paragraphConfig } = mutation;
      const contentReference = makeContentReferenceFromContent(accessContentFromBlockPoint(document, startBlockPoint));
      const startBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(startBlockPoint));
      const endBlockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(endBlockPoint));
      if (endBlockIndex < startBlockIndex) {
        throw new MutationNodeEndBeforeStartError({
          cause: {
            document,
            mutation,
          },
        });
      }
      type ChangedGroupInfo = {
        didChange: true;
        config: ParagraphConfig;
        blockPoint: BlockPoint;
      };
      type NotChangedGroupInfo = {
        didChange: false;
      };
      const reverseMutations: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = groupConsecutiveItemsInArray<
        number,
        ChangedGroupInfo | NotChangedGroupInfo
      >(
        makeArrayWithNumbersFromStartToEndInclusive(startBlockIndex, endBlockIndex),
        (i) => {
          const block = accessBlockAtIndexInContentAtContentReference(document, contentReference, i);
          if (isParagraph(block) && !areNodeConfigsEqual(block.config, paragraphConfig)) {
            block.config = cloneNodeConfig(paragraphConfig);
            viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromBlock(block));
            return {
              didChange: true,
              config: block.config,
              blockPoint: makeBlockPointFromBlock(block),
            };
          }
          return {
            didChange: false,
          };
        },
        (a, b) => (!a.didChange && !b.didChange) || (a.didChange && b.didChange && areNodeConfigsEqual(a.config, b.config)),
      )
        .filter((group): group is GroupConsecutiveItemsInArrayGroup<number, ChangedGroupInfo> => group.groupInfos[0].didChange)
        .map((group) => {
          return makeChangeParagraphConfigBetweenBlockPointsMutation(
            group.groupInfos[0].blockPoint,
            group.groupInfos[group.groupInfos.length - 1].blockPoint,
            cloneNodeConfig(group.groupInfos[0].config),
          );
        });
      return reverseMutations.length === 0 ? makeNoChangeMutationResult() : makeChangedMutationResult(makeBatchMutation(reverseMutations), null);
    }
    case MutationType.UpdateDocumentConfig:
    case MutationType.UpdateContentConfig:
    case MutationType.UpdateEmbedConfig:
    case MutationType.UpdateVoidConfig: {
      throwNotImplemented();
    }
    case MutationType.ChangeDocumentConfig: {
      const { newDocumentConfig } = mutation;
      const previousDocumentConfig = document.config;
      if (!areNodeConfigsEqual(previousDocumentConfig, newDocumentConfig)) {
        document.config = cloneNodeConfig(newDocumentConfig);
        viewDeltaControl?.markDocumentConfigUpdated();
        return makeChangedMutationResult(makeBatchMutation([makeChangeDocumentConfigMutation(cloneNodeConfig(previousDocumentConfig))]), null);
      }
      return makeNoChangeMutationResult();
    }
    case MutationType.ChangeContentConfig: {
      const { contentReference, newContentConfig } = mutation;
      const content = accessContentFromContentReference(document, contentReference);
      const previousContentConfig = content.config;
      if (!areNodeConfigsEqual(previousContentConfig, newContentConfig)) {
        content.config = cloneNodeConfig(newContentConfig);
        viewDeltaControl?.markContentAtContentReferenceConfigUpdated(contentReference);
        return makeChangedMutationResult(makeBatchMutation([makeChangeContentConfigMutation(contentReference, cloneNodeConfig(previousContentConfig))]), null);
      }
      return makeNoChangeMutationResult();
    }
    case MutationType.ChangeEmbedConfig: {
      const { embedBlockPoint, newEmbedConfig } = mutation;
      const embed = accessBlockFromBlockPoint(document, embedBlockPoint);
      assertIsEmbed(embed);
      const previousEmbedConfig = embed.config;
      if (!areNodeConfigsEqual(previousEmbedConfig, newEmbedConfig)) {
        embed.config = cloneNodeConfig(newEmbedConfig);
        viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromBlockPoint(embedBlockPoint));
        return makeChangedMutationResult(makeBatchMutation([makeChangeEmbedConfigMutation(embedBlockPoint, cloneNodeConfig(previousEmbedConfig))]), null);
      }
      return makeNoChangeMutationResult();
    }
    case MutationType.ChangeVoidConfig: {
      const { newVoidConfig, voidStartParagraphPoint } = mutation;
      const nextInlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, voidStartParagraphPoint);
      if (nextInlineWithStartOffset === null || !isVoid(nextInlineWithStartOffset.inline)) {
        throw new NodeNotOfTypeError(NodeType.Void, {
          cause: { document, voidStartParagraphPoint, nextInlineWithStartOffset },
        });
      }
      const previousVoidConfig = nextInlineWithStartOffset.inline.config;
      if (!areNodeConfigsEqual(previousVoidConfig, newVoidConfig)) {
        nextInlineWithStartOffset.inline.config = cloneNodeConfig(newVoidConfig);
        viewDeltaControl?.markBlockAtBlockReferenceConfigOrParagraphChildrenUpdated(makeBlockReferenceFromParagraphPoint(voidStartParagraphPoint));
        return makeChangedMutationResult(makeBatchMutation([makeChangeVoidConfigMutation(voidStartParagraphPoint, cloneNodeConfig(previousVoidConfig))]), null);
      }
      return makeNoChangeMutationResult();
    }
    case MutationType.RegisterTopLevelContent: {
      const { contentId, contentConfig, contentFragment } = mutation;
      document.contentStore[contentId] = {
        content: makeContent(
          contentConfig,
          contentFragment.contentFragmentBlocks.map((contentFragmentBlock) =>
            makeBlockReferenceFromBlockId(getBlockFromContentFragmentBlock(contentFragmentBlock).id),
          ),
          contentId,
        ),
      };
      registerContentFragmentBlocks(document, makeContentReferenceFromContentId(contentId), contentFragment);
      // There is no reverse mutation because you cannot unregister top level content.
      return makeNoChangeMutationResult();
    }
    default: {
      assertUnreachable(mutation);
    }
  }
}
function makeRemoveRangeContentsUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(range: Range): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl): void => {
    const {
      delta,
      stateView: { document },
    } = stateControl;
    const { contentReference } = range;
    if (isContentAtContentReferenceEmpty(document, contentReference)) {
      return;
    }
    const mutations: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    matchRangeOnPointTypesWithoutDirection(range, {
      StartOfContent_EndOfContent(_startOfContentPoint, _endOfContentPoint) {
        mutations.push(
          makeRemoveBlocksMutation(
            makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
            makeBlockPointFromBlockReference(makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference))),
          ),
        );
      },
      StartOfContent_Block(_startOfContentPoint, blockPoint) {
        mutations.push(
          makeRemoveBlocksMutation(makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)), blockPoint),
        );
      },
      StartOfContent_Paragraph(_startOfContentPoint, paragraphPoint) {
        const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint));
        if (paragraphIndex !== 0) {
          mutations.push(
            makeRemoveBlocksMutation(
              makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
              makeBlockPointFromBlockReference(
                makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, paragraphIndex - 1)),
              ),
            ),
          );
        }
        if (paragraphPoint.offset !== 0) {
          mutations.push(makeSpliceParagraphMutation(changeParagraphPointOffset(paragraphPoint, 0), paragraphPoint.offset, []));
        }
      },
      EndOfContent_Block(_endOfContentPoint, blockPoint) {
        mutations.push(
          makeRemoveBlocksMutation(makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)), blockPoint),
        );
      },
      EndOfContent_Paragraph(_endOfContentPoint, paragraphPoint) {
        const { offset } = paragraphPoint;
        if (
          !areBlockPointsAtSameBlock(
            makeBlockPointFromParagraphPoint(paragraphPoint),
            makeBlockPointFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)),
          )
        ) {
          const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint));
          mutations.push(
            makeRemoveBlocksMutation(
              makeBlockPointFromBlockReference(
                makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, paragraphIndex - 1)),
              ),
              makeBlockPointFromBlockReference(makeBlockReferenceFromBlock(accessLastBlockInContentAtContentReference(document, contentReference))),
            ),
          );
        }
        const paragraphLength = getParagraphLength(accessParagraphFromParagraphPoint(document, paragraphPoint));
        mutations.push(makeSpliceParagraphMutation(paragraphPoint, paragraphLength - offset, []));
      },
      Block_Block(blockPoint1, blockPoint2) {
        const blockPoint1Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint1));
        const blockPoint2Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint2));
        const firstBlockPoint = blockPoint1Index < blockPoint2Index ? blockPoint1 : blockPoint2;
        const secondBlockPoint = blockPoint2Index < blockPoint2Index ? blockPoint2 : blockPoint1;
        mutations.push(makeRemoveBlocksMutation(firstBlockPoint, secondBlockPoint));
      },
      Block_Paragraph(blockPoint, paragraphPoint) {
        const blockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint));
        const paragraphBlockPoint = makeBlockPointFromParagraphPoint(paragraphPoint);
        const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint));
        if (blockIndex < paragraphIndex) {
          mutations.push(
            makeRemoveBlocksMutation(blockPoint, paragraphBlockPoint),
            makeSpliceParagraphMutation(changeParagraphPointOffset(paragraphPoint, 0), paragraphPoint.offset, []),
          );
        } else {
          const paragraphLength = getParagraphLength(accessParagraphFromParagraphPoint(document, paragraphPoint));
          mutations.push(
            makeSpliceParagraphMutation(paragraphPoint, paragraphLength - paragraphPoint.offset, []),
            makeRemoveBlocksMutation(paragraphBlockPoint, blockPoint),
          );
        }
      },
      Paragraph_Paragraph(paragraphPoint1, paragraphPoint2) {
        if (areParagraphPointsAtSameParagraph(paragraphPoint1, paragraphPoint2)) {
          const firstParagraphPoint = paragraphPoint1.offset < paragraphPoint2.offset ? paragraphPoint1 : paragraphPoint2;
          const secondParagraphPoint = paragraphPoint1.offset < paragraphPoint2.offset ? paragraphPoint2 : paragraphPoint1;
          if (firstParagraphPoint.offset !== secondParagraphPoint.offset) {
            mutations.push(makeSpliceParagraphMutation(firstParagraphPoint, secondParagraphPoint.offset - firstParagraphPoint.offset, []));
          }
        } else {
          const paragraph1Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint1));
          const paragraph2Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint2));
          let firstParagraphPoint: ParagraphPoint;
          let firstParagraphIndex: number;
          let secondParagraphPoint: ParagraphPoint;
          let secondParagraphIndex: number;
          if (paragraph1Index < paragraph2Index) {
            firstParagraphPoint = paragraphPoint1;
            firstParagraphIndex = paragraph1Index;
            secondParagraphPoint = paragraphPoint2;
            secondParagraphIndex = paragraph2Index;
          } else {
            firstParagraphPoint = paragraphPoint2;
            firstParagraphIndex = paragraph2Index;
            secondParagraphPoint = paragraphPoint1;
            secondParagraphIndex = paragraph1Index;
          }
          const firstParagraphLength = getParagraphLength(accessParagraphFromParagraphPoint(document, firstParagraphPoint));
          if (firstParagraphPoint.offset !== firstParagraphLength) {
            mutations.push(makeSpliceParagraphMutation(firstParagraphPoint, firstParagraphLength - firstParagraphPoint.offset, []));
          }
          if (secondParagraphIndex - firstParagraphIndex > 1) {
            mutations.push(
              makeRemoveBlocksMutation(
                makeBlockPointFromBlockReference(
                  makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, firstParagraphIndex + 1)),
                ),
                makeBlockPointFromBlockReference(
                  makeBlockReferenceFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, secondParagraphIndex - 1)),
                ),
              ),
            );
          }
          if (secondParagraphPoint.offset !== 0) {
            mutations.push(makeSpliceParagraphMutation(changeParagraphPointOffset(secondParagraphPoint, 0), secondParagraphPoint.offset, []));
          }
          if (firstParagraphLength === 0 && getParagraphLength(accessParagraphFromParagraphPoint(document, secondParagraphPoint)) > 0) {
            mutations.push(makeJoinParagraphsForwardsMutation(secondParagraphPoint));
          } else {
            mutations.push(makeJoinParagraphsBackwardsMutation(firstParagraphPoint));
          }
        }
      },
    });
    if (mutations.length === 0) {
      return;
    }
    delta.applyMutation(makeBatchMutation(mutations));
  };
}
enum EdgeParagraphSide {
  Start = 'Start',
  End = 'End',
  Only = 'Only',
}
function makeInsertContentFragmentAtRangeUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  range: Range,
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  getShouldReplaceEdgeParagraphConfig?: (
    edgeParagraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    insertParagraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    insertStartOffset: number,
    insertEndOffset: number,
    startOrEndOfBoth: EdgeParagraphSide,
  ) => boolean,
  shouldTransformStateSelectionRangeToEndPredicateFn?: (selectionRange: SelectionRange) => boolean,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl): void => {
    const {
      delta,
      stateView: { document },
    } = stateControl;
    const { contentReference } = range;
    const { contentFragmentBlocks } = contentFragment;
    if (isContentAtContentReferenceEmpty(document, contentReference)) {
      delta.applyMutation(makeBatchMutation([makeInsertBlocksAtEndMutation(contentReference, contentFragment)]));
      return;
    }
    const mutations: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    let endRange: Range | undefined; // TODO.
    const accessors: MatchRangeOnPointTypesWithoutDirectionAccessors<void> = {
      StartOfContent_EndOfContent(_startOfContentPoint, _endOfContentPoint) {
        mutations.push(
          makeRemoveBlocksMutation(
            makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)),
            makeBlockPointFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)),
          ),
          makeInsertBlocksAtEndMutation(contentReference, contentFragment),
        );
      },
      StartOfContent_Block(_startOfContentPoint, blockPoint) {
        mutations.push(
          makeRemoveBlocksMutation(makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)), blockPoint),
        );
        if (areBlockPointsAtSameBlock(blockPoint, makeBlockPointFromBlock(accessLastBlockInContentAtContentReference(document, contentReference)))) {
          mutations.push(makeInsertBlocksAtEndMutation(contentReference, contentFragment));
        } else {
          mutations.push(
            makeInsertBlocksBeforeMutation(
              makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint))),
              contentFragment,
            ),
          );
        }
      },
      StartOfContent_Paragraph(_startOfContentPoint, paragraphPoint) {
        const firstExistingContentBlock = accessBlockAtIndexInContentAtContentReference(document, contentReference, 0);
        if (isParagraph(firstExistingContentBlock)) {
          accessors.Paragraph_Paragraph(makeParagraphPointFromParagraphAndOffset(firstExistingContentBlock, 0), paragraphPoint);
        } else {
          accessors.Block_Paragraph(makeBlockPointFromBlock(firstExistingContentBlock), paragraphPoint);
        }
      },
      EndOfContent_Block(_endOfContentPoint, blockPoint) {
        mutations.push(makeRemoveBlocksMutation(blockPoint, makeBlockPointFromBlock(accessLastBlockInContentAtContentReference(document, contentReference))));
        if (areBlockPointsAtSameBlock(blockPoint, makeBlockPointFromBlock(accessBlockAtIndexInContentAtContentReference(document, contentReference, 0)))) {
          mutations.push(makeInsertBlocksAtEndMutation(contentReference, contentFragment));
        } else {
          mutations.push(
            makeInsertBlocksAfterMutation(
              makeBlockPointFromBlock(accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint))),
              contentFragment,
            ),
          );
        }
      },
      EndOfContent_Paragraph(_endOfContentPoint, paragraphPoint) {
        const lastExistingContentBlock = accessLastBlockInContentAtContentReference(document, contentReference);
        if (isParagraph(lastExistingContentBlock)) {
          accessors.Paragraph_Paragraph(
            makeParagraphPointFromParagraphAndOffset(lastExistingContentBlock, getParagraphLength(lastExistingContentBlock)),
            paragraphPoint,
          );
        } else {
          accessors.Block_Paragraph(makeBlockPointFromBlock(lastExistingContentBlock), paragraphPoint);
        }
      },
      Block_Block(blockPoint1, blockPoint2) {
        const blockPoint1Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint1));
        const blockPoint2Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint2));
        let firstBlockPoint: BlockPoint;
        let secondBlockPoint: BlockPoint;
        let firstBlockIndex: number;
        let secondBlockIndex: number;
        if (blockPoint1Index < blockPoint2Index) {
          firstBlockPoint = blockPoint1;
          firstBlockIndex = blockPoint1Index;
          secondBlockPoint = blockPoint2;
          secondBlockIndex = blockPoint2Index;
        } else {
          firstBlockPoint = blockPoint2;
          firstBlockIndex = blockPoint2Index;
          secondBlockPoint = blockPoint1;
          secondBlockIndex = blockPoint1Index;
        }
        mutations.push(makeRemoveBlocksMutation(firstBlockPoint, secondBlockPoint));
        const numberOfBlocks = getNumberOfBlocksInContentAtContentReference(document, contentReference);
        if (firstBlockIndex === 0 && secondBlockIndex === numberOfBlocks - 1) {
          mutations.push(makeInsertBlocksAtEndMutation(contentReference, contentFragment));
        } else if (firstBlockIndex > 0) {
          mutations.push(
            makeInsertBlocksAfterMutation(
              makeBlockPointFromBlock(accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(firstBlockPoint))),
              contentFragment,
            ),
          );
        } else {
          mutations.push(
            makeInsertBlocksBeforeMutation(
              makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, makeBlockReferenceFromBlockPoint(secondBlockPoint))),
              contentFragment,
            ),
          );
        }
        if (shouldTransformStateSelectionRangeToEndPredicateFn) {
          const endPoint = makeBlockPointFromBlock(
            getBlockFromContentFragmentBlock(contentFragment.contentFragmentBlocks[contentFragment.contentFragmentBlocks.length - 1]),
          );
          endRange = makeRange(contentReference, endPoint, endPoint, generateId());
        }
      },
      Block_Paragraph(blockPoint, paragraphPoint) {
        const blockIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromBlockPoint(blockPoint));
        const paragraphIndex = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint));
        if (blockIndex < paragraphIndex) {
          mutations.push(
            makeRemoveBlocksMutation(
              blockPoint,
              makeBlockPointFromBlock(accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint))),
            ),
          );
          accessors.Paragraph_Paragraph(changeParagraphPointOffset(paragraphPoint, 0), paragraphPoint);
        } else {
          mutations.push(
            makeRemoveBlocksMutation(
              makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint))),
              blockPoint,
            ),
          );
          accessors.Paragraph_Paragraph(
            paragraphPoint,
            changeParagraphPointOffset(paragraphPoint, getParagraphLength(accessParagraphFromParagraphPoint(document, paragraphPoint))),
          );
        }
      },
      Paragraph_Paragraph(paragraphPoint1, paragraphPoint2) {
        const firstContentFragmentBlock = getBlockFromContentFragmentBlock(contentFragmentBlocks[0]);
        const lastContentFragmentBlock = getBlockFromContentFragmentBlock(contentFragmentBlocks[contentFragmentBlocks.length - 1]);
        let firstParagraphPoint: ParagraphPoint;
        let secondParagraphPoint: ParagraphPoint;
        let dummyParagraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>;
        let newParagraphId: string | null = null;
        if (areParagraphPointsAtSameParagraph(paragraphPoint1, paragraphPoint2)) {
          if (paragraphPoint1.offset < paragraphPoint2.offset) {
            firstParagraphPoint = paragraphPoint1;
            secondParagraphPoint = paragraphPoint2;
          } else {
            firstParagraphPoint = paragraphPoint2;
            secondParagraphPoint = paragraphPoint1;
          }
          dummyParagraph = accessParagraphFromParagraphPoint(document, firstParagraphPoint);
        } else {
          // TODO.
          const paragraph1Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint1));
          const paragraph2Index = getIndexOfBlockInContentFromBlockReference(document, makeBlockReferenceFromParagraphPoint(paragraphPoint2));
          let originalFirstParagraphPoint: ParagraphPoint;
          let originalFirstParagraphIndex: number;
          let originalSecondParagraphPoint: ParagraphPoint;
          let originalSecondParagraphIndex: number;
          if (paragraph1Index < paragraph2Index) {
            originalFirstParagraphPoint = paragraphPoint1;
            originalFirstParagraphIndex = paragraph1Index;
            originalSecondParagraphPoint = paragraphPoint2;
            originalSecondParagraphIndex = paragraph2Index;
          } else {
            originalFirstParagraphPoint = paragraphPoint2;
            originalFirstParagraphIndex = paragraph2Index;
            originalSecondParagraphPoint = paragraphPoint1;
            originalSecondParagraphIndex = paragraph1Index;
          }
          if (originalSecondParagraphIndex - originalFirstParagraphIndex > 1) {
            mutations.push(
              makeRemoveBlocksMutation(
                makeBlockPointFromBlock(accessNextBlockToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(originalFirstParagraphPoint))),
                makeBlockPointFromBlock(
                  accessPreviousBlockToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(originalSecondParagraphPoint)),
                ),
              ),
            );
          }
          mutations.push(makeJoinParagraphsBackwardsMutation(originalFirstParagraphPoint));
          const originalFirstParagraph = accessParagraphFromParagraphPoint(document, originalFirstParagraphPoint);
          const originalSecondParagraph = accessParagraphFromParagraphPoint(document, originalSecondParagraphPoint);
          const dummyParagraphInlineNodes = originalFirstParagraph.children.map(cloneInline);
          spliceParagraphInlineNodes(
            dummyParagraphInlineNodes,
            getLengthOfParagraphInlineNodes(dummyParagraphInlineNodes),
            0,
            originalSecondParagraph.children.map(cloneInline),
          );
          dummyParagraph = makeParagraph(originalFirstParagraph.config, dummyParagraphInlineNodes, originalFirstParagraph.id);
          firstParagraphPoint = originalFirstParagraphPoint;
          secondParagraphPoint = changeParagraphPointOffset(
            originalFirstParagraphPoint,
            getParagraphLength(originalFirstParagraph) + originalSecondParagraphPoint.offset,
          );
          newParagraphId = originalSecondParagraph.id;
        }
        const paragraphBlockPoint = makeBlockPointFromParagraphPoint(firstParagraphPoint);
        if (isParagraph(firstContentFragmentBlock)) {
          const firstContentFragmentBlockLength = getParagraphLength(firstContentFragmentBlock);
          if (secondParagraphPoint.offset !== firstParagraphPoint.offset || firstContentFragmentBlockLength > 0) {
            mutations.push(
              makeSpliceParagraphMutation(firstParagraphPoint, secondParagraphPoint.offset - firstParagraphPoint.offset, firstContentFragmentBlock.children),
            );
          }
          if (
            getShouldReplaceEdgeParagraphConfig?.(
              dummyParagraph,
              firstContentFragmentBlock,
              firstParagraphPoint.offset,
              contentFragmentBlocks.length === 1 ? secondParagraphPoint.offset : getParagraphLength(dummyParagraph),
              contentFragmentBlocks.length === 1 ? EdgeParagraphSide.Only : EdgeParagraphSide.Start,
            )
          ) {
            mutations.push(makeChangeParagraphConfigBetweenBlockPointsMutation(paragraphBlockPoint, paragraphBlockPoint, firstContentFragmentBlock.config));
          }
          if (contentFragmentBlocks.length === 1) {
            if (shouldTransformStateSelectionRangeToEndPredicateFn) {
              const endPoint = changeParagraphPointOffset(secondParagraphPoint, firstParagraphPoint.offset + firstContentFragmentBlockLength);
              endRange = makeRange(contentReference, endPoint, endPoint, generateId());
            }
            return;
          }
          const splitAt = changeParagraphPointOffset(firstParagraphPoint, firstParagraphPoint.offset + firstContentFragmentBlockLength);
          if (isParagraph(lastContentFragmentBlock)) {
            if (newParagraphId === null) {
              newParagraphId = generateId();
            }
            mutations.push(
              makeSplitParagraphForwardsMutation(
                splitAt,
                getShouldReplaceEdgeParagraphConfig?.(dummyParagraph, lastContentFragmentBlock, 0, secondParagraphPoint.offset, EdgeParagraphSide.End)
                  ? lastContentFragmentBlock.config
                  : dummyParagraph.config,
                newParagraphId,
              ),
            );
            const lastContentFragmentBlockLength = getParagraphLength(lastContentFragmentBlock);
            if (lastContentFragmentBlockLength > 0) {
              mutations.push(
                makeSpliceParagraphMutation(
                  makeParagraphPointFromParagraphBlockReferenceAndOffset(makeBlockReferenceFromBlockId(newParagraphId), 0),
                  0,
                  lastContentFragmentBlock.children,
                ),
              );
            }
            if (contentFragmentBlocks.length > 2) {
              mutations.push(
                makeInsertBlocksAfterMutation(paragraphBlockPoint, makeContentFragment(contentFragmentBlocks.slice(1, contentFragmentBlocks.length - 1))),
              );
            }
            if (shouldTransformStateSelectionRangeToEndPredicateFn) {
              const endPoint = makeParagraphPointFromParagraphBlockReferenceAndOffset(
                makeBlockReferenceFromBlockId(newParagraphId),
                lastContentFragmentBlockLength,
              );
              endRange = makeRange(contentReference, endPoint, endPoint, generateId());
            }
          } else {
            if (secondParagraphPoint.offset < getParagraphLength(dummyParagraph)) {
              mutations.push(makeSplitParagraphForwardsMutation(splitAt, dummyParagraph.config, generateId()));
            }
            mutations.push(makeInsertBlocksAfterMutation(paragraphBlockPoint, makeContentFragment(contentFragmentBlocks.slice(1))));
            if (shouldTransformStateSelectionRangeToEndPredicateFn) {
              const endPoint = makeBlockPointFromBlock(lastContentFragmentBlock);
              endRange = makeRange(contentReference, endPoint, endPoint, generateId());
            }
          }
        } else {
          if (firstParagraphPoint.offset !== secondParagraphPoint.offset) {
            mutations.push(makeSpliceParagraphMutation(firstParagraphPoint, secondParagraphPoint.offset - firstParagraphPoint.offset, []));
          }
          const splitAt = firstParagraphPoint;
          if (isParagraph(lastContentFragmentBlock)) {
            if (newParagraphId === null) {
              newParagraphId = generateId();
            }
            mutations.push(
              makeSplitParagraphForwardsMutation(
                splitAt,
                getShouldReplaceEdgeParagraphConfig?.(dummyParagraph, lastContentFragmentBlock, 0, secondParagraphPoint.offset, EdgeParagraphSide.End)
                  ? lastContentFragmentBlock.config
                  : dummyParagraph.config,
                newParagraphId,
              ),
            );
            const lastContentFragmentBlockLength = getParagraphLength(lastContentFragmentBlock);
            if (lastContentFragmentBlockLength > 0) {
              mutations.push(
                makeSpliceParagraphMutation(
                  makeParagraphPointFromParagraphBlockReferenceAndOffset(makeBlockReferenceFromBlockId(newParagraphId), 0),
                  0,
                  lastContentFragmentBlock.children,
                ),
              );
            }
            mutations.push(
              makeInsertBlocksAfterMutation(paragraphBlockPoint, makeContentFragment(contentFragmentBlocks.slice(0, contentFragmentBlocks.length - 1))),
            );
            if (shouldTransformStateSelectionRangeToEndPredicateFn) {
              const endPoint = makeParagraphPointFromParagraphBlockReferenceAndOffset(
                makeBlockReferenceFromBlockId(newParagraphId),
                lastContentFragmentBlockLength,
              );
              endRange = makeRange(contentReference, endPoint, endPoint, generateId());
            }
          } else {
            if (secondParagraphPoint.offset < getParagraphLength(dummyParagraph)) {
              mutations.push(makeSplitParagraphForwardsMutation(splitAt, dummyParagraph.config, generateId()));
            }
            mutations.push(makeInsertBlocksAfterMutation(paragraphBlockPoint, contentFragment));
            if (shouldTransformStateSelectionRangeToEndPredicateFn) {
              const endPoint = makeBlockPointFromBlock(lastContentFragmentBlock);
              endRange = makeRange(contentReference, endPoint, endPoint, generateId());
            }
          }
        }
      },
    };
    matchRangeOnPointTypesWithoutDirection(range, accessors);
    if (mutations.length === 0) {
      return;
    }
    let customTransformStateSelectionRangeFn: CustomTransformStateSelectionRangeFn | undefined;
    if (shouldTransformStateSelectionRangeToEndPredicateFn && endRange) {
      customTransformStateSelectionRangeFn = (selectionRange) => {
        if (!shouldTransformStateSelectionRangeToEndPredicateFn(selectionRange)) {
          return undefined;
        }
        assertIsNotNullish(endRange);
        return makeSelectionRange([endRange], endRange.id, endRange.id, selectionRange.intention, selectionRange.data, selectionRange.id);
      };
    }
    delta.applyMutation(makeBatchMutation(mutations), undefined, customTransformStateSelectionRangeFn);
  };
}
enum MovementGranularity {
  Grapheme = 'Grapheme',
  Word = 'Word',
  WordBoundary = 'WordBoundary',
  Sentence = 'Sentence',
  Paragraph = 'Paragraph',
  TopLevelContent = 'TopLevelContent',
}
enum PointMovement {
  Previous = 'Previous',
  Next = 'Next',
  PreviousBoundByEdge = 'PreviousBoundByEdge',
  NextBoundByEdge = 'NextBoundByEdge',
}
function makeDefaultPointTransformFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  movementGranularity: MovementGranularity,
  pointMovement: PointMovement,
): PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  assert(
    !(
      movementGranularity === MovementGranularity.Grapheme &&
      (pointMovement === PointMovement.PreviousBoundByEdge || pointMovement === PointMovement.NextBoundByEdge)
    ),
  );
  return (document, stateControlConfig, selectionRangeIntention, range, point) => {
    if (movementGranularity === MovementGranularity.TopLevelContent) {
      const parentContentReferences = makeListOfAllParentContentReferencesOfContentAtContentReference(document, range.contentReference);
      const topLevelContentReference =
        parentContentReferences.length > 0 ? parentContentReferences[parentContentReferences.length - 1] : range.contentReference;
      if (pointMovement === PointMovement.Previous || pointMovement === PointMovement.PreviousBoundByEdge) {
        const firstBlock = accessBlockAtIndexInContentAtContentReference(document, topLevelContentReference, 0);
        const newPoint = isParagraph(firstBlock)
          ? selectionRangeIntention === SelectionRangeIntention.Block
            ? makeBlockPointFromBlock(firstBlock)
            : makeParagraphPointFromParagraphAndOffset(firstBlock, 0)
          : accessFirstPointInEmbedAtBlockReference(document, makeBlockReferenceFromBlock(firstBlock), selectionRangeIntention) ??
            makeBlockPointFromBlock(firstBlock);
        return {
          contentReference: makeContentReferenceFromContent(
            isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
          ),
          point: newPoint,
        };
      }
      const lastBlock = accessLastBlockInContentAtContentReference(document, topLevelContentReference);
      const newPoint = isParagraph(lastBlock)
        ? selectionRangeIntention === SelectionRangeIntention.Block
          ? makeBlockPointFromBlock(lastBlock)
          : makeParagraphPointFromParagraphAndOffset(lastBlock, getParagraphLength(lastBlock))
        : accessLastPointInEmbedAtBlockReference(document, makeBlockReferenceFromBlock(lastBlock), selectionRangeIntention) ??
          makeBlockPointFromBlock(lastBlock);
      return {
        contentReference: makeContentReferenceFromContent(
          isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
        ),
        point: newPoint,
      };
    }
    if (
      selectionRangeIntention === SelectionRangeIntention.Block &&
      (movementGranularity !== MovementGranularity.Paragraph ||
        pointMovement === PointMovement.PreviousBoundByEdge ||
        pointMovement === PointMovement.NextBoundByEdge)
    ) {
      return {
        contentReference: range.contentReference,
        point,
      };
    }
    return matchPointOnType<PointWithContentReference>(point, {
      Block(point) {
        if (pointMovement === PointMovement.PreviousBoundByEdge || pointMovement === PointMovement.NextBoundByEdge) {
          return {
            contentReference: range.contentReference,
            point,
          };
        }
        const blockReference = makeBlockReferenceFromBlockPoint(point);
        const newPoint =
          (pointMovement === PointMovement.Previous
            ? accessLastPreviousPointToBlockAtBlockReference(document, blockReference, selectionRangeIntention, true)
            : accessFirstNextPointToBlockAtBlockReference(document, blockReference, selectionRangeIntention, true)) ?? point;
        return {
          contentReference: makeContentReferenceFromContent(
            isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
          ),
          point: newPoint,
        };
      },
      Paragraph(point) {
        if (pointMovement === PointMovement.PreviousBoundByEdge && point.offset === 0) {
          return {
            contentReference: range.contentReference,
            point,
          };
        }
        if (
          movementGranularity === MovementGranularity.Paragraph &&
          (pointMovement === PointMovement.Previous || pointMovement === PointMovement.PreviousBoundByEdge)
        ) {
          if (point.offset === 0) {
            const newPoint =
              accessLastPreviousPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ?? point;
            if (isBlockPoint(newPoint)) {
              return {
                contentReference: makeContentReferenceFromContent(accessContentFromBlockPoint(document, newPoint)),
                point: newPoint,
              };
            }
            return {
              contentReference: makeContentReferenceFromContent(accessContentFromParagraphPoint(document, newPoint)),
              point: changeParagraphPointOffset(newPoint, 0),
            };
          }
          return {
            contentReference: range.contentReference,
            point: changeParagraphPointOffset(point, 0),
          };
        }
        const paragraph = accessParagraphFromParagraphPoint(document, point);
        const paragraphLength = getParagraphLength(paragraph);
        if (pointMovement === PointMovement.NextBoundByEdge && point.offset === paragraphLength) {
          return {
            contentReference: range.contentReference,
            point,
          };
        }
        if (movementGranularity === MovementGranularity.Paragraph) {
          if (point.offset === paragraphLength) {
            const newPoint =
              accessFirstNextPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ?? point;
            if (isBlockPoint(newPoint)) {
              return {
                contentReference: makeContentReferenceFromContent(accessContentFromBlockPoint(document, newPoint)),
                point: newPoint,
              };
            }
            return {
              contentReference: makeContentReferenceFromContent(accessContentFromParagraphPoint(document, newPoint)),
              point: changeParagraphPointOffset(newPoint, getParagraphLength(accessParagraphFromParagraphPoint(document, newPoint))),
            };
          }
          return {
            contentReference: range.contentReference,
            point: changeParagraphPointOffset(point, paragraphLength),
          };
        }
        if (pointMovement === PointMovement.Previous || pointMovement === PointMovement.PreviousBoundByEdge) {
          if (point.offset === 0) {
            const newPoint =
              accessLastPreviousPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ?? point;
            return {
              contentReference: makeContentReferenceFromContent(
                isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
              ),
              point: newPoint,
            };
          }
          const previousInlineWithStartOffset = getInlineNodeWithStartOffsetBeforeParagraphPoint(document, point);
          assertIsNotNullish(previousInlineWithStartOffset);
          if (isVoid(previousInlineWithStartOffset.inline)) {
            return {
              contentReference: range.contentReference,
              point: changeParagraphPointOffset(point, previousInlineWithStartOffset.startOffset),
            };
          }
          let text = previousInlineWithStartOffset.inline.text;
          const inlineEndOffset = previousInlineWithStartOffset.startOffset + previousInlineWithStartOffset.inline.text.length;
          let inlineWithStartOffset: InlineNodeWithStartOffset<TextConfig, VoidConfig> | null = null;
          while (
            (inlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, changeParagraphPointOffset(point, inlineEndOffset))) &&
            !isVoid(inlineWithStartOffset.inline)
          ) {
            text += inlineWithStartOffset.inline.text;
          }
          inlineWithStartOffset = previousInlineWithStartOffset;
          let textStartOffsetInParagraph = inlineWithStartOffset.startOffset;
          while (
            (inlineWithStartOffset = getInlineNodeWithStartOffsetBeforeParagraphPoint(
              document,
              changeParagraphPointOffset(point, inlineWithStartOffset.startOffset),
            )) &&
            !isVoid(inlineWithStartOffset.inline)
          ) {
            text = inlineWithStartOffset.inline.text + text;
            textStartOffsetInParagraph = inlineWithStartOffset.startOffset;
          }
          const segmenter = new stateControlConfig.IntlSegmenter(undefined, {
            granularity:
              movementGranularity === MovementGranularity.Grapheme
                ? 'grapheme'
                : movementGranularity === MovementGranularity.Word || movementGranularity === MovementGranularity.WordBoundary
                ? 'word'
                : movementGranularity === MovementGranularity.Sentence
                ? 'sentence'
                : assertUnreachable(movementGranularity),
          });
          const segments = segmenter.segment(text);
          const offsetWithinText = point.offset - textStartOffsetInParagraph;
          let segmentPrevious = segments.containing(offsetWithinText - 1);
          assertIsNotNullish(segmentPrevious);
          const segmentNext = segments.containing(offsetWithinText);
          if (
            pointMovement === PointMovement.PreviousBoundByEdge &&
            segmentPrevious.index + segmentPrevious.segment.length === offsetWithinText &&
            (movementGranularity === MovementGranularity.WordBoundary ||
              !(segmentPrevious.isWordLike === false && segmentNext && segmentNext.isWordLike === false))
          ) {
            return {
              contentReference: range.contentReference,
              point,
            };
          }
          if (movementGranularity === MovementGranularity.Word) {
            // Haven't thought through how or if this works but it appears to.
            const isSegmentWhitespace = (segment: Intl.SegmentData) => /^\s+$/.test(segment.segment);
            let segmentNext: Intl.SegmentData | undefined;
            while (segmentPrevious && segmentPrevious.isWordLike === false) {
              if (segmentNext && isSegmentWhitespace(segmentPrevious) && !isSegmentWhitespace(segmentNext)) {
                break;
              }
              segmentNext = segmentPrevious;
              segmentPrevious = segments.containing(segmentPrevious.index - 1);
            }
            if (segmentNext && !isSegmentWhitespace(segmentNext)) {
              segmentPrevious = segmentNext;
            }
          }
          if (!segmentPrevious) {
            if (textStartOffsetInParagraph === 0) {
              const newPoint =
                accessLastPreviousPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ??
                changeParagraphPointOffset(point, 0);
              return {
                contentReference: makeContentReferenceFromContent(
                  isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
                ),
                point: newPoint,
              };
            }
            return {
              contentReference: range.contentReference,
              point: changeParagraphPointOffset(point, textStartOffsetInParagraph),
            };
          }
          return {
            contentReference: range.contentReference,
            point: changeParagraphPointOffset(point, segmentPrevious.index),
          };
        }
        if (point.offset === paragraphLength) {
          const newPoint =
            accessFirstNextPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ?? point;
          return {
            contentReference: makeContentReferenceFromContent(
              isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
            ),
            point: newPoint,
          };
        }
        const nextInlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, point);
        assertIsNotNullish(nextInlineWithStartOffset);
        if (isVoid(nextInlineWithStartOffset.inline)) {
          return {
            contentReference: range.contentReference,
            point: changeParagraphPointOffset(point, nextInlineWithStartOffset.startOffset + 1),
          };
        }
        let text = nextInlineWithStartOffset.inline.text;
        const inlineEndOffset = nextInlineWithStartOffset.startOffset + nextInlineWithStartOffset.inline.text.length;
        let inlineWithStartOffset: InlineNodeWithStartOffset<TextConfig, VoidConfig> | null = null;
        while (
          (inlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, changeParagraphPointOffset(point, inlineEndOffset))) &&
          !isVoid(inlineWithStartOffset.inline)
        ) {
          text += inlineWithStartOffset.inline.text;
        }
        inlineWithStartOffset = nextInlineWithStartOffset;
        let textStartOffsetInParagraph = inlineWithStartOffset.startOffset;
        while (
          (inlineWithStartOffset = getInlineNodeWithStartOffsetBeforeParagraphPoint(
            document,
            changeParagraphPointOffset(point, inlineWithStartOffset.startOffset),
          )) &&
          !isVoid(inlineWithStartOffset.inline)
        ) {
          text = inlineWithStartOffset.inline.text + text;
          textStartOffsetInParagraph = inlineWithStartOffset.startOffset;
        }
        const segmenter = new stateControlConfig.IntlSegmenter(undefined, {
          granularity:
            movementGranularity === MovementGranularity.Grapheme
              ? 'grapheme'
              : movementGranularity === MovementGranularity.Word || movementGranularity === MovementGranularity.WordBoundary
              ? 'word'
              : movementGranularity === MovementGranularity.Sentence
              ? 'sentence'
              : assertUnreachable(movementGranularity),
        });
        const segments = segmenter.segment(text);
        const offsetWithinText = point.offset - textStartOffsetInParagraph;
        let segmentNext = segments.containing(offsetWithinText);
        assertIsNotNullish(segmentNext);
        const segmentPrevious = segments.containing(offsetWithinText - 1);
        if (
          pointMovement === PointMovement.NextBoundByEdge &&
          segmentNext.index === offsetWithinText &&
          (movementGranularity === MovementGranularity.WordBoundary ||
            !(segmentNext.isWordLike === false && segmentPrevious && segmentPrevious.isWordLike === false))
        ) {
          return {
            contentReference: range.contentReference,
            point,
          };
        }
        if (movementGranularity === MovementGranularity.Word) {
          // Haven't thought through how or if this works but it appears to.
          const isSegmentWhitespace = (segment: Intl.SegmentData) => /^\s+$/.test(segment.segment);
          let segmentPrevious: Intl.SegmentData | undefined;
          while (segmentNext && segmentNext.isWordLike === false) {
            if (segmentPrevious && isSegmentWhitespace(segmentNext) && !isSegmentWhitespace(segmentPrevious)) {
              break;
            }
            segmentPrevious = segmentNext;
            segmentNext = segments.containing(segmentNext.index + segmentNext.segment.length);
          }
          if (segmentPrevious && !isSegmentWhitespace(segmentPrevious)) {
            segmentNext = segmentPrevious;
          }
        }
        if (!segmentNext) {
          if (textStartOffsetInParagraph + text.length === paragraphLength) {
            const newPoint =
              accessFirstNextPointToBlockAtBlockReference(document, makeBlockReferenceFromParagraphPoint(point), SelectionRangeIntention.Text) ??
              changeParagraphPointOffset(point, paragraphLength);
            return {
              contentReference: makeContentReferenceFromContent(
                isBlockPoint(newPoint) ? accessContentFromBlockPoint(document, newPoint) : accessContentFromParagraphPoint(document, newPoint),
              ),
              point: newPoint,
            };
          }
          return {
            contentReference: range.contentReference,
            point: changeParagraphPointOffset(point, paragraphLength),
          };
        }
        return {
          contentReference: range.contentReference,
          point: changeParagraphPointOffset(point, segmentNext.index + segmentNext.segment.length),
        };
      },
      StartOfContent(point) {
        return {
          contentReference: range.contentReference,
          point,
        };
      },
      EndOfContent(point) {
        return {
          contentReference: range.contentReference,
          point,
        };
      },
    });
  };
}
const noopPointTransformFn: PointTransformFn<NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig, NodeConfig> = (
  _document,
  _stateControlConfig,
  _selectionRangeIntention,
  range,
  point,
) => ({ contentReference: range.contentReference, point });
type PointTransformFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> = (
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selectionRangeIntention: SelectionRangeIntention,
  range: Range,
  point: Point,
  selectionRange: SelectionRange,
) => PointWithContentReference;
type ShouldSelectionRangeCollapseFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> = (
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selectionRange: SelectionRange,
) => SelectionRange | false;
function moveSelectionByPointTransformFnThroughAnchorPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection: Selection,
  shouldSelectionRangeCollapse: ShouldSelectionRangeCollapseFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): Selection {
  return transformSelectionByTransformingSelectionRanges(document, stateControlConfig, selection, (selectionRange) => {
    const collapsedSelectionRange = shouldSelectionRangeCollapse(document, stateControlConfig, selectionRange);
    if (collapsedSelectionRange) {
      assert(collapsedSelectionRange.id === selectionRange.id, 'shouldSelectionRangeCollapse must preserve SelectionRange#id.');
      return collapsedSelectionRange;
    }
    const newRanges = selectionRange.ranges.flatMap((range) => {
      if (range.id !== selectionRange.anchorRangeId) {
        return [];
      }
      const anchorPoint = getAnchorPointFromRange(range);
      const { contentReference, point } = pointTransformFn(document, stateControlConfig, selectionRange.intention, range, anchorPoint, selectionRange);
      return [makeRange(contentReference, point, point, range.id)];
    });
    return makeSelectionRange(
      newRanges,
      selectionRange.anchorRangeId,
      selectionRange.anchorRangeId,
      selectionRange.intention,
      selectionRange.data,
      selectionRange.id,
    );
  });
}
function moveSelectionByPointTransformFnThroughFocusPoint<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection: Selection,
  shouldSelectionRangeCollapse: ShouldSelectionRangeCollapseFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): Selection {
  return transformSelectionByTransformingSelectionRanges(document, stateControlConfig, selection, (selectionRange) => {
    const collapsedSelectionRange = shouldSelectionRangeCollapse(document, stateControlConfig, selectionRange);
    if (collapsedSelectionRange) {
      assert(collapsedSelectionRange.id === selectionRange.id, 'shouldSelectionRangeCollapse must preserve SelectionRange#id.');
      return collapsedSelectionRange;
    }
    const newRanges = selectionRange.ranges.flatMap((range) => {
      if (range.id !== selectionRange.focusRangeId) {
        return [];
      }
      const focusPoint = getFocusPointFromRange(range);
      const { contentReference, point } = pointTransformFn(document, stateControlConfig, selectionRange.intention, range, focusPoint, selectionRange);
      return [makeRange(contentReference, point, point, range.id)];
    });
    return makeSelectionRange(
      newRanges,
      selectionRange.focusRangeId,
      selectionRange.focusRangeId,
      selectionRange.intention,
      selectionRange.data,
      selectionRange.id,
    );
  });
}
type ShouldExtendSelectionRangeFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
> = (
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selectionRange: SelectionRange,
) => boolean;
function extendSelectionByPointTransformFns<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  document: Document<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  stateControlConfig: StateControlConfig<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection: Selection,
  shouldExtendSelectionRange: ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  anchorPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  focusPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
): Selection {
  assert(
    anchorPointTransformFn !== undefined || focusPointTransformFn !== undefined,
    'At least one of anchorPointMovement or focusPointMovement must be provided.',
  );
  return transformSelectionByTransformingSelectionRanges(document, stateControlConfig, selection, (selectionRange) => {
    if (!shouldExtendSelectionRange(document, stateControlConfig, selectionRange)) {
      return selectionRange;
    }
    let newAnchorRangeId = selectionRange.anchorRangeId;
    const newRanges = selectionRange.ranges.flatMap((range) => {
      const shouldTransformRangeAnchor = anchorPointTransformFn !== undefined && range.id === selectionRange.anchorRangeId;
      const shouldTransformRangeFocus = focusPointTransformFn !== undefined && range.id === selectionRange.focusRangeId;
      if (!shouldTransformRangeAnchor && !shouldTransformRangeFocus) {
        return [range];
      }
      const focusPoint = getFocusPointFromRange(range);
      const anchorPoint = getAnchorPointFromRange(range);
      let movedAnchorPointContentReference: ContentReference;
      let movedAnchorPoint: Point;
      if (shouldTransformRangeAnchor) {
        const movedPointInfo = anchorPointTransformFn(document, stateControlConfig, selectionRange.intention, range, anchorPoint, selectionRange);
        movedAnchorPointContentReference = movedPointInfo.contentReference;
        movedAnchorPoint = movedPointInfo.point;
      } else {
        movedAnchorPointContentReference = range.contentReference;
        movedAnchorPoint = range.startPoint;
      }
      let movedFocusPointContentReference: ContentReference;
      let movedFocusPoint: Point;
      if (shouldTransformRangeFocus) {
        const movedPointInfo = focusPointTransformFn(document, stateControlConfig, selectionRange.intention, range, focusPoint, selectionRange);
        movedFocusPointContentReference = movedPointInfo.contentReference;
        movedFocusPoint = movedPointInfo.point;
      } else {
        movedFocusPointContentReference = range.contentReference;
        movedFocusPoint = range.startPoint;
      }
      const replacedRanges = makeRangesConnectingPointsAtContentReferences(
        document,
        movedAnchorPointContentReference,
        movedAnchorPoint,
        movedFocusPointContentReference,
        movedFocusPoint,
        range.id,
      );
      assert(replacedRanges.length > 0);
      if (shouldTransformRangeAnchor && shouldTransformRangeFocus && replacedRanges.length > 1) {
        newAnchorRangeId = generateId();
        replacedRanges[0] = makeRange(replacedRanges[0].contentReference, replacedRanges[0].startPoint, replacedRanges[0].endPoint, newAnchorRangeId);
      }
      return replacedRanges;
    });
    return makeSelectionRange(newRanges, newAnchorRangeId, selectionRange.focusRangeId, selectionRange.intention, selectionRange.data, selectionRange.id);
  });
}
function makeMoveSelectionByPointTransformFnThroughAnchorPointUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  shouldSelectionRangeCollapse: ShouldSelectionRangeCollapseFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection?: Selection,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const {
      delta,
      stateControlConfig,
      stateView: { document },
    } = stateControl;
    const selectionToMove = selection ?? stateControl.stateView.selection;
    const movedSelection = moveSelectionByPointTransformFnThroughAnchorPoint(
      document,
      stateControlConfig,
      selectionToMove,
      shouldSelectionRangeCollapse,
      pointTransformFn,
    );
    delta.setSelection(movedSelection);
  };
}
function makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  shouldSelectionRangeCollapse: ShouldSelectionRangeCollapseFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  pointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection?: Selection,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const {
      delta,
      stateControlConfig,
      stateView: { document },
    } = stateControl;
    const selectionToMove = selection ?? stateControl.stateView.selection;
    const movedSelection = moveSelectionByPointTransformFnThroughFocusPoint(
      document,
      stateControlConfig,
      selectionToMove,
      shouldSelectionRangeCollapse,
      pointTransformFn,
    );
    delta.setSelection(movedSelection);
  };
}
function makeExtendSelectionByPointTransformFnsUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  shouldExtendSelectionRange: ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  anchorPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  focusPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection?: Selection,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const {
      delta,
      stateControlConfig,
      stateView: { document },
    } = stateControl;
    const selectionToExtendAndRemove = selection ?? stateControl.stateView.selection;
    const extendedSelection = extendSelectionByPointTransformFns(
      document,
      stateControlConfig,
      selectionToExtendAndRemove,
      shouldExtendSelectionRange,
      anchorPointTransformFn,
      focusPointTransformFn,
    );
    delta.setSelection(extendedSelection);
  };
}
function makeRemoveSelectionContentsUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(selection?: Selection): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const { delta } = stateControl;
    let selectionToRemove = selection ?? stateControl.stateView.selection;
    while (true) {
      const rangesToRemoveWithSelectionRange = selectionToRemove.selectionRanges.flatMap((selectionRange) =>
        selectionRange.ranges.map((range) => ({ range, selectionRange })),
      );
      const firstRangeWithSelectionRange = rangesToRemoveWithSelectionRange.shift();
      if (!firstRangeWithSelectionRange) {
        break;
      }
      const newSelectionToRemove =
        rangesToRemoveWithSelectionRange.length === 0
          ? null
          : makeSelection(
              Array.from(groupArray(rangesToRemoveWithSelectionRange, ({ selectionRange }) => selectionRange)).map(
                ([selectionRange, rangesWithSelectionRange]) =>
                  makeSelectionRange(
                    rangesWithSelectionRange.map(({ range }) => range),
                    rangesWithSelectionRange[0].range.id,
                    rangesWithSelectionRange[0].range.id,
                    selectionRange.intention,
                    selectionRange.data,
                    selectionRange.id,
                  ),
              ),
            );
      const removeRangeUpdate = makeRemoveRangeContentsUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(
        firstRangeWithSelectionRange.range,
      );
      if (newSelectionToRemove) {
        const stateViewBeforeMutation = stateControl.snapshotStateThroughStateView();
        stateControl.delta.applyUpdate(removeRangeUpdate);
        selectionToRemove = stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
          { selection: newSelectionToRemove, fixWhen: MutationSelectionTransformFixWhen.NoFix },
          stateViewBeforeMutation,
          stateControl.stateView,
        );
      } else {
        delta.applyUpdate(removeRangeUpdate);
        break;
      }
    }
  };
}
function makeRemoveSelectionByPointTransformFnsUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  shouldExtendSelectionRange: ShouldExtendSelectionRangeFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  anchorPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  focusPointTransformFn: PointTransformFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection?: Selection,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const {
      delta,
      stateControlConfig,
      stateView: { document },
    } = stateControl;
    const selectionToExtendAndRemove = selection ?? stateControl.stateView.selection;
    const selectionToRemove = extendSelectionByPointTransformFns(
      document,
      stateControlConfig,
      selectionToExtendAndRemove,
      shouldExtendSelectionRange,
      anchorPointTransformFn,
      focusPointTransformFn,
    );
    delta.applyUpdate(makeRemoveSelectionContentsUpdateFn(selectionToRemove));
  };
}
function makeInsertContentFragmentAtSelectionUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(
  contentFragment: ContentFragment<ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>,
  selection?: Selection,
  getShouldReplaceEdgeParagraphConfig?: (
    edgeParagraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    insertParagraph: Paragraph<ParagraphConfig, TextConfig, VoidConfig>,
    insertStartOffset: number,
    insertEndOffset: number,
    startOrEndOfBoth: EdgeParagraphSide,
  ) => boolean,
  treatAsSelection?: boolean,
): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const { delta } = stateControl;
    let selectionToTransform = selection ?? stateControl.stateView.selection;
    while (true) {
      const rangesToRemoveWithSelectionRange = selectionToTransform.selectionRanges.flatMap((selectionRange) => {
        const focusRange = selectionRange.ranges.find((range) => range.id === selectionRange.focusRangeId);
        assertIsNotNullish(focusRange);
        return [...selectionRange.ranges.filter((range) => range.id !== selectionRange.focusRangeId), focusRange].map((range) => ({
          range,
          selectionRange,
        }));
      });
      const firstRangeWithSelectionRange = rangesToRemoveWithSelectionRange.shift();
      if (!firstRangeWithSelectionRange) {
        break;
      }
      const newSelectionToTransform =
        rangesToRemoveWithSelectionRange.length === 0
          ? null
          : makeSelection(
              Array.from(groupArray(rangesToRemoveWithSelectionRange, ({ selectionRange }) => selectionRange)).map(
                ([selectionRange, rangesWithSelectionRange]) =>
                  makeSelectionRange(
                    rangesWithSelectionRange.map(({ range }) => range),
                    rangesWithSelectionRange[0].range.id,
                    rangesWithSelectionRange[0].range.id,
                    selectionRange.intention,
                    selectionRange.data,
                    selectionRange.id,
                  ),
              ),
            );
      let updateFn: RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>;
      if (
        rangesToRemoveWithSelectionRange.length === 0 || // TODO: insert at focus range.
        rangesToRemoveWithSelectionRange.every(
          (rangeToRemoveWithSelectionRange) => rangeToRemoveWithSelectionRange.selectionRange.id !== firstRangeWithSelectionRange.selectionRange.id,
        )
      ) {
        updateFn = makeInsertContentFragmentAtRangeUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(
          firstRangeWithSelectionRange.range,
          contentFragment,
          getShouldReplaceEdgeParagraphConfig,
          selection && !treatAsSelection
            ? undefined
            : (selectionRange) => {
                return areSelectionRangesCoveringSameContent(selectionRange, firstRangeWithSelectionRange.selectionRange);
              },
        );
      } else {
        updateFn = makeRemoveRangeContentsUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>(
          firstRangeWithSelectionRange.range,
        );
      }
      if (newSelectionToTransform) {
        const stateViewBeforeMutation = stateControl.snapshotStateThroughStateView();
        stateControl.delta.applyUpdate(updateFn);
        selectionToTransform = stateControl.transformSelectionForwardsFromFirstStateViewToSecondStateView(
          { selection: newSelectionToTransform, fixWhen: MutationSelectionTransformFixWhen.NoFix },
          stateViewBeforeMutation,
          stateControl.stateView,
        );
      } else {
        delta.applyUpdate(updateFn);
        break;
      }
    }
  };
}
function makeTransposeAtSelectionUpdateFn<
  DocumentConfig extends NodeConfig,
  ContentConfig extends NodeConfig,
  ParagraphConfig extends NodeConfig,
  EmbedConfig extends NodeConfig,
  TextConfig extends NodeConfig,
  VoidConfig extends NodeConfig,
>(selection?: Selection): RunUpdateFn<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig> {
  return (stateControl) => {
    const {
      delta,
      stateView: { document },
    } = stateControl;
    const segmenter = new stateControl.stateControlConfig.IntlSegmenter();
    const selectionToTranspose = selection ?? stateControl.stateView.selection;
    const mutations: Mutation<DocumentConfig, ContentConfig, ParagraphConfig, EmbedConfig, TextConfig, VoidConfig>[] = [];
    const selectionRangeUpdates: [SelectionRange, Range][] = [];
    selectionToTranspose.selectionRanges.forEach((selectionRange) => {
      if (selectionRange.ranges.length === 1 && getRangeDirection(document, selectionRange.ranges[0]) === RangeDirection.NeutralText) {
        const collapsedTransposeRange = selectionRange.ranges[0];
        const transposeParagraphPoint = collapsedTransposeRange.startPoint;
        assertIsParagraphPoint(transposeParagraphPoint);
        const nextInlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, transposeParagraphPoint);
        const previousInlineWithStartOffset = getInlineNodeWithStartOffsetAfterParagraphPoint(document, transposeParagraphPoint);
        type TextInlineWithStartOffset = { inline: Text<TextConfig>; startOffset: number };
        let firstTextWithStartOffset: TextInlineWithStartOffset;
        let secondTextWithStartOffset: TextInlineWithStartOffset | null = null;
        let firstGraphemeTextConfigBeforeTranspose: TextConfig;
        let secondGraphemeTextConfigBeforeTranspose: TextConfig | null = null;
        // TODO: doesn't work when grapheme is split into multiple texts with different styling.
        if (!nextInlineWithStartOffset || isVoid(nextInlineWithStartOffset.inline)) {
          if (!previousInlineWithStartOffset || isVoid(previousInlineWithStartOffset.inline)) {
            // Between two voids.
            return;
          }
          // End of text.
          firstTextWithStartOffset = previousInlineWithStartOffset as TextInlineWithStartOffset;
        } else if (!previousInlineWithStartOffset || isVoid(previousInlineWithStartOffset.inline)) {
          // Start of text.
          firstTextWithStartOffset = nextInlineWithStartOffset as TextInlineWithStartOffset;
        } else {
          // Middle of text.
          firstTextWithStartOffset = previousInlineWithStartOffset as TextInlineWithStartOffset;
          if (previousInlineWithStartOffset.startOffset !== nextInlineWithStartOffset.startOffset) {
            secondTextWithStartOffset = nextInlineWithStartOffset as TextInlineWithStartOffset;
          }
        }
        const segments: { segment: string; index: number }[] = [];
        for (const { segment, index } of segmenter.segment(
          secondTextWithStartOffset === null
            ? firstTextWithStartOffset.inline.text
            : firstTextWithStartOffset.inline.text + secondTextWithStartOffset.inline.text,
        )) {
          segments.push({ segment, index });
          if (firstTextWithStartOffset.startOffset + index >= transposeParagraphPoint.offset && segments.length > 1) {
            firstGraphemeTextConfigBeforeTranspose = firstTextWithStartOffset.inline.config;
            if (secondTextWithStartOffset !== null && firstTextWithStartOffset.startOffset + index >= secondTextWithStartOffset.startOffset) {
              secondGraphemeTextConfigBeforeTranspose = secondTextWithStartOffset.inline.config;
            }
            break;
          }
        }
        firstGraphemeTextConfigBeforeTranspose ??= firstTextWithStartOffset.inline.config;
        assert(segments.length !== 0);
        if (segments.length === 1) {
          return;
        }
        const firstGrapheme = segments[segments.length - 2];
        const secondGrapheme = segments[segments.length - 1];
        const pointAfterFirstGraphemeAfterTransposed = changeParagraphPointOffset(
          transposeParagraphPoint,
          firstTextWithStartOffset.startOffset + firstGrapheme.index + secondGrapheme.segment.length,
        );
        selectionRangeUpdates.push([
          selectionRange,
          makeRange(collapsedTransposeRange.contentReference, pointAfterFirstGraphemeAfterTransposed, pointAfterFirstGraphemeAfterTransposed, generateId()),
        ]);
        mutations.push(
          makeSpliceParagraphMutation(
            changeParagraphPointOffset(transposeParagraphPoint, firstTextWithStartOffset.startOffset + firstGrapheme.index),
            firstGrapheme.segment.length + secondGrapheme.segment.length,
            secondGraphemeTextConfigBeforeTranspose === null
              ? [makeText(firstGraphemeTextConfigBeforeTranspose, secondGrapheme.segment + firstGrapheme.segment)]
              : [
                  makeText(secondGraphemeTextConfigBeforeTranspose, secondGrapheme.segment),
                  makeText(firstGraphemeTextConfigBeforeTranspose, firstGrapheme.segment),
                ],
          ),
        );
      }
    });
    if (mutations.length > 0) {
      delta.applyMutation(makeBatchMutation(mutations), undefined, (selectionRange) => {
        const selectionRangeUpdate = selectionRangeUpdates.find((selectionRangeUpdate) =>
          areSelectionRangesCoveringSameContent(selectionRange, selectionRangeUpdate[0]),
        );
        if (!selectionRangeUpdate) {
          return;
        }
        return makeSelectionRange(
          [selectionRangeUpdate[1]],
          selectionRangeUpdate[1].id,
          selectionRangeUpdate[1].id,
          SelectionRangeIntention.Text,
          selectionRange.data,
          selectionRange.id,
        );
      });
    }
  };
}
export {
  type AnyNode,
  type BaseRenderControl,
  type BatchMutation,
  type Block,
  type BlockPoint,
  type BlockReference,
  type BlockStore,
  type ChangeContentConfigMutation,
  type ChangedMutationResult,
  type ChangeDocumentConfigMutation,
  type ChangeEmbedConfigMutation,
  type ChangeParagraphConfigBetweenBlockPointsMutation,
  type ChangeTextConfigBetweenParagraphPointsMutation,
  type ChangeVoidConfigMutation,
  type Content,
  type ContentFragment,
  type ContentFragmentBlock,
  type ContentFragmentEmbed,
  type ContentFragmentParagraph,
  type ContentListFragment,
  type ContentListFragmentContent,
  type ContentReference,
  type ContentRenderControl,
  type ContentStore,
  type Delta,
  type Document,
  type DocumentRenderControl,
  type DocumentView,
  type Embed,
  type EmbedRenderControl,
  type EndOfContentPoint,
  type FinishedUpdatingMessage,
  type GroupConsecutiveItemsInArrayGroup,
  type Inline,
  type InlineNodeWithStartOffset,
  type InsertBlocksAfterMutation,
  type InsertBlocksAtEndMutation,
  type InsertBlocksBeforeMutation,
  type InsertContentsAfterMutation,
  type InsertContentsAtEndMutation,
  type InsertContentsBeforeMutation,
  type JoinParagraphsBackwardsMutation,
  type JoinParagraphsForwardsMutation,
  type Json,
  type JsonArray,
  type JsonMap,
  type JsonPrimitive,
  type MatchPointOnTypeAccessors,
  type MatchRangeOnPointTypesAccessors,
  type MatchRangeOnPointTypesWithoutDirectionAccessors,
  type MoveBlocksAfterMutation,
  type MoveBlocksAtEndMutation,
  type MoveBlocksBeforeMutation,
  type MoveContentsAfterMutation,
  type MoveContentsAtEndMutation,
  type MoveContentsBeforeMutation,
  type Mutation,
  type MutationReference,
  type MutationResult,
  type MutationSelectionToTransform,
  type NestedBlock,
  type NestedContent,
  type NoChangeMutationResult,
  type NodeBase,
  type NodeConfig,
  type Paragraph,
  type ParagraphPoint,
  type ParagraphRenderControl,
  type Point,
  type PointBase,
  type PointKey,
  type PointTransformFn,
  type PointWithContentReference,
  type QueuedUpdate,
  type Range,
  type RangeWithKeys,
  type RegisterTopLevelContentMutation,
  type RemoveBlocksMutation,
  type RemoveContentsMutation,
  type RenderControlRegister,
  type RunUpdateFn,
  type Selection,
  type SelectionRange,
  type ShouldExtendSelectionRangeFn,
  type ShouldSelectionRangeCollapseFn,
  type SpliceParagraphMutation,
  type SplitParagraphBackwardsMutation,
  type SplitParagraphForwardsMutation,
  type StartOfContentPoint,
  type State,
  type StateControl,
  type StateControlConfig,
  type StateView,
  type Text,
  type TransformSelectionRangeFn,
  type UpdateContentConfigMutation,
  type UpdateDocumentConfigMutation,
  type UpdateEmbedConfigMutation,
  type UpdateParagraphConfigBetweenBlockPointsMutation,
  type UpdateTextConfigBetweenParagraphPointsMutation,
  type UpdateVoidConfigMutation,
  type ViewControl,
  type ViewDelta,
  type ViewDeltaChange,
  type ViewDeltaControl,
  type Void,
  accessBlockAtIndexInContentAtContentReference,
  accessBlockFromBlockPoint,
  accessBlockFromBlockReference,
  accessContentAtIndexInEmbedAtBlockReference,
  accessContentFromBlockPoint,
  accessContentFromBlockReference,
  accessContentFromContentReference,
  accessContentFromParagraphPoint,
  accessEmbedFromContentReference,
  accessFirstNextPointToBlockAtBlockReference,
  accessFirstNextPointToContentAtContentReference,
  accessFirstPointInContentAtContentReference,
  accessFirstPointInEmbedAtBlockReference,
  accessLastBlockInContentAtContentReference,
  accessLastContentInEmbedAtBlockReference,
  accessLastPointInContentAtContentReference,
  accessLastPointInEmbedAtBlockReference,
  accessLastPreviousPointToBlockAtBlockReference,
  accessLastPreviousPointToContentAtContentReference,
  accessNextBlockToBlockAtBlockReference,
  accessNextContentToContentInEmbedAtContentReference,
  accessParagraphFromParagraphPoint,
  accessPreviousBlockToBlockAtBlockReference,
  accessPreviousContentToContentInEmbedAtContentReference,
  AlreadyInitializedPropertyError,
  applyMutation,
  areBlockPointsAtSameBlock,
  areBlockReferencesAtSameBlock,
  areContentReferencesAtSameContent,
  areJsonEqual,
  areNodeConfigsEqual,
  areParagraphPointsAtSameOffsetInSameParagraph,
  areParagraphPointsAtSameParagraph,
  arePointsEqual,
  areRangesEqual,
  areSelectionRangesEqual,
  areSelectionsEqual,
  assertBlockReferenceIsInBlockStore,
  assertContentReferenceIsInContentStore,
  assertIsBlockPoint,
  assertIsContent,
  assertIsDocument,
  assertIsEmbed,
  assertIsEndOfContentPoint,
  assertIsNotBlockPoint,
  assertIsNotContent,
  assertIsNotDocument,
  assertIsNotEmbed,
  assertIsNotEndOfContentPoint,
  assertIsNotParagraph,
  assertIsNotParagraphPoint,
  assertIsNotStartOfContentPoint,
  assertIsNotText,
  assertIsNotVoid,
  assertIsParagraph,
  assertIsParagraphPoint,
  assertIsStartOfContentPoint,
  assertIsText,
  assertIsVoid,
  BatchMutationMustContainMutationsError,
  BlockAlreadyInDocumentError,
  BlockNotInBlockStoreError,
  BlockNotInContentError,
  changeParagraphPointOffset,
  cloneBlock,
  cloneBlockAndChangeIds,
  cloneContent,
  cloneContentAndChangeIds,
  cloneContentFragmentAndChangeIds,
  cloneContentFragmentBlockAndChangeIds,
  cloneContentFragmentEmbedAndChangeIds,
  cloneContentFragmentParagraphAndChangeIds,
  cloneContentListFragmentAndChangeIds,
  cloneContentListFragmentContentAndChangeIds,
  cloneEmbed,
  cloneEmbedAndChangeIds,
  cloneInline,
  cloneInlineAndChangeIds,
  cloneJson,
  cloneNestedBlockAndChangeIds,
  cloneNestedContentAndChangeIds,
  cloneNodeConfig,
  cloneParagraph,
  cloneParagraphAndChangeIds,
  cloneVoid,
  cloneVoidAndChangeIds,
  compareKeys,
  ContentAlreadyInDocumentError,
  ContentNotInContentStoreError,
  ContentNotInEmbedError,
  ContentReferenceMissingEmbedReferenceError,
  extendSelectionByPointTransformFns,
  fixAndTransformSelectionByTransformingSelectionRanges,
  fixSelectionIntentions,
  forEachMutationInBatchMutation,
  generateId,
  getAnchorPointFromRange,
  getBlockFromContentFragmentBlock,
  getBlockIdFromBlockPoint,
  getBlockIdFromBlockReference,
  getBlockIdFromParagraphPoint,
  getFocusPointFromRange,
  getFocusSelectionRangeFromSelection,
  getIndexOfBlockInContentFromBlockReference,
  getIndexOfEmbedContentFromContentReference,
  getInlineLength,
  getInlineNodeWithStartOffsetAfterParagraphPoint,
  getInlineNodeWithStartOffsetBeforeParagraphPoint,
  getIsSelectionRangeAnchorAfterFocus,
  getLengthOfParagraphInlineNodes,
  getNumberOfBlocksInContentAtContentReference,
  getNumberOfEmbedContentsInEmbedAtBlockReference,
  getParagraphLength,
  getRangeDirection,
  groupArray,
  groupConsecutiveItemsInArray,
  InvalidBoundsError,
  InvalidRangeError,
  isBatchMutation,
  isBlockPoint,
  isBlockPointAtBlock,
  isBlockReferenceAtBlock,
  isContent,
  isContentAtContentReferenceEmpty,
  isContentAtContentReferenceInEmbed,
  isContentFragmentEmbed,
  isContentFragmentParagraph,
  isDocument,
  isEmbed,
  isEmbedAtBlockReferenceEmpty,
  isEndOfContentPoint,
  isJsonPrimitive,
  isParagraph,
  isParagraphEmpty,
  isParagraphPoint,
  isParagraphPointAtParagraph,
  isPointAtBlock,
  isSelectionCollapsedInText,
  isStartOfContentPoint,
  isText,
  isVoid,
  iterateParagraphChildren,
  makeArrayWithNumbersFromStartToEndInclusive,
  makeBatchMutation,
  makeBlockPointFromBlock,
  makeBlockPointFromBlockReference,
  makeBlockPointFromParagraphPoint,
  makeBlockReferenceFromBlock,
  makeBlockReferenceFromBlockId,
  makeBlockReferenceFromBlockPoint,
  makeBlockReferenceFromParagraphPoint,
  makeChangeContentConfigMutation,
  makeChangedMutationResult,
  makeChangeDocumentConfigMutation,
  makeChangeEmbedConfigMutation,
  makeChangeParagraphConfigBetweenBlockPointsMutation,
  makeChangeTextConfigBetweenParagraphPoints,
  makeChangeVoidConfigMutation,
  makeContent,
  makeContentFragment,
  makeContentFragmentEmbed,
  makeContentFragmentParagraph,
  makeContentListFragment,
  makeContentListFragmentContent,
  makeContentReferenceFromContent,
  makeContentReferenceFromContentId,
  makeDefaultPointTransformFn,
  makeDocument,
  makeEmbed,
  makeEndOfContentPoint,
  makeExtendSelectionByPointTransformFnsUpdateFn,
  makeInitialStateFromDocument,
  makeInsertBlocksAfterMutation,
  makeInsertBlocksAtEndMutation,
  makeInsertBlocksBeforeMutation,
  makeInsertContentFragmentAtRangeUpdateFn,
  makeInsertContentFragmentAtSelectionUpdateFn,
  makeInsertContentsAfterMutation,
  makeInsertContentsAtEndMutation,
  makeInsertContentsBeforeMutation,
  makeJoinParagraphsBackwardsMutation,
  makeJoinParagraphsForwardsMutation,
  makeListOfAllParentContentReferencesOfContentAtContentReference,
  makeListOfAllParentContentReferencesWithEmbedReferencesOfContentAtContentReference,
  makeMoveBlocksAfterMutation,
  makeMoveBlocksAtEndMutation,
  makeMoveBlocksBeforeMutation,
  makeMoveContentsAfterMutation,
  makeMoveContentsAtEndMutation,
  makeMoveContentsBeforeMutation,
  makeMoveSelectionByPointTransformFnThroughAnchorPointUpdateFn,
  makeMoveSelectionByPointTransformFnThroughFocusPointUpdateFn,
  makeNestedBlock,
  makeNestedContent,
  makeNoChangeMutationResult,
  makeParagraph,
  makeParagraphPointFromParagraphAndOffset,
  makeParagraphPointFromParagraphBlockReferenceAndOffset,
  makePointKeyFromPoint,
  makeRange,
  makeRangesConnectingPointsAtContentReferences,
  makeRegisterTopLevelContentMutation,
  makeRemoveBlocksMutation,
  makeRemoveBlocksSelectionTransformFn,
  makeRemoveContentsMutation,
  makeRemoveContentsSelectionTransformFn,
  makeRemoveRangeContentsUpdateFn,
  makeRemoveSelectionByPointTransformFnsUpdateFn,
  makeRemoveSelectionContentsUpdateFn,
  makeSelection,
  makeSelectionRange,
  makeSortedRangeWithKeysFromRange,
  makeSpliceParagraphMutation,
  makeSplitParagraphBackwardsMutation,
  makeSplitParagraphForwardsMutation,
  makeStartOfContentPoint,
  makeStateControl,
  makeText,
  makeTransposeAtSelectionUpdateFn,
  makeUpdateContentConfigMutation,
  makeUpdateDocumentConfigMutation,
  makeUpdateEmbedConfigMutation,
  makeUpdateParagraphConfigBetweenBlockPointsMutation,
  makeUpdateTextConfigBetweenParagraphPointsMutation,
  makeUpdateVoidConfigMutation,
  makeViewControl,
  makeViewDeltaAndViewDeltaControl,
  makeVoid,
  matchPointOnType,
  matchRangeOnPointTypes,
  matchRangeOnPointTypesWithoutDirection,
  mergeTextsWithEqualConfigs,
  moveSelectionByPointTransformFnThroughAnchorPoint,
  moveSelectionByPointTransformFnThroughFocusPoint,
  MutationNodeEndBeforeStartError,
  NodeNotOfTypeError,
  NodeOfTypeError,
  PointNotOfTypeError,
  PointShouldNotBeOfTypeError,
  registerBlockInDocument,
  registerContentFragmentBlocks,
  registerContentInDocument,
  registerContentListFragmentContents,
  removeBlocksFromContentAtContentReferenceBetweenBlockPoints,
  removeContentsFromEmbedAtBlockReferenceBetweenContentReferences,
  sliceParagraphChildren,
  sliceParagraphInlineNodes,
  sliceText,
  sortAndMergeAndFixSelectionRanges,
  spliceParagraphChildren,
  spliceParagraphInlineNodes,
  transformSelectionByTransformingSelectionRanges,
  unregisterBlockAtBlockReferenceInDocument,
  unregisterContentAtContentReferenceInDocument,
  areSelectionsCoveringSameContent,
  areSelectionRangesCoveringSameContent,
  areRangesCoveringSameContent,
  RegisterUnregisterEventType,
  type ContentRenderControlRegisterUnregisterEvent,
  type ParagraphRenderControlRegisterUnregisterEvent,
  type EmbedRenderControlRegisterUnregisterEvent,
  getSelectionRangeAnchorAndFocusPointWithContentReferences,
  NodeType,
  ContentFragmentBlockType,
  PointType,
  RangeDirection,
  SelectionRangeIntention,
  ViewDeltaChangeType,
  CompareKeysResult,
  MutationSelectionTransformFixWhen,
  MutationType,
  EdgeParagraphSide,
  MovementGranularity,
  PointMovement,
  noopPointTransformFn,
  type SelectionChangeMessage,
  type MutationResultMessage,
  arePointWithContentReferencesEqual,
  SelectionRangeDataCreatedAtKey,
};
