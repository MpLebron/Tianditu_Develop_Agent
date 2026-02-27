# ECharts 示例：单系列水平条形图_条形实时动态排序

ECharts 纯图表示例（完整 HTML），适合分类对比展示，含 resize 自适应。

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
    <title>ECharts 动态排行榜示例</title>
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
            height: 600px;
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

        const updateFrequency = 2000;
        const dimension = 0;
        const countryColors = {
            Australia: '#00008b',
            Canada: '#f00',
            China: '#ffde00',
            Cuba: '#002a8f',
            Finland: '#003580',
            France: '#ed2939',
            Germany: '#000',
            Iceland: '#003897',
            India: '#f93',
            Japan: '#bc002d',
            'North Korea': '#024fa2',
            'South Korea': '#000',
            'New Zealand': '#00247d',
            Norway: '#ef2b2d',
            Poland: '#dc143c',
            Russia: '#d52b1e',
            Turkey: '#e30a17',
            'United Kingdom': '#00247d',
            'United States': '#b22234'
        };

        // 生成本地模拟数据
        function generateMockData() {
            const countries = ['Finland', 'France', 'Germany', 'Iceland', 'Norway', 'Poland', 'Russia', 'United Kingdom'];
            const years = [2015, 2016, 2017, 2018, 2019, 2020];
            const data = [];
            
            countries.forEach((country, countryIndex) => {
                years.forEach((year, yearIndex) => {
                    const baseValue = 20000 + countryIndex * 8000;
                    const yearMultiplier = 1 + yearIndex * 0.1;
                    const randomVariation = (Math.random() - 0.5) * 5000;
                    const value = Math.round(baseValue * yearMultiplier + randomVariation);
                    
                    data.push([
                        value,           // Income
                        75 + Math.random() * 10,  // Life Expectancy
                        5000000 + Math.random() * 50000000,  // Population
                        country,         // Country
                        year            // Year
                    ]);
                });
            });
            return data;
        }

        const mockData = generateMockData();
        const years = [2015, 2016, 2017, 2018, 2019, 2020];
        
        function getFlag(countryName) {
            // 简化版本，不使用实际emoji
            const flagMap = {
                'Finland': '🇫🇮',
                'France': '🇫🇷', 
                'Germany': '🇩🇪',
                'Iceland': '🇮🇸',
                'Norway': '🇳🇴',
                'Poland': '🇵🇱',
                'Russia': '🇷🇺',
                'United Kingdom': '🇬🇧'
            };
            return flagMap[countryName] || '';
        }
        let startIndex = 0;
        let startYear = years[startIndex];
        
        option = {
            grid: {
                top: 10,
                bottom: 30,
                left: 150,
                right: 80
            },
            xAxis: {
                max: 'dataMax',
                axisLabel: {
                    formatter: function (n) {
                        return Math.round(n) + '';
                    }
                }
            },
            dataset: {
                source: mockData.filter(function (d) {
                    return d[4] === startYear;
                })
            },
            yAxis: {
                type: 'category',
                inverse: true,
                max: 10,
                axisLabel: {
                    show: true,
                    fontSize: 14,
                    formatter: function (value) {
                        return value + '{flag|' + getFlag(value) + '}';
                    },
                    rich: {
                        flag: {
                            fontSize: 25,
                            padding: 5
                        }
                    }
                },
                animationDuration: 300,
                animationDurationUpdate: 300
            },
            series: [
                {
                    realtimeSort: true,
                    seriesLayoutBy: 'column',
                    type: 'bar',
                    itemStyle: {
                        color: function (param) {
                            return countryColors[param.value[3]] || '#5470c6';
                        }
                    },
                    encode: {
                        x: dimension,
                        y: 3
                    },
                    label: {
                        show: true,
                        precision: 1,
                        position: 'right',
                        valueAnimation: true,
                        fontFamily: 'monospace'
                    }
                }
            ],
            animationDuration: 0,
            animationDurationUpdate: updateFrequency,
            animationEasing: 'linear',
            animationEasingUpdate: 'linear',
            graphic: {
                elements: [
                    {
                        type: 'text',
                        right: 160,
                        bottom: 60,
                        style: {
                            text: startYear,
                            font: 'bolder 80px monospace',
                            fill: 'rgba(100, 100, 100, 0.25)'
                        },
                        z: 100
                    }
                ]
            }
        };

        myChart.setOption(option);
        
        // 启动动画序列
        for (let i = startIndex; i < years.length - 1; ++i) {
            (function (i) {
                setTimeout(function () {
                    updateYear(years[i + 1]);
                }, (i - startIndex) * updateFrequency);
            })(i);
        }
        
        function updateYear(year) {
            let source = mockData.filter(function (d) {
                return d[4] === year;
            });
            option.series[0].data = source;
            option.graphic.elements[0].style.text = year;
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
