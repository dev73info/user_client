<script setup lang="ts">
import BadgeWall from '@/components/BadgeWall.vue'
import InviteLeaderboard from '@/components/InviteLeaderboard.vue'
import InvitePanel from '@/components/InvitePanel.vue'
import ShareStats from '@/components/ShareStats.vue'
</script>

<template>
    <main class="invite-view">
        <section class="invite-view__primary">
            <InvitePanel />
        </section>
        <aside class="invite-view__side">
            <InviteLeaderboard />
            <ShareStats />
        </aside>
        <section class="invite-view__badges">
            <BadgeWall />
        </section>
    </main>
</template>

<style scoped>
.invite-view {
    width: min(1280px, calc(100% - 24px));
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
    gap: 14px;
    margin: 18px auto 36px;
}

.invite-view__primary,
.invite-view__side,
.invite-view__badges {
    min-width: 0;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.invite-view__primary,
.invite-view__badges {
    padding: 18px;
}

.invite-view__side {
    display: grid;
    align-content: start;
    gap: 18px;
    padding: 18px;
}

.invite-view__badges {
    grid-column: 1 / -1;
}

@media (max-width: 980px) {
    .invite-view {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 640px) {
    .invite-view {
        width: calc(100% - 16px);
        margin-top: 10px;
    }

    .invite-view__primary,
    .invite-view__side,
    .invite-view__badges {
        padding: 14px;
    }
}
</style>