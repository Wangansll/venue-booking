<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api, type Booking } from '../api'

const status = ref<'pending' | 'approved' | 'rejected'>('pending')
const page = ref(1)
const size = 10
const total = ref(0)
const list = ref<Booking[]>([])
const loading = ref(false)
const error = ref('')
const busy = ref<number | null>(null)

const pages = computed(() => Math.max(1, Math.ceil(total.value / size)))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.adminList(status.value, page.value, size)
    list.value = r.list
    total.value = r.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function review(b: Booking, action: 'approve' | 'reject') {
  busy.value = b.id
  error.value = ''
  try {
    await api.review(b.id, action)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = null
  }
}

function switchTab(s: typeof status.value) {
  status.value = s
  page.value = 1
  load()
}

function go(p: number) {
  if (p < 1 || p > pages.value) return
  page.value = p
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="row bar">
      <h2>预约审核</h2>
      <div class="grow"></div>
      <div class="tabs">
        <button :class="{ on: status === 'pending' }" @click="switchTab('pending')">待审核</button>
        <button :class="{ on: status === 'approved' }" @click="switchTab('approved')">已通过</button>
        <button :class="{ on: status === 'rejected' }" @click="switchTab('rejected')">已驳回</button>
      </div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="empty">加载中…</p>
    <p v-else-if="!list.length" class="empty">没有记录</p>

    <div class="card list" v-else>
      <div v-for="b in list" :key="b.id" class="row item">
        <div class="grow">
          <div><strong>{{ b.userName }}</strong> 预约 <strong>{{ b.venueName }}</strong></div>
          <p class="muted">{{ b.date }}　{{ b.slotText }}　·　提交于 {{ b.created_at }}</p>
        </div>
        <template v-if="status === 'pending'">
          <button :disabled="busy === b.id" @click="review(b, 'reject')">驳回</button>
          <button class="primary" :disabled="busy === b.id" @click="review(b, 'approve')">通过</button>
        </template>
      </div>
    </div>

    <div class="row pager" v-if="total > size">
      <button :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <span class="muted">{{ page }} / {{ pages }}　共 {{ total }} 条</span>
      <button :disabled="page >= pages" @click="go(page + 1)">下一页</button>
    </div>
  </div>
</template>

<style scoped>
.bar { margin-bottom: 16px; }
h2 { margin: 0; font-size: 18px; }
.tabs { display: flex; gap: 6px; }
.tabs button.on { background: var(--pri); border-color: var(--pri); color: #fff; }
.list { padding: 4px 16px; }
.item { padding: 12px 0; border-bottom: 1px solid var(--line); }
.item:last-child { border-bottom: 0; }
.item p { margin: 2px 0 0; }
.pager { justify-content: center; margin-top: 16px; }
</style>
