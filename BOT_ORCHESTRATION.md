# OpenClaw 多机器人统一调度系统

> **版本**: 1.0  
> **日期**: 2026-04-03  
> **支持机器人**: 6 个

---

## 🤖 支持的机器人

| 机器人 | 渠道 | 主要能力 | 优先级 |
|--------|------|----------|--------|
| **QQBot** | QQ 频道/私聊 | 消息、文件、提醒 | P1 |
| **WeCom** | 企业微信 | 消息、文件、待办、日程、会议、文档 | P2 |
| **Weixin** | 微信服务号 | 消息、模板消息 | P3 |
| **DingTalk** | 钉钉 | 消息、文件、提醒 | P4 |
| **LightClawBot** | 轻量机器人 | 消息、文件、定时任务 | P5 |
| **Yuanbao** | 腾讯元宝 | 消息、文件 | P6 |

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bot Orchestrator (统一调度层)                  │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  路由决策   │  │  负载均衡   │  │  故障转移   │             │
│  │  Routing    │  │  Load Balance│  │  Failover   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    QQBot      │   │    WeCom      │   │   Weixin      │
│  (QQ 频道)     │   │  (企业微信)    │   │  (微信服务号)  │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  DingTalk     │   │ LightClawBot  │   │   Yuanbao     │
│    (钉钉)      │   │ (轻量机器人)   │   │  (腾讯元宝)    │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

## 🚀 快速开始

### 1. 初始化配置
```bash
bash scripts/bot-orchestrator.sh init
```

### 2. 查看状态
```bash
bash scripts/bot-orchestrator.sh status
```

### 3. 发送消息
```bash
# 自动路由到最佳机器人
bash scripts/bot-orchestrator.sh route todo "创建待办：完成报告" "@zhangsan"

# 广播到所有机器人
bash scripts/bot-orchestrator.sh broadcast "系统维护通知：今晚 2AM"

# 轮询选择
bash scripts/bot-orchestrator.sh select
```

---

## 📋 路由规则

### 默认路由
| 消息类型 | 路由到 | 说明 |
|----------|--------|------|
| `todo` | WeCom | 企业微信待办 |
| `schedule` | WeCom | 企业微信日程 |
| `meeting` | WeCom | 企业微信会议 |
| `doc` | WeCom | 企业微信文档 |
| `remind` | QQBot | QQ 提醒 |
| `cron` | LightClawBot | 定时任务 |
| `template` | Weixin | 微信模板消息 |
| `message` | QQBot | 默认消息 |

### 自定义路由规则
编辑 `~/.openclaw/workspace/.bot-orchestrator-config.json`:

```json
{
  "routing": {
    "default": "qqbot",
    "rules": [
      {"type": "todo", "bot": "wecom"},
      {"type": "urgent", "bot": "ddingtalk"}
    ]
  }
}
```

---

## ⚖️ 负载均衡策略

### Round Robin (轮询)
```bash
# 自动选择下一个可用的机器人
bash scripts/bot-orchestrator.sh select
```

### Priority Based (优先级)
- 按优先级顺序选择 (P1 → P6)
- 高优先级不可用时自动降级

### Capability Based (能力匹配)
- 根据消息类型匹配机器人能力
- 自动选择最优机器人

---

## 🔄 故障转移

### 配置
```json
{
  "failover": {
    "enabled": true,
    "retry_count": 3,
    "retry_delay_ms": 1000,
    "fallback_order": ["qqbot", "wecom", "lightclawbot"]
  }
}
```

### 工作流程
```
主机器人 (WeCom) 失败
       ↓
重试 3 次 (间隔 1 秒)
       ↓
仍失败 → 故障转移
       ↓
备用机器人 1 (QQBot)
       ↓
仍失败 → 备用机器人 2 (LightClawBot)
```

---

## 📊 健康检查

### 手动检查
```bash
bash scripts/bot-orchestrator.sh health
```

### 自动监控
```bash
# 后台运行健康检查 (每 60 秒)
bash scripts/bot-orchestrator.sh watch &
```

