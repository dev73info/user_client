<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Document, RefreshLeft, Search } from '@element-plus/icons-vue'

import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { getMyInviteCode, getMyInviteStats, type InviteCodeResponse, type InviteStatsResponse } from '@/api/invite'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

/* 读数条上的「已成功邀请」由本组件上报：数据在这里加载，页面那边不重复打接口。
   刷新走页面的读数条，这里不再自带刷新按钮。 */
const emit = defineEmits<{ (event: 'stats', invited: number): void }>()

const auth = useAuthStore()
const { showToast } = useToast()
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
        showToast(error instanceof Error ? error.message : '加载邀请信息失败', 'error')
    } finally {
        loading.value = false
        // 放在 finally：接口失败也要把读数条上的占位符收掉，否则页面永远停在「—」
        emit('stats', inviteCode.value?.invite_count ?? 0)
    }
}

async function copyText(value: string, label: string) {
    try {
        await navigator.clipboard.writeText(value)
        showToast(`${label}已复制`, 'success')
    } catch {
        showToast(`${label}复制失败`, 'error')
    }
}

onMounted(() => {
    void loadInvite()
})

/* 页面顶部的读数条由 InviteView 渲染，刷新按钮也挂在它上面，所以这里把重载方法暴露出去，
   页面点刷新时与本组件自带的首次加载走同一条路径。 */
defineExpose({ reload: loadInvite })
</script>

<template>
    <section class="invite-panel" aria-label="邀请面板" :aria-busy="loading">
        <div class="wb-card-head">
            <div class="wb-card-head__title-block">
                <h3 class="wb-card-head__title">我的邀请</h3>
                <p class="wb-card-head__desc">
                    把邀请码或邀请链接发给好友，好友注册后即计入邀请记录，并解锁对应的邀请徽章。
                </p>
            </div>
            <div class="wb-card-head__actions">
                <el-button class="wb-toolbar__primary" @click="copyText(inviteCode?.code || '', '邀请码')"
                    :disabled="!inviteCode">
                    <span>复制邀请码</span>
                </el-button>
                <RouterLink class="wb-btn wb-btn--ghost"
                    :to="{ name: 'workbench-invite-leaderboard' }">
                    查看排行榜
                </RouterLink>
            </div>
        </div>

        <div class="wb-item invite-panel__code">
            <div class="wb-item__main">
                <span class="wb-item__meta">邀请码</span>
                <span class="wb-item__title invite-panel__code-value">{{ inviteCode?.code || '--------' }}</span>
            </div>
            <div class="wb-item__side">
                <el-button class="wb-toolbar__icon-btn" :disabled="!inviteCode" aria-label="复制邀请码"
                    @click="copyText(inviteCode?.code || '', '邀请码')">
                    <el-icon><Document /></el-icon>
                </el-button>
            </div>
        </div>

        <div class="wb-toolbar">
            <span class="wb-strip__label">邀请方式</span>
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
            <el-input v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索被邀请的用户名"
                aria-label="搜索邀请记录">
                <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <div class="wb-toolbar__actions">
                <span v-if="hasActiveFilters" class="wb-toolbar__hint">
                    筛选出 {{ filteredTotal }} / {{ invitees.length }} 人
                </span>
                <el-button v-if="hasActiveFilters" class="wb-toolbar__ghost" @click="resetFilters">
                    <el-icon><RefreshLeft /></el-icon><span>重置</span>
                </el-button>
            </div>
        </div>

        <p v-if="loading && !invitees.length" class="wb-empty" role="status">正在加载邀请记录…</p>
        <div v-else-if="!filteredInvitees.length" class="wb-empty">
            <span class="wb-empty__title">{{ invitees.length ? '没有匹配的邀请记录' : '暂无邀请记录' }}</span>
            {{ invitees.length ? '换个时间档或关键字再试一次。' : '把邀请码或邀请链接发给好友，对方注册后就会出现在这里。' }}
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
                    <span>共 {{ filteredTotal }} 条</span>
                    <el-select v-model="pageSize" class="wb-pager__size" aria-label="每页邀请记录数">
                        <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
                    </el-select>
                </div>
                <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
                    :pager-count="5" layout="prev, pager, next" background aria-label="邀请记录分页" />
            </div>
        </template>
    </section>
</template>

<style scoped>
/* 版式走统一层（.wb-card-head / .wb-toolbar / .wb-list / .wb-item / .wb-empty），
   本页只保留邀请码的字号与头像圆点。原来这里的 #2563eb / #eff6ff 与 8px 圆角都是这一族
   组件自己的色板，已并入统一层的 --wb-*；「查看排行榜」原来给自己写了一段链接按钮样式，
   现在用统一层的 .wb-btn--ghost（与 .dev-btn--ghost 同规格）。 */
.invite-panel__code-value {
    font-size: 28px;
    line-height: 1.1;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
}

.invite-panel__invitee {
    display: flex;
    align-items: center;
    gap: 10px;
}

@media (max-width: 640px) {
    .invite-panel__code-value {
        font-size: 22px;
    }
}
</style>
