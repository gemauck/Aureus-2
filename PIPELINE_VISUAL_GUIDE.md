# 📊 Pipeline Platform - Visual Reference Guide

## Interface Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Sales Pipeline                                    [Refresh] [+ New Deal] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Pipeline  │  │  Weighted  │  │ Avg Deal   │  │ Conversion │           │
│  │   Value    │  │  Forecast  │  │    Size    │  │    Rate    │           │
│  │            │  │            │  │            │  │            │           │
│  │ R 2.7M     │  │  R 1.2M    │  │  R 450K    │  │    45%     │           │
│  │ 15 deals   │  │  Adjusted  │  │  49d cycle │  │  Historic  │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🎯 Kanban] [📋 List] [📈 Forecast]           Sort by: [Value: High to Low]│
│                                                                               │
│  [🔍 Search] [Min Value] [Max Value] [Min Prob] [Industry ▼] [Age Range ▼] │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Kanban Board Layout

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  AWARENESS   │   INTEREST   │    DESIRE    │    ACTION    │
│     👁️       │      🔍      │      ❤️      │      🚀      │
│   7 days     │   14 days    │   21 days    │   7 days     │
├──────────────┼──────────────┼──────────────┼──────────────┤
│   📊 Stats   │  📊 Stats    │  📊 Stats    │  📊 Stats    │
│ Total: R500K │ Total: R750K │ Total: R1.2M │ Total: R325K │
│ Weighted:    │ Weighted:    │ Weighted:    │ Weighted:    │
│ R 150K       │ R 375K       │ R 840K       │ R 292K       │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │
│  │ Deal 1 │  │  │ Deal 4 │  │  │ Deal 7 │  │  │ Deal 10│  │
│  │ [LEAD] │  │  │ [LEAD] │  │  │  [OPP] │  │  │ [LEAD] │  │
│  │👤 John │  │  │👤 Sarah│  │  │🏢 ABC  │  │  │👤 Mike │  │
│  │R 450K  │  │  │R 750K  │  │  │R 1.2M  │  │  │R 325K  │  │
│  │  30%   │  │  │  50%   │  │  │  70%   │  │  │  90%   │  │
│  │  5d    │  │  │  12d   │  │  │  25d   │  │  │  3d    │  │
│  └────────┘  │  └────────┘  │  └────────┘  │  └────────┘  │
│              │              │              │              │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │              │
│  │ Deal 2 │  │  │ Deal 5 │  │  │ Deal 8 │  │              │
│  └────────┘  │  └────────┘  │  └────────┘  │              │
│              │              │              │              │
│  ┌────────┐  │  ┌────────┐  │              │              │
│  │ Deal 3 │  │  │ Deal 6 │  │              │              │
│  └────────┘  │  └────────┘  │              │              │
│              │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
     Drag cards between columns to update stage →
