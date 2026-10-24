<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchUserServiceAgreement,
  recordAgreementAcceptance,
  type UserServiceAgreement,
} from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import KeyTermsNotice from '@/components/legal/KeyTermsNotice.vue'
import { LEGAL_NOTICE_VERSION } from '@/components/legal/legalNotice'
import { legalSectionHeadings, parseLegalText } from '@/components/legal/legalText'

const router = useRouter()
const auth = useAuthStore()
const agreement = ref<UserServiceAgreement | null>(null)
const loading = ref(true)

const staticTitle = '用户服务协议'

/** 正文区块：统一按纯文本解析，章节标题带 id（重要条款提示要跳到这些位置）。 */
const blocks = computed(() => parseLegalText(agreement.value?.content ?? ''))
const headings = computed(() => legalSectionHeadings(blocks.value))

function detectClientPlatform(): string {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/windows/i.test(ua)) return 'web-windows'
  if (/macintosh|Mac OS/i.test(ua)) return 'web-macos'
  if (/android/i.test(ua)) return 'web-android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'web-ios'
  return 'web'
}

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }

  router.push('/')
}

// 将 YYYY-MM-DD 统一为「YYYY年M月D日」，展示格式统一。
function formatEffectiveDate(value: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!match) return value
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
}

async function loadAgreement() {
  loading.value = true
  try {
    agreement.value = await fetchUserServiceAgreement()
    // 已登录用户阅读协议时记录一次留痕（source=terms），非阻断。
    // 这次留痕带上"已阅读重要条款提示"的时间与提示版本（R043 任务-02/03）：
    // 留痕要能证明"用户被提示过重要条款"，光有同意时间不够。
    // 协议页顶部就展示重要条款提示，所以这里的 notice_confirmed_at 记的是
    // **看到提示的时刻**（勾选确认的时刻由登录弹窗与签署页另行记录）。
    if (agreement.value && auth.isAuthed) {
      recordAgreementAcceptance(
        auth.token,
        agreement.value.code,
        agreement.value.version,
        detectClientPlatform(),
        'terms',
        new Date().toISOString(),
        LEGAL_NOTICE_VERSION,
      ).catch(() => undefined)
    }
  } catch {
    agreement.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadAgreement)
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ agreement?.title || staticTitle }}</h2>
        </div>
        <button class="top-back" type="button" @click="goBack">返回</button>
      </header>

      <article class="content-block">
        <template v-if="agreement">
          <p><strong>生效日期：</strong>{{ formatEffectiveDate(agreement.effective_at) }}</p>

          <!-- 提示组件直接用本页已取到的版本 / 生效日期，不再重复取一遍正文。 -->
          <KeyTermsNotice
            code="user_service_agreement"
            :headings="headings"
            :version="agreement.version"
            :effective-at="agreement.effective_at"
          />

          <template v-for="(block, index) in blocks" :key="index">
            <h3 v-if="block.type === 'heading'" :id="block.id">{{ block.text }}</h3>
            <ul v-else-if="block.type === 'list'">
              <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
            </ul>
            <p v-else>{{ block.text }}</p>
          </template>
        </template>

        <template v-else>
          <p>{{ loading ? '协议内容加载中…' : '协议内容暂时无法获取，请稍后重试。' }}</p>
          <button v-if="!loading" type="button" class="top-back" @click="loadAgreement">
            重新加载
          </button>
        </template>
      </article>
    </section>
  </main>
</template>
