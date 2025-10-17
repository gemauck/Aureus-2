# 🧪 ERP Testing Guide

## 🚀 Quick Start - Running the Application

### Method 1: Run Complete ERP System

1. **Navigate to the modular folder:**
   ```bash
   cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
   ```

2. **Open index.html in your browser:**
   - **Mac:** `open index.html`
   - **Or:** Double-click the file
   - **Or:** Right-click → Open With → Browser

3. **Login Credentials:**
   - **Username:** admin / user / manager
   - **Password:** password123
   - (Check AuthProvider.jsx for more credentials)

4. **Navigate to Invoicing:**
   - Click "Invoicing" in the sidebar
   - All new features are live!

---

## ✅ Feature Test Scenarios

### Test 1: Multi-Currency Invoice
**Time: 3 minutes**

1. Click "Create Invoice"
2. Select **USD** from currency dropdown
3. Enter exchange rate: **18.50**
4. Select a client
5. Add line item: "Consulting Services", Qty: 10, Rate: 100
6. Notice:
   - Amount shows as $1,000
   - Tax calculates as $0 (USD has no VAT)
   - Total shown in both USD and ZAR equivalent
7. Save invoice

✅ **Expected:** Invoice created with USD currency, exchange rate stored

---

### Test 2: Batch Invoice Actions
**Time: 2 minutes**

1. Check the boxes next to 2-3 invoices
2. Notice "Batch Actions (X)" button appears
3. Click the button
4. Select "Mark as Sent"
5. Click "Execute Action"

✅ **Expected:** All selected invoices updated to "Sent" status

---

### Test 3: Record a Deposit
**Time: 2 minutes**

1. Click "Deposits" tab
2. Click "Record Deposit"
3. Select a client
4. Enter amount: **R50,000**
5. Select "Retainer" type
6. Optionally apply to an invoice
7. Save

✅ **Expected:** Deposit appears in table, invoice balance reduced if applied

---

### Test 4: Create Notes Template
**Time: 2 minutes**

1. Click "Templates" button in header
2. Click "New Template"
3. Enter:
   - Name: "My Payment Terms"
   - Category: Payment Terms
   - Content: "Payment due within 15 days. Thank you!"
4. Save template
5. Create a new invoice
6. Click "Insert Template" in notes section
7. Select your template

✅ **Expected:** Template text inserted into invoice notes

---

### Test 5: Variable Tax Rates
**Time: 2 minutes**

1. Create new invoice
2. Add first line item:
   - Description: "Taxable Service"
   - Keep "Taxable" checked
   - Tax rate: 15%
3. Add second line item:
   - Description: "Tax-Exempt Service"
   - Uncheck "Taxable" box
4. Add third line item:
   - Description: "Reduced Rate"
   - Keep "Taxable" checked
   - Change tax to 7%

✅ **Expected:** Each item calculates tax correctly, total tax is accurate

---

### Test 6: Payment Reminders Setup
**Time: 2 minutes**

1. Click "Reminders" button
2. Enable automated reminders
3. Check "7 days before due"
4. Check "On due date"
5. Check "7 days after (overdue)"
6. Enable "Auto-send"
7. Save settings

✅ **Expected:** Settings saved, preview updates

---

### Test 7: Invoice with Multiple Features
**Time: 5 minutes**

**Create a complete invoice using all features:**

1. Click "Create Invoice"
2. Select **EUR** currency
3. Set exchange rate: **19.80**
4. Select client: "ABC Corporation"
5. Select project (if available)
6. Add 3 line items:
   - "Consulting": 10 hrs @ €100 (taxable, 0%)
   - "Equipment": 1 @ €500 (taxable, 21%)
   - "Training": 5 hrs @ €80 (non-taxable)
7. Click "Insert Template" → select payment terms
8. Save as Draft
9. Reopen the invoice
10. Change status to "Sent"
11. Save

✅ **Expected:** 
- Multi-currency works
- Tax calculates correctly
- Template inserted
- Can edit and update

---

### Test 8: Deposits Workflow
**Time: 3 minutes**

**Full deposit lifecycle:**

