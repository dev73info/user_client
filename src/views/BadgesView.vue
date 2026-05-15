<script setup lang="ts">
import BadgeWall from '@/components/BadgeWall.vue'
</script>

<template>
    <main class="badges-view">
        <BadgeWall />
    </main>
</template>

<style scoped>
.badges-view {
    width: min(1120px, calc(100% - 24px));
    margin: 18px auto 36px;
    padding: 18px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

@media (max-width: 640px) {
    .badges-view {
        width: calc(100% - 16px);
        padding: 14px;
    }
}
</style>