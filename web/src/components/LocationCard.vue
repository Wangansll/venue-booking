<script setup lang="ts">
/**
 * 地理位置卡片
 *
 * 为什么不嵌在线地图：
 *   - 高德 / 百度 SDK 需要 API Key + 商用授权，个人演示域名通常过不了
 *   - OpenStreetMap 在本机网络不可达（实测超时），iframe 会是白框
 * 所以这里用「自绘位置示意 + URI 外链」：
 *   外链是高德/百度的公开 URI 接口，不需要 Key，点击直接用本机地图 App 打开。
 */
import { ref, computed } from 'vue'

const ADDRESS = '广西南宁市青秀区民族大道 · 东区体育馆 1F'
const LAT = 22.8165
const LON = 108.3665

const amap = computed(() =>
  `https://uri.amap.com/marker?position=${LON},${LAT}&name=${encodeURIComponent('东区体育馆')}&coordinate=gaode&callnative=1`)
const baidu = computed(() =>
  `https://api.map.baidu.com/marker?location=${LAT},${LON}&title=${encodeURIComponent('东区体育馆')}&content=${encodeURIComponent(ADDRESS)}&output=html&src=webapp.venue.demo`)

const copied = ref(false)
async function copyAddr() {
  try {
    await navigator.clipboard.writeText(ADDRESS)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch { /* 剪贴板不可用就忽略 */ }
}
</script>

<template>
  <div class="loc">
    <!-- 自绘位置示意：城市路网 + 场馆标记 -->
    <svg class="sketch" viewBox="0 0 640 200" role="img" aria-label="场馆周边位置示意">
      <defs>
        <pattern id="blocks" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#f4f7fc" />
          <rect x="4" y="4" width="32" height="32" rx="3" fill="#e9eef7" />
        </pattern>
      </defs>

      <rect width="640" height="200" fill="url(#blocks)" />

      <!-- 主干道 -->
      <rect x="0" y="92" width="640" height="16" fill="#dfe6f2" />
      <rect x="0" y="94" width="640" height="1.5" fill="#fff" stroke-dasharray="10 8" stroke="#c9d2e0" />
      <text x="12" y="86" font-size="10" fill="#8b93a5">民族大道</text>

      <rect x="300" y="0" width="14" height="200" fill="#dfe6f2" />
      <text x="322" y="18" font-size="10" fill="#8b93a5">園湖路</text>

      <!-- 绿地 -->
      <rect x="470" y="120" width="130" height="62" rx="8" fill="#e7f6ec" />
      <text x="535" y="156" text-anchor="middle" font-size="10" fill="#5c9b74">南湖公园</text>

      <!-- 场馆标记 -->
      <g transform="translate(238 78)">
        <circle r="17" fill="#3b6ef5" fill-opacity="0.14" />
        <circle r="9" fill="#3b6ef5" />
        <circle r="3.4" fill="#fff" />
      </g>
      <text x="238" y="52" text-anchor="middle" font-size="11.5" font-weight="700" fill="#2c58d8">东区体育馆</text>

      <!-- 地铁站 -->
      <g transform="translate(352 118)">
        <rect x="-9" y="-9" width="18" height="18" rx="4" fill="#fff" stroke="#d98324" stroke-width="2" />
        <text x="0" y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#d98324">M</text>
      </g>
      <text x="352" y="138" text-anchor="middle" font-size="9.5" fill="#8b93a5">地铁 1 号线</text>
    </svg>

    <div class="info">
      <p class="addr">{{ ADDRESS }}</p>
      <div class="acts">
        <button class="btn btn-sm" @click="copyAddr">{{ copied ? '已复制' : '复制地址' }}</button>
        <a class="btn btn-sm" :href="amap" target="_blank" rel="noopener noreferrer">高德地图 ↗</a>
        <a class="btn btn-sm" :href="baidu" target="_blank" rel="noopener noreferrer">百度地图 ↗</a>
      </div>
    </div>

    <p class="tip muted">示意位置 · 演示项目，正式上线请替换为场馆实测坐标</p>
  </div>
</template>

<style scoped>
.loc { border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; background: #fff; }
.sketch { display: block; width: 100%; height: auto; }
.info { padding: 12px 14px 0; }
.addr { margin: 0 0 10px; font-size: var(--fs-sm); color: var(--ink-700); }
.acts { display: flex; gap: 6px; flex-wrap: wrap; }
.acts .btn { text-decoration: none; }
.tip { padding: 10px 14px 12px; margin: 0; font-size: 10.5px; color: var(--ink-300); }
</style>
