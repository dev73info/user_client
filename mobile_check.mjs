// 移动端响应式走查：320 / 375 / 414px 三档，检查横向滚动与超宽元素。
// 用法：node mobile_check.mjs <port> <name> <route> [route...]
import { chromium } from '@playwright/test'

const [port, name, ...routes] = process.argv.slice(2)
const base = `http://127.0.0.1:${port}`
const widths = [320, 375, 414]

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
// 预热一次，完成开发态自动登录
await page.setViewportSize({ width: 1280, height: 900 })
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

console.log(`\n########## ${name} 移动端 (${base}) ##########`)
let bad = 0
for (const route of routes) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 })
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1600)
      const info = await page.evaluate(() => {
        const de = document.documentElement
        const vw = window.innerWidth
        const offenders = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (r.right > vw + 1) {
            const cs = getComputedStyle(el)
            if (cs.position === 'fixed' && el.getAttribute('aria-hidden') === 'true') continue
            offenders.push(
              `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(r.right)}`,
            )
            if (offenders.length >= 3) break
          }
        }
        return {
          scrollW: de.scrollWidth,
          clientW: de.clientWidth,
          bodyOverflow: getComputedStyle(document.body).overflowX,
          textLen: (document.body.innerText || '').trim().length,
          offenders,
        }
      })
      const overflow = info.scrollW > info.clientW + 1
      const problems = []
      if (overflow) problems.push(`横向滚动 scrollW=${info.scrollW} > clientW=${info.clientW}`)
      if (info.textLen < 40) problems.push(`正文过短(${info.textLen})`)
      const mark = problems.length ? '❌' : '✅'
      if (problems.length) bad++
      console.log(`${mark} ${String(w).padStart(3)}px ${route}  ${problems.join(' | ')}`)
      if (info.offenders.length) console.log(`      超宽元素: ${info.offenders.join(' ; ')}`)
    } catch (e) {
      bad++
      console.log(`❌ ${w}px ${route}  FATAL ${String(e).slice(0, 120)}`)
    }
  }
}
console.log(`—— ${name}: ${routes.length} 路由 × ${widths.length} 档，${bad} 条有问题`)
await browser.close()
