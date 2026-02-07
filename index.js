// 1. CORRECT IMPORT PATH (Three levels up for 'third-party' folder)
import {
    extension_settings,
    saveSettingsDebounced,
} from "../../../extensions.js";

// 2. DEFINE NAME & PATH
const extensionName = "lovense-cloud";
// This path must match where your folder actually is
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

    const url = "https://api.lovense.com/api/lan/getQrCode";
    const payload = {
        token: settings.devToken,
        uid: settings.uid,
        uname: "SillyTavern User",
        v: 2
    };

    $("#lovense-qr-container").html('<i class="fa-solid fa-spinner fa-spin"></i> Loading QR...');

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.result === true) {
            $("#lovense-qr-container").html(`
                <img src="${data.message}" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid var(--smart-theme-body-color);">
                <div style="margin-top:5px; font-size:0.8em; opacity:0.7;">
                    Scan with <b>Lovense Remote App</b>
                </div>
            `);
            toastr.success("QR Code Generated. Scan it now!");
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
    
    // In newer ST versions, the event might be a CustomEvent where data is in 'detail'
    // or it might be passed directly. We check both.
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
        // Load the HTML content
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        
        // Inject into the settings menu
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
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

// --- INITIALIZATION ---

jQuery(async () => {
    // 1. Load the UI
    await loadSettings();
    
    // 2. Hook into the Global Event Source
    // We check if it exists globally first to avoid the import error
    if (window.eventSource) {
        // We use the string "MESSAGE_RECEIVED" directly to avoid import issues
        window.eventSource.on("MESSAGE_RECEIVED", onMessageReceived);
        console.log("[Lovense] Automation hooked.");
    } else {
        console.warn("[Lovense] eventSource not found. Automation disabled.");
    }
});