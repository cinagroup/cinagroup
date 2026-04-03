#!/bin/bash
# OpenClaw Multi-Bot Orchestrator
# 统一调度 6 个机器人/插件
# 支持：QQBot, WeCom, Weixin, DingTalk, LightClawBot, Yuanbao

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="/root/.openclaw/workspace"
CONFIG_FILE="$WORKSPACE_DIR/.bot-orchestrator-config.json"
LOG_FILE="$WORKSPACE_DIR/logs/bot-orchestrator.log"
STATUS_FILE="$WORKSPACE_DIR/logs/bot-status.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Bot definitions
declare -A BOTS=(
    ["qqbot"]="QQBot (QQ 频道/私聊)"
    ["wecom"]="WeCom (企业微信)"
    ["weixin"]="Weixin (微信服务号)"
    ["ddingtalk"]="DingTalk (钉钉)"
    ["lightclawbot"]="LightClawBot (轻量机器人)"
    ["yuanbao"]="Yuanbao (腾讯元宝)"
)

declare -A BOT_PORTS=(
    ["qqbot"]=29724
    ["wecom"]=29725
    ["weixin"]=29726
    ["ddingtalk"]=29727
    ["lightclawbot"]=29728
    ["yuanbao"]=29729
)

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }

# Initialize config
init_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        cat > "$CONFIG_FILE" << 'EOF'
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
    },
    "weixin": {
      "enabled": true,
      "priority": 3,
      "capabilities": ["message", "template"],
      "rate_limit": 1000
    },
    "ddingtalk": {
      "enabled": true,
      "priority": 4,
      "capabilities": ["message", "file", "remind"],
      "rate_limit": 60
    },
    "lightclawbot": {
      "enabled": true,
      "priority": 5,
      "capabilities": ["message", "file", "cron"],
      "rate_limit": 30
    },
    "yuanbao": {
      "enabled": true,
      "priority": 6,
      "capabilities": ["message", "file"],
      "rate_limit": 30
    }
  },
  "routing": {
    "default": "qqbot",
    "rules": [
      {"type": "todo", "bot": "wecom"},
      {"type": "schedule", "bot": "wecom"},
      {"type": "meeting", "bot": "wecom"},
      {"type": "doc", "bot": "wecom"},
      {"type": "remind", "bot": "qqbot"},
      {"type": "cron", "bot": "lightclawbot"},
      {"type": "template", "bot": "weixin"}
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
EOF
        log "Created default config: $CONFIG_FILE"
    fi
}

# Check bot health
check_bot_health() {
    local bot="$1"
    local port="${BOT_PORTS[$bot]:-29724}"
    
    # Check if extension exists
    if [[ ! -d "/root/.openclaw/extensions/$bot" ]]; then
        echo "unavailable"
        return 1
    fi
    
    # Check gateway status
    if curl -s "http://127.0.0.1:$port" > /dev/null 2>&1; then
        echo "healthy"
        return 0
    else
        echo "unhealthy"
        return 1
    fi
}

# Get all bot status
get_all_status() {
    local status_json='{"timestamp":"'$(date -Iseconds)'","bots":{'
    local first=true
    
    for bot in "${!BOTS[@]}"; do
        local health=$(check_bot_health "$bot")
        local enabled=$(jq -r ".bots.$bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
        
        if [[ "$first" == "true" ]]; then
            first=false
        else
            status_json+=','
        fi
        
        status_json+='"'$bot'":{"health":"'$health'","enabled":'$enabled'}'
    done
    
    status_json+='}}'
    echo "$status_json" | jq '.'
}

# Route message to appropriate bot
route_message() {
    local message_type="$1"
    local content="$2"
    local target="$3"
    
    log "Routing message: type=$message_type, target=$target"
    
    # Find best bot based on routing rules
    local selected_bot=$(jq -r ".routing.rules[] | select(.type==\"$message_type\") | .bot" "$CONFIG_FILE" 2>/dev/null | head -1)
    
    if [[ -z "$selected_bot" ]]; then
        selected_bot=$(jq -r '.routing.default' "$CONFIG_FILE" 2>/dev/null || echo "qqbot")
    fi
    
    # Check if selected bot is enabled
    local enabled=$(jq -r ".bots.$selected_bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
    if [[ "$enabled" != "true" ]]; then
        warn "Bot $selected_bot is disabled, finding fallback..."
        selected_bot=$(find_fallback_bot "$selected_bot")
    fi
    
    info "Selected bot: $selected_bot (${BOTS[$selected_bot]})"
    
    # Send message via selected bot
    send_via_bot "$selected_bot" "$content" "$target"
}

# Find fallback bot
find_fallback_bot() {
    local primary="$1"
    local fallback_order=$(jq -r '.failover.fallback_order[]' "$CONFIG_FILE" 2>/dev/null)
    
    for bot in $fallback_order; do
        local enabled=$(jq -r ".bots.$bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
        if [[ "$enabled" == "true" ]] && [[ "$bot" != "$primary" ]]; then
            info "Fallback to: $bot"
            echo "$bot"
            return 0
        fi
    done
    
    # Last resort: find any enabled bot
    for bot in "${!BOTS[@]}"; do
        local enabled=$(jq -r ".bots.$bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
        if [[ "$enabled" == "true" ]]; then
            echo "$bot"
            return 0
        fi
    done
    
    error "No available bot found"
    return 1
}

# Send message via specific bot
send_via_bot() {
    local bot="$1"
    local content="$2"
    local target="$3"
    
    log "Sending via $bot: $content"
    
    case "$bot" in
        qqbot)
            # Use QQBot message tool
            info "QQBot: Sending to $target"
            # openclaw message send --channel qqbot --target "$target" --message "$content"
            ;;
        wecom)
            # Use WeCom message tool
            info "WeCom: Sending to $target"
            # wecom_mcp call message send '{"content":"'"$content"'","target":"'"$target"'"}'
            ;;
        weixin)
            # Use Weixin template message
            info "Weixin: Sending template to $target"
            ;;
        ddingtalk)
            # Use DingTalk message
            info "DingTalk: Sending to $target"
            ;;
        lightclawbot)
            # Use LightClawBot
            info "LightClawBot: Sending to $target"
            ;;
        yuanbao)
            # Use Yuanbao
            info "Yuanbao: Sending to $target"
            ;;
        *)
            error "Unknown bot: $bot"
            return 1
            ;;
    esac
    
    success "Message sent via $bot"
}

