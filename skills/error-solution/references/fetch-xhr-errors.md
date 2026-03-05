# Fetch XHR Errors

排查顺序：

1. URL 是否可访问（完整 URL/相对路径/端口）
2. HTTP 状态码（404/401/500）
3. 返回 Content-Type 与实际数据结构
4. 是否被代理改写、是否跨域
5. 前端解析逻辑与返回结构是否匹配

针对 404：
- 先打印最终请求 URL
- 校验上传文件 URL 是否来自系统返回，不要手拼路径

针对“格式不正确”：
- 先 `console.log(rawData)`
- 再按顺序兼容：FeatureCollection / {data: FeatureCollection} / Feature[]
- 传入 `addSource` 时必须是 GeoJSON 对象，不是数组

针对 “Failed to parse URL from /api/...”：
- 根因通常不是接口不存在，而是运行环境（如 blob iframe）下相对 URL 解析失败
- 优先修复为绝对 URL：
  - `const url = new URL('/api/tianditu/administrative', window.location.origin).toString()`
- 不要第一时间切换到官方直连接口；先保留项目代理链路，避免 token 暴露和响应结构漂移
