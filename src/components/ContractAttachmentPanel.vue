<script setup lang="ts">
/**
 * 自定义合同附件面板（R012）：需求方与开发者双方都能上传自己的合同文件（方案 A），
 * 或在页面内拟定条款由平台渲染成附件（方案 B）；两者产出的是同一份附件、共用一套审核态。
 *
 * 三条硬边界（与后端任务-01 一致）：
 * 1. **附件只是主合同的条款补充**：平台生成的《需求开发合同》正文不动、仍是唯一被签署的主文件；
 *    定金、服务费、分成、个税、缴付与验收期限一律按需求单与平台规则执行。
 * 2. **必须平台放行双方才能发起签署**：附件处于待审核 / 已驳回时签署入口由父页面禁用。
 * 3. **发起签署之后不能再换附件**（渠道合同已创建，改要作废重签）：这时只读展示并给出说明。
 *
 * 本组件不自己拉合同：每次上传/拟定/撤回都返回后端最新的合同，交给父页面替换本地那份
 * （避免「覆盖后页面还停在旧审核态」）。
 */
import { computed, ref, watch } from 'vue'

import {
  deleteContractAttachment,
  downloadBlankContractTemplate,
  downloadContractAttachment,
  draftContractAttachment,
  uploadContractAttachment,
  type ContractDetail,
  type DraftContractAttachmentPayload,
} from '@/api/contracts'
import { listMyRequirements } from '@/api/devRequirements'
import { listRequirements } from '@/api/requirements'
import {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
  CONTRACT_STATUS,
  attachmentReviewStatusLabel,
  type ContractAttachmentParty,
} from '@/shared/contracts'

const props = defineProps<{
  token: string
  contract: ContractDetail
  /** 需求编号（上传 / 拟定都挂在该需求已有的合同行上）。 */
  requirementId: string
  /** 当前用户在这份合同上的身份；非当事人（如后台代看）为 `null`，只读。 */
  party: ContractAttachmentParty | null
  /** 拟定表单「标题」的预填值，缺省用合同标题。 */
  contractTitle?: string
}>()

const emit = defineEmits<{ updated: [contract: ContractDetail] }>()

/** 允许上传的扩展名（与后端任务-01 的格式判定一致：pdf / doc / docx，不收图片）。 */
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx']
const ACCEPTED_ATTR = ACCEPTED_EXTENSIONS.join(',')

const contentSource = computed(() => props.contract.content_source ?? CONTRACT_CONTENT_SOURCE.platform)
const hasAttachment = computed(() => contentSource.value !== CONTRACT_CONTENT_SOURCE.platform)
const reviewStatus = computed(() => props.contract.attachment_review_status ?? ATTACHMENT_REVIEW_STATUS.none)
const reviewLabel = computed(() => attachmentReviewStatusLabel(reviewStatus.value))
const approved = computed(
  () =>
    reviewStatus.value === ATTACHMENT_REVIEW_STATUS.approved &&
    // 放行是「对某个具体版本」放行的：指纹不一致就视为未放行（换过文件、沿用旧放行）。
    Boolean(props.contract.attachment_file_sha256) &&
    props.contract.attachment_approved_sha256 === props.contract.attachment_file_sha256,
)

/**
 * 是否已发起爱签签署。
 *
 * 本地没有直接透出 `asign_contract_no`，用「合同已离开等待签约 0」与签署日志里的
 * `asign_sign_initiated` 一起判定——后端真正的边界是「渠道合同已创建」，两处口径一致。
 */
const signingInitiated = computed(
  () =>
    props.contract.status !== CONTRACT_STATUS.awaiting ||
    (props.contract.signing_logs ?? []).some((log) => log.action === 'asign_sign_initiated'),
)

/** 能否准备附件：必须是当事人，且渠道合同尚未创建（发起签署后只能作废重签）。 */
const canPrepare = computed(() => props.party !== null && !signingInitiated.value)

const mode = ref<'upload' | 'draft'>('upload')
const pickedFile = ref<File | null>(null)
const busy = ref(false)
const actionError = ref('')
const actionSuccess = ref('')
const downloading = ref(false)
const templateDownloading = ref(false)

const draftOpen = ref(false)
const draft = ref<DraftContractAttachmentPayload>({
  title: '',
  amount: 0,
  payment_terms: '',
  acceptance_criteria: '',
  intellectual_property: '',
  breach_and_dispute: '',
  supplementary_terms: '',
})

