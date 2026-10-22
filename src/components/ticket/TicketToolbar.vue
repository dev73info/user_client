<script setup lang="ts">
import type { TicketPriority, TicketStatus } from '@/shared/ticketDisplay'
import { TICKET_PRIORITY_FILTER_OPTIONS, TICKET_STATUS_OPTIONS } from '@/shared/ticketDisplay'
import { TButton, TIcon, TInput, TSelect, TOption, RefreshLeft, Search } from 'ui_73info'

/**
 * 工单中心左栏的工具栏：状态 / 优先级两个筛选 + 关键词搜索 + 重置。
 *
 * 两侧都有、位置一致（卡片内部、卡片头正下方）。本页左栏只有 280–420px，
 * 一行摆不下「筛选 150 + 筛选 150 + 搜索 340 + 重置」，所以挂 --stacked：
 * 固定折成两行——第一行「两个筛选 + 右侧重置」，第二行搜索占满。
 * 段序与宽栏一致，控件规格也还是统一层那一套（dev-base.css / portal-workbench.css），
 * 原来靠裸 flex-wrap 兜底会折成三行、高 128px，与其它页 36px 的单行工具栏差得远。
 *
 * 只在本地已加载的工单上过滤，不额外打接口；条件通过 `update:*` 回传给页面。
 */
defineProps<{ dev: boolean; hasActiveFilter: boolean; filteredTotal: number }>()

defineEmits<{ reset: [] }>()

const statusFilter = defineModel<'all' | TicketStatus>('statusFilter', { required: true })
const priorityFilter = defineModel<'all' | TicketPriority>('priorityFilter', { required: true })
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
</script>

<template>
  <div v-if="dev" class="dev-toolbar dev-toolbar--stacked">
    <TSelect v-model="statusFilter" class="dev-toolbar__field" aria-label="按状态筛选">
      <TOption
        v-for="option in TICKET_STATUS_OPTIONS"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </TSelect>
    <TSelect v-model="priorityFilter" class="dev-toolbar__field" aria-label="按优先级筛选">
      <TOption
        v-for="option in TICKET_PRIORITY_FILTER_OPTIONS"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </TSelect>
    <TInput
      v-model="searchKeyword"
      class="dev-toolbar__search"
      clearable
      placeholder="搜索工单标题、编号或分类"
    >
      <template #prefix>
        <TIcon>
          <Search />
        </TIcon>
      </template>
    </TInput>
    <div class="dev-toolbar__actions">
      <span v-if="hasActiveFilter" class="dev-toolbar__hint">筛选出 {{ filteredTotal }} 条</span>
      <TButton variant="outline" @click="$emit('reset')">
        <TIcon>
          <RefreshLeft />
        </TIcon>
        <span>重置</span>
      </TButton>
    </div>
  </div>

  <div v-else class="wb-toolbar wb-toolbar--stacked">
    <TSelect v-model="statusFilter" class="wb-toolbar__field" aria-label="按状态筛选">
      <TOption
        v-for="option in TICKET_STATUS_OPTIONS"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </TSelect>
    <TSelect v-model="priorityFilter" class="wb-toolbar__field" aria-label="按优先级筛选">
      <TOption
        v-for="option in TICKET_PRIORITY_FILTER_OPTIONS"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </TSelect>
    <TInput
      v-model="searchKeyword"
      class="wb-toolbar__search"
      clearable
      placeholder="搜索工单标题、编号或分类"
    >
      <template #prefix>
        <TIcon>
          <Search />
        </TIcon>
      </template>
    </TInput>
    <div class="wb-toolbar__actions">
      <span v-if="hasActiveFilter" class="wb-toolbar__hint">筛选出 {{ filteredTotal }} 条</span>
      <TButton variant="outline" @click="$emit('reset')">
        <TIcon>
          <RefreshLeft />
        </TIcon>
        <span>重置</span>
      </TButton>
    </div>
  </div>
</template>
