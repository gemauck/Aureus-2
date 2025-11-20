/**
 * Mobile Optimization Test Script
 * Run this in the browser console to verify mobile optimizations
 */

(function() {
    console.log('📱 Mobile Optimization Test Starting...\n');
    
    const tests = {
        teams: {
            name: 'Teams Component',
            checks: []
        },
        projects: {
            name: 'Projects Component',
            checks: []
        },
        clients: {
            name: 'Clients Component',
            checks: []
        }
    };
    
    // Test 1: Check if responsive classes exist
    function testResponsiveClasses() {
        console.log('✅ Test 1: Checking for responsive Tailwind classes...');
        
        // Check Teams component
        const teamsElements = document.querySelectorAll('[class*="Teams"], [class*="teams"]');
        let teamsHasResponsive = false;
        teamsElements.forEach(el => {
            const classes = el.className || '';
            if (classes.includes('sm:') || classes.includes('md:') || classes.includes('flex-col sm:flex-row')) {
                teamsHasResponsive = true;
            }
        });
        tests.teams.checks.push({
            name: 'Responsive classes present',
            passed: teamsHasResponsive || teamsElements.length === 0
        });
        
        // Check Projects component
        const projectsElements = document.querySelectorAll('[class*="Projects"], [class*="projects"]');
        let projectsHasResponsive = false;
        projectsElements.forEach(el => {
            const classes = el.className || '';
            if (classes.includes('sm:') || classes.includes('md:') || classes.includes('flex-col sm:flex-row')) {
                projectsHasResponsive = true;
            }
        });
        tests.projects.checks.push({
            name: 'Responsive classes present',
            passed: projectsHasResponsive || projectsElements.length === 0
        });
        
        // Check Clients component
        const clientsElements = document.querySelectorAll('[class*="Clients"], [class*="clients"]');
        let clientsHasResponsive = false;
        clientsElements.forEach(el => {
            const classes = el.className || '';
            if (classes.includes('sm:') || classes.includes('md:') || classes.includes('flex-col sm:flex-row')) {
                clientsHasResponsive = true;
            }
        });
        tests.clients.checks.push({
            name: 'Responsive classes present',
            passed: clientsHasResponsive || clientsElements.length === 0
        });
    }
    
    // Test 2: Check for touch-friendly button sizes
    function testTouchTargets() {
        console.log('✅ Test 2: Checking touch target sizes...');
        
        const buttons = document.querySelectorAll('button');
        let buttonsWithMinHeight = 0;
        let totalButtons = buttons.length;
        
        buttons.forEach(btn => {
            const styles = window.getComputedStyle(btn);
            const minHeight = parseInt(styles.minHeight) || 0;
            const height = parseInt(styles.height) || 0;
            const actualHeight = Math.max(minHeight, height);
            
            if (actualHeight >= 44) {
                buttonsWithMinHeight++;
            }
        });
        
        const touchTargetRatio = totalButtons > 0 ? (buttonsWithMinHeight / totalButtons) * 100 : 0;
        
        tests.teams.checks.push({
            name: `Touch targets (${Math.round(touchTargetRatio)}% are 44px+)`,
            passed: touchTargetRatio >= 80 // At least 80% should be touch-friendly
        });
        tests.projects.checks.push({
            name: `Touch targets (${Math.round(touchTargetRatio)}% are 44px+)`,
            passed: touchTargetRatio >= 80
        });
        tests.clients.checks.push({
            name: `Touch targets (${Math.round(touchTargetRatio)}% are 44px+)`,
            passed: touchTargetRatio >= 80
        });
    }
    
    // Test 3: Check for mobile CSS file
    function testMobileCSS() {
        console.log('✅ Test 3: Checking for mobile-optimizations.css...');
        
        const stylesheets = Array.from(document.styleSheets);
        let hasMobileCSS = false;
        
        stylesheets.forEach(sheet => {
            try {
                if (sheet.href && sheet.href.includes('mobile-optimizations')) {
                    hasMobileCSS = true;
                }
            } catch (e) {
                // Cross-origin stylesheet, skip
            }
        });
        
        // Also check for inline styles or style tags
        const styleTags = document.querySelectorAll('style, link[rel="stylesheet"]');
        styleTags.forEach(tag => {
            if (tag.textContent && tag.textContent.includes('mobile-optimizations')) {
                hasMobileCSS = true;
            }
            if (tag.href && tag.href.includes('mobile-optimizations')) {
                hasMobileCSS = true;
            }
        });
        
        tests.teams.checks.push({ name: 'Mobile CSS loaded', passed: hasMobileCSS });
        tests.projects.checks.push({ name: 'Mobile CSS loaded', passed: hasMobileCSS });
        tests.clients.checks.push({ name: 'Mobile CSS loaded', passed: hasMobileCSS });
    }
    
    // Test 4: Check viewport meta tag
    function testViewport() {
        console.log('✅ Test 4: Checking viewport meta tag...');
        
        const viewport = document.querySelector('meta[name="viewport"]');
        const hasViewport = viewport !== null;
        const viewportContent = viewport ? viewport.content : '';
        const hasWidth = viewportContent.includes('width=device-width');
        
        tests.teams.checks.push({ 
            name: 'Viewport meta tag configured', 
            passed: hasViewport && hasWidth 
        });
        tests.projects.checks.push({ 
            name: 'Viewport meta tag configured', 
            passed: hasViewport && hasWidth 
        });
        tests.clients.checks.push({ 
            name: 'Viewport meta tag configured', 
            passed: hasViewport && hasWidth 
        });
    }
    
    // Test 5: Check for horizontal overflow
    function testHorizontalOverflow() {
        console.log('✅ Test 5: Checking for horizontal overflow...');
        
        const body = document.body;
        const html = document.documentElement;
        
        const bodyOverflow = window.getComputedStyle(body).overflowX;
        const htmlOverflow = window.getComputedStyle(html).overflowX;
        const hasOverflowHidden = bodyOverflow === 'hidden' || htmlOverflow === 'hidden';
        
        // Check if content width exceeds viewport
        const contentWidth = Math.max(
            body.scrollWidth,
            body.offsetWidth,
            html.clientWidth,
            html.scrollWidth,
            html.offsetWidth
        );
        const viewportWidth = window.innerWidth;
        const hasOverflow = contentWidth > viewportWidth + 10; // 10px tolerance
        
        tests.teams.checks.push({ 
            name: 'No horizontal overflow', 
            passed: !hasOverflow || hasOverflowHidden 
        });
        tests.projects.checks.push({ 
            name: 'No horizontal overflow', 
            passed: !hasOverflow || hasOverflowHidden 
        });
        tests.clients.checks.push({ 
            name: 'No horizontal overflow', 
            passed: !hasOverflow || hasOverflowHidden 
        });
    }
    
    // Run all tests
    testResponsiveClasses();
    testTouchTargets();
    testMobileCSS();
    testViewport();
    testHorizontalOverflow();
    
    // Print results
    console.log('\n📊 Test Results:\n');
    
    Object.keys(tests).forEach(key => {
        const test = tests[key];
        console.log(`\n${test.name}:`);
        let passed = 0;
        let total = test.checks.length;
        
        test.checks.forEach(check => {
            const status = check.passed ? '✅' : '❌';
            console.log(`  ${status} ${check.name}`);
            if (check.passed) passed++;
        });
        
        const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
        console.log(`  Score: ${passed}/${total} (${percentage}%)`);
    });
    
    console.log('\n💡 To test mobile view:');
    console.log('   1. Open Chrome DevTools (F12 or Cmd+Option+I)');
    console.log('   2. Click device toolbar icon (Cmd+Shift+M)');
    console.log('   3. Select "iPhone SE" (375x667)');
    console.log('   4. Navigate to Teams, Projects, or Clients pages');
    console.log('   5. Verify all elements stack properly and are touch-friendly\n');
    
    return tests;
})();



