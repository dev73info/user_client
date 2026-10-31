<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fetchAgreementContent, type UserServiceAgreement } from '@/api/auth'
import { formatLegalDate, parseLegalText } from '@/components/legal/legalText'
import { platformRuleTitle } from '@/shared/platformRules'

const route = useRoute()
const router = useRouter()

const agreement = ref<UserServiceAgreement | null>(null)
const loading = ref(true)
const failed = ref(false)

const code = computed(() => String(route.params.code ?? ''))
const known = computed(() => platformRuleTitle(code.value) !== '')
const title = computed(() => agreement.value?.title || platformRuleTitle(code.value) || '平台规则')
const blocks = computed(() => parseLegalText(agreement.value?.content ?? ''))

async function load() {
  agreement.value = null
  failed.value = false
  loading.value = true

  if (!known.value) {
    loading.value = false
    return
  }

  try {
    agreement.value = await fetchAgreementContent(code.value)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }

  router.push({ name: 'platform-rules' })
}

onMounted(load)
watch(code, load)
</script>

<template>
  <main class="page-shell">
    <section class="panel">
      <header class="panel-head">
        <div>
          <h2>{{ title }}</h2>
        </div>
        <button class="top-back" type="button" @click="goBack">返回</button>
      </header>

      <article class="content-block">
        <template v-if="!known">
          <p>该规则不存在。</p>
          <p>
            <router-link :to="{ name: 'platform-rules' }">返回平台规则</router-link>
          </p>
        </template>

        <template v-else-if="agreement">
          <p v-if="agreement.effective_at">
            <strong>生效日期：</strong>{{ formatLegalDate(agreement.effective_at) }}
          </p>

          <template v-for="(block, index) in blocks" :key="index">
            <h3 v-if="block.type === 'heading'" :id="block.id">{{ block.text }}</h3>
            <ul v-else-if="block.type === 'list'">
              <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
            </ul>
            <p v-else>{{ block.text }}</p>
          </template>
        </template>

        <template v-else>
          <p v-if="loading">规则内容加载中…</p>
          <p v-else-if="failed">规则内容暂时无法获取，请稍后重试。</p>
          <button v-if="!loading" type="button" class="top-back" @click="load">重新加载</button>
        </template>
      </article>
    </section>
  </main>
</template>
