<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { contentApi, type HomeData } from '../api-content'
import { STEPS, TESTIMONIALS, FAQS, HIGHLIGHTS } from '../content'

const data = ref<HomeData | null>(null)
const loading = ref(true)
const current = ref(0)
const paused = ref(false)
let timer = 0

function go(i: number) {
  const n = data.value?.banners.length ?? 0
  if (!n) return
  current.value = (i + n) % n
}
function next() { go(current.value + 1) }
function prev() { go(current.value - 1) }

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
}

const ICON: Record<string, string> = { 篮球场: '🏀', 羽毛球: '🏸', 自习室: '📚', 网球场: '🎾' }

onMounted(async () => {
  try { data.value = await contentApi.home() } catch { /* 首屏失败不阻断 */ }
  loading.value = false
  // 默认从中间那张开始：选中圆点落在两条线之间，构图更平衡
  if (data.value && data.value.banners.length > 1) {
    current.value = Math.floor(data.value.banners.length / 2)
  }
  if (data.value && data.value.banners.length > 1) {
    timer = window.setInterval(() => {
      if (!paused.value) go(current.value + 1)
    }, 5000)
  }
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="home">
    <!-- Hero 轮播 -->
    <section class="hero" @mouseenter="paused = true" @mouseleave="paused = false">
      <div v-if="loading" class="hero-bg skeleton"></div>
      <template v-else-if="data && data.banners.length">
        <div
          v-for="(b, i) in data.banners"
          :key="b.id"
          class="hero-bg"
          :class="{ on: i === current }"
          :style="{ backgroundImage: `url(${b.image})` }"
        ></div>
        <div class="hero-scrim"></div>
        <div class="hero-content">
          <h1>{{ data.banners[current].title }}</h1>
          <p>{{ data.banners[current].subtitle }}</p>
          <div class="hero-actions">
            <RouterLink to="/venues" class="btn btn-primary">立即预约</RouterLink>
            <RouterLink to="/events" class="btn">查看活动</RouterLink>
          </div>
        </div>
        <button class="hero-arrow left" aria-label="上一张" @click="prev">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
      </button>
        <button class="hero-arrow right" aria-label="下一张" @click="next">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>

        <div class="hero-dots">
          <button
            v-for="(b, i) in data.banners" :key="b.id"
            class="dot"
            :class="{ on: i === current }"
            :aria-label="`第 ${i + 1} 张`"
            @click="go(i)"
          ></button>
        </div>
        <div class="hero-count">{{ current + 1 }} / {{ data.banners.length }}</div>
      </template>
      <div v-else class="hero-bg plain">
        <div class="hero-content">
          <h1>校园场馆中心</h1>
          <p>统一在线预约，场地一目了然</p>
          <RouterLink to="/venues" class="btn btn-primary">立即预约</RouterLink>
        </div>
      </div>
    </section>

    <!-- 场馆 -->
    <section class="wrap">
      <div class="section-head">
        <h2>场馆</h2><span class="count">共 {{ data?.venues.length ?? 0 }} 个</span>
        <div class="grow"></div>
        <RouterLink to="/venues" class="muted">全部 →</RouterLink>
      </div>
      <div class="grid-4">
        <RouterLink v-for="v in data?.venues ?? []" :key="v.id" :to="`/venues/${v.id}`" class="card vcard">
          <div v-if="v.cover" class="vcard-cover" :style="{ backgroundImage: `url(${v.cover})` }">
            <span class="vcard-tag">{{ v.type }}</span>
          </div>
          <div class="vcard-body">
            <h3>{{ v.name }}</h3>
            <p class="muted">{{ v.location }}</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- 活动 -->
    <section class="wrap">
      <div class="section-head">
        <h2>近期活动</h2><div class="grow"></div>
        <RouterLink to="/events" class="muted">全部 →</RouterLink>
      </div>
      <div class="grid-3">
        <RouterLink v-for="a in data?.events ?? []" :key="a.id" :to="`/article/${a.id}`" class="card acard">
          <div class="acard-cover" :style="{ backgroundImage: `url(${a.cover})` }"></div>
          <div class="acard-body">
            <span class="pill pill-warn">活动</span>
            <h3>{{ a.title }}</h3>
            <p class="muted">{{ a.summary }}</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- 新闻 -->
    <section class="wrap">
      <div class="section-head">
        <h2>新闻资讯</h2><div class="grow"></div>
        <RouterLink to="/news" class="muted">全部 →</RouterLink>
      </div>
      <div class="news-list">
        <RouterLink v-for="a in data?.news ?? []" :key="a.id" :to="`/article/${a.id}`" class="card nrow">
          <div class="nrow-cover" :style="{ backgroundImage: `url(${a.cover})` }"></div>
          <div class="grow">
            <h3>{{ a.title }}</h3>
            <p class="muted">{{ a.summary }}</p>
          </div>
          <span class="muted nrow-date">{{ (a.publishedAt || '').slice(0, 10) }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- 亮点 -->
    <section class="wrap">
      <div class="highlights">
        <div v-for="h in HIGHLIGHTS" :key="h.title" class="hl">
          <div class="hl-ico">{{ h.icon }}</div>
          <div>
            <b>{{ h.title }}</b>
            <p class="muted">{{ h.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 数据 -->
    <section class="wrap">
      <div class="stats card">
        <div v-for="s in (data?.stats ?? [])" :key="s.label" class="stat">
          <div class="stat-val">{{ s.value }}<i>{{ s.unit }}</i></div>
          <div class="muted">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- 流程 -->
    <section class="wrap">
      <div class="section-head"><h2>怎么用</h2><span class="count">四步完成</span></div>
      <div class="steps">
        <div v-for="s in STEPS" :key="s.no" class="step">
          <div class="step-no">{{ s.no }}</div>
          <b>{{ s.title }}</b>
          <p class="muted">{{ s.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 评价 -->
    <section class="wrap">
      <div class="section-head"><h2>他们在用</h2></div>
      <div class="quotes">
        <figure v-for="t in TESTIMONIALS" :key="t.name" class="card quote">
          <blockquote>“{{ t.text }}”</blockquote>
          <figcaption>
            <span class="avatar">{{ t.name.slice(0, 1) }}</span>
            <span>
              <b>{{ t.name }}</b>
              <em>{{ t.role }}</em>
            </span>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- FAQ -->
    <section class="wrap faq-wrap">
      <div class="section-head"><h2>常见问题</h2></div>
      <div class="card faq">
        <details v-for="f in FAQS" :key="f.q">
          <summary>{{ f.q }}</summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
    </section>

  </div>
</template>

<style scoped>
.hero-scrim {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(90deg, rgba(8,12,20,.86) 0%, rgba(8,12,20,.62) 42%, rgba(8,12,20,.18) 100%);
}
.hero { position: relative; height: 460px; overflow: hidden; background: var(--ink-900); }
.hero-bg {
  position: absolute; inset: 0; background-size: cover; background-position: center;
  opacity: 0; transition: opacity .8s var(--ease);
}
.hero-bg.on { opacity: 1; }
.hero-bg.plain { opacity: 1; background: linear-gradient(135deg, #1b2a52, #0f1523); display: grid; place-items: center; }
.hero-content {
  position: relative; z-index: 2; max-width: 1180px; margin: 0 auto;
  height: 100%; display: flex; flex-direction: column; justify-content: center;
  padding: 0 var(--s-8); color: #fff;
}
.hero-content h1 { color: #fff; font-size: 38px; max-width: 620px; line-height: 1.25; }
.hero-content p { color: rgba(255,255,255,.75); margin-top: 10px; font-size: var(--fs-md); max-width: 520px; }
.hero-actions { display: flex; gap: var(--s-3); margin-top: var(--s-6); }
.hero-dots {
  position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px; z-index: 3;
}
/* 未选中：短细线；选中：一个圆点 —— 靠形状区分，不是靠变长 */
.hero-dots button.dot {
  width: 26px; height: 4px; border-radius: 2px; border: 0; padding: 0;
  background: rgba(255,255,255,.62);
  cursor: pointer;
  transition: width .28s var(--ease), height .28s var(--ease),
              border-radius .28s var(--ease), background .22s, box-shadow .22s;
}
.hero-dots button.dot.on {
  width: 13px; height: 13px; border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 0 2px rgba(255,255,255,.9), 0 3px 12px rgba(59,110,245,.7);
}
.hero-dots button.dot:hover { background: rgba(255,255,255,.85); }
.hero-dots button.dot.on:hover { background: var(--brand-400); }

.hero-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
  width: 38px; height: 38px; padding: 0;
  display: grid; place-items: center;
  background: none; border: 0; color: #fff; cursor: pointer;
  opacity: .72;
  filter: drop-shadow(0 1px 5px rgba(0,0,0,.55));
  transition: opacity .2s var(--ease), transform .2s var(--ease);
}
.hero-arrow svg {
  width: 26px; height: 26px;
  fill: none; stroke: currentColor; stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round;
}
.hero-arrow:hover { opacity: 1; }
/* 窄到装不下外侧留白时，文字退让给箭头；宽屏保持与导航栏同一条左边线 */
@media (max-width: 1240px) {
  .hero-content { padding-left: 68px; padding-right: 68px; }
}

.hero-arrow.left { left: 20px; }
.hero-arrow.right { right: 20px; }
.hero-arrow.left:hover { transform: translateY(-50%) translateX(-3px); }
.hero-arrow.right:hover { transform: translateY(-50%) translateX(3px); }
.hero-arrow:active { transform: translateY(-50%) scale(.94); }
.hero-arrow:focus-visible { outline: 2px solid rgba(255,255,255,.8); outline-offset: 3px; border-radius: 50%; opacity: 1; }



.hero-count {
  position: absolute; right: 24px; bottom: 24px; z-index: 3;
  font-size: var(--fs-xs); color: rgba(255,255,255,.75);
  background: rgba(0,0,0,.35); padding: 3px 9px; border-radius: var(--r-full);
  font-variant-numeric: tabular-nums;
}

.wrap { max-width: 1180px; margin: 0 auto; padding: var(--s-10) var(--s-8) 0; }
.section-head { display: flex; align-items: baseline; gap: var(--s-3); margin-bottom: var(--s-5); }
.section-head h2 { font-size: var(--fs-lg); }
.section-head .count { font-size: var(--fs-sm); color: var(--ink-400); }

.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-4); }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-4); }

.vcard { overflow: hidden; padding: 0; }
.vcard-body { padding: var(--s-4); }
.vcard-cover { height: 128px; background-size: cover; background-position: center; position: relative; }
.vcard-tag { position: absolute; left: 10px; bottom: 10px; background: rgba(0,0,0,.55); color: #fff; font-size: var(--fs-xs); padding: 2px 9px; border-radius: var(--r-full); }
.vcard { text-decoration: none; color: inherit; transition: all .18s var(--ease); }
.vcard:hover { transform: translateY(-3px); box-shadow: var(--sh-md); border-color: var(--brand-200); text-decoration: none; }
.vcard-ico { width: 42px; height: 42px; border-radius: 12px; background: var(--brand-50); display: grid; place-items: center; font-size: 19px; margin-bottom: var(--s-3); }
.vcard h3 { font-size: var(--fs-base); margin-bottom: 2px; }
.vcard p { margin-bottom: var(--s-3); }

.acard { overflow: hidden; text-decoration: none; color: inherit; transition: all .18s var(--ease); }
.acard:hover { transform: translateY(-3px); box-shadow: var(--sh-md); text-decoration: none; }
.acard-cover { height: 150px; background-size: cover; background-position: center; }
.acard-body { padding: var(--s-4); }
.acard-body h3 { font-size: var(--fs-base); margin: 8px 0 4px; }
.acard-body p { font-size: var(--fs-sm); }

.news-list { display: flex; flex-direction: column; gap: var(--s-3); }
.nrow { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-3); text-decoration: none; color: inherit; transition: all .18s var(--ease); }
.nrow:hover { border-color: var(--brand-200); box-shadow: var(--sh-sm); text-decoration: none; }
.nrow-cover { width: 120px; height: 72px; border-radius: var(--r-sm); background-size: cover; background-position: center; flex: 0 0 auto; }
.nrow h3 { font-size: var(--fs-base); }
.nrow p { font-size: var(--fs-sm); margin-top: 2px; }
.nrow-date { flex: 0 0 auto; }

/* ── 亮点 ── */
.highlights { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-4); }
.hl { display: flex; gap: var(--s-3); align-items: flex-start; }
.hl-ico { width: 34px; height: 34px; border-radius: 10px; background: var(--brand-50); color: var(--brand-600); display: grid; place-items: center; font-size: 15px; flex: 0 0 auto; }
.hl b { font-size: var(--fs-sm); color: var(--ink-900); }
.hl p { font-size: var(--fs-xs); margin-top: 2px; }

/* ── 数据 ── */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); padding: var(--s-6); }
.stat { text-align: center; border-right: 1px solid var(--line-soft); }
.stat:last-child { border-right: 0; }
.stat-val { font-size: 30px; font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; }
.stat-val i { font-size: var(--fs-sm); font-style: normal; color: var(--ink-400); margin-left: 3px; }
.stat .muted { font-size: var(--fs-xs); margin-top: 2px; }

/* ── 流程 ── */
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-4); }
.step { position: relative; padding-top: var(--s-4); border-top: 2px solid var(--line); }
.step-no { font-size: var(--fs-xs); font-weight: 700; color: var(--brand-600); letter-spacing: .1em; margin-bottom: 6px; }
.step b { font-size: var(--fs-base); color: var(--ink-900); }
.step p { font-size: var(--fs-sm); margin-top: 4px; }

