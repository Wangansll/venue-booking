import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const routes = [
  { path: '/', component: () => import('./views/Home.vue'), meta: { public: true, title: '首页' } },
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true, title: '登录' } },
  { path: '/news', component: () => import('./views/ArticleList.vue'), props: { type: 'news' }, meta: { public: true, title: '新闻资讯' } },
  { path: '/events', component: () => import('./views/ArticleList.vue'), props: { type: 'event' }, meta: { public: true, title: '赛事活动' } },
  { path: '/article/:id', component: () => import('./views/ArticleDetail.vue'), meta: { public: true, title: '内容详情' } },
  { path: '/tickets', component: () => import('./views/Tickets.vue'), meta: { public: true, title: '活动购票' } },
  { path: '/tickets/:id', component: () => import('./views/SeatSelect.vue'), meta: { title: '选座购票' } },
  { path: '/my/tickets', component: () => import('./views/MyTickets.vue'), meta: { title: '我的票夹' } },
  { path: '/venues', component: () => import('./views/Venues.vue'), meta: { title: '场馆' } },
  { path: '/venues/:id', component: () => import('./views/VenueDetail.vue'), meta: { title: '场馆预约' } },
  { path: '/mine', component: () => import('./views/MyBookings.vue'), meta: { title: '我的预约' } },
  { path: '/contact', component: () => import('./views/Contact.vue'), meta: { public: true, title: '联系我们' } },
  { path: '/reviews', component: () => import('./views/Reviews.vue'), meta: { public: true, title: '往届回顾' } },
  { path: '/:section(welfare|cooperation|disclosure)', component: () => import('./views/Info.vue'), meta: { public: true, title: '场馆信息公开' } },
  { path: '/:section(welfare|disclosure)/:sub', component: () => import('./views/Info.vue'), meta: { public: true, title: '场馆信息公开' } },
  {
    path: '/admin',
    component: () => import('./views/admin/AdminShell.vue'),
    meta: { admin: true, title: '管理后台' },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', component: () => import('./views/admin/Dashboard.vue') },
      { path: 'venues', component: () => import('./views/admin/Venues.vue') },
      { path: 'content', component: () => import('./views/admin/Content.vue') },
      { path: 'messages', component: () => import('./views/admin/Messages.vue') },
      { path: 'bookings', component: () => import('./views/Admin.vue') },
      { path: 'sessions', component: () => import('./views/admin/Sessions.vue') },
      { path: 'tickets', component: () => import('./views/admin/Tickets.vue') },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

const SITE = '校园场馆'
router.afterEach((to) => {
  const t = to.meta.title as string | undefined
  document.title = t ? `${t} · ${SITE}` : `${SITE} · 在线预约与票务`
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (!auth.isLogin) await auth.restore()
  if (to.meta.public) return true

  // 需要登录的页面（含后台）
  if (!auth.isLogin) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.admin && !auth.isAdmin) return { path: '/venues' }
  return true
})
