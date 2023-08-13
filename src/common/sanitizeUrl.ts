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
export function sanitizeUrl(url: string): string | null {
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
export function isValidHttpUrl(string: string): boolean {
  let url;
  try {
    url = new URL(string);
  } catch (_error) {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
