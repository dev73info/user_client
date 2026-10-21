<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const routeName = computed(() => String(route.name ?? ""));

function isResourceActive() {
    // 「资源项目」覆盖免费 / 付费两个分区，不再按 sale 区分高亮
    return ["resources", "resource-catalog", "resource-detail", "resource-detail-direct"].includes(
        routeName.value
    );
}

function isMessagesActive() {
    return routeName.value === "messages" || routeName.value === "workbench-messages";
}

/* 会话打开时（消息页带 requirement_id）整屏留给聊天，底部快捷导航会压住输入框，不显示 */
const isConversationOpen = computed(
    () =>
        ["messages", "workbench-messages", "dev-messages"].includes(routeName.value) &&
        typeof route.query.requirement_id === "string" &&
        route.query.requirement_id !== ""
);

function isWorkbenchActive() {
    return route.path.startsWith("/workbench") && !isMessagesActive();
}

async function scrollPortalTop() {
    await nextTick();
    const wrap = document.querySelector<HTMLElement>(".app-scrollbar .t73-scrollbar__wrap");
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

function goResources() {
    void router.push({ name: "resources" });
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
    <nav v-if="!isConversationOpen" class="portal-mobile-dock" aria-label="移动端快捷导航">
        <button type="button" class="portal-mobile-dock__item" :class="{ active: routeName === 'home' }"
            @click="goHome">
            <span>⌂</span>
            <small>首页</small>
        </button>
        <button type="button" class="portal-mobile-dock__item" :class="{ active: isResourceActive() }"
            @click="goResources">
            <span>◫</span>
            <small>资源</small>
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
    bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 60;
    display: none;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    max-width: 720px;
    margin: 0 auto;
    padding: 5px;
    border-radius: 16px;
    border: 1px solid rgba(198, 210, 236, 0.76);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 10px 28px rgba(76, 103, 172, 0.16);
    backdrop-filter: blur(18px);
}

.portal-mobile-dock__item {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    min-width: 0;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #475569;
    cursor: pointer;
    font: inherit;
}

.portal-mobile-dock__item span {
    font-size: 17px;
    font-weight: 700;
    line-height: 1;
}

.portal-mobile-dock__icon {
    display: grid;
    place-items: center;
    width: 19px;
    height: 19px;
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
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
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
    font-size: 20px;
    font-weight: 600;
    line-height: 1;
}

.portal-mobile-dock__item--primary small {
    font-size: 11px;
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

/* R047 断点收敛：原档位 360px → 640px */
@media (max-width: 640px) {
    .portal-mobile-dock {
        gap: 2px;
        padding: 4px;
    }

    .portal-mobile-dock__item {
        min-height: 44px;
    }

    .portal-mobile-dock__item small {
        font-size: 10px;
    }
}
</style>
