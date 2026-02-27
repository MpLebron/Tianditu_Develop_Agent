# JavaScript Runtime Errors

1. Identifier 'x' has already been declared

- 根因：同一作用域重复 `let/const` 声明（常见于热更新或重复注入）
- 修复：
  - 顶层可改 `var`（仅在可接受时）
  - 或改为 IIFE/模块私有作用域
  - 避免重复执行时再次声明同名变量

项目实战案例（已验证）：

- 错误原文：
  - `Identifier 'map' has already been declared`
  - `SyntaxError: Identifier 'map' has already been declared`
  - `类型: error-event`
  - `来源: http://localhost:5173/workspace:1:15036`
- 触发条件：
  - 顶层先写 `let map;`
  - 后续又写 `let map = new TMapGL.Map(...)`
  - 或者代码在预览容器里重复执行，第二次再次执行顶层 `let map;`
- 推荐修复（优先顺序）：
  - 保留一次声明，后续改为赋值：`map = new TMapGL.Map(...)`
  - 用 IIFE 包裹脚本，避免顶层词法变量泄漏
  - 需要跨函数共享实例时，改用 `window.__map` 单例并判空复用
- 修复后验证：
  - 控制台无 `Identifier ... has already been declared`
  - 地图可正常初始化并响应交互
  - 重复点击“运行/预览”不再报重复声明错误

2. Cannot read properties of undefined

- 根因：访问链路缺少判空
- 修复：
  - 先校验数据结构
  - 对 `e.features[0]`、`rawData.data` 等增加守卫

3. xxx is not a function

- 根因：对象类型不符或 API 版本差异
- 修复：
  - 检查 API 文档方法名
  - 对可选能力做 `typeof fn === 'function'` 判断
