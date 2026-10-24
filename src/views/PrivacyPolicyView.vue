<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { privacyDocument } from '@/shared/legalContent'
import { legalDocumentToBlocks } from '@/components/legal/legalText'

const router = useRouter()

/**
 * 正文来源：`shared/legalContent.json` 的 `privacy` 段（与静态快照脚本读同一份）。
 *
 * 早先这一页去调 `/api/auth/agreement-content?code=privacy_policy` 取后端正文，取不到就静默回落——
 * 而**后端 2.0 根本没有这个端点**（契约里只有 `/api/auth/user-service-agreement`），
 * 于是每次打开都在打一个必然 404 的请求，还把失败吞掉。现在直接渲染内置正文：
 * 有就有、没有就没有，不再假装「后端是事实源」。
 */
const blocks = computed(() => legalDocumentToBlocks(privacyDocument))
const title = privacyDocument.heading
/** 生效日期写在正文区块里（`{ type: 'effective' }`），页头不再单独占一行。 */
const hasEffectiveBlock = privacyDocument.blocks.some((block) => block.type === 'effective')

function goBack() {
  if (window.history.state?.back) {
    router.back()
    return
  }

  router.push('/')
}
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
        <!-- 生效日期由正文第一块（`type: 'effective'`）渲染，页头不重复 -->
        <p v-if="!hasEffectiveBlock" class="legal-loading">生效日期以协议正文为准。</p>

        <template v-for="(block, index) in blocks" :key="index">
          <h3 v-if="block.type === 'heading'" :id="block.id">{{ block.text }}</h3>
          <ul v-else-if="block.type === 'list'">
            <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
          </ul>
          <p v-else>{{ block.text }}</p>
        </template>
      </article>
    </section>
  </main>
</template>
