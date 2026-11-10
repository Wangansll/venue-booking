<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api, type Venue } from '../api'

const venues = ref<Venue[]>([])
const loading = ref(true)
const error = ref('')
const filter = ref('')

const types = computed(() => ['', ...new Set(venues.value.map(v => v.type))])
const shown = computed(() => filter.value ? venues.value.filter(v => v.type === filter.value) : venues.value)

const ICON: Record<string, string> = { 篮球场: '🏀', 羽毛球: '🏸', 自习室: '📚', 网球场: '🎾' }
function icon(t: string) { return ICON[t] ?? '◧' }

async function load() {
  loading.value = true
  error.value = ''
  try { venues.value = await api.venues() }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <header class="topbar">
    <div>
      <div class="page-title">场馆</div>
      <div class="page-sub">选择场馆查看可约时段</div>
    </div>
    <div class="grow"></div>
    <select class="input" style="width:140px" v-model="filter">
      <option v-for="t in types" :key="t" :value="t">{{ t || '全部类型' }}</option>
    </select>
    <button class="btn" @click="load">刷新</button>
  </header>

  <div class="content">
    <div class="section-head">
      <h2>全部场馆</h2>
      <span class="count">{{ shown.length }} 个</span>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <!-- 骨架屏 -->
    <div v-if="loading" class="grid">
      <div v-for="i in 4" :key="i" class="card skel-card">
        <div class="skeleton" style="width:44px;height:44px;border-radius:12px"></div>
        <div class="skeleton" style="width:60%;height:16px;margin-top:14px"></div>
        <div class="skeleton" style="width:80%;height:12px;margin-top:8px"></div>
        <div class="skeleton" style="width:40%;height:12px;margin-top:6px"></div>
      </div>
    </div>

    <div v-else-if="!shown.length" class="card">
      <div class="empty">
        <div class="empty-ico">◧</div>
        <div>这个分类下还没有场馆</div>
      </div>
    </div>

    <div v-else class="grid">
      <RouterLink v-for="v in shown" :key="v.id" :to="`/venues/${v.id}`" class="card venue">
        <div v-if="v.cover" class="venue-cover" :style="{ backgroundImage: `url(${v.cover})` }"></div>
        <div class="venue-top">
          <div class="venue-ico">{{ icon(v.type) }}</div>
          <span class="pill pill-brand">{{ v.type }}</span>
        </div>
        <h3 class="venue-name">{{ v.name }}</h3>
        <p class="venue-loc">📍 {{ v.location }}</p>

        <div class="venue-meta">
          <div><span class="k">容量</span><b>{{ v.capacity }} 人</b></div>
          <div><span class="k">开放</span><b>{{ v.open_slot }}–{{ v.close_slot }} 段</b></div>
        </div>

        <div class="venue-go">查看时段 <span>→</span></div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: var(--s-4); }

.skel-card { padding: var(--s-5); }

.venue-cover { height: 132px; background-size: cover; background-position: center; }
.venue { overflow: hidden;
  display: block; padding: var(--s-5);
  color: inherit; text-decoration: none;
  transition: transform .18s var(--ease), box-shadow .18s var(--ease), border-color .18s var(--ease);
}
.venue:hover {
  transform: translateY(-3px);
  box-shadow: var(--sh-md);
  border-color: var(--brand-200);
  text-decoration: none;
}
.venue-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-3); }
.venue-ico {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--brand-50); display: grid; place-items: center;
  font-size: 20px;
}
.venue-name { font-size: var(--fs-md); margin-bottom: 2px; }
.venue-loc { font-size: var(--fs-sm); color: var(--ink-400); margin-bottom: var(--s-4); }

.venue-meta {
  display: flex; gap: var(--s-5);
  padding-top: var(--s-3); border-top: 1px solid var(--line-soft);
}
.venue-meta .k { display: block; font-size: var(--fs-xs); color: var(--ink-300); }
.venue-meta b { font-size: var(--fs-sm); color: var(--ink-700); font-weight: 600; }

.venue-go {
  margin-top: var(--s-4); font-size: var(--fs-sm); font-weight: 600; color: var(--brand-600);
  display: flex; align-items: center; gap: 4px;
}
.venue:hover .venue-go span { transform: translateX(3px); }
.venue-go span { transition: transform .18s var(--ease); }
</style>
