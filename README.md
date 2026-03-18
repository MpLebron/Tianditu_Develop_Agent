# 天地图智能开发平台

一个面向天地图 Web 开发的智能体式地图生成与调试平台。

它把地图代码生成、运行时修复、视觉巡检、分享快照、运行档案和工具型 Agent 能力整合在一起，方便你用自然语言快速生成或修正基于天地图 JS API / LBS 的交互页面。

## 主要能力

- 基于自然语言生成天地图地图页面
- 流式输出地图 HTML 代码与执行过程
- 支持文件上下文、GeoJSON / JSON / Excel 等数据输入
- 支持运行时报错自动修复与视觉回灌修复
- 支持分享地图快照与公开样例页
- 支持运行档案（Run Dossier）记录每轮生成 / 修复过程
- Agent 主循环支持：
  - 原生 `web_search`
  - `web_fetch`
  - 工作区片段编辑 `snippet_edit`

## 当前模型方案

- 主模型：`qwen3.5-plus`
- 接口形态：
  - 普通文本生成：DashScope OpenAI 兼容接口
  - Agent 工具主循环：DashScope Responses API

## 项目结构

```text
.
├── client/                 # React + Vite 前端
├── server/                 # Express + TypeScript 后端
├── skills/                 # 天地图技能与参考资料
├── DEPLOY_DOCKER.md        # Docker 部署说明
├── docker-compose.yml
└── .env.example
```

## 本地启动

### 1. 安装依赖

```bash
cd client && npm install
cd ../server && npm install
```

### 2. 配置环境变量

复制根目录环境文件：

```bash
cp .env.example .env
```

至少补齐这些配置：

```env
TIANDITU_TOKEN=你的天地图Token
DASHSCOPE_API_KEY=你的阿里云百炼Key
LLM_MODEL=qwen3.5-plus
```

### 3. 启动服务

后端：

```bash
cd server
npm run dev
```

前端：

```bash
cd client
npm run dev
```

默认访问：

- 前端：[http://localhost:5173](http://localhost:5173)
- 后端：[http://localhost:3000](http://localhost:3000)

## 常用脚本

### client

```bash
cd client
npm run dev
npm run build
```

### server

```bash
cd server
npm run dev
npm run build
npm test
```

## 环境变量说明

根目录 [.env.example](./.env.example) 已给出完整示例，核心分为几类：

- 天地图配置
  - `TIANDITU_TOKEN`
- 模型配置
  - `DASHSCOPE_API_KEY`
  - `DASHSCOPE_BASE_URL`
  - `DASHSCOPE_RESPONSES_BASE_URL`
  - `LLM_MODEL`
- 分享与视觉巡检
  - `SHARE_DIR`
  - `SHARE_THUMBNAIL_*`
  - `VISUAL_INSPECTION_LLM_TIMEOUT_MS`
- Agent 工具
  - `AGENT_TOOLS_ENABLED`
  - `AGENT_TOOL_MAX_STEPS`
  - `AGENT_FETCH_TIMEOUT_MS`
  - `AGENT_EDIT_MAX_SNIPPET_CHARS`

## 关键功能说明

### 1. 地图生成

前端通过流式聊天接口把用户需求发送给后端 Agent，后端会结合技能库、参考文档、工具能力和运行时上下文，生成可运行的地图 HTML。

### 2. 自动修复

如果生成页面出现报错，系统会基于错误信息、已有代码和视觉巡检结果进行自动修复，并把修复链路记录到运行档案中。

### 3. 分享快照

分享弹窗支持：

- 自动生成分享标题和介绍
- 流式回填标题与描述
- 发布后生成永久分享链接
- 可选公开到样例集

### 4. 视觉巡检

系统会对已渲染页面截图进行视觉分析，用于发现明显的布局异常、缺失控件或渲染问题，并在必要时触发自动补修。

## 技术栈

- 前端：React 19、Vite、Tailwind CSS、Zustand
- 后端：Express、TypeScript
- LLM：Qwen 3.5 Plus、LangChain
- 浏览器渲染：Playwright / Chromium

## 已验证命令

当前仓库常用验证命令：

```bash
cd server && npm test
cd server && npm run build
cd client && npm run build
```

## 部署

Docker 部署可参考 [DEPLOY_DOCKER.md](./DEPLOY_DOCKER.md)。
