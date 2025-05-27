# 🚀 将修改的 n8n 部署到 Railway

本指南将帮助您将包含 Anthropic Prompt Caching 功能的 n8n 部署到 Railway。

## 📋 准备工作

### 1. 注册账户
- [Docker Hub](https://hub.docker.com/) 账户
- [GitHub](https://github.com/) 仓库（您的 n8n fork）
- [Railway](https://railway.app/) 账户

### 2. 设置 Docker Hub
1. 登录 Docker Hub
2. 创建新的仓库，例如：`your-username/n8n-anthropic-caching`
3. 生成访问 Token：
   - 点击头像 → Account Settings → Security
   - 创建新的 Access Token
   - 保存 Token（只显示一次）

## 🔧 配置 GitHub Actions

### 1. 修改 GitHub Actions 配置
编辑 `.github/workflows/docker-build.yml`，将 `IMAGE_NAME` 改为您的镜像名：

```yaml
env:
  REGISTRY: docker.io
  IMAGE_NAME: your-username/n8n-anthropic-caching  # 👈 替换为您的用户名
```

### 2. 设置 GitHub Secrets
在您的 GitHub 仓库中：
1. 进入 Settings → Secrets and variables → Actions
2. 添加以下 secrets：
   - `DOCKERHUB_USERNAME`: 您的 Docker Hub 用户名
   - `DOCKERHUB_TOKEN`: 刚才创建的 Access Token

### 3. 触发构建
推送代码到 main/master 分支，或手动触发 workflow：
- 进入 Actions 标签页
- 选择 "Build and Push Docker Image"
- 点击 "Run workflow"

## 🚢 在 Railway 上部署

### 方案一：通过 Railway Dashboard

1. **创建新项目**
   - 登录 Railway
   - 点击 "New Project"
   - 选择 "Deploy from Docker image"

2. **配置镜像**
   ```
   Image: your-username/n8n-anthropic-caching:latest
   ```

3. **设置环境变量**
   ```
   N8N_HOST=0.0.0.0
   N8N_PORT=5678
   N8N_PROTOCOL=https
   N8N_SECURE_COOKIE=true
   WEBHOOK_URL=https://your-app-name.railway.app/
   ```

4. **配置域名**
   - 在 Settings → Domains 中添加自定义域名
   - 或使用 Railway 提供的 `.railway.app` 域名

### 方案二：使用 Railway CLI

1. **安装 Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **创建项目**
   ```bash
   railway login
   railway new
   ```

3. **部署镜像**
   ```bash
   railway up --image your-username/n8n-anthropic-caching:latest
   ```

4. **设置环境变量**
   ```bash
   railway variables set N8N_HOST=0.0.0.0
   railway variables set N8N_PORT=5678
   railway variables set N8N_PROTOCOL=https
   railway variables set N8N_SECURE_COOKIE=true
   railway variables set WEBHOOK_URL=https://your-app-name.railway.app/
   ```

## 🗄️ 数据库配置（可选）

如果需要持久化数据库：

1. **添加 PostgreSQL 服务**
   - 在 Railway 项目中点击 "New"
   - 选择 "Database" → "PostgreSQL"

2. **连接数据库**
   添加环境变量：
   ```
   DB_TYPE=postgresdb
   DB_POSTGRESDB_HOST=${{Postgres.PGHOST}}
   DB_POSTGRESDB_PORT=${{Postgres.PGPORT}}
   DB_POSTGRESDB_DATABASE=${{Postgres.PGDATABASE}}
   DB_POSTGRESDB_USER=${{Postgres.PGUSER}}
   DB_POSTGRESDB_PASSWORD=${{Postgres.PGPASSWORD}}
   ```

## 🔄 自动更新

### 设置自动部署
在 Railway 项目中：
1. 进入 Settings → Service
2. 在 "Image" 部分启用 "Auto Deploy"
3. 每次您推送代码，GitHub Actions 会构建新镜像，Railway 会自动部署

### 手动更新
```bash
# 重新部署最新镜像
railway redeploy
```

## ✅ 验证部署

1. **访问您的 n8n 实例**
   - 打开 Railway 提供的 URL
   - 完成 n8n 初始设置

2. **测试 Anthropic Caching**
   - 创建一个使用 Anthropic Chat Model 的工作流
   - 在节点配置中启用 "Prompt Caching" 选项
   - 查看执行日志确认缓存功能正常

## 🔍 故障排除

### 查看日志
```bash
railway logs
```

### 常见问题

1. **构建失败**
   - 检查 Docker Hub 凭据
   - 确认镜像名称正确

2. **部署失败**
   - 检查环境变量配置
   - 确认镜像在 Docker Hub 上可访问

3. **n8n 无法启动**
   - 检查端口配置（5678）
   - 验证环境变量设置

## 💡 提示

- 使用 `latest` 标签进行开发，生产环境建议使用特定版本标签
- 定期备份您的工作流和凭据
- 监控 Railway 的使用量和费用
- 考虑设置健康检查和监控

现在您的包含 Anthropic Prompt Caching 功能的 n8n 就可以在 Railway 上运行了！🎉 