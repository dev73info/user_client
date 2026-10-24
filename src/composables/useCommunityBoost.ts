import { parseBackendDateTime } from '@/shared/datetime'
import { computed, ref, type Ref } from 'vue'

import { boostCommunityPost, type CommunityPost, type PostBoostKind } from '@/api/community'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 后端时间是东八区墙钟串，到期判断统一走 shared/datetime.ts 的解析口径。 */
function isFuture(value?: string | null): boolean {
  const date = parseBackendDateTime(value)
  return date !== null && date.getTime() > Date.now()
}

/** 五档推广的价格与时长。视图只拿它铺下拉菜单，改价只改这一张表。 */
const BOOST_OPTIONS: { kind: PostBoostKind; label: string; cost: number; desc: string }[] = [
  { kind: 'bump', label: '上浮', cost: 50, desc: '帖子排到列表顶部持续 24 小时' },
  { kind: 'highlight', label: '高亮', cost: 100, desc: '帖子高亮标识持续 72 小时' },
  { kind: 'homepage', label: '首页推荐', cost: 200, desc: '首页推荐位持续 24 小时' },
  { kind: 'section', label: '板块推荐', cost: 120, desc: '板块推荐位持续 48 小时' },
  { kind: 'hot', label: '热门展示', cost: 150, desc: '进入热门榜单展示 48 小时' },
]

type UseCommunityBoostOptions = {
  /**
   * 详情区正在看的帖子。**只收引用、不持有**：`selectedPost` 是详情区 6+ 块共用的根状态，
   * 归视图所有；后续步骤把详情区整体搬走时才跟着搬。
   */
  selectedPost: Ref<CommunityPost | null>
  /**
   * 4 处回写点（点赞 / 收藏 / 悬赏 / 推广）共用的那一个回写口子，**注入而不各写一份**：
   * 它要同时改 `posts` 列表里的那条和 `selectedPost`，这两份状态只有视图拿得到。
   */
  updateSelectedPost: (patch: Partial<CommunityPost>) => void
  /** 登录守卫：未登录时会提示并跳登录弹窗，属于视图的路由动作，注入。 */
  ensureAuthed: () => boolean
  /** 买完推广要重取列表（排序与推广标识都变了），列表的取数归视图，注入。 */
  refreshList: () => void
}

/**
 * 社区帖子详情区的推广域：下拉菜单选项、能不能买、买的那一下。
 *
 * 推广的五个到期时间戳（`bumped_at` / `highlight_until` / …）都存在帖子上，这里不另存；
 * `boostingKind` 是本域自己的 loading（同一时刻只允许一档在买），所以留在这里。
 * 买成之后只回写这五个字段并重取列表——重取失败不该回滚已花掉的积分，所以不等它。
 */
export function useCommunityBoost(options: UseCommunityBoostOptions) {
  const auth = useAuthStore()
  const boostingKind = ref<PostBoostKind | null>(null)

  /** 只有「自己发的、且已公开发布」的帖子能买推广。 */
  const canBoostSelectedPost = computed(() =>
    Boolean(
      auth.isAuthed &&
      options.selectedPost.value &&
      options.selectedPost.value.status === 'published' &&
      options.selectedPost.value.author === auth.username,
    ),
  )

  /** 详情标题旁那一串推广标识：只报还在有效期内的档位（上浮走 `bumped_at`，见列表卡的 `postBoostLabel`）。 */
  const activeBoostLabels = computed<string[]>(() => {
    const post = options.selectedPost.value
    if (!post) return []
    const labels: string[] = []
    if (isFuture(post.highlight_until)) labels.push('高亮')
    if (isFuture(post.homepage_until)) labels.push('首页推荐')
    if (isFuture(post.section_until)) labels.push('板块推荐')
    if (isFuture(post.hot_until)) labels.push('热门展示')
    return labels
  })

  async function handleBoost(kind: PostBoostKind) {
    if (!options.ensureAuthed() || !options.selectedPost.value || boostingKind.value) {
      return
    }
    const option = BOOST_OPTIONS.find((item) => item.kind === kind)
    if (!option) {
      return
    }
    const confirmed = window.confirm(
      `确认花费 ${option.cost} 积分购买「${option.label}」推广？${option.desc}。`,
    )
    if (!confirmed) {
      return
    }

    boostingKind.value = kind
    try {
      const updated = await boostCommunityPost(auth.token, options.selectedPost.value.id, kind)
      options.updateSelectedPost({
        bumped_at: updated.bumped_at,
        highlight_until: updated.highlight_until,
        homepage_until: updated.homepage_until,
        section_until: updated.section_until,
        hot_until: updated.hot_until,
      })
      TMessage.success(`已购买「${option.label}」推广`)
      // 刷新列表以反映排序与推广标识。
      options.refreshList()
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '购买推广失败')
    } finally {
      boostingKind.value = null
    }
  }

  return {
    BOOST_OPTIONS,
    boostingKind,
    canBoostSelectedPost,
    activeBoostLabels,
    handleBoost,
  }
}
