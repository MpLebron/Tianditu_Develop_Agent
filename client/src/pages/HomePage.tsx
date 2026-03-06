import { useNavigate } from 'react-router-dom'

interface ExampleCard {
  title: string
  desc: string
  prompt?: string
  sampleId?: string
  category: string
  icon: React.ReactNode
  gradient: string
  bgLight: string
  iconColor: string
  preview: 'map' | 'pin' | 'parcel' | 'points' | 'flood' | 'drive' | 'transit' | 'admin' | 'batch' | 'bar3d'
}

const jiangsuVillageBatchPrompt = `请把以下地点在地图上精确显示，并在页面左侧加一个可滚动列表框。要求：
1. 每个地点都做地理编码，拿到坐标后在地图上打点；
2. 点击地图点位时，左侧列表高亮对应地点；点击左侧列表项时，地图飞到该点并弹窗；
3. 左侧列表显示地点名称、经纬度与地理编码状态（成功/失败）；
4. 页面初始自动适配全部成功点位范围；
5. 地理编码失败的地点也要在列表里展示并标记失败原因。

地点清单：
江苏省苏州市吴江区七都镇开弦弓村
江苏省苏州市昆山市张浦镇姜杭村
江苏省苏州市昆山市周庄镇东浜村
江苏省镇江市丹阳市曲阿街道建山村
江苏省盐城市盐都区学富镇蒋河村
江苏省镇江市丹阳县曲阿街道祈钦村
江苏省泰州市姜堰区溱潼镇湖南村
江苏省苏州市张家港市塘桥镇金村村
江苏省盐城市盐都区楼王镇丁马港村
江苏省盐城市盐都区龙冈镇张本村
江苏省苏州市昆山市周市镇东方村
江苏省苏州市吴中区光福镇冲山村
江苏省镇江市丹阳市曲阿街道张巷村
江苏省苏州市昆山市锦溪镇朱浜村
江苏省苏州市常熟市碧溪街道李袁村
江苏省苏州市太仓市浮桥镇方桥村
江苏省徐州市铜山区柳泉镇北村
江苏省无锡市宜兴市张渚镇祝陵村
江苏省南京市溧水区白马镇石头寨村
江苏省镇江市丹徒区宝堰镇宝堰村
江苏省无锡市宜兴市徐舍镇芳庄村
江苏省无锡市宜兴市周铁镇洋溪村
江苏省徐州市睢宁县姚集镇黄山前村
江苏省徐州市新沂市棋盘镇花厅村
江苏省无锡市锡山区东港镇黄土塘村`

