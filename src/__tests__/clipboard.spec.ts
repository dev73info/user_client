import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeTextToClipboard } from '@/shared/clipboard'

/**
 * 剪贴板兜底：`useCodeBlockCopy` 与接口资源的「复制密钥 / 复制提示词」共用这一份实现，
 * 走偏一次就是「明文取回来了却复制不出去」，所以两条路径都要有用例钉住。
 */
describe('writeTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('安全上下文优先走 navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)
    const execCommand = vi.fn().mockReturnValue(true)
    Reflect.set(document, 'execCommand', execCommand)

    await writeTextToClipboard('sk-73info-plain')

    expect(writeText).toHaveBeenCalledWith('sk-73info-plain')
    // 有 clipboard 就不该再走 execCommand 那条老路
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('非安全上下文退回 execCommand，并把临时 textarea 收干净', async () => {
    // 非安全上下文里 clipboard 可能仍在（只是写会被拒），必须先看 isSecureContext 再决定走哪条路
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', false)
    const execCommand = vi.fn().mockImplementation(() => {
      // execCommand 执行时 textarea 必须已经在文档里、并且带着待复制的值
      const textarea = document.querySelector('textarea')
      expect(textarea?.value).toBe('sk-73info-plain')
      expect(textarea?.hasAttribute('readonly')).toBe(true)
      return true
    })
    Reflect.set(document, 'execCommand', execCommand)

    await writeTextToClipboard('sk-73info-plain')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(writeText).not.toHaveBeenCalled()
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.body.innerHTML).toBe('')
  })

  it('两条路都失败时抛错，让调用方提示手动复制', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('isSecureContext', false)
    Reflect.set(document, 'execCommand', vi.fn().mockReturnValue(false))

    await expect(writeTextToClipboard('sk-73info-plain')).rejects.toThrow('copy failed')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
