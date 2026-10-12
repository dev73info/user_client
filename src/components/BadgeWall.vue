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

/* 读数条上的「已获得 / 已佩戴徽章」由本组件上报，页面那边不重复打接口（与 InvitePanel 的 stats 同理）。
   刷新走页面读数条上的按钮，这里不自带刷新按钮。 */
const emit = defineEmits<{
    (event: 'stats', acquired: number, total: number, equipped: number): void
}>()
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
        // 放在 finally：接口失败也要把读数条上的占位符收掉，否则页面永远停在「—」
        emit('stats', acquiredCount.value, allBadges.value.length, equippedCount.value)
    }
}

/* 页面顶部的读数条由「勋章与邀请」页（BadgeCenterView）渲染，刷新按钮挂在它上面，这里把重载方法暴露出去。 */
defineExpose({ reload: loadBadges })

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
        <header class="wb-card-head">
            <div class="wb-card-head__title-block">
                <h3 class="wb-card-head__title">{{ username ? `${username} 的徽章` : '我的徽章墙' }}</h3>
                <p class="wb-card-head__desc">
                    已获得 {{ acquiredCount }} / {{ allBadges.length }} 个徽章<template v-if="isOwn">，已佩戴 {{ equippedCount }} 个</template>
                </p>
            </div>
            <div v-if="loading" class="wb-card-head__actions">
                <span class="wb-badge">同步中</span>
            </div>
        </header>

        <div class="badge-wall__groups">
            <section v-for="group in groups" :key="group.key" class="badge-wall__group">
                <h3 class="wb-subhead">{{ group.title }}</h3>
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
        <p v-if="isOwn && !loading" class="wb-note badge-wall__hint">点击已获得的徽章可佩戴或取消佩戴（支持多个）。</p>
    </section>
</template>

<style scoped>
/* 版式走工作台统一层（.wb-card-head / .wb-badge / .wb-subhead / .wb-note，尺寸与强调色取 --wb-* 令牌），
   本组件只保留徽章格子的排布。原来这里自带一套 10px 字、6px/4px 圆角与 #2563eb / #94a3b8 的色板，
   卡头 24px 标题、徽章格 6px 圆角，与相邻卡片的 18px 标题、12px 圆角不是同一档，
   同一页里两块内容像是拼起来的。
   组名原先写在组件里（12px 灰），与券包分组的 13px 墨是两个观感，现改用统一层的 .wb-subhead；
   底部提示改用 .wb-note（与卡头说明同一档 12px 说明色）。 */
.badge-wall {
    display: grid;
    gap: 14px;
}

.badge-wall__groups,
.badge-wall__group {
    display: grid;
    gap: 8px;
}

.badge-wall__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 88px);
    gap: 10px;
    justify-content: start;
}

.badge-wall__badge {
    display: grid;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--wb-line);
    border-radius: var(--wb-radius-item);
    background: var(--profile-card-bg-strong, #ffffff);
    color: var(--profile-text-soft, #8a94a6);
    filter: grayscale(1);
    min-width: 0;
    min-height: 0;
    width: 88px;
    overflow: hidden;
}

.badge-wall__badge.acquired {
    border-color: var(--wb-accent-line);
    background: linear-gradient(180deg, var(--wb-accent-soft), rgba(255, 255, 255, 0.96));
    color: var(--profile-text-main, #0f172a);
    filter: none;
}

.badge-wall__badge.interactable {
    cursor: pointer;
}

.badge-wall__badge.interactable:hover {
    border-color: var(--wb-accent);
}

.badge-wall__badge.equipped {
    border-color: var(--wb-accent);
    box-shadow: 0 0 0 1px var(--wb-accent-soft) inset;
}

/* 徽章格只有 88px 宽，装不下统一层 .wb-badge 的 28px 高 / 0 12px 内边距，
   所以这里保留紧凑形态（标签与角标档 11px），只把中性底色换成统一层的 --wb-tag-bg：
   颜色与 .wb-badge 同源，尺寸按格子收一档。 */
.badge-wall__equip-state {
    margin-top: 2px;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--wb-tag-bg, rgba(148, 163, 184, 0.12));
    color: var(--profile-text-sub, #64748b);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
    text-align: center;
}

.badge-wall__equip-state.is-on {
    background: var(--wb-accent-soft);
    color: var(--wb-accent);
}

.badge-wall__icon {
    font-size: 16px;
}

.badge-wall__icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.badge-wall__badge strong {
    font-size: 12px;
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
    font-size: 11px;
    line-height: 1.4;
}

.badge-wall__badge small {
    color: var(--profile-text-sub, #64748b);
    font-weight: 700;
}

@media (max-width: 640px) {
    .badge-wall__grid {
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    }

    .badge-wall__badge {
        width: auto;
    }
}
</style>