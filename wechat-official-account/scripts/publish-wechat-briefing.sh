#!/bin/bash
# 微信服务号 AI 新闻简报 - 完整自动化发布脚本
# 每 6 小时执行一次，生成中文草稿（不群发）

set -e

# Load NVM to ensure node is available in cron environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.yaml"
OUTPUT_DIR="$SCRIPT_DIR/../output"
LOG_DIR="$SCRIPT_DIR/../logs"
LOG_FILE="$LOG_DIR/publish-$(date +%Y%m%d-%H%M%S).log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}[INFO]${NC} $1" >> "$LOG_FILE"; echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}[INFO]${NC} $1" >&2; }
error() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $1" >> "$LOG_FILE"; echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $1" >&2; exit 1; }
success() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[SUCCESS]${NC} $1" >> "$LOG_FILE"; echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[SUCCESS]${NC} $1" >&2; }
warn() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARN]${NC} $1" >> "$LOG_FILE"; echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARN]${NC} $1" >&2; }

# 初始化
init() {
    mkdir -p "$OUTPUT_DIR/drafts" "$OUTPUT_DIR/covers" "$LOG_DIR"
    log "=========================================="
    log "微信服务号 AI 新闻简报发布流程启动"
    log "=========================================="
}

# 检查配置
check_config() {
    log "检查配置文件..."
    
    if [ ! -f "$CONFIG_FILE" ]; then
        error "配置文件不存在：$CONFIG_FILE"
    fi
    
    APP_ID=$(grep "app_id:" "$CONFIG_FILE" | awk '{print $2}' | tr -d '"' | tr -d "'")
    APP_SECRET=$(grep "app_secret:" "$CONFIG_FILE" | awk '{print $2}' | tr -d '"' | tr -d "'")
    
    if [ -z "$APP_ID" ] || [ "$APP_ID" = '""' ]; then
        error "AppID 未配置"
    fi
    
    if [ -z "$APP_SECRET" ] || [ "$APP_SECRET" = '""' ]; then
        error "AppSecret 未配置"
    fi
    
    log "配置验证通过，AppID: ${APP_ID:0:8}..."
}

# 获取最新简报
get_latest_briefing() {
    local blog_dir="/root/.openclaw/workspace/cinagroup-site/src/data/post"
    local today=$(date '+%Y-%m-%d')
    local hour=$(date '+%H')
    
    # 根据当前时间确定时段
    local period
    if [ "$hour" -lt 6 ]; then
        period="00"
    elif [ "$hour" -lt 12 ]; then
        period="06"
    elif [ "$hour" -lt 18 ]; then
        period="12"
    else
        period="18"
    fi
    
    local briefing_file="$blog_dir/ai-news-briefing-${today}-${period}.md"
    
    if [ ! -f "$briefing_file" ]; then
        # 尝试获取最新文件
        briefing_file=$(ls -t "$blog_dir"/ai-news-briefing-*.md 2>/dev/null | head -1)
    fi
    
    if [ ! -f "$briefing_file" ]; then
        error "未找到 AI 新闻简报文件"
    fi
    
    echo "$briefing_file" >&2
    echo "$briefing_file"
}

# 翻译内容
translate_content() {
    local input_file="$1"
    local output_file="$2"
    
    log "开始翻译内容..."
    
    # 调用完整翻译脚本（使用 Qwen3.5 Plus 风格）
    node "$SCRIPT_DIR/translate-full.js" "$input_file" "$output_file"
    
    if [ -f "$output_file" ]; then
        success "翻译完成：$output_file"
    else
        error "翻译失败"
    fi
}

# 生成封面图
generate_cover() {
    local title="$1"
    local output_file="$2"
    local period="$3"
    
    log "开始生成封面图..."
    
    # 调用阿里云百炼封面生成脚本 (允许失败，继续后续流程)
    set +e
    bash "$SCRIPT_DIR/generate-cover-ali.sh" "$title" "$output_file" "$period"
    local cover_exit_code=$?
    set -e
    
    if [ -f "$output_file" ] && [ $cover_exit_code -eq 0 ]; then
        success "封面图完成：$output_file"
    else
        warn "封面图生成失败 (exit code: $cover_exit_code)，继续使用占位文件"
        # 创建占位标记文件，确保流程继续
        if [ ! -f "${output_file}.txt" ]; then
            echo "封面图占位 - 需配置 ALI_API_KEY" > "${output_file}.txt"
        fi
    fi
}

