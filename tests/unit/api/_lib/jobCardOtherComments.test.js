import { describe, expect, test } from '@jest/globals'
import {
  extractHeadingFromOtherComments,
  finalizeJobCardOtherCommentsForSave,
  mergeHeadingIntoOtherComments,
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
})
