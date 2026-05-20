<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DataAnalysis, Refresh } from '@element-plus/icons-vue'

import { getBadges, getInviteLeaderboard, type BadgeDefinition, type InviteLeaderboardEntry } from '@/api/invite'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()
const period = ref<'weekly' | 'alltime'>('weekly')
const entries = ref<InviteLeaderboardEntry[]>([])
const myRank = ref<{ rank: number; count: number } | null>(null)
const loading = ref(false)
const badges = ref<BadgeDefinition[]>([])
const badgeMap = computed(() => new Map(badges.value.map((badge) => [badge.code, badge])))

function badgeLabel(code: string) {
    const badge = badgeMap.value.get(code)
    return badge ? badge.name : code
}

async function loadLeaderboard(nextPeriod = period.value) {
    auth.hydrate()
    if (!auth.token) {
        entries.value = []
        return
    }
    period.value = nextPeriod
    loading.value = true
    try {
        const [leaderboard, definitions] = await Promise.all([
            getInviteLeaderboard(auth.token, period.value),
            badges.value.length ? Promise.resolve(badges.value) : getBadges(),
        ])
        badges.value = definitions
        entries.value = leaderboard.leaderboard
        myRank.value = leaderboard.my_rank ?? null
    } catch (error) {
        showToast(error instanceof Error ? error.message : '加载排行榜失败', 'error')
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    void loadLeaderboard()
})
</script>

<template>
    <section class="invite-leaderboard" aria-label="邀请排行榜">
        <header class="invite-leaderboard__head">
            <div>
                <h2>邀请排行榜</h2>
                <p v-if="myRank">我的排名：第 {{ myRank.rank }} 名 · {{ myRank.count }} 人</p>
                <p v-else>本周期暂无排名</p>
            </div>
            <div class="invite-leaderboard__actions">
                <div class="invite-leaderboard__tabs" role="tablist" aria-label="排行榜周期">
                    <button type="button" :class="{ active: period === 'weekly' }"
                        @click="loadLeaderboard('weekly')">周榜</button>
                    <button type="button" :class="{ active: period === 'alltime' }"
                        @click="loadLeaderboard('alltime')">总榜</button>
                </div>
                <button class="invite-leaderboard__icon-btn" type="button" :disabled="loading"
                    @click="loadLeaderboard()" aria-label="刷新排行榜">
                    <el-icon>
                        <Refresh />
                    </el-icon>
                </button>
            </div>
        </header>

        <div class="invite-leaderboard__list">
            <article v-for="entry in entries" :key="entry.username" class="invite-leaderboard__row">
                <span class="invite-leaderboard__rank">{{ entry.rank }}</span>
                <span class="invite-leaderboard__avatar">{{ Array.from(entry.username)[0] ?? '用' }}</span>
                <div class="invite-leaderboard__user">
                    <strong>{{ entry.username }}</strong>
                    <small>{{ entry.badges.map(badgeLabel).join(' / ') || '暂无邀请徽章' }}</small>
                </div>
                <span class="invite-leaderboard__count">{{ entry.count }} 人</span>
            </article>
            <div v-if="!loading && entries.length === 0" class="invite-leaderboard__empty">
                <el-icon>
                    <DataAnalysis />
                </el-icon>
                <span>暂无排行数据</span>
            </div>
        </div>
    </section>
</template>

<style scoped>
.invite-leaderboard {
    display: grid;
    gap: 14px;
}

.invite-leaderboard__head,
.invite-leaderboard__actions,
.invite-leaderboard__row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.invite-leaderboard__head {
    justify-content: space-between;
}

.invite-leaderboard__head h2 {
    margin: 0;
    color: #0f172a;
    font-size: 22px;
}

.invite-leaderboard__head p,
.invite-leaderboard__user small {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
}

.invite-leaderboard__tabs {
    display: inline-flex;
    padding: 3px;
    border: 1px solid rgba(191, 219, 254, 0.8);
    border-radius: 8px;
    background: #eff6ff;
}

.invite-leaderboard__tabs button,
.invite-leaderboard__icon-btn {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.invite-leaderboard__tabs button {
    min-height: 30px;
    padding: 0 11px;
    border-radius: 6px;
    background: transparent;
    color: #2563eb;
    font-size: 13px;
    font-weight: 800;
}

.invite-leaderboard__tabs button.active {
    background: #2563eb;
    color: #fff;
}

.invite-leaderboard__icon-btn {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #f8fafc;
    color: #2563eb;
}

.invite-leaderboard__list {
    display: grid;
    gap: 8px;
}

.invite-leaderboard__row {
    min-height: 68px;
    padding: 10px 12px;
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
}

.invite-leaderboard__rank,
.invite-leaderboard__avatar {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
}

.invite-leaderboard__rank {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #dbeafe;
    color: #1d4ed8;
    font-weight: 900;
}

.invite-leaderboard__avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #38bdf8, #86efac);
    color: #fff;
    font-weight: 900;
}

.invite-leaderboard__user {
    min-width: 0;
    flex: 1;
}

.invite-leaderboard__user strong,
.invite-leaderboard__user small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.invite-leaderboard__count {
    color: #0f172a;
    font-weight: 900;
    white-space: nowrap;
}

.invite-leaderboard__empty {
    min-height: 90px;
    display: grid;
    place-items: center;
    gap: 6px;
    color: #94a3b8;
    font-weight: 800;
}

@media (max-width: 640px) {
    .invite-leaderboard__head {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>