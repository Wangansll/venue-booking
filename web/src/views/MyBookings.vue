<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type Booking } from '../api'

const list = ref<Booking[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref<number | null>(null)

const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: '待审核', cls: 'warn' },
  approved: { text: '已通过', cls: 'ok' },
  rejected: { text: '已驳回', cls: 'err' },
  cancelled: { text: '已取消', cls: 'dim' },
}

async function load() {
  loading.value = true
  error.value = ''
  try { list.value = await api.mine() }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败' }
  finally { loading.value = false }
}

async function cancel(b: Booking) {
  busy.value = b.id
  error.value = ''
  try { await api.cancel(b.id); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '取消失败' }
  finally { busy.value = null }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="row bar">
      <h2>我的预约</h2>
      <div class="grow"></div>
      <button @click="load">刷新</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="empty">加载中…</p>
    <p v-else-if="!list.length" class="empty">还没有预约，去场馆页约一个</p>

    <div class="card list" v-else>
      <div v-for="b in list" :key="b.id" class="row item">
        <div class="grow">
          <div class="row">
            <strong>{{ b.venueName }}</strong>
            <span class="pill" :class="STATUS[b.status]?.cls">{{ STATUS[b.status]?.text ?? b.status }}</span>
          </div>
          <p class="muted">{{ b.date }}　{{ b.slotText }}　·　{{ b.location }}</p>
        </div>
        <button
          v-if="b.status === 'pending' || b.status === 'approved'"
          :disabled="busy === b.id"
          @click="cancel(b)"
        >{{ busy === b.id ? '取消中…' : '取消' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar { margin-bottom: 16px; }
h2 { margin: 0; font-size: 18px; }
.list { padding: 4px 16px; }
.item { padding: 12px 0; border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: 0; }
.item p { margin: 2px 0 0; }
.pill { font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.pill.warn { background: #fffbeb; color: var(--warn); }
.pill.ok { background: #f0fdf4; color: var(--ok); }
.pill.err { background: #fef2f2; color: var(--err); }
.pill.dim { background: #f3f4f6; color: var(--dim); }
</style>
