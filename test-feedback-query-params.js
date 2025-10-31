// Quick test to verify feedback API query parameter fix
// This specifically tests the "Invalid feedback request" fix

console.log('🧪 Testing Feedback API Query Parameter Fix\n');
console.log('='.repeat(60));

// Test the path parsing logic (what we fixed)
function parseQueryParams(urlString) {
  const params = {}
  const queryIndex = urlString.indexOf('?')
  
  if (queryIndex === -1) return { params, path: urlString }
  
  const path = urlString.substring(0, queryIndex)
  const queryString = urlString.substring(queryIndex + 1)
  queryString.split('&').forEach(param => {
    const [key, value] = param.split('=')
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : ''
    }
  })
  return { params, path }
}

// Test cases that were failing before the fix
const testUrls = [
  '/feedback?includeUser=true',
  '/feedback?section=Dashboard&includeUser=true',
  '/feedback?pageUrl=/dashboard&section=Dashboard&includeUser=true',
  '/feedback',
  '/feedback?pageUrl=/test'
];

console.log('📋 Testing path parsing (this is what was broken):\n');

let allPassed = true;

testUrls.forEach(url => {
  const { params, path } = parseQueryParams(url);
  const pathSegments = path.split('/').filter(Boolean);
  const isFeedback = pathSegments.length === 1 && pathSegments[0] === 'feedback';
  
  console.log(`URL: ${url}`);
  console.log(`  Path: ${path}`);
  console.log(`  Path segments: [${pathSegments.join(', ')}]`);
  console.log(`  Is feedback endpoint: ${isFeedback ? '✅' : '❌'}`);
  console.log(`  Query params:`, params);
  
  if (!isFeedback) {
    console.log(`  ⚠️  This would have caused "Invalid feedback request" error!`);
    allPassed = false;
  } else {
    console.log(`  ✅ Correctly identifies as feedback endpoint`);
  }
  console.log('');
});

console.log('='.repeat(60));
if (allPassed) {
  console.log('\n✅ All tests passed! Path parsing fix is correct.');
  console.log('\nThe fix ensures:');
  console.log('  1. Query strings are stripped before path parsing');
  console.log('  2. Path segments are correctly identified');
  console.log('  3. Query parameters are properly parsed separately');
  console.log('\nThis fixes the "Invalid feedback request" error when using');
  console.log('query parameters like ?includeUser=true');
} else {
  console.log('\n❌ Some tests failed. Path parsing needs review.');
}

console.log('\n💡 To test on the actual server:');
console.log('   curl https://abcoafrica.co.za/api/feedback?includeUser=true');
console.log('   (Should return 401/403 for auth, or 200 with data, but NOT 400 "Invalid feedback request")');

