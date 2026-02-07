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
2.  Open a terminal in `/public/scripts/extensions/`.
3.  Clone this repository:
    ```bash
    git clone [https://github.com/your-username/lovense-cloud-st.git](https://github.com/your-username/lovense-cloud-st.git)
    ```
4.  Restart SillyTavern.

### Method 2: Manual Install
1.  Download the ZIP file of this repo.
2.  Extract the contents into a new folder named `lovense-cloud` inside `/public/scripts/extensions/`.
3.  Restart SillyTavern.

---

## Setup & Connection

To use the Cloud API, you need a free Developer Token from Lovense.

1.  **Get Your Token:**
    * Go to the [Lovense Developer Dashboard](https://www.lovense.com/user/developer/info).
    * Log in and create a "Standard Solution" application (Name it whatever you want).
    * Copy the **Developer Token**.

2.  **Configure Extension:**
    * Open SillyTavern and go to **Extensions** (Puzzle Piece icon).
    * Find **Lovense Cloud** and expand the settings.
    * Paste your **Developer Token** into the token field.

3.  **Connect Toy:**
    * Click the **Generate QR Code** button in the extension.
    * Open the **Lovense Remote App** (Pink Icon) on your phone.
    * Tap the `+` or "Scan" button and scan the QR code on your screen.
    * *Note: Ensure your toy is already connected to the app via Bluetooth.*

4.  **Test:**
    * Click the **"Med"** or **"Pulse"** button in the extension. If your toy vibrates, you are ready to go!

---

## Usage Guide

There are two ways the AI can control your toy:

### 1. Keyword Triggers (Passive)
In the extension settings, you can define a list of words (comma-separated).
* **Default:** `shiver, shake, throb, pulse`
* **Behavior:** If the AI's reply contains any of these words, the toy will vibrate at medium strength for 3 seconds.

### 2. Prompt Engineering (Active)
For the best experience, instruct the AI to use the toy explicitly. Add the following to your **Character Card** (Scenario or Example Dialogue) or **Author's Note**:

> **[System Note:]**
> You have remote control over the user's Lovense toy.
> To activate it, include the tag `[vibe:strength]` or `[vibe:strength:seconds]` in your response.
> * `strength` is a number from 0-20.
> * `seconds` is how long it lasts (default is 5).
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

* **"Network Error" or QR Code doesn't load:**
    * Verify your Developer Token is correct and has no extra spaces.
    * Ensure you have an internet connection.
* **Toy doesn't vibrate after scanning:**
    * Make sure the **Lovense Remote App** is open and running in the foreground on your phone.
    * Ensure the toy icon in the app is green (connected).
* **Mixed Content Warnings:**
    * This extension uses the official Cloud API (`https://api.lovense.com`), so it should **not** trigger mixed content warnings (HTTP vs HTTPS), making it safe for hosted instances.

## License
MIT License. Feel free to fork and modify.