export interface User { id: number; username: string; name: string; role: 'student' | 'admin' }
export interface Venue { id: number; name: string; cover?: string | null; type: string; location: string; capacity: number; open_slot: number; close_slot: number }
export interface Slot { slot: number; text: string; state: 'free' | 'pending' | 'approved' | 'closed' }
export interface Booking {
  id: number; date: string; slot: number; slotText: string; status: string
  remark: string | null; venueName?: string; location?: string; userName?: string; created_at?: string
}

interface Resp<T> { code: number; msg: string; data: T }

const TOKEN_KEY = 'vb_token'

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  code: number
  constructor(code: number, msg: string) { super(msg); this.code = code }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`

  let res: Response
  try {
    res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(-1, '网络连接失败，请检查后端是否已启动')
  }

  let json: Resp<T> | null = null
  try { json = await res.json() as Resp<T> } catch { /* 非 JSON 响应 */ }

  if (!res.ok || !json || json.code !== 0) {
    if (res.status === 401) token.clear()
    throw new ApiError(json?.code ?? res.status, json?.msg ?? `请求失败 (${res.status})`)
  }
  return json.data
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/auth/login', { username, password }),
  me: () => request<User>('GET', '/auth/me'),
  venues: (type?: string) => request<Venue[]>('GET', '/venues' + (type ? `?type=${encodeURIComponent(type)}` : '')),
  slots: (venueId: number, date: string) =>
    request<{ venue: { id: number; name: string }; date: string; slots: Slot[] }>('GET', `/venues/${venueId}/slots?date=${date}`),
  book: (venueId: number, date: string, slot: number, remark = '') =>
    request<{ bookingId: number }>('POST', '/bookings', { venueId, date, slot, remark }),
  mine: () => request<Booking[]>('GET', '/bookings/mine'),
  cancel: (id: number) => request<null>('POST', `/bookings/${id}/cancel`, {}),
  adminList: (status: string, page = 1, size = 10) =>
    request<{ total: number; page: number; size: number; list: Booking[] }>('GET', `/admin/bookings?status=${status}&page=${page}&size=${size}`),
  review: (id: number, action: 'approve' | 'reject') =>
    request<null>('POST', `/admin/bookings/${id}/review`, { action }),
}
