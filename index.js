import {
    extension_settings,
    saveSettingsDebounced,
    eventSource,
    event_types,
} from "../../../extensions.js"; // <--- Updated path for 'third-party' folder

const extensionName = "lovense-cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`; // <--- Helper to find files

const defaultSettings = {
    isEnabled: true,
    devToken: "",
    uid: "",
    defaultTime: 5,
    keywords: "shiver,shake,throb,pulse",
};

// Merge settings
let settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);

if (!settings.uid) {
    settings.uid = "st_client_" + Math.random().toString(36).substr(2, 9);
    saveSettings();
}

// --- LOVENSE API ---
async function getQrCode() {
    if (!settings.devToken) {
        toastr.warning("Please enter your Lovense Developer Token first.");
        return;
    }
    const url = "https://api.lovense.com/api/lan/getQrCode";
    const payload = { token: settings.devToken, uid: settings.uid, uname: "SillyTavern User", v: 2 };
    
    $("#lovense-qr-container").html('<i class="fa-solid fa-spinner fa-spin"></i> Loading QR...');

    try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)});
        const data = await response.json();

        if (data.result === true) {
            $("#lovense-qr-container").html(`<img src="${data.message}" style="width: 200px; height: 200px; border-radius: 8px;">`);
            toastr.success("Scan this with the Lovense Remote App!");
        } else {
            $("#lovense-qr-container").html("Error.");
            toastr.error("Lovense Error: " + data.message);
        }
    } catch (e) {
        console.error(e);
        toastr.error("Network Error.");
    }
}

async function sendCommand(strength, timeSec = 0) {
    if (!settings.isEnabled || !settings.devToken) return;
    const action = strength === 0 ? "Stop" : `Vibrate:${strength}`;
    const payload = { token: settings.devToken, uid: settings.uid, command: "Function", action: action, timeSec: timeSec, apiVer: 1 };
    
    console.log(`[Lovense] Sending: ${action}`);
    try {
        fetch("https://api.lovense.com/api/lan/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (e) { console.error(e); }
}

// --- AUTOMATION ---
function onMessageReceived(data) {
    if (!settings.isEnabled) return;
    const text = data.content?.toLowerCase() || "";
    
    const explicitMatch = text.match(/\[vibe:\s*(\d+)(?::(\d+))?\]/i);
    if (explicitMatch) {
        sendCommand(parseInt(explicitMatch[1]), explicitMatch[2] ? parseInt(explicitMatch[2]) : settings.defaultTime);
        return; 
    }

    const keywords = (settings.keywords || "").split(",").map(s => s.trim());
    for (const word of keywords) {
        if (word && text.includes(word)) {
            sendCommand(10, 3);
            break; 
        }
    }
}

// --- UI LOADING (The New Standard Method) ---
async function loadSettings() {
    // 1. Fetch the HTML file
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    
    // 2. Append it to the settings container
    $("#extensions_settings").append(settingsHtml);

    // 3. Populate Inputs with Saved Values
    $("#lovense-enable").prop("checked", settings.isEnabled);
    $("#lovense-token").val(settings.devToken);
    $("#lovense-keywords").val(settings.keywords);

    // 4. Bind Listeners
    $("#lovense-enable").on("change", (e) => { settings.isEnabled = e.target.checked; saveSettings(); });
    $("#lovense-token").on("input", (e) => { settings.devToken = e.target.value; saveSettings(); });
    $("#lovense-keywords").on("input", (e) => { settings.keywords = e.target.value; saveSettings(); });
    $("#lovense-get-qr").on("click", getQrCode);
    $("#lovense-low").on("click", () => sendCommand(5));
    $("#lovense-med").on("click", () => sendCommand(10));
    $("#lovense-high").on("click", () => sendCommand(20));
    $("#lovense-stop").on("click", () => sendCommand(0));
    
    console.log("[Lovense Cloud] UI Loaded via HTML template.");
}

function saveSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

// --- INIT ---
jQuery(async () => {
    // Load the HTML UI
    await loadSettings();
    // Listen for messages
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
});