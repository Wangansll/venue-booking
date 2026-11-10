import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, token, type User } from '../api'

export const useAuth = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLogin = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    const r = await api.login(username, password)
    token.set(r.token)
    user.value = r.user
  }

  async function restore() {
    if (!token.get()) return
    try { user.value = await api.me() } catch { user.value = null; token.clear() }
  }

  function logout() {
    user.value = null
    token.clear()
  }

  return { user, isLogin, isAdmin, login, restore, logout }
})
