<script setup lang="ts">
import { computed, ref } from 'vue'
import { TAlert, TButton, TCard } from 'ui_73info'
import type { McResourceKind, McResourcePayload } from '@/api/mcResources'
import { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import { useResourceApiChannel } from '@/composables/useResourceApiChannel'
import { useResourceInitForm } from '@/composables/useResourceInitForm'
import { useResourceInitSubmit } from '@/composables/useResourceInitSubmit'
import { useResourceInitPage } from '@/composables/useResourceInitPage'
import ResourceInitMetaStrip from '@/components/dev/ResourceInitMetaStrip.vue'
import ResourceInitBasicInfoSection from '@/components/dev/ResourceInitBasicInfoSection.vue'
import ResourceInitSubmitBar from '@/components/dev/ResourceInitSubmitBar.vue'
import ResourceApiChannelSection from '@/components/dev/ResourceApiChannelSection.vue'
import ResourceTagCatalogSection from '@/components/dev/ResourceTagCatalogSection.vue'
import ResourceSecretPlainDialog from '@/components/dev/ResourceSecretPlainDialog.vue'

/**
 * 开发者工作台「发布资源」创建页。
 *
 * 入口分两条（R028）：普通资源（`dev-plugins`）与接口资源（`dev-plugins-api`），
 * 类别由路由 props 传进来，表单里没有「资源类别」这个可选项：
 * - 普通资源：基础信息 + 标签归类，可创建私有项目或申请公开；
 * - 接口资源：基础信息 + 渠道配置，没有标签归类、没有积分价，一律「原创」。
 *
 * 状态与请求在 composable 里（表单 / 标签目录 / 渠道 / 提交 / 页面加载），
 * 模板区块在 `components/dev/Resource*Section.vue`，这里只剩布局与接线。
 */
const props = withDefaults(defineProps<{ kind?: McResourceKind }>(), { kind: 'normal' })
const resourceKind = computed<McResourceKind>(() => (props.kind === 'api' ? 'api' : 'normal'))

/** 标签树与勾选：本页没有已存资源，不传 resource，加载时会落到标签树首项。 */
const tagCatalog = useResourceTagCatalog()
const formState = useResourceInitForm({
  resourceKind,
  selectedTagCount: tagCatalog.selectedTagCount,
  currentEntryKey: tagCatalog.currentEntryKey,
  currentEntryLabel: tagCatalog.currentEntryLabel,
  currentPlatform: tagCatalog.currentPlatform,
  currentPlatformLabel: tagCatalog.currentPlatformLabel,
})
/** 建好的资源：既是「别重复创建」的锚点，也是接入提示词里资源编号的来源。 */
const createdResource = ref<McResourcePayload | null>(null)
const channel = useResourceApiChannel({
  resource: createdResource,
  form: formState.form,
  isApiKind: formState.isApiKind,
  // 新建页不会换资源，代际固定为 0
  loadGeneration: ref(0),
  // 新建页保留开发者这次填的密钥；清空是编辑页「留空 = 不改」的口径
  clearSecretOnApply: false,
})

const { submitting, submitBlockReason, canSubmit, submitResource, confirmSecretSaved } =
  useResourceInitSubmit({ formState, tagCatalog, channel, createdResource })
const { goBack } = useResourceInitPage({ resourceKind, formState, tagCatalog })

const {
  form,
  selectedIconFile,
  isApiKind,
  effectiveOriginType,
  myTeams,
  teamOptions,
  hasJoinedTeam,
  cashPriceDisabled,
  pointsPriceDisabled,
  showCopyrightField,
  promoShareError,
  promoShareDisplay,
  promoSharePercentValue,
  onCashPriceInput,
  onPointsPriceInput,
} = formState
const {
  currentRootKey,
  currentEntryKey,
  currentRootLabel,
  currentEntryLabel,
  entryTabs,
  rootTabs,
  platformTagGroups,
  selectedTagIdsByGroup,
  selectedTagCount,
  isLoadingTags,
  selectRoot,
  selectEntry,
  setGroupTagIds,
  loadTagTree,
} = tagCatalog
const {
  needsApiAgreement,
  goSignApiAgreement,
  apiCallbackInvalid,
  invalidApiOrigin,
  apiChannelBlockers,
  revealedSecretPlain,
  secretPlainDialogVisible,
  savedSecretMaskedLabel,
  apiIntegrationPrompt,
  copyRevealedSecret,
  copyApiPrompt,
} = channel
</script>

<template>
  <div class="dev-page dev-page--publish">
    <ResourceInitMetaStrip
      :is-api-kind="isApiKind"
      :root-label="currentRootLabel"
      :entry-label="currentEntryLabel"
      :selected-tag-count="selectedTagCount"
      :is-loading-tags="isLoadingTags"
      @refresh-tags="loadTagTree"
      @back="goBack"
    />

    <!-- 协议未签：签署按钮进 TAlert 的 #actions，排在提示框内右侧（窄屏整块换行） -->
    <TAlert
      v-if="needsApiAgreement"
      tone="warning"
      variant="soft"
      class="dev-api-agreement-notice"
      title="请先签署《接口使用协议》"
    >
      <template #actions>
        <TButton variant="solid" tone="accent" @click="goSignApiAgreement">
          去签署接口使用协议
        </TButton>
      </template>
    </TAlert>

    <div class="dev-upload-layout">
      <TCard class="dev-surface-card dev-upload-combined-card">
        <ResourceInitBasicInfoSection
          v-model:cover-url="form.coverUrl"
          v-model:cover-file="selectedIconFile"
          v-model:title="form.title"
          v-model:ownership-type="form.ownershipType"
          v-model:team-id="form.teamId"
          v-model:origin-type="form.originType"
          v-model:copyright-declared="form.copyrightDeclared"
          v-model:origin-author="form.originAuthor"
          v-model:origin-url="form.originUrl"
          v-model:origin-org="form.originOrg"
          v-model:origin-note="form.originNote"
          v-model:price-yuan="form.priceYuan"
          v-model:price-points="form.pricePoints"
          v-model:promo-share-percent="form.promoSharePercent"
          :is-api-kind="isApiKind"
          :effective-origin-type="effectiveOriginType"
          :has-joined-team="hasJoinedTeam"
          :has-teams="myTeams.length > 0"
          :team-options="teamOptions"
          :cash-price-disabled="cashPriceDisabled"
          :points-price-disabled="pointsPriceDisabled"
          :show-copyright-field="showCopyrightField"
          :promo-share-error="promoShareError"
          :promo-share-display="promoShareDisplay"
          :promo-share-off="promoSharePercentValue <= 0"
          @cash-price-input="onCashPriceInput"
          @points-price-input="onPointsPriceInput"
        />

        <!-- R028 接口资源：只有接口资源创建页（dev-plugins-api）才有这一段。
             字段与后端契约一一对应（资源类别随资源一次保存，渠道配置在资源建好之后 PUT）。 -->
        <ResourceApiChannelSection
          v-if="isApiKind"
          v-model:callback-url="form.apiCallbackUrl"
          v-model:callback-secret="form.apiCallbackSecret"
          v-model:allowed-origins="form.apiAllowedOrigins"
          :retry-only="false"
          :channel-save-error="''"
          :blockers="apiChannelBlockers"
          :callback-invalid="apiCallbackInvalid"
          :invalid-origin="invalidApiOrigin"
          :secret-masked-label="savedSecretMaskedLabel"
          :revealed-secret-plain="revealedSecretPlain"
          :integration-prompt="apiIntegrationPrompt"
          draft-mode
          @copy-secret="copyRevealedSecret"
          @copy-prompt="copyApiPrompt"
        />

        <!-- 接口资源不选标签归类（不属于任何根节点 / 二级节点），整块不出现 -->
        <ResourceTagCatalogSection
          v-if="!isApiKind"
          :root-key="currentRootKey"
          :entry-key="currentEntryKey"
          :root-label="currentRootLabel"
          :entry-label="currentEntryLabel"
          :roots="rootTabs"
          :entries="entryTabs"
          :groups="platformTagGroups"
          :selected-tag-ids-by-group="selectedTagIdsByGroup"
          :is-loading-tags="isLoadingTags"
          show-root-when-empty
          empty-tree-hint="当前根节点尚未配置二级节点，请先在管理端补齐标签树。"
          @select-root="selectRoot"
          @select-entry="selectEntry"
          @update-group-tags="setGroupTagIds"
        />

        <ResourceInitSubmitBar
          :can-submit="canSubmit"
          :submit-block-reason="submitBlockReason"
          :is-api-kind="isApiKind"
          :submitting="submitting"
          :entry-label="currentEntryLabel"
          :selected-tag-count="selectedTagCount"
          :needs-api-agreement="needsApiAgreement"
          @submit="submitResource"
          @sign-agreement="goSignApiAgreement"
        />
      </TCard>
    </div>

    <!-- 后端首次生成的回调密钥：明文只回这一次，弹窗最醒目地提示一次 -->
    <ResourceSecretPlainDialog
      v-model:open="secretPlainDialogVisible"
      :secret="revealedSecretPlain"
      confirm-label="我已保存，前往资源列表"
      @copy="copyRevealedSecret"
      @confirm="confirmSecretSaved"
    />
  </div>
</template>
