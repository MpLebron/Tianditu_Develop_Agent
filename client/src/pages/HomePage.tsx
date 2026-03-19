import { useNavigate } from 'react-router-dom'
import { exampleCards, getExamplePrompt, type ExampleCard } from '../data/exampleCards'

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

      {variant === 'history' && (
        <>
          <svg viewBox="0 0 200 110" className="absolute inset-0 w-full h-full">
            <path d="M18 72 C 44 42, 62 76, 88 48 S 132 34, 182 58" fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M24 84 C 58 56, 90 94, 132 68" fill="none" stroke="rgba(255,230,230,.85)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 5" />
          </svg>
          <div className="absolute left-8 top-8 w-2.5 h-2.5 rounded-full bg-white/95" />
          <div className="absolute left-20 top-14 w-2 h-2 rounded-full bg-white/85" />
          <div className="absolute right-10 top-10 w-2.5 h-2.5 rounded-full bg-white/95" />
          <div className="absolute right-16 bottom-8 w-8 h-8 rounded-full border border-white/50 bg-white/20 flex items-center justify-center text-[10px] font-semibold text-white/90">90</div>
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

  const handleExample = (example: ExampleCard) => {
    navigate('/workspace', { state: { prompt: getExamplePrompt(example), sampleId: example.sampleId } })
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
            <img src="/tianditu-agent-logo.svg" alt="天地图开发智能体" className="h-9 sm:h-10 w-auto object-contain" />
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
              <span className="text-xs text-slate-400">共 {exampleCards.length} 个</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {exampleCards.map((ex, i) => (
                <button
                  key={ex.title}
                  onClick={() => handleExample(ex)}
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
