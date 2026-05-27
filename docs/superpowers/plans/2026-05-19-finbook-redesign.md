# LedgerMitra Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the LedgerMitra UI to match the "terminal-native" aesthetic defined in DESIGN.md — monospaced typography, warm cream canvas, hairline borders, no shadows, ASCII markers.

**Architecture:** Update global CSS variables and component classes in `global.css`, import JetBrains Mono font, remove shadows/rounded corners from containers, update specific component styles (buttons, inputs, tables, modals, sidebar), and add ASCII navigation markers.

**Tech Stack:** CSS, React (JSX), Google Fonts (JetBrains Mono), Electron

---

### Task 1: Global CSS — Typography & Color Tokens

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Add JetBrains Mono to index.html**

Add to `<head>` in `src/renderer/index.html` (after line 4):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update global.css root variables**

Replace the `:root` block in `src/renderer/styles/global.css` (lines 1-52) with:

```css
:root {
  /* Typography */
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code', monospace;
  font-family: var(--font-mono);
  
  /* Colors - DESIGN.md tokens */
  --canvas: #fdfcfc;
  --ink: #201d1d;
  --ink-deep: #0f0000;
  --surface-soft: #f8f7f7;
  --surface-card: #f1eeee;
  --surface-dark: #201d1d;
  --hairline: rgba(15,0,0,0.12);
  --hairline-strong: #646262;
  --muted: #646262;
  --body: #424245;
  
  /* Semantic */
  --accent: #007aff;
  --danger: #ff3b30;
  --warning: #ff9f0a;
  --success: #30d158;
  
  /* Spacing */
  --radius-sm: 4px;
  --radius-none: 0px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
}

/* Dark theme support (minimal - DESIGN.md is primarily light) */
[data-theme="dark"] {
  --canvas: #201d1d;
  --ink: #fdfcfc;
  --surface-soft: #302c2c;
  --surface-card: #424245;
  --hairline: rgba(253,252,252,0.12);
  --muted: #9a9898;
  --body: #b0b0b0;
}
```

- [ ] **Step 3: Update body styles**

Replace the `body` block (lines 56-60) with:

```css
body {
  background: var(--canvas);
  color: var(--ink);
  min-height: 100vh;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1.5;
}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 2: Buttons & Inputs

**Files:**
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Update button styles**

Replace the `.btn` block (lines 66-93) with:

```css
.btn {
  padding: 4px 20px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 2;
  background: var(--ink);
  color: var(--canvas);
  transition: background-color 0.15s ease;
}
.btn:hover { background: var(--ink-deep); }
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; background: var(--surface-card); color: var(--muted); }

.btn-secondary {
  background: var(--canvas);
  color: var(--ink);
  border: 1px solid var(--hairline-strong);
}
.btn-secondary:hover {
  background: var(--surface-soft);
}

.btn-danger {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}
.btn-danger:hover {
  background: var(--danger);
  color: var(--canvas);
}
```

- [ ] **Step 2: Update input styles**

Replace the `input, select` block (lines 104-121) with:

```css
input, select {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--hairline);
  background: var(--surface-soft);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 16px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
input:focus, select:focus {
  outline: none;
  border-color: var(--ink);
  background: var(--canvas);
  box-shadow: none;
}
input:disabled, select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Update label styles**

Replace the `label` block (lines 123-128) with:

```css
label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 4px;
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 3: Cards, Tables & Layout

**Files:**
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Update card styles**

Replace the `.card` block (lines 95-102) with:

```css
.card {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-none);
  padding: var(--spacing-lg);
  box-shadow: none;
  transition: border-color 0.15s ease;
}
```

- [ ] **Step 2: Update table styles**

Replace the `table` block (lines 132-144) with:

```css
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-family: var(--font-mono);
}
th, td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--hairline);
}
th { 
  color: var(--ink); 
  font-weight: 700;
  font-size: 14px;
}
td {
  color: var(--body);
}
tr.selected { background: var(--surface-soft); }
tr:hover { cursor: pointer; background: var(--surface-soft); }
```

- [ ] **Step 3: Update sidebar styles**

Replace the `.sidebar` block (lines 151-167) with:

```css
.sidebar {
  width: 220px;
  background: var(--canvas);
  border-right: 1px solid var(--hairline);
  padding: var(--spacing-lg) var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  box-shadow: none;
}

