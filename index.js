// No relative imports — use SillyTavern.getContext() for all ST APIs.

// --- SERVER ADMIN: Paste your Lovense Developer Token below ---
const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";

const extensionName = "lovense-cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    isEnabled: true,
    uid: "",
    defaultTime: 10,
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
            // FIX: Look inside data.qr OR data.qrcode OR message
            // The API puts the URL in 'data.qr' for v2 requests
            const qrUrl = (data.data && data.data.qr) || (data.data && data.data.qrcode) || data.message;

            if (qrUrl && qrUrl.startsWith("http")) {
                $("#lovense-qr-container").html(`
                    <img src="${qrUrl}" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid var(--smart-theme-body-color);">
                    <div style="margin-top:5px; font-size:0.8em; opacity:0.7;">
                        Scan with <b>Lovense Remote App</b>
                    </div>
                `);
                toastr.success("New QR Code received.");
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

// action: a pre-built action string like "Vibrate:10", "Rotate:15", "Pump:2",
//         "Vibrate:10,Rotate:15", or "Stop".
async function sendCommand(action, timeSec = 0) {
    if (!settings.isEnabled || !DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") return;

    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        command: "Function",
        action: action,
        timeSec: timeSec,
        stopPrevious: 1,
        apiVer: 1,
    };

    console.log(`[Lovense] Sending: ${action} for ${timeSec}s`);

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

// --- AUTOMATION ---

// Tag-to-action mapping. Strength ranges: Vibrate 0-20, Rotate 0-20, Pump 0-3.
const TAG_MAP = {
    vibe:   { action: "Vibrate", max: 20 },
    vibrate:{ action: "Vibrate", max: 20 },
    rotate: { action: "Rotate",  max: 20 },
    pump:   { action: "Pump",    max: 3  },
};

// Matches [vibe:10], [rotate:15:8], [pump:2], etc.
const TAG_REGEX = /\[(vibe|vibrate|rotate|pump):\s*(\d+)(?::(\d+))?\]/gi;

function onMessageReceived(messageIndex) {
    if (!settings.isEnabled) return;

    try {
        const context = SillyTavern.getContext();
        const message = context.chat[messageIndex];
        if (!message) return;

        const text = (message.mes || "").toLowerCase();

        // 1. Explicit Tags: [vibe:10], [rotate:15:8], [pump:2], etc.
        //    Multiple tags in one message are combined into a single command.
        const actions = [];
        let maxTime = 0;
        let match;
        TAG_REGEX.lastIndex = 0;
        while ((match = TAG_REGEX.exec(text)) !== null) {
            const tag = TAG_MAP[match[1]];
            const strength = Math.min(parseInt(match[2]), tag.max);
            const time = match[3] ? parseInt(match[3]) : settings.defaultTime;
            if (time > maxTime) maxTime = time;

            if (strength === 0) {
                sendCommand("Stop");
                return;
            }
            actions.push(`${tag.action}:${strength}`);
        }

        if (actions.length > 0) {
            sendCommand(actions.join(","), maxTime);
            return;
        }

        // 2. Keywords — default: Vibrate at 10 for 10 seconds
        const keywords = (settings.keywords || "").split(",").map(s => s.trim());
        for (const word of keywords) {
            if (word && text.includes(word)) {
                sendCommand("Vibrate:10", 10);
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
        $("#lovense-low").on("click", () => sendCommand("Vibrate:5", settings.defaultTime));
        $("#lovense-med").on("click", () => sendCommand("Vibrate:10", settings.defaultTime));
        $("#lovense-high").on("click", () => sendCommand("Vibrate:20", settings.defaultTime));
        $("#lovense-stop").on("click", () => sendCommand("Stop"));
        
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