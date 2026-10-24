<script setup lang="ts">
import { TButton } from 'ui_73info'

/**
 * 帖子详情区的悬赏条：一句悬赏状态 + 作者的「取消悬赏」。
 *
 * 零耦合：文案与「能不能取消」都由视图算好传进来，自己不认识 api、不发路由、
 * 不弹全局提示，只在按钮被点时发一个 `cancel`——请求与回写都在 `useCommunityBounty`。
 */
defineProps<{
  /** 悬赏文案（`useCommunityBounty` 的 `selectedPostBountyLabel`），空串表示这笔帖子没有悬赏。 */
  label: string
  /**
   * 悬赏状态，决定徽标的配色档。这里就地写成字面量联合而不是从 `@/api/community` 引类型：
   * 组件层不引 api 模块（同 `ShareCardGenerator` 之类的既有子组件口径）。
   */
  status: 'none' | 'active' | 'closed' | 'cancelled'
  /** 当前登录人能不能取消这笔悬赏（本人帖子 + 悬赏进行中）。 */
  canCancel: boolean
}>()

const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <div v-if="label" class="community-bounty-bar">
    <span class="community-bounty-badge" :class="`is-${status}`">{{ label }}</span>
    <TButton
      v-if="canCancel"
      variant="outline"
      tone="warning"
      class="community-bounty-cancel-button"
      @click="emit('cancel')"
    >
      取消悬赏
    </TButton>
  </div>
</template>

<style scoped>
.community-bounty-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

/* 悬赏徽标：三档配色各自取令牌（警示 / 信息 / 中性），不再写裸色值 */
.community-bounty-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border: 1px solid var(--73-warning-line);
  border-radius: var(--73-radius-pill);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}

.community-bounty-badge.is-closed {
  border-color: var(--73-info-line);
  background: var(--73-info-soft);
  color: var(--73-info-text);
}

.community-bounty-badge.is-cancelled {
  border-color: var(--73-neutral-line);
  background: var(--73-neutral-soft);
  color: var(--73-neutral-text);
}
</style>
