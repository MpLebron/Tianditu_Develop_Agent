# auth-bridge

这个目录放的是当前项目的独立认证桥服务。

当前实现目标：

- 先把 `/sso/login`、`/sso/logout`、`/sso/me`、`/sso/health` 这套接口契约跑起来
- 先把“桥服务签发 Cookie、Node 校验 Cookie、前端守卫工作台”的最小闭环打通
- 让本地开发在没有 Maven、没有官方 SDK JAR 的情况下也能联调

当前状态：

- 实现方式是一个 **纯 Java 8 可运行 bridge**
- 支持 `mock` 与 `official-sdk` 两种模式
- 它会签发和 Node 侧一致的 `tdt_auth` Cookie

为什么不是直接放官方 SDK：

- 你当前机器只有 `JDK 8`
- 本地没有 `Maven`
- 官方统一用户中心交付包是单独的 Java 产物，还需要正式环境授权信息

后续接入官方 SDK 的建议：

1. 保留当前 `/sso/*` 对外接口不变。
2. 将 `mock` 身份提供逻辑替换成官方 SDK 的登录与用户信息查询。
3. 继续沿用当前 `Cookie` 签发协议，Node 和前端层不需要重写。

## 模式说明

### `AUTH_BRIDGE_MODE=mock`

用途：

- 本地联调
- 前后端登录态打通
- 不依赖官方 SDK 运行时

行为：

- `/sso/login` 直接签发 mock 用户 Cookie
- `/sso/health` 返回 provider 状态 `ready`

### `AUTH_BRIDGE_MODE=official-sdk`

用途：

- 探测官方 SDK JAR 是否可加载
- 探测本机依赖、AK/SK 和当前运行形态是否满足 SDK 运行要求

当前行为：

- `/sso/health` 会返回官方 SDK 探测结果
- `/sso/login` 当前不会伪造登录，而是明确提示“当前轻量 bridge 还没实现官方 CAS 登录链路”

这是刻意设计的：因为官方 SDK 明显依赖 Spring Web / Servlet / 登录上下文，不适合在当前这个纯 `HttpServer` bridge 里硬接一套不完整实现。

本地运行：

```bash
bash auth-bridge/scripts/dev.sh
```

关键环境变量：

- `AUTH_BRIDGE_PORT`
- `AUTH_COOKIE_NAME`
- `AUTH_SHARED_SECRET`
- `AUTH_COOKIE_MAX_AGE_SECONDS`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_BRIDGE_MODE`
- `AUTH_BRIDGE_SDK_JAR`
- `AUTH_BRIDGE_SDK_EXTRA_CLASSPATH`
- `AUTH_BRIDGE_ACCESS_KEY`
- `AUTH_BRIDGE_SECRET_KEY`
- `AUTH_BRIDGE_SDK_AUTO_DETECT_LOCAL_DEPS`
- `AUTH_BRIDGE_MOCK_SUB`
- `AUTH_BRIDGE_MOCK_LOGIN_NAME`
- `AUTH_BRIDGE_MOCK_DISPLAY_NAME`
- `AUTH_BRIDGE_MOCK_EMAIL`
- `AUTH_BRIDGE_MOCK_GBCODE`
- `AUTH_BRIDGE_MOCK_COMPANY_NAME`
- `AUTH_BRIDGE_MOCK_USER_TYPE`

## `official-sdk` 模式的现实边界

我已经验证过一件事：

- 只给官方 `springboot2` JAR 不够，至少还需要 `jackson`、`httpclient/httpcore`、`spring-web`、`spring-core`、`spring-beans`、`spring-context` 等依赖
- 即便这些依赖补齐，SDK 进一步执行时仍会报“当前需要登陆认证系统”，说明它不仅要依赖类库，还要求官方期望的登录上下文

所以，当前这个 bridge 的作用是：

- 帮你把应用侧登录协议先固定下来
- 帮你把官方 SDK 的依赖缺口和环境阻塞显式暴露出来
- 给后续切到正式 Spring Boot / Servlet 认证桥打地基
