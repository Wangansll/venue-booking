<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { contentApi, type Dashboard } from '../../api-content'

const d = ref<Dashboard | null>(null)
const loading = ref(true)
onMounted(async () => {
  try { d.value = await contentApi.dashboard() } catch { /* ignore */ }
  loading.value = false
})
const STATUS: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回', cancelled: '已取消' }
</script>

<template>
  <div>
    <div class="head"><h1>概览</h1><p class="muted">今天的场地运行情况</p></div>

    <div v-if="loading" class="cards">
      <div v-for="i in 4" :key="i" class="card stat"><div class="skeleton" style="width:60%;height:28px"></div></div>
    </div>

    <div v-else-if="d" class="cards">
      <div class="card stat"><span class="k">今日预约</span><b>{{ d.todayBookings }}</b></div>
      <div class="card stat"><span class="k">待审核</span><b class="warn">{{ d.pending }}</b></div>
      <div class="card stat"><span class="k">开放场馆</span><b>{{ d.venues }}</b></div>
      <div class="card stat"><span class="k">未读留言</span><b class="brand">{{ d.unreadMessages }}</b></div>
      <div class="card stat wide"><span class="k">票务收入</span><b class="money">¥{{ (d.revenueCents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) }}</b>
        <em>{{ d.paidOrders }} 笔订单 · 售出 {{ d.soldSeats }} 座 · 核销 {{ d.redeemed }}</em>
      </div>
    </div>

    <div v-if="d" class="card table">
      <div class="table-head"><b>最近预约</b><span class="muted">最新 6 条</span></div>
      <div v-if="!d.recent.length" class="empty"><div class="empty-ico">◎</div><div>还没有预约记录</div></div>
      <div v-for="r in d.recent" :key="r.id" class="row-item">
        <span class="w">{{ r.userName }}</span>
        <span class="grow">{{ r.venueName }}</span>
        <span class="muted">{{ r.date }} · 第 {{ r.slot }} 段</span>
        <span class="pill" :class="r.status === 'pending' ? 'pill-warn' : r.status === 'approved' ? 'pill-ok' : ''">
          {{ STATUS[r.status] }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { margin-bottom: var(--s-6); }
.head h1 { font-size: var(--fs-xl); margin-bottom: 4px; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-4); margin-bottom: var(--s-5); }
.stat { padding: var(--s-5); }
.stat .k { display: block; font-size: var(--fs-sm); color: var(--ink-400); margin-bottom: 6px; }
.stat b { font-size: 28px; color: var(--ink-900); }
.stat b.warn { color: var(--warn-600); }
.stat b.brand { color: var(--brand-600); }
.stat.wide { grid-column: span 2; }
.stat b.money { color: var(--err-600); }
.stat em { display: block; font-style: normal; font-size: var(--fs-xs); color: var(--ink-400); margin-top: 4px; }
.table { padding: 0 var(--s-5); }
.table-head { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4) 0; border-bottom: 1px solid var(--line-soft); }
.row-item { display: flex; align-items: center; gap: var(--s-4); padding: 12px 0; border-bottom: 1px solid var(--line-soft); font-size: var(--fs-sm); }
.row-item:last-child { border-bottom: 0; }
.w { width: 64px; font-weight: 600; }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, 1fr); } }
</style>
