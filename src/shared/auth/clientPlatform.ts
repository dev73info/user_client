/**
 * 客户端平台标识（协议同意留痕用）。
 *
 * 判定口径必须各处一致：留痕要能证明「用户在哪台设备上同意的」，协议页、登录弹窗、
 * 签署页各写一套就会对不上，所以只留这一份。拆成单独文件是为了给登录与协议两族接口共用，
 * 又不把 `shared/auth/client.ts` 顶过模块行数预算。
 */
export function detectClientPlatform(): string {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/windows/i.test(ua)) return 'web-windows'
  if (/macintosh|Mac OS/i.test(ua)) return 'web-macos'
  if (/android/i.test(ua)) return 'web-android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'web-ios'
  return 'web'
}
