import { isSafari } from './browserDetection';
interface IntlSegments {
  containing(codeUnitIndex?: number): Intl.SegmentData | undefined;
  [Symbol.iterator](): IterableIterator<Intl.SegmentData>;
}
interface IntlSegmenter {
  segment(input: string): IntlSegments;
}
interface IntlSegmenterConstructor {
  prototype: IntlSegmenter;
  new (locales?: Intl.BCP47LanguageTag | Intl.BCP47LanguageTag[], options?: Intl.SegmenterOptions): IntlSegmenter;
}
let IntlSegmenterPromise: Promise<IntlSegmenterConstructor> | undefined;
function patchIntlSegmenter(BadIntlSegmenter: IntlSegmenterConstructor): IntlSegmenterConstructor {
  class IntlSegmenterFixed {
    private $p_segmenter: IntlSegmenter;
    private $p_options?: Intl.SegmenterOptions;
    constructor(locales?: Intl.BCP47LanguageTag | Intl.BCP47LanguageTag[], options?: Intl.SegmenterOptions) {
      this.$p_segmenter = new BadIntlSegmenter(locales, options);
      this.$p_options = options;
    }
    segment(input: string): IntlSegments {
      const segments = this.$p_segmenter.segment(input);
      if (this.$p_options?.granularity !== 'word') {
        return segments;
      }
      let segmentsCached: Intl.SegmentData[] | null = null;
      const segmentsPatched: IntlSegments = {
        containing(codeUnitIndex = 0): Intl.SegmentData | undefined {
          if (segmentsCached === null) {
            segmentsCached = [...segmentsPatched];
          }
          return segmentsCached.find(({ index, segment }) => codeUnitIndex >= index && codeUnitIndex <= index + segment.length - 1);
        },
        *[Symbol.iterator](): IterableIterator<Intl.SegmentData> {
          if (segmentsCached !== null) {
            return segmentsCached[Symbol.iterator]();
          }
          for (const segment of segments) {
            if (!segment.isWordLike) {
              yield segment;
              continue;
            }
            let lastIndexAfter = 0;
            for (let i = 0; i < segment.segment.length; i++) {
              if (segment.segment[i] === '.') {
                if (i > lastIndexAfter) {
                  yield {
                    index: segment.index + lastIndexAfter,
                    input,
                    segment: segment.segment.slice(lastIndexAfter, i),
                    isWordLike: true,
                  };
                }
                yield {
                  index: segment.index + i,
                  input,
                  segment: '.',
                  isWordLike: false,
                };
                lastIndexAfter = i + 1;
              }
            }
            if (lastIndexAfter === 0) {
              yield segment;
              continue;
            }
            if (lastIndexAfter === segment.segment.length) {
              continue;
            }
            yield {
              index: segment.index + lastIndexAfter,
              input,
              segment: segment.segment.slice(lastIndexAfter),
              isWordLike: true,
            };
          }
        },
      };
      return segmentsPatched;
    }
  }
  return IntlSegmenterFixed;
}
let patchedSafariIntlSegmenter: IntlSegmenterConstructor | undefined;
function makePromiseResolvingToNativeIntlSegmenterOrPolyfill(): Promise<IntlSegmenterConstructor> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (Intl.Segmenter) {
    if (isSafari) {
      if (!patchedSafariIntlSegmenter) {
        patchedSafariIntlSegmenter = patchIntlSegmenter(Intl.Segmenter);
      }
      return Promise.resolve(patchedSafariIntlSegmenter);
    }
    return Promise.resolve(Intl.Segmenter);
  }
  if (IntlSegmenterPromise) {
    return IntlSegmenterPromise;
  }
  IntlSegmenterPromise = import('intl-segmenter-polyfill/dist/bundled_cja')
    .then(({ createIntlSegmenterPolyfill }) => createIntlSegmenterPolyfill() as unknown as Promise<IntlSegmenterConstructor>)
    .then(patchIntlSegmenter);
  return IntlSegmenterPromise;
}
export { type IntlSegments, type IntlSegmenter, type IntlSegmenterConstructor, makePromiseResolvingToNativeIntlSegmenterOrPolyfill };
