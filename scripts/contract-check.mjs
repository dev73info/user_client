#!/usr/bin/env node
/**
 * 契约漂移检查：请求 / 响应类型必须来自后端 `openapi.json` 的生成物，不能手写。
 *
 * 三种状态，各自有明确输出：
 *   1. 没有 spec（后端 utoipa 尚未产出）→ 打印「未就绪」并 **exit 0**。
 *      这不是「通过」，是「还没轮到它拦」——门禁输出里会写清楚，避免被误读成绿灯。
 *   2. 有 spec、但仓里没有生成物或生成物与 spec 不一致 → **exit 1**，并贴出不一致的文件与行数。
 *   3. 有 spec 且一致 → exit 0。
 *
 * 用法：
 *   node scripts/contract-check.mjs           # 检查
 *   node scripts/contract-check.mjs --write   # 用 spec 重新生成（把 spec 的变化落盘）
 *
 * spec 的落点（按优先级）：
 *   src/api/generated/openapi.json → openapi.json → ../backend_73info/openapi.json（WSL 侧的产出落这里）
 * 生成物默认 `src/api/generated/schema.d.ts`，可用 --out 覆盖。
 *
 * 环境变量：
 *   PNPM_JS_ENTRY  指定 pnpm 的 JS 入口文件（绝对路径）。只在 Windows 上认不出
 *                  pnpm 入口时才需要——见 resolvePnpm() 的说明。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

const HERE = import.meta.dirname
/**
 * 仓根解析：本文件有两处落点，两处的仓根深度不同——
 *   - 根仓 `scripts/frontend/contract-check.mjs` → 仓根是上两级；
 *   - 子仓 `scripts/contract-check.mjs`（复制过去的副本）→ 仓根是上一级。
 * 写死一层会让根仓那份去 `scripts/src/api/...` 找生成物，永远报「契约类型缺失」。
 */
const REPO = HERE.endsWith(`${sep}frontend`) ? resolve(HERE, '..', '..') : resolve(HERE, '..')

/**
 * 解析 pnpm 的执行入口。
 *
 * Windows 上 pnpm 是 `pnpm.cmd`，而 Node ≥ 18.20 出于安全默认（防止参数被注入 shell）
 * 不允许直接 spawn `.cmd` / `.bat`——`execFileSync('pnpm.cmd', …)` 会报 `EINVAL`，
 * 于是契约这道门禁在 Windows 本地**根本跑不起来**（CI 是 Linux，所以一直没暴露）。
 * 这里绕开 shell：读 `pnpm.cmd`，找到它指向的 JS 入口，用当前 node 去跑它。
 *
 * `pnpm.cmd` 的形态不止一种，入口写法也不同：
 *   - pnpm 自带 / npm 全局安装的 shim：`"%~dp0\node_modules\pnpm\bin\pnpm.cjs"`；
 *   - corepack 代理：指向 `corepack.js`，里面没有 pnpm 入口 → 认不出来，落到回退分支。
 * 所以这里把 `%dp0%` 与 `%~dp0%` 都展开，入口接受 cjs / mjs / js 三种。
 *
 * 认不出来时可以用环境变量 `PNPM_JS_ENTRY` 直接指定入口文件（绝对路径）：
 * 它存在就用它，它不存在就直接报错退出——不静默回退，否则报错文案会指向错误的原因。
 */
function resolvePnpm() {
  const explicit = process.env.PNPM_JS_ENTRY
  if (explicit) {
    const entry = resolve(explicit)
    if (existsSync(entry)) {
      return { command: process.execPath, prefix: [entry], resolved: true, fromEnv: true }
    }
    console.error(`✗ PNPM_JS_ENTRY 指向的文件不存在：${entry}`)
    process.exit(1)
  }
  if (process.platform !== 'win32') return { command: 'pnpm', prefix: [], resolved: true }
  try {
    const found = execFileSync('where.exe', ['pnpm.cmd'], { encoding: 'utf8' })
    for (const line of found
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      const shim = readFileSync(line, 'utf8')
      const match = shim.match(/"([^"]*pnpm\.(?:c|m)?js)"/i)
      if (!match) continue
      const dir = dirname(line)
      const entry = resolve(dir, match[1].replace(/%~?dp0%?/gi, dir))
      if (existsSync(entry)) {
        return { command: process.execPath, prefix: [entry], resolved: true, fromEnv: false }
      }
    }
  } catch {
    // 读不到就按普通可执行名处理，失败时下面的报错会写清楚。
  }
  return { command: 'pnpm', prefix: [], resolved: false, fromEnv: false }
}

const PNPM = resolvePnpm()

/** 调 pnpm（绕开 Windows 的 .cmd 限制）。 */
function runPnpm(args, options) {
  execFileSync(PNPM.command, [...PNPM.prefix, ...args], options)
}

const write = process.argv.includes('--write')
const outIndex = process.argv.indexOf('--out')
const OUT =
  outIndex > -1
    ? resolve(REPO, process.argv[outIndex + 1])
    : join(REPO, 'src/api/generated/schema.d.ts')

const SPEC_CANDIDATES = [
  'src/api/generated/openapi.json',
  'openapi.json',
  '../backend_73info/openapi.json',
]

const spec = SPEC_CANDIDATES.map((path) => resolve(REPO, path)).find((path) => existsSync(path))

