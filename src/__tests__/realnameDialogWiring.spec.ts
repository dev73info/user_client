import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openEntry, stubMatchMedia } from '@/__tests__/accountViewHelpers'

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getBoundProviders: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  quickStartAsignIdentify: vi.fn(),
  submitMyRealnameVerification: vi.fn(),
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
  submitMyRealnameVerification: mocks.submitMyRealnameVerification,
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
const OPERATOR_MOBILE = '13900000000'

type Setup = {
  draft: { form: Record<string, unknown>; mode: { value: 'ocr' | 'manual' } }
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

async function fillInput(placeholder: string, value: string) {
  const input = document.querySelector(
    `.t73-dialog input[placeholder="${placeholder}"]`,
  ) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

async function fillMobile(placeholder: string, value = '13800000000') {
  await fillInput(placeholder, value)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  vi.spyOn(window, 'open').mockImplementation(mocks.open)
  mocks.getProfile.mockResolvedValue({ username: 'alice', email: 'a@example.com' })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.getMyRealnameVerification.mockResolvedValue(REJECTED_RECORD)
  mocks.quickStartAsignIdentify.mockResolvedValue({ auth_url: 'https://asign.test/auth' })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('材料认证弹窗', () => {
  it('个人只显示材料、手机号和认证方式，点击后直接跳爱签', async () => {
    const wrapper = await renderPage()
    expect(document.querySelector('input[placeholder="请输入真实姓名"]')).toBeNull()
    expect(document.body.textContent).toContain('个人人脸活体认证')
    expect(document.body.textContent).not.toContain('（153）')
    const file = pickFile(0, 'front.jpg')
    await flushPromises()
    await fillMobile('请输入本人手机号')
    bodyButton('开始认证').click()
    await flushPromises()

    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      {
        auth_type: 'IDENTITY_CARD',
        identify_type: 153,
        mobile: '13800000000',
      },
      {
        legalCertFront: file,
        legalCertBack: null,
        businessLicense: null,
        operatorCertFront: null,
      },
    )
    expect(mocks.open).toHaveBeenCalledWith('https://asign.test/auth', '_self')
    wrapper.unmount()
  })

  it('手动填写认证：填文字字段后提交人工审核，不走爱签', async () => {
    mocks.submitMyRealnameVerification.mockResolvedValue({ ...REJECTED_RECORD, status: 'pending' })
    const wrapper = await renderPage()
    const state = setupState(wrapper)
    state.draft.mode.value = 'manual'
    await nextTick()

    // 手动路径不收证件照片，OCR 的上传位全部让位给文字字段
    expect(document.querySelectorAll('.t73-dialog .realname-consent-upload__native')).toHaveLength(
      0,
    )
    await fillInput('请输入身份证上的姓名', '张三')
    await fillInput('请输入身份证号', '110101199001011234')
    await fillInput('请输入本人手机号', '13800000000')
    bodyButton('提交人工审核').click()
    await flushPromises()

    expect(mocks.submitMyRealnameVerification).toHaveBeenCalledWith('test-token', {
      auth_type: 'IDENTITY_CARD',
      real_name: '张三',
      id_card_no: '110101199001011234',
      mobile: '13800000000',
    })
    expect(mocks.quickStartAsignIdentify).not.toHaveBeenCalled()
    expect(state.realnameDialogVisible).toBe(false)
    wrapper.unmount()
  })

  it('企业默认 369，上传四份材料并上送本次文件路径与两个手机号', async () => {
    const wrapper = await renderPage()
    const state = setupState(wrapper)
    state.draft.form.authType = 'ENTERPRISE'
    await nextTick()
    expect(state.draft.form.identifyType).toBe(369)
    expect(document.body.textContent).toContain('企业线下盖章授权认证')
    expect(document.body.textContent).not.toContain('（369，默认）')

    const front = pickFile(0, 'front.jpg')
    await flushPromises()
    const back = pickFile(1, 'back.jpg')
    await flushPromises()
    const license = pickFile(2, 'license.jpg')
    await flushPromises()
    const operator = pickFile(3, 'operator-front.jpg')
    await flushPromises()
    await fillMobile('请输入法定代表人手机号')
    await fillMobile('请输入经办人手机号', OPERATOR_MOBILE)
    bodyButton('开始认证').click()
    await flushPromises()

    expect(mocks.quickStartAsignIdentify).toHaveBeenCalledWith(
      'test-token',
      {
        auth_type: 'ENTERPRISE',
        identify_type: 369,
        mobile: '13800000000',
        operator_identify_type: 153,
        operator_mobile: OPERATOR_MOBILE,
      },
      {
        legalCertFront: front,
        legalCertBack: back,
        businessLicense: license,
        operatorCertFront: operator,
      },
    )
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
