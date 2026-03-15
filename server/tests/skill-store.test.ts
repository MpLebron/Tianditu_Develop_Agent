import { describe, expect, it } from 'vitest'
import { SkillStore } from '../src/agent/SkillStore.js'

describe('SkillStore', () => {
  it('maps legacy aliases to canonical domain ids', async () => {
    const store = new SkillStore()
    await store.init()

    expect(store.resolveAlias('map-init')).toBe('jsapi/map-init')
    expect(store.resolveAlias('geocoder')).toBe('lbs/geocoder')
    expect(store.resolveAlias('jsapi/map-init')).toBe('jsapi/map-init')
    expect(store.resolveAlias('lbs/geocoder')).toBe('lbs/geocoder')
  })

  it('groups references by logical package instead of physical package', async () => {
    const store = new SkillStore()
    await store.init()

    const packages = store.listPackages().map((pkg) => pkg.id)
    expect(packages).toContain('tianditu-jsapi')
    expect(packages).toContain('tianditu-lbs')

    const jsapiRefs = store.listReferencesByPackage('tianditu-jsapi').map((ref) => ref.canonicalName)
    const lbsRefs = store.listReferencesByPackage('tianditu-lbs').map((ref) => ref.canonicalName)

    expect(jsapiRefs).toContain('jsapi/map-init')
    expect(lbsRefs).toContain('lbs/geocoder')
    expect(lbsRefs).toContain('lbs/api-overview')
    expect(lbsRefs).toContain('lbs/scene2-nearby-search')
  })
})
