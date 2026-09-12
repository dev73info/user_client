// 多角色 UI 走查：逐端逐路由渲染，收集控制台错误 / 失败请求 / 页面异常。
// 用法：node ui_walk.mjs <port> "<name>" <route> [route...]
import { chromium } from '@playwright/test'

const [port, name, ...routes] = process.argv.slice(2)
const base = `http://127.0.0.1:${port}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
const failed = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 220)}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 220)}`))
page.on('response', (r) => {
  const u = r.url()
  if (!u.includes('/api/') && !u.includes(':8080')) return
  if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${u.replace(base, '').replace('http://127.0.0.1:8080', '')}`)
})

const rows = []
for (const route of routes) {
  errors.length = 0
  failed.length = 0
  const before = Date.now()
  try {
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(2200)
    const info = await page.evaluate(() => ({
      hash: `${location.pathname}${location.hash}`,
      textLen: (document.body.innerText || '').trim().length,
      empty: /^(加载中|Loading)/.test((document.body.innerText || '').trim()),
      h: document.body.scrollHeight,
    }))
    rows.push({
      route,
      ms: Date.now() - before,
      landed: info.hash,
      textLen: info.textLen,
      h: info.h,
      errors: [...errors],
      failed: [...new Set(failed)],
    })
  } catch (e) {
    rows.push({ route, ms: Date.now() - before, fatal: String(e).slice(0, 160), errors: [...errors], failed: [...new Set(failed)] })
  }
}

const norm = (u) => (u || '').replace(/^#/, '')
console.log(`\n########## ${name} (${base}) ##########`)
let bad = 0
for (const r of rows) {
  const problems = []
  if (r.fatal) problems.push(`FATAL: ${r.fatal}`)
  if (r.errors?.length) problems.push(`${r.errors.length} console/page error`)
  if (r.failed?.length) problems.push(`${r.failed.length} HTTP>=400`)
  if (r.textLen != null && r.textLen < 40) problems.push(`正文过短(${r.textLen})`)
  const landed = norm(r.landed)
  const want = norm(r.route)
  const diverted = landed && landed !== want
  // 重定向到首页（或登录弹窗）＝ 被守卫拦下，属异常
  if (/^\/?$/.test(landed) || landed.startsWith('/?modal=auth')) problems.push(`被重定向到 ${r.landed}`)
  const mark = problems.length ? '❌' : '✅'
  if (problems.length) bad++
  console.log(`${mark} ${r.route}${diverted ? `  ↪ ${r.landed}` : ''}  ${problems.join(' | ')}`)
  for (const e of (r.errors || []).slice(0, 4)) console.log(`      ${e}`)
  for (const f of (r.failed || []).slice(0, 4)) console.log(`      HTTP ${f}`)
}
console.log(`—— ${name}: ${rows.length} 条路由，${bad} 条有问题`)

await browser.close()
