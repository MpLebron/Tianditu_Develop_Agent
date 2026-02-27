# ECharts 示例：分类型X轴_双Y轴_多组柱状图加一组折线图

ECharts 纯图表示例（完整 HTML），适合侧边面板趋势展示，含 resize 自适应。

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
    <title>ECharts 混合图表示例</title>
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
            height: 500px;
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
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    crossStyle: {
                        color: '#999'
                    }
                }
            },
            toolbox: {
                feature: {
                    dataView: { show: true, readOnly: false },
                    magicType: { show: true, type: ['line', 'bar'] },
                    restore: { show: true },
                    saveAsImage: { show: true }
                }
            },
            legend: {
                data: ['Evaporation', 'Precipitation', 'Temperature']
            },
            xAxis: [
                {
                    type: 'category',
                    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    axisPointer: {
                        type: 'shadow'
                    }
                }
            ],
            yAxis: [
                {
                    type: 'value',
                    name: 'Precipitation',
                    min: 0,
                    max: 250,
                    interval: 50,
                    axisLabel: {
                        formatter: '{value} ml'
                    }
                },
                {
                    type: 'value',
                    name: 'Temperature',
                    min: 0,
                    max: 25,
                    interval: 5,
                    axisLabel: {
                        formatter: '{value} °C'
                    }
                }
            ],
            series: [
                {
                    name: 'Evaporation',
                    type: 'bar',
                    tooltip: {
                        valueFormatter: function (value) {
                            return value + ' ml';
                        }
                    },
                    data: [
                        2.0, 4.9, 7.0, 23.2, 25.6, 76.7, 135.6, 162.2, 32.6, 20.0, 6.4, 3.3
                    ]
                },
                {
                    name: 'Precipitation',
                    type: 'bar',
                    tooltip: {
                        valueFormatter: function (value) {
                            return value + ' ml';
                        }
                    },
                    data: [
                        2.6, 5.9, 9.0, 26.4, 28.7, 70.7, 175.6, 182.2, 48.7, 18.8, 6.0, 2.3
                    ]
                },
                {
                    name: 'Temperature',
                    type: 'line',
                    yAxisIndex: 1,
                    tooltip: {
                        valueFormatter: function (value) {
                            return value + ' °C';
                        }
                    },
                    data: [2.0, 2.2, 3.3, 4.5, 6.3, 10.2, 20.3, 23.4, 23.0, 16.5, 12.0, 6.2]
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
