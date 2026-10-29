import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceItem } from '@/api/resources'
import { mapResourceToCard } from '@/components/resource-catalog/resourceCatalogModel'
import { mapResourceToCard as mapMobileResourceToCard } from '@/components/mobile-resource/mobileResourceModel'
import { useResourceCatalogFiltering } from '@/composables/useResourceCatalogFiltering'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

function resourceWithDuplicateGroupNames(): PublicMcResourceItem {
  return {
    id: 1,
    creator: 'dev',
    creator_avatar_url: null,
    requirement_id: null,
    platform: 'web',
    title: '四层标签资源',
    author: 'dev',
    description: '',
    tag_selections: [
      {
        group_id: 31,
        group_name: '方向',
        group_path: ['资源项目', 'web', '前端', '方向'],
        group_path_aliases: ['resources', 'web', 'frontend', 'direction'],
        tag_ids: [311],
        tag_names: ['客户端'],
        tag_aliases: ['client'],
      },
      {
        group_id: 32,
        group_name: '方向',
        group_path: ['资源项目', 'web', '后端', '方向'],
        group_path_aliases: ['resources', 'web', 'backend', 'direction'],
        tag_ids: [321],
        tag_names: ['服务端'],
        tag_aliases: ['server'],
      },
    ],
    file_name: 'demo.zip',
    source_url: 'https://example.com/demo.zip',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    created_at: '2026-10-29 12:00:00',
    updated_at: '2026-10-29 12:00:00',
    like_count: 0,
    download_count: 0,
    view_count: 0,
    liked_by_me: false,
    ownership_type: 'individual',
    team_id: null,
    team_name: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    purchased_by_me: false,
  }
}

describe('资源目录四层标签筛选', () => {
  it('同名分组按 group_id 区分，不互相覆盖标签', () => {
    const scope = effectScope()
    const filtering = scope.run(() =>
      useResourceCatalogFiltering({
        getListingMode: () => 'free',
      }),
    )

    if (!filtering) {
      throw new Error('资源目录筛选 composable 未初始化')
    }

    filtering.cards.value = [mapResourceToCard(resourceWithDuplicateGroupNames())]
    filtering.filterSections.value = [
      {
        id: 31,
        label: '方向',
        queryKey: 'group_31',
        tags: ['客户端'],
        selected: ['客户端'],
      },
      {
        id: 32,
        label: '方向',
        queryKey: 'group_32',
        tags: ['服务端'],
        selected: [],
      },
    ]

    expect(filtering.filteredCards.value.map((card) => card.id)).toEqual([1])
    expect(mapMobileResourceToCard(resourceWithDuplicateGroupNames()).groupTagsById).toMatchObject({
      31: ['客户端'],
      32: ['服务端'],
    })
    scope.stop()
  })
})