### 状态输出
```json
{
  "timestamp": "2026-04-03T23:08:00+08:00",
  "bots": {
    "qqbot": {"health": "healthy", "enabled": true},
    "wecom": {"health": "healthy", "enabled": true},
    "weixin": {"health": "unhealthy", "enabled": true},
    "ddingtalk": {"health": "healthy", "enabled": true},
    "lightclawbot": {"health": "healthy", "enabled": true},
    "yuanbao": {"health": "unavailable", "enabled": true}
  }
}
```

---

## 🔧 配置选项

### 完整配置示例
```json
{
  "version": "1.0",
  "enabled": true,
  "mode": "round_robin",
  "bots": {
    "qqbot": {
      "enabled": true,
      "priority": 1,
      "capabilities": ["message", "file", "remind"],
      "rate_limit": 60
    },
    "wecom": {
      "enabled": true,
      "priority": 2,
      "capabilities": ["message", "file", "todo", "schedule", "meeting", "doc"],
      "rate_limit": 100
    }
  },
  "routing": {
    "default": "qqbot",
    "rules": [
      {"type": "todo", "bot": "wecom"},
      {"type": "schedule", "bot": "wecom"}
    ]
  },
  "failover": {
    "enabled": true,
    "retry_count": 3,
    "retry_delay_ms": 1000,
    "fallback_order": ["qqbot", "wecom", "lightclawbot"]
  },
  "monitoring": {
    "health_check_interval": 60,
    "alert_on_failure": true,
    "log_all_requests": true
  }
}
```

---

## 📁 文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| **脚本** | `scripts/bot-orchestrator.sh` | 主调度脚本 |
| **配置** | `.bot-orchestrator-config.json` | 调度配置 |
| **日志** | `logs/bot-orchestrator.log` | 运行日志 |
| **状态** | `logs/bot-status.json` | 实时状态 |

---

## 💡 使用场景

### 场景 1: 发送待办通知
```bash
# 自动路由到企业微信 (支持待办功能)
bot-orchestrator.sh route todo "完成 Q2 报告" "@zhangsan"
```

### 场景 2: 紧急通知广播
```bash
# 广播到所有可用机器人
bot-orchestrator.sh broadcast "🚨 紧急：服务器维护即将开始"
```

### 场景 3: 定时任务
```bash
# 路由到 LightClawBot (支持定时任务)
bot-orchestrator.sh route cron "每天 9 点发送日报提醒" "0 9 * * *"
```

### 场景 4: 会议邀请
```bash
# 路由到企业微信 (支持会议创建)
bot-orchestrator.sh route meeting "周会邀请" "周一 10:00"
```

---

## 🔍 监控命令

```bash
# 查看实时状态
bash scripts/bot-orchestrator.sh status

# 查看健康详情
bash scripts/bot-orchestrator.sh health | jq '.'

# 查看日志
tail -f logs/bot-orchestrator.log

# 查看配置
bash scripts/bot-orchestrator.sh config
```

---

## 🚨 故障排除

### 机器人不可用
```bash
# 检查扩展是否存在
ls -la /root/.openclaw/extensions/

# 检查网关状态
openclaw gateway status

# 重启网关
openclaw gateway restart
```

### 路由失败
```bash
# 检查配置
bash scripts/bot-orchestrator.sh config

# 手动选择机器人
bash scripts/bot-orchestrator.sh select
```

### 日志分析
```bash
# 查看错误日志
grep ERROR logs/bot-orchestrator.log | tail -20

# 查看特定机器人日志
grep "WeCom" logs/bot-orchestrator.log | tail -20
```

---

## 📈 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **路由延迟** | <100ms | 消息路由决策时间 |
| **故障转移时间** | <3s | 主备切换时间 |
| **健康检查间隔** | 60s | 状态检测频率 |
| **并发支持** | 1000/s | 每秒消息处理量 |

---

## 🔐 安全配置

### 访问控制
```json
{
  "security": {
    "allowed_targets": ["@zhangsan", "@lisi", "group-001"],
    "rate_limit_per_user": 60,
    "blocked_keywords": ["password", "secret"]
  }
}
```

---

*文档版本：1.0 | 最后更新：2026-04-03*
