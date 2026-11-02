/**
 * 门户资源卡片的展示统计：浏览 / 下载 / 点赞数，以及精选、置顶标记。
 *
 * 契约里这几个字段由后端 query-time 算（`PublicMcResourceItem` 的 `view_count` /
 * `download_count` / `like_count` / `is_featured` / `is_pinned`），mock 没有真数据。
 * 原来统一回「浏览 0、下载 12、点赞 0」，首页卡片一眼看去像坏数据，
 * 这里按资源 id 给一份固定值，卡片上的数字与角标才有真实站点的样子。
 *
 * 键是资源 id；没有收录的资源按 `toPublicResource` 的缺省值走。
 */
export type MockResourcePortalInfo = {
  view_count: number
  download_count: number
  like_count: number
  /** 精选：卡片右上角出「精选」角标 */
  is_featured?: boolean
  /** 置顶：排序时排在普通资源之前，卡片不出角标 */
  is_pinned?: boolean
}

export const mcResourcePortalInfo: Record<number, MockResourcePortalInfo> = {
  9001: { view_count: 1284, download_count: 96, like_count: 42, is_featured: true },
  9002: { view_count: 862, download_count: 74, like_count: 31 },
  9003: { view_count: 1543, download_count: 118, like_count: 57, is_featured: true },
  9005: { view_count: 476, download_count: 38, like_count: 12 },
  9006: { view_count: 931, download_count: 63, like_count: 26, is_pinned: true },
  9007: { view_count: 658, download_count: 52, like_count: 19 },
  9008: { view_count: 312, download_count: 21, like_count: 8 },
  9009: { view_count: 547, download_count: 44, like_count: 15 },
  9010: { view_count: 289, download_count: 17, like_count: 6 },
  9011: { view_count: 423, download_count: 29, like_count: 11 },
  9012: { view_count: 736, download_count: 57, like_count: 23 },
  9013: { view_count: 389, download_count: 33, like_count: 14 },
  9014: { view_count: 214, download_count: 12, like_count: 5 },
}
