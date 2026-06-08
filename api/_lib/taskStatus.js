/** Prisma where fragment: task is still open (not done/archived). */
export function openTaskWhere() {
  return {
    status: {
      notIn: ['done', 'archived', 'complete', 'completed'],
      mode: 'insensitive',
    },
  };
}
