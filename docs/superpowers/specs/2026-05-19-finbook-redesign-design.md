# LedgerMitra Visual Redesign Design

## Overview

Redesign the LedgerMitra UI to match the "terminal-native" aesthetic defined in `DESIGN.md`. The application will transition from a modern dark/light theme with sans-serif typography to a monospaced, flat, cream-canvas interface inspired by manpages and TUIs.

## 1. Global Theme

### Typography
- **Font Family:** JetBrains Mono (via Google Fonts) for all text elements. Fallback: 'IBM Plex Mono', monospace.
- **Weights:**
  - `400` (Regular): Body text, inputs, table data.
  - `500` (Medium): Buttons, active nav items, emphasis.
  - `700` (Bold): Headings, stat values, table headers.
- **No italics.**

### Colors
- **Canvas:** `#fdfcfc` (Warm cream) — Main background.
- **Ink:** `#201d1d` (Near black) — Primary text, borders, primary buttons.
- **Surface Soft:** `#f8f7f7` — Input backgrounds, subtle fills.
- **Surface Card:** `#f1eeee` — Code snippets, disabled states.
- **Muted:** `#646262` — Secondary text, inactive nav, metadata.
- **Hairline:** `rgba(15,0,0,0.12)` — Borders, dividers.
- **Semantic:**
  - **Danger:** `#ff3b30` (Delete buttons, error alerts).
  - **Warning:** `#ff9f0a` (Warning alerts).
  - **Success:** `#30d158` (Success alerts).
  - **Accent:** `#007aff` (Links only, sparing use).

### Spacing
- **Base Unit:** 8px.
- **Section Padding:** 24px.
- **Internal Padding:** Tight (4px/8px) for density.
- **Radius:** 4px for interactive elements, 0px for containers.

## 2. Layout Structure

### App Shell
- **Background:** Canvas cream.
- **Sidebar:**
  - Width: 220px.
  - Background: Canvas cream.
  - Border: 1px hairline right.
  - Nav Items: Monospaced, muted color. Active item uses `[x]` marker and ink color.
- **Main Content:**
  - Padding: 24px.
  - Scrollable.

### Cards & Containers
- **Background:** Transparent (sits on canvas).
- **Border:** 1px hairline.
- **Radius:** 0px (sharp corners).
- **Shadow:** None.

## 3. Component Library

### Buttons
- **Primary:** Ink background, Canvas text, 4px radius.
- **Secondary:** Canvas background, Ink text, 1px hairline border.
- **Danger:** Transparent background, Danger text, 1px Danger border.
- **Style:** Monospaced, 500 weight, no shadows.

### Inputs
- **Background:** Surface Soft.
- **Border:** 1px hairline.
- **Focus:** Canvas background, 1px Ink border.
- **Radius:** 4px.

### Tables
- **Style:** Flat on canvas.
- **Headers:** Ink color, 700 weight.
- **Rows:** Hairline bottom border. No hover background (or very subtle).
- **Text:** Monospaced, Muted color for data.

### Modals
- **Overlay:** Semi-transparent Ink.
- **Content:** Canvas background, 1px Ink border, 0px radius.
- **Header/Footer:** Hairline dividers.

### Alerts
- **Style:** 1px colored border, transparent background with slight tint.
- **Text:** Colored text matching border.

## 4. Screen-by-Screen Mapping

### Login
- **Card:** Centered, hairline border, sharp corners.
- **Inputs:** Surface Soft background.
- **Button:** Primary style.

### Dashboard
- **Stats Grid:** Cards with hairline borders, sharp corners.
- **Values:** Large, bold, Ink color.
- **Labels:** Small, Muted color.

### Lists (Customers, Products, Invoices, Suppliers)
- **Toolbar:** Hairline bottom border.
- **Search:** Surface Soft input.
- **Table:** Flat, hairline dividers.
- **Empty State:** Centered, Muted text.

### Forms (Modals)
- **Layout:** Grid with 8px gaps.
- **Labels:** Small, Muted, monospaced.
- **Actions:** Primary/Secondary buttons in footer.

### Settings / Legacy Import
- **Wizard Steps:** ASCII markers `[1]`, `[2]`, etc.
- **Progress:** Hairline bar with Ink fill.

## 5. Implementation Strategy

1.  **CSS Variables:** Update `global.css` to use DESIGN.md tokens.
2.  **Typography:** Import JetBrains Mono, apply to `:root`.
3.  **Components:** Refactor `.btn`, `.card`, `.input`, `.table` classes.
4.  **Layout:** Update `.sidebar`, `.main`, `.modal` styles.
5.  **Icons:** Replace SVG icons with ASCII markers where appropriate (e.g., nav active state).
6.  **Cleanup:** Remove shadows, gradients, and rounded corners from containers.
