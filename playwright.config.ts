import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

import { CLIENT_ORIGIN, FLOW_TEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './e2e/support/config'

/**
 * 担保模式四流 e2e 的 Playwright 配置。
 *
 * 与 create-vue 模板默认值的差异：
 * - 只保留 chromium：本地要跑通担保全流程，跑三个内核只是三倍耗时。
 * - `workers: 1` + `fullyParallel: false`：用例会在同一个库里留下真实需求、合同与支付单，
 *   并发跑会互相干扰接单与分账断言。
 * - 不再由 Playwright 拉起 `webServer`。`pnpm dev` 是 `env -u NODE_USE_ENV_PROXY vite`，
 *   需要 POSIX shell（原生 Windows cmd/PowerShell 跑不起来），而且用例同时要用到
 *   5173/5174/5175 三个实例，Playwright 只认得一个。三个实例必须在 Cursor 终端里先跑着，
 *   缺哪个由 `e2e/support/preflight.ts` 的探针直接报出来。
 * - 默认无头。排查时用 `E2E_HEADED=1` 打开窗口，失败留下的 trace 也能复盘。
 * - `E2E_BROWSER_CHANNEL=chrome|msedge` 可以改用本机已安装的浏览器。默认走 Playwright
 *   自带的 Chromium（`pnpm exec playwright install chromium`），只有在下不了浏览器
 *   （内网/代理挡掉 CDN）时才用这个开关。
 */
const browserChannel = process.env.E2E_BROWSER_CHANNEL?.trim()

export default defineConfig({
  testDir: './e2e',
  /* 整条流程跨三个身份、两次外部跳转与一次分账扫描，直接给足上限。
     `test.setTimeout()` 在测试体内改的是记录值，runner 的截止时刻仍按这里配置的算，
     所以入口上限只能写在这里，不能靠用例自己放宽。 */
  timeout: FLOW_TEST_TIMEOUT_MS,
  expect: {
    timeout: 15 * 1000,
  },
  forbidOnly: !!process.env.CI,
  /* 用例之间有真实数据依赖（接单、缴款、分账），不做并发也不做重试。 */
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: CLIENT_ORIGIN,
    actionTimeout: REQUEST_TIMEOUT_MS,
    navigationTimeout: 60 * 1000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: process.env.E2E_HEADED !== '1',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
})
