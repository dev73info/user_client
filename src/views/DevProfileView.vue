<script setup lang="ts">
/**
 * 开发者公开主页（`/user/:username/profile`）。
 *
 * 视图只剩结构：头部 / 读数 / 收到打赏 / 公开资源 / 三个弹窗。
 * 取数与动作在 `useDevProfilePage` 及其 composable 里，样式跟各自组件走；
 * 这里只保留页面骨架与 `--dp-*` 这层页面级颜色令牌（组件不写裸色值）。
 */
import { TLoading } from 'ui_73info'

import DevTipDialog from '@/components/DevTipDialog.vue'
import DevProfileBackgroundDialog from '@/components/dev/DevProfileBackgroundDialog.vue'
import DevProfileEditDialog from '@/components/dev/DevProfileEditDialog.vue'
import DevProfileHeader from '@/components/dev/DevProfileHeader.vue'
import DevProfileResourceList from '@/components/dev/DevProfileResourceList.vue'
import DevProfileStats from '@/components/dev/DevProfileStats.vue'
import DevProfileTipsSection from '@/components/dev/DevProfileTipsSection.vue'
import { useDevProfilePage } from '@/composables/useDevProfilePage'

const {
  loading,
  username,
  avatarUrl,
  onAvatarError,
  profileDescription,
  profileGradient,
  profileColor,
  isSelf,
  canTip,
  videoBackgroundUrl,
  imageBackgroundUrl,
  mediaStyle,
  editProfile,
  setBackground,
  openTipDialog,
  openTipSettings,
  stats,
  showReceivedTips,
  receivedCashText,
  recentTipMessages,
  resourceCards,
  resourceCount,
  openResource,
  onCoverError,
  backgroundDialogVisible,
  backgroundMode,
  backgroundPreview,
  backgroundVideoPreview,
  backgroundAccept,
  backgroundUploading,
  backgroundRemoving,
  backgroundUrl,
  backgroundInitialFocus,
  backgroundFocusToken,
  canSaveBackground,
  pickBackgroundFile,
  submitBackground,
  removeBackground,
  resetBackgroundDialog,
  profileDialogVisible,
  profileDescriptionDraft,
  profileSaving,
  saveProfile,
  tipDialogOpen,
  tipBlock,
  authToken,
  onTipSuccess,
} = useDevProfilePage()
</script>

<template>
  <TLoading tag="main" class="dev-profile" :loading="loading">
    <DevProfileHeader
      :username="username"
      :avatar-url="avatarUrl"
      :description="profileDescription"
      :gradient="profileGradient"
      :color="profileColor"
      :is-self="isSelf"
      :can-tip="canTip"
      :video-url="videoBackgroundUrl"
      :image-url="imageBackgroundUrl"
      :media-style="mediaStyle"
      @edit="editProfile"
      @set-background="setBackground"
      @tip-settings="openTipSettings"
      @tip="openTipDialog"
      @avatar-error="onAvatarError"
    />

    <DevProfileStats :stats="stats" />

    <!-- 收到打赏：仅开发者开启公开记录时可见 -->
    <DevProfileTipsSection
      v-if="showReceivedTips"
      :cash-text="receivedCashText"
      :messages="recentTipMessages"
    />

    <DevProfileResourceList
      :cards="resourceCards"
      :count="resourceCount"
      @open="openResource"
      @cover-error="onCoverError"
    />

    <!-- 设置主页背景 -->
    <DevProfileBackgroundDialog
      v-model:open="backgroundDialogVisible"
      :mode="backgroundMode"
      :preview="backgroundPreview"
      :video-preview="backgroundVideoPreview"
      :accept="backgroundAccept"
      :has-background="!!backgroundUrl"
      :initial-focus="backgroundInitialFocus"
      :focus-token="backgroundFocusToken"
      :uploading="backgroundUploading"
      :removing="backgroundRemoving"
      :can-save="canSaveBackground"
      @save="submitBackground"
      @remove="removeBackground"
      @pick="pickBackgroundFile"
      @closed="resetBackgroundDialog"
    />

    <DevProfileEditDialog
      v-model:open="profileDialogVisible"
      v-model:description="profileDescriptionDraft"
      :saving="profileSaving"
      @save="saveProfile"
    />

    <!-- R010 打赏弹窗：他人视角选档位 / 自填、留言、匿名，现金走中间页、积分一步到位 -->
    <DevTipDialog
      v-model:open="tipDialogOpen"
      :username="username"
      :tip="tipBlock"
      :token="authToken"
      @success="onTipSuccess"
    />
  </TLoading>
</template>