```

---

## Deal Card Anatomy

```
┌─────────────────────────────────────────┐
│  TransLogix Fleet Upgrade        [LEAD] │  ← Name + Type Badge
│  ───────────────────────────────────── │
│  👤 Nomsa Dlamini                       │  ← Contact
│                                         │
│  R 750,000                        50%   │  ← Value + Probability
│  ─────────────────────────────────────  │
│  🧮 Weighted: R 375,000                 │  ← Calculated Weight
│                                         │
│  [12d]                   Forestry       │  ← Age + Industry
│  ─────────────────────────────────────  │
│  📅 Close: 2024-04-15                   │  ← Expected Close
└─────────────────────────────────────────┘
```

### Badge Colors
- **LEAD** (Blue): New prospect
- **OPP** (Green): Existing client expansion

### Age Badge Colors
- 🟢 **Green** (≤7d): Fresh, new deal
- 🔵 **Blue** (8-30d): Active, on track
- 🟡 **Yellow** (31-60d): Aging, needs attention
- 🔴 **Red** (>60d): Stale, urgent action needed

### Probability Badge Colors
- 🟢 **Green** (≥70%): High confidence
- 🟡 **Yellow** (40-69%): Medium confidence
- ⚪ **Gray** (<40%): Low confidence

---

## List View Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Deal Name         │ Type   │ Stage    │ Value   │ Prob │ Weighted │ Age │ Close Date  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ TransLogix        │ [LEAD] │ Interest │ R 750K  │ 50%  │ R 375K   │ 12d │ 2024-04-15  │
│ 👤 Nomsa Dlamini  │        │          │         │      │          │     │             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Coastal Mining    │ [LEAD] │ Desire   │ R 1.2M  │ 70%  │ R 840K   │ 25d │ 2024-04-20  │
│ 👤 David van der  │        │          │         │      │          │     │             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Express Couriers  │ [LEAD] │ Action   │ R 325K  │ 90%  │ R 292K   │ 3d  │ 2024-04-11  │
│ 👤 Sarah Mthembu  │        │          │         │      │          │     │             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Forecast View Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Month Summary                                              │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│   MARCH     │    APRIL    │     MAY     │                 │
│             │             │             │                 │
│  R 450K     │   R 875K    │   R 320K    │  ← Weighted     │
│  3 deals    │   5 deals   │   2 deals   │  ← Count        │
│  R 600K     │   R 1.1M    │   R 450K    │  ← Pipeline     │
└─────────────┴─────────────┴─────────────┴─────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  📅 MARCH 2024                                              │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Express Couriers               R 325K │ 90% │ R 292K │  │
│  │ Action • Lead                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ABC Corp Expansion             R 200K │ 80% │ R 160K │  │
│  │ Desire • Opportunity                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Filter Bar Detail

```
┌───────────────────────────────────────────────────────────────────┐
│  🔍 Search deals...  │ Min: [____] │ Max: [____] │ Prob: [___%] │
│                                                                   │
│  Industry: [All Industries ▼] │ Age: [All Ages ▼]                │
└───────────────────────────────────────────────────────────────────┘

Active Filters:
┌───────────────────────────────────────────────────────────────────┐
│  12 of 15 deals shown                    [Clear all filters]      │
└───────────────────────────────────────────────────────────────────┘
```

---

## Drag and Drop Flow

```
Step 1: Select Card          Step 2: Drag to Target      Step 3: Drop & Update
┌──────────┐                ┌──────────┐                ┌──────────┐
│ Deal A   │ ────────────→  │          │ ────────────→  │ Deal A   │
│ [LEAD]   │   Click+Hold   │ [GHOST]  │   Release      │ [LEAD]   │
│👤 John   │                │👤 John   │                │👤 John   │
│R 450K    │                │R 450K    │                │R 450K    │
│  30%     │                │  30%     │                │  30%     │
│  5d      │                │  5d      │                │  5d      │
└──────────┘                └──────────┘                └──────────┘
Awareness                    Interest                   Interest
                            (highlighted)               (updated!)
```

---

## Stage Progression Guide

```
        Initial           Engaged          Qualified        Closing
          👁️               🔍                ❤️              🚀
     AWARENESS    →    INTEREST     →     DESIRE      →    ACTION
   ─────────────────────────────────────────────────────────────────
   │ First       │  │ Demo        │  │ Proposal    │  │ Contract   │
   │ Contact     │  │ Scheduled   │  │ Submitted   │  │ Negotiation│
   │             │  │             │  │             │  │            │
   │ 10-30%      │  │ 30-50%      │  │ 50-80%      │  │ 80-95%     │
   │ Prob        │  │ Prob        │  │ Prob        │  │ Prob       │
   │             │  │             │  │             │  │            │
   │ 7 days      │  │ 14 days     │  │ 21 days     │  │ 7 days     │
   │ avg         │  │ avg         │  │ avg         │  │ avg        │
   └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘
```

---

## Metrics Dashboard Explained

```
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE VALUE         WEIGHTED FORECAST                       │
│  R 2,775,000           R 1,207,500                             │
│  ────────────           ──────────                              │
│  15 deals               Probability-adjusted                    │
│                                                                  │
│  This is your          This is what you're                     │
│  total possible        likely to close based                   │
│  revenue if ALL        on deal probabilities                   │
│  deals close                                                    │
└─────────────────────────────────────────────────────────────────┘

