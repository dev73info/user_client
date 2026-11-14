/// <reference types="vite/client" />

declare module 'markdown-it'
// altcha@3.6.0 的 exports 把 `./i18n/*` 的 types 指到 `dist/i18n/*.d.ts`，
// 但包里只发布了 `zh-cn.js` 与 `cn.d.ts`（对不上），TS 会报 TS7016。
// 这里补一条环境声明：该模块只做「把中文文案注册到 $altcha.i18n」的副作用。
declare module 'altcha/i18n/zh-cn'

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_AUTO_LOGIN_USERNAME?: string
  readonly VITE_DEV_AUTO_LOGIN_PASSWORD?: string
  readonly VITE_DEV_PORTAL_URL?: string
  /** 开发者工作台总览改用演示数据，只在 dev 模式且值为 'true' 时生效 */
  readonly VITE_DEV_HOME_MOCK?: string
  /** 打开完整 mock（假后端），只在 dev 模式生效；也可以用地址上的 ?mock=1 临时打开 */
  readonly VITE_MOCK?: string
  /** 假响应延迟毫秒数，默认 120，用 ?mockDelay=0 可当场关掉 */
  readonly VITE_MOCK_DELAY?: string
  /** 值为 'true' / '1' 时启用人机验证（自托管 ALTCHA），其余情况关闭 */
  readonly VITE_CAPTCHA_ENABLED?: string
  /** 值为 'false' 时隐藏左上角 mock 身份切换悬浮窗（mock 仍生效），用于截图对照与演示 */
  readonly VITE_MOCK_SWITCHER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
