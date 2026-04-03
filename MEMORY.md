# 🧠 OpenClaw Long-Term Memory

> **Last Updated**: 2026-04-03
> **Owner**: 001 (AI Assistant)
> **Human**: 十三先生

---

## 📋 Memory Index

### User Profile (用户画像)
| File | Type | Updated | Description |
|------|------|---------|-------------|
| `memory-tdai/persona.md` | `user` | 2026-04-02 | 用户叙事档案 - 核心原型、偏好、交互协议 |
| `memory-tdai/scene_blocks/数字资产 - 微信服务号.md` | `reference` | 2026-04-02 | 微信服务号自动化系统配置与业务线 |

### Project Context (项目上下文)
| File | Type | Updated | Description |
|------|------|---------|-------------|
| `memory/2026-03-30/incident-2026-03-30-0600-missed-publish.md` | `feedback` | 2026-03-30 | 新闻早报发布失败事件复盘 |
| `memory-tdai/scene_blocks/工作偏好 - 新闻简报.md` | `project` | 2026-04-02 | 新闻简报格式规范与发布策略 |

### Active Sessions (活跃会话)
| File | Type | Updated | Description |
|------|------|---------|-------------|
| `memory/working/current-task.md` | `session` | - | 当前任务状态追踪 |

---

## 🎯 Memory Types

### `user` - 用户画像
用户角色、偏好、习惯、知识背景。用于个性化交互。

### `feedback` - 指导反馈
明确的"应当"和"不应当"规则，源于用户纠正或系统故障复盘。

### `project` - 项目动态
项目目标、关键决策、架构逻辑、Incidents 总结。

### `reference` - 外部指针
API 文档、工具链接、重要资源索引。

### `session` - 会话状态
当前任务进度、下一步计划、临时上下文。

---

## ⚠️ Usage Guidelines

### What TO Save
- 用户明确表达偏好或纠正
- 系统故障根因与修复方案
- 跨会话的业务决策
- 工具配置细节（API Key 位置、部署路径）
- 用户身份/业务版图变化

### What NOT to Save
- 代码内容（应使用 `grep` 或代码库）
- 临时对话细节（应使用会话摘要）
- 可通过读取文件获取的信息
- 敏感凭证（应使用环境变量或加密存储）

---

## 🔒 Security Rules

1. **Path Containment**: 记忆写入仅限 `memory/` 和 `memory-tdai/` 目录
2. **No Symlink Follow**: 禁止跟随符号链接写入
3. **Main Session Only**: `MEMORY.md` 仅在直接对话中加载
4. **No External Leak**: 群聊/共享会话中不引用个人记忆

---

## 📝 Memory Maintenance

### Daily (心跳检查时)
- 读取 `memory/YYYY-MM-DD.md`（今日 + 昨日）
- 更新 `working/current-task.md`

### Weekly (周日)
- 审查 `memory/shortterm/` 文件
- 将重要内容迁移至 `memory/longterm/` 或 `scene_blocks/`

### Monthly
- 审查 `MEMORY.md` 索引
- 清理过期引用
- 更新用户画像

---

## 📍 File Locations

```
/root/.openclaw/
├── workspace/
│   ├── MEMORY.md              # 本文件 - 长期记忆索引
│   ├── USER.md                # 用户基础信息
│   ├── SOUL.md                # AI 人格定义
│   └── memory/
│       ├── YYYY-MM-DD.md      # 每日会话日志
│       ├── longterm/          # 长期记忆归档
│       ├── shortterm/         # 短期记忆（待审查）
│       └── working/           # 工作区临时记忆
└── memory-tdai/
    ├── persona.md             # 用户叙事档案
    ├── scene_blocks/          # 场景记忆（带热度）
    ├── conversations/         # 对话记录
    └── records/               # 事件记录
```

---

*Memory System v2.0 - Inspired by Claude Code memdir architecture*
