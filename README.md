# SillyTavern Lovense Cloud (Multi-User Fork)

**A fork of the [original extension](https://github.com/SpicyMarinara/SillyTavern-Lovense) by SpicyMarinara, modified by Hyperion for hosted/cloud SillyTavern instances.**

This version uses the **Lovense Standard (Cloud) API** instead of the Local LAN API. This allows multiple users on a public/hosted SillyTavern instance to connect their own devices remotely via QR code, without needing to be on the same network as the server.
> Support [Hyperion](http://ko-fi.com/hype)

> Support [SpicyMarinara](https://github.com/SpicyMarinara)

## Features
- **Remote Connection**: Users can connect from anywhere via the internet.
- **Multi-User Support**: Each user gets a unique session/UID.
- **QR Code Pairing**: Simple connection process using the Lovense Remote mobile app.
- **No VPN Required**: Does not require the server and user to be on the same LAN.

## Admin Requirements
**Before installing, you (the server admin) must obtain a free Developer Token from Lovense.**
1.  Go to the [Lovense Developer Dashboard](https://developer.lovense.com/).
2.  Log in and request a **Developer Token**.
3.  You will need to paste this token into the server script during installation.

---

## Installation

### 1. Install the Extension
In SillyTavern:
1.  Go to **Extensions** → **Install Extension**.
2.  Paste the URL of this repository: `https://github.com/hype-hosting/SillyTavern-Lovense-Cloud`
3.  Click **Install**.

### 2. Configure the Server Plugin (Crucial)
The extension relies on a server-side plugin to communicate with the Lovense Cloud.

**Step 1: Enable server plugins** in your `config.yaml`:
```yaml
enableServerPlugins: true
```

**Step 2: Copy and Configure the Plugin File**
1. Navigate to your SillyTavern extensions directory: `data/default-user/extensions/third-party/SillyTavern-Lovense-Cloud/server/`.
2. Open `lovense.mjs` in a text editor.
3. Find the line: `const LOVENSE_DEV_TOKEN = 'PASTE_YOUR_DEVELOPER_TOKEN_HERE';`
4. Paste your actual Developer Token inside the quotes.
5. Save the file.
6. Copy `lovense.mjs` to your SillyTavern root `plugins/` folder.
- Windows: `copy data\default-user\extensions\third-party\SillyTavern-Lovense-Cloud\server\lovense.mjs plugins\`
- Linux/Mac: `cp data/default-user/extensions/third-party/SillyTavern-Lovense-Cloud/server/lovense.mjs plugins/`

**Step 3: Restart SillyTavern** You must fully restart the SillyTavern server (node.js process) for the plugin to load.

---

## User Guide: How to Connect
1. Open **Lovense Remote** on your mobile phone.
2. Ensure your toy is connected to the app via Bluetooth.
3. In SillyTavern, go to **Extensions** → **Timeless Lovense Control**.
4. Click the "**Generate QR Code**" button.
5. In the Lovense Remote app, tap the "**+**" **(Add)** button or "**Scan QR**" feature.
6. Scan the code displayed in SillyTavern.
7. Once scanned, the status should update to **Connected**.

---

## AI Commands
The AI controls devices using invisible xml tags. These function exactly like the original extension.

**Basic Commands**
```xml
<lovense:vibrate="10" time="5"/>         - Vibrate at intensity 10 (0-20) for 5 seconds
<lovense:rotate="15" time="5"/>          - Rotate at intensity 15 (0-20) for 5 seconds
<lovense:pump="2" time="5"/>             - Pump at intensity 2 (0-3) for 5 seconds
<lovense:stop/>                          - Stop all activity
```

**Preset Patterns**
```xml
<lovense:preset name="pulse" time="10"/>      - Pulse pattern for 10 seconds
<lovense:preset name="wave" time="10"/>       - Wave pattern for 10 seconds
<lovense:preset name="fireworks" time="10"/>  - Fireworks pattern for 10 seconds
<lovense:preset name="earthquake" time="10"/> - Earthquake pattern for 10 seconds
```

**Advanced**
```xml
<lovense:vibrate="15" time="10"/>
    → Vibrate at intensity 15 for 10 seconds

<lovense:vibrate="12" loop="5" pause="2" time="20"/>
    → Vibrate at 12, run for 5s, pause for 2s, repeat for 20s total

<lovense:vibrate="10" rotate="15" time="10"/>
    → Combine multiple functions in one command
```

---

## Troubleshooting

***"Server Developer Token not configured"***
- You didn't edit `lovense.mjs` with your token, or you didn't copy the edited file to the `plugins/` folder.
- Edit the file and restart the server.

***"Failed to get QR Code"***
- Check your server logs (console).
- Ensure your server has internet access to reach `api.lovense.com`.
- Verify your Developer Token is valid.

***Device Disconnects***
- The Lovense Cloud session may time out. Simply generate a new QR code and scan again.
- Make sure you have a stable internet connection.

---

## Credits
**Original Author:** [SpicyMarinara](https://github.com/SpicyMarinara) created the original logic, UI, and command parsing.
This fork modifies the transport layer to use the Lovense Cloud API for hosted environments.

---

**Disclaimer:** This extension is for adult users only
