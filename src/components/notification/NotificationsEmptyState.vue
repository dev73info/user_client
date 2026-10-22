<script setup lang="ts">
import { Bell, RefreshLeft, TButton, TIcon } from 'ui_73info'

/**
 * 「系统通知」的空态：一个铃铛图标 + 一句标题，筛选状态下再加「换个关键词」的提示与清空按钮。
 *
 * 标题由页面给（无通知 / 该类别暂无 / 没有匹配），组件只负责把它摆在读数条与列表之间那块
 * 统一层的空态框（`.wb-empty`）里——空态文案的分支判断留在数据层，这里不做任何判断，
 * 免得同一句「没有匹配的系统通知」两处写法各说各的。
 */
defineProps<{
  title: string
  /** 是否有生效的筛选：有筛选才给「清空筛选」这条路，否则空态无从可清 */
  active: boolean
}>()

const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="wb-empty notifications-empty">
    <span class="notifications-empty__icon">
      <TIcon :icon="Bell" />
    </span>
    <span class="wb-empty__title notifications-empty__title">{{ title }}</span>
    <p v-if="active" class="notifications-empty__hint">换个关键词，或清空筛选查看全部通知。</p>
    <div v-if="active" class="wb-empty__actions notifications-empty__actions">
      <TButton variant="outline" @click="emit('reset')">
        <TIcon>
          <RefreshLeft />
        </TIcon>
        <span>清空筛选</span>
      </TButton>
    </div>
  </div>
</template>

<style scoped>
.notifications-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
}

.notifications-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin-bottom: 2px;
  border-radius: 50%;
  background: var(--nc-empty-icon-bg);
  color: var(--nc-empty-icon-text);
  font-size: 21px;
}

/* 统一层的空态标题有固定色，这里跟随正文色，让图标与标题一起淡下去 */
.notifications-empty__title {
  color: inherit;
}

.notifications-empty__hint {
  margin: 0;
  color: var(--nc-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.notifications-empty__actions {
  margin-top: 4px;
}
</style>
