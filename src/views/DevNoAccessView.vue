<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TButton, TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'
import { getMyRealnameVerification } from '@/api/realname'
import { HttpError } from '@/api/http'
import { DEV_PORTAL_URL, buildUnifiedAuthUrl } from '@/config/runtime'

const auth = useAuthStore()
const router = useRouter()

const realnameApproved = ref(false)
const realnameChecked = ref(false)

const displayName = computed(() => auth.username || '当前账号')
const accessMessage = computed(() => {
  if (auth.devAccessError) {
    return auth.devAccessError
  }
  if (realnameApproved.value) {
    return '当前账号已完成实名认证，正在等待开通开发者权限。'
  }
  return '当前账号需要先完成实名认证，认证通过后才能开通开发者权限。'
})
const retrying = ref(false)

async function checkRealname() {
  auth.hydrate()
  if (!auth.token) {
    return
  }
  try {
    const record = await getMyRealnameVerification(auth.token)
    realnameApproved.value = record.status === 'approved'
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      realnameApproved.value = false
    }
  } finally {
    realnameChecked.value = true
  }
}

onMounted(() => {
  void checkRealname()
})

function backToLogin() {
  auth.logout()
  void router.replace(buildUnifiedAuthUrl('login', DEV_PORTAL_URL))
}

function goRealname() {
  void router.push({ name: 'workbench-realname', query: { redirect_to: '/dev/overview' } })
}

function goBecomeDeveloper() {
  void retryAccessCheck()
}

async function retryAccessCheck() {
  if (retrying.value) {
    return
  }

  retrying.value = true
  try {
    auth.hydrate(true)
    await auth.fetchProfile(true)
    const hasAccess = await auth.ensureDevAccess()

    if (hasAccess) {
      TMessage.success('开发者权限已开通，正在进入工作台')
      await router.replace({ name: 'dev-plugins' })
      return
    }

    TMessage.warning(auth.devAccessError || '当前账号仍未开通开发者权限')
  } catch (error) {
    auth.logout()
    TMessage.error(error instanceof Error ? error.message : '权限校验失败，请重新登录')
    await router.replace(buildUnifiedAuthUrl('login', DEV_PORTAL_URL))
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <main class="dev-no-access">
    <section class="dev-no-access__panel">
      <h1 class="dev-no-access__title">{{ displayName }} 还没有开发者权限</h1>
      <p class="dev-no-access__desc">
        {{ accessMessage }}
      </p>

      <div class="dev-no-access__actions">
        <!-- 形状不再走 .dev-toolbar__primary / .dev-toolbar__ghost，改由 TButton 的
             variant + tone 表达：主操作是实心强调色，次要操作是默认的描边形态。
             原来两个次要按钮挂的是 Element 的 plain 变体（浅蓝底 + 浅蓝描边），
             与统一层「白底 + 主色描边」的次要按钮不是一套。 -->
        <TButton v-if="!realnameApproved" variant="solid" tone="accent" @click="goRealname">
          去实名认证
        </TButton>
        <TButton v-if="realnameApproved" variant="solid" tone="accent" @click="goBecomeDeveloper">
          申请开发者权限
        </TButton>
        <TButton @click="backToLogin">退出当前账号</TButton>
        <TButton :loading="retrying" @click="retryAccessCheck">
          重试权限校验
        </TButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 这一页是「没有开发者权限」的落地面，不在侧边栏菜单里，形态上刻意与菜单页不同（居中单卡而不是读数条 + 列表）。
   但配色必须与开发者工作台同源：原来标题写的是 #10233f、强调色写的是 #1a73e8、正文写的是 #516173，
   三支都是别处没有的颜色，与侧边栏顶栏的 #1f4ad1 摆在一起能看出是两个网站。
   这里统一取 dev-base.css 的令牌，字号也收到与 .dev-card-head__title 同一档附近，
   避免这一页的标题比菜单页大出三倍。 */
.dev-no-access {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}

.dev-no-access__panel {
  width: min(720px, 100%);
  padding: 36px;
  border-radius: var(--dev-radius-card);
  background:
    radial-gradient(circle at top right, var(--wb-accent-soft), transparent 36%),
    linear-gradient(180deg, var(--dev-surface-strong), var(--dev-bg));
  border: 1px solid var(--dev-line);
  box-shadow: var(--dev-shadow);
}

.dev-no-access__title {
  margin: 18px 0 12px;
  font-size: clamp(24px, 3.2vw, 32px);
  line-height: 1.2;
  color: var(--dev-ink);
}

.dev-no-access__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--dev-ink-soft);
}

.dev-no-access__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

@media (max-width: 640px) {
  .dev-no-access {
    padding: 24px 16px;
  }

  .dev-no-access__panel {
    padding: 24px;
    border-radius: var(--dev-radius-card);
  }

  .dev-no-access__actions {
    flex-direction: column;
  }
}
</style>
