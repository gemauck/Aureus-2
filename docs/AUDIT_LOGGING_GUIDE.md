# Audit Logging Implementation Guide

## Overview
The Audit Trail system tracks all user actions across the ERP. This guide shows where and how to add audit logging to capture all important operations.

---

## ✅ Already Implemented

### Authentication
- **Login** (email/password and quick select)
- **Logout**

### HR Module
- **Employee create**
- **Employee update**
- **Employee delete**

### System
- **Sample initialization logs** (for demo)

---

## 🎯 Where to Add Audit Logging

### General Pattern

```javascript
// Get current user
const user = storage.getUser();

// Log the action
if (window.AuditLogger) {
    window.AuditLogger.log(
        'action',      // create, update, delete, view, export, etc.
        'module',      // module name
        { /* details */ },  // action details object
        user           // current user object
    );
}
```

---

## Component-by-Component Implementation

### 1. Clients Module (`Clients.jsx`)

**Add after creating a client:**
```javascript
const handleSaveClient = (clientData) => {
    const user = storage.getUser();
    
    if (selectedClient) {
        // ... update logic ...
        
        if (window.AuditLogger) {
            window.AuditLogger.log('update', 'clients', {
                action: 'Updated client',
                clientId: selectedClient.id,
                clientName: clientData.name
            }, user);
        }
    } else {
        const newClient = { /* ... */ };
        // ... create logic ...
        
        if (window.AuditLogger) {
            window.AuditLogger.log('create', 'clients', {
                action: 'Created new client',
                clientId: newClient.id,
                clientName: newClient.name,
                clientType: newClient.type
            }, user);
        }
    }
};
```

**Add after deleting a client:**
```javascript
const handleDeleteClient = (id) => {
    const user = storage.getUser();
    const client = clients.find(c => c.id === id);
    
    // ... delete logic ...
    
    if (window.AuditLogger && client) {
        window.AuditLogger.log('delete', 'clients', {
            action: 'Deleted client',
            clientId: id,
            clientName: client.name
        }, user);
    }
};
```

**Add for converting lead to client:**
```javascript
const handleConvertToClient = (leadId) => {
    const user = storage.getUser();
    const lead = leads.find(l => l.id === leadId);
    
    // ... conversion logic ...
    
    if (window.AuditLogger && lead) {
        window.AuditLogger.log('update', 'clients', {
            action: 'Converted lead to client',
            leadId: leadId,
            clientId: newClient.id,
            clientName: newClient.name
        }, user);
    }
};
```

### 2. Projects Module (`Projects.jsx`)

**Add for project operations:**
```javascript
// Create project
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'projects', {
        action: 'Created new project',
        projectId: newProject.id,
        projectName: newProject.name,
        clientName: newProject.client
    }, user);
}

// Update project
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'projects', {
        action: 'Updated project',
        projectId: selectedProject.id,
        projectName: projectData.name,
        changes: 'Status updated to ' + projectData.status
    }, user);
}

// Delete project
if (window.AuditLogger) {
    window.AuditLogger.log('delete', 'projects', {
        action: 'Deleted project',
        projectId: id,
        projectName: project.name
    }, user);
}

// Create task
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'projects', {
        action: 'Created task',
        projectId: projectId,
        taskId: newTask.id,
        taskTitle: newTask.title
    }, user);
}

// Update task status
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'projects', {
        action: 'Updated task status',
        taskId: taskId,
        oldStatus: oldStatus,
        newStatus: newStatus
    }, user);
}
```

### 3. Time Tracking Module (`TimeTracking.jsx`)

```javascript
// Start time entry
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'time', {
        action: 'Started time tracking',
        projectName: selectedProject.name,
        taskName: selectedTask?.title
    }, user);
}

// Stop time entry
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'time', {
        action: 'Stopped time tracking',
        duration: `${hours}h ${minutes}m`,
        projectName: entry.project
    }, user);
}

// Export time entries
if (window.AuditLogger) {
    window.AuditLogger.log('export', 'time', {
        action: 'Exported time entries',
        dateRange: `${startDate} to ${endDate}`,
        recordCount: filteredEntries.length
    }, user);
}
```

### 4. Manufacturing Module (`Manufacturing.jsx`)

```javascript
// Create inventory item
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'manufacturing', {
        action: 'Added inventory item',
        itemCode: newItem.code,
        itemName: newItem.name,
        quantity: newItem.quantity
    }, user);
}

// Create production order
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'manufacturing', {
        action: 'Created production order',
        orderNumber: newOrder.orderNumber,
        product: newOrder.product,
        quantity: newOrder.quantity
    }, user);
}

// Update production order status
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'manufacturing', {
        action: 'Updated production order status',
        orderNumber: order.orderNumber,
        oldStatus: order.status,
        newStatus: newStatus
    }, user);
}

// Stock movement
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'manufacturing', {
        action: 'Recorded stock movement',
        itemCode: item.code,
        fromLocation: movement.from,
        toLocation: movement.to,
        quantity: movement.quantity
    }, user);
}
```

### 5. Users Module (`Users.jsx`)

```javascript
// Create user
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'users', {
        action: 'Created new user',
        userId: newUser.id,
        userName: newUser.name,
        userRole: newUser.role
    }, user);
}

// Update user
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'users', {
        action: 'Updated user',
        userId: selectedUser.id,
        userName: userData.name,
        changes: 'Updated role to ' + userData.role
    }, user);
}

// Deactivate user
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'users', {
        action: 'Deactivated user',
        userId: userId,
        userName: user.name
    }, user);
}
```

