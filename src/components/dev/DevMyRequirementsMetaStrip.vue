<script setup lang="ts">
import { computed } from 'vue'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { RequirementItem } from '@/api/devRequirements'
import { receiptMoney } from '@/shared/devDelivery'

import { TButton, TIcon, Refresh } from 'ui_73info'

/**
 * 「我的接单」顶部读数条：总需求单 / 已关联资源 / 开发中 / 累计到账 + 刷新。
 *
 * 四格读数都是**本页那两份数据自己**（需求单、行上的到账合计）推出来的薄聚合，
 * 与需求大厅顶栏同构；`WorkbenchBarSlot` 因此跟着读数一起搬进来
 * （窄屏它会把这整条搬进工作台顶栏），页面不再为这一条留 36 行模板。
 */
const props = defineProps<{
  /** 需求单列表（页面的单实例，这里只读，用来数条数） */
  rows: RequirementItem[]
  /** 累计到账：所有行上到账合计的和，与「收益钱包」的入账口径同源 */
  incomeTotal: number
  /** 列表刷新中（刷新按钮的转圈） */
  loading: boolean
}>()

const emit = defineEmits<{
  /** 重新拉列表 */
  refresh: []
}>()

/** 已关联资源的条数 */
const boundCount = computed(
  () => props.rows.filter((item) => item.bound_resource_id != null).length,
)
/** 开发中的条数 */
const activeCount = computed(
  () => props.rows.filter((item) => item.status === 'in_development').length,
)
</script>

<template>
  <WorkbenchBarSlot>
    <div class="dev-meta-strip">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">总需求单</span>
        <span class="dev-meta-strip__value">{{ rows.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已关联资源</span>
        <span class="dev-meta-strip__value">{{ boundCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">开发中</span>
        <span class="dev-meta-strip__value">{{ activeCount }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">累计到账</span>
        <span class="dev-meta-strip__value">{{ receiptMoney(incomeTotal) }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton :loading="loading" icon-only aria-label="刷新接单列表" @click="emit('refresh')">
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </div>
  </WorkbenchBarSlot>
</template>
