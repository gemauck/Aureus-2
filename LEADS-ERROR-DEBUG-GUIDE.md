# Leads API Error Debugging Guide

## Issue
GET `/api/leads/[id]` endpoint returning 500 Internal Server Error for lead ID: `c56d932babacbb86cab2c2b30`

## Changes Made

### Enhanced Error Logging
Added comprehensive logging throughout the leads/[id] endpoint:
- Request details (URL, method, params)
- User validation steps
- Query attempts and results
- Full error details (message, code, name, stack) in all catch blocks

### Improved Error Responses
Error responses now include:
- Error code and name
- Full error message
- Meta information (when available)
- Development mode includes full details

### Additional Safeguards
- ID format validation
- Prisma availability check
- Better error context in all error handlers

## How to Debug

### 1. Check Server Logs
When the error occurs, look for these log patterns:

```
🔍 [LEADS ID] GET request for lead ID: c56d932babacbb86cab2c2b30
🔍 [LEADS ID] User ID from request: ...
🔍 [LEADS ID] Request URL: ...
🔍 [LEADS ID] Attempting to query lead with ID: ...
❌ [LEADS ID] Error details for lead ID: ...
❌ [LEADS ID] Error code: ...
❌ [LEADS ID] Error name: ...
❌ [LEADS ID] Error meta: ...
```

### 2. Common Error Scenarios

#### Database Connection Error
- **Code**: P1001, P1002, P1008, P1017
- **Symptoms**: Connection timeout or refused
- **Solution**: Check database server status and network connectivity

#### Missing Column Error
- **Code**: P2022
- **Symptoms**: "Column does not exist" or "externalAgentId"
- **Solution**: The code has fallback handling, but check if migration is needed

#### Record Not Found
- **Code**: P2025
- **Symptoms**: Lead doesn't exist or wrong type
- **Solution**: Verify the lead exists and has `type: 'lead'`

#### Relation Error
- **Code**: Various
- **Symptoms**: Error when including relations (tags, externalAgent, starredBy)
- **Solution**: Code has fallback queries, but check relation integrity

### 3. Testing Locally

```bash
# Test with authentication token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/leads/c56d932babacbb86cab2c2b30
```

### 4. Production Deployment

To deploy these fixes to production:

```bash
# Commit changes
git add api/leads/[id].js
git commit -m "Fix: Enhanced error handling and logging for leads/[id] endpoint"

# Deploy to production
./deploy-to-server.sh

# Or restart production server
ssh root@abcoafrica.co.za "cd /var/www/abcotronics-erp && pm2 restart abcotronics-erp"
```

### 5. Check Production Logs

```bash
# SSH into production server
ssh root@abcoafrica.co.za

# Check PM2 logs
pm2 logs abcotronics-erp --lines 100

# Or check system logs
tail -f /var/log/nginx/error.log
```

## Expected Log Output

When working correctly:
```
📥 [LEADS ID] GET /api/leads/c56d932babacbb86cab2c2b30 - Starting handler
🔍 [LEADS ID] Extracted ID: c56d932babacbb86cab2c2b30
🔍 [LEADS ID] GET request for lead ID: c56d932babacbb86cab2c2b30
🔍 [LEADS ID] User ID from request: ...
✅ [LEADS ID] User ... validated
🔍 [LEADS ID] Attempting to query lead with ID: c56d932babacbb86cab2c2b30
🔍 [LEADS ID] Query result: Found
✅ [LEADS ID] Successfully retrieved lead c56d932babacbb86cab2c2b30
```

When error occurs:
```
❌ [LEADS ID] Error details for lead ID: c56d932babacbb86cab2c2b30
❌ [LEADS ID] Error code: P2025
❌ [LEADS ID] Error name: PrismaClientKnownRequestError
❌ [LEADS ID] Error meta: {...}
❌ [LEADS ID] Error stack: ...
```

## Next Steps

1. **Deploy to Production**: The enhanced logging will help identify the root cause
2. **Monitor Logs**: Watch production logs when the error occurs again
3. **Fix Root Cause**: Once identified, apply the specific fix needed

## Files Modified

- `api/leads/[id].js` - Enhanced error handling and logging


