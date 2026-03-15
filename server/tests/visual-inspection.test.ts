import { describe, expect, it } from 'vitest'
import { resolveVisualInspectionConfidence } from '../src/services/VisualInspectionService.js'

describe('resolveVisualInspectionConfidence', () => {
  it('treats zero confidence on a normal page as missing anomaly-probability semantics', () => {
    const confidence = resolveVisualInspectionConfidence(0, {
      anomalous: false,
      shouldRepair: false,
      severity: 'low',
    })

    expect(confidence).toBe(0.9)
  })

  it('keeps valid non-zero confidence as-is', () => {
    const confidence = resolveVisualInspectionConfidence(0.84, {
      anomalous: false,
      shouldRepair: false,
      severity: 'low',
    })

    expect(confidence).toBe(0.84)
  })

  it('accepts percentage-like values from the model', () => {
    const confidence = resolveVisualInspectionConfidence(86, {
      anomalous: true,
      shouldRepair: true,
      severity: 'medium',
    })

    expect(confidence).toBe(0.86)
  })
})
