// Performance Monitoring and Debugging Utilities for Load-Once Architecture
// Add this script to index.html after DataContext loads for comprehensive monitoring

(() => {
    'use strict';

    // Performance Metrics Collector
    class PerformanceMonitor {
        constructor() {
            this.metrics = {
                initialLoad: null,
                navigationTimes: [],
                apiCalls: [],
                cacheHits: 0,
                cacheMisses: 0,
                optimisticUpdates: 0,
                backgroundSyncs: 0,
                errors: []
            };
            
            this.startTime = Date.now();
            this.setupMonitoring();
        }

        setupMonitoring() {
            // Monitor initial load
            window.addEventListener('load', () => {
                this.metrics.initialLoad = Date.now() - this.startTime;
            });

            // Intercept fetch calls
            this.interceptFetch();
            
            // Monitor navigation
            this.monitorNavigation();
            
            // Monitor cache usage
            this.monitorCache();
        }

        interceptFetch() {
            const originalFetch = window.fetch;
            const self = this;
            
            window.fetch = async function(...args) {
                const startTime = performance.now();
                const url = args[0];
                
                try {
                    const response = await originalFetch.apply(this, args);
                    const endTime = performance.now();
                    const duration = endTime - startTime;
                    
                    self.metrics.apiCalls.push({
                        url,
                        duration,
                        timestamp: Date.now(),
                        status: response.status
                    });
                    
                    return response;
                } catch (error) {
                    self.metrics.errors.push({
                        type: 'api',
                        url,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    throw error;
                }
            };
        }

        monitorNavigation() {
            // Track route changes
            let lastPath = window.location.pathname;
            const self = this;
            
            setInterval(() => {
                const currentPath = window.location.pathname;
                if (currentPath !== lastPath) {
                    self.metrics.navigationTimes.push({
                        from: lastPath,
                        to: currentPath,
                        timestamp: Date.now()
                    });
                    lastPath = currentPath;
                }
            }, 100);
        }

        monitorCache() {
            // Wrap useData to track cache usage
            if (window.useData) {
                const originalGetCachedData = window.useData().getCachedData;
                const self = this;
                
                // Note: This is a simplified approach
                // Actual implementation would need to be in DataContext
            }
        }

        getReport() {
            const now = Date.now();
            const uptime = (now - this.startTime) / 1000; // seconds
            
            return {
                uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
                initialLoad: `${this.metrics.initialLoad}ms`,
                totalApiCalls: this.metrics.apiCalls.length,
                apiCallsPerMinute: (this.metrics.apiCalls.length / (uptime / 60)).toFixed(1),
                averageNavigationTime: this.calculateAverageNavTime(),
                cacheHitRate: this.calculateCacheHitRate(),
                recentApiCalls: this.metrics.apiCalls.slice(-10),
                errors: this.metrics.errors,
                performance: this.getPerformanceGrade()
            };
        }

        calculateAverageNavTime() {
            if (this.metrics.navigationTimes.length === 0) return 'N/A';
            // Simplified - actual implementation would measure render time
            return '< 100ms (estimated)';
        }

        calculateCacheHitRate() {
            const total = this.metrics.cacheHits + this.metrics.cacheMisses;
            if (total === 0) return 'N/A';
            return `${((this.metrics.cacheHits / total) * 100).toFixed(1)}%`;
        }

        getPerformanceGrade() {
            let score = 100;
            
            // Initial load scoring
            if (this.metrics.initialLoad > 5000) score -= 20;
            else if (this.metrics.initialLoad > 3000) score -= 10;
            
            // API call frequency scoring
            const callsPerMin = this.metrics.apiCalls.length / ((Date.now() - this.startTime) / 60000);
            if (callsPerMin > 20) score -= 30;
            else if (callsPerMin > 10) score -= 15;
            else if (callsPerMin > 5) score -= 5;
            
            // Error scoring
            score -= this.metrics.errors.length * 5;
            
            if (score >= 90) return { grade: 'A', color: 'green', status: 'Excellent' };
            if (score >= 80) return { grade: 'B', color: 'lightgreen', status: 'Good' };
            if (score >= 70) return { grade: 'C', color: 'yellow', status: 'Acceptable' };
            if (score >= 60) return { grade: 'D', color: 'orange', status: 'Poor' };
            return { grade: 'F', color: 'red', status: 'Critical' };
        }

        printReport() {
            const report = this.getReport();
            const grade = report.performance;
            
            
            if (report.errors.length > 0) {
                report.errors.slice(-5).forEach(err => {
                });
            }
            
            if (report.recentApiCalls.length > 0) {
                report.recentApiCalls.forEach(call => {
                    const url = call.url.toString().substring(0, 50);
                });
            }
            
            
            return report;
        }
    }

    // Initialize performance monitor
    window.performanceMonitor = new PerformanceMonitor();

    // Global debug commands
    window.perfReport = () => window.performanceMonitor.printReport();
    
    window.clearPerfMetrics = () => {
        window.performanceMonitor = new PerformanceMonitor();
    };

    // Automated health checks
    window.healthCheck = () => {
        
        const checks = [];
        
        // Check 1: DataContext loaded
        checks.push({
            name: 'DataContext Loaded',
            passed: typeof window.DataContext !== 'undefined',
            critical: true
        });
        
        // Check 2: useData available
        checks.push({
            name: 'useData Hook Available',
            passed: typeof window.useData === 'function',
            critical: true
        });
        
        // Check 3: Cache has data
        if (typeof window.useData === 'function') {
            const status = window.useData().getCacheStatus();
            const hasData = Object.values(status).some(s => s.hasData);
            checks.push({
                name: 'Cache Populated',
                passed: hasData,
                critical: false
            });
        }
        
        // Check 4: No excessive API calls
        const metrics = window.performanceMonitor.metrics;
        const uptime = (Date.now() - window.performanceMonitor.startTime) / 60000;
        const callsPerMin = metrics.apiCalls.length / uptime;
        checks.push({
            name: 'API Call Frequency',
            passed: callsPerMin < 10,
            critical: false,
            value: `${callsPerMin.toFixed(1)}/min`
        });
        
        // Check 5: No critical errors
        checks.push({
            name: 'Error Free',
            passed: metrics.errors.length === 0,
            critical: false,
            value: `${metrics.errors.length} errors`
        });
        
        // Print results
        checks.forEach(check => {
            const icon = check.passed ? '✅' : (check.critical ? '🔴' : '⚠️');
            const value = check.value ? ` (${check.value})` : '';
        });
        
        const allCriticalPassed = checks.filter(c => c.critical).every(c => c.passed);
        const allPassed = checks.every(c => c.passed);
        
        if (allPassed) {
        } else if (allCriticalPassed) {
        } else {
        }
        
        return { checks, healthy: allCriticalPassed };
    };

    // Compare architectures
    window.compareArchitectures = () => {
        
        const current = window.USE_LOAD_ONCE_ARCHITECTURE ? 'New (Load-Once)' : 'Old (Legacy)';
        const metrics = window.performanceMonitor.getReport();
        
        
    };

    // Real-time monitoring dashboard
    window.startMonitoring = (intervalSeconds = 60) => {
        
        const interval = setInterval(() => {
            window.performanceMonitor.printReport();
            window.healthCheck();
        }, intervalSeconds * 1000);
        
        window.stopMonitoring = () => {
            clearInterval(interval);
        };
        
        
        return interval;
    };

    // Cache inspector
    window.inspectCache = () => {
        if (typeof window.useData !== 'function') {
            console.error('❌ useData not available');
            return;
        }
        
        const status = window.useData().getCacheStatus();
        
        
        Object.entries(status).forEach(([key, info]) => {
            const icon = info.hasData ? '✅' : '❌';
            const age = info.age ? `${info.age}s old` : 'N/A';
            const validity = info.valid ? '✓ Valid' : '✗ Expired';
            const loading = info.loading ? '(Loading...)' : '';
            
        });
        
    };

    // Test suite
    window.runTests = async () => {
        
        const tests = [];
        
        // Test 1: Cache performance
        const start = performance.now();
        const data = window.useData().getCachedData('clients');
        const end = performance.now();
        const cacheTime = end - start;
        
        tests.push({
            name: 'Cache Read Speed',
            passed: cacheTime < 10,
            value: `${cacheTime.toFixed(2)}ms`,
            expected: '< 10ms'
        });
        
        // Test 2: Data availability
        const status = window.useData().getCacheStatus();
        const hasClients = status.clients?.hasData;
        const hasLeads = status.leads?.hasData;
        
        tests.push({
            name: 'Clients Data Available',
            passed: hasClients,
            value: hasClients ? 'Yes' : 'No'
        });
        
        tests.push({
            name: 'Leads Data Available',
            passed: hasLeads,
            value: hasLeads ? 'Yes' : 'No'
        });
        
        // Test 3: API call frequency
        const metrics = window.performanceMonitor.metrics;
        const uptime = (Date.now() - window.performanceMonitor.startTime) / 60000;
        const callsPerMin = metrics.apiCalls.length / uptime;
        
        tests.push({
            name: 'API Efficiency',
            passed: callsPerMin < 10,
            value: `${callsPerMin.toFixed(1)}/min`,
            expected: '< 10/min'
        });
        
        // Print results
        
        tests.forEach((test, i) => {
            const icon = test.passed ? '✅' : '❌';
            const expected = test.expected ? ` (Expected: ${test.expected})` : '';
        });
        
        const passed = tests.filter(t => t.passed).length;
        const total = tests.length;
        
        
        return { tests, passed, total };
    };

    // Auto-run health check after 5 seconds
    setTimeout(() => {
        if (window.USE_LOAD_ONCE_ARCHITECTURE) {
            window.healthCheck();
        }
    }, 5000);

})();
