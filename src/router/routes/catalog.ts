/**
 * 资源目录与详情的地址族，以及最后的兜底路由。
 *
 * 这三条历史详情地址只做轻量重定向，真正渲染在 `ResourceCatalogView` 的页内详情态；
 * 兜底路由必须排在最后（前面的 `/:rootSlug/:entrySlug?` 是按段数贪婪匹配的）。
 */
import type { RouteRecordRaw } from 'vue-router'

export const resourceCatalogRoutes: RouteRecordRaw[] = [
  {
    // 独立资源详情页已废弃：详情在资源列表页内就地渲染（`?resource=<id>`，见 ResourceCatalogView）。
    // 这条地址保留为轻量重定向（旧链接 / 站外链接 / sitemap 详情页的 JS 引导），
    // 解析出资源编号后 replace 到页内详情态，任何历史地址都不 404。
    path: '/resources/:resourceSlug',
    name: 'resource-detail-direct',
    component: () => import('@/views/ResourceDetailRedirectView.vue'),
  },
  {
    path: '/:rootSlug/:entrySlug?',
    name: 'resource-catalog',
    component: () => import('@/views/ResourceCatalogView.vue'),
  },
  {
    // 三段式旧详情地址（`/<根分区>/<子分区>/<作者>--<id>`）同样只做重定向：
    // 分类段沿用地址里的，重定向时补上 `?resource=`（售卖类型按资源自身数据推）。
    path: '/:rootSlug/:entrySlug/:resourceSlug',
    name: 'resource-detail',
    component: () => import('@/views/ResourceDetailRedirectView.vue'),
  },
  {
    // 兜底路由：匹配不到任何路由的地址落到这里，渲染「页面不存在」而不是只剩页头页脚的空壳
    // （见 任务/缺陷/BUG-009）。必须放在路由表最后：前面的 `/:rootSlug/:entrySlug?` 与
    // `/:rootSlug/:entrySlug/:resourceSlug` 是按段数贪婪匹配的，放在它们之前会把正常页面一起吃掉。
    //
    // 覆盖范围只有「任何上表路由都匹配不上」的地址，主要是四段及以上的路径（例如沿用了旧式
    // 的四段资源链接）。一至三段的未知路径仍会先被上面两条目录 / 详情路由接走。
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]
