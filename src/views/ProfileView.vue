<script setup lang="ts">
import { TMessage } from 'ui_73info'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OverviewStrip from '@/components/profile/OverviewStrip.vue'
import ProfileAvatarCropModal from '@/components/profile/ProfileAvatarCropModal.vue'
import QuickLinksPanel from '@/components/profile/QuickLinksPanel.vue'
import RecentConversationsPanel from '@/components/profile/RecentConversationsPanel.vue'
import ProfileQuickNav from '@/components/profile/ProfileQuickNav.vue'
import RequirementProgressPanel from '@/components/profile/RequirementProgressPanel.vue'
import PublishModal from '@/components/PublishModal.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useProfileCard } from '@/composables/useProfileCard'
import { useProfilePublishRequirement } from '@/composables/useProfilePublishRequirement'
import {
  useRequirementConversations,
  type RequirementConversationCard,
} from '@/composables/useRequirementConversations'
import { useRequirementOverview } from '@/composables/useRequirementOverview'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

/**
 * 需求状态域与会话域各建一份，会话域接的正是需求域那**一个** `myRequirements`：
 * 读数条、需求进度面板、会话卡的派生都从这份列表出，别再取一遍。
 */
const requirementOverview = useRequirementOverview()
const {
  myRequirements,
  requirementLoading,
  requirementStats,
  actionableRequirements,
  recentRequirements,
  loadMyRequirements,
} = requirementOverview
const {
  availableConversationCount,
  recentConversationCards,
  loadRequirementConversations,
  applyConversationDetail,
} = useRequirementConversations({ requirements: myRequirements })

const conversationVisible = ref(false)
/** 会话弹窗要的那一条：卡片上已有需求号与标题，够弹窗起头用，不必再握一份完整需求。 */
const conversationRequirement = ref<RequirementConversationCard | null>(null)

/**
 * 发布需求域（弹窗可见性、表单态、实名门禁、建单与 `?modal=publish` 的读写）在
 * `useProfilePublishRequirement`。这里只留两个跳转与一个刷新口子：
 * 门禁判完「能不能发」，去哪儿由视图决定（登录页 / 实名页）。
 */
const { publishModalRef, publishModalBindings } = useProfilePublishRequirement({
  reloadRequirements: loadMyRequirements,
  onNeedLogin: (redirectTarget) => {
    void router.push({
      name: 'home',
      query: { modal: 'auth', mode: 'login', redirect_to: redirectTarget },
    })
  },
  onNeedRealname: (redirectTarget) => {
    void router.push({ name: 'workbench-realname', query: { redirect_to: redirectTarget } })
  },
})

/**
 * 头像卡这一块（资料与券包的取数、顶部展示派生、选图入口、头像裁剪挂点）在 `useProfileCard`；
 * 两路需求侧数据由视图注入 —— 读数条那颗刷新要一次把它们一起 await 完再提示。
 */
const {
  loading,
  usableCouponCount,
  accountEmailLabel,
  profileAvatarSrc,
  profileInitial,
  timeGreeting,
  subscriptionLabel,
  profileAvatarInput,
  profileAvatarUploading,
  avatarCropModal,
  openProfileAvatarPicker,
  handleProfileAvatarChange,
  handleProfileAvatarError,
  loadProfile,
  loadCoupons,
  refreshProfile: refreshProfileData,
} = useProfileCard({
  reloadRequirements: loadMyRequirements,
  reloadConversations: loadRequirementConversations,
})

function openConversation(card: RequirementConversationCard) {
  conversationRequirement.value = card
  conversationVisible.value = true
}

function closeConversation() {
  conversationVisible.value = false
}

/** 需求详情浮层已去掉：需求正文在需求详情里看（会话标题栏的「需求详情」抽屉、开发者需求详情页），
    这里只跳到「我的需求」列表。 */
function handleRequirementSelect() {
  void router.push({ name: 'workbench-requirements' })
}

/**
 * 首屏串行链：四路并发取数 → 再消费 OAuth 回跳参数并清掉。
 *
 * 这条链**必须留在视图**：五路请求（券包、需求列表、需求里的按条合同状态、会话、资料）
 * 的 `load*` 虽由各自的域提供，但**挂载时只在这里统一 await 一次**；拆进各组件内部就变成
 * 每块各自 `onMounted` 发请求，请求次数从一次变多次，且刷新按钮再也管不到它们。
 */
