<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, type Slot } from '../api'
import { VENUE_FACILITIES } from '../content'

const route = useRoute()
const venueId = computed(() => Number(route.params.id))

const today = new Date().toISOString().slice(0, 10)
const date = ref(today)
const slots = ref<Slot[]>([])
const venueName = ref('')
const venueType = ref('')
const loading = ref(false)
const error = ref('')
const toast = ref('')
const submitting = ref(false)

/** 已选时段（最多 3 段，与后端单日上限一致） */
const picked = ref<number[]>([])

const STATE_TEXT: Record<Slot['state'], string> = {
  free: '可预约', pending: '待审核', approved: '已预约', closed: '不开放',
}
const STAT: Record<Slot['state'], string> = {
  free: 'pill-ok', pending: 'pill-warn', approved: 'pill-err', closed: '',
}

const info = computed(() => VENUE_FACILITIES[venueType.value] ?? null)
const freeCount = computed(() => slots.value.filter(s => s.state === 'free').length)
const pickedSlots = computed(() => slots.value.filter(s => picked.value.includes(s.slot)))

const days = computed(() => {
  const out: { iso: string; wd: string; d: string }[] = []
  const WD = ['日', '一', '二', '三', '四', '五', '六']
  for (let i = 0; i < 7; i++) {
    const dt = new Date()
    dt.setDate(dt.getDate() + i)
    out.push({
      iso: dt.toISOString().slice(0, 10),
      wd: i === 0 ? '今天' : '周' + WD[dt.getDay()],
      d: String(dt.getDate()),
    })
  }
  return out
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.slots(venueId.value, date.value)
    slots.value = r.slots
    venueName.value = r.venue.name
    venueType.value = (r.venue as { type?: string }).type ?? ''
    picked.value = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
    slots.value = []
  } finally {
    loading.value = false
  }
}

function toggle(s: Slot) {
  if (s.state !== 'free') return
  toast.value = ''
  error.value = ''
  if (picked.value.includes(s.slot)) {
    picked.value = picked.value.filter(x => x !== s.slot)
  } else if (picked.value.length >= 3) {
    error.value = '同一天最多预约 3 个时段'
  } else {
    picked.value = [...picked.value, s.slot]
  }
}

async function submit() {
  if (!picked.value.length) return
  submitting.value = true
  toast.value = ''
  error.value = ''
  const okList: string[] = []
  const failList: string[] = []
  for (const slot of [...picked.value].sort((a, b) => a - b)) {
    const s = slots.value.find(x => x.slot === slot)
    try {
      await api.book(venueId.value, date.value, slot)
      okList.push(s?.text ?? String(slot))
    } catch (e) {
      failList.push(`${s?.text ?? slot}：${e instanceof Error ? e.message : '失败'}`)
    }
  }
  submitting.value = false
  picked.value = []
  await load()
  if (okList.length) toast.value = `已提交 ${okList.length} 个时段（${okList.join('、')}），等待审核`
  if (failList.length) error.value = failList.join('；')
}

watch(date, load)
onMounted(load)
</script>

<template>
  <header class="topbar">
    <RouterLink to="/venues" class="btn btn-sm btn-ghost">← 返回</RouterLink>
    <div>
      <div class="page-title">{{ venueName || '选择时段' }}</div>
      <div class="page-sub">选择日期与时段，确认后提交审核</div>
    </div>
    <div class="grow"></div>
    <div class="stat">
      <span class="stat-num">{{ freeCount }}</span>
      <span class="stat-label">个可约</span>
    </div>
  </header>

  <div class="content wrap">
    <p v-if="toast" class="toast ok">✓ {{ toast }}</p>
    <p v-if="error" class="toast bad">{{ error }}</p>

    <div class="date-strip">
      <button
        v-for="d in days" :key="d.iso"
        class="date-chip" :class="{ on: date === d.iso }"
        @click="date = d.iso"
      >
        <span class="wd">{{ d.wd }}</span>
        <span class="d">{{ d.d }}</span>
      </button>
      <input type="date" class="input date-input" v-model="date" :min="today" />
    </div>

    <div class="section-head" style="margin-top:24px">
      <h2>时段</h2>
      <span class="count">共 8 段 · 08:00 – 24:00 · 最多选 3 段</span>
    </div>

    <div v-if="loading" class="slots">
      <div v-for="i in 8" :key="i" class="slot skel">
        <div class="skeleton" style="width:70%;height:14px"></div>
        <div class="skeleton" style="width:45%;height:11px;margin-top:10px"></div>
      </div>
    </div>

    <div v-else class="slots">
      <button
        v-for="s in slots" :key="s.slot"
        class="slot"
        :class="[s.state, { on: picked.includes(s.slot) }]"
        :disabled="s.state !== 'free'"
        @click="toggle(s)"
      >
        <span class="slot-time">{{ s.text }}</span>
        <span class="slot-state">
          <span v-if="picked.includes(s.slot)" class="pill pill-brand">
            <span class="dot"></span>已选
          </span>
          <span v-else class="pill" :class="STAT[s.state]">
            <span class="dot"></span>{{ STATE_TEXT[s.state] }}
          </span>
        </span>
      </button>
    </div>

    <div class="info-grid">
      <section v-if="info" class="card info">
        <h3>设施</h3>
        <ul><li v-for="i in info.items" :key="i">{{ i }}</li></ul>
      </section>
      <section v-if="info" class="card info">
        <h3>收费标准</h3>
        <p class="price">{{ info.price }}</p>
        <h3 style="margin-top:18px">使用须知</h3>
        <ul><li v-for="n in info.notice" :key="n">{{ n }}</li></ul>
      </section>
    </div>

    <div class="tip card">
      <b>为什么不会撞车？</b>
      <p>
        同一场馆、同一天、同一时段只允许一条「待审 / 已通过」的预约，
        由数据库联合唯一索引保证；两个人同时点，第二条会被直接拒绝并提示换时段。
        取消后该时段立即释放，可以重新预约。
      </p>
    </div>

    <!-- 提交栏：sticky，滚动与整页截图都可见 -->
    <div class="submit-bar">
      <div class="sb-info">
        <b v-if="picked.length">已选 {{ picked.length }} 段</b>
        <b v-else>未选择时段</b>
        <span v-if="picked.length" class="sb-list">{{ pickedSlots.map(s => s.text).join('、') }}</span>
        <span v-else class="sb-list">点上方时段卡片选择</span>
      </div>
      <button
        class="btn btn-primary"
        :disabled="!picked.length || submitting"
        @click="submit"
      >{{ submitting ? '提交中…' : `提交预约${picked.length ? `（${picked.length}）` : ''}` }}</button>
    </div>
  </div>
