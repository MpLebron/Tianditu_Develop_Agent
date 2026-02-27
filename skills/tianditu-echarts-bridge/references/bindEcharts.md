# ECharts 图表与地图联动

在天地图旁边展示 ECharts 图表，并通过地图事件（点击标记/区域）动态更新图表。

本参考文档只负责“地图 + 图表联动桥接”：
- 布局结构（地图区 + 图表区）
- 地图事件驱动图表更新
- 图表实例初始化与更新时机
- resize/容器尺寸等联动稳定性问题

图表本体（折线/柱状/饼图/散点/雷达/仪表盘）的 option 细节请按需读取：
- `skills/echarts-charts/references/echarts-index.md`（索引）
- `skills/echarts-charts/references/echarts-*.md`（具体图表示例）

## 引入方式

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script>
```

## 双栏布局 (60% 地图 + 40% 图表)

```html
<style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; display: flex; }
    #map { width: 60%; height: 100%; }
    #chart-container { width: 40%; height: 100%; display: flex; flex-direction: column; background: #f5f5f5; }
    .chart-title { font-size: 14px; font-weight: bold; padding: 10px; background: #fff; border-bottom: 1px solid #eee; }
    #chart { flex: 1; padding: 10px; }
</style>
<body>
    <div id="map"></div>
    <div id="chart-container">
        <div class="chart-title">点击地图标记查看数据</div>
        <div id="chart"></div>
    </div>
</body>
```

## 联动核心逻辑

```javascript
var locationData = [
    {
        name: '北京', coordinates: [116.40, 39.90], color: '#5470c6',
        chartData: { categories: ['Q1','Q2','Q3','Q4'], values: [120, 200, 150, 80] }
    },
    {
        name: '上海', coordinates: [121.47, 31.23], color: '#91cc75',
        chartData: { categories: ['Q1','Q2','Q3','Q4'], values: [200, 180, 220, 250] }
    }
];

var myChart = echarts.init(document.getElementById('chart'));
var markers = [];

map.on('load', function() {
    locationData.forEach(function(loc, i) {
        var el = document.createElement('div');
        el.style.cssText = 'width:24px;height:24px;border-radius:50%;background:' + loc.color + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;';

        var marker = new TMapGL.Marker({ element: el }).setLngLat(loc.coordinates).addTo(map);
        markers.push(marker);

        el.addEventListener('click', function(e) {
            e.stopPropagation();
            updateChart(loc);
        });
    });

    if (locationData.length > 0) updateChart(locationData[0]);
});

function updateChart(data) {
    document.querySelector('.chart-title').textContent = data.name + ' 详细数据';
    myChart.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.chartData.categories },
        yAxis: { type: 'value' },
        series: [{ name: data.name, data: data.chartData.values, type: 'bar', itemStyle: { color: data.color } }]
    }, true);
}

window.addEventListener('resize', function() { myChart.resize(); });
```

## 支持的图表类型

在 `series.type` 中指定：
- `'bar'` — 柱状图
- `'line'` — 折线图
- `'pie'` — 饼图
- `'scatter'` — 散点图
- `'radar'` — 雷达图

## 踩坑提醒

1. ECharts 容器需要显式的宽高，不能为 0
2. `echarts.init()` 必须在 DOM 可见后调用
3. `myChart.setOption(option, true)` 第二个参数 `true` 表示不合并而是替换
4. 窗口 resize 时需要调用 `myChart.resize()`
5. 图表样式与复杂 `option` 优先参考 `skills/echarts-charts/references/echarts-index.md` 和对应 `skills/echarts-charts/references/echarts-*.md`，不要在此文档中硬拼长配置
