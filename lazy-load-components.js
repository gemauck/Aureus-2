// Lazy loading script to defer non-critical component loading
(function() {
    // Note: Components already loaded in index.html are not included here to avoid duplicate loading
    // ClientDetailModal and LeadDetailModal are loaded before Clients.jsx in index.html to avoid race condition
    const componentFiles = [
        // Defer heavier or non-critical modules until after first paint
        // Dashboard variants
        './src/components/dashboard/DashboardLive.jsx',
        './src/components/dashboard/DashboardDatabaseFirst.jsx',
        './src/components/dashboard/DashboardEnhanced.jsx',
        
        // Clients and related modals
        './src/components/clients/ClientDetailModal.jsx',
        './src/components/clients/LeadDetailModal.jsx',
        './src/components/clients/ClientDetailModalMobile.jsx',
        './src/components/clients/Clients.jsx',
        './src/components/clients/ClientsSimple.jsx',
        './src/components/clients/ClientsMobile.jsx',
        './src/components/clients/ClientsMobileOptimized.jsx',
        './src/components/clients/BulkOperations.jsx',
        './src/components/clients/Pipeline.jsx',
        './src/components/clients/PipelineIntegration.js',
        
        // Projects
        './src/components/projects/Projects.jsx',
        './src/components/projects/ProjectsDatabaseFirst.jsx',
        './src/components/projects/ProjectsSimple.jsx',
        './src/components/projects/CustomFieldModal.jsx',
        './src/components/projects/TaskDetailModal.jsx',
        './src/components/projects/StatusManagementModal.jsx',
        './src/components/projects/KanbanView.jsx',
        './src/components/projects/ListModal.jsx',
        './src/components/projects/ProjectModal.jsx',
        './src/components/projects/ProjectProgressTracker.jsx',
        './src/components/projects/MonthlyDocumentCollectionTracker.jsx',
        './src/components/projects/CommentsPopup.jsx',
        './src/components/projects/DocumentCollectionModal.jsx',
        './src/components/projects/ProjectDetail.jsx',
        
        // Time tracking
        './src/components/time/TimeModal.jsx',
        './src/components/time/TimeTracking.jsx',
        './src/components/time/TimeTrackingDatabaseFirst.jsx',
        
        // Teams
        './src/components/teams/DocumentModal.jsx',
        './src/components/teams/WorkflowModal.jsx',
        './src/components/teams/ChecklistModal.jsx',
        './src/components/teams/NoticeModal.jsx',
        './src/components/teams/WorkflowExecutionModal.jsx',
        './src/components/teams/TeamModals.jsx',
        './src/components/teams/Teams.jsx',
        './src/components/teams/TeamsSimple.jsx',
        
        // Users
        './src/components/users/UserModal.jsx',
        './src/components/users/InviteUserModal.jsx',
        './src/components/users/PasswordDisplayModal.jsx',
        './src/components/users/Users.jsx',
        './src/components/users/UserManagement.jsx',
        
        // Manufacturing
        './src/components/manufacturing/locations/StockLocations.jsx',
        './src/components/manufacturing/StockTransactions.jsx',
        './src/components/manufacturing/Manufacturing.jsx',
        
        // Invoicing
        './src/components/invoicing/InvoicingDatabaseFirst.jsx',
        './src/components/invoicing/RecurringInvoices.jsx',
        './src/components/invoicing/InvoiceModal.jsx',
        './src/components/invoicing/InvoicePreview.jsx',
        './src/components/invoicing/InvoiceTemplateSelector.jsx',
        './src/components/invoicing/InvoiceApprovalModal.jsx',
        './src/components/invoicing/ExpenseModal.jsx',
        './src/components/invoicing/PaymentModal.jsx',
        './src/components/invoicing/CreditNoteModal.jsx',
        './src/components/invoicing/RecurringInvoiceModal.jsx',
        './src/components/invoicing/DepositModal.jsx',
        './src/components/invoicing/InvoiceReports.jsx',
        './src/components/invoicing/BankReconciliation.jsx',
        './src/components/invoicing/BatchInvoiceActions.jsx',
        './src/components/invoicing/ReminderSettings.jsx',
        './src/components/invoicing/NotesTemplateModal.jsx',
        './src/components/invoicing/RecurringInvoices.jsx',
        
        // Reports
        './src/components/reports/AuditTrail.jsx',
        './src/components/reports/FeedbackViewer.jsx',
        './src/components/reports/Reports.jsx',
        './src/components/reports/SystemReports.jsx',
        
        // HR
        './src/components/hr/EmployeeManagement.jsx',
        './src/components/hr/LeaveManagement.jsx',
        './src/components/hr/LeaveBalance.jsx',
        './src/components/hr/Attendance.jsx',
        './src/components/hr/QuickBooksPayrollSync.jsx',
        './src/components/hr/Payroll.jsx',
        './src/components/hr/HR.jsx',
        
        // Account & Settings
        './src/components/account/Account.jsx',
        './src/components/settings/Settings.jsx',
        './src/components/settings/SettingsPortal.jsx',
        
        // Feedback widgets
        './src/components/feedback/FeedbackWidget.jsx',
        './src/components/feedback/SectionCommentWidget.jsx',
        
        // Utils and integrations
        './src/utils/permissions.js',
        './src/utils/whatsapp.js',
        './src/services/GoogleCalendarService.js',
        './src/components/calendar/GoogleCalendarSync.jsx'
    ];
    
    let loadedComponents = 0;
    
    function loadComponent(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            // Convert src/ paths to dist/src/ paths if needed
            const scriptSrc = src.startsWith('./src/') ? src.replace('./src/', './dist/src/').replace('.jsx', '.js') : src;
            script.src = scriptSrc;
            script.async = true;
            script.onload = () => {
                loadedComponents++;
                resolve();
            };
            script.onerror = () => {
                resolve(); // Continue even if one fails
            };
            document.body.appendChild(script);
        });
    }
    
    // Load components in batches after page is interactive
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startLazyLoading);
    } else {
        startLazyLoading();
    }
    
    function startLazyLoading() {
        // Wait for critical components to be ready
        setTimeout(() => {
            // Load in small batches to not block rendering
            const batchSize = 3;
            let index = 0;
            
            function loadBatch() {
                const batch = componentFiles.slice(index, index + batchSize);
                if (batch.length === 0) {
                    return;
                }
                
                Promise.all(batch.map(loadComponent)).then(() => {
                    index += batchSize;
                    // Use requestIdleCallback if available, otherwise setTimeout
                    const nextBatchDelay = index < componentFiles.length ? 100 : 0;
                    
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(loadBatch, { timeout: 500 });
                    } else {
                        setTimeout(loadBatch, nextBatchDelay);
                    }
                });
            }
            
            loadBatch();
        }, 2000); // Wait 2 seconds for initial page to load
    }
})();

