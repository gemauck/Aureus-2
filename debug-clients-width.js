/**
 * Debug Script: Find what's constraining Clients component width
 * Run this in browser console on the Clients page
 */

(function() {
    console.log('🔍 Debugging Clients Component Width...\n');
    
    // Find the Clients component
    const clientsElements = document.querySelectorAll('[class*="Clients"], [class*="clients"]');
    const main = document.querySelector('main');
    
    if (clientsElements.length === 0) {
        console.log('❌ No Clients component found on page');
        return;
    }
    
    console.log(`✅ Found ${clientsElements.length} Clients-related elements\n`);
    
    // Check each element
    clientsElements.forEach((el, idx) => {
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        console.log(`\n📦 Element ${idx + 1}:`, el.className || 'No class');
        console.log(`   Width: ${rect.width}px`);
        console.log(`   Max-width: ${styles.maxWidth}`);
        console.log(`   Min-width: ${styles.minWidth}`);
        console.log(`   Margin-left: ${styles.marginLeft}`);
        console.log(`   Margin-right: ${styles.marginRight}`);
        console.log(`   Padding-left: ${styles.paddingLeft}`);
        console.log(`   Padding-right: ${styles.paddingRight}`);
        console.log(`   Display: ${styles.display}`);
        console.log(`   Flex: ${styles.flex}`);
        console.log(`   Parent width: ${el.parentElement ? el.parentElement.getBoundingClientRect().width + 'px' : 'N/A'}`);
        
        // Check for max-width classes
        const hasMaxW = Array.from(el.classList).some(c => c.startsWith('max-w-'));
        if (hasMaxW) {
            console.log(`   ⚠️ Has max-width class: ${Array.from(el.classList).find(c => c.startsWith('max-w-'))}`);
        }
    });
    
    // Check main element
    if (main) {
        const mainStyles = window.getComputedStyle(main);
        const mainRect = main.getBoundingClientRect();
        console.log(`\n📄 Main element:`);
        console.log(`   Width: ${mainRect.width}px`);
        console.log(`   Max-width: ${mainStyles.maxWidth}`);
        console.log(`   Viewport width: ${window.innerWidth}px`);
        console.log(`   Difference: ${window.innerWidth - mainRect.width}px`);
    }
    
    // Check for container classes
    const containers = document.querySelectorAll('.container, [class*="max-w-"]');
    console.log(`\n📦 Found ${containers.length} container/max-width elements:`);
    containers.forEach((el, idx) => {
        if (idx < 10) { // Limit output
            const rect = el.getBoundingClientRect();
            console.log(`   ${idx + 1}. ${el.className}: ${rect.width}px wide`);
        }
    });
    
    // Check parent chain
    if (clientsElements[0]) {
        console.log(`\n🔗 Parent chain for first Clients element:`);
        let current = clientsElements[0];
        let depth = 0;
        while (current && depth < 5) {
            const rect = current.getBoundingClientRect();
            const styles = window.getComputedStyle(current);
            console.log(`   ${'  '.repeat(depth)}${current.tagName}${current.className ? '.' + current.className.split(' ')[0] : ''}: ${rect.width}px (max: ${styles.maxWidth})`);
            current = current.parentElement;
            depth++;
        }
    }
    
    console.log(`\n💡 If width is less than viewport, check:`);
    console.log(`   1. Parent container max-width`);
    console.log(`   2. Flex container flex-basis`);
    console.log(`   3. CSS rules with !important`);
    console.log(`   4. Inline styles`);
})();






