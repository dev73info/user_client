import type { PublicMcResourceItem } from '@/api/resources'
import type { McProcessedTagTree } from '@/api/resourceTags'

/**
 * 首页精选资源区两份用例（`homeSpotlightSection` / `homeSpotlightComposables`）共用的夹具。
 *
 * 放在单独文件而不是各抄一份：`PublicMcResourceItem` 字段多，两份夹具一旦漂移，
 * 「同一份资源在卡片与 composable 里表现一致」这句话就不成立了。
 */

/** 一条「每格都填过」的已发布资源；传 `id` 必填，其余按需覆盖。 */
export function publicResourceFixture(
  part: Partial<PublicMcResourceItem> & { id: number },
): PublicMcResourceItem {
  return {
    creator: 'alice',
    requirement_id: null,
    platform: 'Minecraft',
    title: `资源 ${part.id}`,
    author: 'alice',
    description: '一个用来测渲染的资源',
    tag_selections: [],
    file_name: 'pack.zip',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
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
    ...part,
  }
}

/**
 * 一棵最小标签树：一个根、两个入口（`Minecraft` / `手绘`）。
 * 用来验 `resolveResourceRoute` 的「按 platform 命中」和「命中不到用第一组兜底」。
 */
export function tagTreeCatalogFixture(): McProcessedTagTree {
  return {
    roots: [
      {
        key: 'game',
        label: '游戏',
        first_entry_key: 'mc',
        entries: [
          {
            key: 'mc',
            platform: 'Minecraft',
            label: '游戏 / Minecraft',
            group_name: 'Minecraft',
            path_label: '游戏 / Minecraft',
            icon: '',
            publish_groups: [],
          },
          {
            key: 'draw',
            platform: '手绘',
            label: '游戏 / 手绘',
            group_name: '手绘',
            path_label: '游戏 / 手绘',
            icon: '',
            publish_groups: [],
          },
        ],
      },
    ],
  }
}