### 6. HR Module (Additional)

**Leave Management:**
```javascript
// Submit leave application
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'hr', {
        action: 'Submitted leave application',
        employeeName: formData.employee,
        leaveType: formData.leaveType,
        duration: `${workingDays} days`,
        startDate: formData.startDate
    }, user);
}

// Approve leave
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'hr', {
        action: 'Approved leave application',
        employeeName: application.employee,
        leaveType: application.leaveType,
        duration: `${workingDays} days`
    }, user);
}

// Reject leave
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'hr', {
        action: 'Rejected leave application',
        employeeName: application.employee,
        reason: rejectionReason
    }, user);
}
```

**Payroll:**
```javascript
// Generate payroll
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'hr', {
        action: 'Generated payroll',
        month: selectedMonth,
        employeeCount: employees.length,
        totalAmount: totalNetPay
    }, user);
}

// Process payment
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'hr', {
        action: 'Processed payroll payment',
        employeeName: record.employee,
        month: record.month,
        amount: record.netSalary
    }, user);
}
```

**Attendance:**
```javascript
// Clock in
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'hr', {
        action: 'Clocked in',
        employeeName: employeeName,
        time: now.toTimeString().slice(0, 5)
    }, user);
}

// Clock out
if (window.AuditLogger) {
    window.AuditLogger.log('update', 'hr', {
        action: 'Clocked out',
        employeeName: record.employee,
        hoursWorked: hours.toFixed(2)
    }, user);
}
```

### 7. Dashboard Module (`Dashboard.jsx`)

```javascript
// View dashboard
useEffect(() => {
    const user = storage.getUser();
    if (window.AuditLogger && user) {
        window.AuditLogger.log('view', 'dashboard', {
            action: 'Accessed dashboard'
        }, user);
    }
}, []);
```

### 8. Reports Module (`Reports.jsx`)

```javascript
// Generate report
if (window.AuditLogger) {
    window.AuditLogger.log('export', 'reports', {
        action: 'Generated report',
        reportType: reportType,
        dateRange: `${startDate} to ${endDate}`,
        recordCount: data.length
    }, user);
}

// Export to Excel
if (window.AuditLogger) {
    window.AuditLogger.log('export', 'reports', {
        action: 'Exported to Excel',
        reportType: reportType,
        format: 'xlsx'
    }, user);
}
```

### 9. Tools Module (`Tools.jsx`)

```javascript
// Use tool
if (window.AuditLogger) {
    window.AuditLogger.log('view', 'tools', {
        action: 'Used tool',
        toolName: tool.name,
        toolId: tool.id
    }, user);
}

// PDF conversion
if (window.AuditLogger) {
    window.AuditLogger.log('create', 'tools', {
        action: 'Converted PDF to Word',
        fileName: file.name,
        fileSize: file.size
    }, user);
}
```

---

## Action Types Reference

Use these standard action types:

| Action | Use For |
|--------|---------|
| `create` | Creating new records |
| `update` | Modifying existing records |
| `delete` | Deleting records |
| `view` | Accessing pages/records |
| `export` | Exporting data (CSV, Excel, PDF) |
| `login` | User authentication |
| `logout` | User sign out |
| `import` | Importing data |
| `sync` | Syncing with external systems |
| `approve` | Approval workflows |
| `reject` | Rejection workflows |

---

## Module Names Reference

Use these standard module names:

| Module | Name |
|--------|------|
| Authentication | `authentication` |
| Dashboard | `dashboard` |
| Clients/CRM | `clients` |
| Projects | `projects` |
| Time Tracking | `time` |
| HR | `hr` |
| Manufacturing | `manufacturing` |
| Inventory | `inventory` |
| Users | `users` |
| Reports | `reports` |
| Tools | `tools` |
| Documents | `documents` |
| Settings | `settings` |

---

## Details Object Best Practices

Always include:
- **action**: Human-readable description
- **Relevant IDs**: entity IDs involved
- **Names**: entity names for readability
- **Changes**: what changed (for updates)
- **Quantities/amounts**: for numerical operations

Example:
```javascript
{
    action: 'Updated project status',
    projectId: 123,
    projectName: 'Q4 Report',
    oldStatus: 'In Progress',
    newStatus: 'Completed',
    completedDate: '2025-10-13'
}
```

---

## Error Logging

For failed operations:
```javascript
try {
    // operation
    if (window.AuditLogger) {
        window.AuditLogger.log('create', 'module', { /* details */ }, user);
    }
} catch (error) {
    if (window.AuditLogger) {
        window.AuditLogger.logError('create', 'module', error.message, user);
    }
}
```

---

## Testing

After adding audit logging:

1. **Perform the action** in the UI
2. **Navigate to Reports → Audit Trail**
3. **Verify the log appears** with correct details
4. **Check filters work** (by module, action, user, date)
5. **Test export** (CSV and Excel)

---

## Next Steps

1. Add logging to all CRUD operations
2. Add logging to all view actions
3. Add logging to all exports
4. Test thoroughly
5. Review logs for completeness

---

**Status**: Audit logging framework implemented  
**Coverage**: ~15% (login, logout, HR employee management)  
**Target**: 100% coverage of all user actions
