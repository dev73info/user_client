import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DevResourceTable from '@/components/dev/DevResourceTable.vue'
import TeamResourcesTable from '@/components/dev/TeamResourcesTable.vue'
import { resourceVisibilityView } from '@/shared/devHomeDisplay'
import { resourceFixture } from './devResourceHomepageFixtures'

const stubs = {
  TTable: {
    name: 'TTable',
    props: ['data'],
    provide(this: { data: unknown[] }) {
      return { rows: this.data }
    },
    template: '<div><slot /></div>',
  },
  TTableColumn: {
    name: 'TTableColumn',
    inject: ['rows'],
    computed: {
      row(this: { rows: unknown[] }): unknown {
        return this.rows[0]
      },
    },
    template: '<div><slot :row="row" /></div>',
  },
  TDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
  TDropdownMenu: { template: '<div><slot /></div>' },
  TDropdownItem: {
    name: 'TDropdownItem',
    props: ['command', 'disabled'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
  TButton: { template: '<button type="button"><slot /></button>' },
  TIcon: { template: '<span><slot /></span>' },
  TTag: { template: '<span><slot /></span>' },
}

function mountRejectedTable(component: typeof DevResourceTable | typeof TeamResourcesTable) {
  return shallowMount(component, {
    props: {
      rows: [resourceFixture({ visibility: 'rejected', copyright_declared: true })],
      loading: false,
      emptyText: '',
      requestingReviewId: null,
      settingPrivateId: null,
      deletingId: null,
      coverUrl: () => '',
    },
    global: { stubs },
  })
}

describe('资源驳回后的重新送审入口', () => {
  it.each([
    ['个人资源', DevResourceTable],
    ['团队资源', TeamResourcesTable],
  ])('%s显示重新申请公开', (_label, component) => {
    const wrapper = mountRejectedTable(component)
    const actions = wrapper
      .findAllComponents({ name: 'TDropdownItem' })
      .filter((item) => item.props('command')?.action === 'request-review')

    expect(actions).toHaveLength(1)
    expect(actions[0]!.text()).toContain('重新申请公开')
    wrapper.unmount()
  })

  it('绑定需求且未 claim 的定制资源：申请公开禁用；claim 后恢复', () => {
    const unclaimed = shallowMount(DevResourceTable, {
      props: {
        rows: [
          resourceFixture({
            visibility: 'rejected',
            copyright_declared: true,
            requirement_id: '2026-1',
            requirement_claimed: false,
          }),
        ],
        loading: false,
        emptyText: '',
        requestingReviewId: null,
        settingPrivateId: null,
        deletingId: null,
        coverUrl: () => '',
      },
      global: { stubs },
    })
    const unclaimedAction = unclaimed
      .findAllComponents({ name: 'TDropdownItem' })
      .find((item) => item.props('command')?.action === 'request-review')
    expect(unclaimedAction?.props('disabled')).toBe(true)
    unclaimed.unmount()

    const claimed = shallowMount(DevResourceTable, {
      props: {
        rows: [
          resourceFixture({
            visibility: 'rejected',
            copyright_declared: true,
            requirement_id: '2026-1',
            requirement_claimed: true,
          }),
        ],
        loading: false,
        emptyText: '',
        requestingReviewId: null,
        settingPrivateId: null,
        deletingId: null,
        coverUrl: () => '',
      },
      global: { stubs },
    })
    const claimedAction = claimed
      .findAllComponents({ name: 'TDropdownItem' })
      .find((item) => item.props('command')?.action === 'request-review')
    expect(claimedAction?.props('disabled')).toBe(false)
    claimed.unmount()
  })

  it('「我的资源」收窄动作后不出现售出订单 / 过户 / 删除', () => {
    const wrapper = shallowMount(DevResourceTable, {
      props: {
        rows: [resourceFixture({ visibility: 'draft' })],
        loading: false,
        emptyText: '',
        requestingReviewId: null,
        settingPrivateId: null,
        deletingId: null,
        coverUrl: () => '',
        visibleActions: ['publish', 'request-review', 'set-private', 'versions'],
      },
      global: { stubs },
    })
    const actions = wrapper
      .findAllComponents({ name: 'TDropdownItem' })
      .map((item) => item.props('command')?.action)
      .filter(Boolean)
    expect(actions).toEqual(expect.arrayContaining(['publish', 'request-review', 'versions']))
    expect(actions).not.toContain('sold-orders')
    expect(actions).not.toContain('transfer')
    expect(actions).not.toContain('delete')
    wrapper.unmount()
  })
})

describe('总览中的驳回状态', () => {
  it('统一显示为已驳回', () => {
    expect(resourceVisibilityView('rejected')).toEqual({ label: '已驳回', tone: 'gold' })
  })
})
