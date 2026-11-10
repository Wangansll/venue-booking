<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { contentApi, type Article } from '../../api-content'
import RichEditor from './RichEditor.vue'

const type = ref<'news' | 'event'>('news')
const status = ref<'published' | 'draft'>('published')
const page = ref(1)
const size = 10
const total = ref(0)
const list = ref<Article[]>([])
const loading = ref(false)
const error = ref('')
const editing = ref<Partial<Article> | null>(null)
const saving = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await contentApi.adminList(type.value, status.value, page.value, size)
    list.value = r.list
    total.value = r.total
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

function createNew() {
  editing.value = {
    title: '', summary: '', content: '',
    cover: type.value === 'event' ? '/img/event_1.svg' : '/img/news_1.svg',
    eventStart: '', eventEnd: '', eventPlace: '',
  }
}

async function save() {
  if (!editing.value?.title) { error.value = '标题不能为空'; return }
  saving.value = true
  error.value = ''
  try {
    const body = { ...editing.value, type: type.value }
    delete (body as any).id
    if (editing.value.id) await contentApi.update(editing.value.id, body)
    else await contentApi.create(body)
    editing.value = null
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' }
  finally { saving.value = false }
}

async function toggle(a: Article) {
  try {
    await contentApi.publish(a.id, a.status === 'draft')
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}

async function remove(a: Article) {
  if (!confirm(`删除「${a.title}」？`)) return
  try { await contentApi.remove(a.id); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '删除失败' }
}

const pages = () => Math.max(1, Math.ceil(total.value / size))
function go(p: number) { if (p >= 1 && p <= pages()) { page.value = p; load() } }

watch([type, status], () => { page.value = 1; load() })
onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h1>内容管理</h1>
      <div class="grow"></div>
      <button class="btn btn-primary" @click="createNew">+ 新建{{ type === 'news' ? '新闻' : '活动' }}</button>
    </div>

    <div class="tabs">
      <button class="tab" :class="{ on: type === 'news' }" @click="type = 'news'">新闻</button>
      <button class="tab" :class="{ on: type === 'event' }" @click="type = 'event'">活动</button>
      <span class="sep"></span>
      <button class="tab" :class="{ on: status === 'published' }" @click="status = 'published'">已发布</button>
      <button class="tab" :class="{ on: status === 'draft' }" @click="status = 'draft'">草稿</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted" style="padding:30px 0">加载中…</p>

    <div v-else-if="!list.length" class="card"><div class="empty"><div class="empty-ico">◧</div><div>还没有内容</div></div></div>

    <div v-else class="card list">
      <div v-for="a in list" :key="a.id" class="row">
        <div class="cover" :style="{ backgroundImage: `url(${a.cover})` }"></div>
        <div class="grow">
          <b>{{ a.title }}</b>
          <p class="muted">{{ a.summary }}</p>
          <p class="muted tiny">更新于 {{ (a.updatedAt || '').slice(0, 16) }}</p>
        </div>
        <span class="pill" :class="a.status === 'published' ? 'pill-ok' : ''">{{ a.status === 'published' ? '已发布' : '草稿' }}</span>
        <button class="btn btn-sm" @click="toggle(a)">{{ a.status === 'draft' ? '发布' : '转草稿' }}</button>
        <button class="btn btn-sm" @click="editing = { ...a }">编辑</button>
        <button class="btn btn-sm" @click="remove(a)">删除</button>
      </div>
    </div>

    <div v-if="total > size" class="pager">
      <button class="btn btn-sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <span class="muted">{{ page }} / {{ pages() }}　共 {{ total }} 条</span>
      <button class="btn btn-sm" :disabled="page >= pages()" @click="go(page + 1)">下一页</button>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="editing" class="mask" @click.self="editing = null">
      <div class="modal card">
        <h3>{{ editing.id ? '编辑' : '新建' }}{{ type === 'news' ? '新闻' : '活动' }}</h3>
        <label class="fl"><span>标题 *</span><input class="input" v-model="editing.title" maxlength="120" /></label>
        <label class="fl"><span>摘要</span><input class="input" v-model="editing.summary" maxlength="300" /></label>
        <label class="fl"><span>封面图路径</span><input class="input" v-model="editing.cover" placeholder="/img/news_1.svg" /></label>
        <template v-if="type === 'event'">
          <div class="two">
            <label class="fl"><span>开始</span><input class="input" v-model="editing.eventStart" placeholder="2026-12-01 09:00:00" /></label>
            <label class="fl"><span>结束</span><input class="input" v-model="editing.eventEnd" placeholder="2026-12-01 18:00:00" /></label>
          </div>
          <label class="fl"><span>地点</span><input class="input" v-model="editing.eventPlace" /></label>
        </template>
        <label class="fl"><span>正文（支持 HTML）</span><RichEditor v-model="editing.content as string" /></label>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn" @click="editing = null">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; margin-bottom: var(--s-4); }
.head h1 { font-size: var(--fs-xl); }
.tabs { display: flex; align-items: center; gap: 6px; margin-bottom: var(--s-4); }
.tab { height: 32px; padding: 0 14px; font-size: var(--fs-sm); border: 1px solid var(--line); background: #fff; border-radius: var(--r-full); cursor: pointer; }
.tab.on { background: var(--brand-500); border-color: var(--brand-500); color: #fff; font-weight: 600; }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 8px; }
.list { padding: 0 var(--s-4); }
.row { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-3) 0; border-bottom: 1px solid var(--line-soft); }
.row:last-child { border-bottom: 0; }
.cover { width: 76px; height: 48px; border-radius: var(--r-sm); background-size: cover; background-position: center; flex: 0 0 auto; }
.row b { font-size: var(--fs-sm); }
.row p { margin: 0; font-size: var(--fs-xs); }
.tiny { color: var(--ink-300); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--s-4); margin-top: var(--s-5); }
.mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 60; padding: var(--s-4); }
.modal { width: 620px; max-width: 96vw; max-height: 90vh; overflow: auto; padding: var(--s-6); }
.modal h3 { font-size: var(--fs-md); margin-bottom: var(--s-4); }
.fl { display: block; margin-bottom: var(--s-3); }
.fl span { display: block; font-size: var(--fs-sm); color: var(--ink-500); margin-bottom: 5px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.area { height: auto; padding: 10px 12px; line-height: 1.6; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; }
@media (max-width: 900px) { .row { flex-wrap: wrap; } }
</style>
