<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contentApi, type Article } from '../api-content'

const route = useRoute()
const router = useRouter()
const a = ref<Article | null>(null)
const related = ref<Article[]>([])
const loading = ref(true)
const error = ref('')
const copied = ref(false)

const isEvent = computed(() => a.value?.type === 'event')
const readMin = computed(() => {
  const n = (a.value?.content?.length ?? 0) + (a.value?.summary?.length ?? 0)
  return Math.max(1, Math.round(n / 260))
})
const isNew = computed(() => {
  const t = a.value?.publishedAt
  if (!t) return false
  return Date.now() - new Date(t).getTime() < 7 * 864e5
})

async function load() {
  loading.value = true
  error.value = ''
  a.value = null
  try {
    a.value = await contentApi.detail(Number(route.params.id))
    const r = await contentApi.list(a.value.type, 1, 4)
    related.value = r.list.filter(x => x.id !== a.value!.id).slice(0, 3)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(location.href)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch { /* 剪贴板不可用就忽略 */ }
}

watch(() => route.params.id, load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="crumb">
      <RouterLink to="/">首页</RouterLink> /
      <RouterLink :to="isEvent ? '/events' : '/news'">{{ isEvent ? '活动' : '新闻' }}</RouterLink> /
      <span class="dim">{{ a?.title ?? '详情' }}</span>
    </div>

    <p v-if="loading" class="skeleton-wrap">
      <span class="skeleton" style="display:block;width:70%;height:34px"></span>
      <span class="skeleton" style="display:block;width:40%;height:14px;margin-top:14px"></span>
      <span class="skeleton" style="display:block;width:100%;height:300px;margin-top:24px"></span>
    </p>
    <p v-else-if="error" class="err">{{ error }}</p>

    <article v-else-if="a">
      <header class="head">
        <div class="tags">
          <span class="pill" :class="isEvent ? 'pill-warn' : 'pill-brand'">{{ isEvent ? '活动' : '新闻' }}</span>
          <span v-if="isNew" class="pill pill-ok">最新</span>
        </div>
        <h1>{{ a.title }}</h1>
        <div class="meta">
          <span>{{ (a.publishedAt ?? '').slice(0, 16) }}</span>
          <span>· 约 {{ readMin }} 分钟</span>
          <span v-if="isEvent && a.eventPlace">· {{ a.eventPlace }}</span>
          <div class="grow"></div>
          <button class="btn btn-sm btn-ghost" @click="share">{{ copied ? '已复制链接' : '分享' }}</button>
        </div>
      </header>

      <div v-if="a.cover" class="cover" :style="{ backgroundImage: `url(${a.cover})` }"></div>

      <div v-if="isEvent && (a.eventStart || a.eventEnd)" class="card event-box">
        <div><span class="k">开始</span><b>{{ (a.eventStart ?? '').slice(0, 16) || '待定' }}</b></div>
        <div><span class="k">结束</span><b>{{ (a.eventEnd ?? '').slice(0, 16) || '待定' }}</b></div>
        <div><span class="k">地点</span><b>{{ a.eventPlace || '待定' }}</b></div>
      </div>

      <div class="content" v-html="a.content"></div>

      <div class="cta card">
        <div class="grow">
          <b>{{ isEvent ? '想参加？先看看场地有没有空' : '需要预约场地？' }}</b>
          <p class="muted">场馆开放时段实时可查，选定即锁定</p>
        </div>
        <RouterLink to="/venues" class="btn btn-primary">去预约</RouterLink>
      </div>

      <!-- 相关 -->
      <section v-if="related.length" class="related">
        <div class="section-head">
          <h2>{{ isEvent ? '其他活动' : '相关阅读' }}</h2>
        </div>
        <div class="rel-grid">
          <RouterLink v-for="r in related" :key="r.id" :to="`/article/${r.id}`" class="card rel">
            <div class="rel-cover" :style="{ backgroundImage: `url(${r.cover})` }"></div>
            <div class="rel-body">
              <h3>{{ r.title }}</h3>
              <p class="muted">{{ (r.publishedAt ?? '').slice(0, 10) }}</p>
            </div>
          </RouterLink>
        </div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.page { max-width: 780px; margin: 0 auto; padding: var(--s-6) var(--s-6) var(--s-12); }
.crumb { font-size: var(--fs-xs); color: var(--ink-400); margin-bottom: var(--s-5); }
.crumb a { color: var(--ink-400); text-decoration: none; }
.crumb a:hover { color: var(--brand-600); }
.dim { color: var(--ink-300); }

.head { margin-bottom: var(--s-5); }
.tags { display: flex; gap: 8px; margin-bottom: 12px; }
.head h1 { font-size: var(--fs-2xl); line-height: 1.4; margin-bottom: 12px; }
.meta { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--ink-400); flex-wrap: wrap; }

.cover { height: 340px; border-radius: var(--r-lg); background-size: cover; background-position: center; margin-bottom: var(--s-6); }
.event-box { display: flex; gap: var(--s-10); padding: var(--s-4) var(--s-5); margin-bottom: var(--s-6); }
.event-box .k { display: block; font-size: var(--fs-xs); color: var(--ink-400); }
.event-box b { font-size: var(--fs-sm); }

.content { font-size: 15px; line-height: 1.95; color: var(--ink-700); }
.content :deep(p) { margin-bottom: var(--s-4); }
.content :deep(h2) { font-size: var(--fs-lg); margin: var(--s-6) 0 var(--s-3); }
.content :deep(blockquote) { margin: var(--s-4) 0; padding: 10px 16px; border-left: 3px solid var(--brand-200); background: var(--brand-50); color: var(--ink-500); }
.content :deep(img) { max-width: 100%; border-radius: var(--r-md); }
.content :deep(ul), .content :deep(ol) { padding-left: 22px; margin-bottom: var(--s-4); }
.content :deep(li) { list-style: disc; }

.cta { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-5); margin-top: var(--s-8); }
.cta p { font-size: var(--fs-sm); }

.related { margin-top: var(--s-10); }
.section-head { display: flex; align-items: baseline; gap: var(--s-3); margin-bottom: var(--s-4); }
.section-head h2 { font-size: var(--fs-md); }
.rel-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-3); }
.rel { overflow: hidden; text-decoration: none; color: inherit; transition: all .18s var(--ease); }
.rel:hover { transform: translateY(-2px); box-shadow: var(--sh-md); text-decoration: none; }
.rel-cover { height: 110px; background-size: cover; background-position: center; }
.rel-body { padding: var(--s-3); }
.rel-body h3 { font-size: var(--fs-sm); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rel-body p { font-size: var(--fs-xs); margin-top: 4px; }

.skeleton-wrap { padding: var(--s-6) 0; }

@media (max-width: 900px) {
  .page { padding: var(--s-4) var(--s-4) var(--s-10); }
  .head h1 { font-size: var(--fs-xl); }
  .cover { height: 200px; }
  .event-box { flex-direction: column; gap: var(--s-3); }
  .rel-grid { grid-template-columns: 1fr; }
}
</style>
