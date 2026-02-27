# Docker 部署说明（Ubuntu 服务器）

## 1. 服务器准备

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo systemctl enable docker
sudo systemctl start docker
```

## 2. 拉取代码

```bash
git clone https://github.com/MpLebron/Tianditu_Develop_Agent.git
cd Tianditu_Develop_Agent
```

## 3. 配置环境变量

复制并编辑 `.env`（必须包含 `TIANDITU_TOKEN` 与 `LLM_API_KEY`）：

```bash
cp .env.example .env
nano .env
```

建议关键项：

```env
PORT=3000
NODE_ENV=production
TIANDITU_TOKEN=your_tianditu_token
LLM_API_KEY=your_aihubmix_key
LLM_BASE_URL=https://aihubmix.com/v1
LLM_PROVIDER=qwen
LLM_MODEL=qwen3.5-plus
MAX_FILE_SIZE=52428800
UPLOAD_DIR=/app/uploads
```

## 4. 启动服务

```bash
docker compose up -d --build
```

## 5. 验证

```bash
docker compose ps
curl http://localhost/api/health
```

浏览器访问：

- `http://<服务器IP>/`

## 6. 常用运维命令

```bash
# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 更新代码后重新部署
git pull
docker compose up -d --build

# 停止
docker compose down
```

