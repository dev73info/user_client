<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TButton, TIcon, Refresh } from 'ui_73info'

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
        <div class="wb-card-head">
            <div class="wb-card-head__title-block">
                <h3 class="wb-card-head__title">邀请排行榜</h3>
                <p class="wb-card-head__desc">
                    <template v-if="myRank">我的排名：第 {{ myRank.rank }} 名 · {{ myRank.count }} 人。</template>
                    <template v-else>本周期暂无我的排名。</template>
                </p>
            </div>
            <div class="wb-card-head__actions">
                <!-- 周期只有两档，且要一眼看出当前选中项：用统一层的胶囊组，不再自造一套 tab -->
                <div class="wb-chip-group" role="group" aria-label="排行榜周期">
                    <button type="button" class="wb-chip wb-chip--button"
                        :class="{ 'is-active': period === 'weekly' }" :aria-pressed="period === 'weekly'"
                        @click="loadLeaderboard('weekly')">周榜</button>
                    <button type="button" class="wb-chip wb-chip--button"
                        :class="{ 'is-active': period === 'alltime' }" :aria-pressed="period === 'alltime'"
                        @click="loadLeaderboard('alltime')">总榜</button>
                </div>
                <TButton icon-only :loading="loading" aria-label="刷新排行榜"
                    @click="loadLeaderboard()">
                    <TIcon>
                        <Refresh />
                    </TIcon>
                </TButton>
            </div>
        </div>

        <p v-if="loading && entries.length === 0" class="wb-empty" role="status">正在加载排行榜…</p>
        <div v-else-if="entries.length === 0" class="wb-empty">
            <span class="wb-empty__title">暂无排行数据</span>
        </div>
        <ul v-else class="wb-list" aria-label="邀请排行榜">
            <li v-for="entry in entries" :key="entry.username" class="wb-item">
                <span class="wb-badge invite-leaderboard__rank">第 {{ entry.rank }} 名</span>
                <span class="wb-avatar">{{ Array.from(entry.username)[0] ?? '用' }}</span>
                <div class="wb-item__main invite-leaderboard__user">
                    <span class="wb-item__title">{{ entry.username }}</span>
                    <span class="wb-item__meta">{{ entry.badges.map(badgeLabel).join(' / ') || '暂无邀请徽章' }}</span>
                </div>
                <div class="wb-item__side">
                    <span class="invite-leaderboard__count">{{ entry.count }} 人</span>
                </div>
            </li>
        </ul>
    </section>
</template>

<style scoped>
/* 版式走统一层（.wb-card-head / .wb-chip-group / .wb-list / .wb-item / .wb-badge / .wb-empty / .wb-avatar），
   本页只留「排名徽标不参与伸缩」「用户名与徽章不折行」「人数读数」三件事。
   原来这里是一整套自己的蓝（#2563eb / #dbeafe / #1d4ed8）、8px 圆角、
   38bdf8→86efac 的渐变头像，与同一页里已经走统一层的邀请记录卡不是同一种外观。 */
.invite-leaderboard__rank {
    flex: 0 0 auto;
}

.invite-leaderboard__user {
    flex: 1;
}

.invite-leaderboard__user .wb-item__title,
.invite-leaderboard__user .wb-item__meta {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.invite-leaderboard__count {
    color: var(--profile-text-main);
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
</style>
