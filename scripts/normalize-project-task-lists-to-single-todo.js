#!/usr/bin/env node
/**
 * Normalize project task lists: keep only one list per project named "To Do".
 * - For each project: keep one list with name "To Do" (case-insensitive), delete all others.
 * - If no list named "To Do" exists, rename the first list to "To Do" and delete the rest.
 * - If a project has zero lists, create one "To Do" list.
 *
 * Run from repo root: node scripts/normalize-project-task-lists-to-single-todo.js
 */

import 'dotenv/config';
import { prisma } from '../api/_lib/prisma.js';

const TODO_NAME = 'To Do';

function isToDo(list) {
  const n = list.name ? String(list.name).trim().toLowerCase() : '';
  return n === 'to do' || n === 'todo';
}

async function main() {
  console.log('Normalizing project task lists to single "To Do" list per project...\n');

  const allLists = await prisma.projectTaskList.findMany({
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }],
  });

  const byProject = new Map();
  for (const list of allLists) {
    if (!byProject.has(list.projectId)) {
      byProject.set(list.projectId, []);
    }
    byProject.get(list.projectId).push(list);
  }

  let deleted = 0;
  let updated = 0;
  let created = 0;

  for (const [projectId, lists] of byProject) {
    if (lists.length === 0) continue;

    const toKeep = lists.find(isToDo) || lists[0];
    const toDelete = lists.filter((l) => l.id !== toKeep.id);

    if (!isToDo(toKeep)) {
      await prisma.projectTaskList.update({
        where: { id: toKeep.id },
        data: { name: TODO_NAME },
      });
      updated++;
    }

    for (const list of toDelete) {
      await prisma.projectTaskList.delete({ where: { id: list.id } });
      deleted++;
    }
  }

  // Projects with no task lists at all: ensure they get one "To Do" when opened in UI.
  // Optionally create one in DB so GET /api/projects/:id returns it.
  const projectIdsWithLists = new Set(byProject.keys());
  const allProjects = await prisma.project.findMany({
    select: { id: true },
  });
  for (const project of allProjects) {
    if (projectIdsWithLists.has(project.id)) continue;
    await prisma.projectTaskList.create({
      data: {
        projectId: project.id,
        name: TODO_NAME,
        order: 0,
      },
    });
    created++;
  }

  console.log('Done.');
  console.log('  Updated (renamed to "To Do"):', updated);
  console.log('  Deleted (extra lists removed):', deleted);
  console.log('  Created (projects with no lists):', created);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
