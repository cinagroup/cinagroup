# 🚀 Cloudflare Pages 部署指南

**当前状态**: ⚠️ 需要 Cloudflare API Token

---

## 📋 部署方式

### 方式 1: GitHub Actions (推荐) ⭐

最简单的方式，自动部署！

#### 步骤：

**1. 创建 GitHub 仓库**
```bash
cd /root/.openclaw/workspace/cinagroup-site
git init
git add .
git commit -m "CinaGroup website v1.0 - Initial launch"
git branch -M main
```

**2. 推送到 GitHub**
```bash
# 在 GitHub 创建新仓库 cinagroup/homepage
# 然后执行：
git remote add origin https://github.com/cinagroup/homepage.git
git push -u origin main
```

**3. 连接 Cloudflare Pages**
1. 访问 https://pages.cloudflare.com
2. 点击 "Create a project"
3. 选择 "Connect to Git"
4. 选择 `cinagroup/homepage` 仓库
5. 配置构建设置：
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
6. 点击 "Save and Deploy"

**4. 等待部署**
- 首次部署约 3-5 分钟
- 部署完成后获得临时域名：`cinagroup.pages.dev`

---

### 方式 2: Wrangler CLI (手动部署)

需要 Cloudflare API Token。

#### 步骤：

**1. 获取 Cloudflare API Token**
1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. 点击 "Create Token"
3. 选择 "Edit Cloudflare Workers" 模板
4. 权限设置：
   - Account.Cloudflare Pages: Edit
   - Account.Account Settings: Read
5. 点击 "Continue to summary"
6. 点击 "Create Token"
7. **复制 Token** (只显示一次！)

**2. 设置环境变量**
```bash
export CLOUDFLARE_API_TOKEN="你的 API Token"
export CLOUDFLARE_ACCOUNT_ID="你的 Account ID"
```

**3. 登录 Cloudflare**
```bash
wrangler login
```

**4. 创建 Pages 项目**
```bash
cd /root/.openclaw/workspace/cinagroup-site
wrangler pages project create cinagroup --production-branch main
```

**5. 部署**
```bash
wrangler pages deploy dist --project-name=cinagroup
```

**6. 查看部署**
```bash
wrangler pages deployment list --project-name=cinagroup
```

---

### 方式 3: Cloudflare Dashboard (最简单)

无需命令行，直接上传！

#### 步骤：

**1. 访问 Cloudflare Pages**
https://pages.cloudflare.com

**2. 创建项目**
- 点击 "Create a project"
- 选择 "Direct Upload"
- 项目名称：`cinagroup`

**3. 上传文件**
- 压缩 dist 目录：
  ```bash
  cd /root/.openclaw/workspace/cinagroup-site
  zip -r dist.zip dist/
  ```
- 在 Dashboard 拖拽上传 `dist/` 文件夹内容

**4. 部署**
- 点击 "Deploy"
- 等待完成 (约 2-3 分钟)

---

## 🌐 自定义域名配置

### DNS 设置

部署完成后，配置自定义域名：

**1. Cloudflare Pages 设置**
1. 进入项目 → Custom domains
2. 点击 "Add custom domain"
3. 输入 `cinagroup.com`
4. 点击 "Add domain"

**2. DNS 记录**
如果使用 Cloudflare DNS，自动配置：
```
类型    名称    值                  TTL
A       @       自动分配            Auto
CNAME   www     cinagroup.pages.dev Auto
```

如果使用其他 DNS 服务商：
```
类型    名称    值                      TTL
A       @       104.21.234.153          Auto
A       @       172.67.185.139          Auto
CNAME   www     cinagroup.pages.dev     Auto
```

**3. SSL 证书**
- Cloudflare 自动提供 SSL
- 等待证书签发 (5-10 分钟)
- HTTPS 自动启用

---

## ⚙️ 环境变量配置

在 Cloudflare Pages Dashboard 设置：

**Settings → Environment Variables → Add**

```
PUBLIC_SITE_URL = https://cinagroup.com
PUBLIC_API_URL = https://api.cinagroup.com
```

---

## 📊 部署后检查

### 1. 访问测试
- [ ] 首页可访问
- [ ] 所有业务页面正常
- [ ] 图片加载正常
- [ ] 导航菜单工作
- [ ] 深色模式正常

### 2. 性能测试
访问 https://pagespeed.web.dev/
- 输入你的域名
- 检查 Lighthouse 评分
- 预期：90+ 分

### 3. SEO 检查
- [ ] Meta 标题正确
- [ ] 描述完整
- [ ] Open Graph 标签
- [ ] robots.txt 存在
- [ ] sitemap.xml 生成

---

## 🔧 故障排除

### 问题 1: 构建失败
**错误**: `npm run build` 失败

**解决**:
```bash
# 本地测试构建
cd /root/.openclaw/workspace/cinagroup-site
npm run build

# 检查 Node.js 版本
node --version  # 需要 v18+

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 问题 2: 404 错误
**错误**: 页面显示 404

**解决**:
- 检查 `dist/` 目录是否有 `index.html`
- 确保构建命令正确：`npm run build`
- 检查输出目录：`dist`

### 问题 3: 自定义域名不工作
**错误**: 域名无法访问

**解决**:
- 检查 DNS 记录是否正确
- 等待 DNS 传播 (最多 48 小时)
- 清除浏览器缓存
- 检查 SSL 证书状态

---

## 📈 监控与分析

### Cloudflare Analytics
访问 https://pages.cloudflare.com 查看：
- 部署历史
- 带宽使用
- 请求统计
- 错误日志

### Google Analytics
在 `src/config.yaml` 添加：
```yaml
analytics:
  vendors:
    googleAnalytics:
      id: G-XXXXXXXXXX
```

---

## ✅ 部署清单

### 部署前
- [x] 本地构建成功
- [x] 所有页面测试通过
- [x] 图片资源完整
- [x] SEO 配置完成

### 部署中
- [ ] 选择部署方式
- [ ] 配置构建参数
- [ ] 执行部署
- [ ] 等待完成

### 部署后
- [ ] 访问测试
- [ ] 域名配置
- [ ] SSL 验证
- [ ] 分析工具配置
- [ ] 性能优化

---

## 🎯 推荐方案

**首选**: GitHub Actions + Cloudflare Pages
- ✅ 自动部署
- ✅ 版本控制
- ✅ 回滚容易
- ✅ 团队协作

**备选**: Direct Upload
- ✅ 最简单
- ✅ 无需 Git
- ❌ 手动上传
- ❌ 无版本控制

---

## 📞 下一步

**选择部署方式后，我可以帮您**:
1. 执行部署命令
2. 配置域名 DNS
3. 设置环境变量
4. 验证部署结果

**请告诉我**:
- 您选择哪种部署方式？
- 是否有 Cloudflare 账号？
- 是否需要配置自定义域名？

---

**文档生成**: 2026-03-20 15:20  
**执行者**: 001 AI Assistant
