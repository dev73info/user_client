import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 验收弹窗必须按**契约形状**渲染留档：`AcceptanceListResponse` 是
 * `{ requirement_id, items[], history[] }`，`history` 项是 snake_case
 * （`id / result / result_label / basis / basis_label / actor / note / recorded_at`）。
 *
 * 这条用例是针对一次真实缺陷加的：早前把列表当成数组、字段写成
 * `submittedBy` / `createdAt` / `resourceVersion`，弹窗于是渲染出 3 条空记录、
 * 打回理由一个字都不显示。断言点钉在「理由要出现」「条数要对」上。
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@/api/requirements', () => ({
  listRequirementAcceptances: mocks.list,
  submitRequirementAcceptance: mocks.submit,
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    TMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const { default: AcceptanceDialog } = await import('@/components/AcceptanceDialog.vue')

function renderDialog() {
  return mount(AcceptanceDialog, {
    props: {
      // 弹窗用 watch(props.visible) 触发出数，挂载时就得是 false 再打开。
      visible: false,
      token: 'tk',
      requirementId: 'R-1',
      requirementTitle: '某需求',
    },
    global: { stubs: { Teleport: true } },
  })
}

describe('AcceptanceDialog 历史留档', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.submit.mockReset()
  })

  it('按契约 history 渲染：打回理由与提交人都要出现', async () => {
    mocks.list.mockResolvedValue({
      requirement_id: 'R-1',
      items: [],
      history: [
        {
          id: 7,
          result: 'rejected',
          result_label: '打回',
          basis: 'manual',
          basis_label: '人工验收',
          actor: 'client_flow_03562487',
          note: '接口没按文档实现',
          recorded_at: '2026-10-24 15:00:00',
        },
      ],
    })

    const wrapper = renderDialog()
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('接口没按文档实现')
    expect(html).toContain('client_flow_03562487')
    expect(html).toContain('验收不通过')
    expect(html).toContain('共 1 条')
    // 契约里没有 2.0 的交付版本字段，不该再渲染「交付版本」
    expect(html).not.toContain('交付版本')
  })

  it('空 history 显示空态，不是渲染出若干条假记录', async () => {
    mocks.list.mockResolvedValue({ requirement_id: 'R-1', items: [], history: [] })

    const wrapper = renderDialog()
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('暂无验收记录')
    expect(wrapper.findAll('.acceptance-modal__records li')).toHaveLength(0)
  })

  it('响应缺 history 字段时不炸（后端老版本兼容）', async () => {
    mocks.list.mockResolvedValue({ requirement_id: 'R-1', items: [] })

    const wrapper = renderDialog()
    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(wrapper.html()).toContain('暂无验收记录')
  })
})
