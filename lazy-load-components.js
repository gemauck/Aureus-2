// Lazy loading script to defer non-critical component loading
// VERSION: 1020-projectdetail-bulletproof - Multiple loading strategies ensure ProjectDetail ALWAYS loads
console.log('🚀 lazy-load-components.js v1020-projectdetail-bulletproof loaded');
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
        './src/components/tasks/TaskManagement.jsx',
        
        // Clients and related modals
        // ClientDetailModal, LeadDetailModal, Clients.jsx, and ClientDetailModalMobile are loaded early in index.html - DO NOT load here to avoid conflicts
        // './src/components/clients/ClientDetailModal.jsx',
        // './src/components/clients/LeadDetailModal.jsx',
        // './src/components/clients/Clients.jsx', // Loaded in index.html BEFORE lazy-loader runs
        // './src/components/clients/ClientDetailModalMobile.jsx', // Loaded in index.html - blocked to prevent conflicts
        // './src/components/clients/ClientsSimple.jsx', // REMOVED - no longer needed
        './src/components/clients/ClientsMobile.jsx',
        './src/components/clients/ClientsMobileOptimized.jsx',
        './src/components/clients/BulkOperations.jsx',
        './src/components/clients/Pipeline.jsx',
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
        // BULLETPROOF: ProjectDetail is loaded explicitly here AND via special handler
        // This ensures it loads even if one method fails
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
        './src/components/teams/ManagementMeetingNotes.jsx',
        './src/components/teams/POAReview.jsx',
        './src/components/teams/JobCardModal.jsx',
        './src/components/teams/TeamModals.jsx',
        './src/components/teams/Teams.jsx',
        './src/components/teams/TeamsSimple.jsx',
        
        // Users
        './src/components/users/UserModal.jsx',
        './src/components/users/InviteUserModal.jsx',
        './src/components/users/PasswordDisplayModal.jsx',
        './src/components/users/Users.jsx',
        // UserManagement.jsx removed - using Users.jsx instead
        
        // Manufacturing - MOVED from index.html to lazy loading for better performance
        './src/components/manufacturing/locations/StockLocations.jsx',
        './src/components/manufacturing/StockTransactions.jsx',
        './src/components/manufacturing/JobCards.jsx',
        './src/components/manufacturing/Manufacturing.jsx',
        './src/components/service-maintenance/ServiceAndMaintenance.jsx',
        
        // Helpdesk
        './src/components/helpdesk/TicketDetailModal.jsx',
        './src/components/helpdesk/Helpdesk.jsx',
        
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
        
        // Leave Platform - Load EmployeeDetail BEFORE LeavePlatform since it depends on it
        './src/components/leave-platform/EmployeeDetail.jsx',
        './src/components/leave-platform/LeavePlatform.jsx',
        
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
        './src/components/tools/DieselRefundEvidenceEvaluator.jsx',
        './src/components/tools/Tools.jsx',
        
        // Tasks and Notes
        './src/components/tasks/TaskManagement.jsx',
        './src/components/notes/MyNotes.jsx',
        
        // Common components
        './src/components/common/CommentInputWithMentions.jsx',
        './src/components/common/RichTextEditor.jsx',
        
        // Utils and integrations
        './src/utils/permissions.js',
        './src/utils/whatsapp.js',
        './src/utils/dieselRefundEvidenceEvaluator.js',
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
            // CRITICAL: Check if Vite components are already available
            // Vite Projects module loads before lazy-loader, so check first
            if (src.includes('Projects.jsx') || src.includes('Projects.js')) {
                if (window.Projects && typeof window.Projects === 'function') {
                    console.log('✅ Projects component already available from Vite module - skipping lazy load');
                    resolve();
                    return;
                }
            }
            if (src.includes('ProjectDetail.jsx') || src.includes('ProjectDetail.js')) {
                if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
                    console.log('✅ ProjectDetail component already available from Vite module - skipping lazy load');
                    resolve();
                    return;
                }
            }
            if (src.includes('ProjectModal.jsx') || src.includes('ProjectModal.js')) {
                if (window.ProjectModal && typeof window.ProjectModal === 'function') {
                    console.log('✅ ProjectModal component already available from Vite module - skipping lazy load');
                    resolve();
                    return;
                }
            }
            if (src.includes('MonthlyDocumentCollectionTracker.jsx') || src.includes('MonthlyDocumentCollectionTracker.js')) {
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    // IMPORTANT:
                    // Do NOT skip loading our dist version for MonthlyDocumentCollectionTracker.
                    // We intentionally allow the lazy-loaded (dist) component to load even when
                    // a Vite module version is already present so that the latest bug‑fixed
                    // implementation can override older bundled versions.
                    console.log('✅ MonthlyDocumentCollectionTracker component already available from Vite module - loading dist override anyway');
                }
            }
            
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
            
            // Cache-busting for critical components to ensure fresh version loads
            const meetingNotesVersion = 'meeting-notes-v20251201-smooth-transitions';
            if ((scriptSrc.includes('ManagementMeetingNotes') || scriptSrc.includes('teams/Teams')) && !scriptSrc.includes(meetingNotesVersion)) {
                const separator = scriptSrc.includes('?') ? '&' : '?';
                scriptSrc = scriptSrc + separator + 'v=' + meetingNotesVersion + '-' + Date.now();
            }

            // Use timestamp-based version for components that require fresh load each time
            // Note: Check both .jsx (source) and .js (compiled) paths since lazy-loader converts paths
            // Also check the original src path to catch components before path conversion
            const needsCacheBusting = src.includes('DailyNotes') || src.includes('Manufacturing') || 
                                     src.includes('ProjectProgressTracker') || 
                                     src.includes('TaskManagement') || src.includes('MonthlyDocumentCollectionTracker') || 
                                     src.includes('Projects.jsx') || src.includes('Projects.js') || 
                                     src.includes('Users.jsx') || src.includes('Users.js') ||
                                     src.includes('ManagementMeetingNotes') || src.includes('Teams.jsx') || src.includes('Teams.js') ||
                                     src.includes('AuditTrail') || src.includes('Reports') ||
                                     scriptSrc.includes('DailyNotes') || scriptSrc.includes('Manufacturing') || 
                                     scriptSrc.includes('ProjectProgressTracker') || 
                                     scriptSrc.includes('TaskManagement') || scriptSrc.includes('MonthlyDocumentCollectionTracker') ||
                                     scriptSrc.includes('Users.jsx') || scriptSrc.includes('Users.js') || 
                                     scriptSrc.includes('Projects.jsx') || scriptSrc.includes('Projects.js') || 
                                     scriptSrc.includes('/projects/Projects') || 
                                     scriptSrc.includes('ManagementMeetingNotes') || scriptSrc.includes('Teams.jsx') || scriptSrc.includes('Teams.js') ||
                                     scriptSrc.includes('AuditTrail') || scriptSrc.includes('Reports') ||
                                     window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (needsCacheBusting) {
                const separator = scriptSrc.includes('?') ? '&' : '?';
                // Use build version from build-version.json if available, otherwise use timestamp
                let cacheVersion = Date.now();
                try {
                    // Try to get build version synchronously from a global variable set in index.html
                    if (window.BUILD_VERSION) {
                        cacheVersion = window.BUILD_VERSION + '-' + Date.now();
                    }
                } catch (e) {
                    // Fallback to timestamp if build version not available
                }
                scriptSrc = scriptSrc + separator + 'v=' + cacheVersion;
                console.log(`🔄 Cache-busting applied to: ${scriptSrc}`);
            }
            
            // Wait for React if needed (for ProjectDetail), then proceed with loading
            ensureReactForProjectDetail().then(() => {
                // First, fetch the file to validate it's JavaScript before loading as script
                // This prevents HTML (404 pages) from being executed as JavaScript
                // Use no-cache for DailyNotes, Manufacturing, ProjectProgressTracker, and ManagementMeetingNotes to ensure fresh version, default for others
                const cachePolicy = scriptSrc.includes('DailyNotes') || scriptSrc.includes('Manufacturing') || scriptSrc.includes('ProjectProgressTracker') || scriptSrc.includes('ManagementMeetingNotes') || scriptSrc.includes('Teams.jsx') || scriptSrc.includes('Teams.js') ? 'no-cache' : 'default';
                
                // Retry logic for server errors (502, 503, 504)
                const attemptLoad = (attempt = 1, maxAttempts = 3) => {
                    return fetch(scriptSrc, { cache: cachePolicy })
                    .then(response => {
                        if (!response.ok) {
                            // Check if this is a retryable server error
                            const isServerError = response.status === 502 || response.status === 503 || response.status === 504;
                            const isNotFound = response.status === 404;
                            
                            if (isNotFound) {
                                // 404 means component doesn't exist - skip without retry
                                console.warn(`⚠️ Component not found: ${scriptSrc} (404, skipping)`);
                                resolve();
                                return Promise.resolve(null);
                            }
                            
                            if (isServerError && attempt < maxAttempts) {
                                // Retry server errors with exponential backoff
                                const delay = Math.min(300 * Math.pow(2, attempt - 1), 2000); // 300ms, 600ms, 1200ms, max 2000ms
                                console.warn(`⚠️ Server error ${response.status} loading ${scriptSrc} (attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms)...`);
                                return new Promise((retryResolve) => {
                                    setTimeout(() => {
                                        attemptLoad(attempt + 1, maxAttempts).then(retryResolve);
                                    }, delay);
                                });
                            }
                            
                            // Max retries reached or non-retryable error
                            if (isServerError) {
                                console.error(`❌ Component failed to load after ${maxAttempts} attempts: ${scriptSrc} (${response.status})`);
                                console.error(`   This usually means the build files are missing on the server.`);
                                console.error(`   Run: npm run build on the production server to generate dist/src/ files.`);
                            } else {
                                console.warn(`⚠️ Component not found: ${scriptSrc} (${response.status}, skipping)`);
                            }
                            resolve();
                            return Promise.resolve(null);
                        }
                        
                        // Success - return response for processing
                        return response;
                    })
                    .catch(error => {
                        // Network errors - retry if we haven't exceeded max attempts
                        if (attempt < maxAttempts) {
                            const delay = Math.min(300 * Math.pow(2, attempt - 1), 2000);
                            console.warn(`⚠️ Network error loading ${scriptSrc} (attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms):`, error.message);
                            return new Promise((retryResolve) => {
                                setTimeout(() => {
                                    attemptLoad(attempt + 1, maxAttempts).then(retryResolve);
                                }, delay);
                            });
                        }
                        
                        // Max retries reached
                        console.warn(`⚠️ Component failed to load after ${maxAttempts} attempts due to network error: ${scriptSrc}`, error);
                        resolve();
                        return Promise.resolve(null);
                    });
                };
                
                return attemptLoad().then(response => {
                    // If response is null, it means we skipped the component (already resolved)
                    if (!response) {
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
                
                // Reduced max wait time from 3000ms to 1500ms for faster startup
                if (criticalLoaded || elapsed >= 1500) {
                    clearInterval(checkInterval);
                    
                    // Now start loading lazy components
                    // Increased batch size from 3 to 8 for better performance
                    // Further increased to 12 for faster initial load
                    const batchSize = 12;
                    let index = 0;
                    
                    function loadBatch() {
                        const batch = componentFiles.slice(index, index + batchSize);
                        if (batch.length === 0) {
                            console.log(`✅ Lazy loading complete: ${loadedComponents} components loaded`);
                            // BULLETPROOF: ALWAYS try to load ProjectDetail if it's not loaded
                            // Don't wait for dependencies - ProjectDetail has its own robust loader
                            if (!window.ProjectDetail) {
                                console.log('🔵 Lazy loader: Final attempt - loading ProjectDetail (will wait for dependencies internally)...');
                                
                                // Try loading ProjectDetail multiple times with retries
                                const attemptLoadProjectDetail = (attemptNumber = 1, maxAttempts = 5) => {
                                    if (window.ProjectDetail) {
                                        console.log(`✅ Lazy loader: ProjectDetail loaded on attempt ${attemptNumber}`);
                                        return;
                                    }
                                    
                                    if (attemptNumber > maxAttempts) {
                                        console.error('❌ Lazy loader: ProjectDetail failed to load after all attempts - setting up fallback loader');
                                        // Set up a global fallback loader that runs periodically
                                        setupProjectDetailFallbackLoader();
                                        return;
                                    }
                                    
                                    console.log(`🔵 Lazy loader: Attempting to load ProjectDetail (attempt ${attemptNumber}/${maxAttempts})...`);
                                    loadComponent('./src/components/projects/ProjectDetail.jsx').then(() => {
                                        setTimeout(() => {
                                            if (window.ProjectDetail) {
                                                console.log(`✅ Lazy loader: ProjectDetail loaded successfully on attempt ${attemptNumber}`);
                                            } else {
                                                console.warn(`⚠️ Lazy loader: ProjectDetail script loaded but component not registered (attempt ${attemptNumber})`);
                                                // Retry after a delay
                                                setTimeout(() => attemptLoadProjectDetail(attemptNumber + 1, maxAttempts), 1000);
                                            }
                                        }, 1000);
                                    }).catch(err => {
                                        console.warn(`⚠️ Lazy loader: Failed to load ProjectDetail (attempt ${attemptNumber}):`, err);
                                        // Retry after a delay
                                        setTimeout(() => attemptLoadProjectDetail(attemptNumber + 1, maxAttempts), 1000);
                                    });
                                };
                                
                                attemptLoadProjectDetail();
                            } else {
                                console.log('✅ ProjectDetail successfully loaded');
                            }
                            return;
                        }
                        
                            Promise.all(batch.map(loadComponent)).then(() => {
                            // Special handling: Load ProjectDetail AFTER its dependencies are loaded
                            // Check if we've loaded ProjectDetail dependencies but ProjectDetail itself isn't loaded yet
                            // Note: MonthlyDocumentCollectionTracker is optional (loaded from vite-projects module)
                            const projectDependenciesLoaded = 
                                window.CustomFieldModal && 
                                window.TaskDetailModal && 
                                window.ListModal && 
                                window.ProjectModal &&
                                window.KanbanView &&
                                window.CommentsPopup &&
                                window.DocumentCollectionModal;
                            
                            // Check for MonthlyDocumentCollectionTracker (optional, may come from vite-projects)
                            const monthlyTrackerAvailable = window.MonthlyDocumentCollectionTracker;
                            
                            // BULLETPROOF: Try loading ProjectDetail whenever critical dependencies are ready
                            // MonthlyDocumentCollectionTracker is optional - ProjectDetail will handle its absence gracefully
                            // Don't check _projectDetailLoadAttempted - we want multiple attempts
                            if (projectDependenciesLoaded && !window.ProjectDetail) {
                                if (!monthlyTrackerAvailable) {
                                    console.log('🔵 Lazy loader: ProjectDetail critical dependencies loaded (MonthlyDocumentCollectionTracker may load later from vite-projects), loading ProjectDetail now...');
                                } else {
                                    console.log('🔵 Lazy loader: ProjectDetail dependencies loaded (including MonthlyDocumentCollectionTracker), loading ProjectDetail now...');
                                }
                                
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
                            
                            // BULLETPROOF: Also try loading ProjectDetail even if dependencies aren't all ready
                            // ProjectDetail has its own robust loader that will wait for dependencies
                            if (!window.ProjectDetail && !projectDependenciesLoaded) {
                                // Check if React is at least available (critical dependency)
                                if (window.React && window.React.useState) {
                                    console.log('🔵 Lazy loader: React available, attempting to load ProjectDetail (will wait for other dependencies)...');
                                    loadComponent('./src/components/projects/ProjectDetail.jsx').catch(err => {
                                        console.warn('⚠️ Lazy loader: Failed early ProjectDetail load:', err);
                                    });
                                }
                            }
                            
                            index += batchSize;
                            // Reduced delay between batches for faster loading (50ms -> 25ms)
                            const nextBatchDelay = index < componentFiles.length ? 25 : 0;
                            
                            if (typeof requestIdleCallback !== 'undefined') {
                                requestIdleCallback(loadBatch, { timeout: 200 });
                            } else {
                                setTimeout(loadBatch, nextBatchDelay);
                            }
                        });
                    }
                    
                    loadBatch();
                }
            }, 50); // Check every 50ms for faster detection
        };
        
        // Start checking after minimal initial delay for faster loading
        setTimeout(waitForCriticalComponents, 100);
    }
    
    // BULLETPROOF: Global fallback loader for ProjectDetail
    // This runs periodically to ensure ProjectDetail loads even if all other methods fail
    function setupProjectDetailFallbackLoader() {
        // Prevent multiple fallback loaders
        if (window._projectDetailFallbackLoaderActive) {
            return;
        }
        window._projectDetailFallbackLoaderActive = true;
        
        console.log('🔄 Setting up ProjectDetail fallback loader (runs every 5 seconds until loaded)...');
        
        let attempts = 0;
        const maxAttempts = 60; // Run for up to 5 minutes (60 * 5 seconds)
        
        const fallbackInterval = setInterval(() => {
            attempts++;
            
            // Stop if ProjectDetail is loaded
            if (window.ProjectDetail) {
                console.log('✅ Fallback loader: ProjectDetail loaded! Stopping fallback loader.');
                clearInterval(fallbackInterval);
                window._projectDetailFallbackLoaderActive = false;
                return;
            }
            
            // Stop after max attempts
            if (attempts >= maxAttempts) {
                console.error('❌ Fallback loader: Max attempts reached. ProjectDetail still not loaded.');
                clearInterval(fallbackInterval);
                window._projectDetailFallbackLoaderActive = false;
                return;
            }
            
            // Try loading ProjectDetail
            console.log(`🔄 Fallback loader: Attempt ${attempts}/${maxAttempts} - loading ProjectDetail...`);
            
            const scriptSrc = '/dist/src/components/projects/ProjectDetail.js';
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = true;
            script.src = scriptSrc;
            
            script.onload = () => {
                setTimeout(() => {
                    if (window.ProjectDetail) {
                        console.log('✅ Fallback loader: ProjectDetail loaded successfully!');
                        clearInterval(fallbackInterval);
                        window._projectDetailFallbackLoaderActive = false;
                    }
                }, 1000);
            };
            
            script.onerror = () => {
                console.warn(`⚠️ Fallback loader: Failed to load ProjectDetail (attempt ${attempts})`);
            };
            
            // Remove any existing ProjectDetail script to avoid duplicates
            const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
            if (existingScript) {
                existingScript.remove();
            }
            
            document.body.appendChild(script);
        }, 5000); // Check every 5 seconds
    }
    
    // BULLETPROOF: Start fallback loader immediately as a safety net
    // This ensures ProjectDetail loads even if lazy-loader fails completely
    setTimeout(() => {
        if (!window.ProjectDetail) {
            console.log('🔄 Starting ProjectDetail fallback loader as safety net...');
            setupProjectDetailFallbackLoader();
        }
    }, 10000); // Start after 10 seconds if ProjectDetail isn't loaded yet
})();

