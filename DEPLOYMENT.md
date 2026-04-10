# CinaGroup 网站部署配置

## 部署平台：Cloudflare Pages

### 自动部署配置

本项目已配置为通过 GitHub Actions 自动部署到 Cloudflare Pages。

## 部署步骤

### 方式 1: GitHub Actions (推荐)

1. **创建 GitHub 仓库**
   ```bash
   cd /root/.openclaw/workspace/cinagroup-site
   git init
   git add .
   git commit -m "Initial commit - CinaGroup website relaunch"
   git branch -M main
   git remote add origin https://github.com/cinagroup/homepage.git
   git push -u origin main
   ```

2. **连接 Cloudflare Pages**
   - 访问 https://pages.cloudflare.com
   - 点击 "Create a project"
   - 选择 GitHub 仓库 `cinagroup/homepage`
   - 配置构建设置：
     - **Build command**: `npm run build`
     - **Build output directory**: `dist`
     - **Root directory**: `/`

3. **环境变量配置**
   ```
   NODE_VERSION = 20
   NPM_FLAGS = "--legacy-peer-deps"
   ```

4. **部署**
   - 点击 "Save and Deploy"
   - 首次部署约需 3-5 分钟

### 方式 2: Wrangler CLI (手动部署)

1. **安装 Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**
   ```bash
   wrangler login
   ```

3. **部署项目**
   ```bash
   cd /root/.openclaw/workspace/cinagroup-site
   npx wrangler pages deploy dist --project-name=cinagroup
   ```

4. **自定义域名**
   ```bash
   wrangler pages project update cinagroup \
     --production-branch=main \
     --domains=cinagroup.com,www.cinagroup.com
   ```

## 域名配置

### DNS 设置

登录域名注册商（如 Namecheap、GoDaddy），添加以下 DNS 记录：

```
类型    名称    值                      TTL
A       @       104.21.234.153          Auto
A       @       172.67.185.139          Auto
CNAME   www     cinagroup.com           Auto
```

### Cloudflare DNS

如果使用 Cloudflare DNS，确保：
- ✅ Proxy status: Proxied (橙色云)
- ✅ SSL/TLS: Full (strict)
- ✅ Always Use HTTPS: Enabled
- ✅ Automatic HTTPS Rewrites: Enabled

## SSL 证书

Cloudflare Pages 自动提供 SSL 证书：

- ✅ 免费 SSL（Let's Encrypt）
- ✅ 自动续期
- ✅ HTTPS 强制跳转
- ✅ HTTP/2 支持

**无需手动配置！**

## 自定义域名验证

1. **Cloudflare Pages 设置**
   - 进入项目 → Custom domains
   - 点击 "Add custom domain"
   - 输入 `cinagroup.com`
   - 按照提示验证域名所有权

2. **DNS 验证**
   - Cloudflare 会自动添加必要的 DNS 记录
   - 验证通常只需几分钟

## 性能优化

### 已启用优化

- ✅ **CDN**: Cloudflare 全球 275+ 数据中心
- ✅ **压缩**: Brotli/Gzip 自动压缩
- ✅ **缓存**: 静态资源自动缓存
- ✅ **HTTP/2**: 多路复用加速
- ✅ **IPv6**: 支持下一代网络协议

### 建议优化

- [ ] 图片格式优化（WebP/AVIF）
- [ ] 字体子集化
- [ ] 代码分割优化
- [ ] 预加载关键资源

## 监控与分析

### Cloudflare Analytics

访问 https://pages.cloudflare.com 查看：
- 部署历史
- 带宽使用
- 请求统计
- 错误日志

### Google Analytics 配置

在 `src/config.yaml` 中添加：

```yaml
analytics:
  vendors:
    googleAnalytics:
      id: G-XXXXXXXXXX  # 替换为你的 GA4 ID
```

### Splitbee Analytics 配置

```yaml
analytics:
  vendors:
    splitbee:
      enabled: true
      token: your-splitbee-token
```

## 环境变量

### 生产环境变量

在 Cloudflare Pages 设置中添加：

```
PUBLIC_SITE_URL=https://cinagroup.com
PUBLIC_API_URL=https://api.cinagroup.com
PUBLIC_ANALYTICS_ID=G-XXXXXXXXXX
```

### 访问环境变量

```javascript
// 在 Astro 组件中
const siteUrl = import.meta.env.PUBLIC_SITE_URL;
```

## 回滚部署

### 方式 1: Cloudflare Dashboard

1. 进入项目 → Deployments
2. 找到要回滚的版本
3. 点击 "..." → "Rollback to this deployment"

### 方式 2: Wrangler CLI

```bash
# 列出所有部署
wrangler pages deployment list --project-name=cinagroup

# 回滚到指定部署
wrangler pages deployment rollback --project-name=cinagroup <deployment-id>
```

## 持续集成

### GitHub Actions 配置

创建 `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name=cinagroup
```

### 密钥配置

在 GitHub 仓库设置中添加 Secrets：

- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

## 测试清单

### 部署前测试

- [ ] 本地构建成功 (`npm run build`)
- [ ] 所有页面可访问
- [ ] 导航链接正确
- [ ] 图片加载正常
- [ ] SEO meta 标签完整
- [ ] 移动端响应式正常
- [ ] 深色模式正常

### 部署后测试

- [ ] 自定义域名可访问
- [ ] HTTPS 正常工作
- [ ] CDN 缓存生效
- [ ] 分析工具正常
- [ ] 表单提交正常
- [ ] 404 页面正常

## 故障排除

### 常见问题

**问题 1: 构建失败**
```bash
# 检查 Node.js 版本
node --version  # 需要 v18+

# 清理缓存重新构建
rm -rf node_modules package-lock.json
npm install
npm run build
```

**问题 2: 域名不解析**
- 检查 DNS 记录是否正确
- 等待 DNS 传播（最多 48 小时）
- 清除本地 DNS 缓存

**问题 3: SSL 证书错误**
- 确保 Cloudflare Proxy 已启用（橙色云）
- 检查 SSL/TLS 设置为 Full (strict)
- 等待证书签发（通常几分钟）

## 相关资源

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Astro 部署指南](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)

---

**最后更新**: 2026-03-20  
**维护**: CinaGroup Team
