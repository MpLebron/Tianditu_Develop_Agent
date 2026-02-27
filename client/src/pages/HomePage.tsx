import { useNavigate } from 'react-router-dom'

interface ExampleCard {
  title: string
  desc: string
  prompt?: string
  sampleId?: string
  icon: React.ReactNode
  gradient: string
  bgLight: string
  iconColor: string
}

const examples: ExampleCard[] = [
  {
    title: '基础地图',
    desc: '创建一个北京市中心的地图',
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
    title: '城中村改造地块',
    desc: '自动加载城中村 GeoJSON，探索拆迁地块并进行合理可视化',
    prompt: '请你探索一下我上传的这个数据，并进行合理的可视化。',
    sampleId: 'village-renovation',
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
    prompt: '请你帮我生成一个美观合理的可视化页面。对全国妇联中心按照所在的省和市进行点数据可视化，每个点上面标注该中心的基本信息。地图左侧制作一个列表，显示当前省市的妇联中心信息。',
    sampleId: 'fulian-centers',
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
    title: '3D 柱状图',
    desc: '城市 GDP 数据 3D 柱状图',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    gradient: 'from-violet-500 to-purple-400',
    bgLight: 'bg-violet-50',
    iconColor: 'text-violet-500',
  },
  {
    title: '中国洪水事件专题',
    desc: '自动加载洪水事件 GeoJSON，做点位详情与热力图分析',
    prompt: '请你帮我制作一个中国历年来发生的洪水事件空间分布专题地图应用。点击每个洪水受灾点时，在左侧侧边栏展示该事件相关信息，并在当前地图基础上增加热力图展示，以便识别中国受灾最严重的区域。',
    sampleId: 'china-flood-events',
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
]

export function HomePage() {
  const navigate = useNavigate()

  const handleExample = (prompt: string, sampleId?: string) => {
    navigate('/workspace', { state: { prompt, sampleId } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 overflow-hidden">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-purple-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-72 h-72 bg-cyan-100/30 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* 头部导航 */}
        <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/tianditu-logo.png" alt="天地图" className="h-10 object-contain" />
            <div className="w-px h-7 bg-gray-200" />
            <img src="/tianditu-subtitle.png" alt="地理底图应用开发智能体" className="h-8 object-contain" />
          </div>
          <button
            onClick={() => navigate('/workspace')}
            className="group flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
          >
            开始使用
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </header>

        {/* Hero 区域 */}
        <main className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-blue-100/60">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              天地图 JS API v5.0
            </div>

            <h1 className="text-[42px] font-bold text-gray-900 mb-4 leading-tight tracking-tight">
              用自然语言
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">
                创建天地图应用
              </span>
            </h1>
            <p className="text-lg text-gray-400 mb-14 max-w-lg mx-auto leading-relaxed">
              描述你想要的地图效果，AI 自动生成可运行的代码
            </p>
          </div>

          {/* 案例卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-left">
            {examples.map((ex, i) => (
              <button
                key={ex.title}
                onClick={() => handleExample(ex.prompt || ex.desc, ex.sampleId)}
                className="group relative bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-5 hover:shadow-xl hover:shadow-black/[0.03] hover:border-gray-300/60 hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* 悬停背景 */}
                <div className={`absolute inset-0 bg-gradient-to-br ${ex.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`} />

                <div className="relative">
                  <div className={`w-10 h-10 ${ex.bgLight} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 ${ex.iconColor}`}>
                    {ex.icon}
                  </div>
                  <div className="font-semibold text-gray-800 text-[13px] mb-1 group-hover:text-gray-900">{ex.title}</div>
                  <div className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-500">{ex.desc}</div>
                </div>

                {/* 右上箭头 */}
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-300">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {/* 底部提示 */}
          <p className="text-[11px] text-gray-300 mt-10">
            基于天地图 JS API v5.0 · 支持 GeoJSON / CSV / Excel 数据上传
          </p>
        </main>
      </div>
    </div>
  )
}
