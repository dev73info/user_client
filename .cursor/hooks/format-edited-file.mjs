#!/usr/bin/env node
/**
 * afterFileEdit 钩子：用项目自己的 Prettier 格式化刚被编辑的文件。
 *
 * 为什么值得有：站内的格式口径（无分号、单引号、100 列，见 .prettierrc.json）靠人记容易漏，
 * 而 `pnpm format` 是整目录跑、也不在每次改动之后。这里只处理「刚刚被写的那一个文件」。
 *
 * 设计原则：
 * - 只处理仓库内 `src/` 下的可格式化文件，其它路径直接放过。
 * - 任何异常（prettier 没装、文件已删、超时）都静默放过，**绝不阻塞编辑**。
 * - 不输出任何内容、始终 exit 0。
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const FORMATTABLE_EXTENSIONS = new Set(['.vue', '.ts', '.mts', '.cts', '.tsx', '.css'])
const SOURCE_DIR = 'src'
const TIMEOUT_MS = 5000
const PRETTIER_TIMEOUT_MS = 20000

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }

    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

/** 事件载荷里文件路径字段的名字按版本可能不同，逐个试。 */
function pickFilePath(payload) {
  for (const key of ['file_path', 'filePath', 'path', 'file', 'target_file']) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return ''
}

async function main() {
  const raw = await readStdin()

  let payload
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    return
  }

  const filePath = pickFilePath(payload)
  if (!filePath) {
    return
  }

  const root = process.cwd()
  const absolutePath = path.resolve(root, filePath)
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')

  // 仓库外的文件不管。
  if (relativePath.startsWith('..')) {
    return
  }
  // 只格式化 src/ 下的文件（与 `pnpm format` 的范围一致）。
  if (!relativePath.startsWith(`${SOURCE_DIR}/`)) {
    return
  }
  if (!FORMATTABLE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    return
  }
  if (!existsSync(absolutePath)) {
    return
  }

  const prettierBin = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs')
  if (!existsSync(prettierBin)) {
    return
  }

  try {
    // 用当前 node 直接跑 prettier 的入口，避开 shell 包装（不依赖 .cmd 包装或可执行位）。
    execFileSync(process.execPath, [prettierBin, '--write', absolutePath], {
      cwd: root,
      stdio: 'ignore',
      timeout: PRETTIER_TIMEOUT_MS,
    })
  } catch {
    // 格式化失败不影响编辑本身。
  }
}

const hardStop = setTimeout(() => process.exit(0), TIMEOUT_MS)

main()
  .catch(() => {})
  .finally(() => {
    clearTimeout(hardStop)
    process.exit(0)
  })
