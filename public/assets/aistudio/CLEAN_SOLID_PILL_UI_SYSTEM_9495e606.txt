# Clean Solid Pill — Universal UI Design System & Style Blueprint

> **Usage Instruction for AI / Developers:**  
> When this file is provided as a design reference, apply **100% of this visual language, color system, button texture, boxed-icon treatment, typography, spacing, shadows, and interaction physics** to the requested website or web application — adapting the layout and content solely to the user's new project domain. Do **not** alter the palette, gradients/flatness rules, or button/dock behavior unless explicitly requested.

---

## 1. Core Design Philosophy

- **Aesthetic Identity:** Crisp Light Fintech / Modern SaaS Clean Solid Pill UI.
- **Surface Discipline:**
  - Use a clean, cool off-white canvas (`#f8fafc`) with **pure solid white cards** (`#ffffff`) and subtle `1px solid #e2e8f0` hairlines.
  - **No messy full-page radial background washes** and **no heavy glossy gradients** on cards, navbars, or buttons.
  - Depth comes from hairline borders (`#e2e8f0`), soft slate shadows (`0 2px 8px rgba(15, 23, 42, 0.04)`), and crisp elevation contrast.
- **Signature Multi-Color Pastel-to-Solid Icon Texture:**
  - Every navigation item, stat card, category chip, and dock icon lives inside a **rounded square icon box** (`border-radius: 8px` to `10px`).
  - **Inactive / Default State:** Soft pastel tinted background + `1px` matching pastel border + vibrant saturated vector icon.
  - **Active / Selected State:** Switches cleanly to a **solid vibrant fill + pure `#ffffff` icon** with a soft colored shadow and a subtle `1.5px` upward lift.
- **Iconography Rule:** Strictly crisp vector icons (**RemixIcon v4.2.0** `ri-*` classes). **Zero emojis** anywhere in the UI.
- **Density & Rhythm:** Compact, mobile-first, app-like proportions (`12px–14px` card radius, tight headings, `tabular-nums` for numbers/metrics).

---

## 2. Typography & Icon CDN

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet">
```

- **UI / Display Font:** `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`
  - Page Titles / Brand: `800` weight, `letter-spacing: -0.02em`
  - Card Headers / Buttons: `700–800` weight
  - Form Labels / Section Tags: `10px–10.5px`, `700–800` weight, `text-transform: uppercase`, `letter-spacing: 0.05em`
- **Monospace / Numeric Font:** `'JetBrains Mono', monospace` with `font-variant-numeric: tabular-nums` for prices, counters, IDs, and code blocks.

---

## 3. Exact Color Tokens & 7-Hue Accent Matrix

### Base Neutral & Semantic Tokens
```css
:root {
  --ui-bg: #f8fafc;
  --ui-surface: #ffffff;
  --ui-surface-alt: #f8fafc;
  --ui-surface-hover: #f1f5f9;

  --ui-text: #0f172a;
  --ui-text-secondary: #1e293b;
  --ui-muted: #475569;
  --ui-light: #94a3b8;

  --ui-border: #e2e8f0;
  --ui-border-subtle: #f1f5f9;
  --ui-border-strong: #cbd5e1;

  --ui-primary: #2563eb;
  --ui-primary-dark: #1d4ed8;
  --ui-primary-light: #eff6ff;
  --ui-primary-border: #bfdbfe;

  --ui-success: #10b981;
  --ui-success-dark: #059669;
  --ui-success-bg: #ecfdf5;
  --ui-success-border: #a7f3d0;

  --ui-warning: #d97706;
  --ui-warning-bg: #fffbeb;
  --ui-warning-border: #fde68a;

  --ui-danger: #e11d48;
  --ui-danger-bg: #fff1f2;
  --ui-danger-border: #fecdd3;

  --ui-radius-card: 14px;
  --ui-radius-box: 10px;
  --ui-radius-btn: 9px;
  --ui-shadow-card: 0 2px 8px rgba(15, 23, 42, 0.04);
  --ui-shadow-dock: 0 8px 24px rgba(15, 23, 42, 0.08);
  --ui-shadow-modal: 0 24px 60px rgba(15, 23, 42, 0.22);
}
```

### 7-Hue Pastel-to-Solid Accent Matrix (For Icon Boxes, Stat Tiles, Nav Items & Dock Tabs)

| Hue Name | Soft Pill Bg | Soft Pill Border | Icon / Text Ink | Solid Active Fill | Active Border | Active Icon |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Blue** | `#eff6ff` | `#bfdbfe` | `#2563eb` | `#2563eb` | `#1d4ed8` | `#ffffff` |
| **Indigo** | `#eef2ff` | `#c7d2fe` | `#4f46e5` | `#4f46e5` | `#4338ca` | `#ffffff` |
| **Violet** | `#f5f3ff` | `#ddd6fe` | `#7c3aed` | `#7c3aed` | `#6d28d9` | `#ffffff` |
| **Sky** | `#f0f9ff` | `#bae6fd` | `#0284c7` | `#0284c7` | `#0369a1` | `#ffffff` |
| **Teal** | `#f0fdfa` | `#99f6e4` | `#0d9488` | `#0d9488` | `#0f766e` | `#ffffff` |
| **Emerald** | `#ecfdf5` | `#a7f3d0` | `#059669` | `#059669` | `#047857` | `#ffffff` |
| **Amber** | `#fffbeb` | `#fde68a` | `#d97706` | `#d97706` | `#b45309` | `#ffffff` |
| **Rose** | `#fff1f2` | `#fecdd3` | `#e11d48` | `#e11d48` | `#be123c` | `#ffffff` |

