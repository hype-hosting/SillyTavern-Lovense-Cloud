# Lovense Cloud for SillyTavern

A client-side extension for **SillyTavern** that allows AI characters to control your **Lovense** toys dynamically during chat.

This extension uses the **Lovense Cloud API**. This means it works well for:
* ✅ Cloud-hosted multi-user SillyTavern instances (e.g., Render, HuggingFace, personal VPS)
* ✅ Locally hosted SillyTavern

## Links <img width="50" height="50" alt="eaf1e30110004a348e2899119d0bbe6c" src="https://github.com/user-attachments/assets/b2adf3ea-3b26-4cb8-8fb9-17de432a30b4" />

* [**Lovense Discount**](https://www.lovense.com/r/uo3mr6)
* [**Hype Discord**](https://discord.gg/therealhype)
* [**Support Hyperion**](https://ko-fi.com/hype)

## Features

* **Zero Prompt Engineering:** No character card setup or AI prompting needed. The extension reads the AI's natural language and handles everything.
* **Keyword-Driven Automation:** Customize keyword lists per action type. When the AI writes naturally, matching keywords trigger the right toy action automatically.
* **Command Stacking:** Multiple actions can fire simultaneously. If the AI mentions both shivering and twisting, vibrate and rotate combine into one command.
* **Intensity Modifiers:** Words like "gentle" or "harder" in the AI's text automatically adjust intensity up or down from your base setting.
* **Full Toy Support:** Vibrate, Rotate, Pump, Thrust, Finger, Suction, Oscillate, Depth — supports the entire Lovense lineup.
* **Preset Patterns:** Built-in dynamic patterns — Pulse, Wave, Fireworks, Earthquake — available via manual buttons.
* **Toy Status:** See connected toy name, battery level, and connection status in the UI.
* **QR Code Pairing:** Connect your toy simply by scanning a QR code with the Lovense Remote app.
* **Manual Control:** Test vibrations and presets directly from the extension UI.

---

## Installation

### Method 1: Git Clone (Recommended)
1.  Navigate to your SillyTavern installation folder.
2.  Open a terminal in `/public/scripts/extensions/third-party/`.
3.  Clone this repository:
    ```bash
    git clone https://github.com/hype-hosting/SillyTavern-Lovense-Cloud.git lovense-cloud
    ```
4.  Restart SillyTavern.

### Method 2: Manual Install
1.  Download the ZIP file of this repo.
2.  Extract the contents into a new folder named `lovense-cloud` inside `/public/scripts/extensions/third-party/`.
3.  Restart SillyTavern.

---

## Setup & Connection

### Server Admin Setup

The Lovense Developer Token is configured in the extension source code, not in the UI. This keeps the token hidden from end users.

1.  **Get Your Token:**
    * Go to the [Lovense Developer Dashboard](https://www.lovense.com/user/developer/info).
    * Log in and create a "Standard Solution" application (name it whatever you want).
    * Copy the **Developer Token**.

2.  **Configure the Token:**
    * Open `index.js` in the extension folder (`/public/scripts/extensions/third-party/lovense-cloud/index.js`).
    * Find line 4 at the top of the file:
      ```js
      const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";
      ```
    * Replace `PASTE_YOUR_TOKEN_HERE` with your actual token:
      ```js
      const DEV_TOKEN = "your-actual-token-here";
      ```
    * Save the file and restart SillyTavern.

### User Setup

3.  **Connect Toy:**
    * Open SillyTavern and go to **Extensions** (Puzzle Piece icon).
    * Find **Lovense Cloud** and expand the settings.
    * Click the **Generate QR Code** button.
    * Open the **Lovense Remote App** (Pink Icon) on your phone.
    * Tap the `+` or "Scan" button and scan the QR code on your screen.
    * *Note: Ensure your toy is already connected to the app via Bluetooth.*

4.  **Test:**
    * Click the **Low**, **Med**, or **High** button in the extension. If your toy vibrates, you are ready to go!

---

## How It Works

The extension scans each AI response for keywords you've configured and automatically triggers the matching toy actions. No character card changes or AI prompting needed — the AI just writes naturally.

### Keyword Triggers
Each toy action type has its own keyword list and base intensity slider. When the AI's response contains a keyword, that action fires.

**Default keyword mappings:**

| Action | Default Keywords | Intensity Range |
|--------|-----------------|-----------------|
| **Vibrate** | shiver, shake, throb, tingle, buzz, hum, tremble, quiver, shudder | 0-20 |
| **Rotate** | twist, swirl, spin, grind, circle, gyrate, coil | 0-20 |
| **Pump** | inflate, swell, expand, fill, bulge | 0-3 |
| **Thrusting** | thrust, pound, slam, drive, plunge, ram, buck, lunge | 0-20 |
| **Fingering** | curl, probe, press inside, hook | 0-20 |
| **Suction** | suck, suction, latch, clamp, vacuum | 0-20 |
| **Oscillate** | sway, rock, undulate, ripple, flutter | 0-20 |
| **Depth** | hilt, bottom out, fully inside | 0-3 |

You can customize every keyword list and intensity slider in the extension settings.

### Command Stacking
Multiple keywords from different action types can trigger in the same message. The extension combines them into one command. For example, if the AI writes *"she shivers and twists against you"*, and you have "shiver" under Vibrate and "twist" under Rotate, the extension sends both Vibrate and Rotate simultaneously.

### Intensity Modifiers
The extension also scans for intensity modifier words that adjust the strength up or down from your base setting:
* **Low modifiers** (default 0.5x): gentle, softly, light, tender, slow, faint, barely, subtle...
* **High modifiers** (default 1.5x): hard, intense, rough, fast, furious, aggressive, powerful, fierce...

For example, if your Vibrate base intensity is 10 and the AI writes *"she gently shivers"*, the extension sends Vibrate at 5 (10 x 0.5). If it writes *"she shivers intensely"*, it sends Vibrate at 15 (10 x 1.5).

### Presets
Pulse, Wave, Fireworks, and Earthquake are available as manual buttons in the extension UI. These are built-in Lovense patterns that run continuously until stopped

---

## Troubleshooting

* **"Developer Token not configured" error:**
    * The server admin has not set the token in `index.js`. See **Server Admin Setup** above.
* **"Network Error" or QR Code doesn't load:**
    * Ask the server admin to verify the Developer Token is correct and has no extra spaces.
    * Ensure you have an internet connection.
* **Toy doesn't vibrate after scanning:**
    * Make sure the **Lovense Remote App** is open and running in the foreground on your phone.
    * Ensure the toy icon in the app is green (connected).
* **Some commands don't seem to work:**
    * Not all Lovense toys support every action. Vibrate works on all toys, but Rotate, Thrust, Finger, Suction, Oscillate, Pump, and Depth require specific toy models. Unsupported actions are silently ignored by the toy.
* **Toy triggers too often / not enough:**
    * Customize the keyword lists in the extension settings. Remove words that cause false triggers, or add more specific words for your preferred scenarios. Adjust the base intensity sliders to your preference.
* **Mixed Content Warnings:**
    * This extension uses the official Cloud API (`https://api.lovense.com`), so it should **not** trigger mixed content warnings (HTTP vs HTTPS), making it safe for hosted instances.

---

## Links

* [Lovense Discount](https://www.lovense.com/r/uo3mr6)
* [Hype Discord](https://discord.gg/therealhype)
* [Support Hype](https://ko-fi.com/hype)

## Credit

* Though this extension stands on its own and uses it's own code, it was inspired by the local Lovense extension by [SpicyMarinara](https://spicymarinara.github.io/). Be sure and support their work as well.

## License
AGPL-3.0 — See [LICENSE](LICENSE) for details.
