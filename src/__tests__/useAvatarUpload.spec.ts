import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAvatarUpload } from '@/composables/useAvatarUpload'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  uploadProfileAvatar: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/settings/profile', () => ({
  getProfile: mocks.getProfile,
  uploadProfileAvatar: mocks.uploadProfileAvatar,
}))
vi.mock('ui_73info', () => ({
  TMessage: { warning: mocks.warning, success: mocks.success, error: mocks.error },
}))

/** 用一个最小宿主挂上 composable，拿到真实的 input / 生命周期钩子。 */
const Harness = defineComponent({
  setup() {
    return useAvatarUpload()
  },
  template: `
    <div>
      <input ref="inputRef" class="pick" type="file" @change="onPicked" />
      <button class="pick-btn" type="button" @click="pick">换头像</button>
    </div>
  `,
})

async function pickFile(wrapper: VueWrapper, file: File) {
  const input = wrapper.get('.pick')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  // 上传 + refresh 是异步链，等它跑完再断言
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getProfile.mockReset()
  mocks.uploadProfileAvatar.mockReset()
  mocks.warning.mockReset()
  mocks.success.mockReset()
  mocks.error.mockReset()
  mocks.getProfile.mockResolvedValue({ avatar_url: '' })
})

describe('useAvatarUpload', () => {
  it('非白名单类型 / 超过 2MB 都只警告，不发请求', async () => {
    useAuthStore().token = 'token-a'
    const wrapper = mount(Harness)

    await pickFile(wrapper, new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(mocks.warning).toHaveBeenCalledWith('头像仅支持 PNG、JPG、WebP 或 GIF 图片')

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    await pickFile(wrapper, big)
    expect(mocks.warning).toHaveBeenCalledWith('头像文件请控制在 2MB 以内')

    expect(mocks.uploadProfileAvatar).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('合规文件上传成功后刷新并提示；失败走错误提示', async () => {
    useAuthStore().token = 'token-b'
    mocks.uploadProfileAvatar.mockResolvedValueOnce({ avatar_url: '/uploads/a.png' })
    const wrapper = mount(Harness)

    const file = new File(['img'], 'a.png', { type: 'image/png' })
    await pickFile(wrapper, file)
    expect(mocks.uploadProfileAvatar).toHaveBeenCalledWith('token-b', file)
    expect(mocks.success).toHaveBeenCalledWith('头像已更新')

    mocks.uploadProfileAvatar.mockRejectedValueOnce(new Error('上传头像失败'))
    await pickFile(wrapper, file)
    expect(mocks.error).toHaveBeenCalledWith('上传头像失败')
    wrapper.unmount()
  })

  it('上传中再次点头像不会重复唤起选择框', async () => {
    useAuthStore().token = 'token-c'
    const wrapper = mount(Harness)
    const input = wrapper.get('.pick').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    const vm = wrapper.vm as unknown as { uploading: boolean }

    vm.uploading = true
    await wrapper.get('.pick-btn').trigger('click')
    expect(click).not.toHaveBeenCalled()

    vm.uploading = false
    await wrapper.get('.pick-btn').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
