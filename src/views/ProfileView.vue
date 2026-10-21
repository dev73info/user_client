<script setup lang="ts">
import {
  TIcon,
  Box,
  Compass,
  Document,
  EditPen,
  Files,
  Suitcase,
  Tickets,
  TMessage,
  Wallet,
} from 'ui_73info'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OverviewStrip from '@/components/profile/OverviewStrip.vue'
import ProfileAvatarCropModal from '@/components/profile/ProfileAvatarCropModal.vue'
import QuickLinksPanel from '@/components/profile/QuickLinksPanel.vue'
import RecentConversationsPanel from '@/components/profile/RecentConversationsPanel.vue'
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
  const unionOauthResult = typeof route.query.union_oauth === 'string' ? route.query.union_oauth : ''
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
      <OverviewStrip :requirement-total="requirementStats.total" :actionable-count="actionableRequirements.length"
        :conversation-count="availableConversationCount" :coupon-count="usableCouponCount"
        :refreshing="loading || requirementLoading" @refresh="refreshProfileData" />
    </WorkbenchBarSlot>

    <section class="overview-hero">
      <div class="overview-hero__head">
        <div class="overview-hero__identity">
          <button class="profile-avatar-button" type="button" :disabled="profileAvatarUploading"
            @click="openProfileAvatarPicker">
            <img v-if="profileAvatarSrc" :src="profileAvatarSrc" alt="用户头像" @error="handleProfileAvatarError" />
            <span v-else>{{ profileInitial }}</span>
            <small>{{ profileAvatarUploading ? '上传中' : '更换' }}</small>
          </button>
          <input ref="profileAvatarInput" class="profile-avatar-input" type="file"
            accept="image/png,image/jpeg,image/webp,image/gif" @change="handleProfileAvatarChange" />
          <div>
            <h1>
              <RouterLink v-if="auth.username" class="overview-hero__name-link"
                :to="{ name: 'dev-profile', params: { username: auth.username } }">{{ auth.username }}</RouterLink>
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
          <button class="ghost small" type="button" :disabled="!auth.username"
            @click="router.push({ name: 'dev-profile', params: { username: auth.username } })">
            我的主页
          </button>
        </div>

      </div>

      <!-- 移动端快捷入口：App 式宫格图标，顶替下方「快捷入口」面板（该面板移动端隐藏）。
           第一行是需求方自己的事（发需求 → 看定制 → 签合同 → 开发票），
           第二行是开发者侧（找需求 → 接单 → 做资源 → 收钱），各按做事先后排。 -->
      <nav class="overview-hero__quick" aria-label="快捷入口">
        <!-- 带 modal=publish 回到总览即弹出发布需求窗口（watch 在 `useProfilePublishRequirement` 里），
             关闭时会清掉这个参数 -->
        <RouterLink :to="{ name: 'workbench', query: { modal: 'publish' } }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><EditPen /></TIcon></span>
          <span>我有需求</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-requirements' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Suitcase /></TIcon></span>
          <span>我的定制</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-signatures' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Files /></TIcon></span>
          <span>我的合同</span>
        </RouterLink>
        <RouterLink :to="{ name: 'workbench-invoices' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Document /></TIcon></span>
          <span>我的发票</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-requirement-hall' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Compass /></TIcon></span>
          <span>需求大厅</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-my-requirements' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Tickets /></TIcon></span>
          <span>我的接单</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-plugins' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Box /></TIcon></span>
          <span>资源初始化</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dev-wallet' }">
          <span class="overview-hero__quick-icon"><TIcon :size="22"><Wallet /></TIcon></span>
          <span>收益钱包</span>
        </RouterLink>
      </nav>
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

    <RequirementConversationModal :visible="conversationVisible" :token="auth.token" :current-username="auth.username"
      :requirement-id="conversationRequirement?.requirementId ?? ''" :title="conversationRequirement?.title"
      @updated="applyConversationDetail" @close="closeConversation" />

    <!-- 头像裁剪弹窗：模板、样式（含 Teleport 出去后的 205 行细节样式与 @640 单列布局）全在组件里，
         这里只有挂点——props 与监听由 `useAvatarCropModalBindings` 一行铺平。 -->
    <ProfileAvatarCropModal v-bind="avatarCropModal" />
  </main>
</template>

<style scoped>
.profile-page {
  display: grid;
  gap: 16px;
  max-width: 1024px;
  min-height: calc(100vh - 113px);
  margin: 0 auto;
  padding: 32px 20px 56px;
}

/* 页面级卡片语言：三块面板由三个组件渲染，但「边框 / 底色 / 阴影」是同一套，
   统一在页面这一层定义——子组件的根元素会带上父组件的 data-v，一条规则管三块。 */
.overview-hero,
.overview-focus-panel,
.overview-panel {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.overview-hero {
  display: grid;
  gap: 22px;
  padding: 24px;
  border-radius: 22px;
}

.overview-hero__head,
.overview-hero__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
}

.overview-hero__head {
  align-items: start;
}

