import { describe, expect, test } from '@jest/globals'
import {
  extractHeadingFromOtherComments,
  extractSignatureDataUrlFromPhotos,
  finalizeJobCardOtherCommentsForSave,
  mergeCustomerSignoffIntoOtherComments,
  mergeHeadingIntoOtherComments,
  parseCustomerSignoffFromOtherComments,
  stripCustomerSignoffLinesFromComments,
  withComputedJobCardHeading
} from '../../../../api/_lib/jobCardOtherComments.js'

describe('jobCardOtherComments', () => {
  test('extractHeadingFromOtherComments reads Heading line', () => {
    expect(
      extractHeadingFromOtherComments('Heading: Sheba pump\nCustomer: Acme')
    ).toBe('Sheba pump')
  })

  test('mergeHeadingIntoOtherComments adds heading at top', () => {
    expect(mergeHeadingIntoOtherComments('Customer: Acme', 'Sheba')).toBe(
      'Heading: Sheba\nCustomer: Acme'
    )
  })

  test('mergeHeadingIntoOtherComments replaces existing heading', () => {
    expect(
      mergeHeadingIntoOtherComments('Heading: Old\nNotes here', 'New title')
    ).toBe('Heading: New title\nNotes here')
  })

  test('mergeHeadingIntoOtherComments with empty heading removes line', () => {
    expect(mergeHeadingIntoOtherComments('Heading: Old\nNotes', '')).toBe('Notes')
  })

  test('mergeHeadingIntoOtherComments with undefined heading leaves comments', () => {
    expect(mergeHeadingIntoOtherComments('Heading: Keep\nNotes', undefined)).toBe(
      'Heading: Keep\nNotes'
    )
  })

  test('finalizeJobCardOtherCommentsForSave persists heading-only patch', () => {
    expect(
      finalizeJobCardOtherCommentsForSave({
        heading: 'MFC Handle',
        existingOtherComments: 'Customer: Samancor'
      })
    ).toBe('Heading: MFC Handle\nCustomer: Samancor')
  })

  test('finalizeJobCardOtherCommentsForSave dedupes heading in otherComments', () => {
    expect(
      finalizeJobCardOtherCommentsForSave({
        otherComments: 'Heading: Old\nHeading: Old\nNotes',
        heading: 'New'
      })
    ).toBe('Heading: New\nNotes')
  })

  test('withComputedJobCardHeading prefers explicit heading', () => {
    expect(
      withComputedJobCardHeading({
        heading: 'A',
        otherComments: 'Heading: B'
      }).heading
    ).toBe('A')
  })

  test('parseCustomerSignoffFromOtherComments reads merged lines', () => {
    expect(
      parseCustomerSignoffFromOtherComments(
        'Notes\nCustomer: Jane Doe\nPosition: Manager\nFeedback: All good\nSignature: [Captured]'
      )
    ).toEqual({
      name: 'Jane Doe',
      position: 'Manager',
      feedback: 'All good',
      signatureLabel: '[Captured]'
    })
  })

  test('stripCustomerSignoffLinesFromComments keeps technician notes', () => {
    expect(
      stripCustomerSignoffLinesFromComments(
        'Heading: Pump\nCustomer: Jane\nPump replaced'
      )
    ).toBe('Heading: Pump\nPump replaced')
  })

  test('mergeCustomerSignoffIntoOtherComments replaces prior customer lines', () => {
    expect(
      mergeCustomerSignoffIntoOtherComments({
        otherComments: 'Pump fixed\nCustomer: Old\nPosition: Old',
        customerName: 'New Name',
        customerTitle: 'Director',
        customerFeedback: '',
        hasSignature: true
      })
    ).toBe('Pump fixed\nCustomer: New Name\nPosition: Director\nSignature: [Captured]')
  })

  test('extractSignatureDataUrlFromPhotos finds signature attachment', () => {
    expect(
      extractSignatureDataUrlFromPhotos([
        { kind: 'signature', url: 'data:image/png;base64,abc' }
      ])
    ).toBe('data:image/png;base64,abc')
  })

  test('withComputedJobCardHeading attaches customer fields and signature url', () => {
    const row = withComputedJobCardHeading({
      otherComments: 'Customer: Sam\nSignature: [Captured]',
      photos: [{ kind: 'signature', url: 'data:image/png;base64,x' }]
    })
    expect(row.customerName).toBe('Sam')
    expect(row.customerSignature).toBe('data:image/png;base64,x')
  })
})
