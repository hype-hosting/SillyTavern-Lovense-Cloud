// 1. CORRECT IMPORT PATH
// We only import 'extension_settings' now.
import {
    extension_settings
} from "../../../extensions.js";

// 2. DEFINE NAME & PATH
const extensionName = "lovense-cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`; 

// 3. DEFAULT SETTINGS
const defaultSettings = {
    isEnabled: true,
    devToken: "",
    uid: "",
    defaultTime: 5,
    keywords: "shiver,shake,throb,pulse",
};

// Merge saved settings with defaults
let settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);

// Generate a persistent ID if missing
if (!settings.uid) {
    settings.uid = "st_client_" + Math.random().toString(36).substr(2, 9);
    saveSettings();
}

// --- LOVENSE API FUNCTIONS ---

async function getQrCode() {
    if (!settings.devToken) {
        toastr.warning("Please enter your Lovense Developer Token first.");
        return;
    }

    // --- THE FIX: FORCE A FRESH SESSION ---
    // We generate a new random User ID every time you request a QR code.
    // This forces the Lovense server to give us a brand new linking image.
    settings.uid = "st_client_" + Math.random().toString(36).substr(2, 9);
    
    // Save this new ID so we use it for future commands
    saveSettings(); 
    console.log("[Lovense] Generated new UID:", settings.uid);

    const url = "https://api.lovense.com/api/lan/getQrCode";
    const payload = {
        token: settings.devToken,
        uid: settings.uid,
        uname: "SillyTavern User",
        v: 2
    };

    $("#lovense-qr-container").html('<i class="fa-solid fa-spinner fa-spin"></i> Contacting Lovense...');

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        console.log("[Lovense Debug] API Response:", data);

        if (data.result === true) {
            // Check if we got a URL (Secure or non-secure)
            if (data.message && (data.message.startsWith("http") || data.message.startsWith("https"))) {
                $("#lovense-qr-container").html(`
                    <img src="${data.message}" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid var(--smart-theme-body-color);">
                    <div style="margin-top:5px; font-size:0.8em; opacity:0.7;">
                        Scan with <b>Lovense Remote App</b>
                    </div>
                `);
                toastr.success("New QR Code received.");
            } else {
                // If we STILL get just "Success" even with a new UID, something else is up.
                $("#lovense-qr-container").html(`
                    <div style="padding: 20px; text-align: center;">
                        <i class="fa-solid fa-check-circle" style="font-size: 3em; color: #4CAF50; margin-bottom: 10px;"></i><br>
                        <b>Server says: ${data.message}</b><br>
                        <span style="font-size: 0.8em; opacity: 0.7;">
                           If no image appears, check your 
                           <a href="https://www.lovense.com/user/developer/info" target="_blank">Developer Token</a>.
                        </span>
                    </div>
                `);
                toastr.success("Lovense returned: " + data.message);
            }
        } else {
            $("#lovense-qr-container").html("Error loading QR.");
            toastr.error("Lovense Error: " + data.message);
        }
    } catch (e) {
        console.error(e);
        $("#lovense-qr-container").html("Network Error.");
        toastr.error("Could not reach Lovense API.");
    }
}

async function sendCommand(strength, timeSec = 0) {
    if (!settings.isEnabled || !settings.devToken) return;

    const action = strength === 0 ? "Stop" : `Vibrate:${strength}`;
    const payload = {
        token: settings.devToken,
        uid: settings.uid,
        command: "Function",
        action: action,
        timeSec: timeSec,
        apiVer: 1
    };

    console.log(`[Lovense] Sending: ${action} for ${timeSec}s`);

    try {
        await fetch("https://api.lovense.com/api/lan/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("[Lovense] Command Failed:", e);
    }
}

// --- AUTOMATION ---

function onMessageReceived(event) {
    if (!settings.isEnabled) return;
    
    const data = event.detail ? event.detail : event;
    const text = data.content?.toLowerCase() || "";
    
    // 1. Explicit Tags: [vibe:10]
    const explicitMatch = text.match(/\[vibe:\s*(\d+)(?::(\d+))?\]/i);
    if (explicitMatch) {
        const strength = parseInt(explicitMatch[1]);
        const time = explicitMatch[2] ? parseInt(explicitMatch[2]) : settings.defaultTime;
        sendCommand(strength, time);
        return; 
    }

    // 2. Keywords
    const keywords = (settings.keywords || "").split(",").map(s => s.trim());
    for (const word of keywords) {
        if (word && text.includes(word)) {
            sendCommand(10, 3);
            break; 
        }
    }
}

// --- UI LOADING ---

async function loadSettings() {
    console.log("[Lovense] Loading UI from:", `${extensionFolderPath}/settings.html`);
    
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);

        // Populate Fields
        $("#lovense-enable").prop("checked", settings.isEnabled);
        $("#lovense-token").val(settings.devToken);
        $("#lovense-keywords").val(settings.keywords);

        // Bind Listeners
        $("#lovense-enable").on("change", (e) => { settings.isEnabled = e.target.checked; saveSettings(); });
        $("#lovense-token").on("input", (e) => { settings.devToken = e.target.value; saveSettings(); });
        $("#lovense-keywords").on("input", (e) => { settings.keywords = e.target.value; saveSettings(); });
        
        $("#lovense-get-qr").on("click", getQrCode);
        $("#lovense-low").on("click", () => sendCommand(5));
        $("#lovense-med").on("click", () => sendCommand(10));
        $("#lovense-high").on("click", () => sendCommand(20));
        $("#lovense-stop").on("click", () => sendCommand(0));
        
        console.log("[Lovense] UI Loaded Successfully.");

    } catch (err) {
        console.error("[Lovense] Failed to load settings.html", err);
        toastr.error("Lovense Extension: Could not load settings.html");
    }
}

function saveSettings() {
    // Update the master settings object
    extension_settings[extensionName] = settings;
    
    // Try to find the correct save function in the global scope
    if (window.saveSettingsDebounced) {
        window.saveSettingsDebounced();
    } else if (window.saveExtensionSettings) {
        window.saveExtensionSettings();
    } else {
        console.warn("[Lovense] Could not find a way to save settings!");
    }
}

// --- INITIALIZATION ---

jQuery(async () => {
    await loadSettings();
    
    if (window.eventSource) {
        window.eventSource.on("MESSAGE_RECEIVED", onMessageReceived);
        console.log("[Lovense] Automation hooked.");
    } else {
        console.warn("[Lovense] eventSource not found. Automation disabled.");
    }
});