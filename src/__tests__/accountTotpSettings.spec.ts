import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { HttpError } from '@/api/http'
import { useAccountTotpSettings } from '@/composables/useAccountTotpSettings'

const mocks = vi.hoisted(() => ({
  getProfileTotp: vi.fn(),
  setupProfileTotp: vi.fn(),
  enableProfileTotp: vi.fn(),
  disableProfileTotp: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  isAuthed: true,
  fetchProfile: vi.fn().mockResolvedValue(undefined),
})

vi.mock('@/api/settings', () => ({
  getProfileTotp: mocks.getProfileTotp,
  setupProfileTotp: mocks.setupProfileTotp,
  enableProfileTotp: mocks.enableProfileTotp,
  disableProfileTotp: mocks.disableProfileTotp,
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('ui_73info', () => ({
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('身份验证器设置域', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.isAuthed = true
    auth.token = 'test-token'
  })

  it('加载状态：未启用时 confirmed_at 归一为 null', async () => {
    mocks.getProfileTotp.mockResolvedValue({ enabled: false })
    const totp = useAccountTotpSettings()

    await totp.loadTotpStatus()

    expect(mocks.getProfileTotp).toHaveBeenCalledWith('test-token')
    expect(totp.totpEnabled.value).toBe(false)
    expect(totp.totpConfirmedAt.value).toBeNull()
  })

  it('生成绑定信息后展开二维码草稿，启用成功刷新状态与个人资料', async () => {
    mocks.setupProfileTotp.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauth_uri: 'otpauth://totp/73Info:demo?secret=JBSWY3DPEHPK3PXP',
    })
    mocks.enableProfileTotp.mockResolvedValue({ enabled: true })
    mocks.getProfileTotp.mockResolvedValue({
      enabled: true,
      confirmed_at: '2026-11-06 21:00:00',
    })
    const totp = useAccountTotpSettings()

    await totp.startTotpSetup()
    expect(totp.totpSetup.value?.secret).toBe('JBSWY3DPEHPK3PXP')

    totp.totpBindCode.value = '123456'
    await totp.confirmEnableTotp()

    expect(mocks.enableProfileTotp).toHaveBeenCalledWith('test-token', '123456')
    expect(totp.totpSetup.value).toBeNull()
    expect(totp.totpEnabled.value).toBe(true)
    expect(totp.totpConfirmedAt.value).toBe('2026-11-06 21:00:00')
    expect(auth.fetchProfile).toHaveBeenCalledWith(true)
    expect(mocks.success).toHaveBeenCalledWith('身份验证器已启用')
  })

  it('动态码格式不对时不发请求；后端返回 TOTP_CODE_INVALID 映射成中文提示', async () => {
    mocks.enableProfileTotp.mockRejectedValue(new HttpError(400, 'bad code', 'TOTP_CODE_INVALID'))
    const totp = useAccountTotpSettings()
    totp.totpSetup.value = {
      secret: 'JBSWY3DPEHPK3PXP',
      otpauth_uri: 'otpauth://totp/73Info:demo?secret=JBSWY3DPEHPK3PXP',
    }

    totp.totpBindCode.value = '123'
    await totp.confirmEnableTotp()
    expect(mocks.enableProfileTotp).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('请输入 6 位动态码')

    totp.totpBindCode.value = '123456'
    await totp.confirmEnableTotp()
    expect(mocks.error).toHaveBeenLastCalledWith('动态码不正确')
    expect(totp.totpSetup.value).not.toBeNull()
  })

  it('停用成功清空草稿并刷新状态', async () => {
    mocks.disableProfileTotp.mockResolvedValue({ enabled: false })
    mocks.getProfileTotp.mockResolvedValue({ enabled: false, confirmed_at: null })
    const totp = useAccountTotpSettings()

    totp.startTotpDisable()
    expect(totp.totpDisableVisible.value).toBe(true)

    totp.totpDisableCode.value = '654321'
    await totp.confirmDisableTotp()

    expect(mocks.disableProfileTotp).toHaveBeenCalledWith('test-token', '654321')
    expect(totp.totpDisableVisible.value).toBe(false)
    expect(totp.totpDisableCode.value).toBe('')
    expect(totp.totpEnabled.value).toBe(false)
    expect(mocks.success).toHaveBeenCalledWith('身份验证器已停用')
  })
})
