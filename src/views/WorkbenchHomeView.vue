<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import ProfileView from '@/views/ProfileView.vue'
import WorkbenchChatView from '@/components/workbench/WorkbenchChatView.vue'
import { isWorkbenchProfileQuery } from '@/shared/workbenchChatRoute'

const route = useRoute()
const showProfile = computed(() =>
  isWorkbenchProfileQuery(route.name, route.query as Record<string, unknown>),
)
</script>

<template>
  <ProfileView v-if="showProfile" />
  <WorkbenchChatView v-else />
</template>
