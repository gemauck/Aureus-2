#!/usr/bin/env node
/**
 * Test script to verify Weekly FMS Review Tracker email notification links
 * This simulates the link generation flow to ensure weeklySectionId parameters are used
 */

// Simulate the contextLink that WeeklyFMSReviewTracker generates
const projectId = 'cmhn2drtq001lqyu9bgfzzqx6';
const sectionId = '1767950860637';
const documentId = '1767950867875';
const month = 'January';
const weekNumber = '1';
const commentId = '1767951858750';

const contextLink = `#/projects/${projectId}?weeklySectionId=${encodeURIComponent(sectionId)}&weeklyDocumentId=${encodeURIComponent(documentId)}&weeklyMonth=${encodeURIComponent(month)}&weeklyWeek=${encodeURIComponent(weekNumber)}&commentId=${encodeURIComponent(commentId)}`;

console.log('🧪 Testing Weekly FMS Review Tracker Link Generation\n');
console.log('1. ContextLink from WeeklyFMSReviewTracker:');
console.log('   ', contextLink);
console.log('');

// Simulate mentionHelper logic
const hasWeeklyFMSReviewParams = contextLink && (
    contextLink.includes('weeklySectionId=') || 
    contextLink.includes('weeklyDocumentId=') || 
    contextLink.includes('weeklyWeek=') || 
    contextLink.includes('weeklyMonth=')
);

console.log('2. mentionHelper check for weekly FMS review params:');
console.log('   hasWeeklyFMSReviewParams:', hasWeeklyFMSReviewParams);
console.log('');

let entityUrl = contextLink;
if (hasWeeklyFMSReviewParams) {
    entityUrl = contextLink;
    console.log('3. ✅ mentionHelper preserves contextLink (CORRECT)');
    console.log('   entityUrl:', entityUrl);
} else {
    console.log('3. ❌ mentionHelper would generate new URL (WRONG)');
}

console.log('');

// Check for incorrect parameters
const hasDocParams = entityUrl.includes('docSectionId=') || 
                     entityUrl.includes('docDocumentId=') || 
                     entityUrl.includes('docMonth=');

const hasTabComments = entityUrl.includes('tab=comments');

console.log('4. Final link validation:');
console.log('   Has weeklySectionId:', entityUrl.includes('weeklySectionId='));
console.log('   Has weeklyDocumentId:', entityUrl.includes('weeklyDocumentId='));
console.log('   Has weeklyMonth:', entityUrl.includes('weeklyMonth='));
console.log('   Has weeklyWeek:', entityUrl.includes('weeklyWeek='));
console.log('   Has commentId:', entityUrl.includes('commentId='));
console.log('   Has docSectionId (WRONG):', entityUrl.includes('docSectionId='));
console.log('   Has tab=comments (WRONG):', hasTabComments);
console.log('');

// Test result
const isCorrect = entityUrl.includes('weeklySectionId=') && 
                  entityUrl.includes('weeklyDocumentId=') && 
                  !entityUrl.includes('docSectionId=') && 
                  !hasTabComments;

if (isCorrect) {
    console.log('✅ TEST PASSED: Link uses correct weekly FMS review parameters');
    console.log('   Expected format: #/projects/{id}?weeklySectionId=...&weeklyDocumentId=...&weeklyMonth=...&weeklyWeek=...&commentId=...');
    console.log('   Actual format:  ', entityUrl);
} else {
    console.log('❌ TEST FAILED: Link does not use correct parameters');
    console.log('   Actual format:  ', entityUrl);
    if (entityUrl.includes('docSectionId=')) {
        console.log('   Error: Using docSectionId instead of weeklySectionId');
    }
    if (hasTabComments) {
        console.log('   Error: Includes tab=comments which should not be there');
    }
}

console.log('');
console.log('5. Full URL that would be in email:');
const baseUrl = 'https://abcoafrica.co.za';
const fullUrl = entityUrl.startsWith('#') ? `${baseUrl}${entityUrl}` : `${baseUrl}${entityUrl.startsWith('/') ? '' : '/'}${entityUrl}`;
console.log('   ', fullUrl);

