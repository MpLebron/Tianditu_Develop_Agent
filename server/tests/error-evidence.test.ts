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
})
