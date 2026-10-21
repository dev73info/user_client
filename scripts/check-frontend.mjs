#!/usr/bin/env node
/**
 * 前端仓标准化检查（四个前端仓通用，逐个仓跑）。
 *
 * 用法：
 *   node scripts/frontend/check-frontend.mjs user-client
 *   node scripts/frontend/check-frontend.mjs user-client --write-baseline
 *
 * 检查项：
 * 1. 行数预算：`src/views` / `src/pages` 下的 `.vue` ≤ 300 行，其它 `.vue` ≤ 400 行，`.ts` ≤ 300 行；
 * 2. 单视图 API 依赖：一个视图最多直接 import 3 个 `api/` 模块；
 * 3. 裸色值：`.vue` / `.css` 里出现 `#rgb`、`rgb()`、`hsl()`，`styles/tokens.css` 除外；
 * 4. 跨仓引用：禁止 import 其它前端仓（`@73info/portal` 这类聚合包名）；
 * 5. 断点：`@media` 里的宽度档只允许 640 / 900 / 1180（±1px 视为取整误差）。
 *
 * 存量违规走基线：`--write-baseline` 把当前违规写进 `<repo>/frontend-baseline.json`，
 * 之后 CI 只拦**新增**违规；基线里已经修好的条目会提示删除（只减不增）。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const args = process.argv.slice(2)
const writeBaseline = args.includes('--write-baseline')
const repoArg = args.find((a) => !a.startsWith('--'))

if (!repoArg) {
  console.error('用法：node scripts/frontend/check-frontend.mjs <repo-dir> [--write-baseline]')
  process.exit(2)
}

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
// 允许脚本被复制进某个仓后跑（`check-frontend.mjs .`）：此时以当前目录为仓根
const REPO = repoArg === '.' ? process.cwd() : resolve(ROOT, repoArg)
const SRC = join(REPO, 'src')
const BASELINE_PATH = join(REPO, 'frontend-baseline.json')

const LIMITS = { page: 300, vue: 400, ts: 300 }
const MAX_API_DEPS = 3
/** 允许的响应式断点（2026-10-21 收敛）：手机 / 平板 / 宽屏，其它档位一律进基线后逐步清掉 */
const BREAKPOINTS = [640, 900, 1180]
const BREAKPOINT_TOLERANCE = 1
/** 说明符已被 importSpecifiers 剥成裸路径（`@/api/xxx`），这里不能再要求 `from` 前缀 */
const API_DEP_PATTERN = /^(?:@\/api|\.\.?\/api|\.\.\/\.\.\/api)\/([A-Za-z0-9_-]+)/
const COLOR_PATTERNS = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\s*\(/, /\bhsla?\s*\(/]
const TOKEN_ALLOWLIST = new Set(['styles/tokens.css', 'styles/alias.css'])
const FOREIGN_PACKAGES = ['@73info/portal', '@73info/admin', '@73info/support', '@73info/finance']

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.claude'].includes(entry.name)) continue
      walk(full, out)
    } else if (/\.(vue|ts|css)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

/** 去掉块注释与行注释，保留行号 */
function stripComments(source) {
  let inBlock = false
  return source.split('\n').map((line) => {
    let rest = line
    let out = ''
    if (inBlock) {
      const end = rest.indexOf('*/')
      if (end === -1) return ''
      inBlock = false
      rest = rest.slice(end + 2)
    }
    while (rest.length > 0) {
      const start = rest.indexOf('/*')
      if (start === -1) {
        out += rest
        break
      }
      out += rest.slice(0, start)
      const end = rest.indexOf('*/', start + 2)
      if (end === -1) {
        inBlock = true
        break
      }
      rest = rest.slice(end + 2)
    }
    const lineComment = out.indexOf('//')
    return lineComment === -1 ? out : out.slice(0, lineComment)
  })
}

function importSpecifiers(source) {
  const specs = []
  for (const pattern of [
    /import\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /export\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g,
  ]) {
    let match
    while ((match = pattern.exec(source)) !== null) specs.push(match[1])
  }
  return specs
}

const violations = []

for (const file of walk(SRC)) {
  const rel = relative(REPO, file).split(sep).join('/')
  const raw = readFileSync(file, 'utf8')
  const lines = raw.split('\n').length
  const isPage = /\/(views|pages)\//.test(`/${rel}`) && file.endsWith('.vue')
  const limit = isPage ? LIMITS.page : file.endsWith('.vue') ? LIMITS.vue : LIMITS.ts

  if (lines > limit) {
    violations.push({
      rule: 'line-budget',
      file: rel,
      detail: `${lines} 行 > ${limit}（${isPage ? '视图' : '模块'}）`,
    })
  }

  // 断点：@media 里的宽度档只允许 640 / 900 / 1180
  if (!TOKEN_ALLOWLIST.has(rel)) {
    for (const query of stripComments(raw)) {
      const media = /@media[^{]*/.exec(query)
      if (!media) continue
      for (const match of media[0].matchAll(/\(m(?:ax|in)-width:\s*([\d.]+)px\)/g)) {
        const value = Number(match[1])
        const allowed = BREAKPOINTS.some((bp) => Math.abs(bp - value) <= BREAKPOINT_TOLERANCE)
        if (!allowed) {
          violations.push({ rule: 'breakpoint', file: rel, detail: `${value}px` })
        }
      }
    }
  }

  // 裸色值：`.vue` 与 `.css` 都查（`styles/tokens.css` / `styles/alias.css` 是令牌正本，除外）。
  // 早先这一步被 `if (!file.endsWith('.vue')) continue` 挡在后面，裸色值挪进 `.css` 就查不到了。
  if (!TOKEN_ALLOWLIST.has(rel)) {
    stripComments(raw).forEach((line, index) => {
      if (line.includes('var(--73-')) return
      if (COLOR_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push({ rule: 'raw-color', file: rel, detail: `第 ${index + 1} 行裸色值` })
      }
    })
  }

  if (!file.endsWith('.vue')) continue

  const deps = new Set()
  for (const spec of importSpecifiers(raw)) {
    if (FOREIGN_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) {
      violations.push({ rule: 'foreign-package', file: rel, detail: `引用了其它前端仓 ${spec}` })
    }
    const apiDep = API_DEP_PATTERN.exec(spec)
    if (apiDep?.[1]) deps.add(apiDep[1])
  }
  if (deps.size > MAX_API_DEPS) {
    violations.push({
      rule: 'api-deps',
      file: rel,
      detail: `依赖 ${deps.size} 个 api 模块（${[...deps].join('、')}）> ${MAX_API_DEPS}`,
    })
  }
}

// 每个文件只保留一条行数/依赖类违规（细节取第一条）；裸色值与断点按文件聚合计数
const aggregated = []
const seen = new Map()
const counted = new Set(['raw-color', 'breakpoint'])
for (const violation of violations) {
  if (counted.has(violation.rule)) {
    const key = `${violation.rule}|${violation.file}`
    const found = seen.get(key)
    if (found) {
      found.count += 1
      found.values.add(violation.detail)
      continue
    }
    seen.set(key, {
      ...violation,
      count: 1,
      values: new Set([violation.detail]),
    })
    continue
  }
  aggregated.push(violation)
}
for (const entry of seen.values()) {
  const label =
    entry.rule === 'raw-color' ? '裸色值' : `非标准断点（${[...entry.values].join('、')}）`
  aggregated.push({ ...entry, detail: `${entry.count} 处${label}` })
}

/** 按规则汇总「实际债」：raw-color / breakpoint 的 detail 是「N 处」，其余一条算一处。
 *  文件一拆，条目数会因为按文件聚合而变多，但裸色值/断点的处数不该变——看这个数判断有没有真加债。 */
const ruleTotals = (entries) => {
  const counts = new Map()
  for (const entry of entries) {
    const matched = /(\d+)\s*处/.exec(entry.detail ?? '')
    const amount = matched ? Number(matched[1]) : 1
    counts.set(entry.rule, (counts.get(entry.rule) ?? 0) + amount)
  }
  return [...counts]
    .map(([rule, amount]) =>
      rule === 'raw-color' || rule === 'breakpoint' ? `${rule} ${amount} 处` : `${rule} ${amount}`,
    )
    .join('、')
}

const keyOf = (v) => `${v.rule}|${v.file}`
const current = new Map(aggregated.map((v) => [keyOf(v), v]))
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { entries: [] }
const baselineKeys = new Set((baseline.entries ?? []).map(keyOf))

if (writeBaseline) {
  const entries = [...current.values()].map((v) => ({
    rule: v.rule,
    file: v.file,
    detail: v.detail,
    since: new Date().toISOString().slice(0, 10),
  }))
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ repo: repoArg, entries }, null, 2)}\n`)
  console.log(`已写入基线：${BASELINE_PATH}（${entries.length} 条存量违规）`)
  console.log(`  实际债：${ruleTotals(entries)}`)
  process.exit(0)
}

const fresh = [...current.values()].filter((v) => !baselineKeys.has(keyOf(v)))
const stale = [...baselineKeys].filter((key) => !current.has(key))

if (stale.length > 0) {
  console.warn(`· 基线里有 ${stale.length} 条已不再违规，请从 frontend-baseline.json 删除：`)
  for (const key of stale.slice(0, 10)) console.warn(`   - ${key}`)
}

if (fresh.length > 0) {
  console.error(`✗ ${repoArg} 标准化检查失败，${fresh.length} 条新增违规：\n`)
  for (const violation of fresh) {
    console.error(`  - [${violation.rule}] ${violation.file}：${violation.detail}`)
  }
  console.error('\n存量违规在 frontend-baseline.json 里；只能减少，不能增加。')
  process.exit(1)
}

const total = baselineKeys.size
console.log(`✓ ${repoArg} 标准化检查通过（存量违规 ${total} 条，本次新增 0 条）`)
console.log(`  实际债（基线）：${ruleTotals(baseline.entries ?? [])}`)
console.log(`  实际债（本次扫描）：${ruleTotals([...current.values()])}`)
