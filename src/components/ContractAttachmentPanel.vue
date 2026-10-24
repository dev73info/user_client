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
 * 本组件不自己拉合同：每次上传 / 拟定 / 撤回都返回后端最新的合同，交给父页面替换本地那份
 * （避免「覆盖后页面还停在旧审核态」）。
 *
 * 拆分（R047）：状态与三个写操作在 `useContractAttachmentPanel`，需求单预填在
 * `useContractRequirementPrefill`，附件 / 模板下载在 `useContractAttachmentDownload`，
 * 纯展示函数与扩展名校验在 `shared/contractAttachmentDisplay.ts`。
 */
import type { ContractDetail } from '@/api/contracts'
import { useContractAttachmentPanel } from '@/composables/useContractAttachmentPanel'
import {
  ACCEPTED_ATTR,
  attachmentPartyLabel,
  formatAttachmentSize,
} from '@/shared/contractAttachmentDisplay'
import {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
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

const {
  contentSource,
  hasAttachment,
  reviewStatus,
  reviewLabel,
  canPrepare,
  mode,
  pickedFile,
  busy,
  actionError,
  actionSuccess,
  downloading,
  templateDownloading,
  draft,
  requirementInfo,
  openUpload,
  openDraft,
  onFilePicked,
  submitUpload,
  submitDraft,
  withdrawAttachment,
  downloadAttachment,
  downloadTemplate,
} = useContractAttachmentPanel(props, (contract) => {
  emit('updated', contract)
})
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
            {{
              contentSource === CONTRACT_CONTENT_SOURCE.drafted ? '页面拟定条款' : '上传的合同文件'
            }}
          </dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>{{ formatAttachmentSize(contract.attachment_file_size) }}</dd>
        </div>
        <div>
          <dt>提交人</dt>
          <dd>
            {{ contract.attachment_prepared_by || '未知' }}
            · {{ attachmentPartyLabel(contract.attachment_prepared_party) }}
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

      <p
        v-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.pending"
        class="attachment-note attachment-note--pending"
      >
        已提交，等待平台审核（审核通过前不能发起签署）。
      </p>
      <p
        v-else-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.approved"
        class="attachment-note attachment-note--approved"
      >
        平台已放行，可以发起签署。
      </p>
      <div
        v-else-if="reviewStatus === ATTACHMENT_REVIEW_STATUS.rejected"
        class="attachment-note attachment-note--rejected"
      >
        <p>平台已驳回，请按理由修改后重新提交。</p>
        <p v-if="contract.attachment_review_note" class="attachment-note__reason">
          驳回理由：{{ contract.attachment_review_note }}
        </p>
        <p v-else class="attachment-note__reason">平台未填写驳回理由。</p>
      </div>

      <div class="attachment-card__actions">
        <button
          type="button"
          class="attachment-btn"
          :disabled="downloading"
          @click="downloadAttachment"
        >
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
          已选：{{ pickedFile.name }} · {{ formatAttachmentSize(pickedFile.size) }}
        </p>
        <p class="attachment-prepare__hint">只收 pdf / doc / docx，不支持图片文件。</p>
        <button
          type="button"
          class="attachment-btn attachment-btn--primary"
          :disabled="busy || !pickedFile"
          @click="submitUpload"
        >
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
          <textarea
            v-model="draft.payment_terms"
            rows="3"
            maxlength="2000"
            :disabled="busy"
          ></textarea>
        </label>
        <label class="attachment-field">
          <span>验收标准</span>
          <textarea
            v-model="draft.acceptance_criteria"
            rows="3"
            maxlength="2000"
            :disabled="busy"
          ></textarea>
        </label>
        <label class="attachment-field">
          <span>知识产权约定</span>
          <textarea
            v-model="draft.intellectual_property"
            rows="3"
            maxlength="2000"
            :disabled="busy"
          ></textarea>
        </label>
        <label class="attachment-field">
          <span>违约与争议解决</span>
          <textarea
            v-model="draft.breach_and_dispute"
            rows="3"
            maxlength="2000"
            :disabled="busy"
          ></textarea>
        </label>
        <label class="attachment-field">
          <span>补充条款</span>
          <textarea
            v-model="draft.supplementary_terms"
            rows="4"
            maxlength="4000"
            :disabled="busy"
          ></textarea>
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
    <p v-if="actionError" class="attachment-msg attachment-msg--error" role="alert">
      {{ actionError }}
    </p>
  </section>
</template>

<style scoped src="./contract-attachment-panel.css"></style>

<style scoped src="./contract-attachment-forms.css"></style>
