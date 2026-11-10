<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { token } from '../api'

interface Session { id: number; title: string; cover: string | null; startAt: string; hall: string; status: string; minPriceCents: number; totalSeats: number; soldSeats: number }

const list = ref<Session[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  try {
    const r = await fetch('/api/sessions')
    const j = await r.json()
    if (j.code !== 0) throw new Error(j.msg)
    list.value = j.data
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}
function cny(c: number) { return (c / 100).toFixed(0) }
function left(s: Session) { return Math.max(0, s.totalSeats - s.soldSeats) }
onMounted(load)
</script>

<template>
  <div class="page">
    <header class="head">
      <h1>赛事活动 · 在线购票</h1>
      <p class="muted">选座购票，电子票入场核销</p>
    </header>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">加载中…</p>

    <div v-else class="grid">
      <RouterLink v-for="s in list" :key="s.id" :to="`/tickets/${s.id}`" class="card item">
        <div class="cover" :style="{ backgroundImage: `url(${s.cover})` }">
          <span class="badge">{{ left(s) > 0 ? '售票中' : '已售罄' }}</span>
        </div>
        <div class="body">
          <h3>{{ s.title }}</h3>
          <p class="muted">{{ s.startAt.slice(0, 16) }} · {{ s.hall }}</p>
          <div class="row">
            <span class="price">¥{{ cny(s.minPriceCents) }}<i>起</i></span>
            <div class="grow"></div>
            <span class="muted">余 {{ left(s) }} 座</span>
          </div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; margin: 0 auto; padding: var(--s-10) var(--s-8); }
.head { margin-bottom: var(--s-6); }
.head h1 { font-size: var(--fs-2xl); margin-bottom: 6px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-5); }
.item { overflow: hidden; text-decoration: none; color: inherit; transition: all .18s var(--ease); }
.item:hover { transform: translateY(-3px); box-shadow: var(--sh-md); text-decoration: none; }
.cover { height: 170px; background-size: cover; background-position: center; position: relative; }
.badge { position: absolute; left: 12px; top: 12px; background: rgba(0,0,0,.6); color: #fff; font-size: var(--fs-xs); padding: 3px 10px; border-radius: var(--r-full); }
.body { padding: var(--s-4) var(--s-5) var(--s-5); }
.body h3 { font-size: var(--fs-md); margin-bottom: 4px; }
.price { font-size: var(--fs-lg); font-weight: 700; color: var(--err-600); }
.price i { font-size: var(--fs-xs); font-style: normal; color: var(--ink-400); margin-left: 2px; }
.row { display: flex; align-items: baseline; margin-top: var(--s-3); }
@media (max-width: 900px) { .page { padding: var(--s-6) var(--s-4); } .grid { grid-template-columns: 1fr; } }
</style>
