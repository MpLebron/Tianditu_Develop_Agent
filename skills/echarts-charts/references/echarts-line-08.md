# ECharts 示例：多条分组折线图_初始渲染动画逐步绘制折线

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
    <title>ECharts 多国收入对比示例</title>
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

        // 直接使用本地数据，避免CORS问题
        function generateLocalData() {
            const countries = ['Finland', 'France', 'Germany', 'Iceland', 'Norway', 'Poland', 'Russia', 'United Kingdom'];
            const years = [];
            for (let year = 1950; year <= 2020; year += 5) {
                years.push(year);
            }
            
            const data = [];
            countries.forEach((country, countryIndex) => {
                years.forEach((year, yearIndex) => {
                    // 生成更真实的数据趋势
                    const baseIncome = 20000 + countryIndex * 5000;
                    const yearProgress = yearIndex / years.length;
                    const income = baseIncome + yearProgress * 30000 + Math.random() * 5000;
                    
                    const baseLifeExp = 70 + countryIndex * 2;
                    const lifeExp = baseLifeExp + yearProgress * 10 + Math.random() * 3;
                    
                    const basePop = 5000000 + countryIndex * 10000000;
                    const population = basePop + yearProgress * basePop * 0.5 + Math.random() * 1000000;
                    
                    data.push([
                        Math.round(income), // Income
                        Math.round(lifeExp * 10) / 10, // Life Expectancy
                        Math.round(population), // Population
                        country,
                        year
                    ]);
                });
            });
            return data;
        }

        // 直接运行，不需要异步加载
        var localData = generateLocalData();
        run(localData);

        function run(_rawData) {
            const countries = [
                'Finland',
                'France',
                'Germany',
                'Iceland',
                'Norway',
                'Poland',
                'Russia',
                'United Kingdom'
            ];
            
            // 简化版本：直接为每个国家创建数据系列
            const seriesList = [];
            const years = [];
            
            // 提取年份
            for (let year = 1950; year <= 2020; year += 5) {
                years.push(year);
            }
            
            countries.forEach(function (country) {
                // 为每个国家过滤数据
                const countryData = _rawData.filter(function(item) {
                    return item[3] === country;
                }).sort(function(a, b) {
                    return a[4] - b[4]; // 按年份排序
                });
                
                const chartData = countryData.map(function(item) {
                    return [item[4], item[0]]; // [年份, 收入]
                });
                
                seriesList.push({
                    type: 'line',
                    name: country,
                    showSymbol: false,
                    data: chartData,
                    endLabel: {
                        show: true,
                        formatter: function (params) {
                            return country + ': ' + Math.round(params.value[1]);
                        }
                    },
                    labelLayout: {
                        moveOverlap: 'shiftY'
                    },
                    emphasis: {
                        focus: 'series'
                    }
                });
            });
            
            option = {
                animationDuration: 10000,
                title: {
                    text: 'Income of European Countries since 1950'
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'cross'
                    }
                },
                legend: {
                    data: countries,
                    top: 30
                },
                xAxis: {
                    type: 'value',
                    name: 'Year',
                    nameLocation: 'middle',
                    nameGap: 30,
                    min: 1950,
                    max: 2020,
                    interval: 10
                },
                yAxis: {
                    type: 'value',
                    name: 'Income (USD)',
                    nameLocation: 'middle',
                    nameGap: 50
                },
                grid: {
                    left: 80,
                    right: 140,
                    top: 80,
                    bottom: 80
                },
                series: seriesList
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
