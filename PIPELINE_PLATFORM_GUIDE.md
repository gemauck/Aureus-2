# 🚀 Sales Pipeline Platform - Complete Guide

## Overview
The Sales Pipeline is a comprehensive platform for tracking deals through the AIDA (Awareness → Interest → Desire → Action) sales framework. It combines leads and client expansion opportunities into a unified view with drag-and-drop functionality, advanced filtering, and forecasting capabilities.

---

## 🎯 Key Features

### 1. **Three View Modes**
- **Kanban Board**: Visual drag-and-drop across AIDA stages
- **List View**: Detailed table with all deal information
- **Forecast View**: Monthly revenue projections

### 2. **AIDA Pipeline Stages**

| Stage | Icon | Description | Avg Duration |
|-------|------|-------------|--------------|
| **Awareness** | 👁️ | Initial contact made, prospect aware | 7 days |
| **Interest** | 🔍 | Actively exploring, demo scheduled | 14 days |
| **Desire** | ❤️ | Wants solution, proposal submitted | 21 days |
| **Action** | 🚀 | Ready to close, contract negotiation | 7 days |

### 3. **Pipeline Metrics Dashboard**
- **Pipeline Value**: Total value of all deals
- **Weighted Forecast**: Probability-adjusted revenue forecast
- **Avg Deal Size**: Average value per opportunity
- **Conversion Rate**: Historical win rate (when data available)

### 4. **Advanced Filtering**
Filter deals by:
- **Search**: Deal name, client name, or contact
- **Value Range**: Min/max deal values
- **Probability**: Minimum confidence level
- **Industry**: Mining, Forestry, Agriculture, Other
- **Age Range**: New (≤7d), Active (8-30d), Aging (31-60d), Stale (>60d)

### 5. **Sorting Options**
- Value (High/Low)
- Probability (High/Low)
- Date (Newest/Oldest)
- Name (A-Z/Z-A)

---

## 🎨 Kanban Board Features

### Deal Card Information
Each deal card displays:
- **Deal Name**: Primary identifier
- **Type Badge**: LEAD (blue) or OPP (green) for opportunities
- **Contact/Client**: Person or company associated
- **Value**: Deal amount in ZAR
- **Probability**: Confidence level with color coding
  - Green (≥70%): High confidence
  - Yellow (40-69%): Medium confidence
  - Gray (<40%): Low confidence
- **Weighted Value**: `Value × Probability / 100`
- **Age Badge**: Days in pipeline with color coding
  - Green (≤7d): Fresh
  - Blue (8-30d): Active
  - Yellow (31-60d): Aging
  - Red (>60d): Stale
- **Industry Tag**: Business sector
- **Expected Close Date**: Projected closing date (if set)

### Stage Metrics
Each stage column shows:
- Deal count
- Total stage value
- Weighted stage value
- Average duration in stage

### Drag & Drop
1. **Click and hold** on any deal card
2. **Drag** to target stage column
3. **Drop** to update stage
4. Card opacity reduces while dragging
5. Target column highlights with blue ring

---

## 📊 List View Features

### Columns Displayed
1. **Deal**: Name + contact/client
2. **Type**: Lead or Expansion badge
3. **Stage**: Current AIDA stage
4. **Value**: Deal amount
5. **Probability**: Confidence with color coding
6. **Weighted**: Calculated weighted value
7. **Age**: Days in pipeline
8. **Expected Close**: Projected close date

### Interactions
- **Click row**: Open deal details modal
- **Sort**: Use sort dropdown
- **Filter**: Apply multiple filters simultaneously

---

## 📈 Forecast View Features

### Monthly Projections
Shows 3-month rolling forecast:
- **Current Month**: Immediate pipeline
- **Next Month**: Forward-looking deals
- **Month After**: Extended forecast

### Forecast Cards
Each month displays:
- **Weighted Value**: Probability-adjusted revenue
- **Deal Count**: Number of deals expected to close
- **Pipeline Value**: Total possible revenue

### Deal Breakdown
- Expandable list per month
- Click deal to view details
- Shows stage and probability
- Calculates weighted contribution

---

## 🎯 Understanding Pipeline Metrics

### Pipeline Value
```
Total Value = Sum of all deal values
```
This is the "best case" scenario if all deals close.

### Weighted Forecast
```
Weighted Value = Sum of (Deal Value × Probability / 100)
```
This is the realistic forecast based on deal confidence.

**Example:**
- Deal A: R 1,000,000 at 70% = R 700,000 weighted
- Deal B: R 500,000 at 30% = R 150,000 weighted
- **Weighted Forecast: R 850,000**

### Average Deal Size
```
Avg Deal Size = Total Pipeline Value / Number of Deals
```
Helps identify deal patterns and set targets.

### Deal Age Tracking
```
Age = Current Date - Created Date (in days)
```
**Why it matters:**
- **New deals** (≤7d): Need immediate attention
- **Active deals** (8-30d): Normal progression
- **Aging deals** (31-60d): May need re-engagement
- **Stale deals** (>60d): Risk of going cold - urgent action needed

---

## 🔄 How to Use the Pipeline

### 1. **Navigate to Pipeline**
From main CRM module → Click "Pipeline" tab

### 2. **View Your Deals**
- All leads and client opportunities shown together
- Organized by AIDA stage
- Color-coded by type (Lead vs Opportunity)

### 3. **Update Deal Progress**
**Method 1 - Drag & Drop (Kanban):**
1. Find deal card
2. Drag to new stage
3. Drop to update

**Method 2 - Edit in Modal:**
1. Click deal card
2. Update stage dropdown
3. Save changes

### 4. **Filter for Focus**
Common filter scenarios:

**High-Value Deals:**
- Min Value: 500000
- Sort by: Value (High to Low)

**Hot Deals:**
- Min Probability: 70%
- Stage: Desire or Action

**Aging Deals Needing Attention:**
- Age Range: Aging (31-60d) or Stale (>60d)
- Sort by: Date (Oldest First)

**Industry-Specific:**
- Industry: Mining
- Min Value: 250000

### 5. **Track Your Forecast**
1. Switch to **Forecast View**
2. Review monthly projections
3. Identify gaps or heavy months
4. Plan resources accordingly

---

## 💡 Best Practices

### 1. **Keep Probability Updated**
Update probability as deals progress:
- **Awareness**: 10-30%
- **Interest**: 30-50%
- **Desire**: 50-80%
- **Action**: 80-95%

### 2. **Set Expected Close Dates**
Always estimate when a deal will close:
- Enables accurate forecasting
- Helps with resource planning
- Creates urgency

### 3. **Monitor Deal Age**
Review aging deals regularly:
- **Weekly**: Check deals >30 days
- **Monthly**: Review stale deals (>60 days)
- **Action**: Re-engage or disqualify

### 4. **Use Stages Correctly**

**Awareness**
- First contact made
- Prospect knows about you
- No engagement yet

**Interest**
- Active communication
- Demo scheduled/completed
- Exploring solutions

**Desire**
- Clear interest expressed
- Proposal submitted
- Budget confirmed

**Action**
- Contract negotiation
- Legal review
- Ready to close

### 5. **Regular Pipeline Reviews**
Conduct weekly reviews:
1. Check weighted forecast vs target
2. Identify deals moving slow
3. Update probabilities
4. Move stale deals to lost/won

---

## 🚨 Common Issues & Solutions

### Issue: Deals stuck in one stage
**Solution:**
- Review deal age
- Check last contact date
- Schedule follow-up action
- Update probability or move to lost

### Issue: Low weighted forecast
**Solutions:**
- Add more top-of-funnel leads
- Increase conversion rate
- Focus on larger deals
- Improve win rate

### Issue: Too many aging deals
**Solutions:**
- Set follow-up reminders
- Review qualification criteria
- Disqualify dead deals
- Re-engage with new offer

---

## 📱 Quick Actions Reference

| Action | Shortcut/Method |
|--------|-----------------|
| Add new deal | Click "New Deal" → Redirects to CRM |
| Refresh pipeline | Click "Refresh" button |
| Filter by value | Enter min/max in value fields |
| Clear all filters | Click "Clear all filters" link |
| Change view | Click Kanban/List/Forecast tabs |
| Update stage | Drag card to new column |
| View deal details | Click on deal card |
| Sort deals | Use sort dropdown |

---

## 🎓 Pipeline Terminology

**Lead**: New prospect not yet a customer
**Opportunity**: Expansion deal with existing client
**Stage**: Current position in AIDA framework
**Probability**: Confidence level (% chance of closing)
**Weighted Value**: Value × Probability ÷ 100
**Deal Age**: Days since deal was created
**Pipeline Value**: Total of all deal values
**Forecast**: Weighted value projection
**Expected Close**: Estimated closing date

---

## 🔗 Integration with CRM

The Pipeline integrates seamlessly with:
- **Clients Module**: Shows client opportunities
- **Leads Module**: Displays all leads
- **Projects**: Links completed deals to projects

**Flow:**
1. Create lead in CRM → Appears in Pipeline
2. Add opportunity to client → Shows in Pipeline
3. Move through stages → Updates in CRM
4. Close deal → Can convert to project

---

## 📈 Success Metrics to Track

### Weekly Metrics
- [ ] Total pipeline value
- [ ] Weighted forecast vs target
- [ ] Number of new deals added
- [ ] Number of deals closed
- [ ] Average deal age

### Monthly Metrics
- [ ] Conversion rate by stage
- [ ] Win rate (won / (won + lost))
- [ ] Average sales cycle duration
- [ ] Pipeline coverage ratio (Pipeline / Quota)
- [ ] Average deal size

### Quarterly Metrics
- [ ] Pipeline velocity (deals moved per week)
- [ ] Stage conversion rates
- [ ] Revenue accuracy (forecast vs actual)
- [ ] Source effectiveness

---

## 🎯 Pipeline Health Indicators

### Healthy Pipeline
✅ Weighted forecast ≥ 3x quota
✅ Balanced distribution across stages
✅ Most deals <30 days old
✅ Regular new leads added
✅ Consistent win rate

### Unhealthy Pipeline
❌ Weighted forecast < 2x quota
❌ Too many deals in one stage
❌ Many deals >60 days old
❌ No new leads being added
❌ Low probability across board

---

## 🔧 Customization Options

While using the pipeline, you can customize:
- Filter combinations (save custom views in future updates)
- Sort preferences
- View mode (Kanban, List, or Forecast)
- Display density (future feature)

---

## 📞 Support & Tips

**Need help?**
- Review this guide
- Check CRM module documentation
- Contact system administrator

**Pro Tips:**
1. Review pipeline every Monday morning
2. Update probabilities after each customer interaction
3. Set expected close dates for all deals
4. Use aging filter to find neglected deals
5. Celebrate wins and analyze losses

---

## 🚀 Next Steps

After mastering the Pipeline:
1. **Set up email templates** for each stage
2. **Create follow-up workflows** for aging deals
3. **Define stage criteria** with your team
4. **Establish review cadence** (weekly/monthly)
5. **Track metrics** to improve over time

---

*Last Updated: October 2025*
*Version: 1.0*
*Module: Sales Pipeline Platform*
