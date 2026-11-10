<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const router = useRouter()
const route = useRoute()

const username = ref('student')
const password = ref('123456')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!username.value || !password.value) { error.value = '请填写用户名和密码'; return }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push(String(route.query.redirect || '/venues'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

function quick(u: string, p: string) {
  username.value = u
  password.value = p
  submit()
}
</script>

<template>
  <div class="auth">
    <!-- 左：品牌区 -->
    <section class="visual">
      <div class="visual-inner">
        <div class="logo">
          <img class="logo-mark" src="/logo.svg" alt="" width="34" height="34" />
          <span>校园场馆预约</span>
        </div>
        <h1>把空闲时段<br>排明白。</h1>
        <p class="lead">
          篮球场、羽毛球馆、自习室统一在线预约。
          学生自助选时段，管理员一键审核，冲突由数据库兜底。
        </p>

        <ul class="feats">
          <li><i>01</i><div><b>按时段预约</b><span>一天 8 段，实时显示可约 / 待审 / 已约</span></div></li>
          <li><i>02</i><div><b>不会撞车</b><span>同一时段只能有一条有效预约</span></div></li>
          <li><i>03</i><div><b>审核留痕</b><span>谁约的、何时提交、通过还是驳回</span></div></li>
        </ul>
      </div>
      <div class="grid-deco" aria-hidden="true"><span v-for="i in 48" :key="i"></span></div>
    </section>

    <!-- 右：登录表单 -->
    <section class="panel">
      <div class="form-wrap">
        <h2>登录</h2>
        <p class="muted" style="margin-bottom:22px">使用学号或管理员账号进入系统</p>

        <label class="fl">
          <span>账号</span>
          <input class="input" v-model="username" autocomplete="username" placeholder="请输入用户名" @keyup.enter="submit" />
        </label>

        <label class="fl">
          <span>密码</span>
          <input class="input" v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submit" />
        </label>

        <p v-if="error" class="err" style="margin:2px 0 10px">{{ error }}</p>

        <button class="btn btn-primary btn-block" :disabled="loading" @click="submit" style="height:42px;margin-top:6px">
          {{ loading ? '登录中…' : '进入系统' }}
        </button>

        <div class="divider"><span>演示账号</span></div>

        <div class="quick">
          <button class="btn btn-sm" @click="quick('student', '123456')">学生 · student</button>
          <button class="btn btn-sm" @click="quick('admin', 'admin123')">管理员 · admin</button>
        </div>

        <p class="foot muted">Vue 3 + TypeScript + Node + MySQL</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.auth { display: grid; grid-template-columns: 1.05fr .95fr; min-height: 100vh; }

.visual {
  position: relative; overflow: hidden;
  background: radial-gradient(120% 100% at 0% 0%, #1b2a52 0%, #0f1523 55%, #0b0f18 100%);
  color: #fff; display: flex; align-items: center;
  padding: 64px 56px;
}
.visual-inner { position: relative; z-index: 2; max-width: 460px; }
.logo { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .02em; }
.logo-mark { display: block; width: 34px; height: 34px; filter: drop-shadow(0 6px 18px rgba(59,110,245,.45)); }
h1 { color: #fff; font-size: 40px; line-height: 1.22; margin: 40px 0 16px; letter-spacing: .01em; }
.lead { color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.75; max-width: 380px; }

.feats { list-style: none; margin-top: 40px; display: flex; flex-direction: column; gap: 18px; }
.feats li { display: flex; gap: 14px; align-items: flex-start; }
.feats i {
  font-style: normal; font-size: 11px; font-weight: 700;
  color: #7f9bff; background: rgba(127,155,255,.12);
  border-radius: 6px; padding: 3px 7px; margin-top: 1px;
}
.feats b { display: block; font-size: 13.5px; color: rgba(255,255,255,.94); font-weight: 600; }
.feats span { font-size: 12.5px; color: rgba(255,255,255,.5); }

.grid-deco {
  position: absolute; inset: 0; z-index: 1; opacity: .35;
  display: grid; grid-template-columns: repeat(8, 1fr); pointer-events: none;
}
.grid-deco span { border-right: 1px solid rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.03); }

.panel { display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: var(--surface); }
.form-wrap { width: 100%; max-width: 340px; }
.form-wrap h2 { font-size: 26px; margin-bottom: 6px; }

.fl { display: block; margin-bottom: 16px; }
.fl span { display: block; font-size: var(--fs-sm); color: var(--ink-500); margin-bottom: 6px; font-weight: 500; }

.divider { display: flex; align-items: center; gap: 12px; margin: 24px 0 14px; color: var(--ink-300); font-size: var(--fs-xs); }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.quick { display: flex; gap: 8px; }
.quick .btn { flex: 1; }
.foot { text-align: center; margin-top: 28px; }

@media (max-width: 900px) {
  .auth { grid-template-columns: 1fr; }
  .visual { display: none; }
  .panel { padding: 56px 20px; }
}
</style>
