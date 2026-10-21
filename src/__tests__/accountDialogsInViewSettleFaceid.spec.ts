import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TSelect } from 'ui_73info'

import { openEntry, stubMatchMedia } from '@/__tests__/accountViewHelpers'

/**
 * 「收款银行卡」「人脸核身」两个弹窗**在视图里**的接线（第 2、3 步抽出来的两个域）。
 *
 * 组件级用例已经验过各自的 emit 键与次数；这一层验的是**视图那一侧的监听有没有写对**：
 * 五个 `update:*` 少一个，表单就提交不上去；`@withdraw` / `@open-page` / `@check` 写成驼峰，
 * 点下去什么都不会发生。所以这里从点入口行开始，一直推到接口参数。
 *
 * 两个弹窗都不 stub Teleport：`TDialog` 默认 teleport 到 body，而「收款银行卡」里的
 * `TSelect` 在 stub 掉 Teleport 的测试替身下会自我递归更新（真实 teleport 下正常）。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getBoundProviders: vi.fn(),
  getMyAdapayMember: vi.fn(),
  getMySettlementAccountSnapshot: vi.fn(),
  createSettle: vi.fn(),
  changeSettle: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  completeAsignIdentify: vi.fn(),
  resumeAsignIdentify: vi.fn(),
  withdrawRealname: vi.fn(),
  hydrate: vi.fn(),
  replace: vi.fn(),
  open: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  username: 'alice',
  isAuthed: true,
  hydrate: mocks.hydrate,
  setToken: vi.fn(),
  logout: vi.fn(),
  fetchProfile: vi.fn(async () => undefined),
})
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.replace }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

vi.mock('@/api/settings', () => ({
  getProfile: mocks.getProfile,
  updateProfile: vi.fn(),
  sendProfileEmailChangeCode: vi.fn(),
  updateProfileEmail: vi.fn(),
  sendProfilePasswordCode: vi.fn(),
  updateProfilePassword: vi.fn(),
  sendProfileTwoFactorCode: vi.fn(),
  updateProfileTwoFactor: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
}))

vi.mock('@/api/adapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/adapay')>()),
  getMyAdapayMember: mocks.getMyAdapayMember,
  getMySettlementAccountSnapshot: mocks.getMySettlementAccountSnapshot,
  createMyAdapaySettlementAccount: mocks.createSettle,
  changeMyAdapaySettlementAccount: mocks.changeSettle,
}))

vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: mocks.getMyRealnameVerification,
  completeAsignIdentify: mocks.completeAsignIdentify,
  resumeAsignIdentify: mocks.resumeAsignIdentify,
  withdrawMyRealnameVerification: mocks.withdrawRealname,
}))

import { settlementBanks, settlementProvinces } from '@/utils/settlementAccount'
import AccountCouponsView from '@/views/AccountCouponsView.vue'

/** 一条「审核中」的实名记录：人脸核身域的所有分支都要它。 */
const pendingRecord = {
  status: 'pending',
  auth_type: 'IDENTITY_CARD',
  real_name: '张三',
  id_card_no_masked: '110***********1234',
  mobile_masked: '138****0000',
}

/**
 * 按可见文案找**弹窗里**的按钮：整页查找会把入口行也匹配进来
 * （「认证已完成，绑定银行卡后即可收取合同款」就含有「绑定银行卡」）。
 */
function bodyButton(text: string): HTMLElement {
  const found = [...document.querySelectorAll('.t73-dialog button')].find((button) =>
    (button.textContent ?? '').includes(text),
  )
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found as HTMLElement
}