<style>
/* 页面级颜色令牌：组件与样式文件只写 var(--dp-*)，裸色值集中在这一处。 */
:root {
  --dp-ink: var(--73-ink);
  --dp-ink-soft: var(--73-ink-soft);
  --dp-ink-muted: var(--73-ink-soft);
  --dp-text-muted: var(--73-ink-muted);
  --dp-text-faint: var(--73-ink-placeholder);
  --dp-white: var(--73-surface-strong);
  --dp-accent: var(--73-accent);
  --dp-accent-strong: var(--73-accent);
  --dp-accent-bright: var(--73-accent);
  --dp-accent-light: var(--73-accent);
  --dp-accent-sky: var(--73-accent);
  --dp-tip-ink-strong: var(--73-danger-text);
  --dp-tip-ink: var(--73-warning);
  --dp-danger: var(--73-danger);
  --dp-danger-strong: var(--73-danger);
  --dp-warn-bg: var(--73-warning-soft);
  --dp-danger-bg: var(--73-danger-soft);
  --dp-accent-bg: var(--73-accent-soft);
  --dp-surface: var(--73-surface-strong);
  --dp-surface-2: var(--73-surface-strong);
  --dp-surface-3: var(--73-border);
  --dp-divider: var(--73-surface-strong);
  --dp-border: var(--73-accent-soft);
  --dp-border-accent: var(--73-accent-soft);
  --dp-border-soft: color-mix(in srgb, var(--73-border) 96%, transparent);
  --dp-border-soft-60: color-mix(in srgb, var(--73-border) 60%, transparent);
  --dp-border-muted-50: color-mix(in srgb, var(--73-ink-placeholder) 50%, transparent);
  --dp-border-muted-36: color-mix(in srgb, var(--73-ink-placeholder) 36%, transparent);
  --dp-border-sky-50: color-mix(in srgb, var(--73-accent) 50%, transparent);
  --dp-border-accent-72: color-mix(in srgb, var(--73-accent-soft) 72%, transparent);
  --dp-border-accent-50: color-mix(in srgb, var(--73-accent) 50%, transparent);
  --dp-border-accent-36: color-mix(in srgb, var(--73-accent) 36%, transparent);
  --dp-border-accent-30: color-mix(in srgb, var(--73-accent) 30%, transparent);
  --dp-ring-accent: color-mix(in srgb, var(--73-accent) 50%, transparent);
  --dp-ring-accent-16: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --dp-halo-accent: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --dp-shadow-accent: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --dp-shadow-accent-08: color-mix(in srgb, var(--73-accent) 8%, transparent);
  --dp-shadow-deep: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --dp-halo-sky: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --dp-scrim-55: color-mix(in srgb, var(--73-ink) 55%, transparent);
  --dp-scrim-45: color-mix(in srgb, var(--73-ink) 45%, transparent);
  --dp-scrim-28: color-mix(in srgb, var(--73-ink) 28%, transparent);
  --dp-shadow-ink: color-mix(in srgb, var(--73-ink) 8%, transparent);
  --dp-white-96: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  --dp-white-94: color-mix(in srgb, var(--73-surface-strong) 94%, transparent);
  --dp-white-92: color-mix(in srgb, var(--73-surface-strong) 92%, transparent);
  --dp-white-90: color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  --dp-white-78: color-mix(in srgb, var(--73-surface-strong) 78%, transparent);
  --dp-white-60: color-mix(in srgb, var(--73-surface-strong) 60%, transparent);
  --dp-white-50: color-mix(in srgb, var(--73-surface-strong) 50%, transparent);
  --dp-surface-70: color-mix(in srgb, var(--73-surface-strong) 70%, transparent);
  --dp-accent-wash: color-mix(in srgb, var(--73-accent-soft) 98%, transparent);
  --dp-accent-wash-80: color-mix(in srgb, var(--73-accent-soft) 80%, transparent);
  --dp-mint-wash: color-mix(in srgb, var(--73-success-soft) 90%, transparent);
  --dp-tip-wash: color-mix(in srgb, var(--73-warning-soft) 96%, transparent);
  --dp-tip-wash-2: color-mix(in srgb, var(--73-warning-soft) 90%, transparent);
  --dp-tip-border: color-mix(in srgb, var(--73-warning) 90%, transparent);
  --dp-tip-ring: color-mix(in srgb, var(--73-warning) 55%, transparent);
}

.dev-profile {
  position: relative;
  width: min(1120px, calc(100% - 32px));
  margin: 24px auto 48px;
  display: grid;
  gap: 24px;
}

.dev-profile__section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--dp-ink);
}

.dev-profile__section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.dev-profile__section-count {
  padding: 5px 10px;
  border: 1px solid var(--dp-border-sky-50);
  border-radius: 999px;
  background: var(--dp-accent-wash-80);
  color: var(--dp-accent);
  font-size: 12px;
  font-weight: 700;
}

.dev-profile__empty {
  padding: 48px 16px;
  border: 1px dashed var(--dp-border-muted-36);
  border-radius: 12px;
  text-align: center;
  color: var(--dp-text-faint);
  font-size: 14px;
}

@media (max-width: 640px) {
  .dev-profile__section-heading {
    align-items: start;
  }
}
</style>
