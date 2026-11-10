<script setup lang="ts">
/** 场馆管理：列表 + 编辑弹窗（接 /admin/venues 增删改） */
import { ref, onMounted } from 'vue'
import { api, type Venue } from '../../api'
import { contentApi } from '../../api-content'
import { token } from '../../api'

const list = ref<Venue[]>([])
const loading = ref(true)
const error = ref('')
const toast = ref('')
const editing = ref<Partial<Venue> | null>(null)
const saving = ref(false)

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  const r = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j || j.code !== 0) throw new Error(j?.msg || `请求失败 ${r.status}`)
  return j.data as T
}

async function load() {
  loading.value = true
  error.value = ''
  try { list.value = await api.venues() } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

function create() {
  editing.value = { name: '', type: '篮球场', location: '', capacity: 10, open_slot: 1, close_slot: 8 }
}
function edit(v: Venue) { editing.value = { ...v } }

async function save() {
  if (!editing.value?.name || !editing.value?.location) { error.value = '名称和位置不能为空'; return }
  saving.value = true; error.value = ''
  try {
    const body = { ...editing.value, status: 1 }
    if (editing.value.id) await req('PUT', `/admin/venues/${editing.value.id}`, body)
    else await req('POST', '/admin/venues', body)
    editing.value = null
    toast.value = '已保存'
    await load()
    setTimeout(() => { toast.value = '' }, 2200)
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' }
  finally { saving.value = false }
}

async function remove(v: Venue) {
  if (!confirm(`删除「${v.name}」？有预约记录的场馆会改为下架。`)) return
  try {
    await req('DELETE', `/admin/venues/${v.id}`)
    toast.value = '已处理'
    await load()
    setTimeout(() => { toast.value = '' }, 2200)
  } catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h1>场馆管理</h1>
      <div class="grow"></div>
      <button class="btn btn-primary" @click="create">+ 新建场馆</button>
    </div>

    <p v-if="toast" class="toast">{{ toast }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted" style="padding:30px 0">加载中…</p>

    <div v-else class="card table">
      <div class="tr th">
        <span>名称</span><span>类型</span><span>位置</span><span>容量</span><span>时段</span><span></span>
      </div>
      <div v-for="v in list" :key="v.id" class="tr">
        <span class="nm">{{ v.name }}</span>
        <span><span class="pill pill-brand">{{ v.type }}</span></span>
        <span class="muted">{{ v.location }}</span>
        <span>{{ v.capacity }} 人</span>
        <span class="muted">{{ v.open_slot }}–{{ v.close_slot }} 段</span>
        <span class="ops">
          <button class="btn btn-sm" @click="edit(v)">编辑</button>
          <button class="btn btn-sm" @click="remove(v)">删除</button>
        </span>
      </div>
      <div v-if="!list.length" class="empty"><div class="empty-ico">◧</div><div>还没有场馆</div></div>
    </div>

    <div v-if="editing" class="mask" @click.self="editing = null">
      <div class="modal card">
        <h3>{{ editing.id ? '编辑场馆' : '新建场馆' }}</h3>
        <label class="fl"><span>名称 *</span><input class="input" v-model="editing.name" maxlength="64" /></label>
        <div class="two">
          <label class="fl"><span>类型</span>
            <select class="input" v-model="editing.type">
              <option>篮球场</option><option>羽毛球</option><option>自习室</option><option>网球场</option>
            </select>
          </label>
          <label class="fl"><span>容量（人）</span><input class="input" type="number" v-model.number="editing.capacity" /></label>
        </div>
        <label class="fl"><span>位置 *</span><input class="input" v-model="editing.location" maxlength="64" /></label>
        <div class="two">
          <label class="fl"><span>开放起始段</span><input class="input" type="number" min="1" max="8" v-model.number="editing.open_slot" /></label>
          <label class="fl"><span>开放结束段</span><input class="input" type="number" min="1" max="8" v-model.number="editing.close_slot" /></label>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:10px">
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
.toast { background: var(--ok-50); color: var(--ok-600); padding: 8px 14px; border-radius: var(--r-sm); font-size: var(--fs-sm); margin-bottom: var(--s-3); }
.table { padding: 0 var(--s-4); }
.tr { display: grid; grid-template-columns: 1.4fr .8fr 1.2fr .6fr .8fr 120px; align-items: center; gap: var(--s-3); padding: 11px 0; border-bottom: 1px solid var(--line-soft); font-size: var(--fs-sm); }
.tr:last-child { border-bottom: 0; }
.th { color: var(--ink-400); font-size: var(--fs-xs); font-weight: 600; }
.nm { font-weight: 600; }
.ops { display: flex; gap: 6px; justify-content: flex-end; }
.mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 60; padding: var(--s-4); }
.modal { width: 520px; max-width: 96vw; padding: var(--s-6); }
.modal h3 { font-size: var(--fs-md); margin-bottom: var(--s-4); }
.fl { display: block; margin-bottom: var(--s-3); }
.fl span { display: block; font-size: var(--fs-sm); color: var(--ink-500); margin-bottom: 5px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
@media (max-width: 900px) { .tr { grid-template-columns: 1fr 1fr; } .th { display: none; } }
</style>
