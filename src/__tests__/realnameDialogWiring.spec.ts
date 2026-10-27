import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openEntry, stubMatchMedia } from '@/__tests__/accountViewHelpers'

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getBoundProviders: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  quickStartAsignIdentify: vi.fn(),
  uploadBusinessLicenseFile: vi.fn(),
  uploadLegalCertFrontFile: vi.fn(),
  uploadLegalCertBackFile: vi.fn(),
  withdrawRealname: vi.fn(),
  open: vi.fn(),
  replace: vi.fn(),
}))

const auth = reactive({ token: 'test-token', isAuthed: true, hydrate: vi.fn() })
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.replace }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const noop = vi.fn()
  return { ...actual, TMessage: { ...actual.TMessage, success: noop, error: noop, warning: noop } }
})
vi.mock('@/api/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/settings')>()),
  getProfile: mocks.getProfile,
}))
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
}))
vi.mock('@/api/adapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/adapay')>()),
  getMyAdapayMember: vi.fn(async () => ({ onboardingStatus: 'active', acceptsSettlement: false })),
  getMySettlementAccountSnapshot: vi.fn(async () => ({ bound: false })),
}))
vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: mocks.getMyRealnameVerification,
  quickStartAsignIdentify: mocks.quickStartAsignIdentify,
  uploadBusinessLicenseFile: mocks.uploadBusinessLicenseFile,
  uploadLegalCertFrontFile: mocks.uploadLegalCertFrontFile,
  uploadLegalCertBackFile: mocks.uploadLegalCertBackFile,
  withdrawMyRealnameVerification: mocks.withdrawRealname,
}))

import AccountCouponsView from '@/views/AccountCouponsView.vue'

const REJECTED_RECORD = { status: 'rejected', auth_type: 'IDENTITY_CARD' }
const APPROVED_RECORD = {
  status: 'approved',
  auth_type: 'IDENTITY_CARD',
  real_name: '旧姓名',
  mobile: '13800000000',
}
const FRONT_FILE = '/uploads/realname-legal-certs/flow/front.jpg'
const BACK_FILE = '/uploads/realname-legal-certs/flow/back.jpg'
const LICENSE_FILE = '/uploads/realname-business-licenses/flow/license.jpg'

type Setup = {
  draft: { form: Record<string, unknown> }
  identity: { realnameChanging: { value: boolean } }
  realnameDialogVisible: boolean
}
const setupState = (wrapper: VueWrapper): Setup =>
  (wrapper.vm.$ as unknown as { setupState: Setup }).setupState

function bodyButton(text: string): HTMLElement {
  const button = [...document.querySelectorAll('.t73-dialog button')].find((item) =>
    (item.textContent ?? '').includes(text),
  )
  if (!button) throw new Error(`弹窗里找不到按钮：${text}`)
  return button as HTMLElement
}

function pickFile(index: number, name: string): File {
  const inputs = [
    ...document.querySelectorAll('.t73-dialog .realname-consent-upload__native'),
  ] as HTMLInputElement[]
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(inputs[index]!, 'files', { value: [file], configurable: true })
  inputs[index]!.dispatchEvent(new Event('change'))
  return file
}

async function renderPage(): Promise<VueWrapper> {
  const wrapper = mount(AccountCouponsView, {
    attachTo: document.body,
    global: { stubs: { RealnameHero: true } },
  })
  await flushPromises()
  await openEntry(wrapper, 'realname')
  await flushPromises()
  return wrapper
}

async function fillMobile(placeholder: string) {
  const input = document.querySelector(
    `.t73-dialog input[placeholder="${placeholder}"]`,
  ) as HTMLInputElement
  input.value = '13800000000'
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  vi.spyOn(window, 'open').mockImplementation(mocks.open)
  mocks.getProfile.mockResolvedValue({ username: 'alice', email: 'a@example.com' })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.getMyRealnameVerification.mockResolvedValue(REJECTED_RECORD)
  mocks.quickStartAsignIdentify.mockResolvedValue({ auth_url: 'https://asign.test/auth' })
  mocks.uploadLegalCertFrontFile.mockResolvedValue({ front_file: FRONT_FILE })
  mocks.uploadLegalCertBackFile.mockResolvedValue({ back_file: BACK_FILE })
  mocks.uploadBusinessLicenseFile.mockResolvedValue({ business_license_file: LICENSE_FILE })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('材料认证弹窗', () => {
  it('个人只显示材料、手机号和认证方式，点击后直接跳爱签', async () => {
    const wrapper = await renderPage()
    expect(document.querySelector('input[placeholder="请输入真实姓名"]')).toBeNull()
    const file = pickFile(0, 'front.jpg')
    await flushPromises()
    await fillMobile('请输入本人手机号')
    bodyButton('开始认证').click()
    await flushPromises()

    expect(mocks.uploadLegalCertFrontFile).toHaveBeenCalledWith('test-token', file)
    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith('test-token', {
      auth_type: 'IDENTITY_CARD',
      identify_type: 153,
      mobile: '13800000000',
      legal_cert_front_file: FRONT_FILE,
    })
    expect(mocks.open).toHaveBeenCalledWith('https://asign.test/auth', '_self')
    wrapper.unmount()
  })

  it('企业默认 369，上传三张证照并上送本次文件路径', async () => {
    const wrapper = await renderPage()
    const state = setupState(wrapper)
    state.draft.form.authType = 'ENTERPRISE'
    await nextTick()
    expect(state.draft.form.identifyType).toBe(369)
    expect(document.body.textContent).toContain('企业线下盖章授权认证（369，默认）')

    pickFile(0, 'front.jpg')
    await flushPromises()
    pickFile(1, 'back.jpg')
    await flushPromises()
    pickFile(2, 'license.jpg')
    await flushPromises()
    await fillMobile('请输入法定代表人手机号')
    bodyButton('开始认证').click()
    await flushPromises()

    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith('test-token', {
      auth_type: 'ENTERPRISE',
      identify_type: 369,
      mobile: '13800000000',
      legal_cert_front_file: FRONT_FILE,
      legal_cert_back_file: BACK_FILE,
      business_license_file: LICENSE_FILE,
    })
    expect(mocks.open).toHaveBeenCalledWith('https://asign.test/auth', '_self')
    wrapper.unmount()
  })

  it('变更认证类型不从旧实名记录回填要素', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(APPROVED_RECORD)
    const wrapper = mount(AccountCouponsView, {
      attachTo: document.body,
      global: { stubs: { RealnameHero: true } },
    })
    await flushPromises()
    await openEntry(wrapper, 'changeSubject')
    await flushPromises()
    const state = setupState(wrapper)
    expect(state.identity.realnameChanging.value).toBe(true)
    expect(state.draft.form.realName).toBe('')
    expect(state.draft.form.mobile).toBe('')

    bodyButton('放弃变更').click()
    await flushPromises()
    expect(state.identity.realnameChanging.value).toBe(false)
    expect(state.realnameDialogVisible).toBe(false)
    wrapper.unmount()
  })

  it('处理中仍可撤回本次认证', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue({ ...REJECTED_RECORD, status: 'pending' })
    const wrapper = await renderPage()
    bodyButton('撤回认证').click()
    await flushPromises()
    expect(mocks.withdrawRealname).toHaveBeenCalledWith('test-token')
    wrapper.unmount()
  })
})