1. Create invoice for R100,000 (don't apply deposit yet)
2. Go to Deposits tab
3. Record deposit: R30,000
4. Don't apply to invoice yet
5. Note deposit shows as "Unapplied"
6. Edit the invoice
7. Record a payment of R30,000
8. Check Deposits tab - status changes to "Applied"

✅ **Expected:** Deposit tracking works, status updates correctly

---

### Test 9: Batch Download (Simulated)
**Time: 1 minute**

1. Select 3+ invoices
2. Open Batch Actions
3. Select "Download PDFs"
4. Click Execute

✅ **Expected:** Alert shows download would happen (actual PDF generation requires backend)

---

### Test 10: Data Persistence
**Time: 1 minute**

1. Create an invoice with custom currency
2. Create a deposit
3. Create a notes template
4. **Refresh the browser page**
5. Navigate back to Invoicing

✅ **Expected:** All data still present (stored in localStorage)

---

## 🔍 What to Look For

### Visual Indicators
- ✅ Currency symbols change (R, $, €, £)
- ✅ Batch actions button only shows when items selected
- ✅ Tax checkboxes per line item
- ✅ Exchange rate field for non-ZAR currencies
- ✅ Deposits tab in main navigation
- ✅ Template insert button in invoice modal
- ✅ ZAR equivalent shown for foreign currencies

### Functionality
- ✅ All modals open and close
- ✅ Forms validate input
- ✅ Calculations are accurate
- ✅ Data saves to localStorage
- ✅ Status colors update
- ✅ Filters work
- ✅ Search works

### Data Integrity
- ✅ Invoices save with all fields
- ✅ Deposits link to invoices
- ✅ Templates reusable
- ✅ Settings persist
- ✅ No console errors

---

## 🐛 Common Issues & Solutions

### Issue: "Module not found"
**Solution:** Make sure you're opening the file from `abcotronics-erp-modular` folder

### Issue: Blank page
**Solution:** 
- Check browser console (F12) for errors
- Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)
- Try clearing cache and reload

### Issue: Data not persisting
**Solution:**
- Check browser allows localStorage
- Not in private/incognito mode
- Clear and try again

### Issue: Layout broken
**Solution:**
- Ensure internet connection (Tailwind CSS loads from CDN)
- Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

### Issue: Invoice modal doesn't open
**Solution:**
- Check browser console for errors
- Verify all component files exist in `/src/components/invoicing/`

---

## 📊 Test Results Template

Copy this and fill in as you test:

```
## Test Results - [Date]

### Environment
- Browser: _____________
- OS: _____________
- Screen Size: _____________

### Feature Tests
- [ ] Multi-Currency: PASS / FAIL / NOTES: ___________
- [ ] Batch Actions: PASS / FAIL / NOTES: ___________
- [ ] Deposits: PASS / FAIL / NOTES: ___________
- [ ] Notes Templates: PASS / FAIL / NOTES: ___________
- [ ] Variable Tax: PASS / FAIL / NOTES: ___________
- [ ] Reminders: PASS / FAIL / NOTES: ___________
- [ ] Data Persistence: PASS / FAIL / NOTES: ___________

### Issues Found
1. _____________
2. _____________
3. _____________

### Overall Rating: ___/10

### Recommendation: READY / NEEDS WORK / BLOCKED
```

---

## 🎯 Performance Checklist

- [ ] App loads within 2 seconds
- [ ] Invoice modal opens instantly
- [ ] Calculations are instant
- [ ] No lag when typing
- [ ] Smooth animations
- [ ] Table scrolling smooth
- [ ] No memory leaks (check with DevTools)

---

## 🔒 Security Checklist

- [ ] Login required
- [ ] Session management works
- [ ] Logout clears data
- [ ] No sensitive data in console
- [ ] localStorage encrypted (future)
- [ ] XSS prevention (React handles this)

---

## 📱 Responsive Testing

Test on different screen sizes:
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768px)
- [ ] Mobile (375px)

---

## 💡 Tips for Testing

1. **Use Browser DevTools** (F12)
   - Check Console for errors
   - Inspect Network requests
   - Monitor localStorage

2. **Test Edge Cases**
   - Empty states
   - Large numbers
   - Special characters
   - Very long descriptions

3. **Test User Flows**
   - Complete workflows
   - Back and forth navigation
   - Multiple opens/closes

4. **Document Everything**
   - Take screenshots
   - Note what works
   - Record issues

---

## 🎊 Success Criteria

The system is ready when:
- ✅ All 10 test scenarios pass
- ✅ No console errors
- ✅ Data persists correctly
- ✅ UI is responsive
- ✅ Calculations accurate
- ✅ User experience smooth

---

## 📞 Next Steps After Testing

1. **If issues found:**
   - Document them
   - Report with details
   - Retest after fixes

2. **If all tests pass:**
   - Mark as production-ready
   - Train users
   - Deploy to production

3. **For enhancements:**
   - Collect user feedback
   - Prioritize features
   - Plan next iteration

---

**Happy Testing! 🚀**

Last Updated: October 2025
