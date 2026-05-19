import { describe, test, expect } from '@jest/globals';
import {
  parseJobCardListSearchQuery,
  buildJobCardListSearchOr,
  buildJobCardListWhereClause
} from '../../../../api/_lib/jobCardListSearch.js';

describe('parseJobCardListSearchQuery', () => {
  test('extracts field-scoped tokens and leaves free words', () => {
    const parsed = parseJobCardListSearchQuery('site:Barberton heading:Sheba pump repair');
    expect(parsed.fieldFilters.site).toEqual(['Barberton']);
    expect(parsed.fieldFilters.heading).toEqual(['Sheba']);
    expect(parsed.freeTokens).toEqual(['pump', 'repair']);
  });

  test('supports quoted values with spaces', () => {
    const parsed = parseJobCardListSearchQuery('location:"Pit 1 North"');
    expect(parsed.fieldFilters.location).toEqual(['Pit 1 North']);
    expect(parsed.freeTokens).toEqual([]);
  });
});

describe('buildJobCardListSearchOr', () => {
  test('ANDs multiple free tokens', () => {
    const where = buildJobCardListSearchOr('barberton sheba');
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR.length).toBeGreaterThan(5);
    expect(where.AND[1].OR.length).toBeGreaterThan(5);
  });

  test('heading scope targets otherComments', () => {
    const where = buildJobCardListSearchOr('heading:Sheba');
    expect(where.OR[0].otherComments.contains).toMatch(/Heading:Sheba/i);
  });
});

describe('buildJobCardListWhereClause', () => {
  test('merges status filter with site facet and q', () => {
    const where = buildJobCardListWhereClause(
      { status: 'completed' },
      { searchQ: 'calibration', site: 'Barberton' }
    );
    expect(where.AND).toHaveLength(3);
    expect(where.AND[0]).toEqual({ status: 'completed' });
  });
});
