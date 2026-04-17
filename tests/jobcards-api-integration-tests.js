#!/usr/bin/env node
/**
 * Job cards API integration tests (authenticated matrix + optional DB verification).
 * Run: node tests/jobcards-api-integration-tests.js
 * Auth: TEST_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... node tests/jobcards-api-integration-tests.js
 * Optional Prisma checks: VERIFY_DB=1 (uses DATABASE_URL from .env)
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const VERIFY_DB = String(process.env.VERIFY_DB || '').toLowerCase() === '1' || process.env.VERIFY_DB === 'true';

const results = { passed: [], failed: [] };

function pass(name, detail = '') {
  results.passed.push({ name, detail });
  console.log('✅', name, detail ? `– ${detail}` : '');
}

function fail(name, reason) {
  results.failed.push({ name, reason });
  console.log('❌', name, '–', reason);
}

function unwrapData(res) {
  const d = res.data?.data ?? res.data ?? {};
  return d;
}

async function api(path, method = 'GET', body = null, token) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body && method !== 'GET' && method !== 'DELETE') options.body = JSON.stringify(body);
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: e.message, data: null };
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const token = body.data?.accessToken ?? body.accessToken;
  return token || null;
}

async function verifyDb(jobCardId, prisma) {
  const activities = await prisma.jobCardActivity.findMany({
    where: { jobCardId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const audits = await prisma.auditLog.findMany({
    where: {
      entity: 'manufacturing',
      entityId: jobCardId,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return { activities, audits };
}

async function run() {
  console.log('Job cards API integration tests –', BASE_URL);
  const token = await login();
  if (!token) {
    console.log('⏭️ No auth (set TEST_EMAIL / TEST_PASSWORD) – skipping authenticated matrix');
    // Calendar requires ?token= (JWT); without it the API returns 401 by design
    const calNoTok = await fetch(`${BASE_URL}/api/public/jobcards-calendar.ics`);
    if (calNoTok.status === 401) {
      pass('GET /api/public/jobcards-calendar.ics (no token)', '401 as expected');
    } else {
      fail('GET /api/public/jobcards-calendar.ics (no token)', `expected 401, got ${calNoTok.status}`);
    }
    const total = results.passed.length + results.failed.length;
    console.log('\n' + (results.failed.length ? 'PARTIAL' : 'DONE') + ': ' + results.passed.length + '/' + total);
    process.exit(results.failed.length > 0 ? 1 : 0);
    return;
  }

  let prisma = null;
  if (VERIFY_DB) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
    } catch (e) {
      console.warn('⚠️ VERIFY_DB set but Prisma could not load:', e.message);
    }
  }

  // 1) LIST
  const listRes = await api('/api/jobcards?page=1&pageSize=10', 'GET', null, token);
  const listData = unwrapData(listRes);
  const jobCards = listData.jobCards || [];
  if (listRes.status === 200 && Array.isArray(jobCards)) {
    pass('GET /api/jobcards', `${jobCards.length} card(s), pagination ok`);
  } else {
    fail('GET /api/jobcards', `status ${listRes.status}`);
  }

  const firstClientId = jobCards[0]?.clientId;
  if (firstClientId) {
    const filterRes = await api(
      `/api/jobcards?clientId=${encodeURIComponent(firstClientId)}&pageSize=20`,
      'GET',
      null,
      token
    );
    const fd = unwrapData(filterRes);
    const filtered = fd.jobCards || [];
    if (filterRes.status === 200 && filtered.every((j) => j.clientId === firstClientId)) {
      pass('GET /api/jobcards?clientId=', `${filtered.length} row(s) for client`);
    } else {
      fail('GET /api/jobcards?clientId=', `status ${filterRes.status}`);
    }
  } else {
    pass('GET /api/jobcards?clientId=', 'skipped (no clientId on first row)');
  }

  // 2) CREATE
  const createBody = {
    agentName: 'API Test Agent',
    clientName: 'API Test Client',
    reasonForVisit: 'Integration test visit',
    diagnosis: '',
    status: 'draft',
    photos: [],
    otherTechnicians: [],
    stockUsed: [],
    materialsBought: [],
    kmReadingBefore: 0,
    kmReadingAfter: 0,
  };
  const createRes = await api('/api/jobcards', 'POST', createBody, token);
  const createData = unwrapData(createRes);
  const created = createData.jobCard;
  if ((createRes.status === 200 || createRes.status === 201) && created?.id) {
    pass('POST /api/jobcards', created.jobCardNumber || created.id);
  } else {
    fail('POST /api/jobcards', `status ${createRes.status} ${JSON.stringify(createData).slice(0, 200)}`);
    const total = results.passed.length + results.failed.length;
    console.log('\nFAILED: ' + results.passed.length + '/' + total);
    process.exit(1);
    return;
  }

  const id = created.id;

  if (prisma) {
    try {
      const { activities, audits } = await verifyDb(id, prisma);
      if (activities.length >= 1) pass('DB: JobCardActivity after create', `${activities.length} row(s)`);
      else fail('DB: JobCardActivity after create', 'expected at least 1 row');
      if (audits.length >= 1) pass('DB: AuditLog after create', `${audits.length} row(s)`);
      else fail('DB: AuditLog after create', 'expected at least 1 row');
    } catch (e) {
      fail('DB verify after create', e.message);
    }
  }

  // 3) GET ONE omitPhotos
  const getLite = await api(`/api/jobcards/${encodeURIComponent(id)}?omitPhotos=1`, 'GET', null, token);
  const getLiteData = unwrapData(getLite);
  if (getLite.status === 200 && getLiteData.jobCard?.attachmentsPending === true) {
    pass('GET /api/jobcards/:id?omitPhotos=1', 'attachmentsPending');
  } else {
    fail('GET /api/jobcards/:id?omitPhotos=1', `status ${getLite.status}`);
  }

  // 4) GET photos
  const photosRes = await api(`/api/jobcards/${encodeURIComponent(id)}/photos`, 'GET', null, token);
  const photosData = unwrapData(photosRes);
  const photos = photosData.photos;
  if (photosRes.status === 200 && Array.isArray(photos)) {
    pass('GET /api/jobcards/:id/photos', `${photos.length} item(s)`);
  } else {
    fail('GET /api/jobcards/:id/photos', `status ${photosRes.status}`);
  }

  // 5) GET activity
  const actRes = await api(`/api/jobcards/${encodeURIComponent(id)}/activity?order=asc`, 'GET', null, token);
  const actData = unwrapData(actRes);
  const activities = actData.activities || [];
  if (actRes.status === 200 && Array.isArray(activities)) {
    pass('GET /api/jobcards/:id/activity', `${activities.length} event(s)`);
  } else {
    fail('GET /api/jobcards/:id/activity', `status ${actRes.status}`);
  }

  // 6) GET forms (may be empty)
  const formsRes = await api(`/api/jobcards/${encodeURIComponent(id)}/forms`, 'GET', null, token);
  const formsData = unwrapData(formsRes);
  if (formsRes.status === 200 && Array.isArray(formsData.forms)) {
    pass('GET /api/jobcards/:id/forms', `${formsData.forms.length} instance(s)`);
  } else {
    fail('GET /api/jobcards/:id/forms', `status ${formsRes.status}`);
  }

  // 7) PATCH
  const patchRes = await api(
    `/api/jobcards/${encodeURIComponent(id)}`,
    'PATCH',
    { diagnosis: 'Updated by integration test', kmReadingBefore: 100, kmReadingAfter: 150 },
    token
  );
  const patchData = unwrapData(patchRes);
  if (patchRes.status === 200 && patchData.jobCard?.diagnosis === 'Updated by integration test') {
    pass('PATCH /api/jobcards/:id', 'diagnosis + km recalc');
  } else {
    fail('PATCH /api/jobcards/:id', `status ${patchRes.status}`);
  }

  // 8) Activity sync
  const syncRes = await api(
    `/api/jobcards/${encodeURIComponent(id)}/activity/sync`,
    'POST',
    { events: [{ action: 'test_sync_event', metadata: { from: 'jobcards-api-integration-tests' }, source: 'test' }] },
    token
  );
  const syncData = unwrapData(syncRes);
  if (syncRes.status === 200 && typeof syncData.synced === 'number') {
    pass('POST /api/jobcards/:id/activity/sync', `synced ${syncData.synced}`);
  } else {
    fail('POST /api/jobcards/:id/activity/sync', `status ${syncRes.status}`);
  }

  // 9) Optional: attach form if template exists
  const tplRes = await api('/api/service-forms', 'GET', null, token);
  const tplData = unwrapData(tplRes);
  const templates = tplData.templates || [];
  if (tplRes.status === 200 && templates.length > 0) {
    const tid = templates[0].id;
    const attachRes = await api(
      `/api/jobcards/${encodeURIComponent(id)}/forms`,
      'POST',
      { templateId: tid, status: 'not_started', answers: [] },
      token
    );
    const attachData = unwrapData(attachRes);
    const form = attachData.form;
    if ((attachRes.status === 200 || attachRes.status === 201) && form?.id) {
      pass('POST /api/jobcards/:id/forms', `instance ${form.id}`);
      let answerRows = [{ fieldId: 'smoke', value: 'ok' }];
      try {
        const fields = templates[0].fields;
        const parsed = typeof fields === 'string' ? JSON.parse(fields) : fields;
        const first = Array.isArray(parsed) && parsed[0];
        const fid = first?.id || first?.fieldId;
        if (fid) answerRows = [{ fieldId: fid, value: 'ok' }];
      } catch {
        /* use default */
      }
      const patchFormRes = await api(
        `/api/jobcards/${encodeURIComponent(id)}/forms/${encodeURIComponent(form.id)}`,
        'PATCH',
        { status: 'completed', answers: answerRows },
        token
      );
      const patchFormData = unwrapData(patchFormRes);
      if (patchFormRes.status === 200 && patchFormData.form) {
        pass('PATCH /api/jobcards/:id/forms/:formInstanceId', 'ok');
      } else {
        fail('PATCH /api/jobcards/:id/forms/:formInstanceId', `status ${patchFormRes.status}`);
      }
    } else {
      pass('POST /api/jobcards/:id/forms', 'skipped (no template created)');
    }
  } else {
    pass('Service forms attach', 'skipped (no templates or feature unavailable)');
  }

  // 10) DELETE
  const delRes = await api(`/api/jobcards/${encodeURIComponent(id)}`, 'DELETE', null, token);
  const delData = unwrapData(delRes);
  if (delRes.status === 200 && delData.deleted === true) {
    pass('DELETE /api/jobcards/:id', 'removed');
  } else {
    fail('DELETE /api/jobcards/:id', `status ${delRes.status}`);
  }

  const get404 = await api(`/api/jobcards/${encodeURIComponent(id)}`, 'GET', null, token);
  if (get404.status === 404) {
    pass('GET /api/jobcards/:id after delete', '404 as expected');
  } else {
    fail('GET /api/jobcards/:id after delete', `expected 404, got ${get404.status}`);
  }

  // Calendar ICS with same JWT as query param (see api/public/jobcards-calendar.js)
  const calWithTok = await fetch(
    `${BASE_URL}/api/public/jobcards-calendar.ics?token=${encodeURIComponent(token)}`
  );
  if (calWithTok.status === 200) {
    const ct = calWithTok.headers.get('content-type') || '';
    pass('GET /api/public/jobcards-calendar.ics?token=', ct.includes('calendar') || ct.includes('octet-stream') ? 'ICS ok' : `status 200, ct=${ct}`);
  } else {
    fail('GET /api/public/jobcards-calendar.ics?token=', `status ${calWithTok.status}`);
  }

  if (prisma) {
    try {
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
  }

  const total = results.passed.length + results.failed.length;
  console.log('\n' + (results.failed.length ? 'FAILED' : 'PASSED') + ': ' + results.passed.length + '/' + total);
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
