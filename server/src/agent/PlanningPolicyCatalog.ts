import type { PlanningPolicyCard } from './AgentRuntimeTypes.js'
import type { SkillDomainId } from './SkillStore.js'

const POLICY_CARDS: PlanningPolicyCard[] = [
  {
    id: 'jsapi-core-map',
    title: '地图初始化优先',
    appliesTo: ['generate'],
    domains: ['jsapi'],
    guidance: [
      '创建基础地图或地图可视化页面时，通常先读取 map-init。',
      '涉及 GeoJSON、点线面图层时，再补 bindGeoJSON 与对应图层 reference。',
      '地图交互和详情展示任务，再补 bindEvents 与 popup。',
    ],
  },
  {
    id: 'jsapi-ui-polish',
    title: 'UI 改版先规划',
    appliesTo: ['generate'],
    domains: ['ui'],
    guidance: [
      '用户明确要求页面丑、重设计、优化视觉、调整布局时，先做简短设计简报，再进入编码。',
      '先确定地图与面板的主次关系，再确定视觉方向，不要直接套通用后台模板。',
      '实现时必须补齐 loading、empty、error、hover、focus 等关键状态。',
    ],
  },
  {
    id: 'lbs-intent-routing',
    title: 'LBS 先分场景再选接口',
    appliesTo: ['generate', 'fix'],
    domains: ['lbs'],
    guidance: [
      '搜索、编码、行政区划、驾车、公交应优先进入 LBS 域。',
      '只读取与当前场景直接相关的 reference，不要把所有接口文档都读入上下文。',
      '需要地图展示结果时，允许同时选择 jsapi 和 lbs 两个域。',
    ],
  },
  {
    id: 'error-first-taxonomy',
    title: '修复先定根因',
    appliesTo: ['fix'],
    domains: ['error'],
    guidance: [
      '修复阶段先根据错误证据和诊断结果确定根因，再决定领域 reference。',
      'GeoJSON 错误优先看数据结构和提取路径，不优先归因坐标系。',
      'API/网络错误优先看代理契约、URL、返回 envelope，再改 UI。',
    ],
  },
  {
    id: 'echarts-bridge-split',
    title: '地图图表联动拆成桥接与图表本体',
    appliesTo: ['generate', 'fix'],
    domains: ['echarts-bridge', 'echarts-charts'],
    guidance: [
      'bindEcharts 只解决地图和图表联动桥接，不代替具体图表 option。',
      '如果用户明确了图表类型或 series/option 细节，再补 echarts-index 或具体 echarts-* 示例。',
    ],
  },
]

export function listPlanningPolicies(params?: {
  mode?: 'generate' | 'fix'
  domains?: SkillDomainId[]
}): PlanningPolicyCard[] {
  const mode = params?.mode
  const domains = params?.domains

  return POLICY_CARDS.filter((card) => {
    if (mode && !card.appliesTo.includes(mode)) return false
    if (domains && domains.length > 0 && card.domains?.length) {
      return card.domains.some((domain) => domains.includes(domain))
    }
    return true
  })
}

export function formatPlanningPolicyCards(params?: {
  mode?: 'generate' | 'fix'
  domains?: SkillDomainId[]
}): string {
  const cards = listPlanningPolicies(params)
  if (!cards.length) return ''

  return [
    '## Planning Policies (validator 提供的声明式建议，不直接代替你的决策)',
    ...cards.map((card) => {
      return [
        `- [${card.id}] ${card.title}`,
        ...card.guidance.map((line) => `  - ${line}`),
      ].join('\n')
    }),
  ].join('\n')
}
