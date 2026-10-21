/// <reference types="vite/client" />

declare module 'markdown-it'

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
  /** 值为 'false' 时隐藏左上角 mock 身份切换悬浮窗（mock 仍生效），用于截图对照与演示 */
  readonly VITE_MOCK_SWITCHER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