onMounted(async () => {
  auth.hydrate()
  await Promise.all([
    loadCoupons(),
    loadMyRequirements(),
    loadRequirementConversations(),
    loadProfile(),
  ])

  const oauthResult = typeof route.query.wechat_oauth === 'string' ? route.query.wechat_oauth : ''
  const oauthError =
    typeof route.query.wechat_oauth_error === 'string' ? route.query.wechat_oauth_error : ''
  const unionOauthResult =
    typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
  const unionOauthError =
    typeof route.query.union_oauth_error === 'string' ? route.query.union_oauth_error : ''
  if (oauthResult === 'success') {
    TMessage.success('微信授权成功，请再次点击支付')
  } else if (oauthError) {
    TMessage.error(`微信授权失败：${oauthError}`)
  }
  if (unionOauthResult === 'success') {
    TMessage.success('云闪付授权成功，请再次点击支付')
  } else if (unionOauthError) {
    TMessage.error(`云闪付授权失败：${unionOauthError}`)
  }
  if (oauthResult || oauthError || unionOauthResult || unionOauthError) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_oauth
    delete nextQuery.wechat_oauth_error
    delete nextQuery.union_oauth
    delete nextQuery.union_oauth_error
    void router.replace({ query: nextQuery })
  }
})
</script>

<template>
  <main id="overview" class="page-shell custom-page-shell profile-page">
    <!-- 顶部读数条：沿用「我的需求」等菜单页的 .wb-strip 形状（四格读数 + 页面级刷新），
         放在头像卡上方作为页面第一条读数带；≤900px 时整条被 WorkbenchBarSlot 搬进工作台顶栏 -->
    <WorkbenchBarSlot>
      <OverviewStrip
        :requirement-total="requirementStats.total"
        :actionable-count="actionableRequirements.length"
        :conversation-count="availableConversationCount"
        :coupon-count="usableCouponCount"
        :refreshing="loading || requirementLoading"
        @refresh="refreshProfileData"
      />
    </WorkbenchBarSlot>

    <section class="overview-hero">
      <div class="overview-hero__head">
        <div class="overview-hero__identity">
          <button
            class="profile-avatar-button"
            type="button"
            :disabled="profileAvatarUploading"
            @click="openProfileAvatarPicker"
          >
            <img
              v-if="profileAvatarSrc"
              :src="profileAvatarSrc"
              alt="用户头像"
              @error="handleProfileAvatarError"
            />
            <span v-else>{{ profileInitial }}</span>
            <small>{{ profileAvatarUploading ? '上传中' : '更换' }}</small>
          </button>
          <input
            ref="profileAvatarInput"
            class="profile-avatar-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="handleProfileAvatarChange"
          />
          <div>
            <h1>
              <RouterLink
                v-if="auth.username"
                class="overview-hero__name-link"
                :to="{ name: 'dev-profile', params: { username: auth.username } }"
                >{{ auth.username }}</RouterLink
              >
              <template v-else>欢迎回来</template>
            </h1>
            <p>{{ timeGreeting }}</p>
          </div>
        </div>
      </div>

      <div class="overview-hero__body">
        <div class="overview-hero__main">
          <div class="overview-hero__chips">
            <span>{{ accountEmailLabel }}</span>
            <span>官方活动：{{ subscriptionLabel }}</span>
          </div>
        </div>
        <div class="overview-hero__actions">
          <button
            class="ghost small"
            type="button"
            :disabled="!auth.username"
            @click="router.push({ name: 'dev-profile', params: { username: auth.username } })"
          >
            我的主页
          </button>
        </div>
      </div>

      <!-- 移动端快捷入口：App 式宫格图标，顶替下方「快捷入口」面板（该面板移动端隐藏）。
           第一行是需求方自己的事（发需求 → 看定制 → 签合同 → 开发票），
           第二行是开发者侧（找需求 → 接单 → 做资源 → 收钱），各按做事先后排。 -->
      <ProfileQuickNav />
    </section>

    <RequirementProgressPanel :rows="recentRequirements" @select="handleRequirementSelect" />

    <div class="overview-dashboard-grid">
      <RecentConversationsPanel :cards="recentConversationCards" @open="openConversation" />

      <aside class="overview-side-stack">
        <QuickLinksPanel />
      </aside>
    </div>

    <!-- 发布需求弹窗：props 与监听由 `useProfilePublishRequirement` 铺成一份 v-bind，
         这里只有挂点。`?modal=publish` 的开窗与摘参也在那一个域里（读与写必须同处）。 -->
    <PublishModal ref="publishModalRef" v-bind="publishModalBindings" />

    <RequirementConversationModal
      :visible="conversationVisible"
      :token="auth.token"
      :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirementId ?? ''"
      :title="conversationRequirement?.title"
      @updated="applyConversationDetail"
      @close="closeConversation"
    />

    <!-- 头像裁剪弹窗：模板、样式（含 Teleport 出去后的 205 行细节样式与 @640 单列布局）全在组件里，
         这里只有挂点——props 与监听由 `useAvatarCropModalBindings` 一行铺平。 -->
    <ProfileAvatarCropModal v-bind="avatarCropModal" />
  </main>
</template>

<style scoped src="./../components/profile/profile-page.css"></style>
<style scoped src="./../components/profile/profile-page-responsive.css"></style>
