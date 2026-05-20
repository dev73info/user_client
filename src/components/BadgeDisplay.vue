<script setup lang="ts">
import { computed } from 'vue'
import type { BadgeDefinition, UserBadge } from '@/api/invite'

const props = withDefaults(
    defineProps<{
        badges: Array<BadgeDefinition | UserBadge>
        limit?: number
        compact?: boolean
    }>(),
    {
        limit: 4,
        compact: false,
    },
)

const visibleBadges = computed(() => props.badges.slice(0, props.limit))
const overflowCount = computed(() => Math.max(props.badges.length - visibleBadges.value.length, 0))

function isBadgeIconSvg(icon: string) {
  return icon.startsWith('badges/')
}

function badgeIconUrl(icon: string) {
  return `/uploads/${icon}`
}
</script>

<template>
    <div class="badge-display" :class="{ 'badge-display--compact': compact }" aria-label="徽章">
        <span v-for="badge in visibleBadges" :key="badge.code" class="badge-display__item"
            :title="`${badge.name}：${badge.description}`">
            <span class="badge-display__icon">
                <img
                    v-if="isBadgeIconSvg(badge.icon)"
                    :src="badgeIconUrl(badge.icon)"
                    class="badge-display__icon-img"
                    alt=""
                />
                <template v-else>{{ badge.icon }}</template>
            </span>
            <span v-if="!compact" class="badge-display__name">{{ badge.name }}</span>
        </span>
        <span v-if="overflowCount > 0" class="badge-display__more">+{{ overflowCount }}</span>
    </div>
</template>

<style scoped>
.badge-display {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.badge-display__item,
.badge-display__more {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    border: 1px solid rgba(191, 219, 254, 0.72);
    border-radius: 8px;
    background: rgba(239, 246, 255, 0.9);
    color: #1e3a8a;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
}

.badge-display__item {
    gap: 4px;
    padding: 4px 8px;
}

.badge-display__more {
    padding: 4px 7px;
}

.badge-display__icon {
    font-size: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.badge-display__icon-img {
    width: 15px;
    height: 15px;
    object-fit: contain;
}

.badge-display__name {
    white-space: nowrap;
}

.badge-display--compact .badge-display__item {
    width: 28px;
    justify-content: center;
    padding: 4px;
}
</style>