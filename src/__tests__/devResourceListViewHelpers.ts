import { shallowMount, type VueWrapper } from '@vue/test-utils'

import type { McResourcePayload } from '@/api/mcResources'
import DevResourceListView from '@/views/DevResourceListView.vue'
import { resourceFixture } from './devResourceHomepageFixtures'

export function resourceRows(): McResourcePayload[] {
  const own = Array.from({ length: 12 }, (_, index) =>
    resourceFixture({
      id: 1000 + index,
      ownership_type: 'individual',
      title: `示例资源 ${index}`,
      description: `第 ${index} 份资源简介`,
      visibility: index < 3 ? 'published' : index < 9 ? 'draft' : 'review',
    }),
  )

  return [...own, resourceFixture({ id: 2000, ownership_type: 'team', title: '团队资源' })]
}

export function mountList(): VueWrapper {
  return shallowMount(DevResourceListView, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        TCard: { name: 'TCard', template: '<div><slot /></div>' },
        DevResourceTable: {
          name: 'DevResourceTable',
          props: [
            'rows',
            'loading',
            'emptyText',
            'requestingReviewId',
            'settingPrivateId',
            'deletingId',
            'coverUrl',
            'versionPrices',
          ],
          template: '<div />',
        },
      },
    },
  })
}

type ListState = {
  resources: McResourcePayload[]
  filters: { keyword: string; visibility: string }
  page: number
  pageSize: number
  paged: McResourcePayload[]
  totalCount: number
  openEditHomepagePage: (resource: McResourcePayload) => void
  handleResourceCommand: (payload: { action: string; resource: McResourcePayload }) => void
}

export function state(wrapper: VueWrapper): ListState {
  return (wrapper.vm.$ as unknown as { setupState: ListState }).setupState
}

export function table(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: 'DevResourceTable' })
}
