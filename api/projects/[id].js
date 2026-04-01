import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { saveDocumentSectionsToTable, saveWeeklyFMSReviewSectionsToTable, saveMonthlyFMSReviewSectionsToTable, documentSectionsToJson, weeklyFMSReviewSectionsToJson, monthlyFMSReviewSectionsToJson, buildDocumentStatusMap, buildWeeklyFMSStatusMap, buildDocumentNotesMap, parseDocumentSectionsBody, documentSectionsPayloadHasRows } from '../projects.js'
import { logProjectActivity, getActivityUserFromRequest } from '../_lib/projectActivityLog.js'

/** Run Project table migration at most once per process (perf: avoid ALTER on every GET). */
let projectColumnsMigrated = false;
/** Run Task order column migration at most once per process. */
let taskOrderColumnMigrated = false;
/** Run Task startDate/reminderRecurrence/lastReminderSentAt columns at most once per process. */
let taskDateColumnsMigrated = false;
/** Run project subresource column migrations at most once per process. */
let projectSubresourceColumnsMigrated = false;

async function ensureProjectSubresourceColumns() {
  if (projectSubresourceColumnsMigrated) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTaskList" ADD COLUMN IF NOT EXISTS "listId" INTEGER DEFAULT 0');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTaskList" ADD COLUMN IF NOT EXISTS "color" TEXT DEFAULT \'blue\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectCustomFieldDefinition" ADD COLUMN IF NOT EXISTS "fieldId" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectCustomFieldDefinition" ADD COLUMN IF NOT EXISTS "required" BOOLEAN DEFAULT false');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectCustomFieldDefinition" ADD COLUMN IF NOT EXISTS "options" TEXT DEFAULT \'[]\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectCustomFieldDefinition" ADD COLUMN IF NOT EXISTS "defaultValue" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT \'member\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "permissions" TEXT DEFAULT \'[]\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectTeamMember" ADD COLUMN IF NOT EXISTS "notes" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "url" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "type" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "size" INTEGER');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "tags" TEXT DEFAULT \'[]\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectComment" ADD COLUMN IF NOT EXISTS "author" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectComment" ADD COLUMN IF NOT EXISTS "userName" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectComment" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'comment\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "userName" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT \'\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "metadata" TEXT DEFAULT \'{}\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE "ProjectActivityLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT');
  } catch (migrationError) {
    console.warn('⚠️ Project subresource column migration (non-critical):', migrationError.message?.substring(0, 120));
  } finally {
    projectSubresourceColumnsMigrated = true;
  }
}

/**
 * Safely load project with all relations. Uses step-by-step loading so a missing
 * table or relation never 500s the request.
 */
