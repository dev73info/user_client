<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  TButton,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  Document,
  RefreshLeft,
  Search,
} from 'ui_73info'

import {
  getMyInviteCode,
  getMyInviteStats,
  type InviteCodeResponse,
  type InviteStatsResponse,
} from '@/api/invite'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ (event: 'stats', invited: number | null): void }>()
const auth = useAuthStore()
const inviteCode = ref<InviteCodeResponse | null>(null)
const stats = ref<InviteStatsResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const keyword = ref('')
const joinedScope = ref<'all' | 'week' | 'month'>('all')
const invitees = computed(() => stats.value?.invitees ?? [])

function isWithinDays(joinedAt: string, days: number) {
  const parsed = parseBackendDateTime(joinedAt)
  return !parsed || Date.now() - parsed.getTime() <= days * 86400000
}

const scopeOptions = computed(() => [
  { value: 'all' as const, label: '全部', count: invitees.value.length },
  {
    value: 'week' as const,
    label: '近 7 天',
    count: invitees.value.filter((item) => isWithinDays(item.joined_at, 7)).length,
  },
  {
    value: 'month' as const,
    label: '近 30 天',
    count: invitees.value.filter((item) => isWithinDays(item.joined_at, 30)).length,
  },
])
const filteredInvitees = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return invitees.value.filter((item) => {
    const inScope =
      joinedScope.value === 'all' ||
      isWithinDays(item.joined_at, joinedScope.value === 'week' ? 7 : 30)
    return inScope && (!search || item.username.toLocaleLowerCase().includes(search))
  })
})
const hasFilters = computed(() => !!keyword.value.trim() || joinedScope.value !== 'all')
const {
  page,
  pageSize,
  total,
  paged: pagedInvitees,
  resetPage,
} = useClientPagination(filteredInvitees)
watch([keyword, joinedScope], resetPage)

function resetFilters() {
  keyword.value = ''
  joinedScope.value = 'all'
}

function joinedAt(value: string) {
  return parseBackendDateTime(value)?.toLocaleDateString('zh-CN') ?? value
}

async function loadInvite() {
  auth.hydrate()
  if (!auth.token) return
  loading.value = true
  loadError.value = ''
  try {
    const [codePayload, statsPayload] = await Promise.all([
      getMyInviteCode(auth.token),
      getMyInviteStats(auth.token),
    ])
    inviteCode.value = codePayload
    stats.value = statsPayload
    emit('stats', statsPayload.total_invited)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载邀请信息失败'
    emit('stats', null)
  } finally {
    loading.value = false
  }
}

async function copyCode() {
  if (!inviteCode.value) return
  try {
    await navigator.clipboard.writeText(inviteCode.value.code)
    TMessage.success('邀请码已复制')
  } catch {
    TMessage.error('邀请码复制失败')
  }
}

onMounted(() => void loadInvite())
defineExpose({ reload: loadInvite })
</script>

<template>
  <section class="invite-panel" aria-label="邀请面板" :aria-busy="loading">
    <div class="wb-card-head">
      <h3 class="wb-card-head__title">我的邀请</h3>
      <div class="wb-card-head__actions">
        <RouterLink class="wb-btn wb-btn--ghost" :to="{ name: 'workbench-invite-leaderboard' }"
          >查看排行榜</RouterLink
        >
      </div>
    </div>
    <div class="wb-panel invite-panel__code">
      <span class="invite-panel__code-label">邀请码</span>
      <span class="invite-panel__code-value">{{ inviteCode?.code || '—' }}</span>
      <TButton
        icon-only
        class="invite-panel__code-copy"
        :disabled="!inviteCode"
        title="复制邀请码"
        aria-label="复制邀请码"
        @click="copyCode"
        ><TIcon><Document /></TIcon
      ></TButton>
      <ShareCardGenerator share-type="invite" />
    </div>
    <div v-if="loadError" class="wb-empty" role="alert">
      <span>{{ loadError }}</span
      ><TButton :loading="loading" @click="loadInvite">重试</TButton>
    </div>
    <template v-if="invitees.length || hasFilters">
      <div class="wb-toolbar">
        <div class="wb-chip-group" role="group" aria-label="加入时间">
          <button
            v-for="scope in scopeOptions"
            :key="scope.value"
            type="button"
            class="wb-chip wb-chip--button"
            :class="{ 'is-active': joinedScope === scope.value }"
            :aria-pressed="joinedScope === scope.value"
            @click="joinedScope = scope.value"
          >
            {{ scope.label }}<span class="wb-chip__count">{{ scope.count }}</span>
          </button>
        </div>
        <TInput
          v-model="keyword"
          class="wb-toolbar__search"
          clearable
          placeholder="搜索被邀请的用户名"
          aria-label="搜索邀请记录"
          ><template #prefix
            ><TIcon><Search /></TIcon></template
        ></TInput>
        <div class="wb-toolbar__actions">
          <span v-if="hasFilters" class="wb-toolbar__hint"
            >筛选出 {{ total }} / {{ invitees.length }} 人</span
          >
          <TButton v-if="hasFilters" variant="outline" @click="resetFilters"
            ><TIcon><RefreshLeft /></TIcon><span>重置</span></TButton
          >
        </div>
      </div>
    </template>
    <p v-if="loading && !invitees.length" class="wb-empty" role="status">正在加载邀请记录…</p>
    <div v-else-if="!filteredInvitees.length && !loadError" class="wb-empty">
      <span class="wb-empty__title">{{
        invitees.length ? '没有匹配的邀请记录' : '暂无邀请记录'
      }}</span>
    </div>
    <template v-if="filteredInvitees.length">
      <ul class="wb-list" aria-label="邀请记录">
        <li v-for="invitee in pagedInvitees" :key="invitee.username" class="wb-item">
          <div class="wb-item__main invite-panel__invitee">
            <span class="wb-avatar">{{ Array.from(invitee.username)[0] ?? '用' }}</span
            ><span class="wb-item__title">{{ invitee.username }}</span>
          </div>
          <div class="wb-item__side">
            <span class="wb-item__meta">{{ joinedAt(invitee.joined_at) }} 加入</span>
          </div>
        </li>
      </ul>
      <div class="wb-pager">
        <div class="wb-pager__count">
          <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页邀请记录数"
            ><TOption
              v-for="size in LIST_PAGE_SIZES"
              :key="size"
              :label="`${size} 条/页`"
              :value="size"
          /></TSelect>
        </div>
        <TPagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          :pager-count="5"
          background
          aria-label="邀请记录分页"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.invite-panel__code {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.invite-panel__code-label {
  color: var(--73-ink-muted);
  font-size: 12px;
  white-space: nowrap;
}
.invite-panel__code-value {
  color: var(--73-ink);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.invite-panel__code-copy {
  margin-left: auto;
}
.invite-panel__invitee {
  display: flex;
  align-items: center;
  gap: 10px;
}
@media (max-width: 640px) {
  .invite-panel__code {
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 10px;
  }
  .invite-panel__code-value {
    font-size: 18px;
  }
  .invite-panel__code :deep(.share-card-generator__start) {
    min-height: 44px;
  }
}
</style>
