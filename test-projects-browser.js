/**
 * Browser-based test script for Projects functionality
 * Run this in the browser console after logging in
 * 
 * Usage:
 * 1. Log in to https://abcoafrica.co.za
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Press Enter to run
 */

(async function testProjectsInBrowser() {
  console.log('🧪 Starting Projects Browser Tests...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  function log(message, type = 'info') {
    const prefix = type === 'pass' ? '✅' : type === 'fail' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }

  function recordResult(testName, passed, error = null) {
    if (passed) {
      results.passed++;
      log(testName, 'pass');
    } else {
      results.failed++;
      results.errors.push({ test: testName, error: error?.message || error || 'Unknown error' });
      log(`${testName}: ${error?.message || error}`, 'fail');
    }
  }

  // Test 1: Check if DatabaseAPI is available
  try {
    const hasDatabaseAPI = typeof window.DatabaseAPI !== 'undefined';
    recordResult('DatabaseAPI Available', hasDatabaseAPI);
    if (!hasDatabaseAPI) {
      console.error('❌ DatabaseAPI not found. Make sure you are logged in and on the correct page.');
      return;
    }
  } catch (error) {
    recordResult('DatabaseAPI Available', false, error);
    return;
  }

  // Test 2: Get Projects List
  let projects = [];
  try {
    const response = await window.DatabaseAPI.getProjects();
    projects = Array.isArray(response) ? response : (response?.data || response?.projects || []);
    recordResult('Get Projects List', Array.isArray(projects));
    log(`Found ${projects.length} existing projects`, 'info');
  } catch (error) {
    recordResult('Get Projects List', false, error);
  }

  // Test 3: Create New Project
  let newProjectId = null;
  const testProjectName = `[BROWSER TEST] ${new Date().toISOString()}`;
  try {
    const projectData = {
      name: testProjectName,
      description: 'Browser test project for endpoint testing',
      status: 'Planning',
      priority: 'High',
      type: 'General',
      clientName: 'Test Client',
      startDate: new Date().toISOString().split('T')[0],
      notes: 'This is a test project created by browser test script'
    };

    const response = await window.DatabaseAPI.createProject(projectData);
    newProjectId = response?.id || response?.data?.id || response?.project?.id;
    recordResult('Create Project', !!newProjectId);
    if (newProjectId) {
      log(`Created project with ID: ${newProjectId}`, 'info');
    }
  } catch (error) {
    recordResult('Create Project', false, error);
  }

  if (!newProjectId) {
    console.error('❌ Cannot continue tests without a project ID');
    return;
  }

  // Test 4: Get Single Project
  try {
    const project = await window.DatabaseAPI.getProject(newProjectId);
    const projectFound = project && (project.id === newProjectId || project.data?.id === newProjectId);
    recordResult('Get Single Project', projectFound);
    
    // Verify project data structure
    if (project) {
      const proj = project.data || project;
      log(`Project name: ${proj.name}`, 'info');
      log(`Tasks count: ${proj.tasksList?.length || 0}`, 'info');
    }
  } catch (error) {
    recordResult('Get Single Project', false, error);
  }

  // Test 5: Create Task
  let newTaskId = null;
  try {
    const taskData = {
      projectId: newProjectId,
      title: '[BROWSER TEST] Test Task',
      description: 'Test task created by browser test',
      status: 'todo',
      priority: 'High',
      listId: 1
    };

    const response = await window.DatabaseAPI.makeRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });

    const task = response?.data || response;
    newTaskId = task?.id;
    recordResult('Create Task', !!newTaskId);
    if (newTaskId) {
      log(`Created task with ID: ${newTaskId}`, 'info');
    }
  } catch (error) {
    recordResult('Create Task', false, error);
  }

  // Test 6: Get Tasks for Project
  try {
    const response = await window.DatabaseAPI.makeRequest(`/api/tasks?projectId=${newProjectId}`, {
      method: 'GET'
    });

    const tasks = response?.data || response || [];
    const taskFound = Array.isArray(tasks) && tasks.some(t => t.id === newTaskId);
    recordResult('Get Tasks for Project', taskFound);
    log(`Found ${tasks.length} tasks for project`, 'info');
  } catch (error) {
    recordResult('Get Tasks for Project', false, error);
  }

  // Test 7: Update Task
  if (newTaskId) {
    try {
      const updateData = {
        status: 'in_progress',
        priority: 'Medium',
        description: 'Updated task description'
      };

      const response = await window.DatabaseAPI.makeRequest(`/api/tasks/${newTaskId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });

      const updated = response?.data || response;
      recordResult('Update Task', updated?.status === 'in_progress');
    } catch (error) {
      recordResult('Update Task', false, error);
    }
  }

  // Test 8: Create Task Comment
  let newCommentId = null;
  if (newTaskId) {
    try {
      const commentData = {
        taskId: newTaskId,
        projectId: newProjectId,
        text: '[BROWSER TEST] Test comment from browser test script',
        author: 'Browser Test User'
      };

      const response = await window.DatabaseAPI.makeRequest('/api/task-comments', {
        method: 'POST',
        body: JSON.stringify(commentData)
      });

      const comment = response?.data || response;
      newCommentId = comment?.id;
      recordResult('Create Task Comment', !!newCommentId);
      if (newCommentId) {
        log(`Created comment with ID: ${newCommentId}`, 'info');
      }
    } catch (error) {
      recordResult('Create Task Comment', false, error);
    }
  }

  // Test 9: Get Task Comments
  if (newTaskId) {
    try {
      const response = await window.DatabaseAPI.makeRequest(`/api/task-comments?taskId=${newTaskId}`, {
        method: 'GET'
      });

      const comments = response?.data || response || [];
      const commentFound = Array.isArray(comments) && comments.some(c => c.id === newCommentId);
      recordResult('Get Task Comments', commentFound);
      log(`Found ${comments.length} comments for task`, 'info');
    } catch (error) {
      recordResult('Get Task Comments', false, error);
    }
  }

  // Test 10: Update Task Comment
  if (newCommentId) {
    try {
      const updateData = {
        text: '[BROWSER TEST] Updated comment text'
      };

      const response = await window.DatabaseAPI.makeRequest(`/api/task-comments/${newCommentId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });

      const updated = response?.data || response;
      recordResult('Update Task Comment', updated?.text?.includes('Updated'));
    } catch (error) {
      recordResult('Update Task Comment', false, error);
    }
  }

  // Test 11: Verify Data Persistence (reload project)
  try {
    // Wait a moment for data to persist
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const project = await window.DatabaseAPI.getProject(newProjectId);
    const proj = project?.data || project;
    const hasTasks = proj?.tasksList && Array.isArray(proj.tasksList) && proj.tasksList.length > 0;
    recordResult('Data Persistence (Tasks)', hasTasks);
    
    if (hasTasks) {
      const task = proj.tasksList.find(t => t.id === newTaskId);
      const hasComments = task?.comments && Array.isArray(task.comments) && task.comments.length > 0;
      recordResult('Data Persistence (Comments)', hasComments);
    }
  } catch (error) {
    recordResult('Data Persistence Check', false, error);
  }

  // Test 12: Update Project
  try {
    const updateData = {
      description: 'Updated project description from browser test',
      status: 'In Progress',
      priority: 'Medium'
    };

    const response = await window.DatabaseAPI.updateProject(newProjectId, updateData);
    const updated = response?.data || response;
    recordResult('Update Project', updated?.description?.includes('Updated'));
  } catch (error) {
    recordResult('Update Project', false, error);
  }

  // Test 13: Delete Task Comment
  if (newCommentId) {
    try {
      await window.DatabaseAPI.makeRequest(`/api/task-comments/${newCommentId}`, {
        method: 'DELETE'
      });
      
      // Verify deletion
      const response = await window.DatabaseAPI.makeRequest(`/api/task-comments?taskId=${newTaskId}`, {
        method: 'GET'
      });
      const comments = response?.data || response || [];
      const commentDeleted = !comments.some(c => c.id === newCommentId);
      recordResult('Delete Task Comment', commentDeleted);
    } catch (error) {
      recordResult('Delete Task Comment', false, error);
    }
  }

  // Test 14: Delete Task
  if (newTaskId) {
    try {
      await window.DatabaseAPI.makeRequest(`/api/tasks/${newTaskId}`, {
        method: 'DELETE'
      });
      
      // Verify deletion
      const response = await window.DatabaseAPI.makeRequest(`/api/tasks?projectId=${newProjectId}`, {
        method: 'GET'
      });
      const tasks = response?.data || response || [];
      const taskDeleted = !tasks.some(t => t.id === newTaskId);
      recordResult('Delete Task', taskDeleted);
    } catch (error) {
      recordResult('Delete Task', false, error);
    }
  }

  // Test 15: Delete Project (cleanup)
  try {
    await window.DatabaseAPI.deleteProject(newProjectId);
    
    // Verify deletion
    try {
      await window.DatabaseAPI.getProject(newProjectId);
      recordResult('Delete Project', false, 'Project still exists after deletion');
    } catch (error) {
      recordResult('Delete Project', true);
    }
  } catch (error) {
    recordResult('Delete Project', false, error);
  }

  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total:  ${results.passed + results.failed}`);
  console.log(`📉 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Browser tests complete!');
  
  return results;
})();

