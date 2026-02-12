// No relative imports — use SillyTavern.getContext() for all ST APIs.

// --- SERVER ADMIN: Paste your Lovense Developer Token below ---
const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";

const extensionName = "lovense-cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    isEnabled: true,
    uid: "",
    keywords: "shiver,shake,throb,pulse",
};

// Populated by initSettings() once SillyTavern is ready.
let settings = {};

function initSettings() {
    const context = SillyTavern.getContext();
    const extensionSettings = context.extensionSettings;
    settings = Object.assign({}, defaultSettings, extensionSettings[extensionName]);

    if (!settings.uid) {
        settings.uid = "st_client_" + Math.random().toString(36).substr(2, 9);
    }

    extensionSettings[extensionName] = settings;
    context.saveSettingsDebounced();
}

// --- LOVENSE API FUNCTIONS ---

async function getQrCode() {
    if (!DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") {
        toastr.error("Lovense Developer Token not configured. Contact the server admin.");
        return;
    }

    // Generate new session ID
    settings.uid = "st_client_" + Math.random().toString(36).substr(2, 9);
    saveSettings(); 
    console.log("[Lovense] Generated new UID:", settings.uid);

    const url = "https://api.lovense.com/api/lan/getQrCode";
    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        uname: "SillyTavern User",
        utoken: settings.uid,
        v: 2,
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
            const qrUrl = (data.data && data.data.qr) || (data.data && data.data.qrcode) || data.message;

            if (qrUrl && qrUrl.startsWith("http")) {
                $("#lovense-qr-container").html(`
                    <img src="${qrUrl}" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid var(--smart-theme-body-color);">
                    <div style="margin-top:5px; font-size:0.8em; opacity:0.7;">
                        Scan with <b>Lovense Remote App</b>
                    </div>
                `);
                toastr.success("New QR Code received.");
                // Auto-check toy status after a delay (user needs time to scan)
                setTimeout(async () => {
                    const status = await getToyStatus();
                    renderToyStatus(status);
                }, 15000);
            } else {
                // Fallback if we still can't find a URL
                $("#lovense-qr-container").html(`
                    <div style="padding: 20px; text-align: center;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 3em; color: orange; margin-bottom: 10px;"></i><br>
                        <b>Parsed 'Success' but found no URL.</b><br>
                        <span style="font-size: 0.8em; opacity: 0.7;">Check Console (F12) to see the raw data object.</span>
                    </div>
                `);
                toastr.warning("Lovense returned Success but no Image.");
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

// action: a pre-built action string like "Vibrate:10", "Rotate:15", "Pump:2", or "Stop".
async function sendCommand(action) {
    if (!settings.isEnabled || !DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") return;

    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        command: "Function",
        action: action,
        timeSec: 0,
        stopPrevious: 1,
        apiVer: 1,
    };

    console.log(`[Lovense] Sending: ${action} (continuous)`);

    try {
        const response = await fetch("https://api.lovense.com/api/lan/v2/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.log("[Lovense] Command response:", data);
    } catch (e) {
        console.error("[Lovense] Command Failed:", e);
    }
}

// name: one of "pulse", "wave", "fireworks", "earthquake".
async function sendPreset(name) {
    if (!settings.isEnabled || !DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") return;

    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        command: "Preset",
        name: name,
        timeSec: 0,
        apiVer: 1,
    };

    console.log(`[Lovense] Sending preset: ${name} (continuous)`);

    try {
        const response = await fetch("https://api.lovense.com/api/lan/v2/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.log("[Lovense] Preset response:", data);
    } catch (e) {
        console.error("[Lovense] Preset Failed:", e);
    }
}

// Queries connected toys and returns their info.
async function getToyStatus() {
    if (!DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") return null;

    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        command: "GetToys",
        apiVer: 1,
    };

    try {
        const response = await fetch("https://api.lovense.com/api/lan/v2/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.log("[Lovense] GetToys response:", data);
        return data;
    } catch (e) {
        console.error("[Lovense] GetToys Failed:", e);
        return null;
    }
}

function renderToyStatus(data) {
    const container = $("#lovense-toy-status");
    if (!container.length) return;

    if (!data || data.code !== 200 || !data.data || !data.data.toys) {
        container.html('<span style="opacity:0.5; font-style:italic; font-size:0.85em;">No toys detected. Scan QR and connect first.</span>');
        return;
    }

    let toys;
    try {
        toys = typeof data.data.toys === "string" ? JSON.parse(data.data.toys) : data.data.toys;
    } catch (e) {
        container.html('<span style="opacity:0.5; font-style:italic; font-size:0.85em;">Could not parse toy data.</span>');
        return;
    }

    const entries = Object.values(toys);
    if (entries.length === 0) {
        container.html('<span style="opacity:0.5; font-style:italic; font-size:0.85em;">No toys connected.</span>');
        return;
    }

    const html = entries.map(toy => {
        const status = toy.status === "1" || toy.status === 1;
        const icon = status ? "fa-circle-check" : "fa-circle-xmark";
        const color = status ? "#4caf50" : "#f44336";
        const name = toy.nickName || toy.name || "Unknown";
        const battery = toy.battery != null ? `${toy.battery}%` : "?";
        return `<div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
            <i class="fa-solid ${icon}" style="color:${color};"></i>
            <span style="font-weight:bold; text-transform:capitalize;">${name}</span>
            <span style="opacity:0.6; font-size:0.85em;"><i class="fa-solid fa-battery-half"></i> ${battery}</span>
        </div>`;
    }).join("");

    container.html(html);
}

// --- AUTOMATION ---

// Tag-to-action mapping. Strength ranges vary by type.
const TAG_MAP = {
    vibe:      { action: "Vibrate",   max: 20 },
    vibrate:   { action: "Vibrate",   max: 20 },
    rotate:    { action: "Rotate",    max: 20 },
    pump:      { action: "Pump",      max: 3  },
    thrust:    { action: "Thrusting", max: 20 },
    finger:    { action: "Fingering", max: 20 },
    suction:   { action: "Suction",   max: 20 },
    oscillate: { action: "Oscillate", max: 20 },
    depth:     { action: "Depth",     max: 3  },
};

// Matches [vibe:10], [rotate:15], [thrust:8], etc. Intensity only, no duration.
const TAG_REGEX = /\[(vibe|vibrate|rotate|pump|thrust|finger|suction|oscillate|depth):\s*(\d+)\]/gi;

// Matches [pulse], [wave], [fireworks], [earthquake]. No parameters.
const PRESET_REGEX = /\[(pulse|wave|fireworks|earthquake)\]/gi;

function onMessageReceived(messageIndex) {
    if (!settings.isEnabled) return;

    try {
        const context = SillyTavern.getContext();
        const message = context.chat[messageIndex];
        if (!message) return;

        const text = (message.mes || "").toLowerCase();

        // 1. Preset Tags: [pulse], [wave], [fireworks], [earthquake]
        //    Checked first — last preset tag wins.
        let lastPreset = null;
        let presetMatch;
        PRESET_REGEX.lastIndex = 0;
        while ((presetMatch = PRESET_REGEX.exec(text)) !== null) {
            lastPreset = presetMatch;
        }

        if (lastPreset) {
            sendPreset(lastPreset[1]);
            return;
        }

        // 2. Function Tags: use the LAST tag in the message.
        //    Runs continuously until the next message changes it or user stops manually.
        let lastMatch = null;
        let match;
        TAG_REGEX.lastIndex = 0;
        while ((match = TAG_REGEX.exec(text)) !== null) {
            lastMatch = match;
        }

        if (lastMatch) {
            const tag = TAG_MAP[lastMatch[1]];
            const strength = Math.min(parseInt(lastMatch[2]), tag.max);

            if (strength === 0) {
                sendCommand("Stop");
            } else {
                sendCommand(`${tag.action}:${strength}`);
            }
            return;
        }

        // 3. Keywords — Vibrate at 10 continuously
        const keywords = (settings.keywords || "").split(",").map(s => s.trim());
        for (const word of keywords) {
            if (word && text.includes(word)) {
                sendCommand("Vibrate:10");
                break;
            }
        }
    } catch (e) {
        console.error("[Lovense] Error processing message:", e);
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
        $("#lovense-keywords").val(settings.keywords);

        // Bind Listeners
        $("#lovense-enable").on("change", (e) => { settings.isEnabled = e.target.checked; saveSettings(); });
        $("#lovense-keywords").on("input", (e) => { settings.keywords = e.target.value; saveSettings(); });
        
        $("#lovense-get-qr").on("click", getQrCode);
        $("#lovense-low").on("click", () => sendCommand("Vibrate:5"));
        $("#lovense-med").on("click", () => sendCommand("Vibrate:10"));
        $("#lovense-high").on("click", () => sendCommand("Vibrate:20"));
        $("#lovense-stop").on("click", () => sendCommand("Stop"));

        // Preset buttons
        $("#lovense-pulse").on("click", () => sendPreset("pulse"));
        $("#lovense-wave").on("click", () => sendPreset("wave"));
        $("#lovense-fireworks").on("click", () => sendPreset("fireworks"));
        $("#lovense-earthquake").on("click", () => sendPreset("earthquake"));

        // Toy status
        $("#lovense-refresh-status").on("click", async () => {
            $("#lovense-toy-status").html('<i class="fa-solid fa-spinner fa-spin"></i> Checking...');
            const status = await getToyStatus();
            renderToyStatus(status);
        });
        
        console.log("[Lovense] UI Loaded Successfully.");

    } catch (err) {
        console.error("[Lovense] Failed to load settings.html", err);
        toastr.error("Lovense Extension: Could not load settings.html");
    }
}

function saveSettings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[extensionName] = settings;
    context.saveSettingsDebounced();
}

// --- INITIALIZATION ---

jQuery(async () => {
    initSettings();
    await loadSettings();

    try {
        const { eventSource, event_types } = SillyTavern.getContext();
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        console.log("[Lovense] Automation hooked.");
    } catch (e) {
        console.warn("[Lovense] Could not hook events:", e);
        console.warn("[Lovense] Automation disabled. Manual controls still available.");
    }
});