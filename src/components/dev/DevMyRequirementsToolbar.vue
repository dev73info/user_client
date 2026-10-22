<script setup lang="ts">
import { TIcon, TInput, TOption, TSelect, Search } from 'ui_73info'

/**
 * 「接单与交付」的筛选工具条：状态档位、关键词与筛选计数。
 * 档位与取数都在页面（行是页面的单实例），这里只画控件、把值双向绑回去。
 */
const status = defineModel<string>('status', { required: true })
const keyword = defineModel<string>('keyword', { required: true })

defineProps<{
  hasActiveFilters: boolean
  filteredCount: number
  totalCount: number
}>()
</script>

<template>
  <div class="dev-toolbar">
    <TSelect
      v-model="status"
      clearable
      placeholder="需求状态"
      class="dev-toolbar__field"
      aria-label="按需求状态筛选"
    >
      <TOption label="待签合同" value="contract_pending" />
      <TOption label="待缴定金" value="pending_deposit" />
      <TOption label="开发中" value="in_development" />
      <TOption label="待付尾款" value="pending_final" />
      <TOption label="待分账" value="pending_settlement" />
      <TOption label="已完成" value="completed" />
      <TOption label="已取消" value="cancelled" />
      <TOption label="需求已解绑" value="unlinked" />
    </TSelect>

    <TInput
      v-model="keyword"
      clearable
      placeholder="搜索需求编号、标题、资源、版本或流水号"
      class="dev-toolbar__search"
    >
      <template #prefix>
        <TIcon>
          <Search />
        </TIcon>
      </template>
    </TInput>

    <div class="dev-toolbar__actions">
      <span v-if="hasActiveFilters" class="dev-toolbar__hint">
        筛选出 {{ filteredCount }} / {{ totalCount }} 条
      </span>
    </div>
  </div>
</template>
