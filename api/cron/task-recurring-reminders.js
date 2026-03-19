/**
 * Cron: Task recurring reminders (until task is done).
 * Sends in-app (and email per user settings) to assignees for tasks that have
 * reminderRecurrence = daily or weekly and status is not Done/Archived.
 * Run in-process via node-cron (e.g. daily at 9:00 AM) or HTTP with CRON_SECRET.
 */

import { prisma } from '../_lib/prisma.js';
import { createNotificationForUser } from '../notifications.js';
import { ok, badRequest, serverError } from '../_lib/response.js';

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_WEEK = 7 * MS_DAY;

function parseAssigneeIds(task) {
  const raw = task.assigneeIds;
  if (!raw || raw === 'null' || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

export async function runTaskRecurringReminders() {
  const now = new Date();
  const sent = [];
  const errors = [];

  const tasks = await prisma.task.findMany({
    where: {
      parentTaskId: null,
      reminderRecurrence: { in: ['daily', 'weekly'] },
      status: { notIn: ['Done', 'Archived', 'done', 'archived'] }
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      description: true,
      dueDate: true,
      reminderRecurrence: true,
      lastReminderSentAt: true,
      assigneeId: true,
      assigneeIds: true
    }
  });

  for (const task of tasks) {
    const recurrence = (task.reminderRecurrence || '').toLowerCase();
    if (recurrence !== 'daily' && recurrence !== 'weekly') continue;

    const lastSent = task.lastReminderSentAt ? task.lastReminderSentAt.getTime() : 0;
    const intervalMs = recurrence === 'daily' ? MS_DAY : MS_WEEK;
    if (lastSent && now.getTime() - lastSent < intervalMs) continue;

    const assigneeIds = parseAssigneeIds(task);
    if (task.assigneeId && !assigneeIds.includes(String(task.assigneeId))) {
      assigneeIds.push(String(task.assigneeId));
    }
    if (assigneeIds.length === 0) continue;

    const taskTitle = task.title || 'Untitled task';
    const dueStr = task.dueDate
      ? ` Due: ${new Date(task.dueDate).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}.`
      : '';
    const title = `Reminder: ${taskTitle}`;
    const message = `Recurring reminder for "${taskTitle}".${dueStr} Mark it done to stop reminders.`;
    const link = `#/projects/${task.projectId}?task=${task.id}`;

    try {
      for (const uid of assigneeIds) {
        try {
          await createNotificationForUser(uid, 'task', title, message, link, {
            projectId: task.projectId,
            taskId: task.id,
            taskTitle,
            taskDueDate: task.dueDate ? task.dueDate.toISOString() : null
          });
        } catch (notifyErr) {
          errors.push({ taskId: task.id, userId: uid, error: notifyErr?.message });
        }
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { lastReminderSentAt: now }
      });
      sent.push({ taskId: task.id, title: taskTitle, assigneeCount: assigneeIds.length });
    } catch (updateErr) {
      errors.push({ taskId: task.id, error: 'Failed to update lastReminderSentAt: ' + updateErr.message });
    }
  }

  return { sent, errors, tasksChecked: tasks.length };
}

async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided =
    (req.query && req.query.secret) ||
    (req.headers && (req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')));
  if (secret && provided !== secret) {
    return badRequest(res, 'Invalid or missing cron secret');
  }

  try {
    const result = await runTaskRecurringReminders();
    return ok(res, result);
  } catch (e) {
    console.error('task-recurring-reminders error:', e);
    return serverError(res, e.message || 'Cron failed');
  }
}

export default handler;