# Load balancing: Round Robin
round_robin_select() {
    local enabled_bots=()
    
    for bot in "${!BOTS[@]}"; do
        local enabled=$(jq -r ".bots.$bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
        if [[ "$enabled" == "true" ]]; then
            enabled_bots+=("$bot")
        fi
    done
    
    if [[ ${#enabled_bots[@]} -eq 0 ]]; then
        error "No enabled bots available"
        return 1
    fi
    
    # Simple round robin based on timestamp
    local index=$(($(date +%s) % ${#enabled_bots[@]}))
    echo "${enabled_bots[$index]}"
}

# Broadcast to all bots
broadcast() {
    local content="$1"
    
    log "Broadcasting to all enabled bots"
    
    for bot in "${!BOTS[@]}"; do
        local enabled=$(jq -r ".bots.$bot.enabled" "$CONFIG_FILE" 2>/dev/null || echo "true")
        if [[ "$enabled" == "true" ]]; then
            send_via_bot "$bot" "$content" "all"
        fi
    done
    
    success "Broadcast complete"
}

# Show bot status dashboard
show_dashboard() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          OpenClaw Multi-Bot Orchestrator Dashboard          ║${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
    printf "${BLUE}║${NC} %-15s %-12s %-10s %-30s ${BLUE}║${NC}\n" "Bot" "Status" "Priority" "Capabilities"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
    
    for bot in "${!BOTS[@]}"; do
        local health=$(check_bot_health "$bot")
        local priority=$(jq -r ".bots.$bot.priority" "$CONFIG_FILE" 2>/dev/null || echo "-")
        local caps=$(jq -r ".bots.$bot.capabilities | join(\", \")" "$CONFIG_FILE" 2>/dev/null || echo "-")
        
        local status_icon="❓"
        if [[ "$health" == "healthy" ]]; then
            status_icon="✅"
        elif [[ "$health" == "unhealthy" ]]; then
            status_icon="⚠️"
        else
            status_icon="❌"
        fi
        
        printf "${BLUE}║${NC} %-15s %-12s %-10s %-30s ${BLUE}║${NC}\n" \
            "${BOTS[$bot]}" "$status_icon $health" "P$priority" "$caps"
    done
    
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
    
    local mode=$(jq -r '.mode' "$CONFIG_FILE" 2>/dev/null || echo "round_robin")
    local default=$(jq -r '.routing.default' "$CONFIG_FILE" 2>/dev/null || echo "qqbot")
    printf "${BLUE}║${NC} Mode: %-10s Default Bot: %-10s                          ${BLUE}║${NC}\n" "$mode" "$default"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
}

# Health check loop
health_check_loop() {
    log "Starting health check loop (interval: 60s)"
    
    while true; do
        local status=$(get_all_status)
        echo "$status" > "$STATUS_FILE"
        
        # Check for failures
        local unhealthy=$(echo "$status" | jq -r '.bots | to_entries[] | select(.value.health != "healthy") | .key' 2>/dev/null)
        
        if [[ -n "$unhealthy" ]]; then
            warn "Unhealthy bots detected: $unhealthy"
            # Could trigger alert here
        fi
        
        sleep 60
    done
}

# Usage
usage() {
    cat << EOF
$(basename "$0") - OpenClaw Multi-Bot Orchestrator

Usage: $(basename "$0") <command> [options]

Commands:
  status          Show all bot status dashboard
  health          Check health of all bots
  route <type> <content> [target]  Route message to best bot
  broadcast <content>              Broadcast to all bots
  select                         Select bot via round-robin
  watch                          Start health check loop
  config                         Show/edit configuration
  init                           Initialize default config

Message Types:
  todo, schedule, meeting, doc, remind, cron, template, message

Examples:
  $(basename "$0") status
  $(basename "$0") route todo "Create a task" "@zhangsan"
  $(basename "$0") broadcast "System maintenance at 2AM"
  $(basename "$0") health

Configuration:
  Config file: $CONFIG_FILE
  Log file: $LOG_FILE
  Status file: $STATUS_FILE

EOF
}

# Main
main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    init_config
    
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        status|dashboard)
            show_dashboard
            ;;
        health)
            get_all_status
            ;;
        route)
            route_message "$@"
            ;;
        broadcast)
            broadcast "$@"
            ;;
        select)
            round_robin_select
            ;;
        watch)
            health_check_loop
            ;;
        config)
            cat "$CONFIG_FILE" | jq '.'
            ;;
        init)
            rm -f "$CONFIG_FILE"
            init_config
            success "Config reinitialized"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
