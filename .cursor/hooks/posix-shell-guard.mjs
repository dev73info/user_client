#!/usr/bin/env node
/**
 * beforeShellExecution 钩子：拦住「在非 POSIX shell 里跑 user-client 的 env -u 脚本」这个已知错误。
 *
 * 背景：package.json 里的 dev / build / build-only / type-check / generate:sitemap 都以
 * `env -u NODE_USE_ENV_PROXY ...` 开头，`env` 在 PowerShell 与 cmd 里不存在，直接跑必失败。
 * 正确做法是用 Git Bash 包一层（见 .cursor/rules/toolchain-and-gates.mdc 第一节）。
 *
 * 设计原则：
 * - 命中时只返回 permission: "ask"（请用户确认），**不直接 deny**——这是提示，不是禁令。
 * - 没命中时**不输出任何内容**、exit 0，表示「本钩子没有意见」，以免削弱用户自己的审批设置。
 * - 任何异常都放过：不设 failClosed，脚本崩了也不会挡住工作。
 */

import process from 'node:process'

/** 需要 POSIX shell 的脚本名（不带 env -u 的 lint / format / test:* / preview 不在内）。 */
const POSIX_ONLY_SCRIPT =
  /\b(?:pnpm|npm|yarn|npx)\b[^\n|;&]*?\b(?:dev|build|build-only|type-check|generate:sitemap)\b/

/** 命令本身已经包在 POSIX shell 里了。 */
const ALREADY_POSIX = /\b(?:bash|zsh|sh)\b|\bwsl(?:\.exe)?\b|-lc\b/

/** 明确指向工作区里别的子工程时不要误报（那些工程没有 env -u 前缀）。 */
const OTHER_PROJECT =
  /\b(?:admin_client|support_client|financeclient|ui_73info|tags-wasm|backend_73info|adapay-sdk|asign-sdk|ai-agnet-audit)\b/

const TIMEOUT_MS = 5000

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

/** 事件载荷里命令字段的名字按版本可能不同，逐个试。 */
function pickCommand(payload) {
  for (const key of ['command', 'commandLine', 'command_line', 'shell_command', 'cmd']) {
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

  const command = pickCommand(payload)
  if (!command) {
    return
  }

  // 已经走 POSIX shell，或指向别的子工程，都不管。
  if (ALREADY_POSIX.test(command)) {
    return
  }
  if (OTHER_PROJECT.test(command) && !command.includes('user-client')) {
    return
  }

  if (!POSIX_ONLY_SCRIPT.test(command)) {
    return
  }

  process.stdout.write(
    JSON.stringify({
      permission: 'ask',
      user_message:
        '这条命令要在 POSIX shell 里跑：user-client 的 dev / build / type-check 等脚本以 `env -u NODE_USE_ENV_PROXY` 开头，PowerShell 与 cmd 里没有 `env`，会直接失败。',
      agent_message:
        'user-client 的这些脚本必须走 Git Bash 并写全路径，例如：\n' +
        "& \"C:\\Program Files\\Git\\bin\\bash.exe\" -lc 'cd /e/yl73info/user-client && pnpm type-check'\n" +
        '不要用 PATH 上的 `bash`（那是 WSL 的 /bin/bash，里面没有 node，会死在 exec: node: not found）。\n' +
        '见 .cursor/rules/toolchain-and-gates.mdc 第一节。',
    }),
  )
}

const hardStop = setTimeout(() => process.exit(0), TIMEOUT_MS)

main()
  .catch(() => {})
  .finally(() => {
    clearTimeout(hardStop)
    process.exit(0)
  })
