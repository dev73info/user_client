import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { PublicMcResourceItem } from '@/api/resources'
import { mapResourceToCard } from '@/components/resource-catalog/resourceCatalogModel'
import { mapResourceToCard as mapMobileResourceToCard } from '@/components/mobile-resource/mobileResourceModel'
import { useResourceCatalogFiltering } from '@/composables/useResourceCatalogFiltering'
import { isCashPaidListingResource, isFreeListingResource } from '@/shared/resourceSale'

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

describe('按版本售卖的资源卡片', () => {
  it('资源级定价为 0、版本有价时显示「¥x 起」并归入付费厅', () => {
    const item = resourceWithDuplicateGroupNames()
    item.min_version_price_fen = 1

    const card = mapResourceToCard(item)
    expect(card.minVersionPriceFen).toBe(1)
    expect(card.priceLabel).toBe('¥0.01 起')
    expect(
      isCashPaidListingResource(card.priceFen, card.pricePoints, card.minVersionPriceFen),
    ).toBe(true)
    expect(isFreeListingResource(card.priceFen, card.pricePoints, card.minVersionPriceFen)).toBe(
      false,
    )

    expect(mapMobileResourceToCard(item).priceLabel).toBe('¥0.01 起')
  })

  it('买断价资源保持原标价，不受版本价影响', () => {
    const item = { ...resourceWithDuplicateGroupNames(), buyout_price_fen: 990 }
    item.min_version_price_fen = 1
    expect(mapResourceToCard(item).priceLabel).toBe('¥9.90')
    expect(
      isCashPaidListingResource(item.buyout_price_fen, item.price_points, 1),
    ).toBe(true)
  })
})
