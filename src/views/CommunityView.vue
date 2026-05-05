<script setup lang="ts">
import { useRouter } from 'vue-router'

type FeedItem = {
    title: string
    summary: string
    meta: string
}

const router = useRouter()
const feeds: FeedItem[] = [
    { title: '平台公告与更新日志', summary: '集中同步新分类、规则更新和服务说明。', meta: '公告' },
    { title: '开发经验与案例', summary: '分享项目交付经验、定价策略和协作模板。', meta: '经验帖' },
    { title: '资源发布与维护记录', summary: '沉淀版本更新、资源上架和交付复盘。', meta: '案例库' },
]

const communitySignals = ['公告与日志承接页', '经验内容占位', '后续可升级为内容流']
const communityHighlights = [
    { title: '平台更新专栏', summary: '统一承接门户公告、规则更新与版本日志。', meta: '更新' },
    { title: '开发者经验帖', summary: '逐步沉淀接单、交付、报价和协作的实战经验。', meta: '经验' },
    { title: '资源维护记录', summary: '把资源发布、版本维护与问题修复整合为内容时间线。', meta: '维护' },
]
</script>

<template>
    <main class="portal-page">
        <section class="portal-page__hero">
            <div class="portal-page__hero-copy">
                <p class="portal-page__eyebrow">Community</p>
                <h1>社区</h1>
                <p>用于承接门户首页中的公告、经验分享与资源动态，后续可以继续扩展为内容流与讨论区。当前主要由占位内容完善门户路径。</p>

                <div class="portal-page__signal-list">
                    <span v-for="signal in communitySignals" :key="signal" class="portal-page__signal">{{ signal
                    }}</span>
                </div>

                <div class="portal-page__hero-actions">
                    <button class="portal-page__primary" type="button"
                        @click="router.push({ name: 'home' })">返回门户</button>
                    <button class="portal-page__secondary" type="button"
                        @click="router.push({ name: 'requirement-hall' })">查看需求</button>
                </div>
            </div>

            <div class="portal-page__hero-visual" aria-hidden="true">
                <div class="portal-page__hero-orbit">
                    <div class="portal-page__hero-core">✦</div>
                    <div class="portal-page__hero-float portal-page__hero-float--one">公</div>
                    <div class="portal-page__hero-float portal-page__hero-float--two">帖</div>
                    <div class="portal-page__hero-float portal-page__hero-float--three">新</div>
                    <div class="portal-page__hero-float portal-page__hero-float--four">记</div>
                </div>
            </div>
        </section>

        <section class="portal-page__content">
            <section class="portal-page__panel">
                <div class="portal-page__section-header">
                    <div>
                        <p class="portal-page__eyebrow">社区内容</p>
                        <h2>承接门户公告与经验内容的占位板块</h2>
                    </div>
                </div>

                <div class="portal-page__collection-grid">
                    <article v-for="item in communityHighlights" :key="item.title" class="portal-page__collection-card">
                        <span class="portal-page__chip">{{ item.meta }}</span>
                        <h3>{{ item.title }}</h3>
                        <p>{{ item.summary }}</p>
                    </article>
                </div>
            </section>

            <aside class="portal-page__aside">
                <section class="portal-page__aside-card">
                    <div class="portal-page__aside-head">
                        <h3>最新动态</h3>
                    </div>
                    <ul class="portal-page__list">
                        <li v-for="item in feeds" :key="item.title" class="portal-page__list-item">
                            <span class="portal-page__chip">{{ item.meta }}</span>
                            <strong>{{ item.title }}</strong>
                            <p>{{ item.summary }}</p>
                        </li>
                    </ul>
                </section>
            </aside>
        </section>
    </main>
</template>
