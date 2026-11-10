<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { contentApi, type Message } from '../../api-content'

const list = ref<Message[]>([])
const total = ref(0)
const unread = ref(0)
const loading = ref(true)
const page = ref(1)
const size = 10

async function load() {
  loading.value = true
  try {
    const r = await contentApi.messages(page.value, size)
    list.value = r.list; total.value = r.total; unread.value = r.unread
  } catch { /* ignore */ }
  loading.value = false
}

async function read(m: Message) {
  await contentApi.readMessage(m.id)
  await load()
}
const pages = () => Math.max(1, Math.ceil(total.value / size))
function go(p: number) { if (p >= 1 && p <= pages()) { page.value = p; load() } }

onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h1>留言</h1>
      <span v-if="unread" class="pill pill-err">{{ unread }} 条未读</span>
      <div class="grow"></div>
      <button class="btn btn-sm" @click="load">刷新</button>
    </div>

    <p v-if="loading" class="muted">加载中…</p>
    <div v-else-if="!list.length" class="card"><div class="empty"><div class="empty-ico">✉</div><div>还没有留言</div></div></div>

    <div v-else class="list">
      <div v-for="m in list" :key="m.id" class="card msg" :class="{ unread: !m.isRead }">
        <div class="row">
          <b>{{ m.name }}</b>
          <span class="muted">{{ m.phone }}</span>
          <span v-if="m.email" class="muted">{{ m.email }}</span>
          <div class="grow"></div>
          <span class="muted tiny">{{ m.createdAt?.slice(0, 16) }}</span>
          <button v-if="!m.isRead" class="btn btn-sm" @click="read(m)">标记已读</button>
          <span v-else class="pill pill-ok">已读</span>
        </div>
        <p class="content">{{ m.content }}</p>
      </div>
    </div>

    <div v-if="total > size" class="pager">
      <button class="btn btn-sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <span class="muted">{{ page }} / {{ pages() }}</span>
      <button class="btn btn-sm" :disabled="page >= pages()" @click="go(page + 1)">下一页</button>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-5); }
.head h1 { font-size: var(--fs-xl); }
.list { display: flex; flex-direction: column; gap: var(--s-3); }
.msg { padding: var(--s-4) var(--s-5); }
.msg.unread { border-left: 3px solid var(--brand-500); background: var(--brand-50); }
.content { margin-top: var(--s-3); font-size: var(--fs-sm); color: var(--ink-700); line-height: 1.7; }
.tiny { font-size: var(--fs-xs); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--s-4); margin-top: var(--s-5); }
</style>
