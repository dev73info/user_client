<script setup lang="ts">
import BadgeWall from '@/components/BadgeWall.vue'
import InvitePanel from '@/components/InvitePanel.vue'
</script>

<template>
    <main class="invite-view">
        <section id="badges" class="invite-view__badges">
            <BadgeWall />
        </section>
        <section class="invite-view__primary">
            <InvitePanel />
        </section>
    </main>
</template>

<style scoped>
.invite-view {
    width: min(1280px, calc(100% - 24px));
    display: grid;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.invite-view__primary,
.invite-view__badges {
    padding: 22px 26px;
}

.invite-view__primary {
    grid-column: 1 / -1;
}

.invite-view__badges {
    grid-column: 1 / -1;
}

@media (max-width: 640px) {
    .invite-view {
        width: calc(100% - 16px);
        margin-top: 10px;
    }

    .invite-view__primary,
    .invite-view__badges {
        padding: 14px;
    }
}
</style>