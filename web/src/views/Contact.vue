<script setup lang="ts">
import { ref } from 'vue'
import { contentApi } from '../api-content'
import VenueMap from '../components/VenueMap.vue'
import LocationCard from '../components/LocationCard.vue'

const form = ref({ name: '', phone: '', email: '', content: '' })
const sending = ref(false)
const done = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  done.value = ''
  if (!form.value.name || !form.value.phone || !form.value.content) {
    error.value = '姓名、电话、留言内容都不能为空'
    return
  }
  sending.value = true
  try {
    await contentApi.sendMessage(form.value)
    done.value = '留言已提交，我们会尽快联系你'
    form.value = { name: '', phone: '', email: '', content: '' }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提交失败'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="head">
      <h1>联系我们</h1>
      <p class="muted">场地咨询、团体预约、合作洽谈都可以留言</p>
    </header>

    <div class="cols">
      <div class="card info">
        <h3>场馆管理中心</h3>
        <ul>
          <li><i>地址</i><span>南宁数字科技学院 · 东区体育馆 1F</span></li>
          <li><i>电话</i><span>0771-8888 0000</span></li>
          <li><i>邮箱</i><span>venue@example.edu.cn</span></li>
          <li><i>时间</i><span>周一至周五 08:00 – 22:00</span></li>
        </ul>
        <div class="map-block">
          <div class="map-label">馆内导览</div>
          <VenueMap />
          <div class="map-label" style="margin-top:14px">地理位置</div>
          <LocationCard />
        </div>
      </div>

      <form class="card form" @submit.prevent="submit">
        <h3>留言</h3>

        <label class="fl"><span>姓名 *</span>
          <input class="input" v-model="form.name" placeholder="你的称呼" maxlength="32" />
        </label>
        <label class="fl"><span>电话 *</span>
          <input class="input" v-model="form.phone" placeholder="方便联系的手机号" maxlength="20" />
        </label>
        <label class="fl"><span>邮箱</span>
          <input class="input" v-model="form.email" placeholder="选填" maxlength="64" />
        </label>
        <label class="fl"><span>留言内容 *</span>
          <textarea class="input area" v-model="form.content" rows="5" maxlength="1000" placeholder="想咨询什么？"></textarea>
        </label>

        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="done" class="ok">{{ done }}</p>

        <button class="btn btn-primary btn-block" :disabled="sending" type="submit">
          {{ sending ? '提交中…' : '提交留言' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; margin: 0 auto; padding: var(--s-10) var(--s-8) var(--s-12); }
.head { margin-bottom: var(--s-6); }
.head h1 { font-size: var(--fs-2xl); margin-bottom: 6px; }
.cols { display: grid; grid-template-columns: 1fr 1.1fr; gap: var(--s-5); align-items: start; }

.info { padding: var(--s-6); }
.info h3 { font-size: var(--fs-md); margin-bottom: var(--s-4); }
.info ul { list-style: none; display: flex; flex-direction: column; gap: var(--s-4); }
.info li { display: flex; gap: var(--s-4); font-size: var(--fs-sm); }
.info i { font-style: normal; color: var(--ink-400); width: 40px; flex: 0 0 auto; }
.info span { color: var(--ink-700); }
.map-block { margin-top: var(--s-5); }
.map-label {
  display: flex; align-items: baseline; gap: 8px;
  font-size: var(--fs-xs); font-weight: 600; color: var(--ink-700);
  margin-bottom: 8px;
}
.map-label em { font-style: normal; font-weight: 400; color: var(--ink-300); font-size: 10.5px; }

.form { padding: var(--s-6); display: flex; flex-direction: column; gap: var(--s-4); }
.form h3 { font-size: var(--fs-md); }
.fl { display: block; }
.fl span { display: block; font-size: var(--fs-sm); color: var(--ink-500); margin-bottom: 6px; font-weight: 500; }
.area { height: auto; padding: 10px 12px; line-height: 1.6; resize: vertical; }
.ok { color: var(--ok-600); font-size: var(--fs-sm); }

@media (max-width: 900px) {
  .page { padding: var(--s-6) var(--s-4) var(--s-10); }
  .cols { grid-template-columns: 1fr; }
}
</style>
