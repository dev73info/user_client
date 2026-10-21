<script setup lang="ts">
/**
 * 开发者工作台「API 密钥」页（R039 配套）。
 *
 * 开放接口用 `X-Api-Key` 鉴权，密钥列表只回前缀；明文只在创建时返回一次。
 * 开发者只能看到并管理自己创建的密钥，管理端仍可查看全部。
 */
import { computed, onMounted, reactive, ref } from 'vue'

import {
  createApiKey,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
  type ApiKeyRecord,
  type CreatedApiKey,
} from '@/api/apiKeys'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { writeTextToClipboard } from '@/shared/clipboard'
import { useAuthStore } from '@/stores/auth'
import {
  Document,
  Key,
  Plus,
  Refresh,
  TAlert,
  TButton,
  TCard,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TMessage,
  TMessageBox,
  TTable,
  TTableColumn,
  TTag,
} from 'ui_73info'

const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const keys = ref<ApiKeyRecord[]>([])

const createOpen = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  name: '',
  note: '',
  expiresAt: '',
})

const createdKey = ref<CreatedApiKey | null>(null)
const secretOpen = ref(false)

const busyId = ref<number | null>(null)
/** 正在取回明文的密钥 id（用于按钮的 loading 态） */
const copyingId = ref<number | null>(null)

const activeCount = computed(
  () => keys.value.filter((item) => item.is_active && !isExpired(item)).length,
)

function isExpired(key: ApiKeyRecord): boolean {
  if (!key.expires_at) {
    return false
  }
  const expiresAt = new Date(key.expires_at.replace(' ', 'T')).getTime()
  return Number.isFinite(expiresAt) && expiresAt < Date.now()
}

function statusLabel(key: ApiKeyRecord): string {
  if (!key.is_active) {
    return '已吊销'
  }
  return isExpired(key) ? '已过期' : '有效'
}

