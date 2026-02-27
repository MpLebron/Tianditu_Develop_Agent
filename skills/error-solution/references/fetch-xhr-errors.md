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
