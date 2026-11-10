import { token } from './api'

export interface Article {
  id: number; type: 'news' | 'event'; title: string; cover: string | null; summary: string | null
  content?: string | null; publishedAt: string | null
  eventStart?: string | null; eventEnd?: string | null; eventPlace?: string | null
  status?: 'draft' | 'published'; author?: string; updatedAt?: string
}
export interface Banner { id: number; title: string; subtitle: string | null; image: string; link: string | null }
export interface VenueLite { id: number; name: string; cover?: string | null; type: string; location: string; capacity: number; open_slot: number; close_slot: number }
export interface HomeData {
  banners: Banner[]; venues: VenueLite[]; events: Article[]; news: Article[]
  stats?: { value: string; unit: string; label: string }[]
}
export interface Message { id: number; name: string; phone: string; email: string | null; content: string; isRead: number; createdAt: string }
export interface Dashboard {
  todayBookings: number; pending: number; venues: number; unreadMessages: number; published: number
  revenueCents: number; paidOrders: number; soldSeats: number; redeemed: number
  recent: { id: number; date: string; slot: number; status: string; userName: string; venueName: string }[]
}

const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  let j: any = null
  try { j = await res.json() } catch { /* ignore */ }
  if (!res.ok || !j || j.code !== 0) throw new Error(j?.msg || `请求失败 (${res.status})`)
  return j.data as T
}

export const contentApi = {
  home: () => req<HomeData>('GET', '/home'),
  list: (type: 'news' | 'event', page = 1, size = 6) =>
    req<{ total: number; page: number; size: number; list: Article[] }>('GET', `/articles?type=${type}&page=${page}&size=${size}`),
  detail: (id: number) => req<Article>('GET', `/articles/${id}`),
  sendMessage: (b: { name: string; phone: string; email?: string; content: string }) =>
    req<null>('POST', '/messages', b),

  // 后台
  dashboard: () => req<Dashboard>('GET', '/admin/dashboard'),
  adminList: (type: string, status: string, page = 1, size = 10) =>
    req<{ total: number; page: number; size: number; list: Article[] }>(
      'GET', `/admin/articles?type=${type}&status=${status}&page=${page}&size=${size}`),
  create: (b: Partial<Article>) => req<{ id: number }>('POST', '/admin/articles', b),
  update: (id: number, b: Partial<Article>) => req<null>('PUT', `/admin/articles/${id}`, b),
  publish: (id: number, publish = true) => req<null>('POST', `/admin/articles/${id}/publish`, { publish }),
  remove: (id: number) => req<null>('DELETE', `/admin/articles/${id}`),
  messages: (page = 1, size = 10) =>
    req<{ total: number; unread: number; page: number; size: number; list: Message[] }>('GET', `/admin/messages?page=${page}&size=${size}`),
  readMessage: (id: number) => req<null>('POST', `/admin/messages/${id}/read`, {}),
}
