<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Document, Search } from '@element-plus/icons-vue'

import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { getMyInviteCode, getMyInviteStats, type InviteCodeResponse, type InviteStatsResponse } from '@/api/invite'
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
const invitees = computed(() => stats.value?.invitees ?? [])

const filteredInvitees = computed(() => {
    const search = keyword.value.trim().toLocaleLowerCase()
    if (!search) return invitees.value
    return invitees.value.filter((invitee) => invitee.username.toLocaleLowerCase().includes(search))
})

const hasActiveFilters = computed(() => keyword.value.trim() !== '')

function resetFilters() {
    keyword.value = ''
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
            <el-input v-model="keyword" class="wb-toolbar__search" clearable placeholder="搜索被邀请的用户名"
                aria-label="搜索邀请记录">
                <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <div class="wb-toolbar__actions">
                <span v-if="hasActiveFilters" class="wb-toolbar__hint">
                    筛选出 {{ filteredInvitees.length }} / {{ invitees.length }} 人
                </span>
                <el-button v-if="hasActiveFilters" class="wb-toolbar__ghost" @click="resetFilters">
                    <span>重置</span>
                </el-button>
            </div>
        </div>

        <p v-if="loading && !invitees.length" class="wb-empty" role="status">正在加载邀请记录…</p>
        <div v-else-if="!filteredInvitees.length" class="wb-empty">
            <span class="wb-empty__title">{{ invitees.length ? '没有匹配的邀请记录' : '暂无邀请记录' }}</span>
            {{ invitees.length ? '换个关键字再试一次。' : '把邀请码或邀请链接发给好友，对方注册后就会出现在这里。' }}
        </div>
        <ul v-else class="wb-list" aria-label="最近邀请">
            <li v-for="invitee in filteredInvitees" :key="invitee.username" class="wb-item">
                <div class="wb-item__main invite-panel__invitee">
                    <span class="wb-avatar">{{ Array.from(invitee.username)[0] ?? '用' }}</span>
                    <span class="wb-item__title">{{ invitee.username }}</span>
                </div>
                <div class="wb-item__side">
                    <span class="wb-item__meta">{{ joinedAt(invitee.joined_at) }} 加入</span>
                </div>
            </li>
        </ul>
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