</template>

<style scoped>
.content.wrap { padding-bottom: 110px; }
.stat { text-align: right; }
.stat-num { font-size: var(--fs-xl); font-weight: 700; color: var(--brand-600); }
.stat-label { font-size: var(--fs-sm); color: var(--ink-400); margin-left: 4px; }

.toast { padding: 10px 14px; border-radius: var(--r-md); font-size: var(--fs-sm); margin-bottom: var(--s-4); }
.toast.ok { background: var(--ok-50); color: var(--ok-600); }
.toast.bad { background: var(--err-50); color: var(--err-600); }

.date-strip { display: flex; gap: var(--s-2); overflow-x: auto; padding-bottom: 4px; }
.date-chip {
  flex: 0 0 auto; width: 60px; height: 62px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md);
  cursor: pointer; transition: all .15s var(--ease);
}
.date-chip:hover { border-color: var(--brand-200); }
.date-chip.on { background: var(--brand-500); border-color: var(--brand-500); box-shadow: var(--sh-brand); }
.date-chip.on .wd, .date-chip.on .d { color: #fff; }
.wd { font-size: var(--fs-xs); color: var(--ink-400); }
.d { font-size: var(--fs-md); font-weight: 700; color: var(--ink-900); }
.date-input { width: 150px; flex: 0 0 auto; }

.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: var(--s-3); }
.slot {
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
  padding: 14px 16px; text-align: left;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md);
  cursor: pointer; transition: all .16s var(--ease);
}
.slot.skel { cursor: default; }
.slot-time { font-size: var(--fs-base); font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; }
.slot.free { border-color: var(--brand-200); background: var(--brand-50); }
.slot.free:hover:not(:disabled) { border-color: var(--brand-500); box-shadow: 0 4px 14px rgba(59,110,245,.16); transform: translateY(-1px); }
.slot.free .slot-time { color: var(--brand-700); }
.slot.on { border-color: var(--brand-500); background: #fff; box-shadow: 0 0 0 2px var(--brand-200); }
.slot.pending { background: var(--warn-50); border-color: #f3ddb0; cursor: default; }
.slot.approved { background: var(--line-soft); border-color: var(--line); cursor: default; }
.slot.approved .slot-time, .slot.closed .slot-time { color: var(--ink-400); }
.slot.closed { background: transparent; border-style: dashed; cursor: default; opacity: .6; }
.slot.closed .slot-time { text-decoration: line-through; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); margin-top: var(--s-8); }
.info { padding: var(--s-5) var(--s-6); }
.info h3 { font-size: var(--fs-sm); color: var(--ink-900); margin-bottom: var(--s-3); }
.info ul { padding-left: 16px; }
.info li { list-style: disc; font-size: var(--fs-sm); color: var(--ink-500); line-height: 1.9; }
.price { font-size: var(--fs-sm); color: var(--err-600); font-weight: 600; line-height: 1.8; }

.tip { margin-top: var(--s-5); padding: var(--s-5) var(--s-6); }
.tip b { display: block; font-size: var(--fs-sm); color: var(--ink-900); margin-bottom: 6px; }
.tip p { font-size: var(--fs-sm); color: var(--ink-500); line-height: 1.75; }

.submit-bar {
  position: sticky; bottom: 0; z-index: 30;
  display: flex; align-items: center; gap: var(--s-4);
  margin: var(--s-6) calc(-1 * var(--s-6)) 0;
  padding: 14px var(--s-6);
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--line);
  box-shadow: 0 -4px 18px rgba(15,21,35,.06);
}
.sb-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sb-info b { font-size: var(--fs-base); color: var(--ink-900); }
.sb-list { font-size: var(--fs-xs); color: var(--ink-400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.submit-bar .btn { margin-left: auto; flex: 0 0 auto; }

@media (max-width: 900px) {
  .slots { grid-template-columns: repeat(2, 1fr); }
  .date-input { display: none; }
  .info-grid { grid-template-columns: 1fr; }
  .submit-bar { margin-left: calc(-1 * var(--s-4)); margin-right: calc(-1 * var(--s-4)); padding: 12px var(--s-4); }
}
</style>
