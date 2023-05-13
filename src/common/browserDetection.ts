export const isSafari = !!(
  navigator.vendor &&
  navigator.vendor.indexOf('Apple') > -1 &&
  navigator.userAgent &&
  navigator.userAgent.indexOf('CriOS') === -1 &&
  navigator.userAgent.indexOf('FxiOS') === -1
);
export const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
