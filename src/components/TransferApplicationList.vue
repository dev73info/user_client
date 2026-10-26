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
import { TButton, TTag } from 'ui_73info'

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
</script>

<template>
  <section class="transfer-list" :aria-label="title">
    <h4 class="transfer-list__title">{{ title }}</h4>
    <div v-if="!items.length" class="wb-empty" role="status">
      {{ direction === 'incoming' ? '没有待接收的申请' : '还没有发出的申请' }}
    </div>
    <ul v-else class="wb-list">
      <li v-for="item in items" :key="item.transfer_id" class="wb-item">
        <div class="wb-item__main">
          <div class="wb-item__title-row">
            <span class="wb-item__title">{{ transferTitle(item) }}</span>
            <TTag variant="soft" :tone="transferStatusTone(item.status)">
              {{ transferStatusLabel(item.status) }}
            </TTag>
          </div>
          <span class="wb-item__meta"
            >{{ transferReference(item) }} · {{ transferParties(item) }}</span
          >
          <span class="wb-item__meta">发起于 {{ item.initiated_at }}</span>
          <span v-if="item.message" class="wb-item__meta">说明：{{ item.message }}</span>
        </div>
        <div v-if="item.status === 'pending'" class="transfer-list__actions">
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
  font-size: 15px;
}
.transfer-list__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
