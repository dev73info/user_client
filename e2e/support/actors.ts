/**
 * 担保模式四流 e2e 的三个浏览器身份。
 *
 * 身份隔离的根据是 `App.vue` 的 `initializeAuthSession()`：当前登录用户名与
 * `.env.local` 里的自动登录账号不一致时会**强制登出并重登**，所以开发者不能挤在 5173 上，
 * 必须走第二个实例（5175）。两个端口是不同 origin，localStorage 各存各的令牌，
 * 同一个浏览器里两个身份可以同时在线。
 *
 * 三个前端的 dev 构建都走 hash 路由，页面地址一律写成 `${origin}/#/业务路径`。
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

import {
  ADMIN_ORIGIN,
  ADMIN_USERNAME_HINT,
  CLIENT_ACCOUNT,
  CLIENT_ORIGIN,
  DEVELOPER_ACCOUNT,
  DEVELOPER_ORIGIN,
  STEP_TIMEOUT_MS,
  hashUrl,
} from './config'

/** 一个身份的浏览器上下文与首个页面。 */
export type Actor = {
  context: BrowserContext
  page: Page
}

/** 新建一个隔离的浏览器上下文（每个身份一个，cookie 与 localStorage 互不干扰）。 */
export async function openActor(browser: Browser, origin: string): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  return { context, page }
}

/**
 * 落到首页等自动登录完成，再进目标路由。
 *
 * 先首页后目标路由是必须的：路由守卫在自动登录落地前会把未登录访问弹回首页，
 * 直接开 `/#/workbench/...` 只会看到首页。
 */
export async function gotoAuthed(
  actor: Actor,
  origin: string,
  username: string,
  route: string,
): Promise<void> {
  const { page } = actor
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  await waitForAutoLogin(page, username)
  if (route && route !== '/') {
    await page.goto(hashUrl(origin, route), { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)
  }
}

/**
 * 打开一个「必须读到最新数据」的页面。
 *
 * 为什么不能直接用 `page.goto`：三个前端都是 hash 路由，只改 hash（含 query）的跳转属于
 * **同一文档内的路由跳转**，浏览器不会重新加载文档，SPA 组件也不会重新挂载——页面会停在上一次
 * 抓到的数据上。实测：先在 `/#/workbench/requirements` 上给 `window` 打标记，
 * 再 `goto('/#/workbench/requirements?modal=publish')`，标记仍在；只有整页加载才会消失。
 *
 * 担保四流每一步都要读最新状态（审核结果、接单结果、合同签署结果），一旦停在旧数据上，
 * 需求行还会显示「待审核」，行内自然没有「发起合同」入口。
 *
 * 做法与 `gotoAuthed` 一样：整页冷启动到首页 → 等自动登录 → 再 hash 跳到目标路由。
 * 中间那次 `reload()` 不能省——从带 hash 的地址 `goto` 到不带 hash 的首页同样只改片段，
 * 不重新加载文档，页面仍挂在上一个路由上（尤其是 `?view=` 打开的详情侧栏）。
 *
 * 目标路由带 `?view=` / `?modal=` 也没问题：冷启动时 `MyRequirementsView` 的 modal watcher
 * 是 `immediate: true`，`view` 则由 `loadMyRequirements()` 加载完列表后调
 * `syncRouteRequirementDetail()` 打开。
 */
export async function gotoFresh(
  actor: Actor,
  origin: string,
  username: string,
  route: string,
): Promise<void> {
  const { page } = actor
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForAutoLogin(page, username)
  if (route && route !== '/') {
    await page.goto(hashUrl(origin, route), { waitUntil: 'domcontentloaded' })
    await waitForAutoLogin(page, username)
    await page.waitForLoadState('networkidle').catch(() => undefined)
  }
}

/** 等自动登录落地：三个端的顶栏/侧栏都会渲染当前登录用户名，认它就够了。 */
export async function waitForAutoLogin(page: Page, username: string): Promise<void> {
  await expect(
    page.locator('body'),
    `等待 ${username} 自动登录超时：确认对应 dev server 在跑、自动登录账号被后端认可`,
  ).toContainText(username, { timeout: STEP_TIMEOUT_MS })
}

/** 需求方：5173，吃 `.env.local` 的自动登录账号。 */
export async function openClient(browser: Browser): Promise<Actor> {
  const actor = await openActor(browser, CLIENT_ORIGIN)
  await gotoAuthed(actor, CLIENT_ORIGIN, CLIENT_ACCOUNT.username, '/workbench/requirements')
  return actor
}

/** 开发者：5175，启动时用进程环境变量覆盖自动登录账号。 */
export async function openDeveloper(browser: Browser): Promise<Actor> {
  const actor = await openActor(browser, DEVELOPER_ORIGIN)
  await gotoAuthed(
    actor,
    DEVELOPER_ORIGIN,
    DEVELOPER_ACCOUNT.username,
    '/workbench/developer/requirements/hall',
  )
  return actor
}

/** 平台运营：5174（admin_client），`VITE_DEV_AUTO_LOGIN_ENABLED=true` 免密。 */
export async function openAdmin(browser: Browser): Promise<Actor> {
  const actor = await openActor(browser, ADMIN_ORIGIN)
  await gotoAuthed(actor, ADMIN_ORIGIN, ADMIN_USERNAME_HINT, '/console/review')
  return actor
}
