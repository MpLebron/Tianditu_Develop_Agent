# ECharts 示例：单条蓝色平滑曲线带渐变面积填充

ECharts 纯图表示例（完整 HTML），含 resize 自适应。

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
    <title>ECharts 平滑折线图示例</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
            font-size: 28px;
            font-weight: 300;
        }
        #main {
            width: 100%;
            height: 500px;
        }
        .info {
            text-align: center;
            color: #666;
            margin-top: 20px;
            font-size: 14px;
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
                text: '销售数据统计',
                subtext: '平滑曲线展示',
                left: 'center',
                textStyle: {
                    color: '#333',
                    fontSize: 20
                },
                subtextStyle: {
                    color: '#999',
                    fontSize: 14
                }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross'
                },
                backgroundColor: 'rgba(50,50,50,0.8)',
                textStyle: {
                    color: '#fff'
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                axisLine: {
                    lineStyle: {
                        color: '#ccc'
                    }
                },
                axisTick: {
                    show: false
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    show: false
                },
                axisTick: {
                    show: false
                },
                splitLine: {
                    lineStyle: {
                        color: '#f0f0f0'
                    }
                }
            },
            series: [
                {
                    name: '销售额',
                    data: [820, 932, 901, 934, 1290, 1330, 1320],
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: {
                        color: '#5470c6',
                        width: 3
                    },
                    itemStyle: {
                        color: '#5470c6',
                        borderColor: '#fff',
                        borderWidth: 2
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [{
                                offset: 0, color: 'rgba(84, 112, 198, 0.3)'
                            }, {
                                offset: 1, color: 'rgba(84, 112, 198, 0.1)'
                            }]
                        }
                    }
                }
            ]
        };

        option && myChart.setOption(option);

        // 响应式处理
        window.addEventListener('resize', function () {
            myChart.resize();
        });

        // 动画效果
        myChart.on('finished', function () {
            console.log('图表渲染完成');
        });
    </script>
</body>
</html>
```
