# CLAUDE.md — Lovense Cloud for SillyTavern

## Project Overview

A SillyTavern third-party extension that controls Lovense toys via the Lovense Cloud API. Runs entirely client-side in the browser. The server admin hardcodes the Lovense Developer Token in the source; end users interact with a glassmorphism floating panel (QR pairing, test buttons, keyword config).

## File Structure

```
SillyTavern-Lovense-Cloud/
├── manifest.json      # ST extension manifest (name, version, entry points)
├── index.js           # All logic: API calls, automation, panel controls, settings, init
├── settings.html      # Floating glassmorphism panel HTML (appended to document.body)
├── style.css          # Glassmorphism styling, docking, animations
├── README.md          # User/admin-facing docs
├── LICENSE            # AGPL-3.0
└── CLAUDE.md          # This file — dev context for AI-assisted coding
```

## Architecture

- **No server component.** Everything runs in the browser via `fetch()` to Lovense Cloud endpoints.
- **No relative imports.** All SillyTavern APIs accessed through `SillyTavern.getContext()`.
- **DEV_TOKEN** is a hardcoded constant at line 4 of `index.js`. It is never stored in extension settings or exposed in the UI.
- **Settings** (isEnabled, uid, dockSide, actions, intensityModifiers, modifierScale) are persisted via `SillyTavern.getContext().extensionSettings` and `saveSettingsDebounced()`.
- **Keyword-driven automation.** No AI prompting or tag parsing. The extension scans the AI's natural language for user-configured keywords and builds combined commands.
- **Glassmorphism floating panel.** The UI is a fixed-position panel appended to `document.body`, not the Extensions sidebar. Accessible from the wand menu (`#extensionsMenu`).

## Key APIs

### Lovense Cloud API
- **QR Code:** `POST https://api.lovense.com/api/lan/getQrCode` — returns a QR image URL for pairing
- **Commands:** `POST https://api.lovense.com/api/lan/v2/command` — sends Function, Preset, and GetToys commands
- **Function command:** Vibrate/Rotate/Pump/Thrusting/Fingering/Suction/Oscillate/Depth/Stop — supports combined action strings like `"Vibrate:10,Rotate:15"`
- **Preset command:** pulse/wave/fireworks/earthquake — built-in dynamic patterns (manual buttons only)
- **GetToys command:** Returns connected toy names, battery levels, and connection status
- All require `token` (DEV_TOKEN), `uid` (per-user session ID), and `apiVer: 1`

### SillyTavern Context API
- `SillyTavern.getContext()` provides: `extensionSettings`, `saveSettingsDebounced`, `eventSource`, `event_types`, `chat`
- Event hook: `eventSource.on(event_types.MESSAGE_RECEIVED, callback)` — fires with a message index (number)
- Message text is at `context.chat[messageIndex].mes`

### SillyTavern Wand Menu
- `#extensionsMenu` — dropdown menu container triggered by wand icon in chat bar
- Menu items use `.list-group-item .flex-container .flexGap5` classes
- Icons use `.extensionsMenuExtensionButton` class with FontAwesome icons

## Execution Flow

1. **jQuery ready** -> `initSettings()` (with v1.x/v2.x migration) -> `loadSettings()` -> hook `MESSAGE_RECEIVED` event
2. **`loadSettings()`** -> `$.get()` settings.html -> append to `document.body` -> inject wand menu button into `#extensionsMenu` -> apply dock side -> bind all events
3. **User clicks wand menu -> "Lovense Cloud"** -> `togglePanel()` -> panel slides in from docked side
4. **User clicks Generate QR** -> `getQrCode()` -> POST to Lovense -> display QR image -> auto-query toy status after 15s
5. **User scans QR** with Lovense Remote app -> toy is now linked to this `uid`
6. **AI sends message** -> `onMessageReceived(index)` -> detect intensity modifier -> scan keywords per action -> build combined command -> `sendCommand()`
7. **Manual test** -> buttons call `sendCommand("Vibrate:N")` or `sendPreset("pulse")` directly
8. **Toy status** -> `getToyStatus()` queries connected toys -> `renderToyStatus()` displays in UI

## UI Architecture

### Floating Panel
- `#lovense-panel` — `position: fixed`, appended to `document.body`
- Glassmorphism: `backdrop-filter: blur(20px) saturate(1.2)`, semi-transparent bg, light borders, dual shadows with accent glow
- `::before` pseudo for diagonal shimmer gradient, `::after` for top-edge refraction
- Docks left or right via `.lovense-dock-left` / `.lovense-dock-right` classes
- Animated open/close: `transform: translateX()` + `opacity` with 300ms Material easing
- 10px margin on all four sides — panel floats with fully rounded corners, never flush to viewport edge
- Dismiss: close button (X), Escape key, or toggle via wand menu. Clicking outside does **not** dismiss.

### Wand Menu Button
- `#lovense-wand-btn` — appended to `#extensionsMenu`
- Standard ST pattern: `.list-group-item .flex-container .flexGap5` with `.extensionsMenuExtensionButton` icon

### Panel Structure
```
#lovense-panel
├── .lovense-panel-header (title + dock toggle + close button)
└── .lovense-panel-body (scrollable)
    ├── Enable toggle
    ├── Connection (QR code)
    ├── Toy Status
    ├── Manual Test + Presets
    ├── Keyword Triggers (8 collapsible action groups + modifiers)
    ├── Footer links
    └── Version identifier
```

