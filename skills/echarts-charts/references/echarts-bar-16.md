# ECharts 示例：多系列分组柱状图_底部可拖动缩放dataZoom

ECharts 纯图表示例（完整 HTML），适合分类对比展示，包含 dataZoom，含 resize 自适应。

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
    <title>ECharts 预算对比图示例</title>
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
        .loading {
            text-align: center;
            padding: 50px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="main">
            <div class="loading">正在加载数据...</div>
        </div>
    </div>

    <script>
        var ROOT_PATH = 'https://echarts.apache.org/examples';
        var chartDom = document.getElementById('main');
        var myChart = echarts.init(chartDom);
        var option;

        // 模拟数据，当外部数据加载失败时使用
        function getMockData() {
            return {
                names: ['Defense', 'Social Security', 'Medicare', 'Education', 'Veterans', 'Transportation', 'Agriculture', 'Energy', 'Justice', 'Science'],
                budget2011List: [700000, 730000, 560000, 70000, 130000, 80000, 25000, 12000, 30000, 31000],
                budget2012List: [720000, 750000, 580000, 68000, 140000, 75000, 23000, 11000, 32000, 33000]
            };
        }

        // 直接使用本地数据，避免CORS问题
        myChart.showLoading();
        setTimeout(function() {
            processData(getMockData());
        }, 500); // 模拟加载延迟

        function processData(obama_budget_2012) {
            myChart.hideLoading();
            option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'shadow',
                        label: {
                            show: true
                        }
                    }
                },
                toolbox: {
                    show: true,
                    feature: {
                        dataView: { show: true, readOnly: false },
                        magicType: { show: true, type: ['line', 'bar'] },
                        restore: { show: true },
                        saveAsImage: { show: true }
                    }
                },
                legend: {
                    data: ['Budget 2011', 'Budget 2012'],
                    itemGap: 5
                },
                grid: {
                    top: '12%',
                    left: '1%',
                    right: '10%',
                    containLabel: true
                },
                xAxis: [
                    {
                        type: 'category',
                        data: obama_budget_2012.names
                    }
                ],
                yAxis: [
                    {
                        type: 'value',
                        name: 'Budget (million USD)',
                        axisLabel: {
                            formatter: function (a) {
                                a = +a;
                                return isFinite(a) ? (a / 1000).toFixed(0) + 'B' : '';
                            }
                        }
                    }
                ],
                dataZoom: [
                    {
                        show: true,
                        start: 0,
                        end: 100
                    },
                    {
                        type: 'inside',
                        start: 0,
                        end: 100
                    }
                ],
                series: [
                    {
                        name: 'Budget 2011',
                        type: 'bar',
                        data: obama_budget_2012.budget2011List
                    },
                    {
                        name: 'Budget 2012',
                        type: 'bar',
                        data: obama_budget_2012.budget2012List
                    }
                ]
            };
            myChart.setOption(option);
        }

        // 响应式处理
        window.addEventListener('resize', function () {
            myChart.resize();
        });
    </script>
</body>
</html>
```
