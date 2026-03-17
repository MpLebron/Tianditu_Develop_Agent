import type { ErrorEvidence } from './AgentRuntimeTypes.js'

export function extractErrorEvidence(error: string, code: string): ErrorEvidence {
  const errorText = String(error || '')
  const lowerText = errorText.toLowerCase()
  const matchedSignals: string[] = []
  const codeSignals: string[] = []

  if (/tmapgl is not defined/.test(lowerText)) matchedSignals.push('missing-sdk')
  if (/identifier .* has already been declared|syntaxerror|unexpected token/.test(lowerText)) matchedSignals.push('syntax')
  if (/cannot read properties of undefined|undefined \(reading '0'\)|is not a function|null/.test(lowerText)) matchedSignals.push('runtime-nullish')
  if (/cannot add layer .* before non-existing layer|before non-existing layer/.test(lowerText)) matchedSignals.push('missing-before-layer')
  if (/map\.add is not a function|seticon is not a function|setelement is not a function/.test(lowerText)) matchedSignals.push('overlay-api')
  if (/ajaxerror|fetcherror|404|500|failed to fetch|network|cors|timeout/.test(lowerText)) matchedSignals.push('network')
  if (/geojson|featurecollection|valid geojson|数据格式|无法识别的数据格式/.test(lowerText)) matchedSignals.push('geojson')
  if (/allow-modals|sandbox|ignored call to alert/.test(lowerText)) matchedSignals.push('sandbox')
  if (/administrative|district|childlevel|boundary|wkt/.test(lowerText)) matchedSignals.push('administrative')
  if (/geocoder|address=|poststr|reverse-geocode/.test(lowerText)) matchedSignals.push('geocoder')
  if (/v2\/search|querytype|pointlonlat|queryradius|poi/.test(lowerText)) matchedSignals.push('search')
  if (/drive|routelatlon|orig|dest/.test(lowerText)) matchedSignals.push('drive')
  if (/transit|busline|linetype/.test(lowerText)) matchedSignals.push('transit')

  if (/new\s+TMapGL\.Map\s*\(\s*\{[\s\S]*?\bcontainer\s*:/.test(code)) codeSignals.push('mapbox-constructor')
  if (/\bmap\.add\s*\(/.test(code)) codeSignals.push('generic-map-add')
  if (/new\s+TMapGL\.Marker\s*\(\s*\{[\s\S]{0,300}?\b(?:position|icon)\s*:/.test(code)) codeSignals.push('marker-constructor-mixed')
  if (/\.\s*setIcon\s*\(/.test(code) && /\bTMapGL\.Marker\b/.test(code)) codeSignals.push('marker-seticon-mixed')
  if (/\.\s*setElement\s*\(/.test(code) && /\bTMapGL\.Popup\b/.test(code)) codeSignals.push('popup-setelement-mixed')
  if (/map\.addLayer\s*\([\s\S]{0,2000}?,\s*['"`][^'"`]+['"`]\s*\)/.test(code)) codeSignals.push('layer-beforeid-literal')
  if (/api\.tianditu\.gov\.cn\/v2\/search|api\.tianditu\.gov\.cn\/search\/v1\/poi/i.test(code)) codeSignals.push('direct-search-endpoint')
  if (/style\s*:\s*['"]default['"]/.test(code)) codeSignals.push('invalid-default-style')
  if (/coordinatesPreview/.test(code)) codeSignals.push('preview-field')

  const urls = Array.from(new Set(errorText.match(/https?:\/\/[^\s"'`]+|\/api\/[^\s"'`]+/g) || []))

  return {
    errorText,
    lowerText,
    matchedSignals,
    urls,
    codeSignals,
  }
}
