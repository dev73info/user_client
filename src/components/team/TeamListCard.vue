<script setup lang="ts">
/**
 * 「我的团队」卡：卡头给「创建团队」，卡内是工具条 + 团队列表（空态 / 筛完为空各一条）。
 *
 * 工具条与其余菜单页同一条（筛选项 + 搜索 + 重置都在同一行，筛选即时生效，所以不另给
 * 「查询」按钮）。重置由 TSelect / TInput 的 clearable 提供，这里只负责把条件回传给页面。
 * 组件只做展示与事件上报——筛选状态在 `useTeams` 的 `filters` 上，创建 / 解散 / 退出也在那里。
 */
import { computed } from 'vue'
import { TCard, TIcon, TInput, TOption, TSelect, Plus, Search } from 'ui_73info'

import TeamCardItem from '@/components/team/TeamCardItem.vue'
import type { TeamResponse } from '@/api/team'
import { hasActiveTeamFilters } from '@/shared/teamDisplay'

defineProps<{
  teams: TeamResponse[]
  filteredTeams: TeamResponse[]
  loading: boolean
  deletingId: number | null
  currentUsername: string
}>()

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'open', teamId: number): void
  (e: 'delete', team: TeamResponse): void
  (e: 'leave', team: TeamResponse): void
}>()

/** 工具条的两个条件（`v-model:keyword` / `v-model:scope` 绑到页面的 `filters`）。 */
const keyword = defineModel<string>('keyword', { required: true })
const scope = defineModel<string>('scope', { required: true })

const hasActiveFilters = computed(() =>
  hasActiveTeamFilters({ keyword: keyword.value, scope: scope.value }),
)
</script>

<template>
  <TCard class="dev-surface-card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">我的团队</h3>
      </div>
      <div class="dev-card-head__actions">
        <button class="dev-btn dev-btn--primary" type="button" @click="emit('create')">
          <TIcon>
            <Plus />
          </TIcon>
          <span>创建团队</span>
        </button>
      </div>
    </div>

    <!-- 列表工具条：与其余菜单页同一条（筛选项 + 搜索 + 重置都在同一行，
           筛选即时生效，所以不另给「查询」按钮）。 -->
    <div class="dev-toolbar">
      <TSelect
        v-model="scope"
        clearable
        placeholder="团队归属"
        class="dev-toolbar__field"
        aria-label="按团队归属筛选"
      >
        <TOption label="我创建的" value="owned" />
        <TOption label="我加入的" value="joined" />
      </TSelect>

      <TInput
        v-model="keyword"
        clearable
        placeholder="搜索团队名称或简介"
        class="dev-toolbar__search"
      >
        <template #prefix>
          <TIcon>
            <Search />
          </TIcon>
        </template>
      </TInput>

      <div class="dev-toolbar__actions">
        <span v-if="hasActiveFilters" class="dev-toolbar__hint">
          筛选出 {{ filteredTeams.length }} / {{ teams.length }} 个
        </span>
      </div>
    </div>

    <div v-if="loading" class="dev-empty-state">团队加载中</div>

    <div v-else-if="teams.length === 0" class="dev-empty-state">
      还没有团队，创建或加入一个团队后即可与伙伴协作
    </div>

    <div v-else-if="filteredTeams.length === 0" class="dev-empty-state">
      当前筛选下没有团队，换个条件或点「重置」再看看
    </div>

    <div v-else class="dev-stack-list">
      <TeamCardItem
        v-for="team in filteredTeams"
        :key="team.team_id"
        :team="team"
        :is-owner="team.owner_username === currentUsername"
        :deleting="deletingId === team.team_id"
        @open="emit('open', team.team_id)"
        @delete="emit('delete', team)"
        @leave="emit('leave', team)"
      />
    </div>
  </TCard>
</template>