if (!spec) {
  console.warn('· 契约未就绪：找不到 openapi.json（后端 utoipa 尚未产出），本步跳过。')
  console.warn('  这不是通过。后端产出后把它放到 src/api/generated/openapi.json，')
  console.warn('  再跑 `pnpm contract:write` 生成类型，本步就会开始拦漂移。')
  console.warn(`  查找过：${SPEC_CANDIDATES.join('、')}`)
  process.exit(0)
}

function generate(target) {
  mkdirSync(dirname(target), { recursive: true })
  try {
    runPnpm(['exec', 'openapi-typescript', spec, '-o', target], {
      cwd: REPO,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  } catch (error) {
    // 入口指错了、子命令不存在、生成器自己崩了——都走到这里。
    // 未捕获的话只会甩一段栈回溯（`Error: ENOENT … schema.d.ts`），看不出「是你给的入口不对」。
    console.error('✗ 生成契约类型失败。')
    console.error(`  原始报错：${error.message}`)
    if (PNPM.fromEnv) {
      console.error('  PNPM_JS_ENTRY 指定的入口能跑起来，但它不是 pnpm 的入口——')
      console.error('  指向 pnpm 自己的 JS 入口文件（形如 ...\\node_modules\\pnpm\\bin\\pnpm.cjs）。')
    }
    process.exit(1)
  }
  if (!existsSync(target)) {
    // 入口文件存在、命令也「跑成功」了，但它不是 pnpm——于是根本没生成出类型文件。
    // 不查这一步的话，错误会变成一句 `ENOENT … schema.d.ts`，看不出真正的原因。
    console.error('✗ 没有生成出契约类型文件。')
    console.error(`  期望路径：${target}`)
    if (PNPM.fromEnv) {
      console.error('  PNPM_JS_ENTRY 指定的入口能跑，但它不是 pnpm——')
      console.error('  指向 pnpm 自己的 JS 入口文件（形如 ...\\node_modules\\pnpm\\bin\\pnpm.cjs）。')
    }
    process.exit(1)
  }
  return readFileSync(target, 'utf8')
}

let openapiTypescriptReady = true
let pnpmUnusable = false
try {
  runPnpm(['exec', 'openapi-typescript', '--version'], {
    cwd: REPO,
    stdio: 'ignore',
  })
} catch {
  // 分清三种原因：**pnpm 起不来**、**PNPM_JS_ENTRY 指的入口不对**、还是 **openapi-typescript 没装**。
  // 报错文案要指向真正的原因——否则开发者会去装一个已经装好的依赖。
  if (!PNPM.resolved) {
    pnpmUnusable = true
  } else if (PNPM.fromEnv) {
    // 入口文件存在，但用它跑 pnpm 失败——多半指错了文件。
    console.error('✗ PNPM_JS_ENTRY 指定的入口跑不起来。')
    console.error('  它指向的文件存在，但用 node 跑它没法执行 pnpm 的命令。')
    console.error('  确认它指向的是 pnpm 自己的 JS 入口文件（形如 ...\\node_modules\\pnpm\\bin\\pnpm.cjs）。')
    process.exit(1)
  } else {
    openapiTypescriptReady = false
  }
}

if (pnpmUnusable) {
  console.error('✗ 没能启动 pnpm。')
  console.error('  Windows 上 Node ≥ 18.20 不允许直接 spawn .cmd，脚本只能绕开 shell：')
  console.error('  读 pnpm.cmd 找它指向的 JS 入口。这次没找到（corepack 代理就是这种形态）。')
  console.error('  先确认 `pnpm exec openapi-typescript --version` 在你的 shell 里能用；')
  console.error('  确认能用后，用环境变量 PNPM_JS_ENTRY 指向 pnpm 的 JS 入口，例如：')
  console.error('    set PNPM_JS_ENTRY=C:\\nodejs\\node_modules\\pnpm\\bin\\pnpm.cjs')
  process.exit(1)
}

if (!openapiTypescriptReady) {
  console.error('✗ 找到 openapi.json，但仓里没有安装 openapi-typescript。')
  console.error('  请执行：pnpm add -D openapi-typescript')
  process.exit(1)
}

const generated = generate(
  write ? OUT : join(mkdtempSync(join(tmpdir(), 'contract-')), 'schema.d.ts'),
)

if (write) {
  console.log(`✓ 已用 ${spec.replace(REPO, '.')} 生成契约类型：${OUT.replace(REPO, '.')}`)
  process.exit(0)
}

if (!existsSync(OUT)) {
  console.error(`✗ 契约类型缺失：${OUT.replace(REPO, '.')} 还没有生成。`)
  console.error('  执行 `pnpm contract:write` 生成后提交。')
  process.exit(1)
}

const committed = readFileSync(OUT, 'utf8')
if (committed !== generated) {
  const committedLines = committed.split('\n')
  const generatedLines = generated.split('\n')
  const firstDiff = committedLines.findIndex((line, index) => line !== generatedLines[index])
  console.error(`✗ 契约漂移：${OUT.replace(REPO, '.')} 与 ${spec.replace(REPO, '.')} 不一致。`)
  console.error(`  首个差异在第 ${firstDiff + 1} 行：`)
  console.error(`    提交的：${committedLines[firstDiff] ?? '(无)'}`)
  console.error(`    生成的：${generatedLines[firstDiff] ?? '(无)'}`)
  console.error('  后端契约变了就跑 `pnpm contract:write` 重新生成并提交生成物；')
  console.error('  如果只是手改过生成物，请还原——手写类型不允许进 src/api/generated。')
  process.exit(1)
}

console.log(`✓ 契约一致（${spec.replace(REPO, '.')} → ${OUT.replace(REPO, '.')}）`)
