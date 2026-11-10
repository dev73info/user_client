<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import TransferApplicationList from '@/components/TransferApplicationList.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useResourceTransferCenter } from '@/composables/useResourceTransferCenter'
import type { TransferApplication, TransferKind } from '@/shared/resourceTransfer'
import { Refresh, TButton, TIcon, TMessageBox } from 'ui_73info'

const tab = ref<TransferKind>('resource')
const {
  loading,
  errorMessage,
  resourceIncoming,
  resourceOutgoing,
  purchaseIncoming,
  purchaseOutgoing,
  busyKey,
  load,
  execute,
} = useResourceTransferCenter()
const currentIncoming = computed(() =>
  tab.value === 'resource' ? resourceIncoming.value : purchaseIncoming.value,
)
const currentOutgoing = computed(() =>
  tab.value === 'resource' ? resourceOutgoing.value : purchaseOutgoing.value,
)

async function confirmAction(item: TransferApplication, action: 'accept' | 'reject' | 'cancel') {
  const copy = {
    accept: {
      title: '接受申请',
      content:
        tab.value === 'resource'
          ? '接受后，资源所有权将转给接收方。'
          : '接受后，这笔订单的使用权将转给你。',
      confirmText: '接受',
    },
    reject: {
      title: '拒绝申请',
      content: '拒绝后，当前归属保持不变。',
      confirmText: '拒绝',
    },
    cancel: {
      title: '撤销申请',
      content: '撤销后，当前归属保持不变。',
      confirmText: '撤销',
    },
  }[action]
  const confirmed = await TMessageBox.confirm({
    ...copy,
    tone: action === 'accept' ? 'danger' : 'neutral',
  })
  if (confirmed) await execute(tab.value, item, action)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main
    class="page-shell custom-page-shell profile-page purchase-transfers-page wb-sheet"
    :aria-busy="loading"
  >
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="过户申请概览">
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': tab === 'resource' }"
          type="button"
          :aria-pressed="tab === 'resource'"
          @click="tab = 'resource'"
        >
          <span class="wb-strip__label">待接收资源过户</span>
          <span class="wb-strip__value">{{ loading ? '—' : resourceIncoming.length }}</span>
        </button>
        <span class="wb-strip__divider" aria-hidden="true" />
        <button
          class="wb-strip__item wb-strip__item--filter"
          :class="{ 'is-active': tab === 'purchase' }"
          type="button"
          :aria-pressed="tab === 'purchase'"
          @click="tab = 'purchase'"
        >
          <span class="wb-strip__label">待接收使用权转移</span>
          <span class="wb-strip__value">{{ loading ? '—' : purchaseIncoming.length }}</span>
        </button>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新过户申请" @click="load">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">过户与转移</h3>
        </div>
      </div>

      <p
        v-if="loading && !currentIncoming.length && !currentOutgoing.length"
        class="wb-empty"
        role="status"
      >
        正在加载过户申请…
      </p>
      <div v-else-if="errorMessage" class="wb-empty" role="alert">
        <span class="wb-empty__title">请求失败</span>
        <span>{{ errorMessage }}</span>
        <div class="wb-empty__actions">
          <TButton variant="outline" @click="load">重试</TButton>
        </div>
      </div>
      <template v-else>
        <TransferApplicationList
          title="待我接收"
          :kind="tab"
          direction="incoming"
          :items="currentIncoming"
          :busy-key="busyKey"
          @action="confirmAction($event.item, $event.action)"
        />
        <TransferApplicationList
          title="我发起的"
          :kind="tab"
          direction="outgoing"
          :items="currentOutgoing"
          :busy-key="busyKey"
          @action="confirmAction($event.item, $event.action)"
        />
      </template>
    </section>
  </main>
</template>
