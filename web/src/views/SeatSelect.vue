<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { token } from '../api'

interface Seat { id: number; areaId: number; rowNo: number; seatNo: number; state: 'free' | 'sold' | 'locked' | 'mine' }
interface Area { id: number; name: string; color: string; rowCount: number; colCount: number; priceCents: number }

const route = useRoute()
const router = useRouter()
const sid = Number(route.params.id)

const areas = ref<Area[]>([])
const seats = ref<Seat[]>([])
const title = ref('')
const loading = ref(true)
const error = ref('')
const picked = ref<number[]>([])
const locking = ref(false)
const countdown = ref(0)
const result = ref<{ ok: boolean; msg: string } | null>(null)
let timer = 0
let poll = 0
const POLL_MS = 10000          // 库存轮询间隔

const byArea = computed(() => areas.value.map(a => ({
  area: a,
  rows: Array.from({ length: a.rowCount }, (_, r) =>
    seats.value.filter(s => s.areaId === a.id && s.rowNo === r + 1).sort((x, y) => x.seatNo - y.seatNo)),
})))

const total = computed(() =>
  picked.value.reduce((sum, id) => {
    const s = seats.value.find(x => x.id === id)
    const a = areas.value.find(x => x.id === s?.areaId)
    return sum + (a?.priceCents ?? 0)
  }, 0))

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
  try {
    const d = await api<{
      session: { title: string }; areas: Area[]; seats: Seat[]
      lockMinutes: number; myLockExpireAt: string | null
    }>('GET', `/sessions/${sid}/seats`)
    title.value = d.session.title; areas.value = d.areas; seats.value = d.seats
    // 刷新页面后按服务端的锁到期时间恢复倒计时，而不是归零
    if (d.myLockExpireAt) {
      const left = Math.max(0, Math.round((new Date(d.myLockExpireAt).getTime() - Date.now()) / 1000))
      countdown.value = left
      const mine = d.seats.filter((x) => x.state === 'mine').map((x) => x.id)
      if (left > 0 && mine.length) picked.value = mine
    } else {
      countdown.value = 0
    }
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

function toggle(s: Seat) {
  if (s.state === 'sold' || s.state === 'locked') return
  if (s.state === 'mine') { picked.value = picked.value.filter(id => id !== s.id); return }
  if (picked.value.includes(s.id)) picked.value = picked.value.filter(id => id !== s.id)
  else if (picked.value.length < 6) picked.value.push(s.id)
}

function tick() {
  if (countdown.value <= 0) return
  countdown.value -= 1
}

async function lockAndPay() {
  if (!picked.value.length) { error.value = '请先选择座位'; return }
  locking.value = true; error.value = ''
  try {
    await api('POST', `/sessions/${sid}/lock`, { seatIds: picked.value })
    countdown.value = lockMinutes.value * 60
    const o = await api<{ orderId: number; amount: number }>('POST', '/orders', { sessionId: sid, seatIds: picked.value })
    const p = await api<{ tickets: number }>('POST', `/orders/${o.orderId}/pay`, {})
    result.value = { ok: true, msg: `支付成功，已生成 ${p.tickets} 张电子票（订单 ¥${(o.amount / 100).toFixed(0)}）` }
    picked.value = []
    countdown.value = 0
    await load()
    setTimeout(() => router.push('/my/tickets'), 1200)
  } catch (e) { error.value = e instanceof Error ? e.message : '下单失败' }
  finally { locking.value = false }
}

const lockMinutes = ref(15)

onMounted(async () => {
  await load()
  timer = window.setInterval(tick, 1000)
  // 每 10 秒刷新一次座位状态；页面不可见时跳过，省流量
  poll = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !locking.value) load()
  }, POLL_MS)
})
onUnmounted(() => { clearInterval(timer); clearInterval(poll) })
</script>

