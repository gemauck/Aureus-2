# Mobile Form Testing Guide

## Quick Test Methods

### Method 1: Using the Test Page (Easiest)

1. **Open the test page in your browser:**
   ```
   http://localhost:3000/test-mobile-form.html
   ```

2. **Open Browser DevTools:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Click the device toolbar icon (phone icon) or press `Cmd+Shift+M` / `Ctrl+Shift+M`

3. **Select a mobile device:**
   - iPhone SE (375x667) - smallest common iPhone
   - iPhone 14 Pro (393x852)
   - Samsung Galaxy S20 (360x800)

4. **Test the form:**
   - Click "New Client Form" to test creating a new client
   - Click "Edit Client Form" to test editing an existing client
   - Try all form fields:
     - Text inputs (Company Name, Address, Website)
     - Select dropdowns (Industry, Status)
     - Textarea (Notes)
     - Date pickers
     - Add/remove contacts, sites, opportunities

### Method 2: Test in the Actual App

1. **Start the server** (if not running):
   ```bash
   npm run dev
   ```

2. **Open the app:**
   ```
   http://localhost:3000
   ```

3. **Navigate to Clients page:**
   - Click on "Clients" in the sidebar
   - Click "Add Client" or click on an existing client

4. **Open DevTools and enable mobile view:**
   - Press `F12`
   - Click device toolbar icon
   - Select a mobile device size

5. **Test the form:**
   - Fill out all fields
   - Test all tabs (Overview, Contacts, Sites, Opportunities, Projects)
   - Test adding/removing items
   - Test saving

## What to Test ✅

### Form Inputs
- [ ] **Input fields are large enough** (minimum 48px height)
- [ ] **No zoom on iPhone** when focusing inputs (font-size should be 16px+)
- [ ] **Labels are readable** and properly spaced
- [ ] **All fields stack vertically** (single column on mobile)
- [ ] **Spacing between fields is good** (16px minimum)

### Form Controls
- [ ] **Text inputs** work correctly
- [ ] **Select dropdowns** open and work properly
- [ ] **Date pickers** open correctly on mobile
- [ ] **Textareas** are properly sized
- [ ] **Checkboxes/Radios** are large enough to tap (28px minimum)

### Modal Behavior
- [ ] **Modal goes fullscreen** on mobile
- [ ] **Header stays at top** when scrolling
- [ ] **Content scrolls smoothly**
- [ ] **Action buttons stay at bottom**
- [ ] **Close button is accessible**
- [ ] **No horizontal scrolling**

### Tabs
- [ ] **Tabs are easy to tap**
- [ ] **Tab switching works smoothly**
- [ ] **Active tab is clearly indicated**
- [ ] **Tabs scroll horizontally** if needed

### Add/Remove Items
- [ ] **Add Contact form** works
- [ ] **Add Site form** works
- [ ] **Add Opportunity form** works
- [ ] **Remove buttons** work correctly
- [ ] **Form validation** works (required fields)

### Dark Mode
- [ ] **Toggle dark mode** works
- [ ] **All form elements are readable** in dark mode
- [ ] **No white flashes** when switching

### Different Screen Sizes
Test on these widths:
- [ ] **350px** (extreme small)
- [ ] **375px** (iPhone SE)
- [ ] **393px** (iPhone 14 Pro)
- [ ] **640px** (compact)
- [ ] **768px** (tablet portrait)

## Common Issues to Check

### Issue: Input causes zoom on iPhone
**Fix:** Check that font-size is 16px minimum
```css
input { font-size: 16px !important; }
```

### Issue: Horizontal scrolling
**Debug:**
```javascript
document.querySelectorAll('*').forEach(el => {
  if (el.scrollWidth > el.clientWidth) {
    console.log('Overflow:', el);
  }
});
```

### Issue: Modal not fullscreen
**Check:** Modal should have `position: fixed` and `inset-0`

### Issue: Buttons too small
**Check:** Buttons should have `min-height: 48px`

## Browser Console Commands

```javascript
// Check current width
console.log(window.innerWidth);

// Check if mobile CSS is loaded
console.log(getComputedStyle(document.body).getPropertyValue('overflow-x'));

// Check input font size
const input = document.querySelector('input[type="text"]');
console.log(getComputedStyle(input).fontSize);

// Check button size
const button = document.querySelector('button');
console.log(getComputedStyle(button).minHeight);
```

## Testing Checklist

Before considering the mobile form complete:

- [ ] Tested on Chrome mobile emulator
- [ ] Tested on Safari mobile emulator (iPhone)
- [ ] Tested on real device (if possible)
- [ ] All form fields work correctly
- [ ] No horizontal scrolling
- [ ] No zoom on input focus (iOS)
- [ ] All buttons are tappable
- [ ] Dark mode works
- [ ] Form validation works
- [ ] Save functionality works
- [ ] All tabs work
- [ ] Add/remove items work

## Report Issues

If you find issues, note:
1. Device model and OS version
2. Browser and version
3. Screen width
4. Specific field/feature that's broken
5. Steps to reproduce
6. Screenshot if possible
7. Browser console errors

