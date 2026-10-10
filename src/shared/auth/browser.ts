/** 是否在微信内置浏览器中打开（含手机微信与 PC 微信内置页）。 */
export function isWechatBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /MicroMessenger/i.test(ua)
}

/**
 * 是否在 QQ 内置浏览器中打开。
 * 与登录跳转口径一致：含 `QQ` / `MQQBrowser`（部分 Android 浏览器也会带后者，属既有取舍）。
 */
export function isQqBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /(?:QQ|MQQBrowser)/i.test(ua)
}
