import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      root: fileURLToPath(new URL('./', import.meta.url)),
      // 用例里大量断言「月日时分」这类面向用户的文案，而产品面向中国用户、展示时区固定东八区。
      // CI runner 是 UTC，钉住 TZ 才能让「展示层」的断言与本地一致；
      // 解析层的东八区口径由 shared/datetime.ts 显式 +08:00 保证，不依赖这个设置。
      env: { TZ: 'Asia/Shanghai' },
    },
  }),
)
