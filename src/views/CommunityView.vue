<script setup lang="ts">
type FeedItem = {
  title: string
  summary: string
  meta: string
}

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
  <main class="portal-page portal-page--nav community-page">
    <section class="community-layout">
      <section class="community-panel">
        <div class="community-header">
          <div class="community-header__copy">
            <p class="portal-page__eyebrow">社区内容</p>
            <h2>公告、经验与资源复盘</h2>
            <p class="community-lead">汇总平台公告、开发协作经验和资源维护记录，后续会逐步升级为内容流。</p>
            <div class="community-signal-list" aria-label="社区内容状态">
              <span v-for="signal in communitySignals" :key="signal" class="community-signal">
                {{ signal }}
              </span>
            </div>
          </div>

          <div class="community-header__badge" aria-hidden="true">
            <span>73Info</span>
            <strong>Community</strong>
          </div>
        </div>

        <div class="community-card-grid">
          <article v-for="(item, index) in communityHighlights" :key="item.title" class="community-card">
            <div class="community-card__topline">
              <span class="portal-page__chip">{{ item.meta }}</span>
              <span class="community-card__index">{{ String(index + 1).padStart(2, '0') }}</span>
            </div>
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
            </div>
          </article>
        </div>
      </section>

      <aside class="community-aside">
        <section class="community-feed-card">
          <div class="community-feed-card__head">
            <h3>最新动态</h3>
            <span>同步中</span>
          </div>
          <ul class="community-feed-list">
            <li v-for="item in feeds" :key="item.title" class="community-feed-item">
              <span class="community-feed-item__line" aria-hidden="true"></span>
              <div class="community-feed-item__body">
                <span class="portal-page__chip">{{ item.meta }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ item.summary }}</p>
              </div>
            </li>
          </ul>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.community-page {
  width: min(1360px, calc(100% - 24px));
}

.community-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.42fr);
  gap: 18px;
  align-items: start;
}

.community-panel,
.community-feed-card,
.community-card {
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 30px rgba(90, 120, 180, 0.08);
}

.community-panel,
.community-feed-card {
  border-radius: 18px;
  padding: 18px;
}

.community-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid rgba(219, 234, 254, 0.86);
  background: linear-gradient(135deg, #ffffff 0%, #f8fbff 58%, #eef6ff 100%);
}

.community-header__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.community-header h2,
.community-feed-card h3,
.community-card h3 {
  margin: 0;
  color: #0f172a;
}

.community-header h2 {
  font-size: clamp(24px, 2.4vw, 34px);
  line-height: 1.16;
}

.community-lead,
.community-card p,
.community-feed-item p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.community-lead {
  max-width: 720px;
  font-size: 15px;
}

.community-signal-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.community-signal {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.92);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.community-header__badge {
  display: grid;
  min-width: 176px;
  place-content: center;
  gap: 6px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2563eb, #14b8a6);
  color: #fff;
  text-align: center;
  box-shadow: 0 16px 30px rgba(37, 99, 235, 0.18);
}

.community-header__badge span {
  font-size: 12px;
  font-weight: 800;
  opacity: 0.82;
}

.community-header__badge strong {
  font-size: 22px;
  line-height: 1;
}

.community-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.community-card {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  border-radius: 16px;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.community-card:hover {
  border-color: rgba(147, 197, 253, 0.92);
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.12);
  transform: translateY(-2px);
}

.community-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.community-card__index {
  color: rgba(37, 99, 235, 0.22);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.community-card h3 {
  margin-bottom: 12px;
  font-size: 20px;
}

.community-aside {
  position: sticky;
  top: 84px;
}

.community-feed-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.community-feed-card__head h3 {
  font-size: 22px;
}

.community-feed-card__head span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(240, 253, 250, 0.95);
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
}

.community-feed-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.community-feed-item {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 12px;
  padding: 0 0 20px;
}

.community-feed-item:last-child {
  padding-bottom: 0;
}

.community-feed-item__line {
  position: relative;
  display: block;
}

.community-feed-item__line::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 5px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 5px rgba(219, 234, 254, 0.92);
}

.community-feed-item__line::after {
  content: '';
  position: absolute;
  top: 24px;
  bottom: -4px;
  left: 8px;
  width: 1px;
  background: rgba(203, 213, 225, 0.78);
}

.community-feed-item:last-child .community-feed-item__line::after {
  display: none;
}

.community-feed-item__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
}

.community-feed-item:last-child .community-feed-item__body {
  padding-bottom: 0;
  border-bottom: 0;
}

.community-feed-item strong {
  color: #0f172a;
  font-size: 17px;
}

@media (max-width: 1100px) {
  .community-layout {
    grid-template-columns: 1fr;
  }

  .community-aside {
    position: static;
  }
}

@media (max-width: 860px) {
  .community-header {
    flex-direction: column;
  }

  .community-header__badge {
    min-height: 96px;
    min-width: 0;
  }

  .community-card-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .community-page {
    width: calc(100% - 16px);
  }

  .community-panel,
  .community-feed-card,
  .community-header,
  .community-card {
    padding: 16px;
  }
}
</style>
