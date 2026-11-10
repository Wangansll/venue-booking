<script setup lang="ts">
/** 票务后台：场次列表 + 新建场次（自动生成分区/座位/票档）+ 上下架 */
import { ref, onMounted } from 'vue'
import { token } from '../../api'

interface Sess {
  id: number; title: string; startAt: string; hall: string; status: string
  totalSeats: number; soldSeats: number; redeemed: number; revenueCents: number
}

const list = ref<Sess[]>([])
const loading = ref(true)
const error = ref('')
const toast = ref('')
const creating = ref(false)
const form = ref({ title: '', hall: '东区体育馆主馆', startAt: '', aPrice: 280, bPrice: 180, cPrice: 80 })

const STATUS_TEXT: Record<string, string> = {
  on_sale: '售票中', sold_out: '已售罄', finished: '已结束', cancelled: '已取消',
}

async function api<T>(m: string, p: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token.get(); if (t) headers.Authorization = `Bearer ${t}`
  const r = await fetch('/api' + p, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j || j.code !== 0) throw new Error(j?.msg || `请求失败 ${r.status}`)
  return j.data as T
}

async function load() {
  loading.value = true
  error.value = ''
  try { list.value = await api<Sess[]>('GET', '/admin/sessions') }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

function today() {
  const d = new Date(); d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10) + ' 19:30'
}

function openCreate() {
  form.value = { title: '', hall: '东区体育馆主馆', startAt: today(), aPrice: 280, bPrice: 180, cPrice: 80 }
  creating.value = true
  error.value = ''
}

async function create() {
  if (!form.value.title.trim()) { error.value = '请填写场次标题'; return }
  try {
    const d = await api<{ seatCount: number }>('POST', '/admin/sessions', {
      title: form.value.title,
      hall: form.value.hall,
      startAt: form.value.startAt,
      zones: [
        { name: 'A 区内场', color: '#3b6ef5', rows: 6, cols: 10, price: Math.round(form.value.aPrice * 100) },
        { name: 'B 区看台', color: '#8b5cf6', rows: 6, cols: 10, price: Math.round(form.value.bPrice * 100) },
        { name: 'C 区看台', color: '#0f9d58', rows: 6, cols: 10, price: Math.round(form.value.cPrice * 100) },
      ],
    })
    toast.value = `已创建，自动生成 ${d.seatCount} 个座位`
    creating.value = false
    await load()
    setTimeout(() => { toast.value = '' }, 2500)
  } catch (e) { error.value = e instanceof Error ? e.message : '创建失败' }
}

async function setStatus(s: Sess, status: string) {
  try {
    await api('POST', `/admin/sessions/${s.id}/status`, { status })
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}

function cny(c: number) { return (c / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) }
onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h1>场次管理</h1>
      <div class="grow"></div>
      <button class="btn btn-primary" @click="openCreate">+ 新建场次</button>
    </div>

    <p v-if="toast" class="ok">{{ toast }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted" style="padding:30px 0">加载中…</p>

    <div v-else class="card table">
      <div class="tr th">
        <span>场次</span><span>开场</span><span>售票</span><span>核销</span><span>收入</span><span>状态</span><span></span>
      </div>
      <div v-for="s in list" :key="s.id" class="tr">
        <span class="nm">{{ s.title }}<em>{{ s.hall }}</em></span>
        <span class="muted">{{ s.startAt.slice(0, 16) }}</span>
        <span><b>{{ s.soldSeats }}</b> / {{ s.totalSeats }}</span>
        <span>{{ s.redeemed }}</span>
        <span class="money">¥{{ cny(s.revenueCents) }}</span>
        <span class="pill" :class="s.status === 'on_sale' ? 'pill-ok' : ''">{{ STATUS_TEXT[s.status] ?? s.status }}</span>
        <span class="ops">
          <RouterLink :to="`/tickets/${s.id}`" class="btn btn-sm">看座位</RouterLink>
          <button class="btn btn-sm" @click="setStatus(s, s.status === 'finished' ? 'on_sale' : 'finished')">
            {{ s.status === 'finished' ? '重新开售' : '结束' }}
          </button>
        </span>
      </div>
    </div>

    <div v-if="creating" class="mask" @click.self="creating = false">
      <div class="modal card">
        <h3>新建场次</h3>
        <p class="muted" style="margin-bottom:16px">
          保存后会按「A/B/C 三区 × 6 排 × 10 座」自动生成 180 个座位和三档票价，无需改数据库。
        </p>
        <label class="fl"><span>场次标题 *</span><input class="input" v-model="form.title" maxlength="120" placeholder="例如：新年音乐会" /></label>
        <label class="fl"><span>场馆</span><input class="input" v-model="form.hall" maxlength="64" /></label>
        <label class="fl"><span>开场时间 *</span><input class="input" v-model="form.startAt" placeholder="2027-01-10 19:30" /></label>
        <div class="three">
          <label class="fl"><span>A 区内场（元）</span><input class="input" type="number" v-model.number="form.aPrice" /></label>
          <label class="fl"><span>B 区看台（元）</span><input class="input" type="number" v-model.number="form.bPrice" /></label>
          <label class="fl"><span>C 区看台（元）</span><input class="input" type="number" v-model.number="form.cPrice" /></label>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:12px">
          <button class="btn" @click="creating = false">取消</button>
          <button class="btn btn-primary" @click="create">创建并生成座位</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; margin-bottom: var(--s-4); }
.head h1 { font-size: var(--fs-xl); }
.ok { background: var(--ok-50); color: var(--ok-600); padding: 8px 14px; border-radius: var(--r-sm); font-size: var(--fs-sm); margin-bottom: var(--s-3); }
.table { padding: 0 var(--s-4); overflow-x: auto; }
.tr { display: grid; grid-template-columns: 1.6fr 1fr .7fr .5fr .8fr .7fr 150px; align-items: center; gap: var(--s-2); padding: 12px 0; border-bottom: 1px solid var(--line-soft); font-size: var(--fs-sm); }
.tr:last-child { border-bottom: 0; }
.th { color: var(--ink-400); font-size: var(--fs-xs); font-weight: 600; }
.nm { font-weight: 600; }
.nm em { display: block; font-style: normal; font-size: var(--fs-xs); color: var(--ink-400); }
.money { font-weight: 700; color: var(--err-600); }
.ops { display: flex; gap: 6px; justify-content: flex-end; }
.ops a { text-decoration: none; }
.mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 60; padding: var(--s-4); }
.modal { width: 560px; max-width: 96vw; padding: var(--s-6); }
.modal h3 { font-size: var(--fs-md); margin-bottom: 6px; }
.fl { display: block; margin-bottom: var(--s-3); }
.fl span { display: block; font-size: var(--fs-sm); color: var(--ink-500); margin-bottom: 5px; }
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-3); }
@media (max-width: 900px) { .tr { grid-template-columns: 1fr 1fr; } .th { display: none; } .three { grid-template-columns: 1fr; } }
</style>
