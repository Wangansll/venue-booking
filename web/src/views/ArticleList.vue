<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { contentApi, type Article } from '../api-content'

const props = defineProps<{ type: 'news' | 'event' }>()

const list = ref<Article[]>([])
const total = ref(0)
const page = ref(1)
const size = 6
const loading = ref(true)
const error = ref('')
const keyword = ref('')

const isEvent = () => props.type === 'event'
const TITLE = { news: '新闻资讯', event: '赛事活动' }
const SUB = { news: '场馆动态、通知与使用指南', event: '比赛、训练营与主题活动' }
const UNIT = { news: '条', event: '场' }

/** 首页第一条做成精选大图，其余进网格 */
const featured = computed(() => (page.value === 1 ? list.value[0] : undefined))
const rest = computed(() => (page.value === 1 ? list.value.slice(1) : list.value))

/** 前端轻量筛选：标题 + 摘要命中 */
const shown = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return rest.value
  return rest.value.filter(a =>
    a.title.toLowerCase().includes(kw) || (a.summary ?? '').toLowerCase().includes(kw))
})

/** 阅读时长：按摘要字数估，最少 1 分钟 */
function readMin(a: Article) {
  const n = (a.summary?.length ?? 0) + (a.content?.length ?? 0)
  return Math.max(1, Math.round(n / 260))
}
function day(a: Article) { return (a.publishedAt ?? '').slice(0, 10) }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await contentApi.list(props.type, page.value, size)
    list.value = r.list
    total.value = r.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

const pages = () => Math.max(1, Math.ceil(total.value / size))
function go(p: number) {
  if (p < 1 || p > pages()) return
  page.value = p
  keyword.value = ''
  load()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(() => props.type, () => { page.value = 1; keyword.value = ''; load() })
onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 页头 -->
    <header class="page-head">
      <div class="head-left">
        <div class="crumb"><RouterLink to="/">首页</RouterLink> / {{ TITLE[type] }}</div>
        <h1>{{ TITLE[type] }}</h1>
        <p class="muted">{{ SUB[type] }}　·　共 {{ total }} {{ UNIT[type] }}</p>
      </div>
      <div class="head-right">
        <label class="search">
          <span class="ico">⌕</span>
          <input v-model="keyword" :placeholder="`搜索${TITLE[type]}`" />
        </label>
      </div>
    </header>

    <p v-if="error" class="err">{{ error }}</p>

    <!-- 骨架 -->
    <div v-if="loading" class="skel-wrap">
      <div class="card skel-hero">
        <div class="skeleton" style="height:280px"></div>
        <div style="padding:20px">
          <div class="skeleton" style="width:40%;height:18px"></div>
          <div class="skeleton" style="width:80%;height:12px;margin-top:12px"></div>
        </div>
      </div>
      <div class="grid">
        <div v-for="i in 3" :key="i" class="card">
          <div class="skeleton" style="height:150px"></div>
          <div style="padding:16px">
            <div class="skeleton" style="width:70%;height:16px"></div>
            <div class="skeleton" style="width:90%;height:12px;margin-top:10px"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空 -->
    <div v-else-if="!list.length" class="card">
      <div class="empty">
        <div class="empty-ico">{{ isEvent() ? '◎' : '◧' }}</div>
        <div>暂无{{ TITLE[type] }}</div>
        <RouterLink to="/venues" class="btn btn-sm">去看看场馆</RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- 精选 -->
      <RouterLink v-if="featured" :to="`/article/${featured.id}`" class="card hero-item">
        <div class="hero-cover" :style="{ backgroundImage: `url(${featured.cover})` }">
          <span class="hero-tag">{{ isEvent() ? '推荐活动' : '最新' }}</span>
        </div>
        <div class="hero-body">
          <div class="meta-line">
            <span>{{ day(featured) }}</span>
            <span v-if="isEvent() && featured.eventPlace">· {{ featured.eventPlace }}</span>
            <span>· 约 {{ readMin(featured) }} 分钟</span>
          </div>
          <h2>{{ featured.title }}</h2>
          <p class="muted">{{ featured.summary }}</p>
          <span class="more">阅读全文 →</span>
        </div>
      </RouterLink>

      <!-- 网格 -->
      <div v-if="shown.length" class="grid">
        <RouterLink v-for="a in shown" :key="a.id" :to="`/article/${a.id}`" class="card item">
          <div class="cover" :style="{ backgroundImage: `url(${a.cover})` }">
            <span v-if="isEvent()" class="badge">活动</span>
            <span class="read-min">{{ readMin(a) }} 分钟</span>
          </div>
          <div class="body">
            <h3>{{ a.title }}</h3>
            <p class="muted">{{ a.summary }}</p>
            <div class="foot">
              <span class="pill" :class="isEvent() ? 'pill-warn' : 'pill-brand'">
                {{ isEvent() ? (a.eventPlace ?? '活动') : '场馆动态' }}
              </span>
              <span class="muted date">{{ day(a) }}</span>
            </div>
          </div>
        </RouterLink>
      </div>

      <p v-else class="muted nohit">没有匹配「{{ keyword }}」的内容</p>

      <!-- 分页 -->
      <div v-if="total > size" class="pager">
        <button class="btn btn-sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
        <span class="muted">{{ page }} / {{ pages() }}　共 {{ total }} {{ UNIT[type] }}</span>
        <button class="btn btn-sm" :disabled="page >= pages()" @click="go(page + 1)">下一页</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; margin: 0 auto; padding: var(--s-8) var(--s-8) var(--s-12); }

