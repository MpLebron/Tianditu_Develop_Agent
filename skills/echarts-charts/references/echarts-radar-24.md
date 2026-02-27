# ECharts 示例：多系列基础雷达图

ECharts 纯图表示例（完整 HTML），适合多指标对比，含 resize 自适应。

## 适用场景

- 在天地图页面的侧边栏、弹窗或详情面板中展示图表
- 作为 `bindEcharts` 的图表 option 参考与改造起点
- 将纯图表页面改造成“地图 + 图表联动”时复用样式与 series 配置

## 使用说明（迁移到天地图联动时）

1. 优先复用 `option` 的 `series` / `xAxis` / `yAxis` / `tooltip` 配置
2. 保留 `window.resize -> chart.resize()` 逻辑
3. 若嵌入地图侧边栏，确保图表容器有明确宽高
4. 若地图点击后更新图表，使用 `chart.setOption(nextOption, true)` 覆盖更新

## 完整示例代码（原始整理版本）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECharts 雷达图示例</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        #main {
            width: 100%;
            height: 400px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="main"></div>
    </div>

    <script>
        var chartDom = document.getElementById('main');
        var myChart = echarts.init(chartDom);
        var option;

        option = {
            title: {
                text: 'Basic Radar Chart'
            },
            legend: {
                data: ['Allocated Budget', 'Actual Spending']
            },
            radar: {
                indicator: [
                    { name: 'Sales', max: 6500 },
                    { name: 'Administration', max: 16000 },
                    { name: 'Information Technology', max: 30000 },
                    { name: 'Customer Support', max: 38000 },
                    { name: 'Development', max: 52000 },
                    { name: 'Marketing', max: 25000 }
                ]
            },
            series: [
                {
                    name: 'Budget vs spending',
                    type: 'radar',
                    data: [
                        {
                            value: [4200, 3000, 20000, 35000, 50000, 18000],
                            name: 'Allocated Budget'
                        },
                        {
                            value: [5000, 14000, 28000, 26000, 42000, 21000],
                            name: 'Actual Spending'
                        }
                    ]
                }
            ]
        };

        option && myChart.setOption(option);

        // 响应式处理
        window.addEventListener('resize', function () {
            myChart.resize();
        });
    </script>
</body>
</html>
```
