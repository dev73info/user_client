<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Document, Refresh } from '@element-plus/icons-vue'

import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { getMyInviteCode, getMyInviteStats, type InviteCodeResponse, type InviteStatsResponse } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()
const inviteCode = ref<InviteCodeResponse | null>(null)
const stats = ref<InviteStatsResponse | null>(null)
const loading = ref(false)
const invitees = computed(() => stats.value?.invitees ?? [])

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
</script>

<template>
    <section class="invite-panel" aria-label="邀请面板">
        <header class="invite-panel__head">
            <div>
                <h2>我的邀请</h2>
                <p>已成功邀请 {{ inviteCode?.invite_count ?? 0 }} 人</p>
            </div>
            <button type="button" :disabled="loading" @click="loadInvite" aria-label="刷新邀请信息">
                <el-icon>
                    <Refresh />
                </el-icon>
            </button>
        </header>

        <div class="invite-panel__code-shell">
            <div class="invite-panel__code">
                <div>
                    <span>邀请码</span>
                    <strong>{{ inviteCode?.code || '--------' }}</strong>
                </div>
                <button type="button" :disabled="!inviteCode" @click="copyText(inviteCode?.code || '', '邀请码')"
                    aria-label="复制邀请码">
                    <el-icon>
                        <Document />
                    </el-icon>
                </button>
            </div>
        </div>

        <div class="invite-panel__actions-row">
            <ShareCardGenerator share-type="invite" />
            <RouterLink class="invite-panel__leaderboard-link" :to="{ name: 'workbench-invite-leaderboard' }">
                查看排行榜
            </RouterLink>
        </div>

        <section class="invite-panel__invitees">
            <h3>最近邀请</h3>
            <div class="invite-panel__invitee-list">
                <article v-for="invitee in invitees" :key="invitee.username">
                    <span>{{ Array.from(invitee.username)[0] ?? '用' }}</span>
                    <div>
                        <strong>{{ invitee.username }}</strong>
                        <small>{{ joinedAt(invitee.joined_at) }}</small>
                    </div>
                </article>
                <p v-if="!loading && invitees.length === 0">暂无邀请记录</p>
            </div>
        </section>

    </section>
</template>

<style scoped>
.invite-panel {
    display: grid;
    gap: 16px;
}

.invite-panel__head,
.invite-panel__code,
.invite-panel__invitee-list article {
    display: flex;
    align-items: center;
    gap: 12px;
}

.invite-panel__head {
    justify-content: space-between;
}

.invite-panel__head h2,
.invite-panel__invitees h3 {
    margin: 0;
    color: #0f172a;
}

.invite-panel__head h2 {
    font-size: 24px;
}

.invite-panel__head p {
    margin: 5px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
}

.invite-panel__head button,
.invite-panel__code button {
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 8px;
    background: #eff6ff;
    color: #2563eb;
    cursor: pointer;
}

.invite-panel__code,
.invite-panel__invitee-list article {
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
}

.invite-panel__code-shell {
    display: grid;
}

.invite-panel__code {
    justify-content: space-between;
    padding: 16px;
}

.invite-panel__actions-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.invite-panel__leaderboard-link {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border-radius: 999px;
    background: #2563eb;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
    white-space: nowrap;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
    transition:
        background-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
}

.invite-panel__leaderboard-link:hover {
    background: #1d4ed8;
    box-shadow: 0 12px 26px rgba(37, 99, 235, 0.24);
    transform: translateY(-1px);
}

.invite-panel__code span,
.invite-panel__invitee-list small,
.invite-panel__invitee-list p {
    color: #64748b;
    font-size: 12px;
}

.invite-panel__code strong {
    display: block;
    margin-top: 4px;
    color: #0f172a;
    font-size: 30px;
    line-height: 1;
    letter-spacing: 0;
}

.invite-panel__invitees,
.invite-panel__invitee-list {
    display: grid;
    gap: 8px;
}

.invite-panel__invitees h3 {
    font-size: 16px;
}

.invite-panel__invitee-list article {
    min-height: 56px;
    padding: 9px 11px;
}

.invite-panel__invitee-list article>span {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: linear-gradient(135deg, #38bdf8, #86efac);
    color: #fff;
    font-weight: 900;
}

.invite-panel__invitee-list strong,
.invite-panel__invitee-list small {
    display: block;
}

.invite-panel__invitee-list p {
    margin: 0;
    padding: 12px;
}

@media (max-width: 640px) {
    .invite-panel__actions-row {
        align-items: stretch;
        flex-direction: column;
    }

    .invite-panel__leaderboard-link {
        width: 100%;
    }
}
</style>