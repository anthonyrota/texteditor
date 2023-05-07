#!/bin/bash
set -eo pipefail
cd "$(dirname "$0")"
cd hunspell
autoreconf -vfi
emconfigure ./configure CFLAGS="-O3" CXXFLAGS="-O3"
emmake make --ignore-errors
cd ..
HUNSPELL_EXPORT_FUNCTIONS="[\
'_Hunspell_create',\
'_Hunspell_destroy',\
'_Hunspell_spell',\
'_Hunspell_stem',\
'_Hunspell_suggest',\
'_Hunspell_free_list',\
'_Hunspell_add_dic',\
'_Hunspell_add',\
'_Hunspell_remove',\
'_Hunspell_add_with_affix',\
'_free',\
'_malloc',\
'FS']"
EXPORT_RUNTIME="[\
'cwrap',\
'stringToUTF8',\
'allocateUTF8', \
'getValue',\
'UTF8ToString']"
em++ \
-O3 \
-sEXPORTED_FUNCTIONS="$HUNSPELL_EXPORT_FUNCTIONS" \
-sEXPORTED_RUNTIME_METHODS="$EXPORT_RUNTIME" \
-sSINGLE_FILE=1 \
-sTOTAL_STACK=128KB \
-sEXPORT_ES6=1 \
-sALLOW_MEMORY_GROWTH=1 \
./hunspell/src/hunspell/.libs/libhunspell-1.7.a \
-o hunspell.js
npx prettier --write hunspell.js
grep "\S" hunspell.js > tmphunspell.js
mv tmphunspell.js hunspell.js
