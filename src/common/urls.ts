// https://github.com/braintree/sanitize-url/blob/main/src/index.ts.
const invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im;
const htmlEntitiesRegex = /&#(\w+)(^\w|;)?/g;
const htmlCtrlEntityRegex = /&(newline|tab);/gi;
// eslint-disable-next-line no-control-regex
const ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim;
const urlSchemeRegex = /^.+(:|&colon;)/gim;
const relativeFirstCharacters = ['.', '/'];
function isRelativeUrlWithoutProtocol(url: string): boolean {
  return relativeFirstCharacters.indexOf(url[0]) > -1;
}
// adapted from https://stackoverflow.com/a/29824550/2601552
function decodeHtmlCharacters(str: string) {
  return str.replace(htmlEntitiesRegex, (match, dec) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return String.fromCharCode(dec);
  });
}
function sanitizeUrl(url: string): string | null {
  const sanitizedUrl = decodeHtmlCharacters(url).replace(htmlCtrlEntityRegex, '').replace(ctrlCharactersRegex, '').trim();
  if (!sanitizedUrl || isRelativeUrlWithoutProtocol(sanitizedUrl)) {
    return null;
  }
  const urlSchemeParseResults = sanitizedUrl.match(urlSchemeRegex);
  if (!urlSchemeParseResults) {
    return `https://${sanitizedUrl}`;
  }
  const urlScheme = urlSchemeParseResults[0];
  if (invalidProtocolRegex.test(urlScheme)) {
    return null;
  }
  return sanitizedUrl;
}
// https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url
function isValidHttpUrl(string: string): boolean {
  let url;
  try {
    url = new URL(string);
  } catch (_error) {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
const urlRegexp = RegExp(
  "((?:(http|https|Http|Https|rtsp|Rtsp):\\/\\/(?:(?:[a-zA-Z0-9\\$\\-\\_\\.\\+\\!\\*\\'\\(\\)" +
    '\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,64}(?:\\:(?:[a-zA-Z0-9\\$\\-\\_' +
    "\\.\\+\\!\\*\\'\\(\\)\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,25})?\\@)?)?" +
    '((?:(?:[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}\\.)+' + // named host
    '(?:' + // plus top level domain
    '(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])' +
    '|(?:biz|b[abdefghijmnorstvwyz])' +
    '|(?:cat|com|coop|c[acdfghiklmnoruvxyz])' +
    '|d[ejkmoz]' +
    '|(?:edu|e[cegrstu])' +
    '|f[ijkmor]' +
    '|(?:gov|g[abdefghilmnpqrstuwy])' +
    '|h[kmnrtu]' +
    '|(?:info|int|i[delmnoqrst])' +
    '|(?:jobs|j[emop])' +
    '|k[eghimnrwyz]' +
    '|l[abcikrstuvy]' +
    '|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])' +
    '|(?:name|net|n[acefgilopruz])' +
    '|(?:org|om)' +
    '|(?:pro|p[aefghklmnrstwy])' +
    '|qa' +
    '|r[eouw]' +
    '|s[abcdeghijklmnortuvyz]' +
    '|(?:tel|travel|t[cdfghjklmnoprtvwz])' +
    '|u[agkmsyz]' +
    '|v[aceginu]' +
    '|w[fs]' +
    '|y[etu]' +
    '|z[amw]))' +
    '|(?:(?:25[0-5]|2[0-4]' + // or ip address
    '[0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\\.(?:25[0-5]|2[0-4][0-9]' +
    '|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1]' +
    '[0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}' +
    '|[1-9][0-9]|[0-9])))' +
    '(?:\\:\\d{1,5})?)' + // plus option port number
    '(\\/(?:(?:[a-zA-Z0-9\\;\\/\\?\\:\\@\\&\\=\\#\\~' + // plus option query params
    "\\-\\.\\+\\!\\*\\'\\(\\)\\,\\_])|(?:\\%[a-fA-F0-9]{2}))*)?" +
    '(?:\\b|$)',
  'g',
);
interface StringRange {
  startIndex: number;
  endIndex: number;
}
function detectUrls(string: string): StringRange[] {
  const stringRanges: StringRange[] = [];
  for (const match of string.matchAll(urlRegexp)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const matchStart = match.index!;
    const matchText = match[0];
    const matchEnd = matchStart + matchText.length;
    stringRanges.push({
      startIndex: matchStart,
      endIndex: matchEnd,
    });
  }
  return stringRanges;
}
export { sanitizeUrl, isValidHttpUrl, type StringRange, detectUrls };