<template>
  <div class="page">
    <header class="head">
      <button class="btn btn-sm btn-ghost" @click="router.back()">← 返回</button>
      <div>
        <h1>{{ title || '选座' }}</h1>
        <p class="muted">点座位选择，最多 6 个</p>
      </div>
    </header>

    <p v-if="error" class="err">{{ error }}</p>
    <div v-if="result" class="result" :class="{ ok: result.ok }">{{ result.msg }}</div>
    <p v-if="loading" class="muted">加载中…</p>

    <template v-else>
      <div class="stage">舞台 / 主场地</div>

      <div v-for="g in byArea" :key="g.area.id" class="area">
        <div class="area-head">
          <span class="dot" :style="{ background: g.area.color }"></span>
          <b>{{ g.area.name }}</b>
          <span class="muted">¥{{ (g.area.priceCents / 100).toFixed(0) }} / 座</span>
        </div>
        <div v-for="(row, ri) in g.rows" :key="ri" class="seat-row">
          <span class="rownum">{{ ri + 1 }}</span>
          <button
            v-for="s in row"
            :key="s.id"
            class="seat"
            :class="[s.state, { on: picked.includes(s.id) }]"
            :style="picked.includes(s.id) ? { background: g.area.color, borderColor: g.area.color } : {}"
            :disabled="s.state === 'sold' || s.state === 'locked'"
            :title="`${g.area.name} ${s.rowNo}排${s.seatNo}号`"
            @click="toggle(s)"
          ></button>
        </div>
      </div>

      <div class="legend">
        <span><i class="lg free"></i>可选</span>
        <span><i class="lg on"></i>已选</span>
        <span><i class="lg locked"></i>他人保留</span>
        <span><i class="lg sold"></i>已售</span>
      </div>

      <div class="bar">
        <div class="bar-info">
          <b v-if="picked.length">已选 {{ picked.length }} 座</b>
          <b v-else>未选座</b>
          <span v-if="countdown > 0" class="cd">保留 {{ Math.floor(countdown / 60) }}:{{ String(countdown % 60).padStart(2, '0') }}</span>
        </div>
        <div class="grow"></div>
        <span class="total">合计 ¥{{ (total / 100).toFixed(0) }}</span>
        <button class="btn btn-primary" :disabled="!picked.length || locking" @click="lockAndPay">
          {{ locking ? '处理中…' : '锁定并支付' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: var(--shell-max); margin: 0 auto; padding: var(--s-8) var(--s-6) var(--s-8); }
.head { display: flex; align-items: center; gap: var(--s-4); margin-bottom: var(--s-5); }
.head h1 { font-size: var(--fs-xl); }
.stage {
  margin: 0 auto var(--s-6); max-width: 460px; height: 34px;
  border-radius: 0 0 40px 40px; background: var(--ink-900); color: #fff;
  display: grid; place-items: center; font-size: var(--fs-xs); letter-spacing: .3em;
}
.area { width: fit-content; max-width: 100%; margin: 0 auto var(--s-5); display: flex; flex-direction: column; align-items: center; }
.area-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: var(--fs-sm); align-self: flex-start; }
.dot { width: 10px; height: 10px; border-radius: 3px; }
.seat-row { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; width: 100%; justify-content: center; }
.rownum { width: 18px; font-size: 10px; color: var(--ink-300); text-align: right; margin-right: 4px; }
.seat {
  width: 22px; height: 20px; border-radius: 4px 4px 3px 3px;
  border: 1px solid var(--line); background: #fff; cursor: pointer; padding: 0;
  transition: transform .1s var(--ease), background .12s;
}
.seat:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--brand-500); }
.seat.locked { background: var(--warn-50); border-color: #f3ddb0; cursor: not-allowed; }
.seat.sold { background: var(--line-soft); border-color: var(--line); cursor: not-allowed; opacity: .55; }
.seat.on { border-width: 0; }
.legend { display: flex; justify-content: center; gap: var(--s-5); font-size: var(--fs-xs); color: var(--ink-400); margin: var(--s-5) 0; }
.legend span { display: flex; align-items: center; gap: 6px; }
.lg { width: 14px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid var(--line); }
.lg.free { background: #fff; }
.lg.on { background: var(--brand-500); border-color: var(--brand-500); }
.lg.locked { background: var(--warn-50); border-color: #f3ddb0; }
.lg.sold { background: var(--line-soft); opacity: .6; }

.bar {
  position: sticky; bottom: 0; z-index: 30;
  display: flex; align-items: center; gap: var(--s-4);
  margin: var(--s-5) calc(-1 * var(--s-6)) 0;
  padding: 14px var(--s-6);
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(12px); border-top: 1px solid var(--line);
  box-shadow: 0 -4px 18px rgba(15,21,35,.06);
}
.bar-info { display: flex; flex-direction: column; }
.cd { font-size: var(--fs-xs); color: var(--err-600); }
.total { font-size: var(--fs-lg); font-weight: 700; color: var(--err-600); }
@media (max-width: 900px) {
  .seat { width: 18px; height: 16px; }
  .page { padding: var(--s-4) var(--s-2) var(--s-4); }
  .bar { margin-left: calc(-1 * var(--s-2)); margin-right: calc(-1 * var(--s-2)); }
}
</style>
