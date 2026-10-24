<script setup lang="ts">
import { ref } from 'vue'
import { TAlert, TButton, TCard, TLoading } from 'ui_73info'
import ResourceTransferDialog from '@/components/ResourceTransferDialog.vue'
import ResourceHomepageEditBar from '@/components/dev/ResourceHomepageEditBar.vue'
import ResourceBasicInfoSection from '@/components/dev/ResourceBasicInfoSection.vue'
import ResourceApiChannelSection from '@/components/dev/ResourceApiChannelSection.vue'
import ResourceTagCatalogSection from '@/components/dev/ResourceTagCatalogSection.vue'
import ResourcePageContentSection from '@/components/dev/ResourcePageContentSection.vue'
import ResourceHomepagePreviewAside from '@/components/dev/ResourceHomepagePreviewAside.vue'
import ResourceSecretPlainDialog from '@/components/dev/ResourceSecretPlainDialog.vue'
import { useResourceHomepageResource } from '@/composables/useResourceHomepageResource'
import { useResourceHomepageTeams } from '@/composables/useResourceHomepageTeams'
import { useResourceTagCatalog } from '@/composables/useResourceTagCatalog'
import {
  useResourceHomepageForm,
  type ResourceRichEditorHandle,
} from '@/composables/useResourceHomepageForm'
import { useResourceApiChannel } from '@/composables/useResourceApiChannel'
import { useResourceHomepageSave } from '@/composables/useResourceHomepageSave'
import { useResourceHomepageLoader } from '@/composables/useResourceHomepageLoader'
import {
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'

/**
 * 开发者工作台「资源主页编辑」页。
 *
 * 这一页是两条互相牵制的编辑链叠在一起：
 * - 普通资源：基础信息 + 标签归类 + 页面内容，保存一次 PATCH 主页；
 * - R028 接口资源：没有标签归类与页面内容，多了渠道配置（回调地址 / 一次性密钥 / 允许来源），
 *   主页存住后再 PUT 渠道；渠道失败时下一次保存只重发渠道这一半。
 *
 * 状态与请求都在 composable 里（资源 / 表单 / 分类目录 / 渠道 / 保存 / 加载时序），
 * 模板区块在 `components/dev/Resource*Section.vue`，这里只剩布局与接线。
 */
const {
  auth,
  route,
  router,
  resource,
  loading,
  loadGeneration,
  resourceVisibilityLabel,
  archiveLocked,
  boundToRequirement,
  transferDialogVisible,
  canTransferResource,
  userClientPreviewUrl,
  goBack,
} = useResourceHomepageResource()

const teams = useResourceHomepageTeams()
const tagCatalog = useResourceTagCatalog(resource)
/** 「页面内容」区块暴露 setContent，保存链路加载时要把发布说明灌回编辑器。 */
const pageContentRef = ref<ResourceRichEditorHandle | null>(null)
const formState = useResourceHomepageForm({
  resource,
  boundToRequirement,
  currentEntry: tagCatalog.currentEntry,
  currentEntryLabel: tagCatalog.currentEntryLabel,
  selectedTagCount: tagCatalog.selectedTagCount,
  editorRef: pageContentRef,
})
const channel = useResourceApiChannel({
  resource,
  form: formState.form,
  isApiKind: formState.isApiKind,
  loadGeneration,
})

/** 归类的提交口径（接口资源一个标签都不提交）——保存与用例都读这一个入口。 */
function buildTagSelections() {
  return tagCatalog.buildTagSelections(isApiKind.value)
}

const { saving, saveHomepage } = useResourceHomepageSave({
  resource,
  form: formState.form,
  isApiKind: formState.isApiKind,
  effectiveOriginType: formState.effectiveOriginType,
  boundToRequirement,
  pointsLockedBySavedCash: formState.pointsLockedBySavedCash,
  selectedCoverFile: formState.selectedCoverFile,
  tagCatalog,
  buildTagSelections,
  channel,
  applySavedHomepage: formState.applySavedHomepage,
})

useResourceHomepageLoader({
  auth,
  route,
  router,
  resource,
  loading,
  loadGeneration,
  formState,
  tagCatalog,
  channel,
  loadMyTeams: teams.loadMyTeams,
})

const { form, isApiKind, effectiveOriginType } = formState
const {
  currentRootKey,
  currentEntryKey,
  currentRootLabel,
  currentEntryLabel,
  entryTabs,
  rootTabs,
  platformTagGroups,
  selectedTagIdsByGroup,
  isLoadingTags,
  selectRoot,
  selectEntry,
  setGroupTagIds,
  loadTagTree,
} = tagCatalog
</script>

<template>
  <div class="dev-page dev-page--resource-homepage-editor dev-page--publish">
    <ResourceHomepageEditBar
      :is-api-kind="isApiKind"
      :visibility-label="resourceVisibilityLabel"
      :saving="saving"
      :save-disabled="archiveLocked || channel.needsApiAgreement.value"
      :can-transfer="canTransferResource"
      :show-preview="Boolean(resource) && !isApiKind"
      :preview-url="userClientPreviewUrl"
      :is-loading-tags="isLoadingTags"
      @back="goBack"
      @transfer="transferDialogVisible = true"
      @save="saveHomepage"
      @refresh-tags="loadTagTree"
    />

    <TAlert
      v-if="archiveLocked"
      tone="warning"
      variant="soft"
      class="dev-archive-locked-notice"
      data-testid="resource-archive-locked-notice"
      :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
      :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
    />

    <!-- 协议未签：签署按钮进 TAlert 的 #actions，排在提示框内右侧（窄屏整块换行） -->
    <TAlert
      v-if="channel.needsApiAgreement.value"
      tone="warning"
      variant="soft"
      class="dev-api-agreement-notice"
      title="请先签署《接口使用协议》"
      description="该接口资源需要补签协议后才能继续编辑或配置；补签前开放下单也会暂停。"
    >
      <template #actions>
        <TButton variant="solid" tone="accent" @click="channel.goSignApiAgreement">
          去签署接口使用协议
        </TButton>
      </template>
    </TAlert>

    <TLoading
      tag="section"
      class="dev-resource-homepage-editor__layout"
      :class="{ 'dev-resource-homepage-editor__layout--single': isApiKind }"
      :loading="loading"
    >
      <div class="dev-resource-homepage-editor__forms">
        <TCard class="dev-surface-card dev-upload-combined-card">
          <ResourceBasicInfoSection
            v-model:title="form.title"
            v-model:description="form.description"
            v-model:ownership-type="form.ownershipType"
            v-model:team-id="form.teamId"
            v-model:origin-type="form.originType"
            v-model:origin-author="form.originAuthor"
            v-model:origin-url="form.originUrl"
            v-model:origin-org="form.originOrg"
            v-model:origin-note="form.originNote"
            v-model:copyright-declared="form.copyrightDeclared"
            v-model:price-yuan="form.priceYuan"
            v-model:price-points="form.pricePoints"
            v-model:promo-share-percent="form.promoSharePercent"
            v-model:cover-file="formState.selectedCoverFile.value"
            :cover-preview="formState.coverPreview.value"
            :is-api-kind="isApiKind"
            :effective-origin-type="effectiveOriginType"
            :has-joined-team="teams.hasJoinedTeam.value"
            :has-teams="teams.myTeams.value.length > 0"
            :team-options="teams.teamOptions.value"
            :cash-price-disabled="formState.cashPriceDisabled.value"
            :points-price-disabled="formState.pointsPriceDisabled.value"
            :points-locked-by-saved-cash="formState.pointsLockedBySavedCash.value"
            :bound-to-requirement="boundToRequirement"
            :promo-share-error="formState.promoShareError.value"
            :promo-share-display="formState.promoShareDisplay.value"
            :promo-share-off="formState.promoSharePercentValue.value <= 0"
            :is-paid-pricing="formState.isPaidPricing.value"
            @update:cover-preview="formState.handleCoverPreviewChange"
            @description-input="formState.onDescriptionInput"
            @cash-price-input="formState.onCashPriceInput"
            @points-price-input="formState.onPointsPriceInput"
          />

          <ResourceApiChannelSection
            v-if="isApiKind"
            v-model:callback-url="form.apiCallbackUrl"
            v-model:callback-secret="form.apiCallbackSecret"
            v-model:allowed-origins="form.apiAllowedOrigins"
            v-model:repeat-purchasable="form.apiRepeatPurchasable"
            :retry-only="channel.channelRetryOnly.value"
            :channel-save-error="channel.channelSaveError.value"
            :blockers="channel.apiChannelBlockers.value"
            :callback-invalid="channel.apiCallbackInvalid.value"
            :invalid-origin="channel.invalidApiOrigin.value"
            :secret-masked-label="channel.savedSecretMaskedLabel.value"
            :revealed-secret-plain="channel.revealedSecretPlain.value"
            :integration-prompt="channel.apiIntegrationPrompt.value"
            @copy-secret="channel.copyRevealedSecret"
            @copy-prompt="channel.copyApiPrompt"
            @repeat-change="channel.onRepeatPurchasableChange"
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
            @select-root="selectRoot"
            @select-entry="selectEntry"
            @update-group-tags="setGroupTagIds"
          />

          <!-- 接口资源没有公开主页（不进大厅、首页精选与搜索），页面内容整块不出现 -->
          <ResourcePageContentSection
            v-if="!isApiKind"
            ref="pageContentRef"
            v-model="formState.richEditorContent.value"
            @notify="formState.notify"
          />
        </TCard>
      </div>

      <!-- 预览摘要画的是大厅资源卡的外观；接口资源不进大厅、首页精选与公开搜索，
           没有这张卡的落地页，侧栏整块不出现（主栏随之占满一行）。 -->
      <ResourceHomepagePreviewAside
        v-if="!isApiKind"
        :cover-preview="formState.coverPreview.value"
        :title="formState.heroTitle.value"
        :description="form.description"
        :platform-label="formState.resourcePlatformLabel.value"
        :author-label="formState.resourceAuthorLabel.value"
        :entry-label="formState.previewEntryLabel.value"
        :tag-count="tagCatalog.previewTagCount.value"
      />
    </TLoading>

    <ResourceTransferDialog v-model:open="transferDialogVisible" :resource="resource" />

    <!-- 后端首次生成的回调密钥：明文只回这一次，弹窗最醒目地提示一次 -->
    <ResourceSecretPlainDialog
      v-model:open="channel.secretPlainDialogVisible.value"
      :secret="channel.revealedSecretPlain.value"
      @copy="channel.copyRevealedSecret"
    />
  </div>
</template>