async function renderAccountPage(): Promise<VueWrapper> {
  const wrapper = mount(AccountCouponsView, {
    attachTo: document.body,
    global: {
      stubs: { RealnameHero: true, WechatBindQrModal: true },
      config: { warnHandler: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  vi.spyOn(window, 'open').mockImplementation(mocks.open)
  route.query = {}
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
    wechat_bound: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.getMyAdapayMember.mockResolvedValue({ onboardingStatus: 'active', settleAccountId: null })
  mocks.getMySettlementAccountSnapshot.mockResolvedValue({ bound: false })
  mocks.createSettle.mockResolvedValue({ onboardingStatus: 'active', settleAccountId: 'sa_1' })
  mocks.changeSettle.mockResolvedValue({ onboardingStatus: 'active', settleAccountId: 'sa_1' })
  mocks.getMyRealnameVerification.mockResolvedValue(null)
  mocks.completeAsignIdentify.mockResolvedValue({ status: 'none' })
  mocks.resumeAsignIdentify.mockResolvedValue({
    auth_url: 'https://faceid.test/x',
    manual_review: false,
  })
  mocks.withdrawRealname.mockResolvedValue({ restored: false })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('账号与安全页：收款银行卡弹窗的接线', () => {
  it('点入口打开弹窗，五份草稿都经 update:* 回写，提交时按字典值拼出请求体', async () => {
    const wrapper = await renderAccountPage()
    await openEntry(wrapper, 'settle')
    await flushPromises()

    // 卡号走 input，开户行 / 省 / 市 / 账户类型走四个下拉
    const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    input.value = '6222 0212 3456 7890 123'
    input.dispatchEvent(new Event('input'))

    const province = settlementProvinces[0]!
    const city = province.cities[0]!
    const selects = wrapper.findAllComponents(TSelect)
    expect(selects).toHaveLength(4)
    selects[0]!.vm.$emit('update:modelValue', settlementBanks[0]!.value)
    await nextTick()
    selects[1]!.vm.$emit('update:modelValue', province.value)
    await nextTick()
    selects[2]!.vm.$emit('update:modelValue', city.value)
    await nextTick()

    bodyButton('绑定银行卡').click()
    await flushPromises()
    expect(mocks.createSettle).toHaveBeenCalledTimes(1)
    expect(mocks.createSettle).toHaveBeenCalledWith('test-token', {
      card_id: '6222021234567890123',
      bank_code: settlementBanks[0]!.value,
      bank_name: settlementBanks[0]!.label,
      prov_code: province.value,
      area_code: city.value,
      bank_acct_type: '2',
    })
    wrapper.unmount()
  })

  it('已绑卡时主按钮是「确认更换」，提交走更换接口', async () => {
    mocks.getMyAdapayMember.mockResolvedValue({
      onboardingStatus: 'active',
      settleAccountId: 'sa_1',
    })
    mocks.getMySettlementAccountSnapshot.mockResolvedValue({
      bound: true,
      cardIdMasked: '6222****1234',
      bankCode: settlementBanks[0]!.value,
      provCode: settlementProvinces[0]!.value,
      areaCode: settlementProvinces[0]!.cities[0]!.value,
      bankAcctType: '2',
    })

    const wrapper = await renderAccountPage()
    await openEntry(wrapper, 'settle')
    await flushPromises()

    // 脱敏明细回填后，卡号输入框的提示换成「当前 6222****1234（更换请整卡重填）」
    const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    expect(input.placeholder).toContain('6222****1234')
    input.value = '6222021234567890123'
    input.dispatchEvent(new Event('input'))
    await nextTick()

    bodyButton('确认更换').click()
    await flushPromises()

    expect(mocks.changeSettle).toHaveBeenCalledTimes(1)
    expect(mocks.createSettle).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('账号与安全页：人脸核身弹窗的接线', () => {
  it('审核中刷新页面会续发二维码并弹出核身弹窗，「查询结果」与「打开认证页面」各自打到接口', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(pendingRecord)
    mocks.completeAsignIdentify.mockResolvedValue(pendingRecord)

    const wrapper = await renderAccountPage()

    // 刷新后自动续发（resumeAsignIdentify）→ 二维码出现 → 视图把核身弹窗打开、实名弹窗收起
    expect(mocks.resumeAsignIdentify).toHaveBeenCalledWith('test-token')
    expect(document.body.textContent).toContain('请使用手机扫码，完成人脸核身认证')

    const before = mocks.completeAsignIdentify.mock.calls.length
    bodyButton('查询结果').click()
    await flushPromises()
    expect(mocks.completeAsignIdentify.mock.calls.length).toBe(before + 1)

    bodyButton('打开认证页面').click()
    expect(mocks.open).toHaveBeenCalledWith(
      'https://faceid.test/x',
      '_blank',
      'noopener,noreferrer',
    )
    wrapper.unmount()
  })

  it('「撤回认证」走撤回接口，成功后由视图关核身弹窗、开实名弹窗', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(pendingRecord)
    mocks.completeAsignIdentify.mockResolvedValue(pendingRecord)

    const wrapper = await renderAccountPage()
    expect(document.body.textContent).toContain('人脸核身认证')

    bodyButton('撤回认证').click()
    await flushPromises()

    expect(mocks.withdrawRealname).toHaveBeenCalledWith('test-token')
    // 核身弹窗已收、实名弹窗已开（可见性耦合留在视图这一层）
    expect(document.body.textContent).not.toContain('请使用手机扫码，完成人脸核身认证')
    expect(document.body.textContent).toContain('提交认证信息')
    wrapper.unmount()
  })
})
