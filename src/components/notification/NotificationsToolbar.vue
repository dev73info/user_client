<script setup lang="ts">
import type { NotificationKindFilter } from '@/composables/useNotificationCenter'
import { RefreshLeft, Search, TButton, TIcon, TInput } from 'ui_73info'

/**
 * 「系统通知」的筛选工具栏：类别胶囊 + 关键词搜索 + 命中计数 + 重置。
 *
 * 三类都是一次全量取回，所以筛选纯在前端做，不打接口；
 * 胶囊上的数字与顶栏读数条同源（`countByKind`），切了筛选也还是各类的总数。
 * 窄屏（900 以下）不展示类别胶囊：各类数量已在读数条里，列表只留搜索。
 */
defineProps<{
  /** 胶囊选项：全部 + 三个类别，带各自条数 */
  options: Array<{ value: NotificationKindFilter; label: string; count: number }>
  /** 未经筛选的总条数 */
  total: number
  /** 筛选后的条数 */
  filteredTotal: number
  /** 当前是否有生效的筛选（关键词或类别） */
  active: boolean
}>()

const emit = defineEmits<{ reset: [] }>()

const kindFilter = defineModel<NotificationKindFilter>('kindFilter', { required: true })
const keyword = defineModel<string>('keyword', { required: true })
</script>

<template>
  <div class="wb-toolbar">
    <div class="wb-chip-group" role="group" aria-label="通知类别">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="wb-chip wb-chip--button"
        :class="{ 'is-active': kindFilter === option.value }"
        :aria-pressed="kindFilter === option.value"
        @click="kindFilter = option.value"
      >
        {{ option.label }}<span class="wb-chip__count">{{ option.count }}</span>
      </button>
    </div>
    <TInput
      v-model="keyword"
      class="wb-toolbar__search"
      clearable
      placeholder="搜索标题或内容"
      aria-label="搜索系统通知"
    >
      <template #prefix>
        <TIcon>
          <Search />
        </TIcon>
      </template>
    </TInput>
    <div class="wb-toolbar__actions">
      <span class="wb-toolbar__hint">
        {{ active ? `筛选出 ${filteredTotal} / ${total} 条` : `共 ${total} 条` }}
      </span>
      <TButton v-if="active" variant="outline" @click="emit('reset')">
        <TIcon>
          <RefreshLeft />
        </TIcon>
        <span>重置</span>
      </TButton>
    </div>
  </div>
</template>

<style scoped>
/* 窄屏不展示类别胶囊：各类数量已在顶栏读数条里，列表只留搜索 */
@media (max-width: 900px) {
  .wb-chip-group {
    display: none;
  }
}
</style>
