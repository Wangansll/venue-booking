<script setup lang="ts">
/**
 * 场馆平面导览图 —— 纯 SVG 自绘，无第三方依赖、无地图服务授权问题。
 * 画的是东区体育馆一层平面：入口在大厅下方，篮球场居中，两侧是羽毛球与自习室。
 */
const ZONES = [
  { id: 'court', x: 210, y: 96, w: 300, h: 190, name: '篮球场', color: '#3b6ef5', seats: '28 × 15m' },
  { id: 'badminton', x: 44, y: 96, w: 150, h: 190, name: '羽毛球馆', color: '#8b5cf6', seats: '4 片场地' },
  { id: 'study', x: 526, y: 96, w: 150, h: 190, name: '自习室', color: '#0f9d58', seats: '40 座' },
  { id: 'locker', x: 44, y: 300, w: 200, h: 74, name: '更衣室', color: '#64748b', seats: '淋浴 6 间' },
  { id: 'service', x: 260, y: 300, w: 150, h: 74, name: '服务台', color: '#d98324', seats: '咨询 / 租借' },
  { id: 'rest', x: 426, y: 300, w: 250, h: 74, name: '休息区', color: '#0891b2', seats: '饮水 / 长椅' },
];
const HALL = { x: 44, y: 60, w: 632, h: 250 };
</script>

<template>
  <div class="map">
    <svg viewBox="0 0 720 420" role="img" aria-label="东区体育馆一层平面导览图">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e9eef7" stroke-width="1" />
        </pattern>
      </defs>

      <rect width="720" height="420" fill="#f8fafd" />
      <rect width="720" height="420" fill="url(#grid)" />

      <!-- 外墙 -->
      <rect :x="HALL.x" :y="HALL.y" :width="HALL.w" :height="HALL.h"
            rx="10" fill="#fff" stroke="#c9d2e0" stroke-width="2" />

      <!-- 分区 -->
      <g v-for="z in ZONES" :key="z.id">
        <rect :x="z.x" :y="z.y" :width="z.w" :height="z.h" rx="7"
              :fill="z.color" fill-opacity="0.08" :stroke="z.color" stroke-opacity="0.45" />
        <text :x="z.x + z.w / 2" :y="z.y + z.h / 2 - 4" text-anchor="middle"
              font-size="14" font-weight="700" :fill="z.color">{{ z.name }}</text>
        <text :x="z.x + z.w / 2" :y="z.y + z.h / 2 + 13" text-anchor="middle"
              font-size="10.5" fill="#8b93a5">{{ z.seats }}</text>
      </g>

      <!-- 主入口 -->
      <path d="M 320 310 L 320 350 L 400 350 L 400 310" fill="#eff6ff" stroke="#3b6ef5" stroke-width="2" stroke-dasharray="5 4" />
      <text x="360" y="372" text-anchor="middle" font-size="11" fill="#3b6ef5" font-weight="600">主入口</text>

      <!-- 指北针 -->
      <g transform="translate(672 392)">
        <path d="M0 -14 L5 4 L0 0 L-5 4 Z" fill="#2b3446" />
        <text x="0" y="18" text-anchor="middle" font-size="10" fill="#8b93a5">N</text>
      </g>

      <!-- 图例 -->
      <g transform="translate(44 392)">
        <circle cx="0" cy="-4" r="4" fill="#3b6ef5" />
        <text x="12" y="0" font-size="10.5" fill="#8b93a5">一层平面 · 非比例尺</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.map { border-radius: var(--r-md); overflow: hidden; border: 1px solid var(--line); background: #f8fafd; }
.map svg { display: block; width: 100%; height: auto; }
</style>
