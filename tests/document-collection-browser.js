/**
 * Browser Console Test for Document Collection Module
 *
 * Run this in the browser console after logging in and opening a project
 * with the Document Collection tracker visible.
 */

(async function testDocumentCollectionBrowser() {
  console.log('🧪 Starting Document Collection Browser Tests...\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  const RUN_SEND_EMAIL = false;

  function log(message, type = 'info') {
    const prefix = type === 'pass' ? '✅' : type === 'fail' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }

  function recordResult(testName, passed, error = null, isWarning = false) {
    if (passed) {
      results.passed++;
      log(testName, 'pass');
    } else if (isWarning) {
      results.warnings++;
      log(`${testName}: ${error?.message || error}`, 'warn');
    } else {
      results.failed++;
      log(`${testName}: ${error?.message || error}`, 'fail');
    }
  }

  function findElementByText(selector, text) {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.find(el => (el.textContent || '').trim().toLowerCase().includes(text.toLowerCase()));
  }

  function getProjectIdFromLocation() {
    const hashMatch = window.location.hash.match(/#\/projects\/([^/?]+)/);
    if (hashMatch?.[1]) return hashMatch[1];
    const pathMatch = window.location.pathname.match(/\/projects\/([^/?]+)/);
    return pathMatch?.[1] || null;
  }

  function findDocumentCollectionRoot() {
    return document.querySelector('[class*="document-collection"], [class*="DocumentCollection"], [id*="document-collection"]');
  }

  function findYearSelector() {
    const selectors = document.querySelectorAll('select, [class*="year"], [id*="year"]');
    let yearSelector = null;
    selectors.forEach(sel => {
      const options = sel.querySelectorAll('option');
      if (options.length > 0 && options[0].textContent.match(/\d{4}/)) {
        yearSelector = sel;
      }
    });
    return yearSelector;
  }

  try {
    const hasDatabaseAPI = typeof window.DatabaseAPI !== 'undefined';
    recordResult('DatabaseAPI Available', hasDatabaseAPI);
    if (!hasDatabaseAPI) return;
  } catch (error) {
    recordResult('DatabaseAPI Available', false, error);
    return;
  }

  const projectId = getProjectIdFromLocation();
  recordResult('Project Route', !!projectId, projectId ? null : 'Not on a project route');
  if (!projectId) return;

  const trackerRoot = findDocumentCollectionRoot();
  recordResult('Document Collection UI Present', !!trackerRoot, trackerRoot ? null : 'Tracker root not found');

  const yearSelector = findYearSelector();
  recordResult('Year Selector Present', !!yearSelector, yearSelector ? null : 'Year selector not found');

  if (yearSelector) {
    const years = Array.from(yearSelector.options).map(opt => parseInt(opt.value)).filter(y => !isNaN(y));
    recordResult('Year Options', years.length > 0, years.length > 0 ? `Years: ${years.join(', ')}` : 'No year options');
  }

  let project;
  try {
    const projectRes = await window.DatabaseAPI.getProject(projectId);
    project = projectRes?.data || projectRes;
    recordResult('Get Project', !!project?.id);
  } catch (error) {
    recordResult('Get Project', false, error);
    return;
  }

  const year = new Date().getFullYear();
  const sections = project?.documentSections || project?.documentSectionsToJson || {};
  const sectionsForYear = Array.isArray(sections) ? sections : (sections[String(year)] || []);
  const firstDoc = sectionsForYear?.[0]?.documents?.[0];
  recordResult('Document Sections Loaded', Array.isArray(sectionsForYear), Array.isArray(sectionsForYear) ? null : 'No sections for year');

  if (!firstDoc?.id) {
    recordResult('Document Found', false, 'No document found in first section');
    return;
  }
  recordResult('Document Found', true, `Document ${firstDoc.id}`);

  try {
    const activity = await window.DatabaseAPI.makeRequest(
      `/api/projects/${projectId}/document-collection-email-activity?documentId=${encodeURIComponent(firstDoc.id)}&month=2&year=${year}`,
      { method: 'GET' }
    );
    const data = activity?.data || activity;
    const ok = Array.isArray(data?.sent) && Array.isArray(data?.received);
    recordResult('Email Activity (GET)', ok, ok ? null : 'Expected { sent, received }');
  } catch (error) {
    recordResult('Email Activity (GET)', false, error);
  }

  try {
    const counts = await window.DatabaseAPI.makeRequest(
      `/api/projects/${projectId}/document-collection-received-counts?year=${year}`,
      { method: 'GET' }
    );
    const data = counts?.data || counts;
    const ok = Array.isArray(data?.counts);
    recordResult('Received Counts (GET)', ok, ok ? null : 'Expected { counts }');
  } catch (error) {
    recordResult('Received Counts (GET)', false, error);
  }

  try {
    const opened = await window.DatabaseAPI.makeRequest(
      `/api/projects/${projectId}/document-collection-notification-opened`,
      {
        method: 'POST',
        body: JSON.stringify({
          documentId: firstDoc.id,
          year,
          month: 2,
          type: 'email'
        })
      }
    );
    const data = opened?.data || opened;
    const ok = data?.success === true || data?.skipped === true;
    recordResult('Notification Opened (email)', ok, ok ? null : 'No success/skip');
  } catch (error) {
    recordResult('Notification Opened (email)', false, error);
  }

  if (RUN_SEND_EMAIL) {
    try {
      const sendRes = await window.DatabaseAPI.makeRequest(
        `/api/projects/${projectId}/document-collection-send-email`,
        {
          method: 'POST',
          body: JSON.stringify({
            to: [window.storage?.getUser?.()?.email || 'test@example.com'],
            subject: 'Browser test document request',
            html: '<p>Test</p>',
            text: 'Test',
            projectId: String(projectId),
            documentId: String(firstDoc.id),
            month: 2,
            year
          })
        }
      );
      const data = sendRes?.data || sendRes;
      const ok = sendRes?.status === 200 || sendRes?.status === 503 || data?.sent || data?.failed;
      recordResult('Send Document Request', ok, ok ? null : 'Send did not return expected shape');
    } catch (error) {
      recordResult('Send Document Request', false, error);
    }
  } else {
    recordResult('Send Document Request', true, 'Skipped (RUN_SEND_EMAIL=false)', true);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.warnings + results.failed}`);
})();
