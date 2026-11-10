<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { token } from '../api'

interface Ticket {
  id: number; orderId: number; code: string; status: string
  title: string; startAt: string; hall: string
  areaName: string; rowNo: number; seatNo: number
}

const list = ref<Ticket[]>([])
const loading = ref(true)
const error = ref('')
const toast = ref('')
const busy = ref<number | null>(null)
/**
 * 二维码：接口需要 Authorization，而 <img> 发不了请求头，
 * 所以用 fetch 拿 SVG 再转成 blob URL。卸载时释放，避免内存泄漏。
 */
const qrMap = ref<Record<string, string>>({})
const qrFailed = ref<Record<string, boolean>>({})
const blobUrls: string[] = []

async function loadQr(code: string) {
  try {
    const r = await fetch(`/api/tickets/${code}/qr.svg`, {
      headers: { Authorization: 'Bearer ' + token.get() },
    })
    if (!r.ok) throw new Error(String(r.status))
    const url = URL.createObjectURL(await r.blob())
    blobUrls.push(url)
    qrMap.value = { ...qrMap.value, [code]: url }
  } catch {
    qrFailed.value = { ...qrFailed.value, [code]: true }
  }
}

function releaseQr() {
  for (const u of blobUrls.splice(0)) URL.revokeObjectURL(u)
  qrMap.value = {}
}

const STATUS: Record<string, string> = { valid: '待入场', used: '已核销', refunded: '已退款' }

/** 开场前 24 小时才可退，与后端规则一致；前端只做提示，真正拦截在后端 */
function canRefund(t: Ticket) {
  if (t.status !== 'valid') return false
  return (new Date(t.startAt).getTime() - Date.now()) > 24 * 3600_000
}

const refundableCount = computed(() => list.value.filter(canRefund).length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await fetch('/api/tickets/mine', { headers: { Authorization: 'Bearer ' + token.get() } })
    const j = await r.json()
    if (j.code !== 0) throw new Error(j.msg)
    list.value = j.data
    releaseQr()
    for (const t of list.value) {
      if (t.status === 'valid') void loadQr(t.code)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function refund(t: Ticket) {
  if (!confirm(`退掉「${t.title}」${t.areaName}${t.rowNo}排${t.seatNo}号的这张票？\n开场前 24 小时可全额退款。`)) return
  busy.value = t.id
  toast.value = ''
  error.value = ''
  try {
    const r = await fetch(`/api/orders/${t.orderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.get() },
      body: '{}',
    })
    const j = await r.json()
    if (!r.ok || j.code !== 0) throw new Error(j.msg)
    toast.value = '退票成功，座位已释放，退款 3 个工作日内到账'
    await load()
    setTimeout(() => { toast.value = '' }, 4000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '退票失败'
  } finally {
    busy.value = null
  }
}

onMounted(load)
onUnmounted(releaseQr)
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>我的票夹</h1>
        <p class="muted">
          入场时出示二维码
          <template v-if="refundableCount"> · {{ refundableCount }} 张可退</template>
        </p>
      </div>
      <div class="grow"></div>
      <RouterLink to="/tickets" class="btn btn-sm">再去买票</RouterLink>
    </header>

    <p v-if="toast" class="toast ok">{{ toast }}</p>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">加载中…</p>

    <div v-else-if="!list.length" class="card">
      <div class="empty">
        <div class="empty-ico">🎫</div>
        <div>还没有票，去<RouterLink to="/tickets">活动购票</RouterLink></div>
      </div>
    </div>

    <div v-else class="list">
      <div v-for="t in list" :key="t.id" class="card ticket" :class="{ off: t.status !== 'valid' }">
        <div class="left">
          <div class="t-title">{{ t.title }}</div>
          <p class="muted">{{ t.startAt.slice(0, 16) }} · {{ t.hall }}</p>
          <p class="seat">{{ t.areaName }} {{ t.rowNo }} 排 {{ t.seatNo }} 号</p>
        </div>

        <div class="right">
          <img
            v-if="t.status === 'valid' && qrMap[t.code]"
            class="qr"
            :src="qrMap[t.code]"
            :alt="`票码 ${t.code} 的二维码`"
            width="104" height="104"
          />
          <div v-else-if="t.status === 'valid'" class="qr qr-loading">
            {{ qrFailed[t.code] ? '二维码加载失败' : '生成中…' }}
          </div>
          <div v-else class="void">已失效</div>

          <div class="code">{{ t.code }}</div>
          <span class="pill" :class="t.status === 'valid' ? 'pill-ok' : ''">{{ STATUS[t.status] ?? t.status }}</span>

          <button
            v-if="canRefund(t)"
            class="btn btn-sm refund"
            :disabled="busy === t.id"
            @click="refund(t)"
          >{{ busy === t.id ? '退票中…' : '退票' }}</button>
          <p v-else-if="t.status === 'valid'" class="muted tiny">开场前 24 小时内不可退</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; margin: 0 auto; padding: var(--s-8) var(--s-6); }
.head { display: flex; align-items: flex-start; margin-bottom: var(--s-5); }
.head h1 { font-size: var(--fs-xl); margin-bottom: 2px; }
.list { display: flex; flex-direction: column; gap: var(--s-3); }

.ticket { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-5); position: relative; }
.ticket::before {
  content: ""; position: absolute; left: -1px; top: 12px; bottom: 12px; width: 3px;
  background: var(--brand-500); border-radius: 2px;
}
.ticket.off { opacity: .62; }
.ticket.off::before { background: var(--ink-300); }

.left { flex: 1; min-width: 0; }
.t-title { font-weight: 700; font-size: var(--fs-md); }
.seat { font-size: var(--fs-sm); color: var(--ink-700); margin-top: 4px; }

.right { text-align: right; flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.qr {
  width: 104px; height: 104px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: #fff; padding: 4px;
}
.qr-loading {
  display: grid; place-items: center; text-align: center;
  font-size: 10.5px; color: var(--ink-300); line-height: 1.4;
}
.void {
  width: 104px; height: 104px; border: 1px dashed var(--line); border-radius: var(--r-sm);
  display: grid; place-items: center; font-size: var(--fs-xs); color: var(--ink-300);
  background: var(--line-soft);
}
.code { font-family: ui-monospace, Consolas, monospace; font-size: var(--fs-sm); font-weight: 700; letter-spacing: .08em; color: var(--ink-900); }
.refund { margin-top: 2px; }
.tiny { font-size: var(--fs-xs); color: var(--ink-300); }

.toast { background: var(--ok-50); color: var(--ok-600); padding: 10px 14px; border-radius: var(--r-md); font-size: var(--fs-sm); margin-bottom: var(--s-4); }

@media (max-width: 900px) {
  .page { padding: var(--s-6) var(--s-4); }
  .ticket { flex-direction: column; align-items: flex-start; }
  .right { align-items: flex-start; text-align: left; }
}
</style>
