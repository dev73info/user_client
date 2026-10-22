import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PublicMcResourceVersionItem } from '@/api/resources'
import ResourceVersionList from '@/components/resource-detail/ResourceVersionList.vue'

/**
 * 历史版本列表（R047 从 `ResourceDetailPanel` 拆出的第一块）。
 *
 * 拆分的风险点全在「出口」上：这一块不再自己发请求、也不自己开购买弹窗，
 * 下载只往上抛一次。所以这里钉两件事——版本照常渲染（含补充说明走富文本管线），
 * 以及点「下载」只 emit 一次、把这条版本原样带上去。
 */
const versions: PublicMcResourceVersionItem[] = [
  {
    id: 11,
    resource_id: 7,
    version: 'v1.2',
    resource: '/uploads/redstone-v1.2.zip',
    note: '修复了 **红石时钟** 偶发停摆',
    creator: 'alice',
    created_at: '2026-02-02 10:00:00',
  },
  {
    id: 10,
    resource_id: 7,
    version: 'v1.1',
    resource: '/uploads/redstone-v1.1.zip',
    note: null,
    creator: 'alice',
    created_at: '2026-01-20 10:00:00',
  },
]

function mountList(props: Record<string, unknown> = {}) {
  return mount(ResourceVersionList, {
    props: {
      versions,
      resourceId: 7,
      resourceFileName: '红石整合包.zip',
      needsPurchase: false,
      ...props,
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ResourceVersionList', () => {
  it('渲染每条版本，补充说明走富文本管线（Markdown 的粗体变成 <strong>）', () => {
    const wrapper = mountList()

    const cards = wrapper.findAll('.resource-detail-page__version-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('v1.2')

    // 第一条有说明：渲染成真元素，而不是把 `**` 原样吐出来
    expect(cards[0]?.get('.resource-detail-page__version-note').find('strong').text()).toBe(
      '红石时钟',
    )
    // 第二条没有说明：走空态文案
    expect(cards[1]?.text()).toContain('当前版本暂无补充说明。')
  })

  it('点「下载」只 emit 一次，并把这条版本原样带上去', async () => {
    const wrapper = mountList()

    await wrapper.findAll('.resource-detail-page__version-download')[1]?.trigger('click')

    expect(wrapper.emitted('download')).toHaveLength(1)
    expect(wrapper.emitted('download')?.[0]?.[0]).toMatchObject({ id: 10, version: 'v1.1' })
  })

  it('需要先购买时按钮改文案，且下载仍由父级拦（本组件不自己判断）', async () => {
    const wrapper = mountList({ needsPurchase: true })

    const button = wrapper.get('.resource-detail-page__version-download')
    expect(button.text()).toBe('购买后下载')

    await button.trigger('click')
    expect(wrapper.emitted('download')).toHaveLength(1)
  })
})
