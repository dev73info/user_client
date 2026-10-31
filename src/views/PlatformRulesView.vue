<script setup lang="ts">
import { useRouter } from 'vue-router'

import { platformRules } from '@/shared/platformRules'

const router = useRouter()

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
          <h2>平台规则与协议</h2>
        </div>
        <button class="top-back" type="button" @click="goBack">返回</button>
      </header>

      <article class="content-block">
        <ul class="platform-rule-list">
          <li v-for="rule in platformRules" :key="rule.code">
            <router-link :to="{ name: 'platform-rule-detail', params: { code: rule.code } }">
              {{ rule.title }}
            </router-link>
          </li>
        </ul>
      </article>
    </section>
  </main>
</template>

<style scoped>
.platform-rule-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.platform-rule-list li + li {
  border-top: 1px solid color-mix(in srgb, var(--73-border) 86%, transparent);
}

.platform-rule-list a {
  display: block;
  padding: 14px 2px;
  color: var(--73-ink);
  font-size: 15px;
  text-decoration: none;
}

.platform-rule-list a:hover {
  color: var(--73-accent);
}
</style>