/** 需求单里的预填信息（标题 / 预算 / 验收标准），打开拟定表单时按需加载一次。 */
const requirementInfo = ref<{ title: string; budget: number | null; acceptance_criteria: string } | null>(null)
const requirementInfoLoaded = ref(false)

function resetMessages() {
  actionError.value = ''
  actionSuccess.value = ''
}

/** 换合同（覆盖后父页面替换了本地那份）就清掉上一份的提示与选中文件，别让旧状态串到新版本上。 */
watch(
  () => [props.contract.id, props.contract.attachment_file_sha256, props.contract.attachment_review_status],
  () => {
    resetMessages()
    pickedFile.value = null
  },
)

function formatFileSize(bytes: number | null | undefined): string {
  const size = bytes ?? 0
  if (size <= 0) {
    return '未知大小'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function partyLabel(party: ContractAttachmentParty | null | undefined): string {
  if (party === 'party_a') return '甲方（需求方）'
  if (party === 'party_b') return '乙方（开发者）'
  return '未知提交方'
}

/**
 * 加载需求单信息用于拟定表单预填。
 *
 * 按当前身份选接口：需求方走 `/requirements/mine`，开发者走 `/dev/requirements/mine`，
 * 两边都拿不到（例如非当事人）就退化成空预填——金额以后端校验为准，页面不因拿不到预算就崩。
 */
async function ensureRequirementInfo() {
  if (requirementInfoLoaded.value) {
    return
  }
  requirementInfoLoaded.value = true
  try {
    const rows = props.party === 'party_b'
      ? await listMyRequirements(props.token)
      : await listRequirements(props.token)
    const matched = rows.find((row) => row.requirement_id === props.requirementId)
    requirementInfo.value = matched
      ? {
          title: matched.title,
          budget: matched.budget ?? null,
          acceptance_criteria: matched.acceptance_criteria ?? '',
        }
      : null
  } catch {
    requirementInfo.value = null
  }
}

function openDraft() {
  mode.value = 'draft'
  if (!draftOpen.value) {
    draftOpen.value = true
    draft.value = {
      title: requirementInfo.value?.title ?? props.contractTitle ?? props.contract.title,
      amount: requirementInfo.value?.budget ?? 0,
      payment_terms: '',
      acceptance_criteria: requirementInfo.value?.acceptance_criteria ?? '',
      intellectual_property: '',
      breach_and_dispute: '',
      supplementary_terms: '',
    }
  }
  void ensureRequirementInfo().then(() => {
    // 需求单信息补上后，只回填空着的预填项，不动用户已经改过的输入。
    const info = requirementInfo.value
    if (!info) return
    if (!draft.value.title.trim()) draft.value.title = info.title
    if (!draft.value.acceptance_criteria.trim()) draft.value.acceptance_criteria = info.acceptance_criteria
    if (!draft.value.amount && info.budget != null) draft.value.amount = info.budget
  })
}

watch(mode, (value) => {
  if (value === 'draft') {
    openDraft()
  }
})

function openUpload() {
  mode.value = 'upload'
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  resetMessages()
  pickedFile.value = input.files?.[0] ?? null
}

async function submitUpload() {
  if (busy.value) return
  const file = pickedFile.value
  if (!file) {
    actionError.value = '请先选择要上传的合同文件（pdf / doc / docx）'
    return
  }
  busy.value = true
  resetMessages()
  try {
    const updated = await uploadContractAttachment(props.token, props.requirementId, file)
    emit('updated', updated)
    pickedFile.value = null
    actionSuccess.value = '附件已提交，等待平台审核'
  } catch (error) {
    // 后端的中文提示（格式 / 超限 / 已发起签署 409 / 请先发起合同 409）原样展示，不统一成「请求失败」。
    actionError.value = error instanceof Error ? error.message : '上传合同附件失败'
  } finally {
    busy.value = false
  }
}

/**
 * 拟定金额预校验：必须等于需求单预算、且大于 0（后端仍会再校验一次）。
 *
 * 拿不到需求单预算时不做金额拦截——交给后端判定，避免把「信息没加载出来」误报成「金额不合法」。
 */
function validateDraftAmount(): string {
  const amount = draft.value.amount
  if (!Number.isFinite(amount) || amount <= 0) {
    return '拟定金额必须大于 0，且与需求单预算一致'
  }
  const budget = requirementInfo.value?.budget
  if (budget != null && Math.abs(amount - budget) > 0.001) {
    return `拟定金额必须等于需求单预算 ¥${budget.toFixed(2)}（当前填写 ¥${amount.toFixed(2)}）`
  }
  return ''
}

async function submitDraft() {
  if (busy.value) return
  if (!draft.value.title.trim()) {
    actionError.value = '请先填写附件标题'
    return
  }
  const amountError = validateDraftAmount()
  if (amountError) {
    actionError.value = amountError
    return
  }
  busy.value = true
  resetMessages()
  try {
    const updated = await draftContractAttachment(props.token, props.requirementId, {
      ...draft.value,
      title: draft.value.title.trim(),
    })
    emit('updated', updated)
    draftOpen.value = false
    actionSuccess.value = '条款已提交，等待平台审核'
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '提交合同条款失败'
  } finally {
    busy.value = false
  }
}

async function withdrawAttachment() {
  if (busy.value) return
  busy.value = true
  resetMessages()
  try {
    await deleteContractAttachment(props.token, props.contract.id)
    // 撤回后后端把附件字段清空、来源回 platform；本地据此重载合同，避免残留旧附件信息。
    emit('updated', {
      ...props.contract,
      content_source: CONTRACT_CONTENT_SOURCE.platform,
      attachment_review_status: ATTACHMENT_REVIEW_STATUS.none,
      attachment_file_name: null,
      attachment_file_sha256: null,
      attachment_approved_sha256: null,
      attachment_review_note: null,
      attachment_prepared_by: null,
      attachment_prepared_at: null,
      attachment_prepared_party: null,
      attachment_file_size: null,
    })
    actionSuccess.value = '附件已撤回'
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '撤回合同附件失败'
  } finally {
    busy.value = false
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileName || '下载文件'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

async function downloadAttachment() {
  if (downloading.value) return
  downloading.value = true
  resetMessages()
  try {
    const file = await downloadContractAttachment(
      props.token,
      props.contract.id,
      props.contract.attachment_file_name ?? '合同附件',
    )
    saveBlob(file.blob, file.fileName)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '下载合同附件失败'
  } finally {
    downloading.value = false
  }
}

async function downloadTemplate() {
  if (templateDownloading.value) return
  templateDownloading.value = true
  resetMessages()
  try {
    const file = await downloadBlankContractTemplate(props.token)
    saveBlob(file.blob, file.fileName)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '下载合同模板失败'
  } finally {
    templateDownloading.value = false
  }
}
</script>

<template>
  <section class="attachment-panel" aria-label="自定义合同附件">
    <header class="attachment-panel__head">
      <h3>自定义合同附件</h3>
      <span class="attachment-panel__badge" :class="`attachment-panel__badge--${reviewStatus}`">
        {{ reviewLabel }}
      </span>
    </header>

    <p class="attachment-panel__rule">
      附件只是条款补充：平台按《需求开发合同》生成的
      <strong>正文仍是唯一被签署的主文件</strong>，
      定金、服务费、分成、个税、缴付与验收期限一律按需求单与平台规则执行；附件随本合同一并签署与归档。
      附件经平台审核放行后，双方才能发起签署。
    </p>

    <!-- 已准备附件：文件名 / 大小 / 提交人 / 时间 / 字节 sha256 / 审核态 -->
    <div v-if="hasAttachment" class="attachment-card">
      <dl class="attachment-card__facts">
        <div>
          <dt>附件文件</dt>
          <dd>{{ contract.attachment_file_name || '未命名附件' }}</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>
            {{ contentSource === CONTRACT_CONTENT_SOURCE.drafted ? '页面拟定条款' : '上传的合同文件' }}
          </dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>{{ formatFileSize(contract.attachment_file_size) }}</dd>
        </div>
        <div>
          <dt>提交人</dt>
          <dd>
            {{ contract.attachment_prepared_by || '未知' }}
            · {{ partyLabel(contract.attachment_prepared_party) }}
          </dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{{ contract.attachment_prepared_at || '—' }}</dd>
        </div>
        <div>
          <dt>附件指纹（字节 sha256）</dt>
          <dd class="attachment-card__hash">{{ contract.attachment_file_sha256 || '—' }}</dd>
        </div>
      </dl>

      <p v-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.pending" class="attachment-note attachment-note--pending">
        已提交，等待平台审核（审核通过前不能发起签署）。
      </p>
      <p v-else-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.approved" class="attachment-note attachment-note--approved">
        平台已放行，可以发起签署。
      </p>
      <div v-else-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.rejected" class="attachment-note attachment-note--rejected">
        <p>平台已驳回，请按理由修改后重新提交。</p>
        <p v-if="contract.attachment_review_note" class="attachment-note__reason">
          驳回理由：{{ contract.attachment_review_note }}
        </p>
        <p v-else class="attachment-note__reason">平台未填写驳回理由。</p>
      </div>

      <div class="attachment-card__actions">
        <button type="button" class="attachment-btn" :disabled="downloading" @click="downloadAttachment">
          {{ downloading ? '下载中…' : '下载附件' }}
        </button>
        <button
          v-if="canPrepare"
          type="button"
          class="attachment-btn attachment-btn--danger"
          :disabled="busy"
          @click="withdrawAttachment"
        >
          撤回附件
        </button>
      </div>
    </div>

    <p v-else class="attachment-panel__empty">
      本合同还没有自定义附件。双方可上传自己的合同文件，或在页面内拟定条款交由平台渲染成附件。
    </p>

    <!-- 准备入口：当事人 + 尚未发起签署 -->
    <div v-if="canPrepare" class="attachment-prepare">
      <div class="attachment-prepare__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'upload'"
          class="attachment-tab"
          :class="{ 'attachment-tab--active': mode === 'upload' }"
          @click="openUpload"
        >
          上传合同文件
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'draft'"
          class="attachment-tab"
          :class="{ 'attachment-tab--active': mode === 'draft' }"
          @click="openDraft"
        >
          页面拟定条款
        </button>
        <button
          type="button"
          class="attachment-btn attachment-btn--ghost attachment-prepare__template"
          :disabled="templateDownloading"
          @click="downloadTemplate"
        >
          {{ templateDownloading ? '下载中…' : '下载空白合同模板' }}
        </button>
      </div>

      <p class="attachment-prepare__hint">
        把自己的条款按空白模板整理好再上传；模板不含签署页锚点（附件不参与签章定位）。
      </p>

      <!-- 方案 A：上传 -->
      <div v-if="mode === 'upload'" class="attachment-upload">
        <label class="attachment-upload__picker">
          <span>选择文件</span>
          <input type="file" :accept="ACCEPTED_ATTR" :disabled="busy" @change="onFilePicked" />
        </label>
        <p v-if="pickedFile" class="attachment-upload__file">
          已选：{{ pickedFile.name }} · {{ formatFileSize(pickedFile.size) }}
        </p>
        <p class="attachment-prepare__hint">只收 pdf / doc / docx，不支持图片文件。</p>
        <button type="button" class="attachment-btn attachment-btn--primary" :disabled="busy || !pickedFile" @click="submitUpload">
          {{ busy ? '提交中…' : hasAttachment ? '替换为这份附件' : '上传为附件' }}
        </button>
      </div>

      <!-- 方案 B：页面拟定 -->
      <form v-else class="attachment-draft" @submit.prevent="submitDraft">
        <label class="attachment-field">
          <span>标题</span>
          <input v-model="draft.title" type="text" maxlength="120" :disabled="busy" />
        </label>
        <label class="attachment-field">
          <span>金额（元，必须等于需求单预算）</span>
          <input v-model.number="draft.amount" type="number" min="0" step="0.01" :disabled="busy" />
          <small v-if="requirementInfo?.budget != null">
            需求单预算：¥{{ requirementInfo.budget.toFixed(2) }}
          </small>
        </label>
        <label class="attachment-field">
          <span>付款节点说明</span>
          <textarea v-model="draft.payment_terms" rows="3" maxlength="2000" :disabled="busy"></textarea>
        </label>
        <label class="attachment-field">
          <span>验收标准</span>
          <textarea v-model="draft.acceptance_criteria" rows="3" maxlength="2000" :disabled="busy"></textarea>
        </label>
        <label class="attachment-field">
          <span>知识产权约定</span>
          <textarea v-model="draft.intellectual_property" rows="3" maxlength="2000" :disabled="busy"></textarea>
        </label>
        <label class="attachment-field">
          <span>违约与争议解决</span>
          <textarea v-model="draft.breach_and_dispute" rows="3" maxlength="2000" :disabled="busy"></textarea>
        </label>
        <label class="attachment-field">
          <span>补充条款</span>
          <textarea v-model="draft.supplementary_terms" rows="4" maxlength="4000" :disabled="busy"></textarea>
        </label>
        <button type="submit" class="attachment-btn attachment-btn--primary" :disabled="busy">
          {{ busy ? '提交中…' : hasAttachment ? '替换为这份附件' : '提交为附件' }}
        </button>
      </form>
    </div>

    <p v-else-if="party === null" class="attachment-panel__empty">
      只有该需求的当事人（需求方 / 已接单开发者）可以准备合同附件。
    </p>
    <p v-else class="attachment-note attachment-note--locked">
      该合同已发起签署，不能再更换附件；如需更换请先作废重签。
    </p>

    <p v-if="actionSuccess" class="attachment-msg attachment-msg--success">{{ actionSuccess }}</p>
    <p v-if="actionError" class="attachment-msg attachment-msg--error" role="alert">{{ actionError }}</p>
  </section>
</template>

<style scoped>
.attachment-panel {
  margin: 24px 0;
  padding: 18px 20px;
  border: 1px solid #d7e3e2;
  border-left: 3px solid #247f7d;
  border-radius: 8px;
  background: #fbfdfd;
}

.attachment-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.attachment-panel__head h3 {
  margin: 0;
  font-size: 15px;
  color: #172033;
}

.attachment-panel__badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #d0d7de;
  background: #f4f6f8;
  color: #55606e;
  font-size: 12px;
  font-weight: 700;
}

.attachment-panel__badge--pending {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.attachment-panel__badge--approved {
  border-color: #bbf7d0;
  background: #ecfdf5;
  color: #047857;
}

.attachment-panel__badge--rejected {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.attachment-panel__rule {
  margin: 12px 0 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #eef6f6;
  color: #3f5b59;
  font-size: 12.5px;
  line-height: 1.7;
}

.attachment-panel__empty {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
  line-height: 1.7;
}

.attachment-card {
  border: 1px solid #e1e8ef;
  border-radius: 8px;
  background: #fff;
  padding: 14px 16px;
}

.attachment-card__facts {
  margin: 0;
  display: grid;
  gap: 10px;
}

.attachment-card__facts > div {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 10px;
  font-size: 13px;
}

.attachment-card__facts dt {
  color: #667085;
}

.attachment-card__facts dd {
  margin: 0;
  color: #172033;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.attachment-card__hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  color: #1d4ed8;
}

.attachment-note {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.7;
}

.attachment-note--pending {
  color: #c2410c;
}

.attachment-note--approved {
  color: #047857;
}

.attachment-note--rejected {
  color: #b91c1c;
}

.attachment-note--locked {
  margin: 12px 0 0;
  color: #92400e;
}

.attachment-note__reason {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff5f5;
  color: #b91c1c;
}

.attachment-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.attachment-prepare {
  margin-top: 8px;
}

.attachment-prepare__tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e5e9ef;
  padding-bottom: 10px;
}

.attachment-tab {
  padding: 6px 14px;
  border: 1px solid #cce3e2;
  border-radius: 999px;
  background: #fff;
  color: #247f7d;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.attachment-tab--active {
  background: #247f7d;
  border-color: #247f7d;
  color: #fff;
}

.attachment-prepare__template {
  margin-left: auto;
}

.attachment-prepare__hint {
  margin: 10px 0;
  color: #667085;
  font-size: 12.5px;
  line-height: 1.7;
}

.attachment-upload {
  display: grid;
  gap: 10px;
  justify-items: start;
  margin-top: 12px;
}

.attachment-upload__picker {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #172033;
}

.attachment-upload__picker input[type='file'] {
  font-size: 13px;
}

.attachment-upload__file {
  margin: 0;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.attachment-draft {
  display: grid;
  gap: 12px;
  margin-top: 12px;
  justify-items: start;
}

.attachment-field {
  display: grid;
  gap: 6px;
  width: 100%;
  font-size: 13px;
  color: #334155;
}

.attachment-field small {
  color: #667085;
  font-size: 12px;
}

.attachment-field input[type='text'],
.attachment-field input[type='number'],
.attachment-field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.attachment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 6px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.attachment-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.attachment-btn--primary {
  border-color: #247f7d;
  background: #247f7d;
  color: #fff;
}

.attachment-btn--ghost {
  border-color: #cce3e2;
  color: #247f7d;
}

.attachment-btn--danger {
  border-color: #fecaca;
  color: #b91c1c;
}

.attachment-msg {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
}

.attachment-msg--success {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  color: #047857;
}

.attachment-msg--error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

@media (max-width: 600px) {
  .attachment-card__facts > div {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .attachment-prepare__template {
    margin-left: 0;
  }
}
</style>
