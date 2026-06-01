import { describe, it, expect } from '@jest/globals'
import {
  buildInventoryImageSearchQuery,
  isAllowedThumbnailUrl
} from '../../../api/_lib/inventoryThumbnailSuggest.js'

describe('inventoryThumbnailSuggest', () => {
  it('buildInventoryImageSearchQuery combines name, MPN, supplier', () => {
    const q = buildInventoryImageSearchQuery({
      name: '20 WAY BOX HEADER VERT',
      manufacturingPartNumber: 'HDR-20',
      supplier: 'MANTECH',
      sku: 'SK0001'
    })
    expect(q).toContain('20 WAY BOX HEADER VERT')
    expect(q).toContain('HDR-20')
    expect(q).toContain('MANTECH')
  })

  it('isAllowedThumbnailUrl rejects data URLs and localhost', () => {
    expect(isAllowedThumbnailUrl('https://example.com/a.jpg')).toBe(true)
    expect(isAllowedThumbnailUrl('data:image/png;base64,abc')).toBe(false)
    expect(isAllowedThumbnailUrl('http://127.0.0.1/x.png')).toBe(false)
  })
})
