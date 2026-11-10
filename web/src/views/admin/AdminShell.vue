<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
const route = useRoute()
const tabs = [
  { to: '/admin/dashboard', label: '概览' },
  { to: '/admin/venues', label: '场馆' },
  { to: '/admin/content', label: '内容' },
  { to: '/admin/messages', label: '留言' },
  { to: '/admin/bookings', label: '预约审核' },
  { to: '/admin/sessions', label: '场次管理' },
  { to: '/admin/tickets', label: '票务核销' },
]
</script>

<template>
  <div class="admin">
    <aside class="side">
      <RouterLink to="/" class="brand">
        <img class="brand-mark" src="/logo.svg" alt="" width="28" height="28" />
        <span class="brand-name">管理后台</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="nav-link" :class="{ on: route.path === t.to }">
          {{ t.label }}
        </RouterLink>
      </nav>
      <div class="side-foot">
        <RouterLink to="/" class="btn btn-sm btn-ghost" style="color:rgba(255,255,255,.55)">← 回到前台</RouterLink>
      </div>
    </aside>
    <main class="main"><RouterView /></main>
  </div>
</template>

<style scoped>
.admin { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
.side {
  background: var(--ink-900); color: #fff; padding: var(--s-5) var(--s-3);
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 0 var(--s-2) var(--s-6); text-decoration: none; }
.brand-name { color: #fff; font-weight: 700; font-size: var(--fs-base); }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-link {
  height: 40px; display: flex; align-items: center; padding: 0 var(--s-3);
  border-radius: var(--r-sm); color: rgba(255,255,255,.62);
  font-size: var(--fs-sm); text-decoration: none; transition: all .16s var(--ease);
}
.nav-link:hover { background: rgba(255,255,255,.06); color: #fff; }
.nav-link.on { background: rgba(255,255,255,.1); color: #fff; font-weight: 600; }
.side-foot { margin-top: auto; padding: var(--s-3); border-top: 1px solid rgba(255,255,255,.08); }
.main { min-width: 0; padding: var(--s-6) var(--s-8); max-width: 1100px; }
@media (max-width: 900px) {
  .admin { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; align-items: center; gap: var(--s-3); padding: var(--s-2); }
  .brand { padding: 0; }
  .nav { flex-direction: row; } .side-foot { display: none; }
  .main { padding: var(--s-4); }
}
</style>
