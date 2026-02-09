# Lovense Cloud for SillyTavern

A client-side extension for **SillyTavern** that allows AI characters to control your **Lovense** toys dynamically during chat.

Unlike other solutions that require local network bridges (which fail on hosted/HTTPS instances), this extension uses the **Lovense Cloud API**. This means it works perfectly on:
* ✅ Locally hosted SillyTavern
* ✅ Cloud-hosted SillyTavern (e.g., Render, HuggingFace, personal VPS)
* ✅ Mobile browsers

## Features

* **Zero Server Config:** No need to open ports or run local servers.
* **QR Code Pairing:** Connect your toy simply by scanning a QR code with the Lovense Remote app.
* **Keyword Triggers:** Automatically vibrate when specific words (e.g., *shiver*, *throb*) appear in the chat.
* **Explicit AI Control:** Give the AI precise control using hidden tags like `[vibe:10]`.
* **Manual Control:** Test vibrations directly from the extension UI.

---

## Installation

### Method 1: Git Clone (Recommended)
1.  Navigate to your SillyTavern installation folder.
2.  Open a terminal in `/public/scripts/extensions/third-party/`.
3.  Clone this repository:
    ```bash
    git clone https://github.com/hype-hosting/HypeHub.git lovense-cloud
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

## Usage Guide

There are two ways the AI can control your toy:

### 1. Keyword Triggers (Passive)
In the extension settings, you can define a list of words (comma-separated).
* **Default:** `shiver, shake, throb, pulse`
* **Behavior:** If the AI's reply contains any of these words, the toy will vibrate at medium strength for 10 seconds.

### 2. Prompt Engineering (Active)
For the best experience, instruct the AI to use the toy explicitly. Add the following to your **Character Card** (Scenario or Example Dialogue) or **Author's Note**:

> **[System Note:]**
> You have remote control over the user's Lovense toy.
> To activate it, include the tag `[vibe:strength]` or `[vibe:strength:seconds]` in your response.
> * `strength` is a number from 0-20.
> * `seconds` is how long it lasts (default is 10).
>
> **Examples:**
> * `[vibe:5]` -> Gentle vibration.
> * `[vibe:20:10]` -> Maximum power for 10 seconds.
> * `[vibe:0]` -> Stop vibration immediately.
>
> **Usage:**
> "I'm going to tease you now. [vibe:5] Do you feel that?"

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
* **Mixed Content Warnings:**
    * This extension uses the official Cloud API (`https://api.lovense.com`), so it should **not** trigger mixed content warnings (HTTP vs HTTPS), making it safe for hosted instances.

---

## Links

* [Lovense Discount](https://www.lovense.com/r/uo3mr6)
* [Hype Discord](https://discord.gg/therealhype)
* [Support Hype](https://ko-fi.com/hype)

## License
MIT License. Feel free to fork and modify.