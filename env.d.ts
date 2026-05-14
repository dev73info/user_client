/// <reference types="vite/client" />

declare module 'markdown-it'

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_AUTO_LOGIN_USERNAME?: string
  readonly VITE_DEV_AUTO_LOGIN_PASSWORD?: string
  readonly VITE_DEV_PORTAL_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
