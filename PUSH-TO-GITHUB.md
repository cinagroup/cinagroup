# 🚀 推送到 GitHub 指南

**当前状态**: ⚠️ 需要 GitHub 认证

---

## ✅ 已完成

```bash
✅ 代码已提交到本地仓库
✅ Commit: a36058c
✅ 变更：22 个文件，5427 行新增，683 行删除
```

---

## 🔐 配置 GitHub 认证

### 方式 1: 使用 Personal Access Token (推荐)

**1. 创建 Token**
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 选择权限：
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
4. 点击 "Generate token"
5. **复制 Token** (只显示一次！)

**2. 使用 Token 推送**
```bash
cd /root/.openclaw/workspace/cinagroup-github

# 方式 A: 在命令中使用 Token
git push https://<YOUR_USERNAME>:<YOUR_TOKEN>@github.com/cinagroup/homepage.git main

# 方式 B: 配置 Credential Helper (推荐)
git config --global credential.helper store
git push
# 输入用户名和 Token
```

---

### 方式 2: 使用 SSH Key

**1. 生成 SSH Key**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# 按 Enter 使用默认位置
```

**2. 添加 SSH Key 到 GitHub**
```bash
# 复制公钥
cat ~/.ssh/id_ed25519.pub
# 访问 https://github.com/settings/keys
# 点击 "New SSH key" 并粘贴
```

**3. 切换为 SSH URL**
```bash
cd /root/.openclaw/workspace/cinagroup-github
git remote set-url origin git@github.com:cinagroup/homepage.git
git push
```

---

### 方式 3: GitHub CLI (最简单)

**1. 安装 gh**
```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y
```

**2. 登录**
```bash
gh auth login
# 选择 GitHub.com
# 选择 HTTPS 或 SSH
# 复制 One-Time Code 并在浏览器授权
```

**3. 推送**
```bash
cd /root/.openclaw/workspace/cinagroup-github
git push
```

---

## 📝 快速推送命令

### 如果您已经有 Token:

```bash
cd /root/.openclaw/workspace/cinagroup-github

# 替换 YOUR_USERNAME 和 YOUR_TOKEN
git remote set-url origin https://YOUR_USERNAME:YOUR_TOKEN@github.com/cinagroup/homepage.git
git push -u origin main
```

### 如果还没有 Token:

1. **访问**: https://github.com/settings/tokens
2. **创建**: Generate new token (classic)
3. **权限**: 勾选 `repo` 和 `workflow`
4. **复制**: 保存 Token
5. **执行**:
```bash
git config --global credential.helper store
git push
# 输入用户名和 Token
```

---

## 🎯 推送后步骤

### 1. 验证推送
访问 https://github.com/cinagroup/homepage
- ✅ 检查最新提交
- ✅ 确认文件完整

### 2. 连接 Cloudflare Pages
1. 访问 https://pages.cloudflare.com
2. 点击 "Create a project"
3. 选择 "Connect to Git"
4. 选择 `cinagroup/homepage` 仓库
5. 配置构建：
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
6. 点击 "Save and Deploy"

### 3. 等待部署
- 首次部署：3-5 分钟
- 获得域名：`cinagroup.pages.dev`

---

## ⚠️ 常见问题

### 问题 1: Authentication failed
**错误**: `fatal: Authentication failed`

**解决**:
```bash
# 清除缓存的凭证
git config --global --unset credential.helper

# 重新配置
git config --global credential.helper store
git push
```

### 问题 2: Repository not found
**错误**: `Repository not found`

**解决**:
- 确认仓库存在：https://github.com/cinagroup/homepage
- 检查权限：确保有写入权限
- 使用正确的 URL

### 问题 3: Permission denied
**错误**: `Permission denied (publickey)`

**解决**:
```bash
# 测试 SSH 连接
ssh -T git@github.com

# 如果失败，重新添加 SSH key
```

---

## 📞 需要帮助

**请告诉我**:
1. 您有 GitHub 账号吗？
2. 想使用哪种认证方式？
   - Personal Access Token
   - SSH Key
   - GitHub CLI
3. 需要我帮您执行具体命令吗？

---

**当前状态**: 等待 GitHub 认证配置  
**下一步**: 配置认证 → 推送到 GitHub → 部署到 Cloudflare
