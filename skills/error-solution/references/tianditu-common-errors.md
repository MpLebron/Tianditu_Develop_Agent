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
