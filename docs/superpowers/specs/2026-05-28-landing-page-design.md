# LedgerMitra Landing Page Design

## Overview

A static landing page for the LedgerMitra desktop accounting application. Uses the terminal-native design language defined in `DESIGN.md` — Berkeley Mono (monospaced) typography, warm cream canvas (`#fdfcfc`), near-black ink (`#201d1d`), 4px-radius interactive elements, ASCII bracket markers, 1px hairline borders, and no shadows or gradients.

Built as plain HTML + CSS (static site, zero build tools). Light theme only, no dark/light toggle.

## Tech

- **Stack:** Plain HTML5 + CSS3 (no framework, no bundler)
- **Font:** Berkeley Mono via CSS font stack fallback (JetBrains Mono → IBM Plex Mono → ui-monospace)
- **Output:** `landing/` folder at project root — self-contained, deployable to any static host (GitHub Pages, Netlify, etc.)

## Structure

```
landing/
├── index.html          # Full page
└── assets/             # Symlink or copy of ../assets/ screenshots
```

## Sections

### 1. Navigation (sticky)

- **Logo:** ASCII block-pixel "LEDGERMITRA" wordmark (matching DESIGN.md's ASCII art convention)
- **Links (monospaced, `#424245`):** Features · Download · GitHub
- **Download CTA:** Dark button (`#201d1d` fill, `#fdfcfc` text), 4px radius, `cursor-pointer`
- Sticky at top, cream background, 1px hairline bottom border

### 2. Hero

Full-bleed dark surface (`#201d1d`) containing a faux terminal interface:

- **ASCII wordmark:** Block-pixel "LEDGERMITRA" in `#fdfcfc` at center
- **Version line:** `v1.0.0 — offline accounting for Windows` in `#9a9898`
- **Command prompt row:** `$ ledger mitra install` with `install` in accent blue (`#007aff`), on `#302c2c` pill with 4px radius
- **Keybinding hint:** `tab switch · ctrl-p commands · esc back` in `#646262`

Below the dark surface:

- **Headline:** "Offline desktop accounting." in `#201d1d`, 24px, bold
- **Subheadline:** "LedgerMitra replaces Speed Plus legacy accounting software. All data stays on your machine." in `#646262`
- **CTAs:**
  - Primary: "Download for Windows ↓" — dark fill (`#201d1d`), `#fdfcfc` text, 4px radius
  - Secondary: "View on GitHub →" — 1px `#646262` border, `#201d1d` text, 4px radius

### 3. Features (Option A — list rows with inline screenshots)

Features are horizontal list rows separated by 1px `hairline` rules, with inline screenshots between feature groups:

- **Row pattern:** `[+] Label — Description` all in `body-md` (16px monospaced)
- **Screenshot groups:** App screenshots placed between feature rows inside `surface-card` (`#f1eeee`) pills with 4px radius. Each screenshot is centered at 80% width.
- **Features covered:** Invoicing, Dashboard, Purchase Invoices, Receipts, Ledger, Products/SKU, Customers/Suppliers, Legacy Import, Privacy

### 4. CTA / Download

- **Headline:** "Download LedgerMitra"
- **Subhead:** "Free. Offline. Your data stays on your machine."
- **Install snippet:** `$ winget install LedgerMitra` inside a `surface-card` pill, matching DESIGN.md's `install-snippet` component
- **Buttons:**
  - Primary: "Download for Windows ↓" — same as hero CTA
  - Secondary: "View on GitHub →" — same as hero secondary
- **Meta row:** Windows 10+ · 64-bit · ~80 MB · Portable (in `#646262`, `caption-md`)

### 5. Footer

- 1px hairline top rule
- **Link row:** GitHub · Documentation · Release Notes · License (MIT) — monospaced, `#424245`
- **Copyright:** `© 2026 LedgerMitra — Built with Electron + React + SQLite` in `caption-md` `#646262`

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
| `hairline` | `rgba(15,0,0,0.12)` | Section dividers, feature borders |
| `accent` | `#007aff` | Command highlight in TUI |
| `on-dark` | `#fdfcfc` | Text on dark surfaces |

## Responsive Behavior

- **Desktop (1024px+):** Max-width ~960px content column. Nav horizontal. Two CTAs side by side.
- **Tablet (768px):** Nav collapses to centered stack. Screenshots scale to full width.
- **Mobile (640px):** Hero ASCII art scales down. Feature rows full-width. CTAs stack vertically.

## Implementation Notes

- Font stack: `'Berkeley Mono', 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace`
- No JavaScript required for page display. Zero JS for the static version.
- Use `<link>` for Google Fonts (JetBrains Mono as Berkeley Mono substitute)
- All screenshots should be copied (not symlinked) from `../assets/` for self-containment
- ASCII wordmark uses `<pre>` tag with monospaced char art
