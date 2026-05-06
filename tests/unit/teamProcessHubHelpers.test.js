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
  })

  test('sniffImportKind drawio xml content', () => {
    expect(sniffImportKind('unknown.txt', '<mxfile>', null)).toBe('drawio')
  })

  test('sanitizeImportTitle', () => {
    expect(sanitizeImportTitle('Support/foo/bar.flow.drawio')).toBe('bar.flow')
  })
})
