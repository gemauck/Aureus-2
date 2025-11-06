// Lazy loading script to defer non-critical component loading
// VERSION: 1019-projectdetail-fixed - Allow ProjectDetail to load via lazy-loader after dependencies
console.log('🚀 lazy-load-components.js v1019-projectdetail-fixed loaded');
(function() {
    // Note: Components already loaded in index.html are not included here to avoid duplicate loading
    // ClientDetailModal and LeadDetailModal are loaded before Clients.jsx in index.html to avoid race condition
    
    // CRITICAL: Filter out LeadDetailModal and ClientDetailModal BEFORE creating componentFiles array
    // These are loaded early in index.html and must NOT be overwritten
    // ProjectDetail CAN be loaded via lazy-loader (it has robust dependency checking)
    const shouldBlockComponent = (path) => {
        if (typeof path !== 'string') return false;
        const lowerPath = path.toLowerCase();
        return lowerPath.includes('leaddetailmodal') || 
               lowerPath.includes('clientdetailmodal');
        // ProjectDetail is NOT blocked - it can be loaded via lazy-loader after dependencies
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
        // Projects - Load ProjectDetail dependencies FIRST, then ProjectDetail (with robust loader), then Projects
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
        // ProjectDetail will be loaded AFTER dependencies via special handler (see loadBatch function)
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
            // ProjectDetail CAN be loaded via lazy-loader (it has robust dependency checking)
            if (shouldBlockComponent(src)) {
                console.log(`⏭️ BLOCKED: ${src} must be loaded from index.html only - skipping lazy-loader`);
                resolve();
                return;
            }
            
            // Special handling for ProjectDetail - log when loading
            if (src.includes('ProjectDetail')) {
                console.log(`🔵 Lazy loader: Loading ProjectDetail (robust loader will check dependencies)...`);
            }
            
            // Convert src/ paths to dist/src/ paths if needed
            // Use absolute path for dist assets to avoid relative path issues on nested routes
            let scriptSrc = src.startsWith('./src/') ? src.replace('./src/', '/dist/src/').replace('.jsx', '.js') : src;
            
            // Log ProjectDetail loading attempts
            if (src.includes('ProjectDetail')) {
                console.log(`🔵 Lazy loader: Attempting to load ProjectDetail from ${src} → ${scriptSrc}`);
            }
            
            // CRITICAL: For ProjectDetail, ensure React is available before loading
            // ProjectDetail.jsx now waits for React internally, but this provides an extra safeguard
            const ensureReactForProjectDetail = () => {
                if (!src.includes('ProjectDetail')) {
                    return Promise.resolve(); // Not ProjectDetail, proceed immediately
                }
                
                if (window.React && window.React.useState && window.React.useEffect && window.React.useRef) {
                    return Promise.resolve(); // React already available
                }
                
                console.warn('⚠️ Lazy loader: React not available yet for ProjectDetail, waiting...');
                let reactAttempts = 0;
                const maxReactAttempts = 50; // 5 seconds max wait
                
                return new Promise((reactResolve) => {
                    const checkReact = setInterval(() => {
                        reactAttempts++;
                        if (window.React && window.React.useState && window.React.useEffect && window.React.useRef) {
                            console.log(`✅ Lazy loader: React available after ${reactAttempts * 100}ms, proceeding with ProjectDetail load`);
                            clearInterval(checkReact);
                            reactResolve();
                        } else if (reactAttempts >= maxReactAttempts) {
                            console.warn('⚠️ Lazy loader: React still not available after 5s, proceeding anyway (ProjectDetail will wait internally)');
                            clearInterval(checkReact);
                            reactResolve(); // Still proceed - ProjectDetail.jsx will wait internally
                        }
                    }, 100);
                    
                    // Also listen for React ready event
                    const handleReactReady = () => {
                        if (window.React && window.React.useState && window.React.useEffect && window.React.useRef) {
                            clearInterval(checkReact);
                            window.removeEventListener('babelready', handleReactReady);
                            reactResolve();
                        }
                    };
                    window.addEventListener('babelready', handleReactReady);
                });
            };
            
            // Add cache-busting for DailyNotes and Manufacturing to ensure fresh version loads
            // Use timestamp-based version for critical components that change frequently
            if (scriptSrc.includes('DailyNotes') || scriptSrc.includes('Manufacturing') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const separator = scriptSrc.includes('?') ? '&' : '?';
                scriptSrc = scriptSrc + separator + 'v=' + Date.now();
            }
            
            // Wait for React if needed (for ProjectDetail), then proceed with loading
            ensureReactForProjectDetail().then(() => {
                // First, fetch the file to validate it's JavaScript before loading as script
                // This prevents HTML (404 pages) from being executed as JavaScript
                // Use no-cache for DailyNotes and Manufacturing to ensure fresh version, default for others
                const cachePolicy = scriptSrc.includes('DailyNotes') || scriptSrc.includes('Manufacturing') ? 'no-cache' : 'default';
                return fetch(scriptSrc, { cache: cachePolicy })
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
                            // For ProjectDetail, wait for component to actually register
                            if (scriptSrc.includes('ProjectDetail')) {
                                console.log('🔵 Lazy loader: ProjectDetail script.onload fired, waiting for registration...');
                                
                                // Wait for component to actually register before resolving
                                let resolved = false;
                                const doResolve = () => {
                                    if (resolved) return; // Prevent double resolution
                                    resolved = true;
                                    window.removeEventListener('componentLoaded', eventHandler);
                                    clearTimeout(timeoutId);
                                    URL.revokeObjectURL(blobUrl);
                                    loadedComponents++;
                                    resolve();
                                };
                                
                                // First, try listening for the componentLoaded event
                                const eventHandler = (event) => {
                                    if (event.detail && event.detail.component === 'ProjectDetail' && window.ProjectDetail) {
                                        console.log('✅ ProjectDetail registered via componentLoaded event');
                                        doResolve();
                                    }
                                };
                                window.addEventListener('componentLoaded', eventHandler);
                                
                                // Also poll as fallback (in case event doesn't fire or fires too early)
                                let attempts = 0;
                                const maxAttempts = 20; // 2 seconds total
                                const checkRegistration = () => {
                                    attempts++;
                                    if (window.ProjectDetail) {
                                        console.log('✅ ProjectDetail loaded and registered via lazy loader (after', attempts * 100, 'ms)');
                                        doResolve();
                                    } else if (attempts < maxAttempts) {
                                        setTimeout(checkRegistration, 100);
                                    } else {
                                        console.warn('⚠️ ProjectDetail script loaded but component not registered after 2s');
                                        console.warn('⚠️ Checking if script executed - window keys:', Object.keys(window).filter(k => k.includes('Project')));
                                        // Still resolve to prevent blocking other components
                                        doResolve();
                                    }
                                };
                                
                                // Set timeout to prevent infinite waiting
                                const timeoutId = setTimeout(() => {
                                    if (!resolved) {
                                        console.warn('⚠️ ProjectDetail registration timeout after 2.5s');
                                        doResolve();
                                    }
                                }, 2500);
                                
                                // Start polling immediately
                                checkRegistration();
                            } else {
                                URL.revokeObjectURL(blobUrl); // Clean up blob URL
                                loadedComponents++;
                                resolve();
                            }
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
            }).catch(error => {
                // If ensureReactForProjectDetail fails or fetch fails, resolve anyway to prevent blocking
                console.warn(`⚠️ Failed to load component ${src}:`, error);
                resolve();
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
                            // Final check for ProjectDetail - try loading if dependencies are ready
                            if (!window.ProjectDetail) {
                                const projectDependenciesLoaded = 
                                    window.CustomFieldModal && 
                                    window.TaskDetailModal && 
                                    window.ListModal && 
                                    window.ProjectModal &&
                                    window.KanbanView &&
                                    window.CommentsPopup &&
                                    window.DocumentCollectionModal;
                                
                                if (projectDependenciesLoaded && !window._projectDetailLoadAttempted) {
                                    console.log('🔵 Lazy loader: Final attempt - loading ProjectDetail...');
                                    window._projectDetailLoadAttempted = true;
                                    loadComponent('./src/components/projects/ProjectDetail.jsx').then(() => {
                                        setTimeout(() => {
                                            if (window.ProjectDetail) {
                                                console.log('✅ Lazy loader: ProjectDetail loaded on final attempt');
                                            } else {
                                                console.warn('⚠️ Lazy loader: ProjectDetail still not available after all attempts');
                                            }
                                        }, 1000);
                                    });
                                } else {
                                    console.warn('⚠️ Lazy loading complete but ProjectDetail not loaded');
                                    if (!projectDependenciesLoaded) {
                                        console.warn('⚠️ ProjectDetail dependencies not all loaded yet');
                                    }
                                }
                            } else {
                                console.log('✅ ProjectDetail successfully loaded');
                            }
                            return;
                        }
                        
                        Promise.all(batch.map(loadComponent)).then(() => {
                            // Special handling: Load ProjectDetail AFTER its dependencies are loaded
                            // Check if we've loaded ProjectDetail dependencies but ProjectDetail itself isn't loaded yet
                            const projectDependenciesLoaded = 
                                window.CustomFieldModal && 
                                window.TaskDetailModal && 
                                window.ListModal && 
                                window.ProjectModal &&
                                window.KanbanView &&
                                window.CommentsPopup &&
                                window.DocumentCollectionModal;
                            
                            if (projectDependenciesLoaded && !window.ProjectDetail && !window._projectDetailLoadAttempted) {
                                console.log('🔵 Lazy loader: ProjectDetail dependencies loaded, loading ProjectDetail now...');
                                window._projectDetailLoadAttempted = true;
                                
                                // Load ProjectDetail with its robust dependency checker
                                loadComponent('./src/components/projects/ProjectDetail.jsx').then(() => {
                                    setTimeout(() => {
                                        if (window.ProjectDetail) {
                                            console.log('✅ Lazy loader: ProjectDetail loaded and registered successfully');
                                        } else {
                                            console.warn('⚠️ Lazy loader: ProjectDetail script loaded but component not registered');
                                        }
                                    }, 500);
                                }).catch(err => {
                                    console.warn('⚠️ Lazy loader: Failed to load ProjectDetail:', err);
                                });
                            }
                            
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

