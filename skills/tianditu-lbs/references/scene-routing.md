# LBS 场景路由

## 当前项目代理优先

- 运行时代码优先调用 `/api/tianditu/*` 代理，不要在前端直接拼接 `tk`。
- 如果前端通过代理调用，必须先判断 `payload.success===true`，再从 `payload.data` 读取业务字段。
- 下文的“返回结构”主要用于说明业务字段形状；通过代理调用时，这些字段通常位于 `payload.data` 内。
- 驾车规划是特例：当前项目代理会把原始 XML 兼容转换为 JSON 对象，再放进 `payload.data`。


这个 reference 用于先做接口分流，再选择细粒度 reference。

默认阅读顺序：

1. 先读 `lbs/api-overview`，确认官方端点、代理 envelope 和返回结构阅读方式
2. 再读最接近的 `scene*.md`
3. 如果需要当前项目里的运行时代码模板，再补旧版兼容 reference（如 `lbs/search-poi`、`lbs/search-route`）

## 场景判断

- 明确地点或类别搜索：`lbs/scene1-keyword-search`
- 周边搜索：`lbs/scene2-nearby-search`
- 视野 / 多边形 / 行政区范围搜索：`lbs/scene3-area-search`
- 分类搜索 / 统计搜索：`lbs/scene4-category-stats-search`
- 地址转坐标：`lbs/scene5-geocoding`
- 坐标转地址：`lbs/scene6-reverse-geocoding`
- 行政区边界、下级行政区：`lbs/scene7-administrative-lookup`
- 驾车规划：`lbs/scene8-drive-route`
- 公交/地铁换乘：`lbs/scene9-transit-planning`
- 公交线 / 站点明细 / 返程：`lbs/scene10-bus-detail`
- 如果用户给的是“国家基础地理信息中心到自然资源部”“故宫到首都机场”这类命名地点路线，优先先做 `lbs/scene5-geocoding`，再进入驾车或公交规划

## 运行时约束

- 优先代理接口，不默认直连官方端点
- 解释返回结构时，先说代理 envelope，再说业务字段
- 搜索与路线页面要维护 `loading / ready / empty / error` 四态

## 与 JSAPI 的边界

- “如何在地图上画行政区边界/路线/搜索结果”属于 `tianditu-jsapi`
- “该调用哪个搜索/编码/规划接口、参数怎么拼、返回字段怎么取”属于 `tianditu-lbs`