/* 页头 */
.page-head { display: flex; align-items: flex-end; gap: var(--s-5); margin-bottom: var(--s-6); }
.head-left { flex: 1; }
.crumb { font-size: var(--fs-xs); color: var(--ink-400); margin-bottom: 8px; }
.crumb a { color: var(--ink-400); text-decoration: none; }
.crumb a:hover { color: var(--brand-600); }
.page-head h1 { font-size: var(--fs-2xl); margin-bottom: 6px; }
.search {
  display: flex; align-items: center; gap: 6px;
  height: 38px; padding: 0 12px; background: #fff;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  transition: border-color .16s, box-shadow .16s;
}
.search:focus-within { border-color: var(--brand-500); box-shadow: 0 0 0 3px var(--brand-100); }
.search .ico { color: var(--ink-300); font-size: 15px; }
.search input { border: 0; outline: 0; width: 190px; font: inherit; font-size: var(--fs-sm); background: transparent; }

/* 精选 */
.hero-item { display: grid; grid-template-columns: 1.15fr 1fr; overflow: hidden; margin-bottom: var(--s-5); text-decoration: none; color: inherit; transition: box-shadow .2s; }
.hero-item:hover { box-shadow: var(--sh-md); text-decoration: none; }
.hero-cover { min-height: 280px; background-size: cover; background-position: center; position: relative; }
.hero-tag { position: absolute; left: 14px; top: 14px; background: var(--brand-500); color: #fff; font-size: var(--fs-xs); padding: 3px 10px; border-radius: var(--r-full); }
.hero-body { padding: var(--s-6); display: flex; flex-direction: column; justify-content: center; }
.meta-line { font-size: var(--fs-xs); color: var(--ink-400); margin-bottom: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.hero-body h2 { font-size: var(--fs-xl); line-height: 1.4; margin-bottom: 10px; }
.hero-body p { font-size: var(--fs-sm); line-height: 1.8; }
.more { margin-top: var(--s-4); font-size: var(--fs-sm); font-weight: 600; color: var(--brand-600); }

/* 网格 */
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-4); }
.item { overflow: hidden; text-decoration: none; color: inherit; transition: transform .18s var(--ease), box-shadow .18s var(--ease), border-color .18s; }
.item:hover { transform: translateY(-3px); box-shadow: var(--sh-md); border-color: var(--brand-200); text-decoration: none; }
.cover { height: 168px; background-size: cover; background-position: center; position: relative; }
.badge { position: absolute; left: 12px; top: 12px; background: rgba(0,0,0,.58); color: #fff; font-size: var(--fs-xs); padding: 2px 9px; border-radius: var(--r-full); }
.read-min { position: absolute; right: 12px; bottom: 12px; background: rgba(0,0,0,.45); color: #fff; font-size: 10px; padding: 2px 7px; border-radius: var(--r-full); }
.body { padding: var(--s-4) var(--s-5) var(--s-5); }
.body h3 { font-size: var(--fs-base); line-height: 1.5; margin-bottom: 6px; }
.body p { font-size: var(--fs-sm); line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { display: flex; align-items: center; gap: var(--s-3); margin-top: var(--s-3); }
.date { margin-left: auto; }

.skel-wrap .grid { margin-top: var(--s-4); }
.nohit { text-align: center; padding: var(--s-10); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--s-4); margin-top: var(--s-8); }

@media (max-width: 900px) {
  .page { padding: var(--s-5) var(--s-4) var(--s-10); }
  .page-head { flex-direction: column; align-items: stretch; }
  .search input { width: 100%; }
  .hero-item { grid-template-columns: 1fr; }
  .hero-cover { min-height: 180px; }
  .grid { grid-template-columns: 1fr; }
}
</style>