function statusTone(key: ApiKeyRecord): 'accent' | 'warning' {
  return key.is_active && !isExpired(key) ? 'accent' : 'warning'
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

async function loadKeys() {
  if (!auth.token) {
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    keys.value = await listApiKeys(auth.token)
  } catch (error) {
    loadError.value = errorText(error, '加载接口密钥失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.name = ''
  createForm.note = ''
  createForm.expiresAt = ''
  createOpen.value = true
}

async function submitCreate() {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  const name = createForm.name.trim()
  if (!name) {
    TMessage.warning('请填写密钥名称')
    return
  }

  createSaving.value = true
  try {
    const created = await createApiKey(auth.token, {
      name,
      note: createForm.note.trim() || null,
      expires_at: createForm.expiresAt.trim() || null,
    })
    createOpen.value = false
    createdKey.value = created
    secretOpen.value = true
    await loadKeys()
  } catch (error) {
    TMessage.error(errorText(error, '创建接口密钥失败'))
  } finally {
    createSaving.value = false
  }
}

async function copySecret() {
  if (!createdKey.value) {
    return
  }
  try {
    await writeTextToClipboard(createdKey.value.full_key)
    TMessage.success('接口密钥已复制，请妥善保存')
  } catch {
    TMessage.warning('复制失败，请手动选中密钥后再复制')
  }
}

/**
 * 从列表里复制某把密钥：先向后端取回完整明文，再写进剪贴板。
 *
 * 列表只存前缀（安全），明文要现取——所以这一步是一次网络请求，
 * 期间按钮走 loading，避免重复点击打多次接口。
 *
 * 复制失败时把明文落到弹窗里：明文已经取回来了，若因剪贴板不可用就整个丢掉，
 * 用户除前缀外再也拿不到这把密钥，只能反复重试。
 */
async function copyKeyFromList(key: ApiKeyRecord) {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  if (copyingId.value !== null) {
    return
  }
  copyingId.value = key.id
  let fullKey: string | null = null
  try {
    fullKey = await revealApiKey(auth.token, key.id)
    await writeTextToClipboard(fullKey)
    TMessage.success('接口密钥已复制到剪贴板')
  } catch (error) {
    if (fullKey) {
      // 取回成功、只是复制没成：给个可手动复制的弹窗，别把明文丢了。
      createdKey.value = { ...key, full_key: fullKey }
      secretOpen.value = true
      TMessage.warning('自动复制失败，请在弹出的窗口里手动复制')
    } else {
      TMessage.error(errorText(error, '复制接口密钥失败'))
    }
  } finally {
    copyingId.value = null
  }
}

async function confirmRevoke(key: ApiKeyRecord) {
  if (!auth.token) {
    return
  }
  const confirmed = await TMessageBox.confirm({
    title: '吊销密钥',
    content: `吊销后「${key.name}」立即失效，已使用它的服务需要换成新密钥。`,
    confirmText: '吊销',
    cancelText: '取消',
    tone: 'danger',
  })
  if (!confirmed) {
    return
  }

  busyId.value = key.id
  try {
    await revokeApiKey(auth.token, key.id)
    TMessage.success('密钥已吊销')
    await loadKeys()
  } catch (error) {
    TMessage.error(errorText(error, '吊销接口密钥失败'))
  } finally {
    busyId.value = null
  }
}

onMounted(async () => {
  auth.hydrate()
  await loadKeys()
})
</script>

<template>
  <div class="dev-page dev-page--api-keys">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">密钥总数</span>
          <span class="dev-meta-strip__value">{{ loading ? '—' : keys.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">有效密钥</span>
          <span class="dev-meta-strip__value">{{ loading ? '—' : activeCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新接口密钥" @click="loadKeys">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">接口密钥</h3>
        </div>
        <TButton variant="solid" tone="accent" @click="openCreate">
          <TIcon>
            <Plus />
          </TIcon>
          创建密钥
        </TButton>
      </div>

      <TAlert
        v-if="loadError"
        tone="danger"
        variant="soft"
        title="接口密钥加载失败"
        :description="loadError"
        class="api-keys__alert"
      />

      <TTable
        :loading="loading"
        :data="keys"
        stripe
        class="dev-table api-keys__table"
        aria-label="接口密钥列表"
      >
        <template #empty>
          <p class="dev-empty-state">还没有创建接口密钥</p>
        </template>

        <TTableColumn label="名称" min-width="160">
          <template #default="scope">
            <div class="api-keys__name">
              <TIcon class="api-keys__name-icon">
                <Key />
              </TIcon>
              <span>{{ scope.row.name }}</span>
            </div>
            <p v-if="scope.row.note" class="api-keys__note">{{ scope.row.note }}</p>
          </template>
        </TTableColumn>

        <TTableColumn label="密钥前缀" min-width="240">
          <template #default="scope">
            <div class="api-keys__prefix-row">
              <code class="api-keys__prefix">{{ scope.row.key_prefix }}</code>
              <TButton
                icon-only
                variant="text"
                :loading="copyingId === scope.row.id"
                :aria-label="`复制密钥 ${scope.row.name}`"
                :title="`复制密钥 ${scope.row.name}`"
                @click="copyKeyFromList(scope.row)"
              >
                <TIcon>
                  <Document />
                </TIcon>
              </TButton>
            </div>
          </template>
        </TTableColumn>

        <TTableColumn label="状态" min-width="100">
          <template #default="scope">
            <TTag variant="outline" :tone="statusTone(scope.row)">
              {{ statusLabel(scope.row) }}
            </TTag>
          </template>
        </TTableColumn>

        <TTableColumn label="最近使用" min-width="170">
          <template #default="scope">
            <span>{{ scope.row.last_used_at || '—' }}</span>
          </template>
        </TTableColumn>

        <TTableColumn label="过期时间" min-width="170">
          <template #default="scope">
            <span>{{ scope.row.expires_at || '永不过期' }}</span>
          </template>
        </TTableColumn>

        <TTableColumn label="创建时间" min-width="170">
          <template #default="scope">
            <span>{{ scope.row.created_at }}</span>
          </template>
        </TTableColumn>

        <TTableColumn label="操作" min-width="120">
          <template #default="scope">
            <div class="api-keys__actions">
              <TButton
                v-if="scope.row.is_active"
                variant="text"
                tone="warning"
                :loading="busyId === scope.row.id"
                @click="confirmRevoke(scope.row)"
              >
                吊销
              </TButton>
              <span v-else class="api-keys__muted">—</span>
            </div>
          </template>
        </TTableColumn>
      </TTable>

      <p class="api-keys__hint">
        接口密钥用于服务端调用用户关联、下单与订单查询接口，请求头使用 <code>X-Api-Key</code>。
        点前缀右侧的图标可取回完整密钥并复制；吊销后立即失效，需要改名或删除请联系管理员。
      </p>
    </TCard>

    <TDialog v-model:open="createOpen" width="520px" class="dev-dialog" title="创建接口密钥">
      <TForm label-position="top">
        <TFormItem label="名称">
          <TInput v-model="createForm.name" :maxlength="80" placeholder="例如：官网下单服务" />
        </TFormItem>
        <TFormItem label="备注">
          <TInput v-model="createForm.note" :maxlength="200" placeholder="可选，便于区分用途" />
        </TFormItem>
        <TFormItem label="过期时间">
          <TInput
            v-model="createForm.expiresAt"
            :maxlength="19"
            placeholder="YYYY-MM-DD（留空 = 永不过期）"
          />
        </TFormItem>
      </TForm>
      <template #footer>
        <TButton variant="outline" @click="createOpen = false">取消</TButton>
        <TButton variant="solid" tone="accent" :loading="createSaving" @click="submitCreate">
          创建
        </TButton>
      </template>
    </TDialog>

    <TDialog
      v-model:open="secretOpen"
      width="560px"
      class="dev-dialog"
      title="接口密钥已创建"
    >
      <p class="api-keys__secret-hint">
        请立即复制并保存到站点服务端配置。密钥可随时从列表中取回，丢失后也能重新取回。
      </p>
      <code class="api-keys__secret">{{ createdKey?.full_key }}</code>
      <template #footer>
        <TButton variant="outline" @click="copySecret">复制密钥</TButton>
        <TButton variant="solid" tone="accent" @click="secretOpen = false">我已保存</TButton>
      </template>
    </TDialog>
  </div>
</template>

<style scoped>
.dev-page--api-keys {
  gap: 24px;
}

.api-keys__alert {
  margin-bottom: 16px;
}

.api-keys__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.api-keys__name-icon {
  color: var(--t73-color-accent, #2563eb);
}

.api-keys__note {
  margin: 4px 0 0;
  color: var(--t73-color-text-secondary, #64748b);
  font-size: 12px;
}

.api-keys__prefix {
  font-family: var(--t73-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  color: var(--t73-color-text-secondary, #475569);
  word-break: break-all;
}

/* 前缀与复制按钮同排：前缀贴左，按钮紧跟其后，两者不拆到两行 */
.api-keys__prefix-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.api-keys__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.api-keys__muted {
  color: var(--t73-color-text-secondary, #94a3b8);
}

.api-keys__hint {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--t73-color-text-secondary, #64748b);
}

.api-keys__hint code {
  font-family: var(--t73-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.api-keys__secret-hint {
  margin: 0 0 12px;
  line-height: 1.6;
}

.api-keys__secret {
  display: block;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--t73-color-fill-weak, #f1f5f9);
  font-family: var(--t73-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  word-break: break-all;
}
</style>