/* ── 评价 ── */
.quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-4); }
.quote { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
.quote blockquote { font-size: var(--fs-sm); line-height: 1.9; color: var(--ink-700); }
.quote figcaption { display: flex; align-items: center; gap: 10px; margin-top: auto; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--brand-500); color: #fff; display: grid; place-items: center; font-size: var(--fs-sm); font-weight: 700; }
.quote figcaption b { display: block; font-size: var(--fs-sm); color: var(--ink-900); }
.quote figcaption em { font-style: normal; font-size: var(--fs-xs); color: var(--ink-400); }

/* ── FAQ ── */
.faq-wrap { padding-bottom: var(--s-4); }
.faq { padding: var(--s-2) var(--s-5); }
.faq details { border-bottom: 1px solid var(--line-soft); }
.faq details:last-child { border-bottom: 0; }
.faq summary {
  cursor: pointer; padding: 14px 0; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-900);
  list-style: none; display: flex; align-items: center;
}
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: "+"; margin-left: auto; color: var(--ink-300); font-size: 16px; }
.faq details[open] summary::after { content: "−"; color: var(--brand-600); }
.faq details p { padding: 0 0 14px; font-size: var(--fs-sm); color: var(--ink-500); line-height: 1.8; }

@media (max-width: 900px) {
  .highlights, .steps, .quotes { grid-template-columns: 1fr 1fr; }
  .stats { grid-template-columns: 1fr 1fr; gap: var(--s-4); }
  .stat:nth-child(2) { border-right: 0; }

  .hero { height: 380px; }
  .hero-arrow { display: none; }
  .hero-content { padding: 0 var(--s-5); }
  .hero-count { right: 12px; bottom: 12px; }
  .hero-content { padding: 0 var(--s-4); }
  .hero-content h1 { font-size: 26px; }
  .wrap { padding: var(--s-6) var(--s-4) 0; }
  .grid-4 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: 1fr; }
  .nrow-cover { width: 84px; height: 56px; }
  .nrow-date { display: none; }
}
</style>
