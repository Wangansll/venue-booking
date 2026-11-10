<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from './stores/auth'

const auth = useAuth()
const router = useRouter()
const route = useRoute()

const isAdminArea = computed(() => route.path.startsWith('/admin'))
const menuOpen = ref(false)
const scrolled = ref(false)

const NAV = [
  { to: '/tickets', label: '购票' },
  { to: '/venues', label: '场馆' },
  { to: '/events', label: '活动' },
  { to: '/news', label: '新闻' },
  { to: '/reviews', label: '回顾' },
  { to: '/welfare/philosophy', label: '公益' },
  { to: '/cooperation', label: '合作' },
  { to: '/disclosure/profile', label: '公开' },
  { to: '/contact', label: '联系' },
]

function onScroll() { scrolled.value = window.scrollY > 8 }
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))

function logout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <div class="app-shell">
    <header v-if="!isAdminArea" class="site-head" :class="{ scrolled }">
      <div class="head-inner">
        <RouterLink to="/" class="site-brand">
          <img class="brand-logo" src="/logo.svg" alt="" width="32" height="32" />
          <span class="brand-name">校园场馆</span>
        </RouterLink>

        <nav class="site-nav" aria-label="主导航">
          <RouterLink v-for="n in NAV" :key="n.to" :to="n.to" class="nav-item">{{ n.label }}</RouterLink>
        </nav>

        <div class="head-right">
          <template v-if="auth.isLogin">
            <RouterLink v-if="auth.isAdmin" to="/admin" class="btn btn-sm">管理后台</RouterLink>
            <RouterLink v-else to="/my/tickets" class="btn btn-sm">我的票夹</RouterLink>
            <span class="head-user">{{ auth.user?.name }}</span>
            <button class="btn btn-sm btn-ghost" @click="logout">退出</button>
          </template>
          <RouterLink v-else to="/login" class="btn btn-sm btn-primary">登录 / 预约</RouterLink>
        </div>

        <button class="burger" :class="{ on: menuOpen }" aria-label="菜单" @click="menuOpen = !menuOpen">
          <span></span><span></span><span></span>
        </button>
      </div>

      <!-- 移动端抽屉 -->
      <transition name="drop">
        <nav v-if="menuOpen" class="mobile-nav" @click="menuOpen = false">
          <RouterLink v-for="n in NAV" :key="n.to" :to="n.to">{{ n.label }}</RouterLink>
          <RouterLink v-if="auth.isLogin" to="/my/tickets">我的票夹</RouterLink>
          <RouterLink v-else to="/login">登录 / 预约</RouterLink>
        </nav>
      </transition>
    </header>

    <main class="page-body"><RouterView /></main>

    <footer v-if="!isAdminArea" class="site-foot">
      <div class="foot-inner">
        <div>
          <div class="foot-brand">校园场馆管理中心</div>
          <p class="muted">在线预约 · 票务 · 活动资讯 · 场地管理</p>
        </div>
        <div class="foot-links">
          <RouterLink to="/venues">场馆介绍</RouterLink>
          <RouterLink to="/events">活动</RouterLink>
          <RouterLink to="/news">新闻</RouterLink>
          <RouterLink to="/contact">联系我们</RouterLink>
        </div>
        <div class="muted foot-copy">© 2026 校园场馆 · Vue 3 + TS + Node + MySQL</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
:global(#app) { min-height: 100%; display: flex; flex-direction: column; }
.app-shell { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 100vh; }
.page-body { flex: 1 1 auto; min-height: 0; }

/* ── 顶栏 ── */
.site-head {
  position: sticky; top: 0; z-index: 40;
  background: rgba(255,255,255,.92);
  backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid transparent;
  transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
}
.site-head.scrolled { border-bottom-color: var(--line); box-shadow: 0 1px 12px rgba(15,21,35,.06); }

.head-inner {
  max-width: var(--shell-max); margin: 0 auto; height: 66px; padding: 0 var(--s-6);
  display: flex; align-items: center; gap: var(--s-6);
}

.site-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; flex: 0 0 auto; }
.site-brand .brand-name { font-size: var(--fs-md); font-weight: 700; color: var(--ink-900); letter-spacing: .01em; }

/* ── 导航：每个链接自带下划线动画，间距充足 ── */
.site-nav { display: flex; align-items: center; gap: 4px; margin-left: var(--s-4); }
.nav-item {
  position: relative; padding: 8px 12px; border-radius: var(--r-sm);
  font-size: var(--fs-sm); font-weight: 500; color: var(--ink-500);
  text-decoration: none; white-space: nowrap;
  transition: color .16s var(--ease), background .16s var(--ease);
}
.nav-item:hover { color: var(--ink-900); background: var(--line-soft); }
.nav-item::after {
  content: ""; position: absolute; left: 12px; right: 12px; bottom: 2px; height: 2px;
  border-radius: 1px; background: var(--brand-500);
  transform: scaleX(0); transform-origin: center; transition: transform .2s var(--ease);
}
.nav-item.router-link-active { color: var(--brand-600); font-weight: 600; }
.nav-item.router-link-active::after { transform: scaleX(1); }

.head-right { margin-left: auto; display: flex; align-items: center; gap: var(--s-3); }
.head-user { font-size: var(--fs-sm); color: var(--ink-500); }

/* ── 汉堡 ── */
.burger {
  display: none; width: 40px; height: 40px; margin-left: auto;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: #fff; cursor: pointer; padding: 11px 10px;
  flex-direction: column; justify-content: space-between;
}
.burger span { display: block; height: 1.5px; background: var(--ink-700); border-radius: 1px; transition: transform .2s var(--ease), opacity .2s; }
.burger.on span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
.burger.on span:nth-child(2) { opacity: 0; }
.burger.on span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

.mobile-nav {
  display: none; flex-direction: column; padding: var(--s-3) var(--s-4) var(--s-4);
  background: #fff; border-top: 1px solid var(--line);
}
.mobile-nav a {
  padding: 12px 6px; font-size: var(--fs-base); color: var(--ink-700);
  text-decoration: none; border-bottom: 1px solid var(--line-soft);
}
.mobile-nav a.router-link-active { color: var(--brand-600); font-weight: 600; }
.drop-enter-active, .drop-leave-active { transition: opacity .18s, transform .18s; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── 页脚 ── */
.site-foot { background: var(--ink-900); color: rgba(255,255,255,.7); margin-top: var(--s-12); }
.foot-inner {
  max-width: var(--shell-max); margin: 0 auto; padding: var(--s-10) var(--s-6);
  display: flex; align-items: center; gap: var(--s-8); flex-wrap: wrap;
}
.foot-brand { color: #fff; font-weight: 700; margin-bottom: 4px; }
.foot-links { display: flex; gap: var(--s-5); }
.foot-links a { color: rgba(255,255,255,.62); font-size: var(--fs-sm); text-decoration: none; }
.foot-links a:hover { color: #fff; }
.foot-copy { margin-left: auto; }

@media (max-width: 1080px) {
  .site-nav { display: none; }
  .burger { display: flex; }
  .mobile-nav { display: flex; }
  .head-inner { padding: 0 var(--s-4); gap: var(--s-3); }
  .head-right { margin-left: 0; gap: var(--s-2); }
  .head-user { display: none; }
  .foot-inner { padding: var(--s-6) var(--s-4); }
  .foot-copy { margin-left: 0; width: 100%; }
}
</style>
