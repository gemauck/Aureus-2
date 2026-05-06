import { describe, expect, test } from '@jest/globals'
import { isDrawioXml, sniffImportKind, sanitizeImportTitle } from '../../src/utils/teamProcessHubHelpers.js'

describe('teamProcessHubHelpers', () => {
  test('isDrawioXml detects mxfile', () => {
    expect(isDrawioXml('<mxfile host="x"></mxfile>')).toBe(true)
    expect(isDrawioXml('hello')).toBe(false)
  })

  test('sniffImportKind by extension', () => {
    expect(sniffImportKind('a.pdf', '', null)).toBe('pdf')
    expect(sniffImportKind('b.xlsx', '', null)).toBe('excel')
    expect(sniffImportKind('c.zip', '', null)).toBe('zip')
    expect(sniffImportKind('diagram.svg', '', null)).toBe('svg')
  })

  test('sniffImportKind svg by content', () => {
    expect(sniffImportKind('unknown.xml', '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">', null)).toBe('svg')
  })

  test('sniffImportKind drawio xml content', () => {
    expect(sniffImportKind('unknown.txt', '<mxfile>', null)).toBe('drawio')
  })

  test('sanitizeImportTitle', () => {
    expect(sanitizeImportTitle('Support/foo/bar.flow.drawio')).toBe('bar.flow')
  })
})
