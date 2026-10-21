<script setup lang="ts">
import { RouterLink } from 'vue-router'

/**
 * 首页侧栏「内测中」卡片：徽标 + 每日签到 / 邀请有礼 + 加入 QQ 群。
 *
 * 纯展示组件：签到是写操作，状态与动作在 `composables/useHomeCheckin.ts`，
 * 这里只收 `checkin` / `checkinSaving` 并按 `checkin` 事件回抛；QQ 群地址也由视图负责打开。
 * 样式仍在全局 `styles/home.css`（`.portal-beta-notice*`），本组件不带 `<style>`。
 */

/** 签到状态只用到这三个字段，视图那边传 `CheckinStatus` 即可（结构兼容）。 */
type CheckinSummary = {
  today_checked_in: boolean
  today_potential: number
  streak_count: number
}

withDefaults(
  defineProps<{
    /** 是否已登录：未登录只露徽标与 QQ 群按钮 */
    isAuthed: boolean
    /** 今日签到状态；null 表示未登录或拿不到状态，按「已签到」渲染（露邀请有礼） */
    checkin: CheckinSummary | null
    /** 签到请求进行中 */
    checkinSaving?: boolean
  }>(),
  { checkin: null, checkinSaving: false },
)

const emit = defineEmits<{
  (e: 'checkin'): void
  (e: 'open-group'): void
}>()
</script>

<template>
  <section class="portal-card portal-section--beta">
    <div class="portal-beta-notice">
      <span class="portal-beta-notice__badge">内测中</span>

      <div v-if="isAuthed" class="portal-beta-invite">
        <template v-if="checkin && !checkin.today_checked_in">
          <span class="portal-beta-invite__title">📅 每日签到</span>
          <p class="portal-beta-invite__text">
            今日签到可得
            <strong>{{ checkin.today_potential }}</strong>
            积分，连续签到
            <strong>{{ checkin.streak_count }}</strong>
            天。
          </p>
          <button
            class="portal-checkin-card__cta"
            type="button"
            :disabled="checkinSaving"
            @click="emit('checkin')"
          >
            {{ checkinSaving ? '签到中…' : '立即签到' }}
          </button>
        </template>
        <template v-else>
          <span class="portal-beta-invite__title">🎁 邀请有礼</span>
          <p class="portal-beta-invite__text">每邀请一位好友注册，即可解锁专属徽章和排行榜荣誉</p>
          <RouterLink class="portal-beta-invite__cta" :to="{ name: 'workbench-badges' }">
            立即邀请
          </RouterLink>
        </template>
      </div>

      <button class="portal-beta-notice__btn" type="button" @click="emit('open-group')">
        加入QQ群
      </button>
    </div>
  </section>
</template>
