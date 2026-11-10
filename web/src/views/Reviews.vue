<script setup lang="ts">
import { REVIEWS } from '../content'
</script>

<template>
  <div class="page">
    <header class="head">
      <h1>往届精彩回顾</h1>
      <p class="muted">那些已经发生过的场面</p>
    </header>
    <div class="grid">
      <article v-for="r in REVIEWS" :key="r.title" class="card item">
        <div class="cover" :style="{ backgroundImage: `url(${r.cover})` }">
          <span class="year">{{ r.year }}</span>
        </div>
        <div class="body">
          <h3>{{ r.title }}</h3>
          <p class="muted">{{ r.desc }}</p>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; margin: 0 auto; padding: var(--s-10) var(--s-8); }
.head { margin-bottom: var(--s-6); }
.head h1 { font-size: var(--fs-2xl); margin-bottom: 6px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-4); }
.item { overflow: hidden; }
.cover { height: 200px; background-size: cover; background-position: center; position: relative; }
.year { position: absolute; left: 12px; top: 12px; background: rgba(0,0,0,.6); color: #fff; font-size: var(--fs-xs); padding: 3px 10px; border-radius: var(--r-full); }
.body { padding: var(--s-4) var(--s-5) var(--s-5); }
.body h3 { font-size: var(--fs-md); margin-bottom: 4px; }
@media (max-width: 900px) { .page { padding: var(--s-6) var(--s-4); } .grid { grid-template-columns: 1fr; } }
</style>