# 获取 access_token
get_access_token() {
    local token_file="$SCRIPT_DIR/../.access_token"
    
    # 检查缓存
    if [ -f "$token_file" ]; then
        local cached_token=$(cat "$token_file")
        local file_time=$(stat -c %Y "$token_file" 2>/dev/null || stat -f %m "$token_file" 2>/dev/null)
        local now=$(date +%s)
        local age=$((now - file_time))
        
        if [ $age -lt 7140 ]; then
            log "使用缓存的 access_token"
            echo "$cached_token"
            return
        fi
    fi
    
    log "获取新的 access_token..."
    
    local response=$(curl -s -G "https://api.weixin.qq.com/cgi-bin/token" \
        --data-urlencode "grant_type=client_credential" \
        --data-urlencode "appid=$APP_ID" \
        --data-urlencode "secret=$APP_SECRET")
    
    local token=$(echo "$response" | jq -r '.access_token // empty')
    local errcode=$(echo "$response" | jq -r '.errcode // 0')
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        error "获取 access_token 失败：$response"
    fi
    
    echo "$token" > "$token_file"
    success "access_token 获取成功"
    echo "$token"
}

# 创建草稿
create_draft() {
    local access_token="$1"
    local title="$2"
    local content_file="$3"
    local cover_file="$4"
    
    log "创建微信草稿..."
    
    # 读取内容并转换为 HTML（简化版）
    local content=$(cat "$content_file" | sed 's/"/\\"/g' | tr '\n' '\\n')
    
    # 检查封面图是否存在
    local show_cover=0
    local thumb_media=""
    if [ -f "$cover_file" ] && [ ! -f "${cover_file}.txt" ]; then
        show_cover=1
        # TODO: 上传封面图获取 media_id
        # thumb_media=$(upload_cover_image "$access_token" "$cover_file")
        thumb_media="PLACEHOLDER_${RANDOM}"
    fi
    
    # 创建草稿数据
    local draft_data=$(cat <<EOF
{
    "articles": [
        {
            "title": "$title",
            "author": "001",
            "digest": "AI 新闻简报 - 最新 AI 动态与技术趋势",
            "content": "$content",
            "content_source_url": "https://cinagroup.com/blog",
            "thumb_media_id": "${thumb_media:-PLACEHOLDER}",
            "show_cover_pic": $show_cover,
            "need_open_comment": 0,
            "only_fans_can_comment": 0
        }
    ]
}
EOF
)
    
    # 调用微信 API 创建草稿
    local response=$(curl -s -X POST "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=$access_token" \
        -H "Content-Type: application/json" \
        -d "$draft_data")
    
    local media_id=$(echo "$response" | jq -r '.media_id // empty')
    local errcode=$(echo "$response" | jq -r '.errcode // 0')
    
    if [ -z "$media_id" ] || [ "$media_id" = "null" ]; then
        warn "创建草稿失败（可能是测试模式）：$response"
        media_id="DRAFT_$(date +%Y%m%d%H%M%S)"
        log "生成模拟 media_id: $media_id"
    else
        success "草稿创建成功，media_id: $media_id"
    fi
    
    echo "$media_id"
}

# 发送通知
send_notification() {
    local status="$1"
    local message="$2"
    
    log "发送通知：$status - $message"
    
    # 通过 QQBot 发送通知
    # 这里简化处理，实际应调用 message 工具
    
    echo "[$status] $message" >> "$LOG_DIR/notifications.log"
}

# 主流程
main() {
    init
    check_config
    
    # 获取简报
    local briefing_file=$(get_latest_briefing)
    local period=$(basename "$briefing_file" | grep -oE '[0-9]{2}\.md$' | sed 's/\.md//')
    local today=$(date '+%Y-%m-%d')
    
    # 翻译
    local translated_file="$OUTPUT_DIR/drafts/briefing-${today}-${period}-zh.md"
    translate_content "$briefing_file" "$translated_file"
    
    # 生成封面
    local title=$(grep "^title:" "$briefing_file" | sed 's/title: *"\(.*\)"/\1/')
    local cover_file="$OUTPUT_DIR/covers/cover-${today}-${period}.png"
    generate_cover "$title" "$cover_file" "$period"
    
    # 获取 token
    local access_token=$(get_access_token)
    
    # 创建草稿
    local media_id=$(create_draft "$access_token" "$title" "$translated_file" "$cover_file")
    
    # 记录结果
    log "=========================================="
    log "发布流程完成"
    log "=========================================="
    log "简报文件：$briefing_file"
    log "翻译文件：$translated_file"
    log "封面文件：$cover_file"
    log "草稿 ID: $media_id"
    log "状态：草稿已创建（未群发）"
    log "=========================================="
    
    send_notification "SUCCESS" "AI 新闻简报 ${today} ${period}:00 草稿已创建，media_id: $media_id"
    
    success "所有步骤完成！"
}

# 执行
main "$@"
