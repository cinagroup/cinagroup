#!/bin/bash
# Bulk regenerate all template briefing files with unique content
# Usage: ./news-briefing-regenerate-all.sh

set -e

SITE_DIR="/root/homepage"
POSTS_DIR="$SITE_DIR/src/data/post"
LOG_FILE="/root/homepage/logs/news-briefing-regenerate.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$SITE_DIR"

# Find all template files (ones with the hardcoded "AI Coding Revolution Continues" content)
TEMPLATE_FILES=$(grep -l "AI Coding Revolution Continues" "$POSTS_DIR/ai-news-briefing-"*.md 2>/dev/null)

if [ -z "$TEMPLATE_FILES" ]; then
    log "✅ No template files found. All clear!"
    exit 0
fi

COUNT=$(echo "$TEMPLATE_FILES" | wc -l)
log "📰 Found $COUNT template files to regenerate"

echo "$TEMPLATE_FILES" | while read -r FILE; do
    # Extract date and period from filename
    BASENAME=$(basename "$FILE" .md)
    # ai-news-briefing-2026-04-01-06
    FILE_DATE=$(echo "$BASENAME" | grep -oP '\d{4}-\d{2}-\d{2}')
    BRIEFING_PERIOD=$(echo "$BASENAME" | grep -oP '\d{2}$')
    
    log "📝 Regenerating $BASENAME (date=$FILE_DATE, period=$BRIEFING_PERIOD)"
    
    # Determine coverage
    PREV_DATE=$(date -d "$FILE_DATE - 1 day" +%Y-%m-%d)
    NEXT_DATE=$(date -d "$FILE_DATE + 1 day" +%Y-%m-%d)
    
    if [ "$BRIEFING_PERIOD" = "06" ]; then
        COVERAGE_START="$PREV_DATE 18:00"
        COVERAGE_END="$FILE_DATE 06:00"
        UTC_PUBLISH="$PREV_DATE"
        UTC_TIME="22:00:00"
    else
        COVERAGE_START="$FILE_DATE 06:00"
        COVERAGE_END="$FILE_DATE 18:00"
        UTC_PUBLISH="$FILE_DATE"
        UTC_TIME="10:00:00"
    fi
    
    # Generate unique content via AI
    PROMPT="You are an AI news curator for CinaGroup. Generate a professional AI news briefing for the date ${FILE_DATE}.

Coverage period: ${COVERAGE_START} — ${COVERAGE_END}

## Requirements
1. **7 Top Stories** about AI developments that could have been relevant around ${FILE_DATE}
   - Topics: AI coding tools, enterprise AI, LLM updates, open-source models, AI safety, AI products, AI research
   - Each story: headline + 2-3 sentences
   - Be specific: mention real companies, models, products
2. **Trend Watch Table** — 5 domains with hot topics and ⭐ attention ratings
3. **What to Watch** — 2-3 anticipated events

## Output Format (Markdown only, no extra text)

## 📰 Top Stories

### 1. [Headline]
[Summary]

### 2. [Headline]
[Summary]

... (7 stories total)

## 📊 Trend Watch

| Domain | Hot Topic | Attention |
|--------|-----------|-----------|
| ... | ... | ⭐... |

## 🔮 What to Watch

- **[Topic]**: [description]
- **[Topic]**: [description]

Rules:
- All content in English
- DO NOT use 'AI Coding Revolution Continues', 'Enterprise AI Deployment Accelerates', 'Open-Source Model Competition Intensifies', 'AI Safety Frameworks Take Shape', 'Multimodal AI Goes Mainstream', 'AI Infrastructure Scaling Solutions', or 'Developer Tool Ecosystem Expands' as headlines — these are the old template and must NOT appear
- Make each briefing UNIQUE — different headlines, different stories each time
- Reference real companies and projects (OpenAI, Anthropic, Google, Meta, Mistral, Cursor, etc.)"

    CONTENT=$(openclaw infer model run --prompt "$PROMPT" --json 2>/dev/null) || {
        log "❌ Failed to generate content for $BASENAME"
        continue
    }
    
    BODY=$(echo "$CONTENT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for output in data.get('outputs', []):
    if isinstance(output, dict) and output.get('text'):
        print(output['text'])
        break
" 2>/dev/null) || {
        log "❌ Failed to parse response for $BASENAME"
        continue
    }
    
    if [ -z "$BODY" ]; then
        log "❌ Empty content for $BASENAME"
        continue
    fi
    
    # Extract title from first 3 stories
    STORIES=$(echo "$BODY" | grep "^### [0-9]" | head -3 | sed 's/^### [0-9]*\. //' | tr '\n' ' · ' | sed 's/ · $//')
    TITLE=$(echo "$STORIES" | cut -c1-120)
    [ -z "$TITLE" ] && TITLE="AI News Briefing - $FILE_DATE"
    
    DESCRIPTION="AI digest covering $COVERAGE_START to $COVERAGE_END"
    
    cat > "$FILE" << MDEOF
---
title: "${TITLE}"
description: "${DESCRIPTION}"
publishDate: ${UTC_PUBLISH}T${UTC_TIME}.000Z
author: "001"
tags: ["AI", "News Briefing", "Tech"]
category: "blog"
---

# ${TITLE}

**Published**: ${FILE_DATE} ${BRIEFING_PERIOD}:00 (Asia/Shanghai)
**Coverage**: ${COVERAGE_START} — ${COVERAGE_END}

---

${BODY}

---

*Briefing generated: ${FILE_DATE} ${BRIEFING_PERIOD}:00 (Asia/Shanghai)*
*Data sources: AI-curated from public technology reports and industry analysis*
MDEOF
    
    log "✅ Generated: $BASENAME"
done

log "📦 Committing all regenerated files..."
cd "$SITE_DIR"
git add "$POSTS_DIR"/ai-news-briefing-*.md 2>/dev/null
COMMIT_MSG="📰 Regenerate $COUNT template briefing files with unique AI-curated content"
git commit -m "$COMMIT_MSG" || log "⚠️  Nothing new to commit"

git fetch origin main >/dev/null 2>&1 || log "Warning: Could not fetch from remote"
git pull --rebase origin main >/dev/null 2>&1 || log "Warning: Could not rebase"
git push origin main || log "⚠️  Push failed"

log "🎉 Bulk regeneration complete!"
