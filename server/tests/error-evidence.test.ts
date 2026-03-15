import { describe, expect, it } from 'vitest'
import { extractErrorEvidence } from '../src/agent/ErrorEvidenceExtractor.js'

describe('extractErrorEvidence', () => {
  it('captures common runtime and api signals', () => {
    const evidence = extractErrorEvidence(
      'TMapGL is not defined at https://example.com/app.js:1',
      'new TMapGL.Map({ container: \"map\" })',
    )

    expect(evidence.matchedSignals).toContain('missing-sdk')
    expect(evidence.codeSignals).toContain('mapbox-constructor')
    expect(evidence.urls[0]).toContain('https://example.com/app.js')
  })

  it('captures overlay API mismatch signals for marker mounting', () => {
    const evidence = extractErrorEvidence(
      'map.add is not a function',
      `
        var marker = new TMapGL.Marker({ position: [118.78, 32.04], icon: el })
        map.add(marker)
        marker.setIcon(el)
      `,
    )

    expect(evidence.matchedSignals).toContain('overlay-api')
    expect(evidence.codeSignals).toContain('generic-map-add')
    expect(evidence.codeSignals).toContain('marker-constructor-mixed')
    expect(evidence.codeSignals).toContain('marker-seticon-mixed')
  })
})
