# Visual Style System

用于统一页面风格，避免“功能完整但视觉零散”。

## 1. 颜色变量（建议）

```css
:root {
  --bg-page: #f5f7fb;
  --bg-card: #ffffff;
  --text-primary: #16213a;
  --text-secondary: #5b6780;
  --text-muted: #8a95ab;

  --brand-500: #2f6bff;
  --brand-600: #2558d9;
  --brand-100: #e8f0ff;

  --success-500: #12a150;
  --warning-500: #e08a00;
  --danger-500: #d9363e;

  --border-soft: #e3e8f2;
  --shadow-card: 0 8px 24px rgba(22, 33, 58, 0.08);
  --radius-card: 16px;
  --radius-control: 12px;
}
```

## 2. 字体与排版

- 中文优先：`"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`
- 正文大小：`14px~16px`
- 标题层级：
  - H1: `44~56px`
  - H2: `28~36px`
  - 卡片标题: `20~24px`

## 3. 间距体系

采用 8px 基线：

- 紧凑间距：`8 / 12`
- 常规间距：`16 / 20 / 24`
- 区块间距：`32 / 40 / 56`

## 4. 组件外观约束

- 卡片必须有明确边界（边框或阴影）
- 输入控件高度统一（建议 `40~44px`）
- 主按钮和次按钮要有明显对比
- 链接动作保持同一色系（品牌色）

