<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ChatDotRound, Star } from '@element-plus/icons-vue'

import { listFavoriteCommunityPosts, type CommunityPost } from '@/api/community'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()
const posts = ref<CommunityPost[]>([])
const loading = ref(false)

async function loadFavorites() {
  auth.hydrate()
  if (!auth.token.trim()) return
  loading.value = true
  try {
    posts.value = await listFavoriteCommunityPosts(auth.token)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载我的收藏失败', 'error')
  } finally {
    loading.value = false
  }
}

function openPost(post: CommunityPost) {
  void router.push({ name: 'community-post', params: { postId: post.id } })
}

function preview(content: string) {
  return sanitizeRichHtml(content).replace(/<[^>]*>/g, '').trim().slice(0, 120)
}

onMounted(() => {
  void loadFavorites()
})
</script>

<template>
  <section class="favorites-page">
    <div class="favorites-page__intro">
      <div>
        <p class="favorites-page__eyebrow">COMMUNITY</p>
        <h2>我的收藏</h2>
        <p>把值得回看的讨论，放在一个顺手找到的地方。</p>
      </div>
      <div class="favorites-page__actions">
        <span class="favorites-page__count">{{ posts.length }} 篇帖子</span>
        <el-button type="primary" plain @click="router.push({ name: 'community' })">
          <span>浏览社区</span>
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="favorites-page__list">
      <button v-for="post in posts" :key="post.id" class="favorite-post" type="button" @click="openPost(post)">
        <div class="favorite-post__topline">
          <span class="favorite-post__author">{{ post.author }}</span>
          <time>{{ post.published_at }}</time>
        </div>
        <h3>{{ post.title }}</h3>
        <p class="favorite-post__preview">{{ preview(post.content_html) || '这篇帖子暂未添加正文摘要。' }}</p>
        <div class="favorite-post__footer">
          <span v-for="tag in post.tags" :key="tag.id" class="favorite-post__tag">{{ tag.name }}</span>
          <span class="favorite-post__metrics">
            <span><Star /> {{ post.like_count }}</span>
            <span><ChatDotRound /> {{ post.comment_count }}</span>
          </span>
        </div>
      </button>

      <div v-if="!loading && posts.length === 0" class="favorites-empty">
        <div class="favorites-empty__icon"><Star /></div>
        <h3>还没有收藏帖子</h3>
        <p>在社区里看到值得回看的内容，点亮收藏，之后就能在这里找到。</p>
        <el-button type="primary" @click="router.push({ name: 'community' })">去社区逛逛</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.favorites-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: calc(100vh - 140px);
  /* 占满内容区最大宽度，与其他工作台面板一致 */
  padding: 8px 0 0;
}

.favorites-page__intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px 26px;
  border: 1px solid rgb(224 232 255 / 96%);
  border-radius: 18px;
  background: linear-gradient(135deg, #eef4ff 0%, #f7faff 55%, #ffffff 100%);
  box-shadow: 0 12px 26px rgb(76 103 172 / 8%);
}

.favorites-page__eyebrow {
  margin: 0 0 8px;
  color: #4f8cff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.favorites-page h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 28px;
}

.favorites-page__intro p:last-child {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

.favorites-page__actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.favorites-page__count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.favorites-page__actions .el-icon {
  margin-left: 5px;
}

.favorites-page__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 220px;
  padding-top: 20px;
}

.favorite-post {
  display: block;
  width: 100%;
  margin: 0 0 12px;
  padding: 21px 24px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: rgb(255 255 255 / 86%);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.favorite-post:hover {
  border-color: #9fbdff;
  box-shadow: 0 8px 22px rgb(28 37 54 / 8%);
  transform: translateY(-2px);
}

.favorite-post:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}

.favorite-post__topline,
.favorite-post__footer,
.favorite-post__metrics,
.favorite-post__metrics span {
  display: flex;
  align-items: center;
}

.favorite-post__topline,
.favorite-post__footer {
  justify-content: space-between;
  gap: 12px;
}

.favorite-post__author {
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.favorite-post time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.favorite-post h3 {
  margin: 10px 0 8px;
  color: var(--el-text-color-primary);
  font-size: 19px;
  letter-spacing: 0;
}

.favorite-post__preview {
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

.favorite-post__footer {
  margin-top: 16px;
}

.favorite-post__tag {
  margin-right: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.favorite-post__metrics {
  gap: 14px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.favorite-post__metrics span {
  gap: 4px;
}

.favorite-post__metrics svg {
  width: 14px;
  height: 14px;
}

.favorites-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 28px 24px 36px;
  border: 1px dashed rgb(79 140 255 / 42%);
  border-radius: 18px;
  background: linear-gradient(145deg, rgb(238 244 255 / 92%), rgb(248 250 252 / 92%));
  text-align: center;
}

.favorites-empty__icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 50%;
  background: #e3edff;
  color: #4f8cff;
}

.favorites-empty__icon svg {
  width: 28px;
  height: 28px;
}

.favorites-empty h3 {
  margin: 18px 0 8px;
  color: var(--el-text-color-primary);
  font-size: 19px;
}

.favorites-empty p {
  max-width: 360px;
  margin: 0 0 20px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

@media (max-width: 640px) {
  .favorites-page {
    padding: 0 12px 32px;
  }

  .favorites-page__intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .favorites-page__actions {
    justify-content: space-between;
    width: 100%;
  }

  .favorite-post {
    padding: 16px;
  }

  .favorite-post__footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
