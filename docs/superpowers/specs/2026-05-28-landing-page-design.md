# LedgerMitra Landing Page Design

## Overview

A static landing page for the LedgerMitra desktop accounting application, targeting Speed Plus users migrating to a modern offline accounting tool. Uses the terminal-native design language defined in `DESIGN.md` — 100% monospaced typography, warm cream canvas (`#fdfcfc`), near-black ink (`#201d1d`), 4px-radius interactive elements, ASCII bracket markers, 1px hairline borders, and no shadows or gradients.

**Primary goal:** Drive downloads. **Primary audience:** Speed Plus users.

## Tech

- **Stack:** Plain HTML5 + CSS3 (no framework, no bundler)
- **Font:** JetBrains Mono as Berkeley Mono substitute via Google Fonts
- **Output:** `landing/index.html` — self-contained, deployable to any static host

## Sections

### 1. Navigation (sticky)

Sticky nav, cream background, 1px hairline bottom border, ~56px height.

- **Logo:** ASCII block-pixel "LEDGERMITRA" wordmark at left
- **Links (monospaced, `#424245`):** Features · Migration · Quick Start
- **GitHub CTA:** Dark pill button (`#201d1d` fill, `#fdfcfc` text, 4px radius) with inline GitHub SVG icon — links to `https://github.com/akashnikhra/LedgerMitra`

### 2. Hero

Full-bleed dark surface (`#201d1d`) containing a faux terminal interface:

- **ASCII wordmark:** Block-pixel "LEDGERMITRA" in `#fdfcfc` at center
- **Version line:** `v1.0.0 — offline accounting for Windows` in `#9a9898`
- **Command prompt row:** `$ install.bat` on `#302c2c` pill with 4px radius
- **Keybinding hint:** `tab navigate · ctrl-p commands · esc back` in `#646262`

Below the dark surface:

- **Headline:** "Offline desktop accounting." in `#201d1d`, 38px, bold (matches `DESIGN.md` display-xl)
- **Subheadline:** "LedgerMitra replaces Speed Plus legacy accounting software. All data stays on your machine — no cloud, no subscriptions." in `#424245`
- **CTAs:**
  - Primary: "Download for Windows ↓" — dark fill (`#201d1d`), `#fdfcfc` text, 4px radius. Links to GitHub Releases (`https://github.com/akashnikhra/LedgerMitra/releases`).
  - Secondary: "View on GitHub →" — 1px `#646262` border, `#201d1d` text, 4px radius. Links to repo (`https://github.com/akashnikhra/LedgerMitra`).

### 3. Features

Sits on cream canvas, 96px section rhythm, 1px hairline top rule. Section label: `[+]` **Features** in `heading-md` (16px/700).

Feature rows as `list-row` — each begins with `[+]` marker, bold label, description. No side padding, 8px vertical. Screenshots appear inline between feature groups inside `surface-card` (`#f1eeee`) pills with 4px radius and centered at 80% width.

12 features with screenshots placed at natural grouping points:
- `[+]` Invoicing — *(screenshot)*
- `[+]` Dashboard — *(screenshot)*
- `[+]` Purchase Invoices
- `[+]` Receipts — *(screenshot)*
- `[+]` Ledger — *(screenshot)*
- `[+]` Products & Stock
- `[+]` Customers & Suppliers
- `[+]` Legacy Import — *(screenshot)*
- `[*]` Private & Offline
- `[+]` WhatsApp Integration — *(screenshot)*
- `[+]` Print & PDF
- `[+]` Backup & Restore

### 4. Migration from Speed Plus

Section label: `[>]` **Migration from Speed Plus** in `heading-md`.

Intro paragraph explaining the migration pipeline from Speed Plus (`.mdb` / `.bmw`) files.

Legacy → new table mapping in `list-row` style:
- `[+]` Items → Products (SKU, rates, GST, stock)
- `[+]` Account → Customers (party ledgers, opening balance)
- `[+]` BillMaster → Invoices (sales vouchers)
- `[+]` Ledger → Ledger Entries (payments / receipts)
- `[+]` Company → Company (name during wizard)

Feature callouts:
- `[+]` Multi-FY detection within a single MDB file
- `[+]` Deduplication via file hash tracking
- `[+]` Balance carry-forward across financial years
- `[+]` Audit logging with skipped item details

Dark CTA at end: "View Migration Guide →" linking to README migration section (`https://github.com/akashnikhra/LedgerMitra#migration`).

### 5. Quick Start

Section label: `[+]` **Quick Start** in `heading-md`.

Three numbered steps as `install-snippet` style pills (`#f1eeee` background, 4px radius):
1. Clone — `git clone https://github.com/akashnikhra/LedgerMitra.git`
2. Install — `cd LedgerMitra && install.bat`
3. Launch — `start.bat`

Below steps: `surface-card` pill showing default login `admin` / `admin123`.

### 6. Footer

Cream canvas, 1px hairline top rule, 32px padding.

- **Link row (centered):** GitHub · Documentation · Release Notes · License (MIT) — `caption-md` (14px), `#424245`
- **Copyright:** `© 2026 LedgerMitra — Built with Electron + React + SQLite` in `caption-md` `#646262` `mute`

## Design Tokens (from DESIGN.md)

| Token | Value | Usage |
|-------|-------|-------|
| `canvas` | `#fdfcfc` | Page background |
| `ink` | `#201d1d` | Headlines, primary CTA fill |
| `body` | `#424245` | Body text, nav links |
| `mute` | `#646262` | Secondary text, metadata |
| `ash` | `#9a9898` | TUI secondary color |
| `surface-card` | `#f1eeee` | Install snippet, screenshot pills |
| `surface-dark` | `#201d1d` | Hero TUI mockup background |
| `surface-dark-elevated` | `#302c2c` | TUI prompt row background |
| `hairline` | `rgba(15,0,0,0.12)` | Section dividers |
| `accent` | `#007aff` | Command highlight in TUI |
| `on-dark` | `#fdfcfc` | Text on dark surfaces |

## Responsive Behavior

- **Desktop (1024px+):** Max-width ~960px content column. Nav horizontal. Screenshots at 80%.
- **Tablet (768px):** Nav links stack if needed. Screenshots full-width.
- **Mobile (640px):** Hero ASCII art scales down. Feature rows full-width. CTAs stack vertically. Section padding drops from 96px to 48px.