async function loadProjectWithRelations(projectId) {
  let project = null;
  try {
    // 1. Load project row without heavy legacy JSON columns (data comes from tables below)
    project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        clientId: true,
        name: true,
        description: true,
        clientName: true,
        status: true,
        startDate: true,
        dueDate: true,
        budget: true,
        actualCost: true,
        progress: true,
        priority: true,
        type: true,
        assignedTo: true,
        googleDriveLink: true,
        onlineDriveLinks: true,
        notes: true,
        hasTimeProcess: true,
        hasDocumentCollectionProcess: true,
        hasWeeklyFMSReviewProcess: true,
        hasMonthlyFMSReviewProcess: true,
        hasMonthlyDataReviewProcess: true,
        hasComplianceReviewProcess: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        monthlyDataReviewChecklist: true,
        monthlyDataReviewSections: true,
        complianceReviewChecklist: true,
        complianceReviewSections: true
        // Exclude: tasksList, documentSections, weeklyFMSReviewSections, monthlyFMSReviewSections,
        // monthlyProgress (loaded from tables or above)
      }
    });
  } catch (findErr) {
    console.warn('⚠️ Project findUnique failed, trying minimal raw query:', findErr.message);
    try {
      const rows = await prisma.$queryRaw`SELECT id, name FROM "Project" WHERE id = ${projectId} LIMIT 1`;
      const row = rows && rows[0];
      if (!row) return null;
      project = {
        id: row.id,
        name: row.name,
        documentSections: null,
        weeklyFMSReviewSections: null,
        monthlyFMSReviewSections: null,
        hasDocumentCollectionProcess: false,
        hasTimeProcess: false,
        hasWeeklyFMSReviewProcess: false,
        hasMonthlyFMSReviewProcess: false,
        hasMonthlyDataReviewProcess: false,
        hasComplianceReviewProcess: false,
        monthlyDataReviewChecklist: '[]',
        monthlyDataReviewSections: '{}',
        complianceReviewChecklist: '[]',
        complianceReviewSections: '{}'
      };
    } catch (rawErr) {
      console.error('❌ Project raw query also failed:', rawErr.message);
      throw rawErr;
    }
  }
  if (!project) return null;

  project.tasks = Array.isArray(project.tasks) ? project.tasks : [];
  project.documentSectionsTable = Array.isArray(project.documentSectionsTable) ? project.documentSectionsTable : [];
  project.weeklyFMSReviewSectionsTable = Array.isArray(project.weeklyFMSReviewSectionsTable) ? project.weeklyFMSReviewSectionsTable : [];
  project.monthlyFMSReviewSectionsTable = Array.isArray(project.monthlyFMSReviewSectionsTable) ? project.monthlyFMSReviewSectionsTable : [];

  const loadDoc = !!project.hasDocumentCollectionProcess;
  const loadWeekly = !!project.hasWeeklyFMSReviewProcess;
  const loadMonthly = !!project.hasMonthlyFMSReviewProcess;

  // 2–5. Load only enabled tab data in parallel (skip Document/Weekly/Monthly when tab disabled)
  const [tasksResult, documentSectionsResult, weeklyFMSResult, monthlyFMSResult] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, parentTaskId: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        subtasks: { orderBy: { createdAt: 'asc' } },
        assigneeUser: { select: { id: true, name: true, email: true } }
      }
    }).catch(e => { console.warn('⚠️ tasks load skipped:', e.message); return []; }),
    loadDoc ? prisma.documentSection.findMany({
      where: { projectId },
      include: {
        documents: {
          include: {
            statuses: true,
            comments: {
              include: { authorUser: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [{ year: 'desc' }, { order: 'asc' }]
    }).catch(e => { console.warn('⚠️ documentSectionsTable load skipped:', e.message); return []; }) : Promise.resolve([]),
    loadWeekly ? prisma.weeklyFMSReviewSection.findMany({
      where: { projectId },
      include: {
        items: {
          include: {
            statuses: true,
            comments: {
              include: { authorUser: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [{ year: 'desc' }, { order: 'asc' }]
    }).catch(e => { console.warn('⚠️ weeklyFMSReviewSectionsTable load skipped:', e.message); return []; }) : Promise.resolve([]),
    loadMonthly ? prisma.monthlyFMSReviewSection.findMany({
      where: { projectId },
      include: {
        items: {
          include: {
            statuses: true,
            comments: {
              include: { authorUser: { select: { id: true, name: true, email: true } } },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [{ year: 'desc' }, { order: 'asc' }]
    }).catch(e => { console.warn('⚠️ monthlyFMSReviewSectionsTable load skipped:', e.message); return []; }) : Promise.resolve([])
  ]);

  project.tasks = Array.isArray(tasksResult) ? tasksResult : [];
  project.documentSectionsTable = Array.isArray(documentSectionsResult) ? documentSectionsResult : [];
  project.weeklyFMSReviewSectionsTable = Array.isArray(weeklyFMSResult) ? weeklyFMSResult : [];
  project.monthlyFMSReviewSectionsTable = Array.isArray(monthlyFMSResult) ? monthlyFMSResult : [];

  return project;
}

async function hydrateProjectDriveLinks(project) {
  if (!project || !project.id) return project;
  try {
    const rows = await prisma.$queryRaw`
      SELECT "googleDriveLink", "onlineDriveLinks", "projectContacts"
      FROM "Project"
      WHERE id = ${project.id}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return project;
    if (row.googleDriveLink !== undefined && row.googleDriveLink !== null) {
      project.googleDriveLink = String(row.googleDriveLink);
    }
    if (row.onlineDriveLinks !== undefined && row.onlineDriveLinks !== null) {
      project.onlineDriveLinks = String(row.onlineDriveLinks);
    }
    if (row.projectContacts !== undefined && row.projectContacts !== null) {
      project.projectContacts = String(row.projectContacts);
    }
  } catch (e) {
    console.warn('⚠️ Could not hydrate project drive links:', e?.message || e);
  }
  return project;
}

function normalizeProjectContactsPayload(input) {
  let parsed = input;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    parsed = JSON.parse(trimmed);
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const id = String(raw.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(raw.name || '').trim(),
        email: String(raw.email || '').trim(),
        phone: String(raw.phone || raw.mobile || '').trim(),
        role: String(raw.role || raw.title || '').trim(),
        siteId: raw.siteId != null ? String(raw.siteId).trim() : ''
      };
    })
    .filter(Boolean);
}

async function handler(req, res) {
  try {
    // Extract ID from Express params first (most reliable)
    let id = req.params?.id
    
    // Fallback: extract from URL if params not available
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      // Find 'projects' in path and get the next segment
      const projectsIndex = pathSegments.indexOf('projects')
      if (projectsIndex >= 0 && pathSegments[projectsIndex + 1]) {
        id = pathSegments[projectsIndex + 1]
      } else {
        // Last resort: use last segment
        id = pathSegments[pathSegments.length - 1]
      }
    }

    if (!id) {
      console.error('❌ No project ID found in request:', {
        url: req.url,
        params: req.params,
        pathname: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : 'N/A'
      })
      return badRequest(res, 'Project ID required')
    }

    // Get Single Project (GET /api/projects/[id])
    if (req.method === 'GET') {
      try {
        // One-time migration: add missing columns once per process (not on every request)
        if (!projectColumnsMigrated) {
          try {
            await prisma.$executeRaw`
              ALTER TABLE "Project"
              ADD COLUMN IF NOT EXISTS "monthlyFMSReviewSections" TEXT DEFAULT '[]',
              ADD COLUMN IF NOT EXISTS "hasMonthlyFMSReviewProcess" BOOLEAN DEFAULT false,
              ADD COLUMN IF NOT EXISTS "hasTimeProcess" BOOLEAN DEFAULT false;
            `;
            projectColumnsMigrated = true;
          } catch (migrationError) {
            if (!migrationError.message?.includes('already exists') && !migrationError.message?.includes('duplicate column')) {
              console.log('⚠️ Migration note (non-critical):', migrationError.message?.substring(0, 100));
            }
          }
        }
        if (!taskOrderColumnMigrated) {
          try {
            await prisma.$executeRaw`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;`;
            taskOrderColumnMigrated = true;
          } catch (migrationError) {
            if (!migrationError.message?.includes('already exists') && !migrationError.message?.includes('duplicate column')) {
              console.log('⚠️ Task order column migration (non-critical):', migrationError.message?.substring(0, 100));
            }
          }
        }

        /** Task start date, due date, recurring reminder columns (persist in UI). */
        if (!taskDateColumnsMigrated) {
          try {
            await prisma.$executeRawUnsafe('ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);');
            await prisma.$executeRawUnsafe('ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "reminderRecurrence" TEXT;');
            await prisma.$executeRawUnsafe('ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);');
            taskDateColumnsMigrated = true;
          } catch (migrationError) {
            if (!migrationError.message?.includes('already exists') && !migrationError.message?.includes('duplicate column')) {
              console.log('⚠️ Task date columns migration (non-critical):', migrationError.message?.substring(0, 100));
            }
          }
        }

        await ensureProjectSubresourceColumns();

        // Check if user is guest and has access to this project (load accessibleProjectIds from DB; JWT does not include it)
        const userRole = req.user?.role?.toLowerCase();
        let whereClause = { id };
        
        if (userRole === 'guest') {
          try {
            let accessibleProjectIds = [];
            if (req.user?.sub) {
              const dbUser = await prisma.user.findUnique({
                where: { id: req.user.sub },
                select: { accessibleProjectIds: true }
              });
              if (dbUser?.accessibleProjectIds) {
                if (typeof dbUser.accessibleProjectIds === 'string') {
                  accessibleProjectIds = JSON.parse(dbUser.accessibleProjectIds);
                } else if (Array.isArray(dbUser.accessibleProjectIds)) {
                  accessibleProjectIds = dbUser.accessibleProjectIds;
                }
              }
            }
            
            // Check if project ID is in accessible projects
            if (!accessibleProjectIds || !accessibleProjectIds.includes(id)) {
              return notFound(res); // Return not found to hide project existence
            }
          } catch (parseError) {
            console.error('❌ Error parsing accessibleProjectIds:', parseError);
            return notFound(res);
          }
        }

        // FAST PATH: ?summary=1 returns project + tasks only (~2 queries, show UI in seconds)
        const summaryOnly = req.query?.summary === '1' || req.query?.summary === 'true' || (() => {
          try {
            const q = (req.url || '').split('?')[1] || '';
            const p = new URLSearchParams(q);
            return p.get('summary') === '1' || p.get('summary') === 'true';
          } catch (_) { return false; }
        })();
        const driveLinksOnly = req.query?.driveLinksOnly === '1' || req.query?.driveLinksOnly === 'true' || (() => {
          try {
            const q = (req.url || '').split('?')[1] || '';
            const p = new URLSearchParams(q);
            return p.get('driveLinksOnly') === '1' || p.get('driveLinksOnly') === 'true';
          } catch (_) { return false; }
        })();
        const projectContactsOnly = req.query?.projectContactsOnly === '1' || req.query?.projectContactsOnly === 'true' || (() => {
          try {
            const q = (req.url || '').split('?')[1] || '';
            const p = new URLSearchParams(q);
            return p.get('projectContactsOnly') === '1' || p.get('projectContactsOnly') === 'true';
          } catch (_) { return false; }
        })();

        if (projectContactsOnly) {
          try {
            const rows = await prisma.$queryRaw`
              SELECT id, "projectContacts"
              FROM "Project"
              WHERE id = ${id}
              LIMIT 1
            `;
            const row = Array.isArray(rows) ? rows[0] : null;
            if (!row) return notFound(res);
            const rawPc = row.projectContacts;
            return ok(res, {
              project: {
                id: row.id,
                projectContacts: rawPc != null && rawPc !== '' ? String(rawPc) : '[]'
              }
            });
          } catch (pcErr) {
            console.error('❌ GET project projectContacts error:', pcErr?.message || pcErr, 'projectId:', id);
            return serverError(res, pcErr?.message || 'Failed to load project contacts', pcErr?.message);
          }
        }

        if (driveLinksOnly) {
          try {
            const rows = await prisma.$queryRaw`
              SELECT id, "googleDriveLink", "onlineDriveLinks"
              FROM "Project"
              WHERE id = ${id}
              LIMIT 1
            `;
            const row = Array.isArray(rows) ? rows[0] : null;
            if (!row) return notFound(res);
            return ok(res, {
              project: {
                id: row.id,
                googleDriveLink: row.googleDriveLink != null ? String(row.googleDriveLink) : '',
                onlineDriveLinks: row.onlineDriveLinks != null ? String(row.onlineDriveLinks) : ''
              }
            });
          } catch (linksErr) {
            console.error('❌ GET project drive links error:', linksErr?.message || linksErr, 'projectId:', id);
            return serverError(res, linksErr?.message || 'Failed to load project drive links', linksErr?.message);
          }
        }

        if (summaryOnly) {
          try {
            // Explicit select so we never request columns that might not exist yet (avoids 500 after schema deploy)
            const [projectRow, tasksRows, taskListsRows] = await Promise.all([
              prisma.project.findUnique({
                where: { id },
                select: {
                  id: true,
                  clientId: true,
                  name: true,
                  description: true,
                  clientName: true,
                  status: true,
                  startDate: true,
                  dueDate: true,
                  budget: true,
                  actualCost: true,
                  progress: true,
                  priority: true,
                  type: true,
                  assignedTo: true,
                  googleDriveLink: true,
                  onlineDriveLinks: true,
                  notes: true,
                  hasTimeProcess: true,
                  hasDocumentCollectionProcess: true,
                  hasWeeklyFMSReviewProcess: true,
                  hasMonthlyFMSReviewProcess: true,
                  hasMonthlyDataReviewProcess: true,
                  hasComplianceReviewProcess: true,
                  ownerId: true,
                  createdAt: true,
                  updatedAt: true,
                  monthlyDataReviewChecklist: true,
                  monthlyDataReviewSections: true,
                  complianceReviewChecklist: true,
                  complianceReviewSections: true
                }
              }),
              prisma.task.findMany({
                where: { projectId: id, parentTaskId: null },
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                include: {
                  subtasks: { orderBy: { createdAt: 'asc' } },
                  assigneeUser: { select: { id: true, name: true, email: true } }
                }
              }).catch(() => []),
              prisma.projectTaskList?.findMany
                ? prisma.projectTaskList.findMany({ where: { projectId: id }, orderBy: { order: 'asc' } }).catch(() => [])
                : Promise.resolve([])
            ]);
            if (!projectRow) return notFound(res);
            const taskLists = Array.isArray(taskListsRows) ? taskListsRows : [];
            const projectSummary = {
              ...projectRow,
              hasComplianceReviewProcess: projectRow.hasComplianceReviewProcess ?? false,
              complianceReviewChecklist: projectRow.complianceReviewChecklist ?? '[]',
              complianceReviewSections: projectRow.complianceReviewSections ?? '{}',
              tasks: tasksRows || [],
              tasksList: tasksRows || [], // alias so getTasksFromProject finds tasks when summary is used
              documentSections: {},
              weeklyFMSReviewSections: {},
              monthlyFMSReviewSections: {},
              taskLists,
              comments: [],
              documents: [],
              team: [],
              customFieldDefinitions: [],
              activityLog: []
            };
            await hydrateProjectDriveLinks(projectSummary);
            return ok(res, { project: projectSummary });
          } catch (summaryErr) {
            console.error('❌ GET project summary error:', summaryErr?.message || summaryErr, 'projectId:', id);
            return serverError(res, summaryErr?.message || 'Failed to load project summary', summaryErr?.message);
          }
        }

        // PERFORMANCE OPTIMIZATION: Check query parameters for selective loading
        let onlyFields = null;
        try {
          // Try to parse query params from URL
          const urlString = req.url || '';
          const queryString = urlString.includes('?') ? urlString.split('?')[1] : '';
          const urlParams = new URLSearchParams(queryString);
          const fields = urlParams.get('fields');
          onlyFields = fields ? fields.split(',').map(f => f.trim()) : null;
        } catch (urlError) {
          // If URL parsing fails, check req.query (Express-style)
          if (req.query?.fields) {
            const fields = typeof req.query.fields === 'string' ? req.query.fields : String(req.query.fields);
            onlyFields = fields.split(',').map(f => f.trim());
          }
        }

        if (process.env.NODE_ENV === 'development') {
          if (onlyFields && onlyFields.length > 0) {
            console.log('⚡ OPTIMIZED ENDPOINT: Loading only fields:', onlyFields, 'for project:', id);
          } else {
            console.log('🐌 FULL ENDPOINT: Loading all project data for:', id);
          }
        }
        
        // If only specific fields are requested, use optimized loading
        if (onlyFields && onlyFields.length > 0) {
          const hasMonthlyFMS = onlyFields.includes('monthlyFMSReviewSections');
          const hasWeeklyFMS = onlyFields.includes('weeklyFMSReviewSections');
          const hasDocumentSections = onlyFields.includes('documentSections');
          const hasMonthlyDataReviewSections = onlyFields.includes('monthlyDataReviewSections');
          const hasComplianceReviewSections = onlyFields.includes('complianceReviewSections');
          
          // If only requesting one of these specific fields, use optimized endpoint
          if ((hasMonthlyFMS && !hasWeeklyFMS && !hasDocumentSections && !hasMonthlyDataReviewSections && !hasComplianceReviewSections) ||
              (hasWeeklyFMS && !hasMonthlyFMS && !hasDocumentSections && !hasMonthlyDataReviewSections && !hasComplianceReviewSections) ||
              (hasDocumentSections && !hasMonthlyFMS && !hasWeeklyFMS && !hasMonthlyDataReviewSections && !hasComplianceReviewSections) ||
              (hasMonthlyDataReviewSections && !hasMonthlyFMS && !hasWeeklyFMS && !hasDocumentSections && !hasComplianceReviewSections) ||
              (hasComplianceReviewSections && !hasMonthlyFMS && !hasWeeklyFMS && !hasDocumentSections && !hasMonthlyDataReviewSections)) {
            
            // Load only basic project info + the requested field
            const basicProject = await prisma.project.findUnique({
              where: { id },
              select: {
                id: true,
                name: true,
                monthlyFMSReviewSections: hasMonthlyFMS,
                weeklyFMSReviewSections: hasWeeklyFMS,
                documentSections: hasDocumentSections,
                monthlyDataReviewSections: hasMonthlyDataReviewSections,
                complianceReviewSections: hasComplianceReviewSections
              }
            });
            
            if (!basicProject) {
              return notFound(res);
            }
            
            let result = { id: basicProject.id, name: basicProject.name };
            
            // Load the requested field from table (more reliable than JSON field)
            // PERFORMANCE: Use optimized version that skips loading comments
            if (hasMonthlyFMS) {
              try {
                const startTime = Date.now();
                const monthlyFMSJson = await monthlyFMSReviewSectionsToJson(id, { skipComments: true });
                const loadTime = Date.now() - startTime;
                console.log(`⚡ Loaded monthlyFMSReviewSections in ${loadTime}ms`);
                result.monthlyFMSReviewSections = monthlyFMSJson || 
                  (basicProject.monthlyFMSReviewSections ? 
                    (typeof basicProject.monthlyFMSReviewSections === 'string' ? 
                      JSON.parse(basicProject.monthlyFMSReviewSections) : 
                      basicProject.monthlyFMSReviewSections) : 
                    {});
              } catch (e) {
                console.error('❌ Error loading monthlyFMSReviewSections:', e);
                result.monthlyFMSReviewSections = {};
              }
            }
            
            if (hasWeeklyFMS) {
              try {
                const startTime = Date.now();
                // Include comments so weekly comments and status persist (skipComments: false)
                const weeklyFMSJson = await weeklyFMSReviewSectionsToJson(id, { skipComments: false });
                const loadTime = Date.now() - startTime;
                console.log(`⚡ Loaded weeklyFMSReviewSections in ${loadTime}ms`);
                result.weeklyFMSReviewSections = weeklyFMSJson || 
                  (basicProject.weeklyFMSReviewSections ? 
                    (typeof basicProject.weeklyFMSReviewSections === 'string' ? 
                      JSON.parse(basicProject.weeklyFMSReviewSections) : 
                      basicProject.weeklyFMSReviewSections) : 
                    {});
              } catch (e) {
                console.error('❌ Error loading weeklyFMSReviewSections:', e);
                result.weeklyFMSReviewSections = {};
              }
            }
            
            if (hasDocumentSections) {
              try {
                const startTime = Date.now();
                const docSectionsJson = await documentSectionsToJson(id, { skipComments: true });
                const loadTime = Date.now() - startTime;
                console.log(`⚡ Loaded documentSections in ${loadTime}ms`);
                result.documentSections = docSectionsJson || 
                  (basicProject.documentSections ? 
                    (typeof basicProject.documentSections === 'string' ? 
                      JSON.parse(basicProject.documentSections) : 
                      basicProject.documentSections) : 
                    {});
              } catch (e) {
                console.error('❌ Error loading documentSections:', e);
                result.documentSections = {};
              }
            }
            
            if (hasMonthlyDataReviewSections) {
              try {
                const raw = basicProject.monthlyDataReviewSections;
                if (raw != null && raw !== '') {
                  result.monthlyDataReviewSections = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } else {
                  result.monthlyDataReviewSections = {};
                }
              } catch (e) {
                console.error('❌ Error parsing monthlyDataReviewSections:', e);
                result.monthlyDataReviewSections = {};
              }
            }
            
            if (hasComplianceReviewSections) {
              try {
                const raw = basicProject.complianceReviewSections;
                if (raw != null && raw !== '') {
                  result.complianceReviewSections = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } else {
                  result.complianceReviewSections = {};
                }
              } catch (e) {
                console.error('❌ Error parsing complianceReviewSections:', e);
                result.complianceReviewSections = {};
              }
            }
            
            return ok(res, { project: result });
          }
        }
        
        // Load project with all related data from tables using safe loader
        let project;
        try {
          project = await loadProjectWithRelations(id);
          
          if (!project) {
            return notFound(res);
          }
          
          // Ensure all relation arrays exist
          if (!project.tasks) project.tasks = [];
          if (!project.documentSectionsTable) project.documentSectionsTable = [];
          if (!project.weeklyFMSReviewSectionsTable) project.weeklyFMSReviewSectionsTable = [];
        } catch (dbQueryError) {
          console.error('❌ Database query error getting project:', {
            error: dbQueryError.message,
            code: dbQueryError.code,
            name: dbQueryError.name,
            meta: dbQueryError.meta,
            stack: dbQueryError.stack?.substring(0, 1000),
            projectId: id,
            userRole: req.user?.role,
            userId: req.user?.sub
          });
          
          // Final fallback: try basic project query
          try {
            const basicProject = await prisma.project.findUnique({
              where: { id },
              select: { id: true, name: true }
            });
            if (!basicProject) {
              console.error('❌ Project not found in database:', id);
              return notFound(res);
            }
            // If project exists but we can't load relations, return error
            throw dbQueryError;
          } catch (basicError) {
            if (basicError.code === 'P2025' || basicError.message?.includes('not found')) {
              return notFound(res);
            }
            throw dbQueryError;
          }
        }
        
        if (!project) {
          return notFound(res);
        }
        
        // Load TaskComments + all other project tables in parallel (perf: one round-trip instead of 7)
        const allTaskIds = [
          ...(project.tasks || []).map(t => t.id),
          ...(project.tasks || []).flatMap(t => (t.subtasks || []).map(st => st.id))
        ];

        const [
          taskCommentsResult,
          taskListsResult,
          projectCommentsResult,
          projectDocumentsResult,
          projectTeamMembersResult,
          projectCustomFieldDefinitionsResult,
          projectActivityLogsResult
        ] = await Promise.all([
          allTaskIds.length > 0
            ? prisma.taskComment.findMany({
                where: { taskId: { in: allTaskIds } },
                include: { authorUser: { select: { id: true, name: true, email: true } } },
                orderBy: { createdAt: 'asc' }
              }).catch(e => {
                console.warn('⚠️ Task comments load failed:', e.message);
                return [];
              })
            : Promise.resolve([]),
          prisma.projectTaskList?.findMany
            ? prisma.projectTaskList.findMany({ where: { projectId: id }, orderBy: { order: 'asc' } }).catch(e => { console.warn('⚠️ Task lists load failed:', e.message); return []; })
            : Promise.resolve([]),
          prisma.projectComment?.findMany
            ? prisma.projectComment.findMany({
                where: { projectId: id, parentId: null },
                include: {
                  authorUser: { select: { id: true, name: true, email: true } },
                  replies: { include: { authorUser: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } }
                },
                orderBy: { createdAt: 'desc' },
                take: 30
              }).then(rows => rows.reverse()).catch(e => { console.warn('⚠️ Project comments load failed:', e.message); return []; })
            : Promise.resolve([]),
          prisma.projectDocument?.findMany
            ? prisma.projectDocument.findMany({
                where: { projectId: id, isActive: true },
                include: { uploader: { select: { id: true, name: true, email: true } } },
                orderBy: { uploadDate: 'desc' }
              }).catch(e => { console.warn('⚠️ Project documents load failed:', e.message); return []; })
            : Promise.resolve([]),
          prisma.projectTeamMember?.findMany
            ? prisma.projectTeamMember.findMany({
                where: { projectId: id },
                include: { user: { select: { id: true, name: true, email: true } }, adder: { select: { id: true, name: true, email: true } } },
                orderBy: { addedDate: 'asc' }
              }).catch(e => { console.warn('⚠️ Project team members load failed:', e.message); return []; })
            : Promise.resolve([]),
          prisma.projectCustomFieldDefinition?.findMany
            ? prisma.projectCustomFieldDefinition.findMany({ where: { projectId: id }, orderBy: { order: 'asc' } }).catch(e => { console.warn('⚠️ Custom field definitions load failed:', e.message); return []; })
            : Promise.resolve([]),
          prisma.projectActivityLog?.findMany
            ? prisma.projectActivityLog.findMany({
                where: { projectId: id },
                include: { user: { select: { id: true, name: true, email: true } } },
                orderBy: { createdAt: 'desc' },
                take: 100
              }).catch(e => { console.warn('⚠️ Project activity logs load failed:', e.message); return []; })
            : Promise.resolve([])
        ]);

        const taskCommentsMap = {};
        (taskCommentsResult || []).forEach(comment => {
          if (!taskCommentsMap[comment.taskId]) taskCommentsMap[comment.taskId] = [];
          taskCommentsMap[comment.taskId].push(comment);
        });

        const toTaskResponse = (task) => ({
          ...task,
          dueDate: task.dueDate != null ? (typeof task.dueDate === 'string' ? task.dueDate : task.dueDate.toISOString?.()) : null,
          startDate: task.startDate != null ? (typeof task.startDate === 'string' ? task.startDate : task.startDate.toISOString?.()) : null,
          lastReminderSentAt: task.lastReminderSentAt != null ? (typeof task.lastReminderSentAt === 'string' ? task.lastReminderSentAt : task.lastReminderSentAt.toISOString?.()) : null,
          reminderRecurrence: task.reminderRecurrence ?? null,
          comments: taskCommentsMap[task.id] || [],
          subtasks: (task.subtasks || []).map(subtask => ({
            ...subtask,
            dueDate: subtask.dueDate != null ? (typeof subtask.dueDate === 'string' ? subtask.dueDate : subtask.dueDate.toISOString?.()) : null,
            startDate: subtask.startDate != null ? (typeof subtask.startDate === 'string' ? subtask.startDate : subtask.startDate.toISOString?.()) : null,
            reminderRecurrence: subtask.reminderRecurrence ?? null,
            comments: taskCommentsMap[subtask.id] || []
          }))
        });
        const tasksWithComments = (project.tasks || []).map(toTaskResponse);

        const taskLists = Array.isArray(taskListsResult) ? taskListsResult : [];
        const projectComments = Array.isArray(projectCommentsResult) ? projectCommentsResult : [];
        const projectDocuments = Array.isArray(projectDocumentsResult) ? projectDocumentsResult : [];
        const projectTeamMembers = Array.isArray(projectTeamMembersResult) ? projectTeamMembersResult : [];
        const projectCustomFieldDefinitions = Array.isArray(projectCustomFieldDefinitionsResult) ? projectCustomFieldDefinitionsResult : [];
        const projectActivityLogs = Array.isArray(projectActivityLogsResult) ? projectActivityLogsResult : [];

        // Convert table data to JSON format that frontend expects
        // Frontend components expect year-based objects: { "2024": [...], "2025": [...] }
        let documentSectionsJson = null;
        let weeklyFMSReviewSectionsJson = null;
        let monthlyFMSReviewSectionsJson = null;
        
        try {
          // Use pre-loaded table data to avoid duplicate DB queries (perf)
          documentSectionsJson = await documentSectionsToJson(id, { preloadedSections: project.documentSectionsTable });
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 GET /api/projects/[id]: documentSectionsToJson result:', {
              projectId: id,
              hasData: !!documentSectionsJson,
              isObject: typeof documentSectionsJson === 'object',
              keys: documentSectionsJson ? Object.keys(documentSectionsJson) : [],
              yearCount: documentSectionsJson ? Object.keys(documentSectionsJson).length : 0
            });
          }
          
          // If no table data, fallback to JSON field if it exists
          if (!documentSectionsJson && project.documentSections) {
            try {
              if (typeof project.documentSections === 'string') {
                documentSectionsJson = JSON.parse(project.documentSections);
              } else {
                documentSectionsJson = project.documentSections;
              }
              if (process.env.NODE_ENV === 'development') console.log('📊 GET /api/projects/[id]: Using JSON field fallback for documentSections');
            } catch (e) {
              console.warn('⚠️ Failed to parse documentSections JSON field:', e.message);
              documentSectionsJson = {};
            }
          }
          
          // Ensure we always return an object (not null)
          if (!documentSectionsJson) {
            documentSectionsJson = {};
          }
          // Merge emailRequestByMonth from saved blob (recipients, CC, template, schedule per cell)
          if (project.documentSections && documentSectionsJson && typeof documentSectionsJson === 'object') {
            try {
              const blob = typeof project.documentSections === 'string'
                ? JSON.parse(project.documentSections) : project.documentSections;
              if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
                for (const year of Object.keys(blob)) {
                  const blobSections = blob[year];
                  const outSections = documentSectionsJson[year];
                  if (!Array.isArray(blobSections) || !Array.isArray(outSections)) continue;
                  for (let si = 0; si < outSections.length; si++) {
                    const outSection = outSections[si] || {};
                    const outSectionId = outSection.id;
                    const outSectionName = outSection.name;
                    const blobSectionByIdentity = blobSections.find((s) =>
                      String(s?.id) === String(outSectionId) ||
                      (s?.name && outSectionName && String(s.name) === String(outSectionName))
                    );
                    const blobSection = blobSectionByIdentity || blobSections[si] || {};
                    const blobDocs = Array.isArray(blobSection.documents) ? blobSection.documents : [];
                    const outDocs = Array.isArray(outSection.documents) ? outSection.documents : [];

                    for (let di = 0; di < outDocs.length; di++) {
                      if (outDocs[di]?.emailRequestByMonth) continue;
                      const outDocId = outDocs[di]?.id;
                      const outDocName = outDocs[di]?.name;
                      const blobDoc = blobDocs.find((d) =>
                        String(d?.id) === String(outDocId) ||
                        (d?.name && outDocName && String(d.name) === String(outDocName))
                      );
                      if (blobDoc?.emailRequestByMonth && typeof blobDoc.emailRequestByMonth === 'object') {
                        outDocs[di].emailRequestByMonth = blobDoc.emailRequestByMonth;
                      }
                    }
                  }
                }
              }
            } catch (mergeErr) {
              console.warn('⚠️ Merge emailRequestByMonth from documentSections blob failed:', mergeErr.message);
            }
          }
        } catch (e) {
          console.error('❌ Failed to convert documentSections from table:', e);
          // Fallback to JSON field
          if (project.documentSections) {
            try {
              if (typeof project.documentSections === 'string') {
                documentSectionsJson = JSON.parse(project.documentSections);
              } else {
                documentSectionsJson = project.documentSections;
              }
            } catch (parseError) {
              console.error('❌ Failed to parse documentSections JSON field:', parseError);
              documentSectionsJson = {};
            }
          } else {
            documentSectionsJson = {};
          }
        }
        
        try {
          // Use project.weeklyFMSReviewSections when already loaded to avoid extra findUnique (perf)
          if (project.weeklyFMSReviewSections) {
            const raw = project.weeklyFMSReviewSections;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            weeklyFMSReviewSectionsJson = (parsed && typeof parsed === 'object') ? parsed : null;
          }
          if (weeklyFMSReviewSectionsJson === null || weeklyFMSReviewSectionsJson === undefined) {
            weeklyFMSReviewSectionsJson = await weeklyFMSReviewSectionsToJson(id, { skipComments: false });
          }
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 GET /api/projects/[id]: weeklyFMSReviewSectionsToJson result:', {
              projectId: id,
              hasData: !!weeklyFMSReviewSectionsJson,
              isObject: typeof weeklyFMSReviewSectionsJson === 'object',
              keys: weeklyFMSReviewSectionsJson ? Object.keys(weeklyFMSReviewSectionsJson) : [],
              yearCount: weeklyFMSReviewSectionsJson ? Object.keys(weeklyFMSReviewSectionsJson).length : 0
            });
          }
          
          // If no table data, fallback to JSON field if it exists
          if (!weeklyFMSReviewSectionsJson && project.weeklyFMSReviewSections) {
            try {
              if (typeof project.weeklyFMSReviewSections === 'string') {
                weeklyFMSReviewSectionsJson = JSON.parse(project.weeklyFMSReviewSections);
              } else {
                weeklyFMSReviewSectionsJson = project.weeklyFMSReviewSections;
              }
              if (process.env.NODE_ENV === 'development') console.log('📊 GET /api/projects/[id]: Using JSON field fallback for weeklyFMSReviewSections');
            } catch (e) {
              console.warn('⚠️ Failed to parse weeklyFMSReviewSections JSON field:', e.message);
              weeklyFMSReviewSectionsJson = {};
            }
          }
          
          // Ensure we always return an object (not null)
          if (!weeklyFMSReviewSectionsJson) {
            weeklyFMSReviewSectionsJson = {};
          }
        } catch (e) {
          console.error('❌ Failed to convert weeklyFMSReviewSections from table:', e);
          // Fallback to JSON field
          if (project.weeklyFMSReviewSections) {
            try {
              if (typeof project.weeklyFMSReviewSections === 'string') {
                weeklyFMSReviewSectionsJson = JSON.parse(project.weeklyFMSReviewSections);
              } else {
                weeklyFMSReviewSectionsJson = project.weeklyFMSReviewSections;
              }
            } catch (parseError) {
              console.error('❌ Failed to parse weeklyFMSReviewSections JSON field:', parseError);
              weeklyFMSReviewSectionsJson = {};
            }
          } else {
            weeklyFMSReviewSectionsJson = {};
          }
        }
        
        try {
          // Use pre-loaded table data to avoid duplicate DB queries (perf)
          let monthlyJsonField = null;
          if (project.monthlyFMSReviewSections) {
            try {
              monthlyJsonField = typeof project.monthlyFMSReviewSections === 'string'
                ? JSON.parse(project.monthlyFMSReviewSections)
                : project.monthlyFMSReviewSections;
            } catch (_) {
              monthlyJsonField = null;
            }
          }
          monthlyFMSReviewSectionsJson = await monthlyFMSReviewSectionsToJson(id, {
            preloadedSections: project.monthlyFMSReviewSectionsTable,
            preloadedJsonField: monthlyJsonField
          });
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 GET /api/projects/[id]: monthlyFMSReviewSectionsToJson result:', {
              projectId: id,
              hasData: !!monthlyFMSReviewSectionsJson,
              isObject: typeof monthlyFMSReviewSectionsJson === 'object',
              keys: monthlyFMSReviewSectionsJson ? Object.keys(monthlyFMSReviewSectionsJson) : [],
              yearCount: monthlyFMSReviewSectionsJson ? Object.keys(monthlyFMSReviewSectionsJson).length : 0
            });
          }
          
          // If no table data, fallback to JSON field if it exists
          if (!monthlyFMSReviewSectionsJson && project.monthlyFMSReviewSections) {
            try {
              if (typeof project.monthlyFMSReviewSections === 'string') {
                monthlyFMSReviewSectionsJson = JSON.parse(project.monthlyFMSReviewSections);
              } else {
                monthlyFMSReviewSectionsJson = project.monthlyFMSReviewSections;
              }
              if (process.env.NODE_ENV === 'development') console.log('📊 GET /api/projects/[id]: Using JSON field fallback for monthlyFMSReviewSections');
            } catch (e) {
              console.warn('⚠️ Failed to parse monthlyFMSReviewSections JSON field:', e.message);
              monthlyFMSReviewSectionsJson = {};
            }
          }
          
          // Ensure we always return an object (not null)
          if (!monthlyFMSReviewSectionsJson) {
            monthlyFMSReviewSectionsJson = {};
          }
        } catch (e) {
          console.error('❌ Failed to convert monthlyFMSReviewSections from table:', e);
          // Fallback to JSON field
          if (project.monthlyFMSReviewSections) {
            try {
              if (typeof project.monthlyFMSReviewSections === 'string') {
                monthlyFMSReviewSectionsJson = JSON.parse(project.monthlyFMSReviewSections);
              } else {
                monthlyFMSReviewSectionsJson = project.monthlyFMSReviewSections;
              }
            } catch (parseError) {
              console.error('❌ Failed to parse monthlyFMSReviewSections JSON field:', parseError);
              monthlyFMSReviewSectionsJson = {};
            }
          } else {
            monthlyFMSReviewSectionsJson = {};
          }
        }
        
        // Transform project - use table data instead of JSON fields
        // Frontend expects these field names, so map table data to them
        const transformedProject = {
          ...project,
          // Map table data to expected field names (for frontend compatibility)
          tasksList: tasksWithComments, // Tasks from Task table with comments attached
          taskLists: taskLists, // Task lists from ProjectTaskList table
          customFieldDefinitions: projectCustomFieldDefinitions, // Custom fields from ProjectCustomFieldDefinition table
          documents: projectDocuments, // Documents from ProjectDocument table
          comments: projectComments, // Comments from ProjectComment table
          activityLog: projectActivityLogs, // Activity logs from ProjectActivityLog table
          team: projectTeamMembers, // Team from ProjectTeamMember table
          // Document sections: converted from table to JSON format, or fallback to empty object
          documentSections: documentSectionsJson || {},
          weeklyFMSReviewSections: weeklyFMSReviewSectionsJson || {},
          monthlyFMSReviewSections: monthlyFMSReviewSectionsJson || {}
        };
        
        // Remove the table relation fields to avoid confusion (keep only transformed fields)
        delete transformedProject.tasks; // Use tasksList instead
        delete transformedProject.documentSectionsTable;
        delete transformedProject.weeklyFMSReviewSectionsTable;
        delete transformedProject.monthlyFMSReviewSectionsTable;
        // Ensure module flags are always present so Time/Monthly/Weekly/DocCollection tabs persist after refresh
        if (transformedProject.hasTimeProcess === undefined) transformedProject.hasTimeProcess = false;
        if (transformedProject.hasDocumentCollectionProcess === undefined) transformedProject.hasDocumentCollectionProcess = false;
        if (transformedProject.hasWeeklyFMSReviewProcess === undefined) transformedProject.hasWeeklyFMSReviewProcess = false;
        if (transformedProject.hasMonthlyFMSReviewProcess === undefined) transformedProject.hasMonthlyFMSReviewProcess = false;
        if (transformedProject.hasMonthlyDataReviewProcess === undefined) transformedProject.hasMonthlyDataReviewProcess = false;
        if (transformedProject.hasComplianceReviewProcess === undefined) transformedProject.hasComplianceReviewProcess = false;
        if (transformedProject.monthlyDataReviewChecklist === undefined) transformedProject.monthlyDataReviewChecklist = '[]';
        if (transformedProject.monthlyDataReviewSections === undefined) transformedProject.monthlyDataReviewSections = '{}';
        if (transformedProject.complianceReviewChecklist === undefined) transformedProject.complianceReviewChecklist = '[]';
        if (transformedProject.complianceReviewSections === undefined) transformedProject.complianceReviewSections = '{}';

        await hydrateProjectDriveLinks(transformedProject);

        // Prevent caching so section deletes and edits always show after refresh
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        return ok(res, { project: transformedProject })
      } catch (dbError) {
        console.error('❌ Database error getting project:', {
          error: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack,
          projectId: id,
          userRole: req.user?.role,
          userId: req.user?.sub
        })
        // Return more detailed error in development
        const errorMessage = process.env.NODE_ENV === 'development' 
          ? `Failed to get project: ${dbError.message} (Code: ${dbError.code || 'N/A'})`
          : 'Failed to get project'
        return serverError(res, errorMessage, dbError.message)
      }
    }

    // Update Project (PUT /api/projects/[id])
    if (req.method === 'PUT' || req.method === 'PATCH') {
      // Ensure optional columns exist (one ALTER per column for PostgreSQL compatibility)
      const optionalColumns = [
        ['hasDocumentCollectionProcess', 'BOOLEAN DEFAULT false'],
        ['hasTimeProcess', 'BOOLEAN DEFAULT false'],
        ['hasWeeklyFMSReviewProcess', 'BOOLEAN DEFAULT false'],
        ['hasMonthlyFMSReviewProcess', 'BOOLEAN DEFAULT false'],
        ['hasMonthlyDataReviewProcess', 'BOOLEAN DEFAULT false'],
        ['monthlyDataReviewChecklist', "TEXT DEFAULT '[]'"],
        ['monthlyDataReviewSections', "TEXT DEFAULT '{}'"],
        ['hasComplianceReviewProcess', 'BOOLEAN DEFAULT false'],
        ['complianceReviewChecklist', "TEXT DEFAULT '[]'"],
        ['complianceReviewSections', "TEXT DEFAULT '{}'"],
        ['googleDriveLink', "TEXT DEFAULT ''"],
        ['onlineDriveLinks', "TEXT DEFAULT '{\"googleDrive\":[\"\"],\"oneDrive\":[\"\"]}'"],
        ['projectContacts', "TEXT DEFAULT '[]'"]
      ];
      for (const [col, def] of optionalColumns) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "${col}" ${def}`
          );
        } catch (alterErr) {
          if (!alterErr.message?.includes('already exists') && !alterErr.message?.includes('duplicate column')) {
            console.warn('⚠️ PUT projects: optional column', col, alterErr.message?.substring(0, 60));
          }
        }
      }

      let body = req.body

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (parseError) {
          console.error('❌ Failed to parse string body for project update:', parseError)
          body = {}
        }
      }

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }

      body = body || {}

      // Persist weeklyFMSReviewSections immediately when present (e.g. section delete).
      // Do this before the main transaction so the column is always saved even if the rest of the PUT fails.
      if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
        const payload = typeof body.weeklyFMSReviewSections === 'string'
          ? body.weeklyFMSReviewSections.trim() || '{}'
          : JSON.stringify(body.weeklyFMSReviewSections);
        try {
          await prisma.project.update({
            where: { id },
            data: { weeklyFMSReviewSections: payload }
          });
        } catch (e) {
          console.error('⚠️ Early weeklyFMSReviewSections update failed:', e.message);
        }
      }

      // Validate project type - only allow General, Monthly Review, or Audit
      const allowedTypes = ['General', 'Monthly Review', 'Audit'];
      if (body.type && !allowedTypes.includes(body.type)) {
        return badRequest(res, `Invalid project type. Allowed types are: ${allowedTypes.join(', ')}`)
      }
      
      // Find or create client by name if client info is provided
      const hasClientField = Object.prototype.hasOwnProperty.call(body, 'client');
      const hasClientNameField = Object.prototype.hasOwnProperty.call(body, 'clientName');
      const hasClientIdField = Object.prototype.hasOwnProperty.call(body, 'clientId');
      const hasClientInput = hasClientField || hasClientNameField;
      let normalizedClientName = hasClientField ? body.client : body.clientName;

      if (typeof normalizedClientName === 'string') {
        normalizedClientName = normalizedClientName.trim();
      }

      let clientId = null;
      if (hasClientInput && normalizedClientName) {
        try {
          let client = await prisma.client.findFirst({ 
            where: { name: normalizedClientName } 
          });
          
          // If client doesn't exist, create it
          if (!client) {
            client = await prisma.client.create({
              data: {
                name: normalizedClientName,
                type: 'client',
                industry: 'Other',
                status: 'active',
                ownerId: req.user?.sub || null
              }
            });
          }
          
          clientId = client.id;
        } catch (error) {
          console.error('Error finding/creating client:', error);
        }
      }
      
      const normalizedStartDate = typeof body.startDate === 'string' ? body.startDate.trim() : ''
      const normalizedDueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : ''

      const updateData = {
        name: body.name,
        description: body.description,
        clientName: hasClientInput ? (normalizedClientName || '') : undefined,
        clientId: hasClientInput ? clientId : (hasClientIdField ? body.clientId : undefined),
        status: body.status,
        startDate: normalizedStartDate ? new Date(normalizedStartDate) : undefined,
        dueDate: normalizedDueDate ? new Date(normalizedDueDate) : undefined,
        budget: body.budget,
        priority: body.priority,
        type: body.type,
        assignedTo: body.assignedTo,
        googleDriveLink: body.googleDriveLink !== undefined ? String(body.googleDriveLink || '').trim() : undefined,
        onlineDriveLinks: body.onlineDriveLinks !== undefined ? String(body.onlineDriveLinks || '{"googleDrive":[""],"oneDrive":[""]}') : undefined,
        projectContacts: body.projectContacts !== undefined
          ? (() => {
              try {
                return JSON.stringify(normalizeProjectContactsPayload(body.projectContacts));
              } catch (_) {
                return '[]';
              }
            })()
          : undefined,
        // JSON fields completely removed - data now stored ONLY in separate tables:
        // - tasksList → Task table (via /api/tasks)
        // - taskLists → ProjectTaskList table (via /api/project-task-lists)
        // - customFieldDefinitions → ProjectCustomFieldDefinition table (via /api/project-custom-fields)
        // - team → ProjectTeamMember table (via /api/project-team-members)
        // - documents → ProjectDocument table (via /api/project-documents)
        // - comments → ProjectComment table (via /api/project-comments)
        // - activityLog → ProjectActivityLog table (via /api/project-activity-logs)
        // These fields are no longer stored in Project table - use dedicated APIs instead
        notes: body.notes,
        hasDocumentCollectionProcess: body.hasDocumentCollectionProcess !== undefined ? body.hasDocumentCollectionProcess : undefined
      }
      
      // Handle documentSections separately if provided - ensure it's properly saved
      if (body.documentSections !== undefined && body.documentSections !== null) {
        const parsedDocSecProbe = parseDocumentSectionsBody(body.documentSections)
        if (parsedDocSecProbe === undefined) {
          console.error('❌ Invalid documentSections JSON in PUT /api/projects/[id]')
        } else if (!documentSectionsPayloadHasRows(parsedDocSecProbe)) {
          console.warn('⚠️ PUT /api/projects/[id]: Ignoring empty documentSections (wipe protection)')
        } else {
          try {
            if (typeof body.documentSections === 'string') {
              const trimmed = body.documentSections.trim();
              if (trimmed === '') {
                updateData.documentSections = JSON.stringify([]);
              } else {
                try {
                  JSON.parse(trimmed);
                  updateData.documentSections = trimmed;
                } catch (parseError) {
                  console.error('❌ Invalid documentSections JSON string:', parseError);
                  updateData.documentSections = JSON.stringify(body.documentSections);
                }
              }
            } else if (Array.isArray(body.documentSections)) {
              updateData.documentSections = JSON.stringify(body.documentSections);
            } else if (typeof body.documentSections === 'object') {
              updateData.documentSections = JSON.stringify(body.documentSections);
            } else {
              updateData.documentSections = JSON.stringify(body.documentSections);
            }
          } catch (error) {
            console.error('❌ Error processing documentSections:', error);
          }
        }
      }
      
      // Handle weeklyFMSReviewSections separately if provided - ensure it's properly saved
      if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
        try {
          
          if (typeof body.weeklyFMSReviewSections === 'string') {
            // Already a string, validate it's valid JSON
            const trimmed = body.weeklyFMSReviewSections.trim();
            if (trimmed === '') {
              // Empty string means empty object/array
              updateData.weeklyFMSReviewSections = JSON.stringify({});
            } else {
              try {
                // Validate it's valid JSON
                const parsed = JSON.parse(trimmed);
                // If it parsed successfully, use it as-is (it's already a stringified JSON)
                updateData.weeklyFMSReviewSections = trimmed;
              } catch (parseError) {
                console.error('❌ Invalid weeklyFMSReviewSections JSON string:', parseError);
                // If string is invalid JSON, stringify it (might be double-encoded or corrupted)
                updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
              }
            }
          } else if (Array.isArray(body.weeklyFMSReviewSections)) {
            // It's an array, stringify it
            updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
          } else if (typeof body.weeklyFMSReviewSections === 'object') {
            // It's an object, stringify it
            updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
          } else {
            // It's something else (number, boolean, etc.), stringify it
            updateData.weeklyFMSReviewSections = JSON.stringify(body.weeklyFMSReviewSections);
          }
        } catch (error) {
          console.error('❌ Error processing weeklyFMSReviewSections:', error);
          // Don't fail the entire update, but log the error
        }
        // Ensure we never skip persisting when the client sent the field (e.g. after section delete)
        if (updateData.weeklyFMSReviewSections === undefined) {
          const raw = body.weeklyFMSReviewSections;
          updateData.weeklyFMSReviewSections = typeof raw === 'string'
            ? (raw.trim() || '{}')
            : JSON.stringify(raw != null && typeof raw === 'object' ? raw : {});
        }
      }
      
      // Handle hasTimeProcess separately if provided - normalize to boolean (persists Time tab after refresh)
      if (body.hasTimeProcess !== undefined && body.hasTimeProcess !== null) {
        updateData.hasTimeProcess = typeof body.hasTimeProcess === 'boolean'
          ? body.hasTimeProcess
          : Boolean(body.hasTimeProcess === true || body.hasTimeProcess === 'true' || body.hasTimeProcess === 1);
      }
      
      // Handle hasWeeklyFMSReviewProcess separately if provided - normalize to boolean
      if (body.hasWeeklyFMSReviewProcess !== undefined && body.hasWeeklyFMSReviewProcess !== null) {
        updateData.hasWeeklyFMSReviewProcess = typeof body.hasWeeklyFMSReviewProcess === 'boolean'
          ? body.hasWeeklyFMSReviewProcess
          : Boolean(body.hasWeeklyFMSReviewProcess === true || body.hasWeeklyFMSReviewProcess === 'true' || body.hasWeeklyFMSReviewProcess === 1);
      }
      
      // Handle monthlyFMSReviewSections separately if provided - ensure it's properly saved to JSON field
      if (body.monthlyFMSReviewSections !== undefined && body.monthlyFMSReviewSections !== null) {
        try {
          if (typeof body.monthlyFMSReviewSections === 'string') {
            const trimmed = body.monthlyFMSReviewSections.trim();
            if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
              updateData.monthlyFMSReviewSections = JSON.stringify({});
            } else {
              // Validate it's valid JSON
              try {
                JSON.parse(trimmed);
                updateData.monthlyFMSReviewSections = trimmed;
              } catch (parseError) {
                console.error('❌ Invalid monthlyFMSReviewSections JSON string:', parseError);
                // Try to stringify the original value as fallback
                updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
              }
            }
          } else if (Array.isArray(body.monthlyFMSReviewSections)) {
            updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
          } else if (typeof body.monthlyFMSReviewSections === 'object') {
            updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
          } else {
            updateData.monthlyFMSReviewSections = JSON.stringify(body.monthlyFMSReviewSections);
          }
        } catch (error) {
          console.error('❌ Error processing monthlyFMSReviewSections:', error);
          updateData.monthlyFMSReviewSections = JSON.stringify({});
        }
      }
      
      // Handle hasMonthlyFMSReviewProcess separately if provided - normalize to boolean
      if (body.hasMonthlyFMSReviewProcess !== undefined && body.hasMonthlyFMSReviewProcess !== null) {
        updateData.hasMonthlyFMSReviewProcess = typeof body.hasMonthlyFMSReviewProcess === 'boolean'
          ? body.hasMonthlyFMSReviewProcess
          : Boolean(body.hasMonthlyFMSReviewProcess === true || body.hasMonthlyFMSReviewProcess === 'true' || body.hasMonthlyFMSReviewProcess === 1);
      }

      // Handle hasMonthlyDataReviewProcess separately if provided - normalize to boolean
      if (body.hasMonthlyDataReviewProcess !== undefined && body.hasMonthlyDataReviewProcess !== null) {
        updateData.hasMonthlyDataReviewProcess = typeof body.hasMonthlyDataReviewProcess === 'boolean'
          ? body.hasMonthlyDataReviewProcess
          : Boolean(body.hasMonthlyDataReviewProcess === true || body.hasMonthlyDataReviewProcess === 'true' || body.hasMonthlyDataReviewProcess === 1);
      }

      // Handle monthlyDataReviewChecklist separately if provided - JSON string
      if (body.monthlyDataReviewChecklist !== undefined && body.monthlyDataReviewChecklist !== null) {
        try {
          const val = body.monthlyDataReviewChecklist;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            updateData.monthlyDataReviewChecklist = trimmed === '' ? '[]' : trimmed;
          } else if (Array.isArray(val) || typeof val === 'object') {
            updateData.monthlyDataReviewChecklist = JSON.stringify(val);
          } else {
            updateData.monthlyDataReviewChecklist = JSON.stringify([]);
          }
        } catch (e) {
          console.warn('Invalid monthlyDataReviewChecklist:', e);
          updateData.monthlyDataReviewChecklist = '[]';
        }
      }

      // Handle monthlyDataReviewSections separately if provided - same shape as documentSections (year -> sections)
      if (body.monthlyDataReviewSections !== undefined && body.monthlyDataReviewSections !== null) {
        try {
          const val = body.monthlyDataReviewSections;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            updateData.monthlyDataReviewSections = trimmed === '' ? '{}' : trimmed;
          } else if (typeof val === 'object') {
            updateData.monthlyDataReviewSections = JSON.stringify(val);
          } else {
            updateData.monthlyDataReviewSections = '{}';
          }
        } catch (e) {
          console.warn('Invalid monthlyDataReviewSections:', e);
          updateData.monthlyDataReviewSections = '{}';
        }
      }

      // Handle hasComplianceReviewProcess separately if provided - normalize to boolean
      if (body.hasComplianceReviewProcess !== undefined && body.hasComplianceReviewProcess !== null) {
        updateData.hasComplianceReviewProcess = typeof body.hasComplianceReviewProcess === 'boolean'
          ? body.hasComplianceReviewProcess
          : Boolean(body.hasComplianceReviewProcess === true || body.hasComplianceReviewProcess === 'true' || body.hasComplianceReviewProcess === 1);
      }

      // Handle complianceReviewChecklist separately if provided - JSON string
      if (body.complianceReviewChecklist !== undefined && body.complianceReviewChecklist !== null) {
        try {
          const val = body.complianceReviewChecklist;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            updateData.complianceReviewChecklist = trimmed === '' ? '[]' : trimmed;
          } else if (Array.isArray(val) || typeof val === 'object') {
            updateData.complianceReviewChecklist = JSON.stringify(val);
          } else {
            updateData.complianceReviewChecklist = JSON.stringify([]);
          }
        } catch (e) {
          console.warn('Invalid complianceReviewChecklist:', e);
          updateData.complianceReviewChecklist = '[]';
        }
      }

      // Handle complianceReviewSections separately if provided - same shape as documentSections (year -> sections)
      if (body.complianceReviewSections !== undefined && body.complianceReviewSections !== null) {
        try {
          const val = body.complianceReviewSections;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            updateData.complianceReviewSections = trimmed === '' ? '{}' : trimmed;
          } else if (typeof val === 'object') {
            updateData.complianceReviewSections = JSON.stringify(val);
          } else {
            updateData.complianceReviewSections = '{}';
          }
        } catch (e) {
          console.warn('Invalid complianceReviewSections:', e);
          updateData.complianceReviewSections = '{}';
        }
      }
      
      // Handle monthlyProgress separately if provided - with validation for safety
      if (body.monthlyProgress !== undefined && body.monthlyProgress !== null) {
        try {
          let monthlyProgressString = body.monthlyProgress;
          
          // If it's already a string, validate it's valid JSON
          if (typeof monthlyProgressString === 'string') {
            // Validate JSON structure
            const parsed = JSON.parse(monthlyProgressString);
            
            // Ensure it's an object (not array, null, or primitive)
            if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
              throw new Error('monthlyProgress must be an object');
            }
            
            // Validate structure - each key should be a month-year format
            // and values should be objects with valid fields
            for (const key in parsed) {
              if (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]) || parsed[key] === null) {
                console.warn(`⚠️ Invalid month data structure for key: ${key}`);
                // Don't fail, but log warning
              } else {
                // Check for valid field names (compliance, data, comments)
                const validFields = ['compliance', 'data', 'comments'];
                for (const field in parsed[key]) {
                  if (validFields.includes(field) && typeof parsed[key][field] !== 'string') {
                    // Convert non-string values to strings for safety
                    parsed[key][field] = String(parsed[key][field] || '');
                  }
                }
              }
            }
            
            // Re-stringify the validated/cleaned data
            monthlyProgressString = JSON.stringify(parsed);
          } else {
            // If it's an object, validate and stringify
            if (typeof monthlyProgressString !== 'object' || Array.isArray(monthlyProgressString)) {
              throw new Error('monthlyProgress must be an object');
            }
            monthlyProgressString = JSON.stringify(monthlyProgressString);
          }
          
          updateData.monthlyProgress = monthlyProgressString;
        } catch (error) {
          console.error('❌ Invalid monthlyProgress data:', error);
          return serverError(res, 'Invalid monthlyProgress format. Must be valid JSON object.', error.message);
        }
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      // Some local environments run an older generated Prisma client that does not yet
      // include onlineDriveLinks on Project. Persist this field via raw SQL so PUT works
      // even when Prisma schema/client is temporarily out of sync.
      const onlineDriveLinksPayload =
        Object.prototype.hasOwnProperty.call(updateData, 'onlineDriveLinks')
          ? updateData.onlineDriveLinks
          : null;
      if (Object.prototype.hasOwnProperty.call(updateData, 'onlineDriveLinks')) {
        delete updateData.onlineDriveLinks;
      }
      const projectContactsPayload =
        Object.prototype.hasOwnProperty.call(updateData, 'projectContacts')
          ? updateData.projectContacts
          : null;
      if (Object.prototype.hasOwnProperty.call(updateData, 'projectContacts')) {
        delete updateData.projectContacts;
      }
      
      // Check if project exists and load current values for activity log diff
      const existingProject = await prisma.project.findUnique({
        where: { id }
      })
      if (!existingProject) {
        console.error('❌ Project not found for update:', id)
        return notFound(res, 'Project not found')
      }

      if (projectContactsPayload !== null) {
        let normalizedContacts = [];
        try {
          normalizedContacts = normalizeProjectContactsPayload(projectContactsPayload);
        } catch (parseError) {
          return badRequest(res, 'Invalid projectContacts format. Must be a JSON array.')
        }
        const targetClientId = updateData.clientId !== undefined ? updateData.clientId : existingProject.clientId;
        if (!targetClientId && normalizedContacts.length > 0) {
          return badRequest(res, 'Cannot link project contacts without a client on the project.')
        }
        if (targetClientId && normalizedContacts.length > 0) {
          const allowedContacts = await prisma.clientContact.findMany({
            where: { clientId: targetClientId },
            select: { id: true }
          });
          const allowedIdSet = new Set(allowedContacts.map((c) => String(c.id)));
          const invalidIds = normalizedContacts
            .map((c) => String(c.id))
            .filter((contactId) => !allowedIdSet.has(contactId));
          if (invalidIds.length > 0) {
            return badRequest(res, 'One or more linked contacts do not belong to this client.')
          }
        }
      }
      
      try {
        // Use a transaction to ensure atomicity - if table save fails, project update is rolled back
        const result = await prisma.$transaction(async (tx) => {
          // First update the project
          const project = await tx.project.update({ 
            where: { id }, 
            data: updateData 
          });

          if (onlineDriveLinksPayload !== null) {
            await tx.$executeRaw`
              UPDATE "Project"
              SET "onlineDriveLinks" = ${onlineDriveLinksPayload}
              WHERE id = ${id}
            `;
          }
          if (projectContactsPayload !== null) {
            await tx.$executeRaw`
              UPDATE "Project"
              SET "projectContacts" = ${projectContactsPayload}
              WHERE id = ${id}
            `;
          }
          
          // CRITICAL: Save documentSections and weeklyFMSReviewSections to tables
          // The GET endpoint reads from tables, so we must save to tables for persistence
          // Pass the original body value (could be string or object) - save functions handle both
          if (
            body.documentSections !== undefined &&
            body.documentSections !== null &&
            documentSectionsPayloadHasRows(parseDocumentSectionsBody(body.documentSections))
          ) {
            try {
              if (process.env.NODE_ENV === 'development') {
                console.log('💾 PUT /api/projects/[id]: Saving documentSections to table', { projectId: id });
              }
              await saveDocumentSectionsToTable(id, body.documentSections, getActivityUserFromRequest(req));
              if (process.env.NODE_ENV === 'development') console.log('✅ PUT /api/projects/[id]: documentSections saved');
            } catch (tableError) {
              console.error('⚠️ Error saving documentSections to table (project row already updated):', {
                error: tableError.message,
                code: tableError.code,
                projectId: id
              });
              // Don't fail the request - project update and JSON field are already saved
            }
          }
          
          // Weekly FMS: source of truth is Project.weeklyFMSReviewSections JSON (already saved above).
          // Skip table save to avoid P2022 (e.g. missing attachments column) and keep PUT always succeeding.
          if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
            // saveWeeklyFMSReviewSectionsToTable intentionally not called – JSON-only persistence.
          }
          
          if (body.monthlyFMSReviewSections !== undefined && body.monthlyFMSReviewSections !== null) {
            try {
              if (process.env.NODE_ENV === 'development') console.log('💾 PUT /api/projects/[id]: Saving monthlyFMSReviewSections to table', { projectId: id });
              await saveMonthlyFMSReviewSectionsToTable(id, body.monthlyFMSReviewSections, getActivityUserFromRequest(req));
              if (process.env.NODE_ENV === 'development') console.log('✅ PUT /api/projects/[id]: monthlyFMSReviewSections saved');
            } catch (tableError) {
              console.error('⚠️ WARNING: Error saving monthlyFMSReviewSections to table (JSON field already saved):', {
                error: tableError.message,
                stack: tableError.stack,
                code: tableError.code,
                meta: tableError.meta,
                projectId: id,
                dataType: typeof body.monthlyFMSReviewSections
              });
              // Don't fail the request - JSON field is already saved, table save is optional
              // This allows data to persist even if table doesn't exist yet
            }
          }
          
          return project;
        });
        
        // Ensure weeklyFMSReviewSections is persisted: if client sent it, write it again in a separate update
        // so the column is definitely saved (avoids any transaction/merge issue on section delete).
        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          const payload = typeof body.weeklyFMSReviewSections === 'string'
            ? body.weeklyFMSReviewSections.trim() || '{}'
            : JSON.stringify(body.weeklyFMSReviewSections);
          try {
            await prisma.$executeRaw`
              UPDATE "Project" SET "weeklyFMSReviewSections" = ${payload} WHERE id = ${id}
            `;
          } catch (e) {
            console.error('⚠️ Follow-up weeklyFMSReviewSections update failed (main update may have succeeded):', e.message);
          }
        }

        // Activity log: project field changes and JSON section diffs (non-fatal)
        const { userId: activityUserId, userName: activityUserName } = getActivityUserFromRequest(req);
        const fieldsWithDedicatedDiff = new Set([
          'documentSections',
          'weeklyFMSReviewSections',
          'monthlyDataReviewSections',
          'complianceReviewSections'
        ]);
        const normalizeForDiff = (value) => {
          if (value instanceof Date) return value.toISOString();
          if (value == null) return '';
          if (typeof value === 'object') {
            try {
              return JSON.stringify(value);
            } catch (_) {
              return String(value);
            }
          }
          return String(value);
        };
        const summarizeValue = (value, maxLen = 180) => {
          const normalized = normalizeForDiff(value);
          return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
        };

        for (const field of Object.keys(updateData)) {
          if (fieldsWithDedicatedDiff.has(field)) continue;
          const oldVal = existingProject?.[field];
          const newVal = updateData[field];
          if (normalizeForDiff(oldVal) === normalizeForDiff(newVal)) continue;

          await logProjectActivity(prisma, {
            projectId: id,
            userId: activityUserId,
            userName: activityUserName,
            type: 'project_updated',
            description: `Project ${field} changed`,
            metadata: {
              entityType: 'project',
              entityId: id,
              field,
              oldValue: summarizeValue(oldVal),
              newValue: summarizeValue(newVal)
            }
          });
        }

        if (onlineDriveLinksPayload !== null) {
          const oldVal = existingProject?.onlineDriveLinks;
          const newVal = onlineDriveLinksPayload;
          if (normalizeForDiff(oldVal) !== normalizeForDiff(newVal)) {
            await logProjectActivity(prisma, {
              projectId: id,
              userId: activityUserId,
              userName: activityUserName,
              type: 'project_updated',
              description: 'Project onlineDriveLinks changed',
              metadata: {
                entityType: 'project',
                entityId: id,
                field: 'onlineDriveLinks',
                oldValue: summarizeValue(oldVal),
                newValue: summarizeValue(newVal)
              }
            });
          }
        }
        if (projectContactsPayload !== null) {
          const oldVal = existingProject?.projectContacts;
          const newVal = projectContactsPayload;
          if (normalizeForDiff(oldVal) !== normalizeForDiff(newVal)) {
            await logProjectActivity(prisma, {
              projectId: id,
              userId: activityUserId,
              userName: activityUserName,
              type: 'project_updated',
              description: 'Project projectContacts changed',
              metadata: {
                entityType: 'project',
                entityId: id,
                field: 'projectContacts',
                oldValue: summarizeValue(oldVal),
                newValue: summarizeValue(newVal)
              }
            });
          }
        }
        if (body.monthlyDataReviewSections !== undefined && body.monthlyDataReviewSections !== null) {
          try {
            const oldJson = existingProject.monthlyDataReviewSections;
            const oldParsed = (typeof oldJson === 'string' && oldJson) ? JSON.parse(oldJson) : (oldJson && typeof oldJson === 'object' ? oldJson : {});
            const newParsed = typeof body.monthlyDataReviewSections === 'string' ? JSON.parse(body.monthlyDataReviewSections) : body.monthlyDataReviewSections;
            const oldMap = buildDocumentStatusMap(oldParsed);
            const newMap = buildDocumentStatusMap(newParsed);
            for (const [entryKey, newEntry] of newMap) {
              const oldEntry = oldMap.get(entryKey);
              const oldStatus = oldEntry ? oldEntry.status : null;
              if (oldStatus !== newEntry.status) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'monthly_data_review_status_change',
                  description: `Monthly Data Review "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')}): ${oldStatus || 'pending'} → ${newEntry.status}`,
                  metadata: { entityType: 'monthly_data_review', entityId: newEntry.docId, documentName: newEntry.docName, year: newEntry.year, month: newEntry.month, oldValue: oldStatus, newValue: newEntry.status }
                });
              }
            }
            const oldNotesMap = buildDocumentNotesMap(oldParsed);
            const newNotesMap = buildDocumentNotesMap(newParsed);
            const noteSnippetMdr = (text, maxLen = 120) => (text && text.length > maxLen ? text.slice(0, maxLen) + '…' : (text || ''));
            for (const [entryKey, newEntry] of newNotesMap) {
              const oldEntry = oldNotesMap.get(entryKey);
              const oldNotes = oldEntry ? oldEntry.notes : '';
              if (oldNotes !== newEntry.notes) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'monthly_data_review_notes_change',
                  description: `Monthly Data Review notes: "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')})${newEntry.notes ? ` — ${noteSnippetMdr(newEntry.notes)}` : ' — cleared'}`,
                  metadata: {
                    entityType: 'monthly_data_review',
                    entityId: newEntry.docId,
                    documentName: newEntry.docName,
                    year: newEntry.year,
                    month: newEntry.month,
                    oldValue: oldNotes,
                    newValue: newEntry.notes,
                    noteSnippet: noteSnippetMdr(newEntry.notes)
                  }
                });
              }
            }
          } catch (e) {
            console.warn('Activity log monthlyDataReviewSections diff failed (non-fatal):', e?.message);
          }
        }
        if (body.complianceReviewSections !== undefined && body.complianceReviewSections !== null) {
          try {
            const oldJson = existingProject.complianceReviewSections;
            const oldParsed = (typeof oldJson === 'string' && oldJson) ? JSON.parse(oldJson) : (oldJson && typeof oldJson === 'object' ? oldJson : {});
            const newParsed = typeof body.complianceReviewSections === 'string' ? JSON.parse(body.complianceReviewSections) : body.complianceReviewSections;
            const oldMap = buildDocumentStatusMap(oldParsed);
            const newMap = buildDocumentStatusMap(newParsed);
            for (const [entryKey, newEntry] of newMap) {
              const oldEntry = oldMap.get(entryKey);
              const oldStatus = oldEntry ? oldEntry.status : null;
              if (oldStatus !== newEntry.status) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'compliance_review_status_change',
                  description: `Compliance Review "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')}): ${oldStatus || 'pending'} → ${newEntry.status}`,
                  metadata: { entityType: 'compliance_review', entityId: newEntry.docId, documentName: newEntry.docName, year: newEntry.year, month: newEntry.month, oldValue: oldStatus, newValue: newEntry.status }
                });
              }
            }
            const oldNotesMap = buildDocumentNotesMap(oldParsed);
            const newNotesMap = buildDocumentNotesMap(newParsed);
            const noteSnippet = (text, maxLen = 120) => (text && text.length > maxLen ? text.slice(0, maxLen) + '…' : (text || ''));
            for (const [entryKey, newEntry] of newNotesMap) {
              const oldEntry = oldNotesMap.get(entryKey);
              const oldNotes = oldEntry ? oldEntry.notes : '';
              if (oldNotes !== newEntry.notes) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'compliance_review_notes_change',
                  description: `Compliance Review notes: "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')})${newEntry.notes ? ` — ${noteSnippet(newEntry.notes)}` : ' — cleared'}`,
                  metadata: {
                    entityType: 'compliance_review',
                    entityId: newEntry.docId,
                    documentName: newEntry.docName,
                    year: newEntry.year,
                    month: newEntry.month,
                    oldValue: oldNotes,
                    newValue: newEntry.notes,
                    noteSnippet: noteSnippet(newEntry.notes)
                  }
                });
              }
            }
          } catch (e) {
            console.warn('Activity log complianceReviewSections diff failed (non-fatal):', e?.message);
          }
        }

        if (body.documentSections !== undefined && body.documentSections !== null) {
          try {
            const oldJson = existingProject.documentSections;
            const oldParsed = (typeof oldJson === 'string' && oldJson) ? JSON.parse(oldJson) : (oldJson && typeof oldJson === 'object' ? oldJson : {});
            const newParsed = typeof body.documentSections === 'string' ? JSON.parse(body.documentSections) : body.documentSections;
            const oldStatusMap = buildDocumentStatusMap(oldParsed);
            const newStatusMap = buildDocumentStatusMap(newParsed);
            for (const [entryKey, newEntry] of newStatusMap) {
              const oldEntry = oldStatusMap.get(entryKey);
              const oldStatus = oldEntry ? oldEntry.status : null;
              if (oldStatus !== newEntry.status) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'document_section_status_change',
                  description: `Document Collection "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')}): ${oldStatus || 'pending'} → ${newEntry.status}`,
                  metadata: { entityType: 'document_section', entityId: newEntry.docId, documentName: newEntry.docName, year: newEntry.year, month: newEntry.month, oldValue: oldStatus, newValue: newEntry.status }
                });
              }
            }
            const oldNotesMap = buildDocumentNotesMap(oldParsed);
            const newNotesMap = buildDocumentNotesMap(newParsed);
            const noteSnippet = (text, maxLen = 120) => (text && text.length > maxLen ? text.slice(0, maxLen) + '…' : (text || ''));
            for (const [entryKey, newEntry] of newNotesMap) {
              const oldEntry = oldNotesMap.get(entryKey);
              const oldNotes = oldEntry ? oldEntry.notes : '';
              if (oldNotes !== newEntry.notes) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'document_section_notes_change',
                  description: `Document Collection notes: "${newEntry.docName}" (${newEntry.year}-${String(newEntry.month).padStart(2, '0')})${newEntry.notes ? ` — ${noteSnippet(newEntry.notes)}` : ' — cleared'}`,
                  metadata: {
                    entityType: 'document_section',
                    entityId: newEntry.docId,
                    documentName: newEntry.docName,
                    year: newEntry.year,
                    month: newEntry.month,
                    oldValue: oldNotes,
                    newValue: newEntry.notes,
                    noteSnippet: noteSnippet(newEntry.notes)
                  }
                });
              }
            }
          } catch (e) {
            console.warn('Activity log documentSections diff failed (non-fatal):', e?.message);
          }
        }

        if (body.weeklyFMSReviewSections !== undefined && body.weeklyFMSReviewSections !== null) {
          try {
            const oldJson = existingProject.weeklyFMSReviewSections;
            const oldParsed = (typeof oldJson === 'string' && oldJson) ? JSON.parse(oldJson) : (oldJson && typeof oldJson === 'object' ? oldJson : {});
            const newParsed = typeof body.weeklyFMSReviewSections === 'string' ? JSON.parse(body.weeklyFMSReviewSections) : body.weeklyFMSReviewSections;
            const oldMap = buildWeeklyFMSStatusMap(oldParsed);
            const newMap = buildWeeklyFMSStatusMap(newParsed);
            for (const [entryKey, newEntry] of newMap) {
              const oldEntry = oldMap.get(entryKey);
              const oldStatus = oldEntry ? oldEntry.status : null;
              if (oldStatus !== newEntry.status) {
                await logProjectActivity(prisma, {
                  projectId: id,
                  userId: activityUserId,
                  userName: activityUserName,
                  type: 'weekly_fms_status_change',
                  description: `Weekly FMS "${newEntry.docName}" (${newEntry.statusKey}): ${oldStatus || 'pending'} → ${newEntry.status}`,
                  metadata: { entityType: 'weekly_fms', entityId: newEntry.docId, documentName: newEntry.docName, year: newEntry.year, statusKey: newEntry.statusKey, oldValue: oldStatus, newValue: newEntry.status }
                });
              }
            }
          } catch (e) {
            console.warn('Activity log weeklyFMSReviewSections diff failed (non-fatal):', e?.message);
          }
        }

        if (onlineDriveLinksPayload !== null) {
          result.onlineDriveLinks = onlineDriveLinksPayload;
        }
        if (projectContactsPayload !== null) {
          result.projectContacts = projectContactsPayload;
        }
        return ok(res, { project: result })
      } catch (dbError) {
        console.error('❌ Database error updating project:', {
          message: dbError.message,
          stack: dbError.stack,
          code: dbError.code,
          meta: dbError.meta,
          projectId: id
        })
        // Check if it's a "record not found" error (P2025)
        if (dbError.code === 'P2025') {
          return notFound(res, 'Project not found')
        }
        // Return more detailed error message to help with debugging
        const errorMessage = dbError.message || 'Failed to update project';
        return serverError(res, errorMessage, dbError.message)
      }
    }

    // Delete Project (DELETE /api/projects/[id])
    if (req.method === 'DELETE') {
      try {
        console.log('🗑️ DELETE Project request:', {
          id,
          reqParams: req.params,
          url: req.url,
          pathname: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : 'N/A',
          pathSegments: req.url ? new URL(req.url, `http://${req.headers.host}`).pathname.split('/').filter(Boolean) : []
        })
        
        // Check if project exists first
        const projectExists = await prisma.project.findUnique({ where: { id } })
        console.log('🔍 Project lookup result:', {
          id,
          found: !!projectExists,
          projectName: projectExists?.name || 'N/A'
        })
        
        if (!projectExists) {
          // Treat missing project as a successful, idempotent delete
          // so the UI doesn't show errors when the project was already removed.
          console.warn('⚠️ Project not found for deletion (treating as already deleted):', {
            id,
            idType: typeof id,
            idLength: id?.length,
            reqParams: req.params,
            url: req.url
          })
          return ok(res, {
            deleted: false,
            message: 'Project not found – it may have already been deleted'
          })
        }
        
        // Ensure referential integrity by removing dependents first, then the project
        // Order matters: delete deepest nested records first to avoid foreign key constraint violations
        
        // Delete all related records in a transaction (cascade will handle most, but be explicit)
        await prisma.$transaction(async (tx) => {
          // 1. Delete nested items and their children first (deepest level)
          // Get all section IDs for this project
          const documentSectionIds = (await tx.documentSection.findMany({ 
            where: { projectId: id }, 
            select: { id: true } 
          })).map(s => s.id);
          
          const weeklySectionIds = (await tx.weeklyFMSReviewSection.findMany({ 
            where: { projectId: id }, 
            select: { id: true } 
          })).map(s => s.id);
          
          const monthlySectionIds = (await tx.monthlyFMSReviewSection.findMany({ 
            where: { projectId: id }, 
            select: { id: true } 
          })).map(s => s.id);
          
          // Delete DocumentItem children (statuses and comments) for all sections at once
          if (documentSectionIds.length > 0) {
            const documentItemIds = (await tx.documentItem.findMany({ 
              where: { sectionId: { in: documentSectionIds } }, 
              select: { id: true } 
            })).map(i => i.id);
            
            if (documentItemIds.length > 0) {
              await tx.documentItemStatus.deleteMany({ where: { itemId: { in: documentItemIds } } });
              await tx.documentItemComment.deleteMany({ where: { itemId: { in: documentItemIds } } });
            }
            await tx.documentItem.deleteMany({ where: { sectionId: { in: documentSectionIds } } });
          }
          
          // Delete WeeklyFMSReviewItem children
          if (weeklySectionIds.length > 0) {
            const weeklyItemIds = (await tx.weeklyFMSReviewItem.findMany({ 
              where: { sectionId: { in: weeklySectionIds } }, 
              select: { id: true } 
            })).map(i => i.id);
            
            if (weeklyItemIds.length > 0) {
              await tx.weeklyFMSReviewItemStatus.deleteMany({ where: { itemId: { in: weeklyItemIds } } });
              await tx.weeklyFMSReviewItemComment.deleteMany({ where: { itemId: { in: weeklyItemIds } } });
            }
            await tx.weeklyFMSReviewItem.deleteMany({ where: { sectionId: { in: weeklySectionIds } } });
          }
          
          // Delete MonthlyFMSReviewItem children
          if (monthlySectionIds.length > 0) {
            const monthlyItemIds = (await tx.monthlyFMSReviewItem.findMany({ 
              where: { sectionId: { in: monthlySectionIds } }, 
              select: { id: true } 
            })).map(i => i.id);
            
            if (monthlyItemIds.length > 0) {
              await tx.monthlyFMSReviewItemStatus.deleteMany({ where: { itemId: { in: monthlyItemIds } } });
              await tx.monthlyFMSReviewItemComment.deleteMany({ where: { itemId: { in: monthlyItemIds } } });
            }
            await tx.monthlyFMSReviewItem.deleteMany({ where: { sectionId: { in: monthlySectionIds } } });
          }
          
          // 2. Delete sections (after their items are deleted)
          await tx.documentSection.deleteMany({ where: { projectId: id } });
          await tx.weeklyFMSReviewSection.deleteMany({ where: { projectId: id } });
          await tx.monthlyFMSReviewSection.deleteMany({ where: { projectId: id } });
          
          // 3. Delete tasks (handle self-referential hierarchy first)
          await tx.task.updateMany({ 
            where: { projectId: id },
            data: { parentTaskId: null }
          });
          await tx.task.deleteMany({ where: { projectId: id } });
          
          // 4. Delete task comments
          await tx.taskComment.deleteMany({ where: { projectId: id } });
          
          // 5. Delete other related records
          await tx.invoice.deleteMany({ where: { projectId: id } });
          await tx.timeEntry.deleteMany({ where: { projectId: id } });
          await tx.ticket.deleteMany({ where: { projectId: id } });
          await tx.userTask.deleteMany({ where: { projectId: id } });
          
          // 6. Finally delete the project itself
          await tx.project.delete({ where: { id } });
        })
        
        return ok(res, { 
          deleted: true,
          message: `Project deleted successfully`
        })
      } catch (dbError) {
        console.error('❌ Database error deleting project (with cascade):', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          meta: dbError.meta
        })
        // If it's a "record not found" error (P2025), treat as already deleted
        if (dbError.code === 'P2025') {
          console.warn('⚠️ P2025 during project delete – treating as already deleted:', { id })
          return ok(res, {
            deleted: false,
            message: 'Project not found – it may have already been deleted'
          })
        }
        return serverError(res, 'Failed to delete project', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Project [id] API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