.sidebar h1 {
  font-size: 18px;
  padding: 0 var(--spacing-sm) var(--spacing-lg);
  color: var(--ink);
  font-weight: 700;
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Update nav button styles**

Replace the `.nav-btn` block (lines 169-186) with:

```css
.nav-btn {
  text-align: left;
  padding: 8px var(--spacing-sm);
  border-radius: var(--radius-none);
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 400;
  transition: color 0.15s ease;
}
.nav-btn.active {
  color: var(--ink);
  font-weight: 500;
}
.nav-btn:hover {
  color: var(--ink);
}
.nav-btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Update main content area**

Replace the `.main` rule (line 188) with:

```css
.main { 
  flex: 1; 
  padding: var(--spacing-xl); 
  overflow: auto;
  background: var(--canvas);
}
```

- [ ] **Step 6: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 4: Modals & Alerts

**Files:**
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Update modal styles**

Replace the modal blocks (lines 349-425) with:

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(32,29,29,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: var(--spacing-xl);
  overflow: auto;
}

.modal-content {
  background: var(--canvas);
  border: 1px solid var(--ink);
  border-radius: var(--radius-none);
  box-shadow: none;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--hairline);
}

.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.modal-close {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.modal-close:hover {
  color: var(--ink);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--hairline);
}
```

- [ ] **Step 2: Update alert styles**

Replace the `.alert` block (lines 218-226) with:

```css
.alert {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
  margin-bottom: var(--spacing-sm);
  font-size: 14px;
  font-family: var(--font-mono);
  border: 1px solid;
}
.alert-warn { 
  background: transparent; 
  border-color: var(--warning); 
  color: var(--warning); 
}
.alert-error { 
  background: transparent; 
  border-color: var(--danger); 
  color: var(--danger); 
}
.alert-success { 
  background: transparent; 
  border-color: var(--success); 
  color: var(--success); 
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 5: Login & Setup Screens

**Files:**
- Modify: `src/renderer/styles/global.css`
- Modify: `src/renderer/components/Login.tsx` (if needed for ASCII markers)

- [ ] **Step 1: Update login page styles**

Replace the `.login-page` and `.login-card` blocks (lines 228-234) with:

```css
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas);
}
.login-card { 
  width: 380px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-none);
  box-shadow: none;
  background: var(--canvas);
}
```

- [ ] **Step 2: Update wizard step styles**

Replace the `.wizard-steps` block (lines 200-216) with:

```css
.wizard-steps {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}
.wizard-step {
  flex: 1;
  text-align: center;
  padding: var(--spacing-sm);
  border-radius: var(--radius-none);
  background: var(--surface-soft);
  font-size: 14px;
  color: var(--muted);
  font-family: var(--font-mono);
  border: 1px solid var(--hairline);
}
.wizard-step.active { 
  background: var(--ink); 
  color: var(--canvas); 
  font-weight: 500; 
  border-color: var(--ink);
}
.wizard-step.done { 
  background: var(--canvas); 
  color: var(--success); 
  border-color: var(--success);
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 6: Dashboard & Stats

**Files:**
- Modify: `src/renderer/styles/global.css`
- Modify: `src/renderer/components/Dashboard.tsx` (minor tweaks if needed)

- [ ] **Step 1: Update stats grid styles**

Replace the `.stats-grid` and `.stat-card` blocks (lines 190-198) with:

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.stat-card {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-none);
  padding: var(--spacing-lg);
}
.stat-card h3 { 
  font-size: 14px; 
  color: var(--muted); 
  margin-bottom: var(--spacing-xs);
  font-family: var(--font-mono);
  font-weight: 400;
}
.stat-card p { 
  font-size: 24px; 
  font-weight: 700; 
  color: var(--ink);
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 7: Invoices Panel & Badges

**Files:**
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Update invoice panel styles**

Replace the `.invoices-panel` and related blocks (lines 580-645) with:

```css
.invoices-panel {
  width: 100%;
}

.invoices-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  flex-wrap: wrap;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--hairline);
}

.invoices-toolbar h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.search-group {
  margin-bottom: var(--spacing-sm);
}

.invoices-table-card {
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-none);
}

.empty-state {
  color: var(--muted);
  padding: var(--spacing-lg);
  text-align: center;
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Update badge styles**

Replace the `.badge` blocks (lines 619-633) with:

```css
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-mono);
}
.badge-sale {
  background: var(--canvas);
  color: var(--success);
  border: 1px solid var(--success);
}
.badge-return {
  background: var(--canvas);
  color: var(--danger);
  border: 1px solid var(--danger);
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 8: Cleanup & Polish

**Files:**
- Modify: `src/renderer/styles/global.css`
- Modify: `src/renderer/components/Dashboard.tsx` (remove unused Product import if needed)

- [ ] **Step 1: Remove unused styles**

Remove or comment out these deprecated styles from `global.css`:
- `--shadow`, `--shadow-lg` variables (no longer used)
- `box-shadow` references in `.card`, `.sidebar`, `.theme-toggle`
- `border-radius: var(--radius)` references in containers (keep only for buttons/inputs)
- `.crud-layout` if no longer used
- `.invoice-outstanding` update to match new style

- [ ] **Step 2: Update theme toggle**

Replace the `.theme-toggle` block (lines 297-316) with:

```css
.theme-toggle {
  position: fixed;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  z-index: 1000;
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  padding: var(--spacing-xs);
  cursor: pointer;
  box-shadow: none;
  transition: border-color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.theme-toggle:hover {
  border-color: var(--ink);
}
```

- [ ] **Step 3: Final build**

Run: `npm run build`
Expected: Build succeeds with zero errors

- [ ] **Step 4: Manual verification checklist**

1. Launch app → verify JetBrains Mono font loads
2. Check all screens: Login, Dashboard, Customers, Products, Invoices, Suppliers, Settings
3. Verify no shadows on cards/modals
4. Verify sharp corners on containers (0px radius)
5. Verify 4px radius on buttons/inputs
6. Verify hairline borders on all cards/tables
7. Verify monospaced text throughout
8. Verify warm cream canvas background
9. Test dark mode toggle (if applicable)
