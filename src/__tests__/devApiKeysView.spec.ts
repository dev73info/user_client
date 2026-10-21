import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DevApiKeysView from '@/views/DevApiKeysView.vue'

/**
 * 接口密钥页的取回明文路径（R044）。
 *
 * 这条路径同时碰到「网络取回敏感明文」和「写剪贴板」两件容易出错的事，
 * 所以单独覆盖：取回成功 → 复制成功；剪贴板不可用 → 明文不能丢；
 * 后端 409（存量密钥） → 透出后端文案。
 */
const mocks = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  revealApiKey: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
  writeTextToClipboard: vi.fn(),
}))

vi.mock('@/api/apiKeys', () => ({
  listApiKeys: mocks.listApiKeys,
  revealApiKey: mocks.revealApiKey,
  createApiKey: mocks.createApiKey,
  revokeApiKey: mocks.revokeApiKey,
}))

vi.mock('@/shared/clipboard', () => ({
  writeTextToClipboard: mocks.writeTextToClipboard,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'token-1', hydrate: vi.fn() }),
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      success: mocks.messageSuccess,
      error: mocks.messageError,
      warning: mocks.messageWarning,
    },
    TMessageBox: { confirm: vi.fn() },
  }
})

const record = {
  id: 56,
  name: '线上站点',
  key_prefix: 'sk-73info-cbeb1d...',
  note: null,
  is_active: true,
  created_by: 'dev_flow_03562487',
  expires_at: null,
  last_used_at: null,
  created_at: '2026-10-20 10:00:00',
  updated_at: '2026-10-20 10:00:00',
}

/** 找列表行里的「复制」按钮：图标按钮没有文本，按 aria-label 定位。 */
async function clickCopyButton(wrapper: ReturnType<typeof mount>) {
  const target = wrapper.find('button[aria-label="复制密钥 线上站点"]')
  expect(target.exists(), '应能找到复制按钮').toBe(true)
  await target.trigger('click')
  await flushPromises()
}

describe('DevApiKeysView 取回明文', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.listApiKeys.mockResolvedValue([record])
    mocks.writeTextToClipboard.mockResolvedValue(undefined)
  })

  it('取回成功后写入剪贴板并提示成功', async () => {
    mocks.revealApiKey.mockResolvedValue('sk-73info-full-plaintext')
    const wrapper = mount(DevApiKeysView)
    await flushPromises()

    await clickCopyButton(wrapper)

    expect(mocks.revealApiKey).toHaveBeenCalledWith('token-1', 56)
    expect(mocks.writeTextToClipboard).toHaveBeenCalledWith('sk-73info-full-plaintext')
    expect(mocks.messageSuccess).toHaveBeenCalledWith('接口密钥已复制到剪贴板')
    expect(mocks.messageError).not.toHaveBeenCalled()
  })

  it('剪贴板不可用时明文不丢：弹窗展示供手动复制', async () => {
    mocks.revealApiKey.mockResolvedValue('sk-73info-full-plaintext')
    mocks.writeTextToClipboard.mockRejectedValue(new Error('copy failed'))
    const wrapper = mount(DevApiKeysView)
    await flushPromises()

    await clickCopyButton(wrapper)

    expect(mocks.messageWarning).toHaveBeenCalledWith('自动复制失败，请在弹出的窗口里手动复制')
    expect(mocks.messageError).not.toHaveBeenCalled()
    // TDialog 会 Teleport 到 body，明文出现在那里即可。
    expect(document.body.textContent).toContain('sk-73info-full-plaintext')
  })

  it('存量密钥取不回明文时透出后端文案', async () => {
    mocks.revealApiKey.mockRejectedValue(
      new Error('该密钥的明文无法取回，请重新创建一把密钥'),
    )
    const wrapper = mount(DevApiKeysView)
    await flushPromises()

    await clickCopyButton(wrapper)

    expect(mocks.writeTextToClipboard).not.toHaveBeenCalled()
    expect(mocks.messageError).toHaveBeenCalledWith('该密钥的明文无法取回，请重新创建一把密钥')
  })
})