const examples: ExampleCard[] = [
  {
    title: '基础地图',
    desc: '创建一个北京市中心的地图',
    category: '快速入门',
    preview: 'map',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
      </svg>
    ),
    gradient: 'from-blue-500 to-cyan-400',
    bgLight: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  {
    title: '标注与弹窗',
    desc: '在地图上添加多个带弹窗的标注点',
    category: '快速入门',
    preview: 'pin',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    gradient: 'from-rose-500 to-pink-400',
    bgLight: 'bg-rose-50',
    iconColor: 'text-rose-500',
  },
  {
    title: '清华大学周边POI搜索',
    desc: '构建左侧检索面板 + 右侧地图，支持周边/视野/普通三种搜索模式',
    prompt:
      '请生成一个“清华大学周边POI搜索演示”网页，要求：1）整体布局参考专业 GIS 应用：顶部标题栏（标题、副标题、右侧复制链接按钮），左侧控制面板，右侧地图；2）左侧面板包含：关键词输入框（默认“医院”）、搜索类型切换按钮（周边搜索/视野搜索/普通搜索）、搜索半径输入框、开始搜索按钮、状态提示条、搜索结果列表；3）右侧地图默认定位清华大学，右上角显示“当前位置”信息卡（地名、经纬度）；4）点击地图可切换搜索中心点，结果点在地图和列表联动高亮；5）调用 /api/tianditu/search 代理接口，三种模式分别对应 queryType=3/2/1，结果包含名称、地址、距离；6）必须使用天地图 JS API v5（TMapGL），保证移动端可用、无运行时报错、视觉风格简洁现代。',
    category: 'POI搜索',
    preview: 'points',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.3-4.3m1.3-5.2a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
    ),
    gradient: 'from-indigo-500 to-purple-500',
    bgLight: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
  },
  {
    title: '城中村改造地块',
    desc: '自动加载城中村 GeoJSON，探索拆迁地块并进行合理可视化',
    prompt: '请你探索一下我上传的这个数据，并进行合理的可视化。',
    sampleId: 'village-renovation',
    category: 'GeoJSON 分析',
    preview: 'parcel',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 9.776L12 4.5l8.25 5.276M4.5 10.25V19.5h15v-9.25M9 19.5v-4.125a3 3 0 016 0V19.5" />
      </svg>
    ),
    gradient: 'from-amber-500 to-orange-400',
    bgLight: 'bg-amber-50',
    iconColor: 'text-amber-500',
  },
  {
    title: '全国妇联中心分布',
    desc: '自动加载妇联中心 GeoJSON，按省市做点位与侧栏联动',
    prompt:
      '请你帮我生成一个美观合理的可视化页面。对全国妇联中心按照所在的省和市进行点数据可视化，每个点上面标注该中心的基本信息。地图左侧制作一个列表，显示当前省市的妇联中心信息。',
    sampleId: 'fulian-centers',
    category: '点位专题',
    preview: 'points',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    gradient: 'from-emerald-500 to-green-400',
    bgLight: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
  },
  {
    title: '中国洪水事件专题',
    desc: '自动加载洪水事件 GeoJSON，做点位详情与热力图分析',
    prompt:
      '请你帮我制作一个中国历年来发生的洪水事件空间分布专题地图应用。点击每个洪水受灾点时，在左侧侧边栏展示该事件相关信息，并在当前地图基础上增加热力图展示，以便识别中国受灾最严重的区域。',
    sampleId: 'china-flood-events',
    category: '灾害时空分析',
    preview: 'flood',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14.5a4 4 0 118 0c0 2.21-1.79 5.5-4 7.5-2.21-2-4-5.29-4-7.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14.5h.01" />
      </svg>
    ),
    gradient: 'from-cyan-500 to-blue-400',
    bgLight: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
  },
  {
    title: '北京→上海驾车路线',
    desc: '调用天地图驾车 API 获取真实路线并渲染距离与时长',
    prompt: '帮我用API实现北京到上海的驾车路线规划',
    category: '路径规划',
    preview: 'drive',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 16.5h16.5M6 16.5l1.125-4.5h9.75L18 16.5M8.25 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm10.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 12V9.75A2.25 2.25 0 0111.25 7.5h1.5A2.25 2.25 0 0115 9.75V12" />
      </svg>
    ),
    gradient: 'from-sky-500 to-blue-500',
    bgLight: 'bg-sky-50',
    iconColor: 'text-sky-500',
  },
  {
    title: '公交地铁路线规划',
    desc: '调用 transit API 规划公交/地铁换乘，展示方案列表与地图联动',
    prompt:
      '请帮我生成一个美观可用的公交地铁路线规划网页：左侧控制面板 + 右侧地图，支持输入或地图点击选择起终点，支持较快捷/少换乘/少步行/不坐地铁策略，调用天地图 transit?type=busline API 获取真实方案并渲染线路、方案列表和换乘详情。',
    category: '路径规划',
    preview: 'transit',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm10.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM4.5 16.5h15M6.75 16.5v-6A2.25 2.25 0 019 8.25h6a2.25 2.25 0 012.25 2.25v6M9 10.5h6M12 8.25V6" />
      </svg>
    ),
    gradient: 'from-teal-500 to-cyan-500',
    bgLight: 'bg-teal-50',
    iconColor: 'text-teal-500',
  },
  {
    title: '江苏地级市边界',
    desc: '加载江苏省全部地级市矢量边界并分色展示',
    prompt:
      '帮我加载江苏省所有地级市的矢量边界。要求：使用 /api/tianditu/administrative，设置 childLevel=1、extensions=true、autoResolveCodebook=true、boundaryFormat=geojson、outputScope=children、expandChildrenBoundary=true，并按地级市分色渲染面图层和边界线，自动适配视野。',
    category: '行政区划',
    preview: 'admin',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6.75l6.75-3 6.75 3 4.5-1.5v12l-4.5 1.5-6.75-3-6.75 3V6.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.75v12M16.5 6.75v12" />
      </svg>
    ),
    gradient: 'from-indigo-500 to-violet-500',
    bgLight: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
  },
  {
    title: '江苏村落批量定位',
    desc: '批量地理编码 25 个村落点位，地图与侧栏列表联动',
    prompt: jiangsuVillageBatchPrompt,
    category: '批处理任务',
    preview: 'batch',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 6.75h15m-15 5.25h15m-15 5.25h9M16.5 17.25l1.5 1.5 3-3" />
      </svg>
    ),
    gradient: 'from-indigo-500 to-blue-500',
    bgLight: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
  },
  {
    title: '3D 柱状图',
    desc: '城市 GDP 数据 3D 柱状图',
    category: '可视化模板',
    preview: 'bar3d',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    gradient: 'from-violet-500 to-purple-400',
    bgLight: 'bg-violet-50',
    iconColor: 'text-violet-500',
  },
]

