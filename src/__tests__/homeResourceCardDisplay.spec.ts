import { describe, expect, it } from 'vitest'

import type { PublicMcResourceItem } from '@/api/resources'
import {
  buildResourceCardSummary,
  buildResourceCoverAlt,
  compareSpotlightResources,
  resolveSpotlightCover,
  spotlightAuthorLabel,
  spotlightCategoryBadge,
  spotlightMarkFor,
  spotlightTagChips,
  summarizeResourceTags,
} from '@/shared/home/resourceCardDisplay'

/**
 * 首页「免费精选资源」卡片的展示层纯函数（R047 从 `views/HomeView.vue` 下沉）。
 *
 * 这个视图没有组件级测试，纯函数层是唯一的回归网：封面回退、角标映射、
 * 标签与 alt 的压平 / 去重 / 超长兜底、精选排序的全序与稳定性都压在这里。
 */

/** 只填展示层用得到的字段；其余字段与这些函数无关。 */
function resourceOf(overrides: Partial<PublicMcResourceItem> = {}): PublicMcResourceItem {
  return {
    id: 1,
    creator: 'alice',
    creator_avatar_url: null,
    requirement_id: null,
    platform: 'Minecraft',
    title: '局域网联机工具',
    author: 'alice',
    description: '  一键开服，  支持多版本  ',
    tag_selections: [],
    file_name: 'lan.jar',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-05T00:00:00.000Z',
    like_count: 0,
    download_count: 0,
    view_count: 0,
    liked_by_me: false,
    ownership_type: 'personal',
    team_id: null,
    team_name: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    purchased_by_me: false,
    ...overrides,
  } as PublicMcResourceItem
}

function tagSelection(groupPath: string[], tagNames: string[]) {
  return {
    group_id: 1,
    group_name: groupPath[0] ?? '',
    group_path: groupPath,
    tag_ids: [],
    tag_names: tagNames,
  }
}

describe('resolveSpotlightCover', () => {
  it('正常封面地址原样返回', () => {
    expect(resolveSpotlightCover('/uploads/a.png', new Set())).toBe('/uploads/a.png')
  })

  it('空值、空串与加载失败过的地址一律回空串（交给模板回落首字占位）', () => {
    const failed = new Set(['/uploads/broken.png'])

    expect(resolveSpotlightCover(null, failed)).toBe('')
    expect(resolveSpotlightCover(undefined, failed)).toBe('')
    expect(resolveSpotlightCover('', failed)).toBe('')
    expect(resolveSpotlightCover('/uploads/broken.png', failed)).toBe('')
  })
})

describe('spotlightMarkFor', () => {
  it('有效精选出「精选」角标', () => {
    expect(spotlightMarkFor({ is_featured: true })).toBe('精选')
  })

  it('非精选（含置顶与高赞）不出角标', () => {
    expect(spotlightMarkFor({ is_featured: false })).toBe('')
    expect(spotlightMarkFor({})).toBe('')
  })
})

describe('spotlightAuthorLabel', () => {
  it('优先 author，其次 creator', () => {
    expect(spotlightAuthorLabel(resourceOf({ author: 'bob', creator: 'alice' }))).toBe('bob')
    expect(spotlightAuthorLabel(resourceOf({ author: '', creator: 'alice' }))).toBe('alice')
  })

  it('两者都空时回落「匿名作者」', () => {
    expect(spotlightAuthorLabel(resourceOf({ author: '', creator: '' }))).toBe('匿名作者')
  })
})

describe('spotlightCategoryBadge', () => {
  it('优先取标签路径的二级品类', () => {
    const resource = resourceOf({
      tag_selections: [tagSelection(['客户端', 'Java 版'], ['Forge'])],
    })

    expect(spotlightCategoryBadge(resource)).toBe('Java 版')
  })

  it('路径只有一级时回落平台名', () => {
    const resource = resourceOf({
      platform: 'Minecraft',
      tag_selections: [tagSelection(['客户端'], ['Forge'])],
    })

    expect(spotlightCategoryBadge(resource)).toBe('Minecraft')
  })

  it('平台名为空且没有可用路径时给兜底文案', () => {
    expect(spotlightCategoryBadge(resourceOf({ platform: '   ' }))).toBe('平台资源')
  })
})

describe('spotlightTagChips', () => {
  it('去重后最多取 3 个标签，且压平多余空白', () => {
    const resource = resourceOf({
      tag_selections: [
        tagSelection(['客户端'], [' Forge ', 'Fabric', 'Forge']),
        tagSelection(['版本'], ['1.20', '1.21']),
      ],
    })

    expect(spotlightTagChips(resource)).toEqual(['Forge', 'Fabric', '1.20'])
  })

  it('没有标签时给空数组（模板据此隐藏 meta 行）', () => {
    expect(spotlightTagChips(resourceOf())).toEqual([])
    expect(spotlightTagChips(resourceOf({ tag_selections: [tagSelection([], ['  '])] }))).toEqual(
      [],
    )
  })
})

