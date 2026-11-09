<script setup lang="ts">
import { CircleCheck, Refresh, TButton, TIcon } from 'ui_73info'

/**
 * 「系统通知」的顶部读数条：全部通知 / 未读 / 待我处理，右侧是「全部已读」与页面级刷新。
 *
 * 两端共用用户工作台这一层（`.wb-strip`）。未读数来自后端收件箱（不受筛选影响），
 * 本地三支没有已读字段，不计入未读。刷新与全部已读都只有这一个入口。
 */
defineProps<{
  loading: boolean
  /** 全部通知：首屏或接口失败且没有已取得卡片时显示占位横杠 */
  total: number | null
  /** 未读：后端收件箱里还没读过的条数 */
  unread: number
  /** 待我处理：还在等我投的那一票 */
  pending: number
  /** 正在全部标记已读 */
  markingAll?: boolean
}>()

const emit = defineEmits<{ refresh: []; markAllRead: [] }>()
</script>

<template>
  <section class="wb-strip" aria-label="系统通知概览">
    <div class="wb-strip__item">
      <span class="wb-strip__label">全部通知</span>
      <span class="wb-strip__value">{{ total === null || (loading && !total) ? '—' : total }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">未读</span>
      <span class="wb-strip__value">{{ loading && !total ? '—' : unread }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">待我处理</span>
      <span class="wb-strip__value">{{ pending }}</span>
    </div>
    <div class="wb-strip__item wb-strip__action">
      <TButton
        variant="text"
        :disabled="unread === 0"
        :loading="markingAll"
        @click="emit('markAllRead')"
      >
        <TIcon>
          <CircleCheck />
        </TIcon>
        <span>全部已读</span>
      </TButton>
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
