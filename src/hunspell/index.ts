// Adapted from hunspell-asm/emscripten-wasm-loader.
import { v4 } from 'uuid';
import { memoComputingValueNoArgs } from '../common/memoComputingValueNoArgs';
type stringToUTF8Signature = (str: string, outPtr: number, maxBytesToWrite: number) => void;
type cwrapArgType = 'number' | 'string' | 'array' | 'boolean';
// eslint-disable-next-line @typescript-eslint/ban-types
type cwrapSignature = <T = Function>(fn: string, returnType: cwrapArgType | null, parameterType?: Array<cwrapArgType>) => T;
type FILESYSTEMS = {
  NODEFS: any;
  MEMFS: any;
};
type FS = {
  filesystems: FILESYSTEMS;
  stat: (path: string) => import('fs').Stats;
  isDir: (mode: number) => boolean;
  isFile: (mode: number) => boolean;
  mkdir: (path: string, mode?: number) => void;
  mount: (type: FILESYSTEMS, option: { root?: string }, mountpoint: string) => void;
  writeFile: (path: string, data: ArrayBufferView, opts: { encoding?: string; flags?: string }) => void;
  unlink: (path: string) => void;
  unmount: (mountpoint: string) => void;
  rmdir: (path: string) => void;
};
interface AsmModule {
  cwrap: cwrapSignature;
  FS: FS;
  stringToUTF8: stringToUTF8Signature;
  getValue: <T = any>(ptr: number, type: string, nosafe?: boolean) => T;
  allocateUTF8: (str: string) => number;
  UTF8ToString: (ptr: number) => string;
  _free: (ptr: number) => void;
  _malloc: (size: number) => number;
}
type BaseAsmModule = Partial<AsmModule> & { initializeRuntime(): Promise<boolean> };
const isMounted = (FS: FS, mountPath: string, type: 'dir' | 'file'): boolean => {
  try {
    const stat = FS.stat(mountPath);
    const typeFunction = type === 'dir' ? FS.isDir : FS.isFile;
    if (!!(stat as unknown) && typeFunction(stat.mode)) {
      return true;
    }
    // eslint-disable-next-line no-empty
  } catch (e) {}
  return false;
};
const mountBuffer =
  (FS: FS, memPathId: string): ((contents: ArrayBufferView, fileName?: string) => string) =>
  (contents: ArrayBufferView, fileName?: string): string => {
    const file = fileName || v4();
    const mountedFilePath = `${memPathId}/${file}`;
    if (!isMounted(FS, mountedFilePath, 'file')) {
      FS.writeFile(mountedFilePath, contents, { encoding: 'binary' });
    }
    return mountedFilePath;
  };
const unmount =
  (FS: FS, memPathId: string): ((mountedPath: string) => void) =>
  (mountedPath: string) => {
    if (isMounted(FS, mountedPath, 'file') && mountedPath.indexOf(memPathId) > -1) {
      FS.unlink(mountedPath);
      return;
    }
    if (isMounted(FS, mountedPath, 'dir')) {
      FS.unmount(mountedPath);
      FS.rmdir(mountedPath);
      return;
    }
  };
interface AsmRuntimeType {
  initializeRuntime: () => Promise<boolean>;
}
const constructModule = () => {
  let isInitialized = false;
  let resolve: ((value: unknown) => void) | undefined;
  return {
    onAbort: (reason: unknown) => {
      if (!isInitialized) {
        throw reason;
      }
    },
    onRuntimeInitialized: () => {
      isInitialized = true;
      if (resolve) {
        resolve(true);
      }
    },
    initializeRuntime: () => {
      if (isInitialized) {
        return Promise.resolve(true);
      }
      return new Promise((resolve_, _reject) => {
        resolve = resolve_;
      });
    },
  };
};
type moduleLoaderType<T> = () => Promise<T>;
type runtimeModuleType = (moduleObject: Record<string, any>) => Promise<AsmRuntimeType>;
type getModuleLoaderType = <T, R extends AsmRuntimeType>(factoryLoader: (runtime: R) => T, runtimeModule: runtimeModuleType) => moduleLoaderType<T>;
const getModuleLoader: getModuleLoaderType =
  <T, R extends AsmRuntimeType>(factoryLoader: (runtime: R) => T, runtimeModule: runtimeModuleType) =>
  async () => {
    const constructedModule = constructModule();
    await runtimeModule(constructedModule);
    const result = await constructedModule.initializeRuntime();
    if (!result) {
      throw new Error(`Timeout to initialize runtime`);
    }
    return factoryLoader(constructedModule as unknown as R);
  };
