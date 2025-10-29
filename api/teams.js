// Teams Knowledge Hub API Routes
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware to get user from token
const authenticateToken = require('../middleware/auth');

// Helper function to get ownerId from request
const getOwnerId = (req) => {
  return req.user?.id || req.user?.userId || null;
};

// ============ TEAM DOCUMENTS ============

// Get all documents (optionally filtered by team)
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const where = team ? { team } : {};
    
    const documents = await prisma.teamDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ data: { documents } });
  } catch (error) {
    console.error('Error fetching team documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Create document
router.post('/documents', authenticateToken, async (req, res) => {
  try {
    const documentData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const document = await prisma.teamDocument.create({
      data: documentData
    });
    
    res.json({ data: { document } });
  } catch (error) {
    console.error('Error creating team document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document
router.put('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await prisma.teamDocument.update({
      where: { id },
      data: req.body
    });
    
    res.json({ data: { document } });
  } catch (error) {
    console.error('Error updating team document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.teamDocument.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ============ TEAM WORKFLOWS ============

// Get all workflows (optionally filtered by team)
router.get('/workflows', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const where = team ? { team } : {};
    
    const workflows = await prisma.teamWorkflow.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ data: { workflows } });
  } catch (error) {
    console.error('Error fetching team workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// Create workflow
router.post('/workflows', authenticateToken, async (req, res) => {
  try {
    const workflowData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const workflow = await prisma.teamWorkflow.create({
      data: workflowData
    });
    
    res.json({ data: { workflow } });
  } catch (error) {
    console.error('Error creating team workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Update workflow
router.put('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const workflow = await prisma.teamWorkflow.update({
      where: { id },
      data: req.body
    });
    
    res.json({ data: { workflow } });
  } catch (error) {
    console.error('Error updating team workflow:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Delete workflow
router.delete('/workflows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.teamWorkflow.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team workflow:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// ============ TEAM CHECKLISTS ============

// Get all checklists (optionally filtered by team)
router.get('/checklists', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const where = team ? { team } : {};
    
    const checklists = await prisma.teamChecklist.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ data: { checklists } });
  } catch (error) {
    console.error('Error fetching team checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

// Create checklist
router.post('/checklists', authenticateToken, async (req, res) => {
  try {
    const checklistData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const checklist = await prisma.teamChecklist.create({
      data: checklistData
    });
    
    res.json({ data: { checklist } });
  } catch (error) {
    console.error('Error creating team checklist:', error);
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

// Update checklist
router.put('/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const checklist = await prisma.teamChecklist.update({
      where: { id },
      data: req.body
    });
    
    res.json({ data: { checklist } });
  } catch (error) {
    console.error('Error updating team checklist:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Delete checklist
router.delete('/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.teamChecklist.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team checklist:', error);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

// ============ TEAM NOTICES ============

// Get all notices (optionally filtered by team)
router.get('/notices', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const where = team ? { team } : {};
    
    const notices = await prisma.teamNotice.findMany({
      where,
      orderBy: { date: 'desc' }
    });
    
    res.json({ data: { notices } });
  } catch (error) {
    console.error('Error fetching team notices:', error);
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
});

// Create notice
router.post('/notices', authenticateToken, async (req, res) => {
  try {
    const noticeData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const notice = await prisma.teamNotice.create({
      data: noticeData
    });
    
    res.json({ data: { notice } });
  } catch (error) {
    console.error('Error creating team notice:', error);
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

// Update notice
router.put('/notices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notice = await prisma.teamNotice.update({
      where: { id },
      data: req.body
    });
    
    res.json({ data: { notice } });
  } catch (error) {
    console.error('Error updating team notice:', error);
    res.status(500).json({ error: 'Failed to update notice' });
  }
});

// Delete notice
router.delete('/notices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.teamNotice.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team notice:', error);
    res.status(500).json({ error: 'Failed to delete notice' });
  }
});

// ============ TEAM TASKS ============

// Get all tasks (optionally filtered by team)
router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const where = team ? { team } : {};
    
    const tasks = await prisma.teamTask.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ data: { tasks } });
  } catch (error) {
    console.error('Error fetching team tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
router.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const task = await prisma.teamTask.create({
      data: taskData
    });
    
    res.json({ data: { task } });
  } catch (error) {
    console.error('Error creating team task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await prisma.teamTask.update({
      where: { id },
      data: req.body
    });
    
    res.json({ data: { task } });
  } catch (error) {
    console.error('Error updating team task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.teamTask.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ============ WORKFLOW EXECUTIONS ============

// Get all executions (optionally filtered by workflowId or team)
router.get('/executions', authenticateToken, async (req, res) => {
  try {
    const { workflowId, team } = req.query;
    const where = {};
    if (workflowId) where.workflowId = workflowId;
    if (team) where.team = team;
    
    const executions = await prisma.workflowExecution.findMany({
      where,
      orderBy: { executionDate: 'desc' }
    });
    
    res.json({ data: { executions } });
  } catch (error) {
    console.error('Error fetching workflow executions:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// Create execution
router.post('/executions', authenticateToken, async (req, res) => {
  try {
    const executionData = {
      ...req.body,
      ownerId: getOwnerId(req)
    };
    
    const execution = await prisma.workflowExecution.create({
      data: executionData
    });
    
    res.json({ data: { execution } });
  } catch (error) {
    console.error('Error creating workflow execution:', error);
    res.status(500).json({ error: 'Failed to create execution' });
  }
});

module.exports = router;
