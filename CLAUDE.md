# CLAUDE.md — Lovense Cloud for SillyTavern

## Project Overview

A SillyTavern third-party extension that controls Lovense toys via the Lovense Cloud API. Runs entirely client-side in the browser. The server admin hardcodes the Lovense Developer Token in the source; end users only interact with the UI (QR pairing, test buttons, keyword config).

## File Structure

```
lovense-cloud/
├── manifest.json      # ST extension manifest (name, version, entry points)
├── index.js           # All logic: API calls, automation, settings, init
├── settings.html      # UI panel injected into ST's Extensions sidebar
├── style.css          # Minimal styling for the settings panel
├── README.md          # User/admin-facing docs
├── LICENSE            # AGPL-3.0
└── CLAUDE.md          # This file — dev context for AI-assisted coding
```

## Architecture

- **No server component.** Everything runs in the browser via `fetch()` to Lovense Cloud endpoints.
- **No relative imports.** All SillyTavern APIs accessed through `SillyTavern.getContext()`.
- **DEV_TOKEN** is a hardcoded constant at line 4 of `index.js`. It is never stored in extension settings or exposed in the UI.
- **Settings** (isEnabled, uid, defaultTime, keywords) are persisted via `SillyTavern.getContext().extensionSettings` and `saveSettingsDebounced()`.

## Key APIs

### Lovense Cloud API
- **QR Code:** `POST https://api.lovense.com/api/lan/getQrCode` — returns a QR image URL for pairing
- **Commands:** `POST https://api.lovense.com/api/lan/v2/command` — sends Vibrate/Rotate/Pump/Stop commands
- Both require `token` (DEV_TOKEN), `uid` (per-user session ID), and `apiVer: 1`

### SillyTavern Context API
- `SillyTavern.getContext()` provides: `extensionSettings`, `saveSettingsDebounced`, `eventSource`, `event_types`, `chat`
- Event hook: `eventSource.on(event_types.MESSAGE_RECEIVED, callback)` — fires with a message index (number)
- Message text is at `context.chat[messageIndex].mes`

## Execution Flow

1. **jQuery ready** -> `initSettings()` -> `loadSettings()` -> hook `MESSAGE_RECEIVED` event
2. **User clicks Generate QR** -> `getQrCode()` -> POST to Lovense -> display QR image
3. **User scans QR** with Lovense Remote app -> toy is now linked to this `uid`
4. **AI sends message** -> `onMessageReceived(index)` -> check for tags or keywords -> `sendCommand(action, time)`
5. **Manual test** -> buttons call `sendCommand("Vibrate:N", defaultTime)` directly

## Automation Triggers

Two modes, checked in order (explicit tags win over keywords):
1. **Explicit tags:** `[vibe:10]`, `[rotate:15:8]`, `[pump:2]`, `[vibrate:10]` — regex: `/\[(vibe|vibrate|rotate|pump):\s*(\d+)(?::(\d+))?\]/gi`
   - Multiple tags in one message are combined: `[vibe:10][rotate:15]` -> `"Vibrate:10,Rotate:15"`
   - Strength is clamped to each type's max (Vibrate/Rotate: 0-20, Pump: 0-3)
   - Duration uses the longest `:seconds` value found, or `defaultTime` if omitted
   - Any tag with strength 0 sends `"Stop"` immediately
2. **Keywords:** comma-separated list in settings, matched via `text.includes(word)` — fires `Vibrate:10` for 10 seconds

## Development Notes

- The extension folder must be at `scripts/extensions/third-party/lovense-cloud/` relative to ST's public directory.
- `extensionFolderPath` is used to load `settings.html` via `$.get()`.
- `toastr` (global in ST) is used for user-facing notifications.
- jQuery is available globally in ST — used for DOM manipulation and AJAX.
- The `uid` is regenerated each time QR is generated (fresh session).
- `sendCommand(action, timeSec)` takes an action string like `"Vibrate:10"`, `"Rotate:15,Pump:2"`, or `"Stop"`.
- Test buttons use `settings.defaultTime` (10s); keyword triggers also fire `Vibrate:10` for 10s.
- `stopPrevious: 1` in command payload ensures new commands override running ones.
