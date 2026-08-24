<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  getBadges,
  getMyBadges,
  getUserBadges,
  setMyEquippedBadges,
  type BadgeDefinition,
  type UserBadge,
} from '@/api/invite'
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
const saving = ref(false)

const earnedMap = computed(() => new Map(earnedBadges.value.map((badge) => [badge.code, badge])))
const groups = computed(() => [
    {
        key: 'achievement',
        title: '成就徽章',
        badges: allBadges.value.filter((badge) => badge.category === '成就徽章'),
    },
    {
        key: 'special',
        title: '特殊徽章',
        badges: allBadges.value.filter((badge) => badge.category === '特殊徽章'),
    },
])
const acquiredCount = computed(() => earnedBadges.value.length)
const equippedCount = computed(() => earnedBadges.value.filter((badge) => badge.equipped).length)
const isOwn = computed(() => !props.username && !props.publicOnly && !!auth.token)

function canEquip(badge: BadgeDefinition) {
  return isOwn.value && earnedMap.value.has(badge.code)
}

function badgeTooltip(badge: BadgeDefinition) {
  const earned = earnedMap.value.get(badge.code)
  if (earned?.equipped) {
    return `${badge.name}：${badge.description}（佩戴中）`
  }
  return `${badge.name}：${badge.description}`
}

function isBadgeIconSvg(icon: string) {
  return icon.startsWith('badges/')
}

function badgeIconUrl(icon: string) {
  return `/uploads/${icon}`
}

async function toggleEquip(badge: BadgeDefinition) {
    if (!isOwn.value || saving.value) return
    const current = earnedMap.value.get(badge.code)
    if (!current) return

    const willEquip = !current.equipped
    const codes = earnedBadges.value
        .filter((item) => item.equipped && item.code !== badge.code)
        .map((item) => item.code)
    if (willEquip) {
        codes.push(badge.code)
    }

    saving.value = true
    try {
        const result = await setMyEquippedBadges(auth.token!, codes)
        earnedBadges.value = result.badges
        showToast(willEquip ? `已佩戴「${badge.name}」` : `已取消佩戴「${badge.name}」`, 'success')
    } catch (error) {
        showToast(error instanceof Error ? error.message : '更新佩戴徽章失败', 'error')
    } finally {
        saving.value = false
    }
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
                <p v-if="isOwn">已佩戴 {{ equippedCount }} 个徽章</p>
            </div>
            <span v-if="loading" class="badge-wall__loading">同步中</span>
        </header>

        <div class="badge-wall__groups">
            <section v-for="group in groups" :key="group.key" class="badge-wall__group">
                <h3>{{ group.title }}</h3>
                <div class="badge-wall__grid">
                    <article v-for="badge in group.badges" :key="badge.code" class="badge-wall__badge"
                        :class="{
                            acquired: earnedMap.has(badge.code),
                            equipped: !!earnedMap.get(badge.code)?.equipped,
                            interactable: canEquip(badge),
                        }"
                        :title="badgeTooltip(badge)"
                        @click="toggleEquip(badge)">
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
                        <span v-if="canEquip(badge)" class="badge-wall__equip-state"
                            :class="{ 'is-on': !!earnedMap.get(badge.code)?.equipped }">
                            {{ earnedMap.get(badge.code)?.equipped ? '✓ 佩戴中' : '+ 佩戴' }}
                        </span>
                    </article>
                </div>
            </section>
        </div>
        <p v-if="isOwn && !loading" class="badge-wall__hint">点击已获得的徽章可佩戴或取消佩戴（支持多个）。</p>
    </section>
</template>

<style scoped>
.badge-wall {
    display: grid;
    gap: 8px;
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
    margin: 3px 0 0;
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
}

.badge-wall__loading {
    color: #2563eb;
    font-size: 10px;
    font-weight: 800;
}

.badge-wall__groups,
.badge-wall__group {
    display: grid;
    gap: 6px;
}

.badge-wall__group h3 {
    font-size: 12px;
}

.badge-wall__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 72px);
    gap: 6px;
    justify-content: start;
}

.badge-wall__badge {
    display: grid;
    gap: 3px;
    padding: 8px;
    border: 1px solid rgba(226, 232, 240, 0.96);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.88);
    color: #94a3b8;
    filter: grayscale(1);
    min-width: 0;
    min-height: 0;
    width: 72px;
    overflow: hidden;
}

.badge-wall__badge.acquired {
    border-color: rgba(96, 165, 250, 0.52);
    background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(255, 255, 255, 0.96));
    color: #0f172a;
    filter: none;
}

.badge-wall__badge.interactable {
    cursor: pointer;
}

.badge-wall__badge.interactable:hover {
    border-color: rgba(59, 130, 246, 0.7);
}

.badge-wall__badge.equipped {
    border-color: rgba(37, 99, 235, 0.8);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25) inset;
}

.badge-wall__equip-state {
    margin-top: 2px;
    padding: 2px 4px;
    border-radius: 4px;
    background: rgba(226, 232, 240, 0.9);
    color: #475569;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.2;
    text-align: center;
}

.badge-wall__equip-state.is-on {
    background: rgba(37, 99, 235, 0.14);
    color: #1d4ed8;
}

.badge-wall__hint {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 10px;
    line-height: 1.5;
}

.badge-wall__icon {
    font-size: 14px;
}

.badge-wall__icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.badge-wall__badge strong {
    font-size: 10px;
}

.badge-wall__badge p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
}

.badge-wall__badge p,
.badge-wall__badge small {
    margin: 0;
    font-size: 10px;
    line-height: 1.4;
}

.badge-wall__badge small {
    color: #64748b;
    font-weight: 800;
}

@media (max-width: 640px) {
    .badge-wall__grid {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    }
}
</style>