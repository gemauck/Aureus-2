import { openTaskWhere } from '../../../../api/_lib/taskStatus.js';

describe('openTaskWhere', () => {
  it('excludes done and archived statuses case-insensitively', () => {
    expect(openTaskWhere()).toEqual({
      status: {
        notIn: ['done', 'archived', 'complete', 'completed'],
        mode: 'insensitive',
      },
    });
  });
});
