# QuickBooks Payroll Integration - Implementation Guide

## Overview
This document outlines how to implement the actual QuickBooks Online API integration for the Abcotronics ERP payroll system. The UI and data structures are already in place and ready to be connected.

---

## Current Status: ✅ Ready for API Integration

### What's Already Built:
- ✅ Complete QuickBooks sync UI modal
- ✅ Employee mapping interface
- ✅ Sync status tracking
- ✅ Connection management
- ✅ Data structures for QB data
- ✅ localStorage persistence for settings
- ✅ Visual indicators for synced records
- ✅ Placeholder API functions ready to be replaced

---

## Prerequisites

### 1. QuickBooks Developer Account
- Sign up at: https://developer.intuit.com/
- Create a new app in the Intuit Developer Dashboard
- Get your Client ID and Client Secret
- Set redirect URI (e.g., `http://localhost:3000/callback/quickbooks`)

### 2. Required QuickBooks Subscription
- QuickBooks Online Plus or Advanced
- QuickBooks Payroll add-on (Core, Premium, or Elite)

### 3. Scopes Required
```
com.intuit.quickbooks.accounting
com.intuit.quickbooks.payroll
com.intuit.quickbooks.payment
```

---

## Files to Update When Implementing

### 1. QuickBooksPayrollSync.jsx
**Location**: `src/components/hr/QuickBooksPayrollSync.jsx`

**Functions to replace**:
- `handleConnect()` - Implement OAuth flow
- `fetchQBEmployees()` - Fetch from QB API
- `handleSyncPayroll()` - Pull paycheck data
- `handleSyncAttendance()` - Push time activities

### 2. Create New Files
- `src/utils/quickbooksAuth.js` - OAuth and token management
- `src/utils/quickbooksApi.js` - API wrapper functions

---

## Step-by-Step Implementation

See the full implementation guide at the end of this document for detailed code examples.

---

## QuickBooks API Endpoints

### Employee Management
```
GET  /v3/company/{realmId}/query?query=SELECT * FROM Employee
GET  /v3/company/{realmId}/employee/{employeeId}
POST /v3/company/{realmId}/employee
```

### Payroll Data
```
GET  /v3/company/{realmId}/query?query=SELECT * FROM Paycheck
GET  /v3/company/{realmId}/paycheck/{paycheckId}
POST /v3/company/{realmId}/paycheck
```

### Time Tracking
```
GET  /v3/company/{realmId}/query?query=SELECT * FROM TimeActivity
POST /v3/company/{realmId}/timeactivity
```

---

## Data Mapping

### QuickBooks Employee → ERP Employee
```javascript
{
  Id: string,              // → Store in qbEmployeeId
  DisplayName: string,     // → name
  GivenName: string,       // First name
  FamilyName: string,      // Last name
  PrimaryEmailAddr: {
    Address: string        // → email
  },
  EmployeeNumber: string,  // → employeeNumber
  Active: boolean          // → status
}
```

### QuickBooks Paycheck → ERP Payslip
```javascript
{
  Id: string,              // → qbId
  Employee: {
    value: string          // QuickBooks employee ID
  },
  PayPeriodStart: date,    // → month (YYYY-MM)
  PayDate: date,           // → paymentDate
  TotalPay: number,        // → grossSalary
  TotalTax: number,        // → deductions.paye
  TotalOtherDeductions,    // → Other deductions
  NetPay: number           // → netSalary
}
```

---

## Testing Strategy

### Phase 1: Sandbox Testing
1. Create QuickBooks sandbox company
2. Test OAuth connection
3. Test employee fetch
4. Test payroll sync (read)

### Phase 2: Production Testing
1. Connect real QuickBooks account
2. Import 1 month of historical data
3. Verify data accuracy
4. Test bidirectional sync

### Phase 3: Monitoring
1. Set up error logging
2. Monitor sync failures
3. Track API usage vs limits

---

## Rate Limiting

**QuickBooks limits:**
- 500 requests/minute per realmId
- 1000 requests/minute per IP

**Strategy:**
- Implement throttling with 400 req/min safe margin
- Queue bulk operations
- Cache frequently accessed data

---

## Security Best Practices

1. **Token Storage**
   - NEVER store in plain localStorage in production
   - Use httpOnly cookies or encrypt tokens
   - Implement token rotation

2. **OAuth Flow**
   - Use state parameter for CSRF protection
   - Validate all callback parameters
   - Log all authentication attempts

3. **API Calls**
   - Always use HTTPS
   - Validate all input data
   - Implement request signing

4. **Backend Proxy** (Recommended)
   - Don't expose Client Secret in frontend
   - Handle token refresh server-side
   - Add rate limiting layer

---

## Error Handling

### Common Errors

| Status | Error | Solution |
|--------|-------|----------|
| 401 | Unauthorized | Refresh token |
| 429 | Rate limit | Wait 60s, retry |
| 400 | Bad request | Validate data format |
| 500 | Server error | Retry with backoff |
| 503 | Service unavailable | Wait and retry |

---

## Deployment Checklist

**Before Production:**
- [ ] QuickBooks app approved for production
- [ ] Backend proxy implemented
- [ ] Token encryption enabled
- [ ] Error logging configured
- [ ] Webhook endpoints secured
- [ ] Rate limiting implemented
- [ ] Monitoring dashboards created
- [ ] User documentation written
- [ ] Support process defined
- [ ] Backup sync process planned

---

## Resources

- **QB API Docs**: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/employee
- **OAuth Guide**: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- **Payroll API**: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/paycheck
- **Support**: developersupport@intuit.com

---

**Status**: System ready for API integration  
**Next Step**: Obtain QuickBooks developer credentials and begin OAuth implementation  
**Owner**: Development Team  
**Updated**: October 2025
