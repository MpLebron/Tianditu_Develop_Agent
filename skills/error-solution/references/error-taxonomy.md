# Error Taxonomy

按现象快速分类：

- SyntaxError（语法）：Unexpected token / Identifier has already been declared
- TypeError（运行时）：Cannot read properties of undefined / xxx is not a function
- NetworkError（请求）：FetchError / AJAXError / 404 / CORS
- DataError（数据）：Input data is not a valid GeoJSON object
- APIUsageError（API 误用）：控件/图层时机错误、参数类型错误
- SandboxError（沙箱限制）：Ignored call to alert / allow-modals

最小诊断模板：

1. 错误类别：
2. 触发点（源文件/行号/请求）：
3. 最可能根因：
4. 最小修复动作（1~3 条）：
5. 验证步骤：
