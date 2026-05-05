<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Search } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import { buildDevPortalUrl } from '@/config/runtime'

type AuthMode = 'login' | 'register'

type HeaderLink = {
    label: string
    to?: { name: string }
    href?: string
    active?: boolean
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const searchQuery = ref('')
const authModalVisible = computed(() => route.query.modal === 'auth')

const headerLinks = computed<HeaderLink[]>(() => {
    const currentName = String(route.name ?? '')
    const allowActive = !authModalVisible.value

    return [
        { label: '首页', to: { name: 'home' }, active: allowActive && currentName === 'home' },
        {
            label: '免费资源',
            to: { name: 'free-resources' },
            active: allowActive && (currentName === 'free-resources' || currentName === 'resource-catalog' || currentName === 'resource-detail'),
        },
        {
            label: '需求大厅',
            to: { name: 'requirement-hall' },
            active: allowActive && (currentName === 'requirement-hall' || currentName === 'payment'),
        },
        { label: '社区', to: { name: 'community' }, active: allowActive && currentName === 'community' },
        {
            label: '帮助中心',
            to: { name: 'terms' },
            active: allowActive && (currentName === 'terms' || currentName === 'privacy' || currentName === 'payment-refund'),
        },
    ]
})

watch(
    () => route.fullPath,
    () => {
        menuOpen.value = false
    },
)

function openAuth(mode: AuthMode) {
    const nextQuery: Record<string, string> = { modal: 'auth', mode }
    const redirectTarget = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''

    if (redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')) {
        nextQuery.redirect_to = redirectTarget
    }

    void router.push({ name: 'home', query: nextQuery })
}

function openDevWorkbench() {
    void router.push(buildDevPortalUrl(auth.token))
}

function goProfile() {
    menuOpen.value = false
    void router.push({ name: 'profile' })
}

function logout() {
    menuOpen.value = false
    auth.logout()
    void router.push({ name: 'home' })
}

function submitSearch() {
    const normalized = searchQuery.value.trim()
    if (!normalized) {
        return
    }

    const keyword = normalized.toLowerCase()

    if (/(开发者|工作台|接单|发布资源|dev)/.test(keyword)) {
        openDevWorkbench()
        return
    }

    if (/(需求|定制|项目|招募|外包)/.test(keyword)) {
        void router.push({ name: 'requirement-hall', query: { keyword: normalized } })
        return
    }

    if (/(社区|动态|公告|帮助)/.test(keyword)) {
        void router.push({ name: 'community', query: { keyword: normalized } })
        return
    }

    void router.push({ name: 'free-resources', query: { keyword: normalized } })
}
</script>

<template>
    <header class="portal-header">
        <RouterLink class="portal-brand" :to="{ name: 'home' }">
            <div class="portal-brand__mark">73</div>
            <div class="portal-brand__copy">
                <strong>73info.cn</strong>
                <span>需求定制开发交易平台</span>
            </div>
        </RouterLink>

        <nav class="portal-nav">
            <template v-for="link in headerLinks" :key="link.label">
                <RouterLink v-if="link.to" :to="link.to" active-class="" exact-active-class="" class="portal-nav__link"
                    :class="{ active: link.active }">
                    {{ link.label }}
                </RouterLink>
                <a v-else :href="link.href || '#'" class="portal-nav__link">{{ link.label }}</a>
            </template>
        </nav>

        <div class="portal-header__tools">
            <form class="portal-search" @submit.prevent="submitSearch">
                <el-icon>
                    <Search />
                </el-icon>
                <input v-model="searchQuery" type="search" placeholder="搜索资源、需求、开发者..." />
            </form>
            <button class="portal-icon-btn" type="button" aria-label="消息中心">
                <el-icon>
                    <Bell />
                </el-icon>
            </button>
            <template v-if="!auth.isAuthed">
                <button class="portal-text-btn" type="button" @click="openAuth('login')">登录</button>
                <button class="portal-solid-btn" type="button" @click="openAuth('register')">注册</button>
            </template>
            <template v-else>
                <div class="portal-user">
                    <button class="portal-user__trigger" type="button" @click="menuOpen = !menuOpen">
                        {{ auth.username || '已登录用户' }}
                    </button>
                    <div class="portal-user__menu" :class="{ open: menuOpen }">
                        <button type="button" @click="goProfile">个人中心</button>
                        <button type="button" @click="openDevWorkbench">开发者工作台</button>
                        <button type="button" class="danger" @click="logout">退出登录</button>
                    </div>
                </div>
            </template>
        </div>
    </header>
</template>

<style scoped>
.portal-header {
    position: sticky;
    top: 10px;
    z-index: 40;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 20px;
    margin: 10px auto 14px;
    width: min(1280px, calc(100% - 24px));
    padding: 12px 16px;
    border-radius: 18px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 12px 30px rgba(76, 103, 172, 0.08);
    backdrop-filter: blur(12px);
}

.portal-brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
}

.portal-brand__mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: linear-gradient(135deg, #2f68ff, #69b1ff);
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.portal-brand__copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.portal-brand__copy strong {
    font-size: 16px;
}

.portal-brand__copy span {
    font-size: 11px;
    color: #64748b;
}

.portal-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.portal-nav__link {
    border: 0;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    color: #334155;
    text-decoration: none;
    background: transparent;
    transition: 140ms ease;
}

.portal-nav__link:hover,
.portal-nav__link.active {
    color: #1d4ed8;
    background: rgba(56, 107, 255, 0.08);
}

.portal-header__tools {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.portal-search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 260px;
    padding: 0 12px;
    min-height: 38px;
    border-radius: 999px;
    border: 1px solid rgba(226, 232, 240, 0.96);
    background: rgba(255, 255, 255, 0.94);
    color: #64748b;
}

.portal-search input {
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: #0f172a;
    font-size: 13px;
}

.portal-icon-btn,
.portal-text-btn,
.portal-solid-btn,
.portal-user__trigger {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.portal-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    color: #334155;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(226, 232, 240, 0.96);
}

.portal-text-btn {
    padding: 9px 10px;
    background: transparent;
    color: #0f172a;
    font-weight: 700;
    font-size: 13px;
}

.portal-solid-btn {
    padding: 9px 14px;
    border-radius: 10px;
    background: linear-gradient(135deg, #2563eb, #4f8cff);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.22);
}

.portal-user {
    position: relative;
}

.portal-user__trigger {
    min-width: 124px;
    padding: 9px 12px;
    border-radius: 10px;
    background: rgba(239, 246, 255, 0.95);
    color: #1d4ed8;
    font-weight: 700;
    font-size: 13px;
}

.portal-user__menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    display: none;
    min-width: 190px;
    padding: 10px;
    border-radius: 18px;
    border: 1px solid rgba(203, 213, 225, 0.92);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.portal-user__menu.open {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.portal-user__menu button {
    border: 0;
    background: transparent;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    cursor: pointer;
    color: #0f172a;
}

.portal-user__menu button:hover {
    background: rgba(241, 245, 249, 0.98);
}

.portal-user__menu .danger {
    color: #dc2626;
}

@media (max-width: 1180px) {
    .portal-header {
        grid-template-columns: 1fr;
        gap: 14px;
    }

    .portal-nav,
    .portal-header__tools {
        justify-content: space-between;
    }
}

@media (max-width: 780px) {
    .portal-header {
        top: 0;
        width: calc(100% - 16px);
        margin: 8px auto 12px;
        border-radius: 16px;
        padding: 12px 16px;
    }

    .portal-search {
        width: 100%;
    }

    .portal-header__tools,
    .portal-nav {
        width: 100%;
        flex-wrap: wrap;
    }
}
</style>
