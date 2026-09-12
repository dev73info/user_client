// 单路由诊断：打印最终 URL、页面文本与全部控制台/网络事件。
import { chromium } from '@playwright/test'

const [port, ...routes] = process.argv.slice(2)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const ev = []
page.on('console', (m) => ev.push(`[${m.type()}] ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => ev.push(`[pageerror] ${String(e).slice(0, 200)}`))
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) ev.push(`[HTTP ${r.status()}] ${r.request().method()} ${r.url().split('8080')[1]}`) })

// 预热：先落到首页完成 dev 自动登录
await page.goto(`http://127.0.0.1:${port}/#/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
console.log('预热后 localStorage token:', await page.evaluate(() => !!localStorage.getItem('auth_token_73hub')))

for (const route of routes) {
  ev.length = 0
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => ({
    hash: location.hash,
    head: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 220),
  }))
  console.log(`\n===== ${route}`)
  console.log(`  最终 hash: ${info.hash}`)
  console.log(`  正文: ${info.head.replace(/\n/g, ' | ')}`)
  for (const line of ev.slice(-8)) console.log(`  ${line}`)
}
await browser.close()
