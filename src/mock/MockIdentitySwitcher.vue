<script setup lang="ts">
/**
 * mock 身份切换器（仅开发用）。
 *
 * 挂载在页面左上角边缘：右下角可能被客服悬浮窗（SupportChatWidget，z-index 9999）占用，
 * 而客服窗的位置是用户可拖拽且记在 localStorage 里的，没法保证不重叠，所以错开一侧。
 *
 * 行为约定：换身份整页刷新（登录态、路由守卫、各页首屏请求都围绕角色展开），
 * 因此这里只负责写身份与提示，不试图在内存里迁移状态。
 */
import { computed, ref } from 'vue'

import { mockEnabled, mockSwitcherEnabled } from './env'
import { MOCK_IDENTITIES, MOCK_IDENTITY_PROFILES, currentMockIdentity } from './identity'
import { disableMock, switchMockIdentity } from './index'
import { clearUncoveredEndpoints, uncoveredEndpoints } from './uncovered'

const expanded = ref(false)
const showUncovered = ref(false)

const available = computed(() => mockEnabled() && mockSwitcherEnabled())
const identity = computed(() => currentMockIdentity())
const profile = computed(() => MOCK_IDENTITY_PROFILES[identity.value])
const uncovered = computed(() => uncoveredEndpoints.value)

function selectIdentity(target: (typeof MOCK_IDENTITIES)[number]) {
  if (target === identity.value) {
    expanded.value = false
    return
  }

  switchMockIdentity(target)
}
</script>

<template>
  <div v-if="available" class="mock-switch" :class="{ 'mock-switch--open': expanded }">
    <button
      class="mock-switch__fab"
      type="button"
      :aria-expanded="expanded"
      :title="`mock 已开启 · 当前身份：${profile.label}`"
      @click="expanded = !expanded"
    >
      <span class="mock-switch__dot" aria-hidden="true"></span>
      <span class="mock-switch__fab-text">MOCK</span>
      <span class="mock-switch__fab-identity">{{ profile.label }}</span>
      <span
        v-if="uncovered.length"
        class="mock-switch__badge"
        :title="`${uncovered.length} 个接口未实现`"
      >
        {{ uncovered.length }}
      </span>
    </button>

    <section v-if="expanded" class="mock-switch__panel" aria-label="mock 身份切换">
      <header class="mock-switch__head">
        <strong>mock 身份</strong>
        <button
          class="mock-switch__close"
          type="button"
          aria-label="收起"
          @click="expanded = false"
        >
          ×
        </button>
      </header>

      <p class="mock-switch__hint">切换身份会整页刷新，两个身份可以分别开在两个标签页里。</p>

      <div class="mock-switch__identities">
        <button
          v-for="item in MOCK_IDENTITIES"
          :key="item"
          class="mock-switch__identity"
          :class="{ 'mock-switch__identity--active': item === identity }"
          type="button"
          @click="selectIdentity(item)"
        >
          <strong>{{ MOCK_IDENTITY_PROFILES[item].label }}</strong>
          <small>{{ MOCK_IDENTITY_PROFILES[item].description }}</small>
        </button>
      </div>

      <div v-if="expanded" class="mock-switch__section">
        <button
          class="mock-switch__row mock-switch__row--toggle"
          type="button"
          :disabled="!uncovered.length"
          @click="showUncovered = !showUncovered"
        >
          <span>未实现的接口</span>
          <span class="mock-switch__count">{{ uncovered.length }}</span>
        </button>

        <div v-if="showUncovered && uncovered.length" class="mock-switch__list">
          <code v-for="item in uncovered" :key="item">{{ item }}</code>
        </div>

        <div class="mock-switch__actions">
          <button
            v-if="uncovered.length"
            class="mock-switch__link"
            type="button"
            @click="clearUncoveredEndpoints()"
          >
            清空清单
          </button>
          <button
            class="mock-switch__link mock-switch__link--danger"
            type="button"
            @click="disableMock()"
          >
            关闭 mock
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mock-switch {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 9998;
  font-size: 12px;
  line-height: 1.5;
}

.mock-switch__fab {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid rgba(17, 24, 39, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.16);
  color: #0f172a;
  font: inherit;
  cursor: pointer;
}

.mock-switch__tip {
  color: #475569;
}

.mock-switch__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
}

.mock-switch__fab-text {
  font-weight: 700;
  letter-spacing: 0.04em;
}

.mock-switch__fab-identity {
  padding: 1px 6px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
}

.mock-switch__badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-weight: 700;
}

.mock-switch__panel {
  width: 280px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
  color: #0f172a;
}

.mock-switch__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.mock-switch__close {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.mock-switch__hint {
  margin: 6px 0 0;
  color: #64748b;
}

.mock-switch__identities {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.mock-switch__identity {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid rgba(17, 24, 39, 0.12);
  border-radius: 10px;
  background: #f8fafc;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mock-switch__identity--active {
  border-color: #0f172a;
  background: #eef2ff;
}

.mock-switch__identity small {
  color: #64748b;
}

.mock-switch__section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
}

.mock-switch__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.mock-switch__row:disabled {
  color: #94a3b8;
  cursor: default;
}

.mock-switch__count {
  font-weight: 700;
}

.mock-switch__list {
  display: grid;
  gap: 3px;
  max-height: 160px;
  margin: 6px 0 0;
  padding: 6px 8px;
  overflow: auto;
  border-radius: 8px;
  background: #f1f5f9;
}

.mock-switch__list code {
  font-size: 11px;
  word-break: break-all;
}

.mock-switch__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.mock-switch__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.mock-switch__link--danger {
  color: #dc2626;
}

@media (max-width: 640px) {
  .mock-switch {
    top: 8px;
    left: 8px;
  }

  .mock-switch__fab-text,
  .mock-switch__tip {
    display: none;
  }
}
</style>
