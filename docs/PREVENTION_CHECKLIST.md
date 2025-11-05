# Component Loading Prevention Checklist

## Quick Reference for Developers

### ✅ Before Adding a New Component

1. **Document Dependencies**
   - [ ] List all required components at the top of your file
   - [ ] Add dependencies to `COMPONENT_DEPENDENCIES` in `componentDependencyChecker.js`
   - [ ] Update `docs/COMPONENT_DEPENDENCIES.md` with your component's dependencies

2. **Check Dependencies Before Use**
   - [ ] Always check `if (window.ComponentName)` before using
   - [ ] Show a loading state if component isn't available
   - [ ] Use `window.waitForComponent()` if needed

3. **Register Component Properly**
   - [ ] Register on window: `window.MyComponent = MyComponent`
   - [ ] Dispatch event: `window.dispatchEvent(new CustomEvent('componentLoaded', { detail: { component: 'MyComponent' } }))`
   - [ ] Add console log: `console.log('✅ MyComponent component registered')`

4. **Add to Lazy Loader**
   - [ ] Add component to `lazy-load-components.js` in correct order
   - [ ] Dependencies MUST come before components that use them
   - [ ] Run `npm run validate:deps` to verify order

5. **Test**
   - [ ] Test that component loads correctly
   - [ ] Test that dependent components wait properly
   - [ ] Check browser console for dependency warnings

### ✅ Before Committing

1. **Run Validation**
   ```bash
   npm run validate:deps
   ```
   - [ ] No dependency order errors

2. **Check Console**
   - [ ] No "Component not found" errors
   - [ ] All components register successfully
   - [ ] No missing dependency warnings

3. **Manual Test**
   - [ ] Navigate to the page using your component
   - [ ] Verify component renders correctly
   - [ ] Check that loading states work

### ✅ Common Issues & Fixes

**Issue: "Component not found" error**
- ✅ Fix: Check that component is registered on `window`
- ✅ Fix: Verify component loads before it's used
- ✅ Fix: Add dependency check before using component

**Issue: Component loads but dependencies missing**
- ✅ Fix: Update `lazy-load-components.js` load order
- ✅ Fix: Run `npm run validate:deps` to verify order
- ✅ Fix: Add dependencies to early load in `index.html` if critical

**Issue: Component registers but doesn't work**
- ✅ Fix: Check console for JavaScript errors in component file
- ✅ Fix: Verify all dependencies of the component are loaded
- ✅ Fix: Check that component file is built correctly

### 📚 Resources

- Full guide: `docs/COMPONENT_DEPENDENCIES.md`
- Runtime checker: `src/utils/componentDependencyChecker.js`
- Build validator: `scripts/validate-component-deps.js`

### 🆘 Need Help?

1. Check `docs/COMPONENT_DEPENDENCIES.md` for examples
2. Run `npm run validate:deps` to find dependency issues
3. Check browser console for dependency warnings
4. Use `window.checkComponentDependencies('ComponentName')` in console
