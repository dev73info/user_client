/**
 * 资源标签树的假数据（契约 `TagGroupResponse[]`）。
 *
 * 门户资源页的「专区 / 二级分区」页签与左侧筛选分区都从这棵树算出来（经 tags-wasm 的
 * `process_tags`）。原来这里回 `[]`：顶部选不到专区、列表拿一个不存在的分区去过滤，
 * 于是永远「共 0 个」——而「我的资源」页明明有 4 个资源，其中 3 个已发布。
 *
 * 层级是两层：根 = 专区，子 = 二级分区。**二级分区的 `name` 必须与资源的 `platform` 逐字一致**，
 * 列表就是拿它去过滤的；根分区的 `alias` 必须是 `resources`，门户的 `/resources` 路由按它定位。
 */

import type { components } from '@/api/generated/schema'

type TagGroup = components['schemas']['TagGroupResponse']

function group(
  id: number,
  name: string,
  alias: string,
  sortOrder: number,
  childGroups: TagGroup[] = [],
  items: TagGroup['items'] = [],
): TagGroup {
  return {
    id,
    name,
    alias,
    sort_order: sortOrder,
    parent_group_id: null,
    child_groups: childGroups,
    items,
  }
}

/** 二级分区下面再挂一层标签分组，页面左侧的筛选分区就从这里来。 */
export function mockTagGroups(): TagGroup[] {
  const toolTags = group(1201, '类型', 'type', 0, [], [
    { id: 1301, group_id: 1201, name: '效率工具', alias: 'efficiency', sort_order: 0 },
    { id: 1302, group_id: 1201, name: '数据同步', alias: 'data-sync', sort_order: 1 },
    { id: 1303, group_id: 1201, name: '连接器', alias: 'connector', sort_order: 2 },
  ])

  const toolEntry = group(1200, '自研工具', 'zizhu-gongju', 0, [toolTags], [])

  const root = group(1100, '资源项目', 'resources', 0, [toolEntry], [])

  // 子分区的 parent_group_id 要指回父级，tags-wasm 靠它区分根与子。
  toolEntry.parent_group_id = root.id
  toolTags.parent_group_id = toolEntry.id

  return [root]
}
