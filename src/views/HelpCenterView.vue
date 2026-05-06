<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const quickActions = computed(() => [
  {
    title: '提交售后工单',
    description: '支付异常、退款申请、交付争议都统一进入工单中心处理。',
    button: auth.isAuthed ? '进入工单中心' : '登录后提交',
    action: () => {
      if (auth.isAuthed) {
        void router.push({ name: 'tickets' })
        return
      }
      void router.push({ name: 'home', query: { modal: 'auth', mode: 'login', redirect_to: '/tickets' } })
    },
  },
  {
    title: '查看支付与退款',
    description: '覆盖定金、尾款、退款原则、到账时效和凭证提交要求。',
    button: '查看说明',
    action: () => {
      void router.push({ name: 'payment-refund' })
    },
  },
  {
    title: '了解账号与协议',
    description: '快速查看用户协议、隐私政策、账号安全和身份认证要求。',
    button: '查看协议',
    action: () => {
      void router.push({ name: 'terms' })
    },
  },
])

const primaryQuickAction = computed(() => quickActions.value[0] ?? null)

const faqGroups = [
  {
    title: '账号与登录',
    items: [
      {
        question: '为什么进入开发者工作台时会跳到登录弹窗？',
        answer: '当前设备没有有效登录态时，平台会先拉起统一登录弹窗，登录成功后再自动返回原目标页面。',
      },
      {
        question: '注册后还需要完成哪些步骤？',
        answer: '普通用户注册后即可浏览资源、发布需求；若要进入开发者工作台，还需要补充实名认证和开发者权限审核。',
      },
      {
        question: '忘记密码或收不到验证码怎么办？',
        answer: '先检查邮箱垃圾箱与发送频率限制，若仍异常，可提交工单并附上登录邮箱与问题截图。',
      },
    ],
  },
  {
    title: '需求与交易',
    items: [
      {
        question: '发布需求后多久会有开发者响应？',
        answer: '需求通过审核后会进入大厅展示，平台会根据标签和类目做推荐，通常会在较短时间内收到报价或沟通请求。',
      },
      {
        question: '支付成功但订单状态没更新怎么办？',
        answer: '先刷新页面并确认支付结果，若 5 分钟后仍未同步，请在工单中心提交支付凭证和订单号。',
      },
      {
        question: '可以直接在线申请退款吗？',
        answer: '当前退款由平台审核处理，请通过工单中心提交退款原因、订单号与相关证明材料。',
      },
    ],
  },
  {
    title: '交付与售后',
    items: [
      {
        question: '项目交付后如何验收？',
        answer: '请根据需求约定检查功能、文档和源文件，确认无误后再完成验收；若存在问题，请在验收期内明确反馈。',
      },
      {
        question: '遇到延期、质量争议如何处理？',
        answer: '优先在订单沟通记录中补充事实，再提交工单，平台会结合需求、交付物和双方记录进行协调。',
      },
      {
        question: '平台支持哪些售后类型？',
        answer: '包括支付异常、退款申请、交付争议、账号问题和资质审核等，统一通过工单中心流转。',
      },
    ],
  },
]

const guideSteps = [
  {
    title: '1. 先定位问题类型',
    description: '账号登录、支付退款、需求发布、交付争议分别选择不同入口，能明显加快处理。',
  },
  {
    title: '2. 准备必要信息',
    description: '建议提前整理订单号、需求编号、支付凭证、截图或关键时间点。',
  },
  {
    title: '3. 提交工单或查看说明',
    description: '常规规则问题直接查看说明页，个案问题走工单，减少来回沟通成本。',
  },
  {
    title: '4. 跟进处理结果',
    description: '工单中心会持续更新状态与回复记录，涉及退款时以支付渠道最终到账时间为准。',
  },
]

const legalLinks = [
  {
    title: '用户协议',
    description: '查看平台服务适用范围、账户责任、内容规范和争议处理规则。',
    to: { name: 'terms' as const },
  },
  {
    title: '隐私政策',
    description: '了解平台如何收集、使用、存储和保护你的个人信息。',
    to: { name: 'privacy' as const },
  },
  {
    title: '支付与退款说明',
    description: '查看支付渠道、退款原则、申请方式与风险提示。',
    to: { name: 'payment-refund' as const },
  },
]

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }

  void router.push({ name: 'home' })
}
</script>

