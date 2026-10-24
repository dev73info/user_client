<script setup lang="ts">
import { TButton, TIcon, Plus, RefreshLeft, Tickets } from 'ui_73info'

/**
 * 工单中心左栏的空态：没有工单时给引导（图标 + 标题 + 说明 + 主行动入口），
 * 筛选无结果时给「清除筛选」的出口。两种都落在统一层的虚线框里
 * （开发者侧 .dev-empty-state / 门户侧 .wb-empty），这里只补框内排版。
 */
defineProps<{
  dev: boolean
  /** 列表里是否已有工单：有工单却看到空态，说明是筛没了，不是真没有。 */
  hasTickets: boolean
  hasActiveFilter: boolean
}>()

defineEmits<{ reset: []; compose: [] }>()
</script>

<template>
  <div :class="dev ? 'dev-empty-state ticket-empty-state' : 'wb-empty ticket-empty-state'">
    <template v-if="hasTickets && hasActiveFilter">
      <span class="ticket-empty-state__title">没有符合筛选条件的工单</span>
      <p class="ticket-empty-state__desc">换个状态或关键词，也可以清除筛选后重试。</p>
      <div class="ticket-empty-state__actions">
        <TButton variant="outline" @click="$emit('reset')">
          <TIcon>
            <RefreshLeft />
          </TIcon>
          <span>清除筛选</span>
        </TButton>
      </div>
    </template>
    <template v-else>
      <span class="ticket-empty-state__icon" aria-hidden="true">
        <TIcon>
          <Tickets />
        </TIcon>
      </span>
      <span class="ticket-empty-state__title">还没有提交过工单</span>
      <p class="ticket-empty-state__desc">遇到问题或有疑问？提交一张工单，我们会尽快跟进处理。</p>
      <div class="ticket-empty-state__actions">
        <TButton variant="solid" tone="accent" @click="$emit('compose')">
          <TIcon>
            <Plus />
          </TIcon>
          <span>提交第一张工单</span>
        </TButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 统一层的 .wb-empty / .dev-empty-state 只给虚线框与居中，
   这里补「图标 + 标题 + 说明 + 动作」的排版。图标底色用主色浅底，
   --wb-accent 与开发者侧 --dev-blue 同值，两种模式共用一套即可。 */
.ticket-empty-state {
  display: grid;
  justify-items: center;
  gap: 6px;
  max-width: 440px;
  margin-inline: auto;
}

.ticket-empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: var(--wb-accent-soft);
  color: var(--wb-accent);
  font-size: 20px;
}

/* 门户侧 .profile-page 与开发者侧 :root 各有一套同值令牌，两级回退取色不变，
   免得在这两个文件里留裸色值（R047 的裸色值口径）。 */
.ticket-empty-state__title {
  color: var(--profile-text-main, var(--dev-ink));
  font-size: 15px;
  font-weight: 700;
}

.ticket-empty-state__desc {
  margin: 0;
  color: var(--profile-text-sub, var(--dev-muted));
  font-size: 13px;
  line-height: 1.7;
}

.ticket-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

/* 用户工作台侧的空态走统一层 .wb-empty，里面的段落自带外边距，这里复位一次 */
.wb-empty p {
  margin: 0;
}
</style>
