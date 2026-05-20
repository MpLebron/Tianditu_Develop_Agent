# auth-bridge-official

这个模块是“接真实天地图统一用户中心”的正式桥服务骨架。

它和当前的轻量 `auth-bridge` 分工不同：

- `auth-bridge`：纯 Java 8 轻量桥，适合本地联调和协议验证
- `auth-bridge-official`：Spring Boot 2 正式桥，面向官方 SDK 的真实运行形态

## 当前能做到什么

- 挂载官方 Spring Boot 2 SDK
- 按当前项目约定继续暴露 `/sso/login`、`/sso/logout`、`/sso/me`、`/sso/health`
- 登录成功后给当前 Node 应用签发同一套 `tdt_auth` Cookie
- 尝试通过 `TdtServiceClient.findUserInfoByUuid` 补齐统一用户信息

## 当前还缺什么

要真正打通真实统一登录，还需要：

- 官方下发的 `AK/SK`
- 机器授权已经通过
- 正式或准正式域名
- 官方 SDK JAR 已放到 `vendor/sdk/`

## 本模块为什么单独存在

前面已经验证过，官方 SDK 不是一个适合直接塞进轻量 `HttpServer` 的纯 client。
它明显依赖：

- Spring Web 上下文
- Servlet 过滤器链
- 官方要求的登录认证上下文

所以这里直接按它期望的 Spring Boot 2 运行形态来接，不再硬拗成轻量桥。

## 目录准备

先把官方 JAR 放到：

```text
auth-bridge-official/vendor/sdk/cas-client-integration-support-springboot2-1.1.0.0.jar
```

可以运行：

```bash
bash auth-bridge-official/scripts/prepare-sdk.sh
```

默认会从你本机之前那份 `sdk` 目录里复制。

## 核心环境变量

- `AUTH_BRIDGE_OFFICIAL_PORT`
- `AUTH_BRIDGE_PUBLIC_BASE_URL`
- `AUTH_BRIDGE_CAS_SERVER_URL_PREFIX`
- `AUTH_BRIDGE_CAS_SERVER_LOGIN_URL`
- `AUTH_BRIDGE_CAS_LOGOUT_URL`
- `AUTH_BRIDGE_CLIENT_CLUSTERS`
- `AUTH_BRIDGE_ACCESS_KEY`
- `AUTH_BRIDGE_SECRET_KEY`
- `AUTH_BRIDGE_USS_URL`
- `AUTH_BRIDGE_SKIP_CHECK_KEY`
- `AUTH_COOKIE_NAME`
- `AUTH_SHARED_SECRET`
- `AUTH_COOKIE_MAX_AGE_SECONDS`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_BRIDGE_DEFAULT_REDIRECT`
- `AUTH_BRIDGE_LOGOUT_REDIRECT`
- `AUTH_BRIDGE_USER_INFO_LOOKUP_ENABLED`

## 运行方式

如果本机没有 Maven，推荐直接用 Docker：

```bash
docker build -t tianditu-auth-bridge-official ./auth-bridge-official
docker run --rm -p 8081:8081 --env-file ./.env tianditu-auth-bridge-official
```

如果本机有 Maven：

```bash
cd auth-bridge-official
mvn spring-boot:run
```

## 当前约束

这套工程已经按真实接法搭好，但我还没有在当前仓库里把生产代理正式切到它。
原因很简单：

- 现在主链路还在依赖轻量 `mock` bridge 做联调
- 正式 bridge 需要你把官方 JAR、AK/SK 和部署环境一起准备好后再切

最稳妥的推进方式是：

1. 继续保留当前轻量 bridge 负责联调。
2. 先在独立端口把这个 Spring Boot 2 bridge 跑起来。
3. 拿到真实授权后，验证 `/sso/login` 与 `/sso/me`。
4. 最后再把 Nginx `/sso/` 代理切到它。
