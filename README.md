# SillyTavern Lovense Cloud (Multi-User Fork)

**A fork of the [original extension](https://github.com/SpicyMarinara/SillyTavern-Lovense) by SpicyMarinara, modified for hosted/cloud SillyTavern instances.**

![Lovense Control](https://i.imgur.com/Zyuiqts.jpeg)

This version uses the **Lovense Standard (Cloud) API** instead of the Local LAN API. This allows multiple users on a public/hosted SillyTavern instance to connect their own devices remotely via QR code, without needing to be on the same network as the server.

## 🚀 Features
* **Remote Connection**: Users can connect from anywhere via the internet.
* **Multi-User Support**: Each user gets a unique session/UID.
* **QR Code Pairing**: Simple connection process using the Lovense Remote mobile app.
* **No VPN Required**: Does not require the server and user to be on the same LAN.

## ⚠️ Admin Requirements
**Before installing, you (the server admin) must obtain a free Developer Token from Lovense.**
1.  Go to the [Lovense Developer Dashboard](https://developer.lovense.com/).
2.  Log in and request a **Developer Token**.
3.  You will need to paste this token into the server script during installation.

---

## 📥 Installation

### 1. Install the Extension
In SillyTavern:
1.  Go to **Extensions** → **Install Extension**.
2.  Paste the URL of this repository: `https://github.com/hype-hosting/Timeless-Lovense`
3.  Click **Install**.

### 2. Configure the Server Plugin (Crucial)
The extension relies on a server-side plugin to communicate with the Lovense Cloud.

**Step 1: Enable server plugins** in your `config.yaml`:
```yaml
enableServerPlugins: true
