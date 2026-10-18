<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { getMyInviteCode, getMyInviteStats, type InviteCodeResponse, type InviteStatsResponse } from '@/api/invite'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'


import {
  TButton,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  Document,
  RefreshLeft,
  Search,
} from 'ui_73info'

/* 读数条上的「已成功邀请」由本组件上报：数据在这里加载，页面那边不重复打接口。
   刷新走页面的读数条，这里不再自带刷新按钮。 */
const emit = defineEmits<{ (event: 'stats', invited: number): void }>()

const auth = useAuthStore()
const inviteCode = ref<InviteCodeResponse | null>(null)
const stats = ref<InviteStatsResponse | null>(null)
const loading = ref(false)
const keyword = ref('')
/** 加入时间档：邀请记录是一次全量取回，筛选与分页都在前端做（与我的合同、我的发票同一套口径）。 */
const joinedScope = ref<'all' | 'week' | 'month'>('all')
const invitees = computed(() => stats.value?.invitees ?? [])

/**
 * 加入时间距今天数；解析不出来时返回 null。
 *
 * null 的记录在任何时间档下都保留：时间字段异常不该让一条邀请记录从列表里消失，
 * 在「全部」里看得到、换个档却看不到，会被当成数据丢了。
 */
function joinedDaysAgo(value: string): number | null {
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) {
        return null
    }
    return (Date.now() - time) / (24 * 60 * 60 * 1000)
}

/** 加入时间在近 N 天内（三个档位与列表过滤共用它，避免两处各写一遍天数）。 */
function isWithinDays(invitee: { joined_at: string }, days: number): boolean {
    const value = joinedDaysAgo(invitee.joined_at)
    return value == null || value <= days
}

/** 当前选中的时间档是否收下这条记录：「全部」不筛。 */
function matchesJoinedScope(invitee: { joined_at: string }): boolean {
    if (joinedScope.value === 'all') {
        return true
    }
    return isWithinDays(invitee, joinedScope.value === 'week' ? 7 : 30)
}

const scopeOptions = computed(() => [
    { value: 'all' as const, label: '全部', count: invitees.value.length },
    { value: 'week' as const, label: '近 7 天', count: invitees.value.filter((invitee) => isWithinDays(invitee, 7)).length },
    { value: 'month' as const, label: '近 30 天', count: invitees.value.filter((invitee) => isWithinDays(invitee, 30)).length },
])

const filteredInvitees = computed(() => {
    const search = keyword.value.trim().toLocaleLowerCase()
    return invitees.value.filter((invitee) => {
        if (!matchesJoinedScope(invitee)) {
            return false
        }
        if (!search) {
            return true
        }
        return invitee.username.toLocaleLowerCase().includes(search)
    })
})

const hasActiveFilters = computed(() => keyword.value.trim() !== '' || joinedScope.value !== 'all')

/* 分页与其余菜单页同构（我的合同、我的发票、我的收藏都用这一套表尾分页器）。 */
const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedInvitees,
    resetPage,
} = useClientPagination(filteredInvitees)

// 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
watch([keyword, joinedScope], resetPage)

function resetFilters() {
    keyword.value = ''
    joinedScope.value = 'all'
}

function joinedAt(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }
    return date.toLocaleDateString('zh-CN')
}

async function loadInvite() {
    auth.hydrate()
    if (!auth.token) {
        inviteCode.value = null
        stats.value = null
        return
    }
    loading.value = true
    try {
        const [codePayload, statsPayload] = await Promise.all([
            getMyInviteCode(auth.token),
            getMyInviteStats(auth.token),
        ])
        inviteCode.value = codePayload
        stats.value = statsPayload
    } catch (error) {
        TMessage.error(error instanceof Error ? error.message : '加载邀请信息失败')
    } finally {
        loading.value = false
        // 放在 finally：接口失败也要把读数条上的占位符收掉，否则页面永远停在「—」
        emit('stats', inviteCode.value?.invite_count ?? 0)
    }
}

async function copyText(value: string, label: string) {
    try {
        await navigator.clipboard.writeText(value)
        TMessage.success(`${label}已复制`)
    } catch {
        TMessage.error(`${label}复制失败`)
    }
}

onMounted(() => {
    void loadInvite()
})

/* 页面顶部的读数条由「勋章与邀请」页（BadgeCenterView）渲染，刷新按钮也挂在它上面，所以这里把重载方法暴露出去，
   页面点刷新时与本组件自带的首次加载走同一条路径。 */
defineExpose({ reload: loadInvite })
</script>