function CardPreview({ variant, gradient }: { variant: ExampleCard['preview']; gradient: string }) {
  return (
    <div className={`relative h-28 rounded-xl overflow-hidden bg-gradient-to-br ${gradient}`}>
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,.45), rgba(255,255,255,.45) 1px, transparent 1px, transparent 16px), repeating-linear-gradient(90deg, rgba(255,255,255,.35), rgba(255,255,255,.35) 1px, transparent 1px, transparent 16px)',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.55),transparent_40%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,.35),transparent_45%)]" />

      {variant === 'map' && (
        <>
          <div className="absolute left-4 right-4 top-5 h-[2px] bg-white/85 rotate-6" />
          <div className="absolute left-10 right-8 top-12 h-[2px] bg-white/75 -rotate-3" />
          <div className="absolute left-6 right-12 bottom-5 h-[2px] bg-white/70 rotate-2" />
          <div className="absolute right-7 top-8 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,.25)]" />
        </>
      )}

      {variant === 'pin' && (
        <>
          <div className="absolute left-4 top-4 w-16 h-10 rounded-lg bg-white/85" />
          <div className="absolute left-8 top-7 w-6 h-1.5 rounded bg-rose-300/80" />
          <div className="absolute right-8 top-7 w-4 h-4 rounded-full bg-white/90 shadow-[0_0_0_4px_rgba(255,255,255,.28)]" />
          <div className="absolute right-[29px] top-10 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/90" />
          <div className="absolute left-14 bottom-4 w-4 h-4 rounded-full bg-white/90 shadow-[0_0_0_4px_rgba(255,255,255,.25)]" />
        </>
      )}

      {variant === 'parcel' && (
        <>
          <div className="absolute left-4 top-6 w-16 h-10 rounded-md border border-white/85 bg-white/25" />
          <div className="absolute left-14 top-14 w-14 h-8 rounded-md border border-white/85 bg-white/20" />
          <div className="absolute right-5 top-5 w-12 h-9 rounded-md border border-white/85 bg-white/25" />
          <div className="absolute right-9 bottom-4 w-2 h-2 rounded-full bg-white/90" />
          <div className="absolute right-14 bottom-7 w-2 h-2 rounded-full bg-white/80" />
        </>
      )}

      {variant === 'points' && (
        <>
          <div className="absolute left-4 top-4 bottom-4 w-16 rounded-lg bg-white/25 border border-white/50" />
          <div className="absolute left-7 top-8 w-10 h-1.5 rounded bg-white/70" />
          <div className="absolute left-7 top-12 w-8 h-1.5 rounded bg-white/55" />
          <div className="absolute right-6 top-7 w-2.5 h-2.5 rounded-full bg-white/95" />
          <div className="absolute right-12 top-14 w-2 h-2 rounded-full bg-white/85" />
          <div className="absolute right-9 bottom-7 w-2.5 h-2.5 rounded-full bg-white/90" />
          <div className="absolute right-14 bottom-5 w-2 h-2 rounded-full bg-white/80" />
        </>
      )}

      {variant === 'flood' && (
        <>
          <div className="absolute left-5 top-7 w-8 h-8 rounded-full bg-white/35 blur-[1px]" />
          <div className="absolute left-11 top-11 w-12 h-12 rounded-full bg-white/25 blur-[1px]" />
          <div className="absolute right-8 bottom-6 w-10 h-10 rounded-full bg-white/35 blur-[1px]" />
          <div className="absolute right-14 top-6 w-3 h-3 rounded-full bg-white/95" />
          <div className="absolute left-20 bottom-4 w-3 h-3 rounded-full bg-white/90" />
        </>
      )}

      {variant === 'drive' && (
        <>
          <svg viewBox="0 0 200 110" className="absolute inset-0 w-full h-full">
            <path d="M18 80 C 55 20, 120 92, 178 30" fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <div className="absolute left-4 bottom-6 w-3 h-3 rounded-full bg-green-300 border-2 border-white" />
          <div className="absolute right-5 top-6 w-3 h-3 rounded-full bg-rose-300 border-2 border-white" />
        </>
      )}

      {variant === 'transit' && (
        <>
          <svg viewBox="0 0 200 110" className="absolute inset-0 w-full h-full">
            <path d="M20 28 L176 28" fill="none" stroke="rgba(255,255,255,.88)" strokeWidth="3" strokeLinecap="round" />
            <path d="M34 80 C 76 44, 120 92, 168 54" fill="none" stroke="rgba(224,255,255,.94)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="absolute left-10 top-[25px] w-2 h-2 rounded-full bg-white" />
          <div className="absolute left-24 top-[25px] w-2 h-2 rounded-full bg-white" />
          <div className="absolute right-9 top-[25px] w-2 h-2 rounded-full bg-white" />
          <div className="absolute left-14 bottom-6 w-2 h-2 rounded-full bg-white" />
          <div className="absolute right-16 bottom-8 w-2 h-2 rounded-full bg-white" />
        </>
      )}

      {variant === 'admin' && (
        <>
          <svg viewBox="0 0 200 110" className="absolute inset-0 w-full h-full">
            <path d="M28 26 L88 20 L116 32 L162 26 L176 52 L148 74 L106 82 L64 78 L40 54 Z" fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.92)" strokeWidth="2" />
            <path d="M86 22 L90 79" stroke="rgba(255,255,255,.76)" strokeWidth="1.5" />
            <path d="M120 31 L108 81" stroke="rgba(255,255,255,.76)" strokeWidth="1.5" />
          </svg>
        </>
      )}

      {variant === 'batch' && (
        <>
          <div className="absolute left-4 top-4 bottom-4 w-16 rounded-lg bg-white/30 border border-white/50" />
          <div className="absolute left-7 top-9 w-10 h-1.5 rounded bg-white/85" />
          <div className="absolute left-7 top-[3.25rem] w-10 h-1.5 rounded bg-white/75" />
          <div className="absolute left-7 top-[4.25rem] w-7 h-1.5 rounded bg-white/65" />
          <div className="absolute right-8 top-8 w-2.5 h-2.5 rounded-full bg-white/95" />
          <div className="absolute right-14 top-15 w-2.5 h-2.5 rounded-full bg-white/90" />
          <div className="absolute right-10 bottom-6 w-2.5 h-2.5 rounded-full bg-white/95" />
        </>
      )}

      {variant === 'bar3d' && (
        <>
          <div className="absolute left-7 bottom-6 w-5 h-8 rounded-t bg-white/75" />
          <div className="absolute left-[3.75rem] bottom-6 w-5 h-12 rounded-t bg-white/82" />
          <div className="absolute left-[5.75rem] bottom-6 w-5 h-16 rounded-t bg-white/92" />
          <div className="absolute right-8 bottom-5 text-[10px] font-medium text-white/90">GDP</div>
        </>
      )}

      <div className="absolute bottom-2 right-3 text-[10px] tracking-wide text-white/80 font-medium">DEMO PREVIEW</div>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()

  const handleExample = (prompt: string, sampleId?: string) => {
    navigate('/workspace', { state: { prompt, sampleId } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(59,130,246,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,.35) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="hidden lg:block absolute top-[140px] -left-[220px] w-[520px] h-[220px] rounded-[50%] border-[24px] border-blue-100/70 rotate-12" />
        <div className="hidden lg:block absolute top-[198px] -left-[130px] w-[440px] h-[170px] rounded-[50%] border-[18px] border-cyan-100/65 rotate-6" />
        <div className="hidden lg:block absolute top-[136px] -right-[230px] w-[520px] h-[220px] rounded-[50%] border-[24px] border-blue-100/70 -rotate-12" />
        <div className="hidden lg:block absolute top-[198px] -right-[130px] w-[440px] h-[170px] rounded-[50%] border-[18px] border-cyan-100/65 -rotate-6" />

        <div className="absolute -top-28 right-20 w-64 h-64 rounded-full bg-blue-100/45 blur-3xl" />
        <div className="absolute top-1/3 -left-16 w-56 h-56 rounded-full bg-cyan-100/45 blur-3xl" />
        <div className="absolute bottom-14 right-1/4 w-72 h-72 rounded-full bg-sky-100/35 blur-3xl" />
      </div>

      <div className="relative">
        <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/tianditu-logo.png" alt="天地图" className="h-10 object-contain" />
            <div className="w-px h-7 bg-gray-200" />
            <img src="/tianditu-subtitle.png" alt="地理底图应用开发智能体" className="h-8 object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/gallery')}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/60 transition-all duration-200"
            >
              公开样例
            </button>
            <button
              onClick={() => navigate('/workspace')}
              className="group flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              开始使用
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 pt-14 pb-12 text-center">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-blue-100/60">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              天地图 JS API v5.0
            </div>

            <h1 className="text-[42px] md:text-[48px] font-bold text-gray-900 mb-4 leading-tight tracking-tight">
              用自然语言
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">
                创建天地图应用
              </span>
            </h1>
            <p className="text-lg text-gray-500 mb-12 max-w-3xl mx-auto leading-relaxed">
              描述你想要的地图效果，AI 自动生成可运行代码。点击下方案例可直接进入工作区。
            </p>
          </div>

          <section className="text-left">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">案例场景</h2>
              <span className="text-xs text-slate-400">共 {examples.length} 个</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {examples.map((ex, i) => (
                <button
                  key={ex.title}
                  onClick={() => handleExample(ex.prompt || ex.desc, ex.sampleId)}
                  className="group relative bg-white/92 backdrop-blur-sm border border-gray-200/75 rounded-2xl p-4 hover:shadow-2xl hover:shadow-slate-900/[0.08] hover:border-blue-200 hover:-translate-y-0.5 transition-all duration-250 text-left overflow-hidden"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${ex.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-250`} />

                  <CardPreview variant={ex.preview} gradient={ex.gradient} />

                  <div className="relative mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 text-slate-500 text-[11px] px-2 py-0.5 font-medium">
                        {ex.category}
                      </span>
                      <div className={`w-10 h-10 ${ex.bgLight} rounded-xl flex items-center justify-center ${ex.iconColor}`}>
                        {ex.icon}
                      </div>
                    </div>

                    <div className="font-semibold text-slate-800 text-[18px] leading-6 mb-1.5 group-hover:text-slate-900">{ex.title}</div>
                    <div className="text-[13px] text-slate-500 leading-relaxed min-h-[44px]">{ex.desc}</div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-sm font-medium text-blue-600">运行案例</span>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14m0 0-5-5m5 5-5 5" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

        </main>

        <footer className="border-t border-slate-200/80 bg-white/85 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-6 py-5 text-sm text-slate-600">
            <div className="flex flex-col sm:flex-row items-center justify-center text-center gap-2 sm:gap-4">
              <span className="font-medium text-slate-700">技术支持</span>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-slate-500 text-[13px]">
                <span>邮箱：tdt@ngcc.cn</span>
                <span className="hidden sm:inline text-slate-300">|</span>
                <span>电话：010-63881233</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white">
            <div className="max-w-6xl mx-auto px-6 py-6">
              <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-slate-500">
                <a href="https://www.tianditu.gov.cn/about/" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  关于我们
                </a>
                <span className="text-slate-300">|</span>
                <a href="https://www.tianditu.gov.cn/about/service" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  服务条款
                </a>
                <span className="text-slate-300">|</span>
                <a href="http://www.tianditu.gov.cn/about/copyright" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  版权声明
                </a>
                <span className="text-slate-300">|</span>
                <a href="http://www.tianditu.gov.cn/about/contact" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  联系我们
                </a>
                <span className="text-slate-300">|</span>
                <a href="http://www.tianditu.gov.cn/feedback" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  意见反馈
                </a>
              </div>

              <div className="mt-3 text-center text-[13px] text-slate-500">
                <a href="http://www.ngcc.cn/" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors">
                  国家基础地理信息中心
                </a>
                <span className="ml-2">版权所有</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
                <span>甲测资字1100471</span>
                <span>京ICP备18044900号-2</span>
                <span>京公网安备11010202008132号</span>
              </div>

              <div className="mt-4 flex justify-center">
                <img src="https://dcs.conac.cn/image/blue.png" alt="党政机关网站标识" className="h-9 w-auto opacity-90" />
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
