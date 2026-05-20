<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getBadges, getMyBadges, getUserBadges, type BadgeDefinition, type UserBadge } from '@/api/invite'
import { useToast } from '@/composables/useToast'

const props = withDefaults(
    defineProps<{
        username?: string
        publicOnly?: boolean
    }>(),
    {
        username: '',
        publicOnly: false,
    },
)

const auth = useAuthStore()
const { showToast } = useToast()
const allBadges = ref<BadgeDefinition[]>([])
const earnedBadges = ref<UserBadge[]>([])
const loading = ref(false)

const earnedMap = computed(() => new Map(earnedBadges.value.map((badge) => [badge.code, badge])))
const groups = computed(() => [
    {
        key: 'invite',
        title: '邀请徽章',
        badges: allBadges.value.filter((badge) => badge.category === 'invite'),
    },
    {
        key: 'activity',
        title: '活跃徽章',
        badges: allBadges.value.filter((badge) => badge.category === 'activity'),
    },
])
const acquiredCount = computed(() => earnedBadges.value.length)

function isBadgeIconSvg(icon: string) {
  return icon.startsWith('badges/')
}

function badgeIconUrl(icon: string) {
  return `/uploads/${icon}`
}

function awardTime(code: string) {
    const badge = earnedMap.value.get(code)
    if (!badge) {
        return ''
    }
    const date = new Date(badge.awarded_at)
    if (Number.isNaN(date.getTime())) {
        return badge.awarded_at
    }
    return date.toLocaleDateString('zh-CN')
}

async function loadBadges() {
    loading.value = true
    try {
        const [definitions, userBadges] = await Promise.all([
            getBadges(),
            props.username
                ? getUserBadges(props.username)
                : auth.token && !props.publicOnly
                    ? getMyBadges(auth.token)
                    : Promise.resolve({ badges: [] }),
        ])
        allBadges.value = definitions
        earnedBadges.value = userBadges.badges
    } catch (error) {
        showToast(error instanceof Error ? error.message : '加载徽章失败', 'error')
    } finally {
        loading.value = false
    }
}

watch(
    () => [props.username, auth.token],
    () => {
        void loadBadges()
    },
)

onMounted(() => {
    auth.hydrate()
    void loadBadges()
})
</script>

<template>
    <section class="badge-wall" aria-label="徽章墙">
        <header class="badge-wall__head">
            <div>
                <h2>{{ username ? `${username} 的徽章` : '我的徽章墙' }}</h2>
                <p>{{ acquiredCount }} / {{ allBadges.length }}</p>
            </div>
            <span v-if="loading" class="badge-wall__loading">同步中</span>
        </header>

        <div class="badge-wall__groups">
            <section v-for="group in groups" :key="group.key" class="badge-wall__group">
                <h3>{{ group.title }}</h3>
                <div class="badge-wall__grid">
                    <article v-for="badge in group.badges" :key="badge.code" class="badge-wall__badge"
                        :class="{ acquired: earnedMap.has(badge.code) }">
                        <span class="badge-wall__icon">
                            <img
                                v-if="isBadgeIconSvg(badge.icon)"
                                :src="badgeIconUrl(badge.icon)"
                                class="badge-wall__icon-img"
                                alt=""
                            />
                            <template v-else>{{ badge.icon }}</template>
                        </span>
                        <strong>{{ badge.name }}</strong>
                        <p>{{ badge.description }}</p>
                        <small>{{ earnedMap.has(badge.code) ? awardTime(badge.code) : '未获得' }}</small>
                    </article>
                </div>
            </section>
        </div>
    </section>
</template>

<style scoped>
.badge-wall {
    display: grid;
    gap: 16px;
}

.badge-wall__head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
}

.badge-wall__head h2,
.badge-wall__group h3 {
    margin: 0;
    color: #0f172a;
}

.badge-wall__head h2 {
    font-size: 24px;
    line-height: 1.25;
}

.badge-wall__head p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
}

.badge-wall__loading {
    color: #2563eb;
    font-size: 13px;
    font-weight: 800;
}

.badge-wall__groups,
.badge-wall__group {
    display: grid;
    gap: 14px;
}

.badge-wall__group h3 {
    font-size: 16px;
}

.badge-wall__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 168px));
    gap: 10px;
    justify-content: start;
}

.badge-wall__badge {
    display: grid;
    gap: 7px;
    padding: 16px;
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.88);
    color: #94a3b8;
    filter: grayscale(1);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.badge-wall__badge.acquired {
    border-color: rgba(96, 165, 250, 0.52);
    background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(255, 255, 255, 0.96));
    color: #0f172a;
    filter: none;
}

.badge-wall__icon {
    font-size: 28px;
}

.badge-wall__icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.badge-wall__badge strong {
    font-size: 15px;
}

.badge-wall__badge p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.badge-wall__badge p,
.badge-wall__badge small {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
}

.badge-wall__badge small {
    color: #64748b;
    font-weight: 800;
}

@media (max-width: 640px) {
    .badge-wall__grid {
        grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
    }
}
</style>