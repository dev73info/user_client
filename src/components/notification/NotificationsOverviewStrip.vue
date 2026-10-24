<script setup lang="ts">
import { Refresh, TButton, TIcon } from 'ui_73info'

/**
 * 「系统通知」的顶部读数条：全部通知 / 待我处理 / 第三格 / 平台公告，最右是页面级刷新。
 *
 * 两端共用用户工作台这一层（`.wb-strip`），第三格按工作台切换：开发者看「资源过户」，
 * 用户端看「评论警告」——用户端没有过户这一类，摆一格恒为 0 的读数只会让人以为功能坏了。
 *
 * 刷新按钮只留这一个入口（卡片头不再重复给一颗），点了整页重拉四支接口。
 */
defineProps<{
  /** 开发者工作台：第三格换成「资源过户」 */
  dev: boolean
  loading: boolean
  /** 全部通知：首屏还没回来时显示占位横杠，不要显示「0 条」误导人 */
  total: number
  /** 待我处理：需要投票或处理过户的条数 */
  pending: number
  transferCount: number
  warningCount: number
  announcementCount: number
}>()

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <section class="wb-strip" aria-label="系统通知概览">
    <div class="wb-strip__item">
      <span class="wb-strip__label">全部通知</span>
      <span class="wb-strip__value">{{ loading && !total ? '—' : total }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">待我处理</span>
      <span class="wb-strip__value">{{ pending }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div v-if="dev" class="wb-strip__item">
      <span class="wb-strip__label">资源过户</span>
      <span class="wb-strip__value">{{ transferCount }}</span>
    </div>
    <div v-else class="wb-strip__item">
      <span class="wb-strip__label">评论警告</span>
      <span class="wb-strip__value">{{ warningCount }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">平台公告</span>
      <span class="wb-strip__value">{{ announcementCount }}</span>
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
