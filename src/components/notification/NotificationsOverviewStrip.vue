<script setup lang="ts">
import { Refresh, TButton, TIcon } from 'ui_73info'

/**
 * 「系统通知」的顶部读数条：全部通知 / 待我处理，最右是页面级刷新。
 *
 * 两端共用用户工作台这一层（`.wb-strip`）。原先还有一格「资源过户」，该能力整体下线
 * （契约里没有 `/resources/transfers/**`），读数格一并去掉。
 *
 * 刷新按钮只留这一个入口（卡片头不再重复给一颗），点了整页重拉。
 */
defineProps<{
  loading: boolean
  /** 全部通知：首屏或警告接口失败且没有已取得卡片时显示占位横杠 */
  total: number | null
  /** 待我处理：还在等我投的那一票 */
  pending: number
}>()

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <section class="wb-strip" aria-label="系统通知概览">
    <div class="wb-strip__item">
      <span class="wb-strip__label">全部通知</span>
      <span class="wb-strip__value">{{ total === null || (loading && !total) ? '—' : total }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">待我处理</span>
      <span class="wb-strip__value">{{ pending }}</span>
    </div>
    <div class="wb-strip__item wb-strip__action">
      <TButton
        icon-only
        aria-label="刷新系统通知"
        title="刷新系统通知"
        :loading="loading"
        @click="emit('refresh')"
      >
        <TIcon>
          <Refresh />
        </TIcon>
      </TButton>
    </div>
  </section>
</template>