interface HunspellAsmModule extends Required<BaseAsmModule> {}
interface HunspellFactory {
  mountBuffer: (contents: ArrayBufferView, fileName?: string) => string;
  unmount: (mountedFilePath: string) => void;
  create: (affPath: string, dictPath: string) => Hunspell;
}
interface Hunspell {
  dispose: () => void;
  spell: (word: string) => boolean;
  suggest: (word: string) => Array<string>;
  stem: (word: string) => Array<string>;
  addDictionary: (dictPath: string) => boolean;
  addWord: (word: string) => void;
  addWordWithAffix: (word: string, affix: string) => void;
  removeWord: (word: string) => void;
}
const wrapHunspellInterface = (cwrap: cwrapSignature) => ({
  create: cwrap<(affPath: number, dicPath: number) => number>('Hunspell_create', 'number', ['number', 'number']),
  destroy: cwrap<(hunspellPtr: number) => void>('Hunspell_destroy', null, ['number']),
  spell: cwrap<(hunspellPtr: number, value: number) => number>('Hunspell_spell', 'number', ['number', 'number']),
  suggest: cwrap<(hunspellPtr: number, outSuggestionListPtr: number, value: number) => number>('Hunspell_suggest', 'number', ['number', 'number', 'number']),
  stem: cwrap<(hunspellPtr: number, outSuggestionListPtr: number, value: number) => number>('Hunspell_stem', 'number', ['number', 'number', 'number']),
  free_list: cwrap<(hunspellPtr: number, suggestionListPtr: number, count: number) => void>('Hunspell_free_list', null, ['number', 'number', 'number']),
  add_dic: cwrap<(hunspellPtr: number, dicPath: number) => number>('Hunspell_add_dic', 'number', ['number', 'number']),
  add: cwrap<(hunspellPtr: number, value: number) => number>('Hunspell_add', 'number', ['number', 'number']),
  add_with_affix: cwrap<(hunspellPtr: number, value: number, affix: number) => number>('Hunspell_add_with_affix', 'number', ['number', 'number', 'number']),
  remove: cwrap<(hunspellPtr: number, value: number) => number>('Hunspell_remove', 'number', ['number', 'number']),
});
const hunspellLoader = (asmModule: HunspellAsmModule): HunspellFactory => {
  const { cwrap, FS, _free, allocateUTF8, _malloc, getValue, UTF8ToString } = asmModule;
  const hunspellInterface = wrapHunspellInterface(cwrap);
  const memPathId = `/${v4()}`;
  FS.mkdir(memPathId);
  const usingParamPtr = <T = void>(...args: [...string[], (...args: Array<number>) => T]): T => {
    const params = [...args];
    const fn = params.pop() as (...args: Array<number>) => T;
    //https://mathiasbynens.be/notes/javascript-unicode
    const paramsPtr = (params as string[]).map((param) => allocateUTF8(param.normalize()));
    const ret = fn(...paramsPtr);
    paramsPtr.forEach((paramPtr) => _free(paramPtr));
    return ret;
  };
  return {
    mountBuffer: mountBuffer(FS, memPathId),
    unmount: unmount(FS, memPathId),
    create: (affPath: string, dictPath: string) => {
      const affPathPtr = allocateUTF8(affPath);
      const dictPathPtr = allocateUTF8(dictPath);
      const hunspellPtr = hunspellInterface.create(affPathPtr, dictPathPtr);
      const suggestionsFor = (word: string, suggestFunction: (hunspellPtr: number, outSuggestionListPtr: number, value: number) => number): string[] => {
        const suggestionListPtr = _malloc(4);
        const suggestionCount = usingParamPtr(word, (wordPtr) => suggestFunction(hunspellPtr, suggestionListPtr, wordPtr));
        const suggestionListValuePtr = getValue<number>(suggestionListPtr, '*');
        const ret =
          suggestionCount > 0 ? Array.from(Array(suggestionCount).keys()).map((idx) => UTF8ToString(getValue(suggestionListValuePtr + idx * 4, '*'))) : [];
        hunspellInterface.free_list(hunspellPtr, suggestionListPtr, suggestionCount);
        _free(suggestionListPtr);
        return ret;
      };
      return {
        dispose: () => {
          hunspellInterface.destroy(hunspellPtr);
          _free(affPathPtr);
          _free(dictPathPtr);
        },
        spell: (word: string) => !!usingParamPtr(word, (wordPtr) => hunspellInterface.spell(hunspellPtr, wordPtr)),
        suggest: (word: string) => {
          return suggestionsFor(word, hunspellInterface.suggest);
        },
        stem: (word: string) => {
          return suggestionsFor(word, hunspellInterface.stem);
        },
        addDictionary: (dictPath: string) =>
          usingParamPtr(dictPath, (dictPathPtr) => hunspellInterface.add_dic(hunspellPtr, dictPathPtr)) === 1 ? false : true,
        addWord: (word: string) => usingParamPtr(word, (wordPtr) => hunspellInterface.add(hunspellPtr, wordPtr)),
        addWordWithAffix: (word: string, affix: string) =>
          usingParamPtr(word, affix, (wordPtr, affixPtr) => hunspellInterface.add_with_affix(hunspellPtr, wordPtr, affixPtr)),
        removeWord: (word: string) => usingParamPtr(word, (wordPtr) => hunspellInterface.remove(hunspellPtr, wordPtr)),
      };
    },
  };
};
const loadModule = memoComputingValueNoArgs(async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const runtime = (await import('./hunspell.js')).default;
  const moduleLoader = getModuleLoader<HunspellFactory, HunspellAsmModule>((runtime: HunspellAsmModule) => hunspellLoader(runtime), runtime);
  return moduleLoader();
});
export { type Hunspell, type HunspellFactory, loadModule };
