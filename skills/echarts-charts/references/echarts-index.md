# ECharts 图表示例索引（纯图表参考）

ECharts 相关参考文档索引。用于天地图 + ECharts 联动场景中的“图表本体配置”参考；地图联动方式请优先阅读 `skills/tianditu-echarts-bridge/references/bindEcharts.md`。

## 使用建议

- 地图联动先读：`skills/tianditu-echarts-bridge/references/bindEcharts.md`（布局、地图事件、图表更新）
- 图表样式与 option 细节再读本索引中的 `echarts-*` 示例
- 不要一次性加载全部 `echarts-*` 文档，按图表类型和需求选择 1~2 个最接近示例
- 与地图页面拼装时，颜色常量/图表实例/共享统计数据放在页面顶层，避免在图层函数内定义后在面板函数里引用
- 复制示例变量名时保持一致（如 `chart2Dom`），不要在不同函数中出现同义拼写变体

## 折线图

- `echarts-line-01.md` — 单条蓝色平滑曲线折线图
- `echarts-line-02.md` — 单条蓝色平滑曲线带渐变面积填充
- `echarts-line-03.md` — 单条蓝色折线面积图
- `echarts-line-04.md` — 多条折线图
- `echarts-line-05.md` — 多条数据堆叠面积折线图
- `echarts-line-06.md` — 单条折线分段变色图_区间高亮背景色块
- `echarts-line-07.md` — 大数据量单条折线面积图_渐变色填充_无数据点标记_底部可拖动缩放dataZoom
- `echarts-line-08.md` — 多条分组折线图_初始渲染动画逐步绘制折线
- `echarts-line-09.md` — 多条折线图_对数Y轴带主次分割线
- `echarts-line-15.md` — 分类型X轴_双Y轴_多组柱状图加一组折线图

## 柱状图/条形图

- `echarts-bar-10.md` — 基础柱状图
- `echarts-bar-11.md` — 单系列基础柱状图_每根柱子带浅色背景条
- `echarts-bar-12.md` — 单系列基础柱状图_部分柱子自定义颜色
- `echarts-bar-13.md` — 条形图_数值X轴支持正负值
- `echarts-bar-14.md` — 单系列极坐标径向柱状图
- `echarts-bar-16.md` — 多系列分组柱状图_底部可拖动缩放dataZoom
- `echarts-bar-17.md` — 多系列基础柱状图_数值Y轴支持正负值_柱状图带动画延迟依次弹出
- `echarts-bar-18.md` — 单系列水平条形图_条形实时动态排序
- `echarts-bar-19.md` — 多系列极坐标堆叠柱状图

## 饼图

- `echarts-pie-20.md` — 单系列环形饼图
- `echarts-pie-21.md` — 单系列基础饼图

## 散点图

- `echarts-scatter-22.md` — 单系列基础散点图
- `echarts-scatter-23.md` — 多系列气泡散点图_点大小按第三维动态计算

## 雷达图

- `echarts-radar-24.md` — 多系列基础雷达图

## 仪表盘

- `echarts-gauge-25.md` — 单系列基础仪表盘_半圆形刻度盘带指针