---

## 4. Complete Ready-to-Use Stylesheet

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background: var(--ui-bg);
  color: var(--ui-text);
  min-height: 100vh;
  padding-bottom: 78px;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

code, pre, .ui-mono {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}

i {
  line-height: 1;
  vertical-align: middle;
}

/* ── ANIMATIONS ── */
@keyframes uiPageEnter {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes uiSpringModal {
  0% { opacity: 0; transform: scale(0.88) translateY(12px); }
  70% { transform: scale(1.02) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes uiRippleWave {
  to { transform: scale(3.4); opacity: 0; }
}

/* ── BUTTONS (CLEAN SOLID PILL) ── */
.ui-btn {
  padding: 6px 11px;
  border-radius: 9px;
  font-size: 11.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-decoration: none;
  white-space: nowrap;
  position: relative;
  overflow: hidden;
  user-select: none;
  line-height: 1.2;
  transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.ui-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-btn-primary {
  background: #2563eb;
  color: #ffffff;
  border: 1px solid #1d4ed8;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
}
.ui-btn-primary:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
.ui-btn-primary:active:not(:disabled) { transform: translateY(1px) scale(0.96); }

.ui-btn-success {
  background: #10b981;
  color: #ffffff;
  border: 1px solid #059669;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.18);
}
.ui-btn-success:hover:not(:disabled) { background: #059669; transform: translateY(-1px); }
.ui-btn-success:active:not(:disabled) { transform: scale(0.96); }

.ui-btn-outline {
  background: #f8fafc;
  color: #1e293b;
  border: 1px solid #cbd5e1;
  box-shadow: none;
}
.ui-btn-outline:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; transform: translateY(-1px); }
.ui-btn-outline:active:not(:disabled) { transform: scale(0.96); }

.ui-btn-ghost {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
  box-shadow: none;
}
.ui-btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.ui-btn-ghost:active:not(:disabled) { transform: scale(0.96); }

.ui-btn-danger {
  background: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
  box-shadow: none;
}
.ui-btn-danger:hover:not(:disabled) { background: #ffe4e6; }
.ui-btn-danger:active:not(:disabled) { transform: scale(0.96); }

.ui-ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transform: scale(0);
  animation: uiRippleWave 0.5s linear;
  pointer-events: none;
}

/* ── STICKY COMPACT TOP NAVBAR ── */
.ui-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 54px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
}

.ui-nav-inner {
  max-width: 1140px;
  margin: 0 auto;
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ui-menu-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  cursor: pointer;
  flex-shrink: 0;
}

.ui-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.ui-brand-ico {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.ui-brand-title {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
}

/* Desktop Horizontal Links */
.ui-nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ui-nav-link {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.16s ease;
}
.ui-nav-link:hover { background: #f1f5f9; color: #0f172a; }
.ui-nav-link.active { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }

/* ── SLIDE-OUT DRAWER WITH COLOR-CODED ICON BOXES ── */
.ui-drawer-ov {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(4px);
  z-index: 200;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
.ui-drawer-ov.open { opacity: 1; pointer-events: auto; }

.ui-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 265px;
  background: #ffffff;
  z-index: 210;
  transform: translateX(-102%);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  box-shadow: 10px 0 35px rgba(15, 23, 42, 0.12);
}
.ui-drawer.open { transform: translateX(0); }

.ui-drawer-btn {
  width: 100%;
  padding: 8px 11px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text);
  font-size: 12.5px;
  font-weight: 700;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  margin-bottom: 4px;
  transition: all 0.16s ease;
}
.ui-drawer-btn:hover { background: #f8fafc; border-color: #e2e8f0; transform: translateX(2px); }

/* Drawer Icon Box (Default Soft Tint -> Active Solid Fill + White Icon) */
.ui-drawer-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  background: var(--accent-soft, #eff6ff);
  color: var(--accent, #2563eb);
  border: 1px solid var(--accent-border, #bfdbfe);
  transition: all 0.16s ease;
}

.ui-drawer-btn.active {
  background: var(--accent-soft, #eff6ff);
  color: var(--accent, #2563eb);
  border-color: var(--accent-border, #bfdbfe);
}

.ui-drawer-btn.active .ui-drawer-ico {
  background: var(--accent, #2563eb) !important;
  color: #ffffff !important;
  border-color: var(--accent-dark, #1d4ed8) !important;
}

/* ── CARDS, STAT TILES, CHIPS & FORMS ── */
.ui-container {
  max-width: 1140px;
  width: 100%;
  margin: 0 auto;
  padding: 12px 10px;
}

.ui-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  margin-bottom: 12px;
  overflow: hidden;
}

.ui-card-head {
  padding: 10px 13px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.ui-card-head h3 {
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ui-card-body { padding: 13px; }

.ui-stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 11px 12px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ui-stat-ico {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-soft, #eff6ff);
  border: 1px solid var(--accent-border, #bfdbfe);
  color: var(--accent, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}

.ui-chip {
  padding: 6px 11px;
  border-radius: 9px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-size: 11.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.16s ease;
}
.ui-chip.active {
  background: var(--accent, #2563eb);
  color: #ffffff;
  border-color: var(--accent-dark, #1d4ed8);
}

.ui-field { margin-bottom: 9px; }
.ui-field label {
  display: block;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--ui-muted);
  margin-bottom: 3px;
  text-transform: uppercase;
}
.ui-field input,
.ui-field select,
.ui-field textarea {
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  background: #ffffff;
  transition: 0.16s;
}
.ui-field input:focus,
.ui-field select:focus,
.ui-field textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

/* ── BADGES ── */
.ui-badge {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.ui-badge-ok { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.ui-badge-warn { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
.ui-badge-err { background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; }
.ui-badge-info { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }

/* ── FLOATING BOXED-ICON BOTTOM NAVIGATION DOCK ── */
/* CRITICAL: Outer .ui-dock-btn stays 100% transparent in ALL states! Only .ui-dock-ico-box turns solid! */
.ui-dock {
  position: fixed;
  bottom: 8px;
  left: 10px;
  right: 10px;
  height: 58px;
  max-width: 500px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  z-index: 120;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 4px;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.ui-dock-btn {
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  border-radius: 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 9.5px;
  font-weight: 700;
  color: #64748b;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
  -webkit-appearance: none;
  appearance: none;
}

.ui-dock-btn:hover,
.ui-dock-btn:focus,
.ui-dock-btn:focus-visible,
.ui-dock-btn:active,
.ui-dock-btn.active {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

.ui-dock-ico-box {
  width: 28px;
  height: 26px;
  border-radius: 8px;
  background: var(--accent-soft, #eff6ff);
  border: 1px solid var(--accent-border, #bfdbfe);
  color: var(--accent, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14.5px;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ui-dock-btn.active {
  color: var(--accent, #2563eb);
  font-weight: 800;
}

.ui-dock-btn.active .ui-dock-ico-box {
  background: var(--accent, #2563eb);
  border-color: var(--accent-dark, #1d4ed8);
  color: #ffffff !important;
  transform: translateY(-1.5px);
  box-shadow: 0 4px 10px var(--accent-glow, rgba(37, 99, 235, 0.24));
}

/* ── MODALS & TOAST ── */
.ui-modal-ov {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(5px);
  z-index: 500;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 14px;
}
.ui-modal-ov.show { display: flex; }

.ui-modal {
  background: #ffffff;
  border-radius: 18px;
  width: 100%;
  max-width: 380px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  animation: uiSpringModal 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ui-modal-head {
  padding: 12px 15px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ui-modal-head h3 {
  font-size: 13.5px;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ui-toast {
  position: fixed;
  top: 60px;
  right: 12px;
  z-index: 600;
  background: #0f172a;
  color: #ffffff;
  padding: 8px 13px;
  border-radius: 10px;
  font-size: 11.5px;
  font-weight: 700;
  display: none;
  align-items: center;
  gap: 6px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  animation: uiSpringModal 0.25s ease;
}
.ui-toast.show { display: flex; }
```

---

## 5. HTML Structure Patterns (Generic Examples)

### Top Bar Pattern
```html
<header class="ui-navbar">
  <div class="ui-nav-inner">
    <div style="display:flex;align-items:center;gap:8px">
      <button class="ui-menu-btn" aria-label="Menu"><i class="ri-menu-2-fill"></i></button>
      <div class="ui-brand">
        <div class="ui-brand-ico"><i class="ri-flashlight-fill"></i></div>
        <span class="ui-brand-title">App Name</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="ui-btn ui-btn-outline"><i class="ri-settings-4-fill" style="color:#4f46e5"></i> Settings</button>
      <button class="ui-btn ui-btn-primary"><i class="ri-add-line"></i> Create</button>
    </div>
  </div>
</header>
```

### Multi-Color Bottom Dock Pattern (Custom CSS Variables Per Tab)
```html
<nav class="ui-dock">
  <button class="ui-dock-btn active"
          style="--accent:#2563eb;--accent-dark:#1d4ed8;--accent-soft:#eff6ff;--accent-border:#bfdbfe;--accent-glow:rgba(37,99,235,.24)">
    <span class="ui-dock-ico-box"><i class="ri-home-5-fill"></i></span>
    <span>Home</span>
  </button>

  <button class="ui-dock-btn"
          style="--accent:#7c3aed;--accent-dark:#6d28d9;--accent-soft:#f5f3ff;--accent-border:#ddd6fe;--accent-glow:rgba(124,58,237,.24)">
    <span class="ui-dock-ico-box"><i class="ri-apps-2-fill"></i></span>
    <span>Explore</span>
  </button>

  <button class="ui-dock-btn"
          style="--accent:#0d9488;--accent-dark:#0f766e;--accent-soft:#f0fdfa;--accent-border:#99f6e4;--accent-glow:rgba(13,148,136,.24)">
    <span class="ui-dock-ico-box"><i class="ri-folder-3-fill"></i></span>
    <span>Library</span>
  </button>

  <button class="ui-dock-btn"
          style="--accent:#059669;--accent-dark:#047857;--accent-soft:#ecfdf5;--accent-border:#a7f3d0;--accent-glow:rgba(5,150,105,.24)">
    <span class="ui-dock-ico-box"><i class="ri-user-3-fill"></i></span>
    <span>Profile</span>
  </button>
</nav>
```

### Subtle Button Ripple Listener (Never Attach to `.ui-dock-btn`)
```js
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.ui-btn, .ui-menu-btn, .ui-drawer-btn');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const sp = document.createElement('span');
  const sz = Math.max(r.width, r.height);
  sp.style.width = sp.style.height = sz + 'px';
  sp.style.left = (e.clientX - r.left - sz / 2) + 'px';
  sp.style.top = (e.clientY - r.top - sz / 2) + 'px';
  sp.className = 'ui-ripple';
  btn.appendChild(sp);
  setTimeout(() => sp.remove(), 500);
});
```

---

## 6. Guardrails When Generating Any New Site With This File

1. **Always keep the outer `.ui-dock-btn` transparent** — never fill the whole dock button on hover, focus, or active; only transition `.ui-dock-ico-box` to solid `--accent` with `#ffffff !important` icon color.
2. **Always include `#ffffff !important` on active icon boxes** so ID/utility colors never override the white icon inside a solid fill.
3. **Never add emojis** — use RemixIcon vector glyphs inside tinted rounded-square containers.
4. **Keep modals, cards, and navbars flat white (`#ffffff`)** on top of `#f8fafc` background with `#e2e8f0` `1px` borders.
5. **Adapt 100% of labels, data models, and routes** strictly to the new target website requested by the user.
