# 🎯 Quick Test Reference Card

## 🚀 START HERE

**File to Open:** `/Users/gemau/Documents/Project ERP/abcotronics-erp-modular/index.html`

**Login:** admin / password123

**Go to:** Click "Invoicing" in sidebar

---

## ⚡ 5-Minute Quick Test

### 1. Create Multi-Currency Invoice (1 min)
- Create Invoice → Select USD → Rate: 18.50 → Add item → Save

### 2. Test Batch Actions (30 sec)
- Check 2 invoices → Batch Actions → Mark as Sent

### 3. Record Deposit (1 min)
- Deposits tab → Record Deposit → R50,000 → Save

### 4. Use Template (30 sec)
- Templates → Copy any default template

### 5. Variable Tax (1 min)
- New invoice → 2 items → Uncheck taxable on one

### 6. Check Persistence (30 sec)
- Refresh browser → Verify data still there

---

## 🎨 UI Features to Observe

| Feature | Location | Look For |
|---------|----------|----------|
| Currency selector | Invoice modal | R, $, €, £ symbols |
| Tax checkboxes | Line items | Per-item toggle |
| Batch button | Invoice table | Shows count (X) |
| Deposits tab | Main tabs | 5th tab |
| Templates button | Header | Right side |
| Reminders button | Header | Right side |
| Exchange rate | Invoice modal | Below currency |
| ZAR equivalent | Invoice total | Small text |

---

## 🔢 Test Data

### Sample Invoices
```
Client: ABC Corporation
Amount: R225,000
Status: Paid

Client: XYZ Industries  
Amount: R157,500
Status: Sent

Client: Logistics Ltd
Amount: R111,600
Status: Overdue
```

### Exchange Rates
```
USD: 18.50
EUR: 19.80
GBP: 23.20
```

### Sample Line Items
```
Consulting Services | 10 hrs | R1,500 | Taxable 15%
Equipment Purchase | 1 unit | R50,000 | Taxable 15%
Training Materials | 5 items | R500 | Non-taxable
```

---

## ✅ Pass/Fail Checklist

- [ ] Multi-currency works
- [ ] Batch actions execute  
- [ ] Deposits save
- [ ] Templates insert
- [ ] Tax varies per item
- [ ] Reminders configure
- [ ] Data persists
- [ ] No console errors
- [ ] UI responsive
- [ ] Calculations correct

**Pass = 10/10 ✅**

---

## 🐛 Common Issues

| Issue | Quick Fix |
|-------|-----------|
| Blank page | Hard refresh (Ctrl+F5) |
| Can't login | Use: admin / password123 |
| No invoicing | Check sidebar, click "Invoicing" |
| Modal won't open | Check console for errors |
| Data lost | Check localStorage enabled |

---

## 📊 Quick Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Components | 15 | _____ |
| Features working | 10 | _____ |
| Console errors | 0 | _____ |
| Load time | <2s | _____ |
| Data persists | ✅ | _____ |

---

## 🎯 Critical Features

**MUST WORK:**
1. ✅ Create invoice
2. ✅ Multi-currency
3. ✅ Variable tax
4. ✅ Batch actions
5. ✅ Deposits

**NICE TO HAVE:**
6. ✅ Templates
7. ✅ Reminders
8. ✅ Reports
9. ✅ Bank rec
10. ✅ Approvals

---

## 🏁 Final Check

Before calling it complete:
- [ ] All tabs load
- [ ] All modals open
- [ ] All buttons work
- [ ] Data saves
- [ ] No errors
- [ ] Looks professional

---

## 🎊 Success!

If all checks pass:
**Status: PRODUCTION READY ✅**

---

**Print this card and keep it handy during testing!**