<template>
  <main class="page-shell custom-page-shell help-center-page help-center-page--nav">

    <section class="help-grid">
      <article class="help-panel help-panel--span-8">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Quick Actions</p>
            <h2>常用入口</h2>
            <p class="lead">优先选择与你的问题最接近的入口，避免在协议页里反复查找。</p>
          </div>
        </div>
        <div class="action-grid">
          <button v-for="item in quickActions" :key="item.title" class="action-card" type="button"
            @click="item.action()">
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </div>
            <span>{{ item.button }}</span>
          </button>
        </div>
      </article>

      <aside class="help-panel help-panel--span-4">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Service Tips</p>
            <h2>处理建议</h2>
          </div>
        </div>
        <ul class="tips-list">
          <li>支付问题请优先准备订单号、支付时间和付款凭证。</li>
          <li>交付争议请补充需求内容、沟通记录和验收意见。</li>
          <li>账号异常请附上注册邮箱、错误提示和操作时间。</li>
          <li>涉及退款时，请以支付渠道最终到账时间为准。</li>
        </ul>
      </aside>

      <article class="help-panel help-panel--span-7">
        <div class="panel-head">
          <div>
            <p class="eyebrow">FAQ</p>
            <h2>常见问题</h2>
          </div>
        </div>
        <div class="faq-groups">
          <section v-for="group in faqGroups" :key="group.title" class="faq-group">
            <h3>{{ group.title }}</h3>
            <div class="faq-list">
              <article v-for="item in group.items" :key="item.question" class="faq-item">
                <h4>{{ item.question }}</h4>
                <p>{{ item.answer }}</p>
              </article>
            </div>
          </section>
        </div>
      </article>

      <article class="help-panel help-panel--span-5">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Workflow</p>
            <h2>问题处理流程</h2>
          </div>
        </div>
        <div class="step-list">
          <article v-for="step in guideSteps" :key="step.title" class="step-item">
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </article>
        </div>
      </article>

      <article class="help-panel help-panel--span-12">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Policies</p>
            <h2>规则与协议</h2>
            <p class="lead">帮助中心负责导航和解释，正式条款仍以对应说明页正文为准。</p>
          </div>
        </div>
        <div class="legal-grid">
          <RouterLink v-for="item in legalLinks" :key="item.title" class="legal-card" :to="item.to">
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <span>查看详情</span>
          </RouterLink>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.help-center-page {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto 40px;
  padding: 0;
  gap: 14px;
  color: #1f2937;
}

.help-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.8fr);
  gap: 22px;
  padding: 28px;
  border: 1px solid rgba(222, 230, 242, 0.96);
  border-radius: 30px;
  background:
    radial-gradient(circle at top left, rgba(99, 138, 255, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(251, 247, 239, 0.96));
  box-shadow: 0 24px 60px rgba(100, 116, 139, 0.12);
}

.help-hero__eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #6b7280;
}

.help-hero h1 {
  margin: 0;
  font-size: clamp(34px, 5vw, 52px);
  line-height: 1.02;
  color: #111827;
}

.help-hero__lead {
  margin: 16px 0 0;
  max-width: 700px;
  font-size: 16px;
  line-height: 1.75;
  color: #4b5563;
}

.help-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.hero-primary,
.hero-secondary {
  appearance: none;
  border-radius: 999px;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.hero-primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24);
}

.hero-secondary {
  border: 1px solid rgba(210, 219, 232, 1);
  color: #334155;
  background: rgba(255, 255, 255, 0.92);
}

.hero-primary:hover,
.hero-secondary:hover,
.action-card:hover,
.legal-card:hover {
  transform: translateY(-1px);
}

.help-hero__meta {
  display: grid;
  gap: 12px;
  align-content: start;
}

.meta-card {
  padding: 16px 18px;
  border: 1px solid rgba(224, 232, 244, 0.96);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 30px rgba(148, 163, 184, 0.12);
}

.meta-card span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #6b7280;
}

.meta-card strong {
  font-size: 16px;
  color: #111827;
}

.help-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 14px;
}

.help-panel {
  padding: 18px;
  border: 1px solid rgba(223, 230, 241, 0.96);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(90, 120, 180, 0.08);
}

.help-panel :deep(.panel-head) {
  margin-bottom: 18px;
}

.help-panel :deep(.eyebrow) {
  color: #7c8799;
}

.help-panel :deep(.lead) {
  color: #6b7280;
}

.help-panel--span-4 {
  grid-column: span 4;
}

.help-panel--span-5 {
  grid-column: span 5;
}

.help-panel--span-7 {
  grid-column: span 7;
}

.help-panel--span-8 {
  grid-column: span 8;
}

.help-panel--span-12 {
  grid-column: span 12;
}

.action-grid,
.legal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.action-card,
.legal-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  min-height: 176px;
  padding: 20px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 248, 253, 0.98));
  color: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.action-card:hover,
.legal-card:hover {
  border-color: rgba(102, 146, 255, 0.46);
  box-shadow: 0 14px 32px rgba(59, 130, 246, 0.12);
}

.action-card h3,
.legal-card h3,
.faq-group h3,
.step-item h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.action-card p,
.legal-card p,
.faq-item p,
.step-item p,
.tips-list li {
  margin: 10px 0 0;
  color: #4b5563;
  line-height: 1.72;
}

.action-card span,
.legal-card span {
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
}

.tips-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding-left: 18px;
}

.faq-groups,
.step-list {
  display: grid;
  gap: 18px;
}

.faq-group {
  display: grid;
  gap: 12px;
}

.faq-list {
  display: grid;
  gap: 12px;
}

.faq-item,
.step-item {
  padding: 16px 18px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.92);
}

.faq-item h4 {
  margin: 0;
  font-size: 15px;
  color: #111827;
}

@media (max-width: 1080px) {

  .help-hero,
  .action-grid,
  .legal-grid {
    grid-template-columns: 1fr;
  }

  .help-panel--span-4,
  .help-panel--span-5,
  .help-panel--span-7,
  .help-panel--span-8,
  .help-panel--span-12 {
    grid-column: span 12;
  }
}

@media (max-width: 780px) {
  .help-center-page {
    width: calc(100% - 16px);
  }

  .help-hero,
  .help-panel {
    padding: 18px;
    border-radius: 18px;
  }

  .help-hero__actions {
    flex-direction: column;
  }

  .hero-primary,
  .hero-secondary {
    width: 100%;
  }
}
</style>
