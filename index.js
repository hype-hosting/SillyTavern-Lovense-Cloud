// No relative imports — use SillyTavern.getContext() for all ST APIs.

// --- SERVER ADMIN: Paste your Lovense Developer Token below ---
const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";

const extensionName = "lovense-cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Maximum intensity per action type (API constraint, not user-configurable).
const ACTION_MAX = {
    Vibrate: 20, Rotate: 20, Pump: 3, Thrusting: 20,
    Fingering: 20, Suction: 20, Oscillate: 20, Depth: 3,
};

const defaultSettings = {
    isEnabled: true,
    uid: "",
    actions: {
        Vibrate:   { keywords: "shiver,shake,throb,tingle,buzz,hum,tremble,quiver,shudder", baseIntensity: 10 },
        Rotate:    { keywords: "twist,swirl,spin,grind,circle,gyrate,coil", baseIntensity: 10 },
        Pump:      { keywords: "inflate,swell,expand,fill,bulge", baseIntensity: 2 },
        Thrusting: { keywords: "thrust,pound,slam,drive,plunge,ram,buck,lunge", baseIntensity: 10 },
        Fingering: { keywords: "curl,probe,press inside,hook", baseIntensity: 10 },
        Suction:   { keywords: "suck,suction,latch,clamp,vacuum", baseIntensity: 10 },
        Oscillate: { keywords: "sway,rock,undulate,ripple,flutter", baseIntensity: 10 },
        Depth:     { keywords: "hilt,bottom out,fully inside", baseIntensity: 2 },
    },
    intensityModifiers: {
        low:  ["gentle","gently","soft","softly","light","lightly","tender","tenderly","slow","slowly","faint","barely","subtle","delicate"],
        high: ["hard","harder","intense","intensely","rough","roughly","fast","faster","furious","furiously","aggressive","aggressively","powerful","powerfully","strong","stronger","fierce","fiercely","relentless"],
    },
    modifierScale: { low: 0.5, high: 1.5 },
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

    // Migrate v1.x flat keywords to v2.0 per-action structure
    if (typeof settings.keywords === "string" && settings.keywords.trim()) {
        if (!settings.actions) {
            settings.actions = JSON.parse(JSON.stringify(defaultSettings.actions));
        }
        const oldWords = settings.keywords.split(",").map(s => s.trim()).filter(Boolean);
        const existingWords = settings.actions.Vibrate.keywords.split(",").map(s => s.trim()).filter(Boolean);
        const merged = [...new Set([...existingWords, ...oldWords])];
        settings.actions.Vibrate.keywords = merged.join(",");
        delete settings.keywords;
        console.log("[Lovense] Migrated v1.x keywords to v2.0 per-action format.");
    }

    // Ensure all action types exist (handles partial settings from older versions)
    if (!settings.actions) {
        settings.actions = JSON.parse(JSON.stringify(defaultSettings.actions));
    }
    for (const [action, defaults] of Object.entries(defaultSettings.actions)) {
        if (!settings.actions[action]) {
            settings.actions[action] = JSON.parse(JSON.stringify(defaults));
        }
    }

    // Ensure intensity modifiers exist
    if (!settings.intensityModifiers) {
        settings.intensityModifiers = JSON.parse(JSON.stringify(defaultSettings.intensityModifiers));
    }
    if (!settings.modifierScale) {
        settings.modifierScale = { ...defaultSettings.modifierScale };
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

// Word-boundary check for intensity modifier words (avoids "light" matching "spotlight").
function textContainsWord(text, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

// Scans text for intensity modifier words and returns a multiplier.
function detectIntensityModifier(text) {
    const lowWords = settings.intensityModifiers?.low || [];
    const highWords = settings.intensityModifiers?.high || [];

    const hasHigh = highWords.some(word => textContainsWord(text, word));
    const hasLow = lowWords.some(word => textContainsWord(text, word));

    // High wins if both present (escalation intent)
    if (hasHigh) return settings.modifierScale?.high || 1.5;
    if (hasLow) return settings.modifierScale?.low || 0.5;
    return 1.0;
}

function onMessageReceived(messageIndex) {
    if (!settings.isEnabled) return;

    try {
        const context = SillyTavern.getContext();
        const message = context.chat[messageIndex];
        if (!message) return;

        const text = (message.mes || "").toLowerCase();

        // 1. Determine intensity modifier from text
        const modifier = detectIntensityModifier(text);

        // 2. Scan for keyword matches across all action types
        const matchedActions = [];

        for (const [actionName, config] of Object.entries(settings.actions)) {
            const keywords = (config.keywords || "").split(",").map(s => s.trim()).filter(Boolean);
            const matched = keywords.some(word => word && text.includes(word));

            if (matched) {
                const max = ACTION_MAX[actionName] || 20;
                let intensity = Math.round(config.baseIntensity * modifier);
                intensity = Math.max(1, Math.min(intensity, max));
                matchedActions.push(`${actionName}:${intensity}`);
            }
        }

        // 3. Send combined command if any actions matched
        if (matchedActions.length > 0) {
            const combined = matchedActions.join(",");
            console.log(`[Lovense] Keyword matches -> ${combined} (modifier: ${modifier}x)`);
            sendCommand(combined);
        }
    } catch (e) {
        console.error("[Lovense] Error processing message:", e);
    }
}

// --- UI LOADING ---

function updateActionPreview(actionName) {
    const keywords = (settings.actions[actionName]?.keywords || "").split(",").map(s => s.trim()).filter(Boolean);
    const count = keywords.length;
    $(`#lovense-preview-${actionName}`).text(count === 0 ? "no keywords" : `${count} keyword${count === 1 ? "" : "s"}`);
}

async function loadSettings() {
    console.log("[Lovense] Loading UI from:", `${extensionFolderPath}/settings.html`);

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);

        // Populate enable checkbox
        $("#lovense-enable").prop("checked", settings.isEnabled);
        $("#lovense-enable").on("change", (e) => { settings.isEnabled = e.target.checked; saveSettings(); });

        // Populate and bind per-action settings
        for (const [actionName, config] of Object.entries(settings.actions)) {
            $(`#lovense-keywords-${actionName}`).val(config.keywords);
            $(`#lovense-intensity-${actionName}`).val(config.baseIntensity);
            $(`#lovense-intensity-val-${actionName}`).text(config.baseIntensity);
            updateActionPreview(actionName);

            $(`#lovense-keywords-${actionName}`).on("input", function () {
                settings.actions[actionName].keywords = $(this).val();
                updateActionPreview(actionName);
                saveSettings();
            });

            $(`#lovense-intensity-${actionName}`).on("input", function () {
                const val = parseInt($(this).val());
                settings.actions[actionName].baseIntensity = val;
                $(`#lovense-intensity-val-${actionName}`).text(val);
                saveSettings();
            });
        }

        // Collapsible action headers
        $(".lovense-action-header").on("click", function () {
            const $body = $(this).next(".lovense-action-body");
            const $chevron = $(this).find(".lovense-action-chevron");
            $body.slideToggle(150);
            $chevron.toggleClass("fa-chevron-right fa-chevron-down");
        });

        // Populate and bind intensity modifiers
        $("#lovense-mod-low").val((settings.intensityModifiers.low || []).join(", "));
        $("#lovense-mod-high").val((settings.intensityModifiers.high || []).join(", "));
        $("#lovense-mod-low-scale").val(settings.modifierScale.low);
        $("#lovense-mod-high-scale").val(settings.modifierScale.high);

        $("#lovense-mod-low").on("input", function () {
            settings.intensityModifiers.low = $(this).val().split(",").map(s => s.trim()).filter(Boolean);
            saveSettings();
        });
        $("#lovense-mod-high").on("input", function () {
            settings.intensityModifiers.high = $(this).val().split(",").map(s => s.trim()).filter(Boolean);
            saveSettings();
        });
        $("#lovense-mod-low-scale").on("change", function () {
            settings.modifierScale.low = parseFloat($(this).val()) || 0.5;
            saveSettings();
        });
        $("#lovense-mod-high-scale").on("change", function () {
            settings.modifierScale.high = parseFloat($(this).val()) || 1.5;
            saveSettings();
        });

        // Connection & manual controls
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