import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { AfterSalesCaseList } from '@/api/afterSales'
import {
  baseProps,
  caseWith,
  findButton,
  hasFormOn,
  mountAfterSales,
  openCase,
  type AfterSalesMocks,
} from './helpers/afterSalesWindow'

/** 窗口守卫：窗口关闭 / 未知、动过钱的收口案件，以及三种可以自助重开的结论。 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
  detail: vi.fn(),
  toast: vi.fn(),
})) satisfies AfterSalesMocks

vi.mock('@/api/afterSales', () => ({
  listMyAfterSalesCases: mocks.list,
  openAfterSalesCase: mocks.open,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
  getAfterSalesCase: mocks.detail,
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})

let wrapper: VueWrapper | undefined

async function open(
  payload: Partial<AfterSalesCaseList> = {},
  propOverrides: Partial<typeof baseProps> = {},
) {
  wrapper = await mountAfterSales(mocks, payload, propOverrides)
}

const button = (text: string) => findButton(wrapper!, text)

async function clickButton(text: string) {
  const target = button(text)
  expect(target, `按钮「${text}」应该存在`).toBeDefined()
  await target!.trigger('click')
  await flushPromises()
}

const hasForm = () => hasFormOn(wrapper!)
const submitButton = () => button('提交解除合作申请')

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('解除合作弹窗的窗口守卫', () => {
  it('窗口关闭且没有案件时不再给出发起表单，改为中文说明', async () => {
    await open({ windowOpen: false, windowClosesAt: '2026-09-18 00:13:13' })
    expect(hasForm()).toBe(false)
    expect(submitButton()).toBeUndefined()
    expect(wrapper!.text()).toContain('解除合作窗口已于 09/18 00:13 关闭')
    expect(wrapper!.text()).not.toContain('提交解除合作申请')
  })

  it('窗口关闭时间缺失时退化为通用措辞，不留空白提示', async () => {
    await open({ windowOpen: false, windowClosesAt: null })
    expect(hasForm()).toBe(false)
    expect(wrapper!.text()).toContain('本需求的解除合作窗口已关闭')
    expect(wrapper!.text()).not.toContain('时间未知')
  })

  it('窗口还开着时照旧渲染发起表单', async () => {
    await open({ windowOpen: true })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).not.toContain('不再受理新的解除合作申请')
  })

  it('窗口状态未知（老后端）时不拦发起表单，保留后端 409 兜底', async () => {
    await open({ windowOpen: null })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
  })

  it('动过钱的收口案件不再给发起表单，改为「联系客服重开」说明', async () => {
    // 退过钱 / 赔过钱的结案才是终态：说明里要写清是哪一笔，用户才知道为什么不能自助发起。
    await open({
      windowOpen: true,
      items: [
        caseWith('succeeded', {
          refundAmountFen: 2000,
          refundAmountCny: '20.00',
          providerRefundId: 'REF_1',
        }),
      ],
    })
    expect(hasForm()).toBe(false)
    expect(submitButton()).toBeUndefined()
    expect(wrapper!.text()).toContain('已有裁决结果的解除合作案件')
    expect(wrapper!.text()).toContain('退还客户已付款 20.00 元')
    expect(wrapper!.text()).toContain('联系平台客服重开')
  })

  it('认定但渠道没受理的资金不写成「已执行」：赔付留在「尚未执行」那一行', async () => {
    // 实测形态：退款已退（有渠道单号）、赔付卡在需求方缺结算账户（案件停在需人工处理）。
    // 案件行上两笔额度都已写好，但只有带渠道单号的那一笔算执行过。
    await open({
      windowOpen: true,
      items: [
        caseWith('manual_required', {
          refundAmountFen: 16000,
          refundAmountCny: '160.00',
          providerRefundId: 'REF_160',
          compensationAmountFen: 20000,
          compensationAmountCny: '200.00',
          claimAmountFen: 200000,
          claimAmountCny: '2000.00',
          shortfallFen: 164000,
          shortfallCny: '1640.00',
        }),
      ],
    })

    const factValue = (label: string) => {
      const row = wrapper!
        .findAll('.after-sales-modal__facts > div')
        .find((item) => item.find('dt').text() === label)
      return row ? row.find('dd').text() : undefined
    }

    expect(factValue('已执行资金')).toBe('退还客户已付款 160.00 元')
    expect(factValue('本次认定（尚未执行）')).toContain('保证金赔付 200.00 元')
    expect(factValue('本次认定（尚未执行）')).toContain('转人工')
    // 差额按已执行的那 160 元算，不能把没落地的 200 元也算成「已执行」。
    expect(factValue('诉求差额')).toContain('本次共执行 ¥160.00 元')
  })

  it('没动过钱的结案仍可自助重新发起：结论里没有钱可翻，表单照旧渲染', async () => {
    await open({ windowOpen: true, items: [caseWith('succeeded')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).toContain('上次解除合作')
  })

  it('已驳回的案件同样可以自助重新发起：驳回本就不执行资金', async () => {
    await open({ windowOpen: true, items: [caseWith('rejected')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
    expect(wrapper!.text()).not.toContain('联系平台客服重开')
  })

  it('已撤回的案件不算裁决结果：窗口内仍可重新发起，表单照旧渲染', async () => {
    await open({ windowOpen: true, items: [caseWith('withdrawn')] })
    expect(hasForm()).toBe(true)
    expect(submitButton()).toBeDefined()
  })

  it('窗口关闭但仍有在办案件时展示案件与表态，不显示关闭说明', async () => {
    await open({ windowOpen: false, items: [openCase] })
    expect(wrapper!.text()).toContain('AFTERSALES_1')
    expect(wrapper!.text()).not.toContain('不再受理新的解除合作申请')
    expect(hasForm()).toBe(false)
  })
})