describe('summarizeResourceTags', () => {
  it('去重后取前 2 个，用「 / 」连接', () => {
    const resource = resourceOf({
      tag_selections: [
        tagSelection(['客户端'], ['Forge', 'Fabric']),
        tagSelection(['版本'], ['1.20']),
      ],
    })

    expect(summarizeResourceTags(resource)).toBe('Forge / Fabric')
  })

  it('无标签时是空串，不会留下多余分隔符', () => {
    expect(summarizeResourceTags(resourceOf())).toBe('')
  })
})

describe('buildResourceCardSummary', () => {
  it('描述里的换行与连续空格压成一行', () => {
    expect(
      buildResourceCardSummary(resourceOf({ description: '  一键开服，\n  支持多版本  ' })),
    ).toBe('一键开服， 支持多版本')
  })

  it('描述为空时用标题兜底成引导文案', () => {
    expect(buildResourceCardSummary(resourceOf({ description: '   ', title: '联机工具' }))).toBe(
      '联机工具，可在 73Info 免费资源区查看详情与下载。',
    )
  })

  it('标题也空时用站点名兜底', () => {
    expect(buildResourceCardSummary(resourceOf({ description: '', title: '  ' }))).toBe(
      '73Info 免费资源，可在 73Info 免费资源区查看详情与下载。',
    )
  })
})

describe('buildResourceCoverAlt', () => {
  it('带上平台与标签分类', () => {
    const resource = resourceOf({
      platform: 'Minecraft',
      title: '联机工具',
      tag_selections: [tagSelection(['客户端'], ['Forge'])],
    })

    expect(buildResourceCoverAlt(resource)).toBe('联机工具 的资源封面图，分类为 Minecraft、Forge')
  })

  it('没有平台也没有标签时只留标题', () => {
    expect(buildResourceCoverAlt(resourceOf({ platform: '  ', title: '联机工具' }))).toBe(
      '联机工具 的资源封面图',
    )
  })

  it('超长标题不截断（alt 要给读屏完整信息）', () => {
    const longTitle = '如'.repeat(120)

    expect(buildResourceCoverAlt(resourceOf({ title: longTitle }))).toContain(longTitle)
  })
})

describe('compareSpotlightResources', () => {
  it('有效精选优先于非精选（哪怕点赞更少）', () => {
    const featured = resourceOf({ id: 1, is_featured: true, like_count: 0 })
    const hot = resourceOf({ id: 2, is_featured: false, like_count: 99 })

    expect([hot, featured].sort(compareSpotlightResources).map((item) => item.id)).toEqual([1, 2])
  })

  it('同为精选时有效置顶在前', () => {
    const pinned = resourceOf({ id: 1, is_featured: true, is_pinned: true })
    const plain = resourceOf({ id: 2, is_featured: true, is_pinned: false })

    expect([plain, pinned].sort(compareSpotlightResources).map((item) => item.id)).toEqual([1, 2])
  })

  it('同档位按点赞数倒序', () => {
    const few = resourceOf({ id: 1, like_count: 3 })
    const many = resourceOf({ id: 2, like_count: 8 })

    expect([few, many].sort(compareSpotlightResources).map((item) => item.id)).toEqual([2, 1])
  })

  it('点赞相同按更新时间倒序', () => {
    const older = resourceOf({ id: 1, updated_at: '2026-03-01T00:00:00.000Z' })
    const newer = resourceOf({ id: 2, updated_at: '2026-03-09T00:00:00.000Z' })

    expect([older, newer].sort(compareSpotlightResources).map((item) => item.id)).toEqual([2, 1])
  })

  it('全部相同时按 id 倒序，保证全序（排序结果可复现）', () => {
    const a = resourceOf({ id: 1 })
    const b = resourceOf({ id: 2 })

    expect(compareSpotlightResources(a, b)).toBeGreaterThan(0)
    expect(compareSpotlightResources(b, a)).toBeLessThan(0)
    expect(compareSpotlightResources(a, a)).toBe(0)
  })

  it('非法更新时间的资源当 0 处理，不会把整组顺序打乱成 NaN', () => {
    const broken = resourceOf({ id: 1, updated_at: '不是时间' })
    const normal = resourceOf({ id: 2, updated_at: '2026-03-09T00:00:00.000Z' })

    const sorted = [broken, normal].sort(compareSpotlightResources)

    expect(Number.isNaN(compareSpotlightResources(broken, normal))).toBe(false)
    expect(sorted.map((item) => item.id)).toEqual([2, 1])
  })

  it('混合场景下输出固定顺序：精选 → 置顶 → 点赞 → 时间 → id', () => {
    const items = [
      resourceOf({ id: 5, like_count: 1 }),
      resourceOf({ id: 4, is_featured: true, is_pinned: true }),
      resourceOf({ id: 3, like_count: 9 }),
      resourceOf({ id: 2, is_featured: true, is_pinned: false, like_count: 2 }),
    ]

    expect(items.sort(compareSpotlightResources).map((item) => item.id)).toEqual([4, 2, 3, 5])
  })
})
