import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma = {
  documentRequestEmailSent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn()
  },
  documentRequestEmailReceived: {
    findUnique: jest.fn(),
    create: jest.fn()
  },
  documentItem: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  documentItemComment: {
    create: jest.fn()
  },
  project: {
    findFirst: jest.fn()
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  notification: {
    create: jest.fn()
  },
  $transaction: jest.fn(async (fn) => fn(mockPrisma))
}

jest.unstable_mockModule('../../../../api/_lib/prisma.js', () => ({
  prisma: mockPrisma
}))

jest.unstable_mockModule('../../../../api/notifications.js', () => ({
  createNotificationForUser: jest.fn()
}))

const {
  parseMonthYearFromText,
  parseDocMonthYearFromSubject,
  parseReplyContextFromEmail,
  processReceivedEmail
} = await import('../../../../api/inbound/document-request-reply.js')

describe('document-request-reply helpers', () => {
  test('parseMonthYearFromText extracts month/year from text', () => {
    const result = parseMonthYearFromText('Period: February 2026')
    expect(result).toEqual({ month: 2, year: 2026 })
  })

  test('parseDocMonthYearFromSubject extracts document and period', () => {
    const result = parseDocMonthYearFromSubject('Re: Abco Document / Data request: Project - Mining Right - February 2026')
    expect(result.docName).toBe('Mining Right')
    expect(result.month).toBe(2)
    expect(result.year).toBe(2026)
  })

  test('parseReplyContextFromEmail prefers body fields', () => {
    const email = {
      text: 'Project: Barberton Mines FMS & Diesel Refund\nDocument / Data: Mining Right\nPeriod: February 2026',
      html: ''
    }
    const result = parseReplyContextFromEmail(email, 'Re: some subject')
    expect(result.projectName).toBe('Barberton Mines FMS & Diesel Refund')
    expect(result.docName).toBe('Mining Right')
    expect(result.month).toBe(2)
    expect(result.year).toBe(2026)
  })
})

describe('document-request-reply processing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/attachments')) {
        return { ok: true, json: async () => ({ data: [] }) }
      }
      return {
        ok: true,
        json: async () => ({
          id: 'email-1',
          subject: 'Re: Abco Document / Data request: Barberton Mines FMS & Diesel Refund - Mining Right - February 2026',
          text: 'Project: Barberton Mines FMS & Diesel Refund\nDocument / Data: Mining Right\nPeriod: February 2026',
          html: '',
          from: 'client@example.com',
          headers: {}
        })
      }
    })

    mockPrisma.documentRequestEmailSent.findFirst.mockResolvedValue(null)
    mockPrisma.documentRequestEmailSent.findMany.mockResolvedValue([])
    mockPrisma.documentRequestEmailSent.count.mockResolvedValue(0)
    mockPrisma.documentRequestEmailReceived.findUnique.mockResolvedValue(null)
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'project-1', name: 'Barberton Mines FMS & Diesel Refund' })
    mockPrisma.documentItem.findMany.mockResolvedValue([{ id: 'doc-1', sectionId: 'section-1' }])
    mockPrisma.documentItem.findUnique.mockResolvedValue({ name: 'Mining Right', assignedTo: '[]' })
    mockPrisma.documentItemComment.create.mockResolvedValue({ id: 'comment-1' })
    mockPrisma.documentRequestEmailReceived.create.mockResolvedValue({ id: 'recv-1' })
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.user.findUnique.mockResolvedValue(null)
  })

  test('processReceivedEmail falls back to body context mapping', async () => {
    await processReceivedEmail('email-1', 're_test_key', {})

    expect(mockPrisma.documentItemComment.create).toHaveBeenCalledTimes(1)
    const created = mockPrisma.documentItemComment.create.mock.calls[0][0].data
    expect(created.itemId).toBe('doc-1')
    expect(created.month).toBe(2)
    expect(created.year).toBe(2026)
    expect(created.text).toContain('Email from Client')
    expect(mockPrisma.documentRequestEmailReceived.create).toHaveBeenCalledTimes(1)
  })
})
