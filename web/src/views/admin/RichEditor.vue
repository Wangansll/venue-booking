<script setup lang="ts">
/**
 * 轻量富文本编辑器：contenteditable + document.execCommand
 * 不引第三方库（体积 0），满足后台写文章的基本需求：
 * 标题 / 加粗 / 斜体 / 下划线 / 列表 / 引用 / 链接 / 插图 / 清除格式
 */
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const el = ref<HTMLDivElement | null>(null)
const html = ref(props.modelValue || '')

const TOOLS = [
  { cmd: 'bold', label: 'B', title: '加粗', style: 'font-weight:800' },
  { cmd: 'italic', label: 'I', title: '斜体', style: 'font-style:italic' },
  { cmd: 'underline', label: 'U', title: '下划线', style: 'text-decoration:underline' },
  { cmd: 'insertUnorderedList', label: '•', title: '无序列表' },
  { cmd: 'insertOrderedList', label: '1.', title: '有序列表' },
  { cmd: 'formatBlock:h2', label: 'H2', title: '二级标题' },
  { cmd: 'formatBlock:blockquote', label: '“', title: '引用' },
]

function exec(cmd: string) {
  el.value?.focus()
  const [name, arg] = cmd.split(':')
  if (name === 'formatBlock' && arg) {
    document.execCommand('formatBlock', false, `<${arg}>`)
  } else {
    document.execCommand(name, false)
  }
  sync()
}

function link() {
  const url = prompt('链接地址', 'https://')
  if (!url) return
  el.value?.focus()
  document.execCommand('createLink', false, url)
  sync()
}

function image() {
  const url = prompt('图片路径（后台可先上传，再把 /uploads/xxx 填进来）', '/img/news_1.svg')
  if (!url) return
  el.value?.focus()
  document.execCommand('insertImage', false, url)
  sync()
}

function sync() {
  if (!el.value) return
  html.value = el.value.innerHTML
  emit('update:modelValue', html.value)
}

// 外部换内容时同步进去（只在差异很大时，避免打字时光标跳）
watch(() => props.modelValue, (v) => {
  if (el.value && v !== el.value.innerHTML) el.value.innerHTML = v || ''
})

onMounted(() => { if (el.value) el.value.innerHTML = props.modelValue || '' })
</script>

<template>
  <div class="rte">
    <div class="bar">
      <button v-for="t in TOOLS" :key="t.cmd" type="button" class="tb" :title="t.title"
              :style="t.style" @click="exec(t.cmd)">{{ t.label }}</button>
      <span class="sep"></span>
      <button type="button" class="tb" title="插入链接" @click="link">🔗</button>
      <button type="button" class="tb" title="插入图片" @click="image">🖼</button>
      <button type="button" class="tb" title="清除格式" @click="exec('removeFormat')">⌫</button>
    </div>
    <div
      ref="el"
      class="body"
      contenteditable="true"
      spellcheck="false"
      @input="sync"
      @blur="sync"
    ></div>
  </div>
</template>

<style scoped>
.rte { border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; background: #fff; }
.bar { display: flex; align-items: center; gap: 2px; padding: 6px; background: var(--line-soft); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tb {
  width: 28px; height: 28px; display: grid; place-items: center;
  border: 1px solid transparent; background: transparent; border-radius: 4px;
  font-size: 13px; color: var(--ink-700); cursor: pointer;
}
.tb:hover { background: #fff; border-color: var(--line); }
.sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
.body {
  min-height: 220px; max-height: 420px; overflow: auto;
  padding: 12px 14px; font-size: 14px; line-height: 1.8; outline: none;
}
.body:empty::before { content: '开始写正文…'; color: var(--ink-300); }
:deep(.body h2) { font-size: 18px; margin: 14px 0 8px; }
:deep(.body blockquote) { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--brand-200); color: var(--ink-500); background: var(--brand-50); }
:deep(.body img) { max-width: 100%; border-radius: 6px; }
:deep(.body ul), :deep(.body ol) { padding-left: 22px; }
</style>
