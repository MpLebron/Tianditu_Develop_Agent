import { describe, expect, it } from 'vitest'
import { CodePatchService } from '../src/agent/CodePatchService.js'

describe('CodePatchService', () => {
  const service = new CodePatchService()

  it('applies a unique exact match block and produces unified diff', () => {
    const result = service.applyBlocks({
      originalCode: [
        '<script>',
        'const marker = new TMapGL.Marker();',
        'map.add(marker);',
        '</script>',
      ].join('\n'),
      fileName: 'preview.html',
      blocks: [{
        blockIndex: 0,
        search: 'map.add(marker);',
        replace: 'marker.addTo(map);',
      }],
    })

    expect(result.success).toBe(true)
    expect(result.newCode).toContain('marker.addTo(map);')
    expect(result.blockReports[0]?.strategy).toBe('exact')
    expect(result.unifiedDiff).toContain('@@')
    expect(result.unifiedDiff.startsWith('diff --git a/preview.html b/preview.html')).toBe(true)
  })

  it('applies flexible replacement when only indentation differs', () => {
    const result = service.applyBlocks({
      originalCode: [
        'function mount() {',
        '    if (map) {',
        '        map.addLayer(layerDef);',
        '    }',
        '}',
      ].join('\n'),
      blocks: [{
        blockIndex: 0,
        search: [
          'if (map) {',
          'map.addLayer(layerDef);',
          '}',
        ].join('\n'),
        replace: [
          'if (map && map.getLayer && map.getLayer(beforeId)) {',
          'map.addLayer(layerDef, beforeId);',
          '} else {',
          'map.addLayer(layerDef);',
          '}',
        ].join('\n'),
      }],
    })

    expect(result.success).toBe(true)
    expect(result.blockReports[0]?.strategy).toBe('flexible')
    expect(result.newCode).toContain('map.addLayer(layerDef, beforeId);')
  })

  it('applies regex whitespace-token replacement when token spacing changed', () => {
    const result = service.applyBlocks({
      originalCode: 'const marker = new   TMapGL.Marker( { position, icon } );',
      blocks: [{
        blockIndex: 0,
        search: 'new TMapGL.Marker({ position, icon })',
        replace: 'new TMapGL.Marker({ lngLat: position })',
      }],
    })

    expect(result.success).toBe(true)
    expect(result.blockReports[0]?.strategy).toBe('regex')
    expect(result.newCode).toContain('lngLat: position')
  })

  it('applies fuzzy replacement only on sufficiently long multi-line blocks', () => {
    const originalCode = [
      'function renderSearchResults() {',
      '  const html = results.map((item) => {',
      "    return `<li><strong>${item.name}</strong><span>${item.address}</span></li>`;",
      '  }).join("");',
      '  list.innerHTML = html;',
      '}',
    ].join('\n')

    const result = service.applyBlocks({
      originalCode,
      blocks: [{
        blockIndex: 0,
        search: [
          'const html = results.map((item) => {',
          "  return `<li><strong>${item.name}</strong><span>${item.addr}</span></li>`;",
          '}).join("");',
        ].join('\n'),
        replace: [
          'const html = results.map((item) => {',
          "  return `<li><strong>${item.name}</strong><span>${item.address}</span><em>${item.distance}</em></li>`;",
          '}).join("");',
        ].join('\n'),
      }],
    })

    expect(result.success).toBe(true)
    expect(result.blockReports[0]?.strategy).toBe('fuzzy')
    expect(result.newCode).toContain('${item.distance}')
  })

  it('rejects short fuzzy candidates to avoid accidental matches', () => {
    const result = service.applyBlocks({
      originalCode: 'map.add(marker);',
      blocks: [{
        blockIndex: 0,
        search: 'map.ad(marker);',
        replace: 'marker.addTo(map);',
      }],
    })

    expect(result.success).toBe(false)
    expect(result.blockReports[0]?.status).toBe('failed')
  })

  it('fails fast on ambiguous exact matches', () => {
    const result = service.applyBlocks({
      originalCode: [
        'map.add(marker);',
        'map.add(marker);',
      ].join('\n'),
      blocks: [{
        blockIndex: 0,
        search: 'map.add(marker);',
        replace: 'marker.addTo(map);',
      }],
    })

    expect(result.success).toBe(false)
    expect(result.blockReports[0]?.occurrences).toBe(2)
    expect(result.blockReports[0]?.message).toContain('命中 2 处')
  })

  it('parses tolerant SEARCH/REPLACE delimiters with shorter marker runs', () => {
    const blocks = service.parseSearchReplaceBlocks([
      '--- SEARCH',
      'map.add(marker);',
      '===',
      'marker.addTo(map);',
      '+++ REPLACE',
    ].join('\n'))

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.search).toBe('map.add(marker);')
    expect(blocks[0]?.replace).toBe('marker.addTo(map);')
  })
})
