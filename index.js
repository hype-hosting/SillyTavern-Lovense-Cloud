import {
    extension_settings,
    saveSettingsDebounced,
    eventSource,
    event_types,
} from "../../extensions.js"; // <--- Note the correct double dot path

const extensionName = "lovense-cloud";
const defaultSettings = {
    isEnabled: true,
    devToken: "",
    uid: "",
    defaultTime: 5,
    keywords: "shiver,shake,throb,pulse",
};

let settings = extension_settings[extensionName] || defaultSettings;

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

// --- AUTOMATION LOGIC ---

function onMessageReceived(data) {
    if (!settings.isEnabled) return;
    const text = data.content?.toLowerCase() || "";
    
    // Explicit Tags
    const explicitMatch = text.match(/\[vibe:\s*(\d+)(?::(\d+))?\]/i);
    if (explicitMatch) {
        const strength = parseInt(explicitMatch[1]);
        const time = explicitMatch[2] ? parseInt(explicitMatch[2]) : settings.defaultTime;
        sendCommand(strength, time);
        return; 
    }

    // Keywords
    const keywords = settings.keywords.split(",").map(s => s.trim());
    for (const word of keywords) {
        if (text.includes(word)) {
            sendCommand(10, 3);
            break; 
        }
    }
}

// --- UI CONSTRUCTION (ROBUST VERSION) ---

function addSettingsUI() {
    // 1. Check if the container exists
    const container = $("#extensions_settings");
    if (container.length === 0) {
        console.log("[Lovense Cloud] UI not ready yet. Retrying in 500ms...");
        setTimeout(addSettingsUI, 500); // Retry Loop
        return;
    }

    // 2. Check if we already injected (to prevent duplicates)
    if (container.find(".lovense-cloud-settings").length > 0) return;

    const html = `
    <div class="lovense-cloud-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Lovense Cloud</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="display:none;">
                <div class="flex-container">
                    <label class="checkbox_label">
                        <input type="checkbox" id="lovense-enable" ${settings.isEnabled ? "checked" : ""}>
                        Enable functionality
                    </label>
                    <hr>
                    <label>
                        Developer Token 
                        <a href="https://www.lovense.com/user/developer/info" target="_blank" style="float:right;">Get Token</a>
                    </label>
                    <input type="password" id="lovense-token" class="text_pole" value="${settings.devToken}" placeholder="Paste token here">
                    
                    <div id="lovense-qr-container" style="text-align: center; margin: 15px 0; min-height: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); border-radius: 5px;">
                        <span style="opacity: 0.5; font-style: italic;">QR Code will appear here</span>
                    </div>
                    
                    <button id="lovense-get-qr" class="menu_button">
                        <i class="fa-solid fa-qrcode"></i> Generate QR Code
                    </button>

                    <hr>
                    <div class="header_label">Manual Test</div>
                    <div style="display: flex; gap: 5px;">
                        <button id="lovense-low" class="menu_button">Low</button>
                        <button id="lovense-med" class="menu_button">Med</button>
                        <button id="lovense-high" class="menu_button">High</button>
                        <button id="lovense-stop" class="menu_button">Stop</button>
                    </div>
                     <hr>
                    <label>Trigger Keywords (comma separated)</label>
                    <textarea id="lovense-keywords" class="text_pole" rows="2">${settings.keywords}</textarea>
                </div>
            </div>
        </div>
    </div>
    `;

    container.append(html);

    // Bindings
    $("#lovense-enable").on("change", (e) => { settings.isEnabled = e.target.checked; saveSettings(); });
    $("#lovense-token").on("input", (e) => { settings.devToken = e.target.value; saveSettings(); });
    $("#lovense-keywords").on("input", (e) => { settings.keywords = e.target.value; saveSettings(); });
    
    $("#lovense-get-qr").on("click", getQrCode);
    
    $("#lovense-low").on("click", () => sendCommand(5));
    $("#lovense-med").on("click", () => sendCommand(10));
    $("#lovense-high").on("click", () => sendCommand(20));
    $("#lovense-stop").on("click", () => sendCommand(0));
    
    console.log("[Lovense Cloud] UI Injected Successfully.");
}

function saveSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

// --- INITIALIZATION ---
jQuery(async () => {
    // Start the UI injection loop
    addSettingsUI();
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
});