import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DevResourceTable from '@/components/dev/DevResourceTable.vue'
import TeamResourcesTable from '@/components/dev/TeamResourcesTable.vue'
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
    props: ['command'],
    template: '<button type="button"><slot /></button>',
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
})
