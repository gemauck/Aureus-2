# Signature Canvas Testing Guide

## Quick Browser Test

### 1. Open the Job Card Form
Navigate to: `http://localhost:3000/job-card` (or your server URL)

### 2. Navigate to Signature Step
- Fill in required fields (Technician, Client)
- Click through steps until you reach "Customer Sign-off" step

### 3. Test Signature Canvas

#### Desktop Browser (Mouse)
- Click and drag on the signature canvas
- Signature should appear as you draw
- Test "Clear signature" button
- Try submitting without signature (should show error)
- Try submitting with signature (should work)

#### Mobile Browser / Touch Device
- Touch and drag on the signature canvas
- Signature should appear smoothly
- No page scrolling should occur while drawing
- Test with finger and stylus if available

## Browser Console Testing

Open browser DevTools (F12) and run these tests:

### Test 1: Check Canvas Element
```javascript
const canvas = document.querySelector('.signature-canvas');
console.log('Canvas found:', !!canvas);
console.log('Canvas dimensions:', canvas?.width, 'x', canvas?.height);
console.log('Canvas style:', window.getComputedStyle(canvas));
```

### Test 2: Check Event Listeners
```javascript
const canvas = document.querySelector('.signature-canvas');
const listeners = getEventListeners(canvas);
console.log('Event listeners:', listeners);
```

### Test 3: Simulate Touch Events (Desktop)
```javascript
const canvas = document.querySelector('.signature-canvas');
if (!canvas) {
  console.error('Canvas not found! Navigate to signature step first.');
} else {
  // Simulate touch start
  const touchStart = new TouchEvent('touchstart', {
    touches: [new Touch({
      identifier: 1,
      target: canvas,
      clientX: 100,
      clientY: 100,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 0,
      force: 0.5
    })],
    cancelable: true,
    bubbles: true
  });
  canvas.dispatchEvent(touchStart);
  
  // Simulate touch move
  const touchMove = new TouchEvent('touchmove', {
    touches: [new Touch({
      identifier: 1,
      target: canvas,
      clientX: 150,
      clientY: 120,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 0,
      force: 0.5
    })],
    cancelable: true,
    bubbles: true
  });
  canvas.dispatchEvent(touchMove);
  
  // Simulate touch end
  const touchEnd = new TouchEvent('touchend', {
    changedTouches: [new Touch({
      identifier: 1,
      target: canvas,
      clientX: 200,
      clientY: 140,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 0,
      force: 0
    })],
    cancelable: true,
    bubbles: true
  });
  canvas.dispatchEvent(touchEnd);
  
  console.log('✅ Touch events dispatched');
}
```

### Test 4: Check Canvas Content
```javascript
const canvas = document.querySelector('.signature-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hasContent = imageData.data.some((channel, index) => {
    return index % 4 === 3 && channel < 255; // Check alpha channel
  });
  console.log('Canvas has content:', hasContent);
  console.log('Canvas data URL:', canvas.toDataURL('image/png').substring(0, 50) + '...');
}
```

### Test 5: Test Signature Validation
```javascript
// Check if signature is required
const canvas = document.querySelector('.signature-canvas');
const submitButton = document.querySelector('button[type="submit"]');
if (canvas && submitButton) {
  // Try to submit without signature
  submitButton.click();
  // Check for error message
  setTimeout(() => {
    const error = document.querySelector('.text-red-700, .bg-red-50');
    console.log('Error shown:', !!error);
    if (error) {
      console.log('Error message:', error.textContent);
    }
  }, 100);
}
```

## Chrome DevTools Mobile Simulation

1. Open Chrome DevTools (F12)
2. Click the device toolbar icon (Ctrl+Shift+M)
3. Select "iPhone" or "iPad" from device list
4. Test signature with mouse (will simulate touch)
5. Check "Network" tab to see if events fire

## Firefox Responsive Design Mode

1. Open Firefox DevTools (F12)
2. Click responsive design mode (Ctrl+Shift+M)
3. Select mobile device
4. Test signature functionality

## Safari Web Inspector (for iOS testing)

1. On iPhone: Settings → Safari → Advanced → Web Inspector (enable)
2. Connect iPhone to Mac
3. On Mac Safari: Develop → [Your iPhone] → [Page]
4. Test signature and inspect events

## Common Issues & Solutions

### Issue: Signature not appearing
**Check:**
- Canvas element exists: `document.querySelector('.signature-canvas')`
- Canvas has proper dimensions
- Event listeners are attached
- No JavaScript errors in console

**Fix:**
- Ensure you're on the "Customer Sign-off" step
- Check browser console for errors
- Try refreshing the page

### Issue: Page scrolls while drawing
**Check:**
- `touch-action: none` is applied
- Event preventDefault is working

**Fix:**
- Check CSS: `canvas.style.touchAction === 'none'`
- Verify event handlers call `preventDefault()`

### Issue: Signature not saving
**Check:**
- Signature canvas has content
- Form validation passes
- localStorage is accessible

**Fix:**
- Draw a signature first
- Check browser console for errors
- Verify localStorage is enabled

## Automated Test Script

Run this in browser console to test everything:

```javascript
(async function testSignature() {
  console.log('🧪 Starting signature canvas tests...');
  
  // Wait for form to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Navigate to signature step (if not already there)
  const signoffStep = document.querySelector('[data-step="signoff"]');
  if (signoffStep) {
    signoffStep.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const canvas = document.querySelector('.signature-canvas');
  if (!canvas) {
    console.error('❌ Canvas not found!');
    return;
  }
  
  console.log('✅ Canvas found');
  console.log('   Dimensions:', canvas.width, 'x', canvas.height);
  console.log('   Style touch-action:', window.getComputedStyle(canvas).touchAction);
  
  // Test mouse drawing
  console.log('🖱️ Testing mouse events...');
  const mouseDown = new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true });
  const mouseMove = new MouseEvent('mousemove', { clientX: 100, clientY: 60, bubbles: true });
  const mouseUp = new MouseEvent('mouseup', { clientX: 150, clientY: 70, bubbles: true });
  
  canvas.dispatchEvent(mouseDown);
  canvas.dispatchEvent(mouseMove);
  canvas.dispatchEvent(mouseUp);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check if content was drawn
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hasContent = imageData.data.some((channel, index) => {
    return index % 4 === 3 && channel < 255;
  });
  
  console.log(hasContent ? '✅ Signature drawn successfully' : '❌ No signature content detected');
  
  // Test clear button
  const clearButton = document.querySelector('button:contains("Clear")');
  if (clearButton) {
    console.log('🧹 Testing clear button...');
    clearButton.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('✅ Clear button clicked');
  }
  
  console.log('✅ Tests complete!');
})();
```

## Expected Behavior

✅ **Working correctly:**
- Signature appears immediately when drawing
- Smooth drawing without lag
- No page scrolling while drawing
- Clear button removes signature
- Form validates signature before submission
- Signature is saved with job card

❌ **Not working:**
- No signature appears when drawing
- Page scrolls while trying to draw
- Signature disappears when lifting finger/mouse
- Form submits without signature
- Clear button doesn't work

## Reporting Issues

If signature doesn't work, include:
1. Browser and version
2. Device type (desktop/mobile)
3. Console errors (if any)
4. Steps to reproduce
5. Screenshot of signature canvas





