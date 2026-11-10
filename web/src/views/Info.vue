<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { INFO_PAGES, PARTNER_PLANS } from '../content'

const route = useRoute()
const key = computed(() => String(route.params.section ?? '') + (route.params.sub ? '/' + route.params.sub : ''))
const page = computed(() => INFO_PAGES[key.value])
const isCoop = computed(() => key.value === 'cooperation')
</script>

<template>
  <div class="page">
    <template v-if="page">
      <header class="head">
        <h1>{{ page.title }}</h1>
        <p class="lead">{{ page.lead }}</p>
      </header>

      <nav class="info-nav">
        <RouterLink v-for="(p, k) in INFO_PAGES" :key="k" :to="`/${k}`" :class="{ on: k === key }">{{ p.title }}</RouterLink>
      </nav>

      <div class="body">
        <section v-for="b in page.blocks" :key="b.heading" class="block card">
          <h2>{{ b.heading }}</h2>
          <p v-for="(t, i) in b.paragraphs ?? []" :key="'p' + i" class="para">{{ t }}</p>
          <ul v-if="b.list">
            <li v-for="(t, i) in b.list" :key="'l' + i">{{ t }}</li>
          </ul>
        </section>

        <section v-if="isCoop" class="plans">
          <div v-for="p in PARTNER_PLANS" :key="p.name" class="card plan">
            <h3>{{ p.name }}</h3>
            <div class="price">{{ p.price }}</div>
            <ul><li v-for="f in p.features" :key="f">{{ f }}</li></ul>
            <RouterLink to="/contact" class="btn btn-primary btn-block">咨询合作</RouterLink>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="card"><div class="empty"><div class="empty-ico">◧</div><div>页面不存在</div></div></div>
  </div>
</template>

<style scoped>
.page { max-width: 1020px; margin: 0 auto; padding: var(--s-10) var(--s-6); display: grid; grid-template-columns: 180px 1fr; gap: var(--s-6); }
.head { grid-column: 1 / -1; }
.head h1 { font-size: var(--fs-2xl); margin-bottom: 8px; }
.lead { color: var(--ink-500); font-size: var(--fs-md); }
.info-nav { display: flex; flex-direction: column; gap: 2px; align-self: start; position: sticky; top: 84px; }
.info-nav a { padding: 8px 12px; border-radius: var(--r-sm); color: var(--ink-500); font-size: var(--fs-sm); text-decoration: none; }
.info-nav a:hover { background: var(--line-soft); color: var(--ink-900); }
.info-nav a.on { background: var(--brand-50); color: var(--brand-600); font-weight: 600; }
.body { display: flex; flex-direction: column; gap: var(--s-4); }
.block { padding: var(--s-6); }
.block h2 { font-size: var(--fs-md); margin-bottom: var(--s-3); }
.para { color: var(--ink-700); line-height: 1.9; margin-bottom: var(--s-3); }
.block ul { padding-left: 18px; color: var(--ink-700); line-height: 2; }
.block li { list-style: disc; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-3); }
.plan { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
.plan h3 { font-size: var(--fs-base); }
.price { font-size: var(--fs-md); font-weight: 700; color: var(--err-600); }
.plan ul { padding-left: 16px; font-size: var(--fs-sm); color: var(--ink-500); line-height: 1.9; }
@media (max-width: 900px) {
  .page { grid-template-columns: 1fr; padding: var(--s-6) var(--s-4); }
  .info-nav { flex-direction: row; overflow-x: auto; position: static; }
  .plans { grid-template-columns: 1fr; }
}
</style>
