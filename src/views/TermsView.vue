<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchUserServiceAgreement,
  recordAgreementAcceptance,
  type UserServiceAgreement,
} from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const agreement = ref<UserServiceAgreement | null>(null)
const loading = ref(true)

const staticTitle = '用户服务协议'
const staticLead = '欢迎使用柒叁信息 73Info 平台。请在注册或使用服务前完整阅读并理解本协议。'

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
        if (agreement.value && auth.isAuthed) {
            recordAgreementAcceptance(
                auth.token,
                agreement.value.code,
                agreement.value.version,
                detectClientPlatform(),
                'terms',
            ).catch(() => undefined)
        }
    } catch {
        agreement.value = null
    } finally {
        loading.value = false
    }
}

onMounted(loadAgreement)

function splitLines(content: string): { text: string; isHeading: boolean }[] {
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({
            text: line,
            // 章节标题：如「一、」「二、」等中文序号后带顿号/圆点，区别于「1. 」正文条目。
            isHeading: /^第?[一二三四五六七八九十百]+[、.．]/.test(line),
        }))
}
</script>

<template>
    <main class="page-shell">
        <section class="panel">
            <header class="panel-head">
                <div>
                    <h2>{{ agreement?.title || staticTitle }}</h2>
                    <p class="lead">{{ staticLead }}</p>
                </div>
                <button class="top-back" type="button" @click="goBack">返回</button>
            </header>

            <article class="content-block">
                <template v-if="agreement">
                    <p><strong>生效日期：</strong>{{ formatEffectiveDate(agreement.effective_at) }}</p>

                    <template v-for="(line, i) in splitLines(agreement.content)" :key="i">
                        <h3 v-if="line.isHeading">{{ line.text }}</h3>
                        <p v-else>{{ line.text }}</p>
                    </template>
                </template>

                <template v-else>
                    <p>{{ loading ? '协议内容加载中…' : '协议内容暂时无法获取，请稍后重试。' }}</p>
                    <button v-if="!loading" type="button" class="top-back" @click="loadAgreement">重新加载</button>
                </template>
            </article>
        </section>
    </main>
</template>
