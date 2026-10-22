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
  wornBadges,
  badgeCount,
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
  receivedPointsText,
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
      :worn-badges="wornBadges"
      :badge-count="badgeCount"
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
      :points-text="receivedPointsText"
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
  --dp-ink: #0f172a;
  --dp-ink-soft: #334155;
  --dp-ink-muted: #475569;
  --dp-text-muted: #64748b;
  --dp-text-faint: #94a3b8;
  --dp-white: #fff;
  --dp-accent: #2563eb;
  --dp-accent-strong: #1d4ed8;
  --dp-accent-bright: #3b82f6;
  --dp-accent-light: #60a5fa;
  --dp-accent-sky: #38bdf8;
  --dp-tip-ink-strong: #9a3412;
  --dp-tip-ink: #b45309;
  --dp-danger: #dc2626;
  --dp-danger-strong: #b91c1c;
  --dp-warn-bg: #fffbeb;
  --dp-danger-bg: #fef2f2;
  --dp-accent-bg: #eff6ff;
  --dp-surface: #f8fafc;
  --dp-surface-2: #f1f5f9;
  --dp-surface-3: #e2e8f0;
  --dp-divider: #eef2f7;
  --dp-border: #dbe4f0;
  --dp-border-accent: #bfdbfe;
  --dp-border-soft: rgba(226, 232, 240, 0.96);
  --dp-border-soft-60: rgba(226, 232, 240, 0.6);
  --dp-border-muted-50: rgba(148, 163, 184, 0.5);
  --dp-border-muted-36: rgba(148, 163, 184, 0.36);
  --dp-border-sky-50: rgba(147, 197, 253, 0.5);
  --dp-border-accent-72: rgba(191, 219, 254, 0.72);
  --dp-border-accent-50: rgba(59, 130, 246, 0.5);
  --dp-border-accent-36: rgba(59, 130, 246, 0.36);
  --dp-border-accent-30: rgba(59, 130, 246, 0.3);
  --dp-ring-accent: rgba(96, 165, 250, 0.5);
  --dp-ring-accent-16: rgba(96, 165, 250, 0.16);
  --dp-halo-accent: rgba(59, 130, 246, 0.16);
  --dp-shadow-accent: rgba(37, 99, 235, 0.16);
  --dp-shadow-accent-08: rgba(37, 99, 235, 0.08);
  --dp-shadow-deep: rgba(30, 64, 175, 0.16);
  --dp-halo-sky: rgba(125, 211, 252, 0.16);
  --dp-scrim-55: rgba(15, 23, 42, 0.55);
  --dp-scrim-45: rgba(15, 23, 42, 0.45);
  --dp-scrim-28: rgba(15, 23, 42, 0.28);
  --dp-shadow-ink: rgba(15, 23, 42, 0.08);
  --dp-white-96: rgba(255, 255, 255, 0.96);
  --dp-white-94: rgba(255, 255, 255, 0.94);
  --dp-white-92: rgba(255, 255, 255, 0.92);
  --dp-white-90: rgba(255, 255, 255, 0.9);
  --dp-white-78: rgba(255, 255, 255, 0.78);
  --dp-white-60: rgba(255, 255, 255, 0.6);
  --dp-white-50: rgba(255, 255, 255, 0.5);
  --dp-surface-70: rgba(248, 250, 252, 0.7);
  --dp-accent-wash: rgba(239, 246, 255, 0.98);
  --dp-accent-wash-80: rgba(239, 246, 255, 0.8);
  --dp-mint-wash: rgba(240, 253, 250, 0.9);
  --dp-tip-wash: rgba(255, 251, 235, 0.96);
  --dp-tip-wash-2: rgba(255, 247, 237, 0.9);
  --dp-tip-border: rgba(253, 230, 138, 0.9);
  --dp-tip-ring: rgba(245, 158, 11, 0.55);
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
