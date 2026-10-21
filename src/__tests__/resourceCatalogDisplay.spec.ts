import { describe, expect, it } from 'vitest'

import type { McProcessedTagTree, McTagCatalogRoot } from '@/api/resourceTags'
import {
  CATALOG_MOBILE_MAX_WIDTH,
  buildCatalogPageNumbers,
  isCatalogMobileWidth,
  parseResourceIdParam,
  resolveCatalogRoot,
  withSaleQuery,
  withoutSelectionQuery,
} from '@/shared/resourceCatalogDisplay'

/** 只填判定用得到的字段：entries 非空即「这个专区点了有内容」。 */
function rootOf(overrides: Partial<McTagCatalogRoot> = {}): McTagCatalogRoot {
  return {
    key: 'plugins',
    label: '插件',
    first_entry_key: 'paper',
    entries: [
      {
        key: 'paper',
        platform: 'paper',
        label: 'Paper',
        group_name: 'Paper',
        path_label: 'Paper',
        icon: '',
        publish_groups: [],
      },
    ],
    ...overrides,
  }
}

describe('buildCatalogPageNumbers', () => {
  it('单页不给页码胶囊', () => {
    expect(buildCatalogPageNumbers(1, 1)).toEqual([])
    expect(buildCatalogPageNumbers(1, 0)).toEqual([])
  })

  it('七页以内逐页列出', () => {
    expect(buildCatalogPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('页数多时只留首尾与当前附近，空档用「…」收口', () => {
    expect(buildCatalogPageNumbers(5, 12)).toEqual([1, '…', 4, 5, 6, '…', 12])
  })

  it('首尾页不产生多余的「…」', () => {
    expect(buildCatalogPageNumbers(1, 12)).toEqual([1, 2, '…', 12])
    expect(buildCatalogPageNumbers(12, 12)).toEqual([1, '…', 11, 12])
  })
})

describe('parseResourceIdParam', () => {
  it('接受数字串与数组首项', () => {
    expect(parseResourceIdParam('42')).toBe(42)
    expect(parseResourceIdParam(['42', '43'])).toBe(42)
  })

  it('缺省 / 非正整数一律当作未选中', () => {
    expect(parseResourceIdParam(undefined)).toBeNull()
    expect(parseResourceIdParam('')).toBeNull()
    expect(parseResourceIdParam('0')).toBeNull()
    expect(parseResourceIdParam('-3')).toBeNull()
    expect(parseResourceIdParam('abc')).toBeNull()
  })
})

describe('resolveCatalogRoot', () => {
  const empty = rootOf({ key: 'empty', label: '空专区', first_entry_key: null, entries: [] })
  const plugins = rootOf({ key: 'plugins', label: '插件' })

  it('地址上的 rootSlug 认得出来就用它', () => {
    const tree: McProcessedTagTree = { roots: [empty, plugins] }
    expect(resolveCatalogRoot(tree, 'plugins')?.key).toBe('plugins')
  })

  it('rootSlug 认不出来时退回第一个有子分区的专区', () => {
    const tree: McProcessedTagTree = { roots: [empty, plugins] }
    expect(resolveCatalogRoot(tree, '')?.key).toBe('plugins')
    expect(resolveCatalogRoot(tree, 'unknown')?.key).toBe('plugins')
  })

  it('全是没有子分区的专区时退回第一档，空树给 null', () => {
    expect(resolveCatalogRoot({ roots: [empty] }, '')?.key).toBe('empty')
    expect(resolveCatalogRoot({ roots: [] }, '')).toBeNull()
  })
})

describe('query 改写', () => {
  it('withSaleQuery 保留原 query 并写入分区', () => {
    expect(withSaleQuery({ resource: '7' }, 'paid')).toEqual({ resource: '7', sale: 'paid' })
  })

  it('withoutSelectionQuery 摘掉 resource 与推广码，其余原样保留', () => {
    expect(withoutSelectionQuery({ resource: '7', promo: 'A1', sale: 'free' })).toEqual({
      sale: 'free',
    })
  })
})

describe('isCatalogMobileWidth', () => {
  it('900px 及以下走移动端', () => {
    expect(isCatalogMobileWidth(CATALOG_MOBILE_MAX_WIDTH)).toBe(true)
    expect(isCatalogMobileWidth(CATALOG_MOBILE_MAX_WIDTH + 1)).toBe(false)
  })
})
