<script setup lang="ts">
import { TButton, TIcon, Refresh } from 'ui_73info'

/**
 * 消息中心的顶部读数条：已开启会话 / 待同步会话 / 近 7 天更新，最右是页面级刷新。
 *
 * 两侧都是「一条读数横条」，只是各自落在自己的统一层上——开发者工作台用 `.dev-meta-strip`、
 * 用户工作台与独立页用 `.wb-strip`。读数在左，刷新固定在最右侧 `__action` 槽：刷新在整个页面
 * 只留这一个入口，卡片头不再重复给一颗。
 */
defineProps<{
  /** 开发者工作台模式：换一套统一层的类名（.dev-meta-strip），读数口径不变 */
  dev: boolean
  loading: boolean
  conversationCount: number
  pendingCount: number
  recentCount: number
}>()

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
  <div v-if="dev" class="dev-meta-strip" aria-label="消息概览">
    <div class="dev-meta-strip__item">
      <span class="dev-meta-strip__label">已开启会话</span>
      <span class="dev-meta-strip__value">{{ conversationCount }}</span>
    </div>
    <div class="dev-meta-strip__divider" />
    <div class="dev-meta-strip__item">
      <span class="dev-meta-strip__label">待同步会话</span>
      <span class="dev-meta-strip__value">{{ pendingCount }}</span>
    </div>
    <div class="dev-meta-strip__divider" />
    <div class="dev-meta-strip__item">
      <span class="dev-meta-strip__label">近 7 天更新</span>
      <span class="dev-meta-strip__value">{{ recentCount }}</span>
    </div>
    <div class="dev-meta-strip__item dev-meta-strip__action">
      <TButton
        icon-only
        aria-label="刷新消息"
        title="刷新消息"
        :loading="loading"
        @click="emit('refresh')"
      >
        <TIcon>
          <Refresh />
        </TIcon>
      </TButton>
    </div>
  </div>

  <section v-else class="wb-strip" aria-label="消息概览">
    <div class="wb-strip__item">
      <span class="wb-strip__label">已开启会话</span>
      <span class="wb-strip__value">{{ conversationCount }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">待同步会话</span>
      <span class="wb-strip__value">{{ pendingCount }}</span>
    </div>
    <div class="wb-strip__divider" />
    <div class="wb-strip__item">
      <span class="wb-strip__label">近 7 天更新</span>
      <span class="wb-strip__value">{{ recentCount }}</span>
    </div>
    <div class="wb-strip__item wb-strip__action">
      <TButton
        icon-only
        aria-label="刷新消息"
        title="刷新消息"
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
