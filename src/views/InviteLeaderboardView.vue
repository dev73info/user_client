<script setup lang="ts">
import InviteLeaderboard from '@/components/InviteLeaderboard.vue'
import ShareStats from '@/components/ShareStats.vue'
</script>

<template>
  <main class="invite-leaderboard-view">
    <header class="invite-leaderboard-view__toolbar">
      <RouterLink class="invite-leaderboard-view__back" :to="{ name: 'workbench-badges' }"
        >返回勋章与邀请</RouterLink
      >
    </header>
    <section class="invite-leaderboard-view__card"><InviteLeaderboard /></section>
    <section class="invite-leaderboard-view__card"><ShareStats /></section>
  </main>
</template>

<style scoped>
.invite-leaderboard-view {
  width: min(1180px, calc(100% - 24px));
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 14px;
  margin: 18px auto 36px;
}
.invite-leaderboard-view__toolbar {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
}
.invite-leaderboard-view__back {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}
.invite-leaderboard-view__card {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface-strong);
}
@media (max-width: 900px) {
  .invite-leaderboard-view {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .invite-leaderboard-view {
    width: calc(100% - 16px);
    margin-top: 10px;
  }
  .invite-leaderboard-view__card {
    padding: 14px;
  }
  .invite-leaderboard-view__toolbar,
  .invite-leaderboard-view__back {
    width: 100%;
  }
}
</style>
