<script setup lang="ts">
import {
  transferParties,
  transferReference,
  transferStatusLabel,
  transferStatusTone,
  transferTitle,
  type TransferApplication,
  type TransferDirection,
  type TransferKind,
} from '@/shared/resourceTransfer'
import { TButton } from 'ui_73info'

defineProps<{
  title: string
  kind: TransferKind
  direction: TransferDirection
  items: TransferApplication[]
  busyKey: string
}>()

const emit = defineEmits<{
  action: [payload: { item: TransferApplication; action: 'accept' | 'reject' | 'cancel' }]
}>()

/** 状态标签走统一 wb-badge；neutral 用默认灰，其余 tone 直接对应修饰类。 */
function statusBadgeClass(status: string) {
  const tone = transferStatusTone(status)
  return tone === 'neutral' ? 'wb-badge' : `wb-badge wb-badge--${tone}`
}
</script>

<template>
  <section class="transfer-list" :aria-label="title">
    <h4 class="wb-subhead transfer-list__title">{{ title }}</h4>
    <div v-if="!items.length" class="wb-empty" role="status">
      <span class="wb-empty__title">{{
        direction === 'incoming' ? '没有待接收的申请' : '还没有发出的申请'
      }}</span>
    </div>
    <ul v-else class="wb-list">
      <li v-for="item in items" :key="item.transfer_id" class="wb-item">
        <div class="wb-item__main">
          <div class="wb-item__title-row">
            <span class="wb-item__title">{{ transferTitle(item) }}</span>
            <span :class="statusBadgeClass(item.status)">
              {{ transferStatusLabel(item.status) }}
            </span>
          </div>
          <span class="wb-item__meta"
            >{{ transferReference(item) }} · {{ transferParties(item) }}</span
          >
          <span class="wb-item__meta">发起于 {{ item.initiated_at }}</span>
          <span v-if="item.message" class="wb-item__meta">说明：{{ item.message }}</span>
        </div>
        <div v-if="item.status === 'pending'" class="wb-item__side">
          <template v-if="direction === 'incoming'">
            <TButton
              :loading="busyKey === `${kind}:${item.transfer_id}`"
              :disabled="Boolean(busyKey)"
              @click="emit('action', { item, action: 'accept' })"
            >
              接受
            </TButton>
            <TButton
              variant="outline"
              :disabled="Boolean(busyKey)"
              @click="emit('action', { item, action: 'reject' })"
            >
              拒绝
            </TButton>
          </template>
          <TButton
            v-else
            variant="outline"
            :loading="busyKey === `${kind}:${item.transfer_id}`"
            :disabled="Boolean(busyKey)"
            @click="emit('action', { item, action: 'cancel' })"
          >
            撤销
          </TButton>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.transfer-list + .transfer-list {
  margin-top: 24px;
}
.transfer-list__title {
  margin: 0 0 12px;
}
</style>
