#!/usr/bin/env node
// Test script to check the leads/[id] endpoint

const leadId = 'c56d932babacbb86cab2c2b30';
const baseUrl = process.env.API_BASE || 'http://localhost:3000';

async function testLeadEndpoint() {
  console.log(`🧪 Testing lead endpoint for ID: ${leadId}`);
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log('');
  
  try {
    const url = `${baseUrl}/api/leads/${leadId}`;
    console.log(`🔗 Request URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: This will fail auth, but we'll see the error structure
      }
    });
    
    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log(`📄 Response Body:`, text);
    
    try {
      const json = JSON.parse(text);
      console.log(`✅ Parsed JSON:`, JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(`⚠️ Response is not valid JSON`);
    }
    
  } catch (error) {
    console.error(`❌ Request failed:`, error.message);
    console.error(`❌ Error stack:`, error.stack);
  }
}

testLeadEndpoint();

