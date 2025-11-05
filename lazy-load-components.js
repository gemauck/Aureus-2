// Lazy loading script to defer non-critical component loading
// VERSION: 1017-clients-blocked - Removed Clients.jsx to prevent race condition with LeadDetailModal
console.log('🚀 lazy-load-components.js v1017-clients-blocked loaded');
(function() {
    // Note: Components already loaded in index.html are not included here to avoid duplicate loading
    // ClientDetailModal and LeadDetailModal are loaded before Clients.jsx in index.html to avoid race condition
    
    // CRITICAL: Filter out LeadDetailModal and ClientDetailModal BEFORE creating componentFiles array
    // This prevents them from being loaded even if they somehow get into the array
    const shouldBlockComponent = (path) => {
        if (typeof path !== 'string') return false;
        const lowerPath = path.toLowerCase();
        return lowerPath.includes('leaddetailmodal') || lowerPath.includes('clientdetailmodal');
    };
    
    const componentFiles = [
        // Defer heavier or non-critical modules until after first paint
        // Dashboard variants
        // Calendar.jsx is loaded early in index.html - DO NOT load here to avoid conflicts
        // './src/components/dashboard/Calendar.jsx',
        './src/components/daily-notes/DailyNotes.jsx',
        './src/components/dashboard/DashboardLive.jsx',
        './src/components/dashboard/DashboardDatabaseFirst.jsx',
        './src/components/dashboard/DashboardEnhanced.jsx',
        
        // Clients and related modals
        // ClientDetailModal, LeadDetailModal, Clients.jsx, and ClientDetailModalMobile are loaded early in index.html - DO NOT load here to avoid conflicts
        // './src/components/clients/ClientDetailModal.jsx',
        // './src/components/clients/LeadDetailModal.jsx',
        // './src/components/clients/Clients.jsx', // Loaded in index.html BEFORE lazy-loader runs
        // './src/components/clients/ClientDetailModalMobile.jsx', // Loaded in index.html - blocked to prevent conflicts
        './src/components/clients/ClientsSimple.jsx',
        './src/components/clients/ClientsMobile.jsx',
        './src/components/clients/ClientsMobileOptimized.jsx',
        './src/components/clients/BulkOperations.jsx',
        './src/components/clients/Pipeline.jsx',
        './src/components/clients/PipelineIntegration.js',
        './src/components/clients/ClientNewsFeed.jsx',
    ].filter(path => {
        // DOUBLE-CHECK: Filter out blocked components even if they're in the array
        if (shouldBlockComponent(path)) {
            console.warn(`🚫 BLOCKED from componentFiles: ${path}`);
            return false;
        }
        return true;
    }).concat([
        // Projects - Load ProjectDetail dependencies FIRST, then ProjectDetail, then Projects
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
        './src/components/projects/Projects.jsx',
        './src/components/projects/ProjectsDatabaseFirst.jsx',
        './src/components/projects/ProjectsSimple.jsx',
        
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
        './src/components/teams/JobCardModal.jsx',
        './src/components/teams/TeamModals.jsx',
        './src/components/teams/Teams.jsx',
        './src/components/teams/TeamsSimple.jsx',
        
        // Users
        './src/components/users/UserModal.jsx',
        './src/components/users/InviteUserModal.jsx',
        './src/components/users/PasswordDisplayModal.jsx',
        './src/components/users/Users.jsx',
        './src/components/users/UserManagement.jsx',
        
        // Manufacturing - MOVED from index.html to lazy loading for better performance
        './src/components/manufacturing/locations/StockLocations.jsx',
        './src/components/manufacturing/StockTransactions.jsx',
        './src/components/manufacturing/JobCards.jsx',
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
        
        // HR - MOVED from index.html to lazy loading for better performance
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
        // NotificationSettings moved to early load in index.html
        
        // Feedback widgets
        './src/components/feedback/FeedbackWidget.jsx',
        './src/components/feedback/SectionCommentWidget.jsx',
        
        // Tools - MOVED from index.html to lazy loading for better performance
        './src/components/tools/TankSizeCalculator.jsx',
        './src/components/tools/UnitConverter.jsx',
        './src/components/tools/PDFToWordConverter.jsx',
        './src/components/tools/HandwritingToWord.jsx',
        './src/components/tools/Tools.jsx',
        
        // Utils and integrations
        './src/utils/permissions.js',
        './src/utils/whatsapp.js',
        './src/services/GoogleCalendarService.js',
        './src/components/calendar/GoogleCalendarSync.jsx'
    ].filter(path => {
        // FINAL CHECK: Filter out blocked components
        if (shouldBlockComponent(path)) {
            console.warn(`🚫 BLOCKED from componentFiles: ${path}`);
            return false;
        }
        return true;
    }));
    
    let loadedComponents = 0;
    
    function loadComponent(src) {
        return new Promise((resolve, reject) => {
            // CRITICAL: NEVER load LeadDetailModal or ClientDetailModal from lazy-loader
            // They are loaded early in index.html and must NOT be overwritten
            // This prevents the formData initialization error
            // Use case-insensitive check to catch all variations
            if (shouldBlockComponent(src)) {
                console.log(`⏭️ BLOCKED: ${src} must be loaded from index.html only - skipping lazy-loader`);
                resolve();
                return;
            }
            
            // Convert src/ paths to dist/src/ paths if needed
            // Use absolute path for dist assets to avoid relative path issues on nested routes
            let scriptSrc = src.startsWith('./src/') ? src.replace('./src/', '/dist/src/').replace('.jsx', '.js') : src;
            
            // Log ProjectDetail loading attempts
            if (src.includes('ProjectDetail')) {
                console.log(`🔵 Lazy loader: Attempting to load ProjectDetail from ${src} → ${scriptSrc}`);
            }
            
            // Add cache-busting for DailyNotes to ensure fresh version loads
            // Use timestamp-based version for critical components that change frequently
            if (scriptSrc.includes('DailyNotes') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const separator = scriptSrc.includes('?') ? '&' : '?';
                scriptSrc = scriptSrc + separator + 'v=' + Date.now();
            }
            
            // First, fetch the file to validate it's JavaScript before loading as script
            // This prevents HTML (404 pages) from being executed as JavaScript
            // Use no-cache for DailyNotes to ensure fresh version, default for others
            const cachePolicy = scriptSrc.includes('DailyNotes') ? 'no-cache' : 'default';
            fetch(scriptSrc, { cache: cachePolicy })
                .then(response => {
                    if (!response.ok) {
                        // File doesn't exist - skip silently
                        console.warn(`⚠️ Component not found: ${scriptSrc} (skipping)`);
                        resolve();
                        return;
                    }
                    
                    // Check content type
                    const contentType = response.headers.get('content-type') || '';
                    const isJavaScript = contentType.includes('javascript') || 
                                        contentType.includes('text/plain') ||
                                        contentType.includes('application/json'); // Some servers serve JS as JSON
                    
                    if (!isJavaScript && !scriptSrc.endsWith('.js')) {
                        // If it's not JavaScript and not a .js file, skip it
                        console.warn(`⚠️ Component not JavaScript: ${scriptSrc} (content-type: ${contentType}, skipping)`);
                        resolve();
                        return;
                    }
                    
                    // Validate content by checking first few characters
                    return response.text().then(text => {
                        // Check if response looks like HTML (common for 404 pages)
                        const trimmedText = text.trim();
                        if (trimmedText.startsWith('<') || trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<!doctype')) {
                            console.warn(`⚠️ Component appears to be HTML (404 page?): ${scriptSrc} (skipping)`);
                            resolve();
                            return;
                        }
                        
                        // Log ProjectDetail loading for debugging
                        if (scriptSrc.includes('ProjectDetail')) {
                            console.log(`🔵 Lazy loader: Fetching ProjectDetail from ${scriptSrc}, content length: ${text.length}, first 100 chars:`, text.substring(0, 100));
                        }
                        
                        // Content looks valid - load it as a script
                        const script = document.createElement('script');
                        script.type = 'text/javascript';
                        script.async = true;
                        
                        // Create blob URL from validated JavaScript content
                        const blob = new Blob([text], { type: 'application/javascript' });
                        const blobUrl = URL.createObjectURL(blob);
                        script.src = blobUrl;
                        
                        script.onload = () => {
                            URL.revokeObjectURL(blobUrl); // Clean up blob URL
                            loadedComponents++;
                            // Check if ProjectDetail was just loaded
                            if (scriptSrc.includes('ProjectDetail')) {
                                console.log('🔵 Lazy loader: ProjectDetail script.onload fired');
                                setTimeout(() => {
                                    if (window.ProjectDetail) {
                                        console.log('✅ ProjectDetail loaded and registered via lazy loader');
                                    } else {
                                        console.warn('⚠️ ProjectDetail script loaded but component not registered after 100ms');
                                        console.warn('⚠️ Checking if script executed - window keys:', Object.keys(window).filter(k => k.includes('Project')));
                                    }
                                }, 500); // Increased timeout to 500ms to catch delayed registration
                            }
                            resolve();
                        };
                        
                        script.onerror = (error) => {
                            URL.revokeObjectURL(blobUrl); // Clean up blob URL
                            console.warn(`⚠️ Failed to execute component: ${scriptSrc}`, error);
                            if (scriptSrc.includes('ProjectDetail')) {
                                console.error('❌ CRITICAL: ProjectDetail script.onerror fired!');
                                console.error('❌ Error details:', error);
                                console.error('❌ Script src was:', scriptSrc);
                                console.error('❌ Blob URL was:', blobUrl);
                            }
                            resolve(); // Continue even if one fails
                        };
                        
                        document.body.appendChild(script);
                    });
                })
                .catch(error => {
                    // Network error or CORS issue - fallback to direct script loading
                    // Some servers might not allow fetch due to CORS, so try direct loading
                    // BUT: We need to be careful not to execute HTML
                    console.warn(`⚠️ Fetch failed for ${scriptSrc}, trying direct load with validation...`);
                    
                    // Try to fetch with a text request to validate before loading as script
                    fetch(scriptSrc, { 
                        method: 'GET',
                        headers: { 'Accept': 'text/plain,application/javascript,*/*' },
                        cache: 'default'
                    })
                    .then(response => {
                        if (!response.ok) {
                            console.warn(`⚠️ Component not found (fallback): ${scriptSrc} (skipping)`);
                            resolve();
                            return;
                        }
                        return response.text().then(text => {
                            // Validate it's not HTML
                            const trimmedText = text.trim();
                            if (trimmedText.startsWith('<') || trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<!doctype')) {
                                console.warn(`⚠️ Component appears to be HTML in fallback: ${scriptSrc} (skipping)`);
                                resolve();
                                return;
                            }
                            
                            // Content is valid - load via blob URL
                            const script = document.createElement('script');
                            script.type = 'text/javascript';
                            script.async = true;
                            
                            const blob = new Blob([text], { type: 'application/javascript' });
                            const blobUrl = URL.createObjectURL(blob);
                            script.src = blobUrl;
                            
                            script.onload = () => {
                                URL.revokeObjectURL(blobUrl);
                                loadedComponents++;
                                resolve();
                            };
                            
                            script.onerror = () => {
                                URL.revokeObjectURL(blobUrl);
                                console.warn(`⚠️ Failed to execute component (fallback): ${scriptSrc}`);
                                resolve();
                            };
                            
                            document.body.appendChild(script);
                        });
                    })
                    .catch(() => {
                        // Final fallback - direct load (but this could execute HTML, so log warning)
                        console.warn(`⚠️ All validation failed for ${scriptSrc}, direct loading (may fail if file missing)...`);
                        
                        const script = document.createElement('script');
                        script.type = 'text/javascript';
                        script.async = true;
                        script.src = scriptSrc;
                        
                        script.onerror = () => {
                            console.warn(`⚠️ Failed to load component: ${scriptSrc} (skipping)`);
                            resolve();
                        };
                        
                        script.onload = () => {
                            loadedComponents++;
                            resolve();
                        };
                        
                        document.body.appendChild(script);
                    });
                });
        });
    }
    
    // Load components in batches after page is interactive
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startLazyLoading);
    } else {
        startLazyLoading();
    }
    
    function startLazyLoading() {
        // Wait for critical components from index.html to load first
        // This prevents lazy-loader from overwriting compiled components
        const waitForCriticalComponents = () => {
            // Check if critical components are loaded (or wait a bit longer)
            const maxWait = 3000; // Max 3 seconds
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const criticalLoaded = window.LeadDetailModal && window.ClientDetailModal;
                
                if (criticalLoaded || elapsed >= maxWait) {
                    clearInterval(checkInterval);
                    
                    // Now start loading lazy components
                    // Increased batch size from 3 to 8 for better performance
                    const batchSize = 8;
                    let index = 0;
                    
                    function loadBatch() {
                        const batch = componentFiles.slice(index, index + batchSize);
                        if (batch.length === 0) {
                            console.log(`✅ Lazy loading complete: ${loadedComponents} components loaded`);
                            // Final check for ProjectDetail
                            if (!window.ProjectDetail) {
                                console.warn('⚠️ Lazy loading complete but ProjectDetail not loaded!');
                                console.warn('⚠️ Checking if ProjectDetail was in the list...');
                                const projectDetailInList = componentFiles.find(f => f.includes('ProjectDetail'));
                                console.warn('⚠️ ProjectDetail in componentFiles:', projectDetailInList || 'NOT FOUND');
                            } else {
                                console.log('✅ ProjectDetail successfully loaded via lazy loader');
                            }
                            return;
                        }
                        
                        // Log if ProjectDetail is in this batch
                        const hasProjectDetail = batch.some(f => f.includes('ProjectDetail'));
                        if (hasProjectDetail) {
                            console.log(`🔵 Lazy loader: ProjectDetail is in batch ${Math.floor(index / batchSize) + 1}, loading now...`);
                        }
                        
                        Promise.all(batch.map(loadComponent)).then(() => {
                            index += batchSize;
                            // Reduced delay between batches from 100ms to 50ms for faster loading
                            const nextBatchDelay = index < componentFiles.length ? 50 : 0;
                            
                            if (typeof requestIdleCallback !== 'undefined') {
                                requestIdleCallback(loadBatch, { timeout: 200 });
                            } else {
                                setTimeout(loadBatch, nextBatchDelay);
                            }
                        });
                    }
                    
                    loadBatch();
                }
            }, 100); // Check every 100ms
        };
        
        // Start checking after reduced initial delay (500ms -> 200ms)
        setTimeout(waitForCriticalComponents, 200);
    }
})();

