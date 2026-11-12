import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 只关心格式白名单与 MIME 归一，不加载 ui_73info 的完整实现。 */
const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('ui_73info', () => ({
  TButton: { template: '<button><slot /></button>' },
  TDialog: { props: ['open'], template: '<div><slot /></div>' },
  TIcon: { template: '<span><slot /></span>' },
  Plus: { template: '<span />' },
  TMessage: { warning: mocks.warning, error: mocks.error, success: vi.fn() },
}))

import ResourceIconPicker from '@/components/ResourceIconPicker.vue'

async function pickFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('资源图标上传', () => {
  beforeEach(() => {
    mocks.warning.mockClear()
    mocks.error.mockClear()
  })

  it('拒绝 SVG 等白名单外的格式', async () => {
    const wrapper = mount(ResourceIconPicker, { attachTo: document.body })
    await pickFile(wrapper, new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' }))
    await flushPromises()

    expect(mocks.warning).toHaveBeenCalledWith('图标仅支持 PNG、JPG、WebP 或 GIF 图片')
    expect(wrapper.emitted('update:file')).toBeUndefined()
    wrapper.unmount()
  })

  it('接受 PNG 并回传待上传文件', async () => {
    const wrapper = mount(ResourceIconPicker, { attachTo: document.body })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'icon.png', { type: 'image/png' })
    await pickFile(wrapper, file)
    await flushPromises()

    expect(mocks.warning).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(wrapper.emitted('update:file')).toBeTruthy())
    const emitted = wrapper.emitted('update:file') ?? []
    const uploaded = emitted[emitted.length - 1]?.[0]
    expect(uploaded).toBeInstanceOf(File)
    expect((uploaded as File).name).toBe('icon.png')
    wrapper.unmount()
  })

  it('浏览器没给 MIME 时按扩展名补齐后再上传', async () => {
    const wrapper = mount(ResourceIconPicker, { attachTo: document.body })
    await pickFile(wrapper, new File([new Uint8Array([255, 216, 255])], 'icon.jpg', { type: '' }))
    await flushPromises()

    await vi.waitFor(() => expect(wrapper.emitted('update:file')).toBeTruthy())
    const emitted = wrapper.emitted('update:file') ?? []
    const uploaded = emitted[emitted.length - 1]?.[0] as File
    expect(uploaded.type).toBe('image/jpeg')
    wrapper.unmount()
  })
})
