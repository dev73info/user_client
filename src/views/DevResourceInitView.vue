<script setup lang="ts">
import { ref } from 'vue'
import { TAlert, TButton, TCard } from 'ui_73info'
import type { McResourcePayload } from '@/api/mcResources'
import { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import { useResourceApiChannel } from '@/composables/useResourceApiChannel'
import { useResourceInitForm } from '@/composables/useResourceInitForm'
import { useResourceInitSubmit } from '@/composables/useResourceInitSubmit'
import { useResourceInitPage } from '@/composables/useResourceInitPage'
import ResourceInitMetaStrip from '@/components/dev/ResourceInitMetaStrip.vue'
import ResourceTypeSection from '@/components/dev/ResourceTypeSection.vue'
import ResourceInitBasicInfoSection from '@/components/dev/ResourceInitBasicInfoSection.vue'
import ResourceInitSubmitBar from '@/components/dev/ResourceInitSubmitBar.vue'
import ResourceApiChannelSection from '@/components/dev/ResourceApiChannelSection.vue'
import ResourceTagCatalogSection from '@/components/dev/ResourceTagCatalogSection.vue'
import ResourceSecretPlainDialog from '@/components/dev/ResourceSecretPlainDialog.vue'

/** 免费、付费（买断 / 单版本）与接口共用的资源创建页。 */
const tagCatalog = useResourceTagCatalog()
const formState = useResourceInitForm({
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
  loadGeneration: ref(0),
  clearSecretOnApply: false,
})

const { submitting, submitBlockReason, canSubmit, submitResource, confirmSecretSaved } =
  useResourceInitSubmit({ formState, tagCatalog, channel, createdResource })
const { goBack } = useResourceInitPage({ formState, tagCatalog })

const {
  form,
  selectedIconFile,
  creationType,
  paidMode,
  isApiKind,
  isVersionSale,
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
        <ResourceTypeSection v-model:creation-type="creationType" v-model:paid-mode="paidMode" />

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
          :creation-type="creationType"
          :paid-mode="paidMode"
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

        <!-- 接口渠道在资源创建后保存；类别仍使用现有 resource_kind 字段。 -->
        <ResourceApiChannelSection
          v-if="isApiKind"
          v-model:callback-url="form.apiCallbackUrl"
          v-model:callback-secret="form.apiCallbackSecret"
          v-model:allowed-origins="form.apiAllowedOrigins"
          v-model:repeat-purchasable="form.apiRepeatPurchasable"
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
          :is-version-sale="isVersionSale"
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
