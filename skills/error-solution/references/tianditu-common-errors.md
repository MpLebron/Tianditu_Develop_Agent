# Tianditu Common Errors

常见错误与修复：

1. AJAXError: Not Found (404): default
- 根因：误写 `style: 'default'`
- 修复：删除 style 字段，或仅使用官方支持值

2. 图层/控件不生效
- 根因：未放在 `map.on('load', ...)` 中
- 修复：所有 `addLayer/addSource/addControl` 移入 load 回调

3. 点位偏移/不显示
- 根因：经纬度顺序写反，或坐标系不匹配
- 修复：统一 `[lng, lat]`，必要时先做坐标转换

4. 点点击无响应
- 根因：事件绑定层 id 错误，或 feature 判空缺失
- 修复：校对 layer id，并增加 `if (!e.features?.length) return`

5. 行政区边界渲染畸形（出现超长斜边/不闭合）
- 根因：把 `boundary` 的 WKT 用正则或简单 split 粗暴解析，`MULTIPOLYGON` 结构被破坏
- 修复：优先调用后端代理并使用 `boundaryGeoJSON`；若必须前端解析，使用括号层级解析器，禁止 `split(')),((')` 这类实现

6. Failed to parse URL from /api/tianditu/administrative
- 根因：代码运行在 blob/沙箱文档中时，直接 `fetch('/api/...')` 可能无法解析相对 URL
- 修复：使用 `new URL('/api/tianditu/administrative', window.location.origin).toString()` 构建绝对地址，并继续走后端代理

7. 行政区划修复时误切到官方接口后持续报错
- 根因：把“相对 URL 解析失败”误判成“代理不可用”，直接切官方接口 + 手写 WKT 解析
- 修复：优先修复 URL 构建方式；边界渲染使用代理返回的 `boundaryGeoJSON`，不要在前端重新拆 WKT

8. 省级下地级市边界只显示 1 个面（看起来仍是省界）
- 根因：`childLevel=1` 时直接渲染了根节点 `district[0]`，未输出下一级；或未开启子级边界补查
- 修复：请求参数使用 `childLevel=1&outputScope=children&expandChildrenBoundary=true`，渲染 `district[*].boundaryGeoJSON`

9. 公交规划方案全部显示 0 分钟 / 0 公里
- 根因：前端字段路径取错（把 `segmentTime/segmentDistance` 当作 `seg.segmentTime/seg.distance` 或 `line.distance`）
- 修复：
  - 从 `segments[].segmentLine[]` 里读取 `segmentTime`、`segmentDistance`
  - `segmentLine` 先做对象/数组归一化
  - `segmentType` 先 `Number(seg.segmentType)` 再比较
  - 统计时每段只选一个有效 `segmentLine`，避免把候选线路全部叠加导致失真

10. ReferenceError: signedColor is not defined（或同类变量未定义）
- 根因：在函数 A 内部声明变量（如 `renderMapLayers`），在函数 B（如 `renderPanel`）中直接引用，作用域不可见
- 修复：
  - 把共享颜色常量、状态映射、统计对象提升到顶层常量（如 `const COLOR = {...}`）
  - 或通过函数参数显式传递，不要隐式依赖局部变量

11. ReferenceError: chart2Dem is not defined（图表容器变量拼写漂移）
- 根因：声明与使用变量名不一致，如 `const chart2Dom` 却 `echarts.init(chart2Dem)`
- 修复：
  - 图表容器变量统一 `chart*Dom` 命名
  - `echarts.init()` 前先判空：`if (!chart2Dom) return`
  - 生成后做一次“声明名 = 使用名”的字符串自检

12. ReferenceError: TMapGL is not defined
- 根因：
  - 缺少天地图 SDK 脚本，或脚本被后续修复误删
  - SDK 脚本在业务脚本之后执行，导致初始化时 `TMapGL` 尚未定义
- 修复：
  - 补齐并保留：`<script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script>`
  - 确保该脚本在任何 `new TMapGL.*` 调用之前加载
  - 修复后再次检查是否存在 `TMapGL` 关键字但缺失 SDK 的情况
