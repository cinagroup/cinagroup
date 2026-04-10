# 🔧 图标修复记录

## 问题图标替换

| 原图标 | 替换为 | 位置 | 状态 |
|--------|--------|------|------|
| `tabler:lightbulb` | `tabler:bulb` | about.astro | ✅ |
| `tabler:lightning` | `tabler:bolt` | cinachain/index.astro | ✅ |
| `tabler:gallery` | `tabler:photo` | cinachain/index.astro | ✅ |
| `tabler:gamepad` | `tabler:joystick` | cinachain/index.astro | ⏳ |
| `tabler:controller` | `tabler:joystick` | cinachain/index.astro | ⏳ |

## 修复命令

```bash
# 查找所有图标使用
grep -rn "icon: 'tabler:" src/pages/

# 批量替换
sed -i "s/tabler:gamepad/tabler:joystick/g" src/pages/cinachain/index.astro
sed -i "s/tabler:controller/tabler:joystick/g" src/pages/cinachain/index.astro
```

## 可用图标列表

经过测试，以下图标可用：

### 通用图标
- ✅ tabler:bulb (创意/想法)
- ✅ tabler:bolt (速度/能量)
- ✅ tabler:photo (图片/NFT)
- ✅ tabler:joystick (游戏)
- ✅ tabler:rocket (启动)
- ✅ tabler:code (代码)
- ✅ tabler:users (用户/团队)
- ✅ tabler:settings (设置)

### 业务图标
- ✅ tabler:search (CinaSeek)
- ✅ tabler:robot (CinaClaw)
- ✅ tabler:code (CinaSkill)
- ✅ tabler:link (CinaChain)

### 功能图标
- ✅ tabler:mail (邮件)
- ✅ tabler:phone (电话)
- ✅ tabler:calendar (日历)
- ✅ tabler:wallet (钱包)
- ✅ tabler:shield-lock (安全)

## 内联 SVG 方案

如果 Tabler 图标持续有问题，使用内联 SVG：

```astro
<!-- 游戏图标 -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
</svg>
```

---

**最后更新**: 2026-03-20 12:38  
**状态**: 修复中
