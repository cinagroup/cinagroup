#!/bin/bash
# 中文页面验证脚本
# 用法：./verify-zh-pages.sh

echo "🔍 验证 CinaGroup 中文页面..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 基础 URL
BASE_URL="https://cinagroup.com"

# 测试页面列表
PAGES=(
  "/zh"
  "/zh/about"
  "/zh/contact"
  "/zh/cinaseek"
  "/zh/cinaclaw"
  "/zh/cinatoken"
  "/zh/cinaskill"
  "/zh/cinachain"
  "/zh/blog"
)

# 计数器
TOTAL=${#PAGES[@]}
SUCCESS=0
FAILED=0

echo "测试 ${TOTAL} 个中文页面..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for page in "${PAGES[@]}"; do
  # 获取 HTTP 状态码
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${page}")
  
  if [ "$STATUS" -eq 200 ]; then
    echo -e "${GREEN}✓${NC} ${page} - ${STATUS} OK"
    ((SUCCESS++))
  elif [ "$STATUS" -eq 404 ]; then
    echo -e "${YELLOW}⚠${NC} ${page} - ${STATUS} Not Found (部署中？)"
    ((FAILED++))
  else
    echo -e "${RED}✗${NC} ${page} - ${STATUS} Error"
    ((FAILED++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "结果汇总:"
echo "  总计：${TOTAL}"
echo -e "  成功：${GREEN}${SUCCESS}${NC}"
echo -e "  失败：${RED}${FAILED}${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✅ 所有中文页面正常访问！${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  部分页面尚未部署完成，请稍后重试${NC}"
  echo ""
  echo "提示："
  echo "  1. 检查 GitHub Actions 部署状态"
  echo "  2. 等待 Cloudflare Pages 构建完成"
  echo "  3. CDN 缓存传播需要 1-5 分钟"
  exit 1
fi
