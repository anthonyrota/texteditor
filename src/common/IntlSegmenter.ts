import { createIntlSegmenterPolyfill } from 'intl-segmenter-polyfill/dist/bundled_cja';
interface IntlSegments {
  containing(codeUnitIndex?: number): Intl.SegmentData | undefined;
  [Symbol.iterator](): IterableIterator<Intl.SegmentData>;
}
interface IntlSegmenter {
  segment(input: string): IntlSegments;
  resolvedOptions(): Intl.ResolvedSegmenterOptions;
}
interface IntlSegmenterConstructor {
  prototype: IntlSegmenter;
  new (locales?: Intl.BCP47LanguageTag | Intl.BCP47LanguageTag[], options?: Intl.SegmenterOptions): IntlSegmenter;
  supportedLocalesOf(locales: Intl.BCP47LanguageTag | Intl.BCP47LanguageTag[], options?: Pick<Intl.SegmenterOptions, 'localeMatcher'>): Intl.BCP47LanguageTag[];
}
let IntlSegmenterPromise: Promise<IntlSegmenterConstructor> | undefined;
function makePromiseResolvingToNativeIntlSegmenterOrPolyfill(): Promise<IntlSegmenterConstructor> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (Intl.Segmenter) {
    return Promise.resolve(Intl.Segmenter);
  }
  if (IntlSegmenterPromise) {
    return IntlSegmenterPromise;
  }
  IntlSegmenterPromise = createIntlSegmenterPolyfill() as unknown as Promise<IntlSegmenterConstructor>;
  return IntlSegmenterPromise;
}
export { type IntlSegments, type IntlSegmenter, type IntlSegmenterConstructor, makePromiseResolvingToNativeIntlSegmenterOrPolyfill };
