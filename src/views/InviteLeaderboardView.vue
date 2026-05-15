<script setup lang="ts">
import InviteLeaderboard from '@/components/InviteLeaderboard.vue'
import ShareStats from '@/components/ShareStats.vue'
</script>

<template>
    <main class="invite-leaderboard-view">
        <header class="invite-leaderboard-view__toolbar">
            <RouterLink class="invite-leaderboard-view__back" :to="{ name: 'workbench-invite' }">
                返回我的邀请
            </RouterLink>
        </header>
        <section class="invite-leaderboard-view__card invite-leaderboard-view__card--leaderboard">
            <InviteLeaderboard />
        </section>
        <section class="invite-leaderboard-view__card">
            <ShareStats />
        </section>
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
    border: 1px solid rgba(191, 219, 254, 0.96);
    border-radius: 8px;
    background: rgba(239, 246, 255, 0.9);
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
}

.invite-leaderboard-view__back:hover {
    border-color: rgba(37, 99, 235, 0.36);
    background: #fff;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
    transform: translateY(-1px);
}

.invite-leaderboard-view__card {
    min-width: 0;
    padding: 18px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.invite-leaderboard-view__card--leaderboard {
    min-height: 100%;
}

@media (max-width: 980px) {
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

    .invite-leaderboard-view__toolbar {
        justify-content: stretch;
    }

    .invite-leaderboard-view__back {
        width: 100%;
    }
}
</style>