/// <reference types="vite/client" />

declare module 'markdown-it'

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_AUTO_LOGIN_USERNAME?: string
  readonly VITE_DEV_AUTO_LOGIN_PASSWORD?: string
  readonly VITE_DEV_PORTAL_URL?: string
  /** 开发者工作台总览改用演示数据，只在 dev 模式且值为 'true' 时生效 */
  readonly VITE_DEV_HOME_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