<template>
    <section class="invite-panel" aria-label="邀请面板" :aria-busy="loading">
        <div class="wb-card-head">
            <h3 class="wb-card-head__title">我的邀请</h3>
            <div class="wb-card-head__actions">
                <RouterLink class="wb-btn wb-btn--ghost"
                    :to="{ name: 'workbench-invite-leaderboard' }">
                    查看排行榜
                </RouterLink>
            </div>
        </div>

        <div class="wb-panel invite-panel__code">
            <span class="invite-panel__code-label">邀请码</span>
            <span class="invite-panel__code-value">{{ inviteCode?.code || '--------' }}</span>
            <TButton icon-only class="wb-toolbar__icon-btn invite-panel__code-copy" :disabled="!inviteCode"
                title="复制邀请码" aria-label="复制邀请码"
                @click="copyText(inviteCode?.code || '', '邀请码')">
                <TIcon><Document /></TIcon>
            </TButton>
            <ShareCardGenerator share-type="invite" />
        </div>

        <div v-if="invitees.length || hasActiveFilters" class="wb-toolbar">
            <div class="wb-chip-group" role="group" aria-label="加入时间">
                <button v-for="scope in scopeOptions" :key="scope.value" type="button"
                    class="wb-chip wb-chip--button" :class="{ 'is-active': joinedScope === scope.value }"
                    :aria-pressed="joinedScope === scope.value" @click="joinedScope = scope.value">
                    {{ scope.label }}<span class="wb-chip__count">{{ scope.count }}</span>
                </button>
            </div>
            <TInput v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索被邀请的用户名"
                aria-label="搜索邀请记录">
                <template #prefix><TIcon><Search /></TIcon></template>
            </TInput>
            <div class="wb-toolbar__actions">
                <span v-if="hasActiveFilters" class="wb-toolbar__hint">
                    筛选出 {{ filteredTotal }} / {{ invitees.length }} 人
                </span>
                <TButton variant="outline" v-if="hasActiveFilters" @click="resetFilters">
                    <TIcon><RefreshLeft /></TIcon><span>重置</span>
                </TButton>
            </div>
        </div>

        <p v-if="loading && !invitees.length" class="wb-empty" role="status">正在加载邀请记录…</p>
        <div v-else-if="!filteredInvitees.length" class="wb-empty">
            <span class="wb-empty__title">{{ invitees.length ? '没有匹配的邀请记录' : '暂无邀请记录' }}</span>
        </div>
        <template v-else>
            <ul class="wb-list" aria-label="邀请记录">
                <li v-for="invitee in pagedInvitees" :key="invitee.username" class="wb-item">
                    <div class="wb-item__main invite-panel__invitee">
                        <span class="wb-avatar">{{ Array.from(invitee.username)[0] ?? '用' }}</span>
                        <span class="wb-item__title">{{ invitee.username }}</span>
                    </div>
                    <div class="wb-item__side">
                        <span class="wb-item__meta">{{ joinedAt(invitee.joined_at) }} 加入</span>
                    </div>
                </li>
            </ul>
            <div class="wb-pager">
                <div class="wb-pager__count">
                    <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页邀请记录数">
                        <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
                    </TSelect>
                </div>
                <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
                    :pager-count="5" background aria-label="邀请记录分页" />
            </div>
        </template>
    </section>
</template>

<style scoped>
/* 版式走统一层（.wb-card-head / .wb-toolbar / .wb-list / .wb-item / .wb-empty），
   本页只保留邀请码那一条横条与头像圆点。原来这里的 #2563eb / #eff6ff 与 8px 圆角都是这一族
   组件自己的色板，已并入统一层的 --wb-*；「查看排行榜」原来给自己写了一段链接按钮样式，
   现在用统一层的 .wb-btn--ghost（与 .dev-btn--ghost 同规格）。

   邀请码原来是 92px 高的一块（13px 标签 + 28px 大字、16/18 内距），下面再跟一行
   「邀请方式 分享」，首屏被这两行占掉约 150px。现在合成一条 58px 的横条：标签与邀请码在左，
   复制与分享这一对动作贴在右端；复制只留一处（原来卡头是文字按钮、条内是图标按钮，
   同一个动作两个入口），卡头只留「查看排行榜」。 */
/* 邀请码横条：外壳（内边距 / 圆角 / 描边 / 底色）走统一层的 .wb-panel，
   这里只留「标签 + 大字邀请码 + 右端两个动作」这一行的排布。
   原先自带 10px 14px 内边距与半透明白底，与券包分组、权益面板是同一层级却各写一格。 */
.invite-panel__code {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.invite-panel__code-label {
    color: var(--profile-text-sub, #64748b);
    font-size: 12px;
    white-space: nowrap;
}

.invite-panel__code-value {
    color: var(--profile-text-main, #0f172a);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* 复制推开空档，让它与分享一起贴在右端（与列表行的动作位置一致），横条本身不因此变高 */
.invite-panel__code-copy {
    margin-left: auto;
}

.invite-panel__invitee {
    display: flex;
    align-items: center;
    gap: 10px;
}

@media (max-width: 640px) {
    /* 触屏档：整条与两个动作都至少 44px（复制按钮的高度由统一层给到 44px，
       分享自带的 36px 高写在自己组件里，这里按同一条约定抬齐） */
    .invite-panel__code {
        min-height: 44px;
        padding: 8px 12px;
        gap: 10px;
    }

    .invite-panel__code-value {
        font-size: 18px;
    }

    .invite-panel__code :deep(.share-card-generator__start) {
        min-height: 44px;
    }

    /* 卡头只剩「查看排行榜」一个动作，统一层的两端对齐会把孤零零的按钮顶到左边 */
    .invite-panel .wb-card-head__actions {
        justify-content: flex-end;
    }
}
</style>
