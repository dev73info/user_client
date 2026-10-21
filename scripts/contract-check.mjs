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
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')
/** Windows 上 pnpm 是 .cmd，直接给可执行名、不开 shell（开 shell 传参会触发 Node 弃用警告） */
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const write = process.argv.includes('--write')
const outIndex = process.argv.indexOf('--out')
const OUT = outIndex > -1 ? resolve(REPO, process.argv[outIndex + 1]) : join(REPO, 'src/api/generated/schema.d.ts')

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
  execFileSync(PNPM, ['exec', 'openapi-typescript', spec, '-o', target], {
    cwd: REPO,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return readFileSync(target, 'utf8')
}

let openapiTypescriptReady = true
try {
  execFileSync(PNPM, ['exec', 'openapi-typescript', '--version'], { cwd: REPO, stdio: 'ignore' })
} catch {
  openapiTypescriptReady = false
}

if (!openapiTypescriptReady) {
  console.error('✗ 找到 openapi.json，但仓里没有安装 openapi-typescript。')
  console.error('  请执行：pnpm add -D openapi-typescript')
  process.exit(1)
}

const generated = generate(write ? OUT : join(mkdtempSync(join(tmpdir(), 'contract-')), 'schema.d.ts'))

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