.overview-hero__identity {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.profile-avatar-button {
  appearance: none;
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 76px;
  height: 76px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 10px 22px rgba(76, 103, 172, 0.12);
}

.profile-avatar-button:disabled {
  cursor: wait;
  opacity: 0.78;
}

.profile-avatar-button img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar-button span {
  position: relative;
  z-index: 1;
}

.profile-avatar-button small {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  padding: 5px 0;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.profile-avatar-input {
  display: none;
}

.overview-hero__body {
  align-items: end;
}

.overview-hero__head h1 {
  margin: 0;
  color: #0f172a;
}

.overview-hero__head h1 {
  margin-top: 6px;
  overflow: hidden;
  font-size: clamp(22px, 3.6vw, 40px);
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-hero__head p {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 18px;
  line-height: 1.5;
}

.overview-hero__identity > div {
  min-width: 0;
}

.overview-hero__main p {
  margin: 0;
  max-width: 680px;
  color: #64748b;
  line-height: 1.7;
}

.overview-hero__chips,
.overview-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.overview-hero__chips {
  margin-top: 16px;
}

.overview-hero__chips span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 999px;
  background: #f8fbff;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.overview-hero__actions {
  justify-content: flex-end;
}

.overview-hero__name-link {
  color: inherit;
  text-decoration: none;
}

.overview-hero__name-link:hover {
  color: #1d4ed8;
}

/* 面板内边距与圆角（三块面板共用；内里的骨架样式见 styles/profile.css 的「面板通用骨架」一节） */
.overview-focus-panel,
.overview-panel {
  padding: 20px;
  border-radius: 18px;
}

.overview-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.48fr) minmax(280px, 0.72fr);
  gap: 16px;
  align-items: start;
}

.overview-side-stack {
  display: grid;
  gap: 12px;
}

/* 头像卡下方的 App 式快捷入口：只在移动端出现（见 640px 断点） */
.overview-hero__quick {
  display: none;
}

.overview-hero__quick a {
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 0;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.overview-hero__quick a>span:last-child {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-hero__quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #ffffff;
  color: #2563eb;
  box-shadow: 0 4px 10px rgba(76, 103, 172, 0.08);
}

@media (max-width: 1180px) {
  .overview-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .overview-side-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* R047 断点收敛：原档位 760px → 640px */
@media (max-width: 640px) {
  .profile-page.page-shell {
    gap: 12px;
    padding: 0 0 24px;
  }

  /* 移动端总览的卡片统一一套语言：白底卡 + 18px 圆角 + 16px 内边距，
     卡内的次级块（标签、入口区、进度条）一律 #f6f9ff 浅蓝底、无描边，强调色统一用蓝 */
  .overview-hero {
    gap: 14px;
    padding: 16px;
    border-radius: 18px;
  }

  .profile-avatar-button {
    width: 60px;
    height: 60px;
    border: 3px solid #ffffff;
    font-size: 24px;
    box-shadow: 0 8px 18px rgba(76, 103, 172, 0.18);
  }

  .profile-avatar-button small {
    padding: 3px 0;
    font-size: 10px;
  }

  /* 用户名可点进个人主页：移动端补一个箭头提示 */
  .overview-hero__name-link::after {
    content: '›';
    margin-left: 6px;
    color: #94a3b8;
    font-weight: 600;
  }

  /* 头像行只剩头像 + 用户名，单列排布即可 */
  .overview-hero__head {
    align-items: center;
    gap: 10px;
  }

  .overview-hero__body {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 12px;
  }

  .overview-hero__identity {
    gap: 12px;
  }

  .overview-hero__head h1 {
    margin-top: 0;
    font-size: 19px;
    font-weight: 800;
  }

  .overview-hero__head p {
    margin-top: 4px;
    color: #64748b;
    font-size: 13px;
  }

  /* 邮箱与订阅状态压成一行：邮箱过长时省略，订阅状态不缩 */
  .overview-hero__chips {
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 0;
  }

  .overview-hero__chips span {
    min-height: 26px;
    max-width: 100%;
    padding: 4px 10px;
    overflow: hidden;
    border-color: transparent;
    background: #f6f9ff;
    color: #475569;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .overview-hero__chips span:first-child {
    flex: 0 1 auto;
    min-width: 0;
  }

  .overview-hero__chips span:last-child {
    flex: 0 0 auto;
  }

  /* 移动端最近沟通走底部导航「消息」与顶栏「会话」读数，总览里不再铺一块 */
  .overview-panel--messages {
    display: none;
  }

  /* 快捷入口改成头像卡里的四宫格图标，右侧面板整列收起 */
  .overview-side-stack {
    display: none;
  }

  .overview-hero__quick {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px 8px;
    padding: 14px 4px;
    border-radius: 12px;
    background: #f6f9ff;
  }

  /* 移动端：主页走「点用户名」，操作区整排收起 */
  .overview-hero__actions {
    display: none;
  }

  .overview-focus-panel,
  .overview-panel {
    padding: 16px;
    border-radius: 18px;
  }

  /* 头像卡与需求进度合成一张卡：上下两半去掉相接处的圆角与描边，中间只留一条内缩分隔线。
     阴影一并去掉——后一个兄弟的阴影会画在前一个的底色上，接缝处会露出一道灰影。 */
  .overview-hero {
    border-bottom: 0;
    border-radius: 18px 18px 0 0;
    box-shadow: none;
  }

  .overview-focus-panel {
    position: relative;
    margin-top: -12px;
    border-top: 0;
    border-radius: 0 0 18px 18px;
    box-shadow: none;
  }

  .overview-focus-panel::before {
    content: '';
    position: absolute;
    top: 0;
    right: 16px;
    left: 16px;
    height: 1px;
    background: rgba(224, 232, 255, 0.96);
  }
}
</style>
