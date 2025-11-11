#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REQUIRED_FIELDS = ['name', 'clientName', 'status', 'type'];

function parseISODate(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value for ${fieldName}: ${value}`);
  }
  return parsed;
}

function normaliseProject(rawProject) {
  for (const field of REQUIRED_FIELDS) {
    if (!rawProject[field] || String(rawProject[field]).trim() === '') {
      throw new Error(`Project ${rawProject.name ?? rawProject.id ?? '<unknown>'} is missing required field "${field}".`);
    }
  }

  const startDate = parseISODate(rawProject.startDate ?? rawProject.start_date ?? rawProject.start, 'startDate') ?? new Date();
  const dueDate = parseISODate(rawProject.dueDate ?? rawProject.due_date, 'dueDate');

  return {
    id: rawProject.id ?? undefined,
    name: rawProject.name.trim(),
    clientName: rawProject.clientName.trim(),
    clientId: rawProject.clientId ?? null,
    status: rawProject.status.trim(),
    type: rawProject.type.trim(),
    description: rawProject.description ?? '',
    assignedTo: rawProject.assignedTo ?? '',
    startDate,
    dueDate,
    priority: rawProject.priority ?? 'Medium',
    progress: rawProject.progress ?? 0,
    budget: rawProject.budget ?? 0,
    actualCost: rawProject.actualCost ?? 0,
    taskLists: rawProject.taskLists ?? '[]',
    tasksList: rawProject.tasksList ?? rawProject.tasks ?? '[]',
    customFieldDefinitions: rawProject.customFieldDefinitions ?? '[]',
    documents: rawProject.documents ?? '[]',
    comments: rawProject.comments ?? '[]',
    activityLog: rawProject.activityLog ?? '[]',
    team: rawProject.team ?? '[]',
    notes: rawProject.notes ?? '',
    hasDocumentCollectionProcess: rawProject.hasDocumentCollectionProcess ?? false,
    documentSections: rawProject.documentSections ?? '[]',
  };
}

async function loadProjects(filePathArg) {
  const filePath = resolve(process.cwd(), filePathArg ?? 'scripts/desired-projects.json');
  const fileContents = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of projects in ${filePath}`);
  }

  return parsed.map(normaliseProject);
}

async function upsertProjects(projects) {
  const results = { upserted: 0, created: 0 };

  for (const project of projects) {
    if (project.id) {
      await prisma.project.upsert({
        where: { id: project.id },
        update: {
          name: project.name,
          clientName: project.clientName,
          clientId: project.clientId,
          status: project.status,
          type: project.type,
          description: project.description,
          assignedTo: project.assignedTo,
          startDate: project.startDate,
          dueDate: project.dueDate,
          priority: project.priority,
          progress: project.progress,
          budget: project.budget,
          actualCost: project.actualCost,
          taskLists: project.taskLists,
          tasksList: project.tasksList,
          customFieldDefinitions: project.customFieldDefinitions,
          documents: project.documents,
          comments: project.comments,
          activityLog: project.activityLog,
          team: project.team,
          notes: project.notes,
          hasDocumentCollectionProcess: project.hasDocumentCollectionProcess,
          documentSections: project.documentSections,
        },
        create: {
          id: project.id,
          name: project.name,
          clientName: project.clientName,
          clientId: project.clientId,
          status: project.status,
          type: project.type,
          description: project.description,
          assignedTo: project.assignedTo,
          startDate: project.startDate,
          dueDate: project.dueDate,
          priority: project.priority,
          progress: project.progress,
          budget: project.budget,
          actualCost: project.actualCost,
          taskLists: project.taskLists,
          tasksList: project.tasksList,
          customFieldDefinitions: project.customFieldDefinitions,
          documents: project.documents,
          comments: project.comments,
          activityLog: project.activityLog,
          team: project.team,
          notes: project.notes,
          hasDocumentCollectionProcess: project.hasDocumentCollectionProcess,
          documentSections: project.documentSections,
        },
      });
      results.upserted += 1;
    } else {
      await prisma.project.create({
        data: {
          name: project.name,
          clientName: project.clientName,
          clientId: project.clientId,
          status: project.status,
          type: project.type,
          description: project.description,
          assignedTo: project.assignedTo,
          startDate: project.startDate,
          dueDate: project.dueDate,
          priority: project.priority,
          progress: project.progress,
          budget: project.budget,
          actualCost: project.actualCost,
          taskLists: project.taskLists,
          tasksList: project.tasksList,
          customFieldDefinitions: project.customFieldDefinitions,
          documents: project.documents,
          comments: project.comments,
          activityLog: project.activityLog,
          team: project.team,
          notes: project.notes,
          hasDocumentCollectionProcess: project.hasDocumentCollectionProcess,
          documentSections: project.documentSections,
        },
      });
      results.created += 1;
    }
  }

  return results;
}

async function main() {
  const inputPath = process.argv[2];
  console.log('Loading projects from', inputPath ?? 'scripts/desired-projects.json');
  const projects = await loadProjects(inputPath);
  console.log(`Processing ${projects.length} project(s)...`);
  const results = await upsertProjects(projects);
  console.log('Sync summary:', results);
}

main()
  .then(() => {
    console.log('Project sync completed successfully.');
  })
  .catch((error) => {
    console.error('Project sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
