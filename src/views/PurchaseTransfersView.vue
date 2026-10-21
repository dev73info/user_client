<script setup lang="ts">
/**
 * R042 接口资源使用权转移：待我确认 / 我发起的两个列表。
 *
 * 接受后订单的真实买家换成接收方；拒绝与撤销只结束申请，不改变订单归属。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { HttpError } from '@/api/http'
import {
  acceptPurchaseTransfer,
  cancelPurchaseTransfer,
  listIncomingPurchaseTransfers,
  listOutgoingPurchaseTransfers,
  rejectPurchaseTransfer,
  type PurchaseTransfer,
} from '@/api/resourcePurchaseTransfers'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useAuthStore } from '@/stores/auth'
import { Refresh, TButton, TIcon, TMessage, TMessageBox } from 'ui_73info'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

type TabKey = 'incoming' | 'outgoing'

const tab = ref<TabKey>('incoming')
const loading = ref(false)
const errorMessage = ref('')
const incoming = ref<PurchaseTransfer[]>([])
const outgoing = ref<PurchaseTransfer[]>([])
const busyId = ref<number | null>(null)

const currentList = computed(() => (tab.value === 'incoming' ? incoming.value : outgoing.value))
const pendingIncoming = computed(
  () => incoming.value.filter((item) => item.status === 'pending').length,
)

const STATUS_LABEL: Record<PurchaseTransfer['status'], string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  cancelled: '已撤销',
}

function goLogin() {
  void router.replace({
    name: 'home',
    query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
  })
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function load() {
  auth.hydrate()
  if (!auth.token.trim()) {
    goLogin()
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [incomingList, outgoingList] = await Promise.all([
      listIncomingPurchaseTransfers(auth.token),
      listOutgoingPurchaseTransfers(auth.token),
    ])
    incoming.value = incomingList
    outgoing.value = outgoingList
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    errorMessage.value = errorText(error, '加载转移申请失败')
  } finally {
    loading.value = false
  }
}

async function run(
  item: PurchaseTransfer,
  action: 'accept' | 'reject' | 'cancel',
) {
  if (busyId.value) {
    return
  }
  const copy = {
    accept: { title: '接受转移', text: '接受后这笔订单会记到你的账号下。', label: '接受' },
    reject: { title: '拒绝转移', text: '拒绝后订单仍归发起方。', label: '拒绝' },
    cancel: { title: '撤销申请', text: '撤销后可以重新发起。', label: '撤销' },
  }[action]
  const confirmed = await TMessageBox.confirm({
    title: copy.title,
    content: copy.text,
    confirmText: copy.label,
    tone: action === 'cancel' ? 'neutral' : 'danger',
  })
  if (!confirmed) {
    return
  }
  busyId.value = item.transfer_id
  try {
    if (action === 'accept') {
      await acceptPurchaseTransfer(auth.token, item.transfer_id)
    } else if (action === 'reject') {
      await rejectPurchaseTransfer(auth.token, item.transfer_id)
    } else {
      await cancelPurchaseTransfer(auth.token, item.transfer_id)
    }
    TMessage.success('已处理')
    await load()
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      goLogin()
      return
    }
    TMessage.error(errorText(error, '处理失败'))
  } finally {
    busyId.value = null
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page" :aria-busy="loading">
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="转移申请概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">待我确认</span>
          <span class="wb-strip__value">{{ loading ? '—' : pendingIncoming }}</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新转移申请" @click="load">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">使用权转移</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton
            :variant="tab === 'incoming' ? 'solid' : 'outline'"
            @click="tab = 'incoming'"
          >
            待我确认
          </TButton>
          <TButton
            :variant="tab === 'outgoing' ? 'solid' : 'outline'"
            @click="tab = 'outgoing'"
          >
            我发起的
          </TButton>
        </div>
      </div>

      <p v-if="loading && !currentList.length" class="wb-empty" role="status">正在加载…</p>
      <div v-else-if="errorMessage" class="wb-empty" role="alert">
        <span class="wb-empty__title">加载失败</span>
        <span>{{ errorMessage }}</span>
        <TButton variant="outline" @click="load">重试</TButton>
      </div>
      <div v-else-if="!currentList.length" class="wb-empty">
        <span class="wb-empty__title">{{ tab === 'incoming' ? '没有待确认的申请' : '还没有发起过转移' }}</span>
      </div>
      <ul v-else class="wb-list" aria-label="使用权转移申请">
        <li v-for="item in currentList" :key="item.transfer_id" class="wb-item">
          <div class="wb-item__main">
            <span class="wb-item__title">{{ item.resource_title || `资源 #${item.resource_id}` }}</span>
            <span class="wb-item__meta">
              订单 {{ item.order_no }} · {{ item.from_username }} → {{ item.to_username }}
            </span>
            <span class="wb-item__meta">
              {{ STATUS_LABEL[item.status] ?? item.status }} · 发起于 {{ item.initiated_at }}
            </span>
            <span v-if="item.message" class="wb-item__meta">留言：{{ item.message }}</span>
          </div>
          <div v-if="item.status === 'pending'" class="wb-item__actions">
            <template v-if="tab === 'incoming'">
              <TButton
                :loading="busyId === item.transfer_id"
                :disabled="Boolean(busyId)"
                @click="run(item, 'accept')"
              >
                接受
              </TButton>
              <TButton
                variant="outline"
                :disabled="Boolean(busyId)"
                @click="run(item, 'reject')"
              >
                拒绝
              </TButton>
            </template>
            <TButton
              v-else
              variant="outline"
              :disabled="Boolean(busyId)"
              @click="run(item, 'cancel')"
            >
              撤销
            </TButton>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
