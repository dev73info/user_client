import type { CommunityPost, CommunityTag } from '@/api/community'

import { DEV_USERNAME, datetime } from '../../db/shared'
import { currentMockProfile } from '../../identity'
import { nowText } from '../common/helpers'

const COMMUNITY_TAG_NAMES = [
  '示例',
  '前端',
  'Vue',
  '后端',
  'Rust',
  'UI设计',
  '数据同步',
  '数据库',
  '测试',
  '效率工具',
]

export const communityTags: CommunityTag[] = COMMUNITY_TAG_NAMES.map((name, index) => ({
  id: index + 1,
  name,
}))

function communityTag(name: string): CommunityTag {
  const found = communityTags.find((item) => item.name === name)
  if (!found) throw new Error(`未登记的社区标签：${name}`)
  return found
}

type CommunityPostSeed = Omit<Partial<CommunityPost>, 'id' | 'title' | 'content_html' | 'tags'> & {
  id: number
  title: string
  content_html: string
  tagNames?: string[]
}

function communityPost(seed: CommunityPostSeed): CommunityPost {
  const { tagNames = [], ...rest } = seed
  const timestamp = datetime(-seed.id, 9 + (seed.id % 8), (seed.id * 7) % 60)
  return {
    author: currentMockProfile().username,
    author_avatar_url: null,
    author_username_gradient: false,
    author_username_color: null,
    status: 'published',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    favorited_by_me: false,
    published_at: timestamp,
    updated_at: timestamp,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    bounty_points: 0,
    bounty_status: 'none',
    bounty_accepted_comment_id: null,
    is_featured: false,
    featured_at: null,
    bumped_at: null,
    highlight_until: null,
    homepage_until: null,
    section_until: null,
    hot_until: null,
    ...rest,
    tags: tagNames.map(communityTag),
  }
}

export const communityPosts: CommunityPost[] = [
  communityPost({
    id: 1,
    title: '社区示例帖',
    content_html: '<p>Mock 社区数据</p>',
    tagNames: ['示例'],
    comment_count: 18,
    published_at: nowText(),
    updated_at: nowText(),
  }),
  communityPost({
    id: 2,
    title: 'Vue 3 长列表滚动卡顿排查记录',
    content_html:
      '<p>把 2000 行表格从一次性渲染改成虚拟滚动后，首屏时间从 2.4s 降到 380ms。记录一下定位过程与几个容易踩的坑。</p>',
    tagNames: ['前端', 'Vue'],
    is_featured: true,
    featured_at: datetime(-3, 11, 20),
    like_count: 12,
    comment_count: 2,
  }),
  communityPost({
    id: 3,
    title: 'Axum 里做 SSE 推送的几个坑',
    content_html:
      '<p>心跳、断线重连、代理缓冲和连接数上限，任何一个没处理好都会让页面看起来「偶尔不更新」。</p>',
    tagNames: ['后端', 'Rust'],
    is_featured: true,
    featured_at: datetime(-4, 9, 10),
    like_count: 9,
    comment_count: 1,
  }),
  communityPost({
    id: 4,
    title: '工作台信息密度的取舍',
    content_html:
      '<p>概览页不是把所有指标都摆上去，而是先回答「今天要做什么」。这次重排删掉了三块低价值读数。</p>',
    tagNames: ['UI设计'],
    like_count: 6,
  }),
  communityPost({
    id: 5,
    author: DEV_USERNAME,
    title: 'Shopify 订单增量同步方案',
    content_html:
      '<p>用 updated_at 游标加 webhook 双保险，避免漏单；库存同步则按 SKU 聚合后再批量写入。</p>',
    tagNames: ['数据同步'],
    like_count: 8,
  }),
  communityPost({
    id: 6,
    author: DEV_USERNAME,
    title: '求一个 PostgreSQL 慢查询排查思路',
    content_html:
      '<p>一张 800 万行的订单表，按状态 + 时间范围查询经常超过 2 秒，除了加联合索引还有哪些方向？</p>',
    tagNames: ['数据库'],
    bounty_points: 100,
    bounty_status: 'active',
    like_count: 4,
  }),
  communityPost({
    id: 7,
    title: '用 Playwright 做表单回归的收益',
    content_html:
      '<p>把发布需求、签署合同、上传交付物三条主链路固化后，每次发版前能省下半天手工点测。</p>',
    tagNames: ['测试', '效率工具'],
    like_count: 7,
  }),
  communityPost({
    id: 8,
    title: '需求大厅卡片信息层级复盘',
    content_html:
      '<p>标题、预算、担保方式和更新时间四类信息的优先级，决定了用户第一眼能不能判断「这单值不值得看」。</p>',
    tagNames: ['UI设计', '前端'],
    is_featured: true,
    featured_at: datetime(-2, 15, 30),
    like_count: 15,
  }),
  communityPost({
    id: 9,
    title: '企业微信侧边栏接入踩坑',
    content_html:
      '<p>本地开发要用可信域名、回调必须公网可达，另外侧边栏高度变化时记得重新计算滚动容器。</p>',
    tagNames: ['前端', '效率工具'],
    like_count: 5,
  }),
  communityPost({
    id: 10,
    title: '前端权限菜单的单一数据源',
    content_html:
      '<p>路由表、菜单树和按钮权限如果各维护一份，迟早会漂移；这次统一从一份权限描述生成三层结构。</p>',
    tagNames: ['前端', 'Vue'],
    like_count: 11,
  }),
  communityPost({
    id: 11,
    title: '小程序分包加载优化实践',
    content_html: '<p>主包只保留首页与登录，工作台和资源详情拆到分包后，首包体积下降了 42%。</p>',
    tagNames: ['前端', '效率工具'],
    like_count: 3,
  }),
  communityPost({
    id: 12,
    title: 'AI 客服接入前的边界设计',
    content_html:
      '<p>哪些问题可以自动回答、哪些必须转人工、转人工时带哪些上下文，比模型选型更值得先想清楚。</p>',
    tagNames: ['后端', '效率工具'],
    status: 'pending_review',
    like_count: 0,
  }),
  communityPost({
    id: 13,
    title: '一次失败的缓存改造复盘',
    content_html:
      '<p>缓存粒度选错，导致列表页读到旧状态。最后改成按需求编号缓存单条详情，并在写操作后精准失效。</p>',
    tagNames: ['后端', '数据库'],
    status: 'rejected',
    review_note: '内容需要补充更多可复现细节',
    reviewed_by: 'admin_demo',
    reviewed_at: datetime(-1, 10, 0),
  }),
]
