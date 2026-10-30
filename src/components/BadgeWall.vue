<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { TButton } from 'ui_73info'

import {
  getBadges,
  getMyBadges,
  getUserBadges,
  setMyEquippedBadges,
  type BadgeDefinition,
  type UserBadge,
} from '@/api/invite'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(defineProps<{ username?: string; publicOnly?: boolean }>(), {
  username: '',
  publicOnly: false,
})
const emit = defineEmits<{
  (event: 'stats', acquired: number, total: number, equipped: number, failed: boolean): void
}>()
const auth = useAuthStore()
const allBadges = ref<BadgeDefinition[]>([])
const earnedBadges = ref<UserBadge[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
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

async function toggleEquip(badge: BadgeDefinition) {
  const current = earnedMap.value.get(badge.code)
  if (!isOwn.value || saving.value || !current) return
  const codes = earnedBadges.value
    .filter((item) => item.equipped && item.code !== badge.code)
    .map((item) => item.code)
  if (!current.equipped) codes.push(badge.code)
  saving.value = true
  loadError.value = ''
  try {
    earnedBadges.value = (await setMyEquippedBadges(auth.token!, codes)).badges
    emit('stats', acquiredCount.value, allBadges.value.length, equippedCount.value, false)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '更新佩戴徽章失败'
  } finally {
    saving.value = false
  }
}

async function loadBadges() {
  loading.value = true
  loadError.value = ''
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
    emit('stats', acquiredCount.value, allBadges.value.length, equippedCount.value, false)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载徽章失败'
    emit('stats', 0, 0, 0, true)
  } finally {
    loading.value = false
  }
}

defineExpose({ reload: loadBadges })
watch(
  () => [props.username, auth.token],
  () => void loadBadges(),
)
onMounted(() => {
  auth.hydrate()
  void loadBadges()
})
</script>

<template>
  <section class="badge-wall" aria-label="徽章墙" :aria-busy="loading">
    <header class="wb-card-head">
      <div class="wb-card-head__title-block">
        <h3 class="wb-card-head__title">{{ username ? `${username} 的徽章` : '我的徽章墙' }}</h3>
        <p class="wb-card-head__desc">
          已获得 {{ acquiredCount }} / {{ allBadges.length }} 个徽章<template v-if="isOwn"
            >，已佩戴 {{ equippedCount }} 个</template
          >
        </p>
      </div>
    </header>
    <div v-if="loadError" class="wb-empty" role="alert">
      <span>{{ loadError }}</span>
      <TButton :loading="loading" @click="loadBadges">重试</TButton>
    </div>
    <p v-if="loading && !allBadges.length" class="wb-empty" role="status">正在加载徽章…</p>
    <div v-else class="badge-wall__groups">
      <section v-for="group in groups" :key="group.key" class="badge-wall__group">
        <h3 class="wb-subhead">{{ group.title }}</h3>
        <div class="badge-wall__grid">
          <button
            v-for="badge in group.badges"
            :key="badge.code"
            type="button"
            class="badge-wall__badge"
            :class="{
              acquired: earnedMap.has(badge.code),
              equipped: earnedMap.get(badge.code)?.equipped,
            }"
            :disabled="!canEquip(badge) || saving"
            :title="
              earnedMap.get(badge.code)?.equipped
                ? `${badge.name}：${badge.description}（佩戴中）`
                : `${badge.name}：${badge.description}`
            "
            @click="toggleEquip(badge)"
          >
            <span class="badge-wall__icon">
              <img v-if="badge.icon.startsWith('badges/')" :src="`/uploads/${badge.icon}`" alt="" />
              <template v-else>{{ badge.icon }}</template>
            </span>
            <strong>{{ badge.name }}</strong>
            <span class="badge-wall__description">{{ badge.description }}</span>
            <span
              v-if="canEquip(badge)"
              class="badge-wall__equip-state"
              :class="{ 'is-on': earnedMap.get(badge.code)?.equipped }"
            >
              {{ earnedMap.get(badge.code)?.equipped ? '佩戴中' : '佩戴' }}
            </span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.badge-wall,
.badge-wall__groups,
.badge-wall__group {
  display: grid;
  gap: 14px;
}
.badge-wall__group {
  gap: 8px;
}
.badge-wall__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
}
.badge-wall__badge {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--wb-line);
  border-radius: var(--wb-radius-item);
  background: var(--73-surface-strong);
  color: var(--73-ink-muted);
  font: inherit;
  text-align: left;
  filter: grayscale(1);
}
.badge-wall__badge.acquired {
  border-color: var(--wb-accent-line);
  /* 已获得只做「淡底」：徽章墙是一整片小格子，用渐变会让每格都在发光，看不出哪块是重点。 */
  background: color-mix(in srgb, var(--73-accent) 5%, var(--73-surface-strong));
  color: var(--73-ink);
  filter: none;
}
.badge-wall__badge:not(:disabled) {
  cursor: pointer;
}
.badge-wall__badge:not(:disabled):hover,
.badge-wall__badge.equipped {
  border-color: var(--wb-accent);
}
.badge-wall__badge:disabled {
  cursor: default;
}
.badge-wall__icon {
  min-height: 22px;
  font-size: 18px;
}
.badge-wall__icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.badge-wall__description {
  min-height: 2.8em;
  font-size: 12px;
  line-height: 1.4;
}
.badge-wall__equip-state {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--wb-tag-bg);
  color: var(--73-ink-muted);
  font-size: 11px;
  text-align: center;
}
.badge-wall__equip-state.is-on {
  background: var(--wb-accent-soft);
  color: var(--wb-accent);
}
@media (max-width: 640px) {
  .badge-wall__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
