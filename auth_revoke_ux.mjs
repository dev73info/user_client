// 令牌被改密作废后，用户端到底看到什么：普通工作台页 vs 开发者工作台页。
// 用法：node auth_revoke_ux.mjs
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const DSN = 'postgresql://dev:dev@127.0.0.1:5432/backend_73info'
const USER = 'client_flow_03562487'
const BASE = 'http://127.0.0.1:5173'

const psql = (sql) => execFileSync('psql', [DSN, '-tAc', sql], { encoding: 'utf8' }).trim()
const bumpPasswordChangedAt = () =>
  psql(`UPDATE users SET password_changed_at = timezone('Asia/Shanghai', now()) WHERE username='${USER}'`)
const clearPasswordChangedAt = () =>
  psql(`UPDATE users SET password_changed_at = NULL WHERE username='${USER}'`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160))
})

async function state(tag) {
  const s = await page.evaluate(() => {
    const token = window.localStorage.getItem('73info_auth_token') ?? window.localStorage.getItem('auth_token') ?? ''
    return {
      url: location.href.replace('http://127.0.0.1:5173', ''),
      tokenLen: token.length,
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    }
  })
  console.log(`  ${tag}\n    url=${s.url}\n    tokenLen=${s.tokenLen} 正文="${s.body}"`)
  return s
}

console.log('1) 打开用户端，等待开发态自动登录')
await page.goto(`${BASE}/#/workbench`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const before = await state('自动登录后')

console.log('2) 模拟改密/超管重置：把 password_changed_at 置为当前时间（旧令牌作废）')
bumpPasswordChangedAt()

console.log('3) SPA 内导航到开发者工作台页（devArea 路由）')
await page.goto(`${BASE}/#/workbench/developer/overview`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const devPage = await state('开发者页')

console.log('4) 再导航到普通工作台页（非 devArea 路由）')
await page.goto(`${BASE}/#/workbench/account`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const normalPage = await state('普通工作台页')

console.log('5) 还原 password_changed_at')
clearPasswordChangedAt()

console.log(`\n捕获到的前端错误 ${errors.length} 条：`)
for (const e of errors.slice(0, 8)) console.log(`  ${e}`)

console.log('\n判定：')
console.log(`  普通页是否被登出（token 清空或出现登录框）：${normalPage.tokenLen === 0 || /登录|登 录/.test(normalPage.body)}`)
console.log(`  开发者页是否给出登录提示：${/登录|登 录/.test(devPage.body)}`)
console.log(`  开发者页地址：${devPage.url}`)

await browser.close()
