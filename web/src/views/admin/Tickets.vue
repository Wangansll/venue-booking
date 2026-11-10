<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { token } from '../../api'

interface Session { id: number; title: string; startAt: string; hall: string; soldSeats: number }

const sessions = ref<Session[]>([])
const code = ref('')
const scanning = ref(false)
const scanMsg = ref('')
let stream: MediaStream | null = null
let raf = 0
const video = ref<HTMLVideoElement | null>(null)

/** 浏览器原生条码识别：Edge/Chrome 支持；不支持时降级为手输 */
const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window

async function startScan() {
  if (!canScan) { scanMsg.value = '当前浏览器不支持摄像头扫码，请手动输入'; return }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    scanning.value = true
    scanMsg.value = '把二维码对准摄像头'
    await nextTick()
    if (video.value) { video.value.srcObject = stream; await video.value.play() }
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    const detector = new Detector({ formats: ['qr_code'] })
    const loop = async () => {
      if (!scanning.value || !video.value) return
      try {
        const found = await detector.detect(video.value)
        if (found.length) {
          code.value = found[0].rawValue.trim().toUpperCase().slice(0, 12)
          stopScan()
          await redeem()
          return
        }
      } catch { /* 识别失败继续下一帧 */ }
      raf = requestAnimationFrame(() => { void loop() })
    }
    void loop()
  } catch (e) {
    scanMsg.value = '无法打开摄像头：' + (e instanceof Error ? e.message : '未知错误')
    scanning.value = false
  }
}

function stopScan() {
  scanning.value = false
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}
const msg = ref('')
const error = ref('')
const busy = ref(false)

async function api<T>(m: string, p: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token.get(); if (t) headers.Authorization = `Bearer ${t}`
  const r = await fetch('/api' + p, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j || j.code !== 0) throw new Error(j?.msg || `请求失败 ${r.status}`)
  return j.data as T
}

async function load() {
  try { sessions.value = await api<Session[]>('GET', '/sessions') } catch { /* ignore */ }
}

async function redeem() {
  if (!code.value.trim()) return
  busy.value = true; msg.value = ''; error.value = ''
  try {
    await api('POST', '/admin/tickets/redeem', { code: code.value.trim().toUpperCase() })
    msg.value = '核销成功'
    code.value = ''
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '核销失败' }
  finally { busy.value = false }
}

onMounted(load)
onUnmounted(stopScan)
</script>

<template>
  <div>
    <div class="head"><h1>票务核销</h1><p class="muted">输入观众出示的核销码</p></div>

    <div class="card redeem">
      <input class="input mono" v-model="code" placeholder="输入核销码，或点右侧扫码"
             maxlength="12" @keyup.enter="redeem" />
      <button class="btn" :disabled="scanning" @click="scanning ? stopScan() : startScan()">
        {{ scanning ? '停止扫码' : '扫码' }}
      </button>
      <button class="btn btn-primary" :disabled="busy || !code.trim()" @click="redeem">
        {{ busy ? '核销中…' : '核销' }}
      </button>
    </div>

    <div v-if="scanning" class="card scanner">
      <video ref="video" playsinline muted></video>
      <p class="muted">{{ scanMsg }}</p>
    </div>
    <p v-else-if="scanMsg" class="muted" style="margin-bottom:12px">{{ scanMsg }}</p>
    <p v-if="msg" class="ok">{{ msg }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <div class="card table">
      <div class="table-head"><b>场次售票情况</b></div>
      <div v-for="s in sessions" :key="s.id" class="row-item">
        <b class="grow">{{ s.title }}</b>
        <span class="muted">{{ s.startAt.slice(0, 16) }}</span>
        <span class="pill pill-brand">已售 {{ s.soldSeats }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { margin-bottom: var(--s-5); }
.head h1 { font-size: var(--fs-xl); margin-bottom: 4px; }
.redeem { display: flex; gap: var(--s-3); padding: var(--s-5); margin-bottom: var(--s-3); }
.scanner { padding: var(--s-3); margin-bottom: var(--s-3); text-align: center; }
.scanner video { width: 100%; max-width: 420px; border-radius: var(--r-md); background: #000; }
.mono { font-family: ui-monospace, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
.ok { color: var(--ok-600); font-size: var(--fs-sm); margin-bottom: var(--s-3); }
.table { padding: 0 var(--s-5); }
.table-head { padding: var(--s-4) 0; border-bottom: 1px solid var(--line-soft); }
.row-item { display: flex; align-items: center; gap: var(--s-4); padding: 12px 0; border-bottom: 1px solid var(--line-soft); font-size: var(--fs-sm); }
.row-item:last-child { border-bottom: 0; }
</style>