Calculation Example:
┌────────────────────────────────────────┐
│ Deal 1: R 750,000 × 50% = R 375,000    │
│ Deal 2: R 325,000 × 90% = R 292,500    │
│ Deal 3: R 1.2M × 70%    = R 840,000    │
│ ──────────────────────────────────────  │
│ Weighted Total:         R 1,507,500    │
└────────────────────────────────────────┘
```

---

## Color Coding Reference

### Type Badges
```
[LEAD] - Blue background, blue text
[OPP]  - Green background, green text
```

### Probability Indicators
```
≥70%  🟢 Green   - High confidence
40-69% 🟡 Yellow  - Medium confidence
<40%  ⚪ Gray    - Low confidence
```

### Age Indicators
```
≤7d    🟢 Green   - Fresh
8-30d  🔵 Blue    - Active
31-60d 🟡 Yellow  - Aging
>60d   🔴 Red     - Stale
```

### Stage Colors
```
Awareness  ⚪ Gray    - Cold/New
Interest   🔵 Blue    - Warming up
Desire     🟡 Yellow  - Hot
Action     🟢 Green   - Very hot
```

---

## Common Views & Scenarios

### 1. Sales Manager Daily Review
```
View: Kanban
Sort: Value (High to Low)
Filter: None
Goal: See overall pipeline health
```

### 2. Finding Hot Deals
```
View: List
Sort: Probability (High to Low)
Filter: Min Prob = 70%, Stage = Desire or Action
Goal: Focus on closing deals
```

### 3. Rescue Stale Deals
```
View: List
Sort: Date (Oldest First)
Filter: Age Range = Stale (>60d)
Goal: Re-engage or disqualify
```

### 4. Monthly Planning
```
View: Forecast
Sort: N/A
Filter: None
Goal: Predict revenue by month
```

### 5. Industry Focus
```
View: Kanban
Sort: Value (High to Low)
Filter: Industry = Mining
Goal: Target specific sector
```

---

## Mobile-Friendly Tips

While primarily desktop-optimized, the Pipeline works on tablets:

```
Portrait Mode:                    Landscape Mode:
┌────────────┐                   ┌────────────────────────────┐
│ Awareness  │                   │ Aware │ Int │ Des │ Action │
│ ────────── │                   │ ────────────────────────── │
│  [Deal 1]  │  Better →        │ Deal1  Deal3  Deal5  Deal7 │
│  [Deal 2]  │                   │ Deal2  Deal4  Deal6        │
│            │                   │                            │
│ ▼ Scroll   │                   │  ← → Swipe                 │
└────────────┘                   └────────────────────────────┘
```

**Recommendation**: Use desktop/laptop for best experience with drag-and-drop.

---

## Keyboard Shortcuts (Future Feature)

Planned shortcuts for faster navigation:

```
1-4     → Jump to stage (1=Awareness, 2=Interest, 3=Desire, 4=Action)
/       → Focus search
Esc     → Clear filters
K       → Toggle Kanban view
L       → Toggle List view
F       → Toggle Forecast view
R       → Refresh data
N       → New deal (navigate to CRM)
```

---

## Print-Friendly Views

For reports and presentations:

```
                SALES PIPELINE SNAPSHOT
                ═══════════════════════
                   October 15, 2024

Total Pipeline:     R 2,775,000 (15 deals)
Weighted Forecast:  R 1,207,500
Avg Deal Size:      R 185,000

STAGE BREAKDOWN:
────────────────────────────────────────────
Awareness    4 deals    R 600K    R 180K wtd
Interest     5 deals    R 750K    R 375K wtd
Desire       4 deals    R 1.2M    R 840K wtd  
Action       2 deals    R 325K    R 292K wtd
────────────────────────────────────────────
```

---

## Integration Points

```
                    ┌──────────────┐
                    │   PIPELINE   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌─────────┐      ┌──────────┐
    │  LEADS  │      │ CLIENTS │      │ PROJECTS │
    │ Module  │      │ Module  │      │  Module  │
    └─────────┘      └─────────┘      └──────────┘
         │                 │                 │
         └────────────┬────┴─────────────────┘
                      │
                      ▼
              ┌──────────────┐
              │ localStorage │
              └──────────────┘
```

---

*Use this visual guide as a quick reference when training users or troubleshooting!*
