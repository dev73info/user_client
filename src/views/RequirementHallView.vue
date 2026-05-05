<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

type HallCard = {
    title: string
    summary: string
    budget: string
    tag: string
    status: string
}

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const hallCards: HallCard[] = [
    { title: '企业官网重构', summary: '需要视觉升级、CMS 后台与多语言支持。', budget: '¥ 3000-8000', tag: '网站开发', status: '招募中' },
    { title: 'Minecraft RPG 插件', summary: '服务端玩法插件与经济系统联动。', budget: '¥ 1500-3000', tag: 'Minecraft', status: '开发中' },
    { title: '在线教育系统', summary: '课程交付、会员付费、数据统计。', budget: '¥ 2000-5000', tag: '全栈开发', status: '审核中' },
    { title: '品牌视觉插画包', summary: '活动 KV、社媒套图与角色延展。', budget: '¥ 800-1500', tag: '插画设计', status: '邀标中' },
]

const hallStats = computed(() => [
    { label: '活跃需求', value: '128+' },
    { label: '今日新增', value: '16' },
    { label: '待接单', value: '42' },
    { label: '已完成', value: '390+' },
])

const hallSignals = ['预算清晰可见', '按领域快速筛选', '支持后续接入真实需求数据']
const hallGuide = [
    { title: '浏览需求卡片', detail: '先看预算、状态和领域标签，快速判断是否值得进入。' },
    { title: '评估交付周期', detail: '后续可以在这里接入更细的时间、人数和历史评价信息。' },
    { title: '回到门户发布', detail: '发布入口仍保留在首页，当前页先承担大厅展示能力。' },
]
const hallFeeds = [
    '当前需求大厅内容以占位数据为主，用于完善门户结构和信息层次。',
    '后续可直接接入真实需求单列表，并复用筛选、排序和搜索能力。',
    '若你已登录，可在工单中心查看和你相关的真实需求流程。',
]

function openPublish() {
    if (!auth.isAuthed) {
        showToast('登录后可提交需求单', 'info')
        void router.push({ name: 'home', query: { modal: 'auth', mode: 'login' } })
        return
    }

    showToast('首页保留了发布需求入口，下一步可接入完整需求发布页', 'info')
    void router.push({ name: 'home' })
}
</script>

<template>
    <main class="portal-page">
        <section class="portal-page__hero">
            <div class="portal-page__hero-copy">
                <p class="portal-page__eyebrow">Requirement Hall</p>
                <h1>需求大厅</h1>
                <p>汇总平台热门定制需求、预算区间与合作状态，方便需求方筛选承接方向，也方便开发者快速定位机会。当前部分内容为占位数据，用于保证门户体验完整。</p>

                <div class="portal-page__signal-list">
                    <span v-for="signal in hallSignals" :key="signal" class="portal-page__signal">{{ signal }}</span>
                </div>

                <div class="portal-page__hero-actions">
                    <button class="portal-page__primary" type="button" @click="openPublish">发布需求</button>
                    <button class="portal-page__secondary" type="button"
                        @click="router.push({ name: 'tickets' })">查看工单</button>
                </div>
            </div>

            <div class="portal-page__hero-visual" aria-hidden="true">
                <div class="portal-page__hero-orbit">
                    <div class="portal-page__hero-core">◎</div>
                    <div class="portal-page__hero-float portal-page__hero-float--one">¥</div>
                    <div class="portal-page__hero-float portal-page__hero-float--two">⌛</div>
                    <div class="portal-page__hero-float portal-page__hero-float--three">✓</div>
                    <div class="portal-page__hero-float portal-page__hero-float--four">✦</div>
                </div>
            </div>
        </section>

        <section class="portal-page__stats">
            <article v-for="item in hallStats" :key="item.label" class="portal-page__stat-card">
                <strong>{{ item.value }}</strong>
                <span>{{ item.label }}</span>
            </article>
        </section>

        <section class="portal-page__content">
            <section class="portal-page__panel">
                <div class="portal-page__section-header">
                    <div>
                        <p class="portal-page__eyebrow">热门需求</p>
                        <h2>当前大厅重点展示的合作机会</h2>
                    </div>
                    <button class="portal-page__link-btn" type="button"
                        @click="router.push({ name: 'home' })">返回门户</button>
                </div>
                <div class="portal-page__card-grid">
                    <article v-for="card in hallCards" :key="card.title" class="portal-page__card">
                        <div class="portal-page__card-topline">
                            <span class="portal-page__chip">{{ card.tag }}</span>
                            <span class="portal-page__meta">{{ card.status }}</span>
                        </div>
                        <h2>{{ card.title }}</h2>
                        <p>{{ card.summary }}</p>
                        <div class="portal-page__card-footer">
                            <strong>{{ card.budget }}</strong>
                            <button class="portal-page__action" type="button"
                                @click="showToast('详情页下一步可接入真实需求详情', 'info')">查看详情</button>
                        </div>
                    </article>
                </div>
            </section>

            <aside class="portal-page__aside">
                <section class="portal-page__aside-card">
                    <div class="portal-page__aside-head">
                        <h3>浏览指引</h3>
                    </div>
                    <ul class="portal-page__timeline">
                        <li v-for="item in hallGuide" :key="item.title" class="portal-page__timeline-item">
                            <div>
                                <strong>{{ item.title }}</strong>
                                <p>{{ item.detail }}</p>
                            </div>
                        </li>
                    </ul>
                </section>

                <section class="portal-page__aside-card">
                    <div class="portal-page__aside-head">
                        <h3>大厅说明</h3>
                    </div>
                    <ul class="portal-page__list">
                        <li v-for="item in hallFeeds" :key="item" class="portal-page__list-item">
                            <strong>{{ item }}</strong>
                        </li>
                    </ul>
                </section>
            </aside>
        </section>
    </main>
</template>
