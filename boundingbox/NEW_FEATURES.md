# New Features Implemented

## 1. ✅ Fixed Bounds Validation Bug

**Problem:** The original `validateStringAsBounds()` function had incorrect JavaScript comparison operators:
```javascript
// WRONG - doesn't work in JavaScript
(-90.0 <= parseFloat(splitBounds[0]) <= 90.0)
```

**Solution:** Rewrote the function with proper validation logic:
- Checks if bounds array exists and has 4 elements
- Validates all values are numbers (not NaN)
- Checks latitude range: -90 to 90
- Checks longitude range: -180 to 180
- Ensures min < max for both lat and lng
- Clear, readable code with early returns

**Impact:** URL hash loading and bbox validation now work correctly.

---

## 2. 🌙 Dark Mode Toggle

**Features:**
- New button (🌙/☀️) in toolbar
- Toggles between light and dark themes
- Only affects UI panels and buttons (map stays normal)
- Preference saved to localStorage
- Auto-loads saved preference on page load

**What Changes in Dark Mode:**
- Info box at bottom (dark background)
- All sidebars (help, feedback, recent bboxes)
- Toolbar buttons
- Input fields and textareas
- Buttons and borders
- Text colors for better contrast
- Loading overlay

**Colors:**
- Background: #1e1e1e (dark gray)
- Secondary: #2d2d2d (lighter gray)
- Borders: #444 (medium gray)
- Text: #e0e0e0 (light gray)
- Labels: #b0b0b0 (medium light gray)
- Active: #d4d400 (bright yellow)

**Button Icons:**
- Light mode: 🌙 (moon)
- Dark mode: ☀️ (sun)

**Usage:**
1. Click 🌙 button to enable dark mode
2. Click ☀️ button to return to light mode
3. Preference persists across sessions

---

## 3. 📍 Center Point Marker

**Features:**
- Red draggable marker appears at bbox center
- Automatically shows when bbox is drawn
- Drag marker to move entire bbox
- Updates coordinates in real-time
- Removes when bbox is deleted

**Marker Appearance:**
- Red circle (12px diameter)
- White border (2px)
- Drop shadow for visibility
- Draggable cursor on hover

**Functionality:**
- Appears automatically when bbox is created/edited
- Drag to reposition entire bounding box
- Maintains bbox size while moving
- Updates all coordinate displays
- Shows toast notification on move
- Removes when bbox is deleted

**How It Works:**
1. Draw a rectangle or polygon
2. Red marker appears at center
3. Drag marker to new location
4. Entire bbox moves with it
5. Coordinates update automatically

**Technical Details:**
- Uses Leaflet divIcon for custom styling
- Calculates offset from current center
- Applies offset to all bbox corners
- Updates bounds rectangle
- Triggers coordinate recalculation
- Saves to recent bboxes

---

## Technical Implementation

### Bounds Validation Fix
- File: `js/bbox.js`
- Function: `validateStringAsBounds()`
- Lines: ~30 lines of clear validation logic
- Returns: boolean (true if valid, false otherwise)

### Dark Mode
- Files: `index.html`, `css/bbox.css`, `js/bbox.js`
- CSS Variables: All colors use CSS custom properties
- Storage: localStorage key 'darkMode'
- Toggle: Simple class addition/removal on body
- Persistence: Loads on page load

### Center Marker
- File: `js/bbox.js`
- Marker: Leaflet marker with custom divIcon
- Events: 'bounds-set', 'draw:deleted', 'dragend'
- Updates: Real-time coordinate recalculation
- Cleanup: Automatic removal on bbox delete

---

## User Benefits

1. **Bounds Validation:** No more errors when loading bboxes from URLs
2. **Dark Mode:** Comfortable viewing in low-light environments
3. **Center Marker:** Easy bbox repositioning without redrawing

---

## Browser Compatibility

All features work in modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Uses:
- CSS Variables (dark mode)
- localStorage API (preferences)
- Leaflet API (marker)
- ES6+ JavaScript

---

## Future Enhancements

Potential improvements:
- Auto dark mode based on system preference
- Custom marker colors
- Marker tooltip showing coordinates
- Keyboard shortcuts for marker movement
- Multiple markers for bbox corners