## Settings Structure

```js
settings = {
    isEnabled: true,
    uid: "st_client_xxx",
    dockSide: "right",  // "left" or "right"
    actions: {
        Vibrate:   { keywords: "shiver,shake,throb,...", baseIntensity: 10 },
        Rotate:    { keywords: "twist,swirl,spin,...",   baseIntensity: 10 },
        Pump:      { keywords: "inflate,swell,...",      baseIntensity: 2  },
        Thrusting: { keywords: "thrust,pound,...",       baseIntensity: 10 },
        Fingering: { keywords: "curl,probe,...",         baseIntensity: 10 },
        Suction:   { keywords: "suck,suction,...",       baseIntensity: 10 },
        Oscillate: { keywords: "sway,rock,...",          baseIntensity: 10 },
        Depth:     { keywords: "hilt,bottom out,...",    baseIntensity: 2  },
    },
    intensityModifiers: {
        low:  ["gentle", "softly", "light", ...],
        high: ["hard", "intense", "rough", ...],
    },
    modifierScale: { low: 0.5, high: 1.5 },
}
```

`ACTION_MAX` is a separate constant (not in settings) defining API max intensity per action type.

## Automation Engine

`onMessageReceived()` flow:
1. **Detect intensity modifier** — scan text for low/high modifier words using word-boundary matching (`\bword\b`). High wins if both present. Returns a multiplier (0.5, 1.0, or 1.5).
2. **Scan keywords per action** — for each action type, check if any keyword appears in the text via `text.includes(word)`.
3. **Compute intensity** — `Math.round(baseIntensity * modifier)`, clamped to `[1, ACTION_MAX]`.
4. **Build combined action** — all matched actions joined: `"Vibrate:12,Rotate:15"`.
5. **Send** — `sendCommand(combined)`. If no keywords match, do nothing (silent).

Key behaviors:
- **Stacking** — multiple action types can fire simultaneously from one message
- **Continuous** — all commands use `timeSec: 0` (run until replaced)
- **`stopPrevious: 1`** — each new command replaces the previous one
- Presets are manual-only (UI buttons), not keyword-triggered

## Settings Migration

`initSettings()` handles migrations:
- **v1.x -> v2.0:** If old flat `settings.keywords` string exists, merge into `actions.Vibrate.keywords`, then delete `settings.keywords`
- **v2.x -> v3.0:** If `dockSide` missing, default to `"right"`
- Backfills missing action types and modifier fields from defaults

## Panel Control Functions

- `togglePanel()` — show/hide panel with slide animation
- `dismissPanel()` — close panel with slide-out, delayed `display: none`
- `setDockSide(side)` — swap dock side, disable transitions during swap to avoid cross-screen slide, persist preference

## CSS Design

- **Glass tokens:** `--lovense-glass-bg`, `--lovense-glass-border`, `--lovense-glass-blur`, `--lovense-glass-shadow`, `--lovense-glass-glow`, `--lovense-accent`
- **Floating margins:** `top: 10px; bottom: 10px; right/left: 10px` — panel never touches viewport edge
- **Docking:** `.lovense-dock-left` / `.lovense-dock-right` set position; both use `border-radius: 12px` (all corners rounded)
- **Animation:** `.lovense-hidden` applies `translateX(±100%)` + `opacity: 0`; transition is 300ms Material easing
- **Button sizing:** `.lovense-btn-grid .menu_button` and `.lovense-link-btn` use `font-size: 0.8em` for compact fit
- **Responsive:** `@media (max-width: 768px)` makes panel full-width with zero margins

## Development Notes

- The extension folder must be at `scripts/extensions/third-party/SillyTavern-Lovense-Cloud/` relative to ST's public directory.
- `extensionFolderPath` is used to load `settings.html` via `$.get()`.
- Panel HTML is appended to `document.body`, **not** `#extensions_settings`.
- Wand menu button is appended to `#extensionsMenu` following ST's standard pattern.
- `toastr` (global in ST) is used for user-facing notifications.
- jQuery is available globally in ST — used for DOM manipulation and AJAX.
- The `uid` is regenerated each time QR is generated (fresh session).
- `sendCommand(action)` takes an action string like `"Vibrate:10"`, `"Vibrate:10,Rotate:15"`, or `"Stop"`. All commands run continuously (`timeSec: 0`).
- `sendPreset(name)` sends a Preset command (pulse/wave/fireworks/earthquake). Runs continuously (`timeSec: 0`).
- `getToyStatus()` queries connected toys via GetToys command. Returns toy name, battery, connection status.
- `renderToyStatus(data)` parses GetToys response and updates the UI status display.
- `textContainsWord(text, word)` uses `\b` word-boundary regex for modifier words to avoid false positives (e.g., "light" in "spotlight").
- Action keywords use simple `text.includes(word)` since they are user-curated.
- UI uses collapsible `.lovense-action-group` sections for per-action keyword/intensity config.
- `updateActionPreview(actionName)` shows keyword count in each collapsed header.
- Click-outside dismiss was **intentionally removed** — panel stays open until user explicitly closes it (X, Escape, or wand toggle).
- Dock switch disables CSS transitions temporarily to avoid visible cross-screen slide.
- Panel uses `position: fixed` on `document.body` (not inside `#sheld`) to avoid overflow clipping by parent containers.
