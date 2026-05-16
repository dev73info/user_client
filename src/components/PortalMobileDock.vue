<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const routeName = computed(() => String(route.name ?? ""));

function isResourceActive() {
    return ["free-resources", "resource-catalog", "resource-detail"].includes(
        routeName.value
    );
}

function isMessagesActive() {
    return routeName.value === "messages" || routeName.value === "workbench-messages";
}

function isWorkbenchActive() {
    return route.path.startsWith("/workbench") && !isMessagesActive();
}

async function scrollPortalTop() {
    await nextTick();
    const wrap = document.querySelector<HTMLElement>(".app-scrollbar .el-scrollbar__wrap");
    if (wrap) {
        wrap.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function goHome() {
    if (routeName.value !== "home") {
        await router.push({ name: "home" });
    }

    await scrollPortalTop();
}

function goFreeResources() {
    void router.push({ name: "free-resources" });
}

function goProtectedTarget(target: { name: string; hash?: string }) {
    if (auth.isAuthed) {
        void router.push(target);
        return;
    }

    void router.push({
        name: "home",
        query: {
            modal: "auth",
            mode: "login",
            redirect_to: router.resolve(target).fullPath,
        },
    });
}

function openPublish() {
    if (auth.isAuthed) {
        void router.push({ name: "home", query: { modal: "publish" } });
        return;
    }

    void router.push({
        name: "home",
        query: {
            modal: "auth",
            mode: "login",
            redirect_to: "/?modal=publish",
        },
    });
}

function goMessages() {
    goProtectedTarget({ name: "messages" });
}

function goWorkbench() {
    goProtectedTarget({ name: "workbench" });
}
</script>

<template>
    <nav class="portal-mobile-dock" aria-label="移动端快捷导航">
        <button type="button" class="portal-mobile-dock__item" :class="{ active: routeName === 'home' }"
            @click="goHome">
            <span>⌂</span>
            <small>首页</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" :class="{ active: isResourceActive() }"
            @click="goFreeResources">
            <span>◫</span>
            <small>免费资源</small>
        </button>
        <button type="button" class="portal-mobile-dock__item portal-mobile-dock__item--primary" @click="openPublish">
            <span>＋</span>
            <small>发布</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" :class="{ active: isMessagesActive() }"
            @click="goMessages">
            <span>✉</span>
            <small>消息</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" :class="{ active: isWorkbenchActive() }"
            @click="goWorkbench">
            <span class="portal-mobile-dock__icon portal-mobile-dock__icon--workbench" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="5" width="16" height="14" rx="3" />
                    <path d="M8 4.5V7" />
                    <path d="M16 4.5V7" />
                    <path d="M4 10H20" />
                    <path d="M8.5 13.5H11.5" />
                    <path d="M13.5 13.5H16.5" />
                </svg>
            </span>
            <small>工作台</small>
        </button>
    </nav>
</template>

<style scoped>
.portal-mobile-dock {
    position: fixed;
    left: max(10px, env(safe-area-inset-left));
    right: max(10px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    z-index: 60;
    display: none;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    max-width: 720px;
    margin: 0 auto;
    padding: 10px;
    border-radius: 18px;
    border: 1px solid rgba(198, 210, 236, 0.76);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 18px 40px rgba(76, 103, 172, 0.18);
    backdrop-filter: blur(18px);
}

.portal-mobile-dock__item {
    display: grid;
    place-items: center;
    gap: 4px;
    min-width: 0;
    min-height: 58px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    color: #475569;
    cursor: pointer;
    font: inherit;
}

.portal-mobile-dock__item span {
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
}

.portal-mobile-dock__icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
}

.portal-mobile-dock__icon svg {
    width: 100%;
    height: 100%;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.portal-mobile-dock__item small {
    max-width: 100%;
    color: inherit;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
    transform: translateY(-8px);
}

.portal-mobile-dock__item.active,
.portal-mobile-dock__item--primary {
    color: #1d4ed8;
}

.portal-mobile-dock__item--primary {
    position: relative;
    overflow: hidden;
    background: linear-gradient(160deg, rgba(223, 236, 255, 0.96), rgba(207, 226, 255, 0.9));
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.88),
        0 8px 16px rgba(59, 106, 214, 0.14);
}

.portal-mobile-dock__item--primary span {
    font-size: 22px;
    font-weight: 600;
    line-height: 1;
    transform: translateY(1px);
}

.portal-mobile-dock__item--primary small {
    font-size: 14px;
    letter-spacing: 0.01em;
}

.portal-mobile-dock__item--primary:active {
    transform: translateY(1px) scale(0.985);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.78),
        0 5px 10px rgba(59, 106, 214, 0.16);
}

@media (max-width: 900px) {
    .portal-mobile-dock {
        display: grid;
    }
}

@media (max-width: 360px) {
    .portal-mobile-dock {
        gap: 6px;
        padding: 8px;
    }

    .portal-mobile-dock__item {
        min-height: 54px;
    }

    .portal-mobile-dock__item small {
        font-size: 12px;
    }
}
</style>
