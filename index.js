// No relative imports — use SillyTavern.getContext() for all ST APIs.

// --- SERVER ADMIN: Paste your Lovense Developer Token below ---
const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";

const extensionName = "SillyTavern-Lovense-Cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Maximum intensity per action type (API constraint, not user-configurable).
const ACTION_MAX = {
    Vibrate: 20, Rotate: 20, Pump: 3, Thrusting: 20,
    Fingering: 20, Suction: 20, Oscillate: 20, Depth: 3,
};

const defaultSettings = {
    isEnabled: true,
    uid: "",
    dockSide: "right",
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
let panelOpen = false;
let lastStatusState = "disconnected"; // Track connection state for status dot revert

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

    // Ensure dock side exists (v2.x -> v3.0 migration)
    if (!settings.dockSide) {
        settings.dockSide = "right";
    }

    extensionSettings[extensionName] = settings;
    context.saveSettingsDebounced();
}

// --- PANEL CONTROLS ---

function togglePanel() {
    const $panel = $("#lovense-panel");
    if (panelOpen) {
        dismissPanel();
    } else {
        // Hide mini-bar when opening panel
        $("#lovense-mini-bar").addClass("lovense-mini-hidden");
        $panel.css("display", "flex");
        // Force reflow before removing hidden class for animation
        $panel[0].offsetHeight;
        $panel.removeClass("lovense-hidden");
        $("#lovense-wand-btn").addClass("lovense-wand-active");
        panelOpen = true;
    }
}

function dismissPanel() {
    const $panel = $("#lovense-panel");
    $panel.addClass("lovense-hidden");
    $("#lovense-wand-btn").removeClass("lovense-wand-active");
    panelOpen = false;

    // Hide display after transition completes, then show mini-bar
    setTimeout(() => {
        if (!panelOpen) {
            $panel.css("display", "none");
            $("#lovense-mini-bar").removeClass("lovense-mini-hidden");
        }
    }, 300);
}

function setDockSide(side) {
    const $panel = $("#lovense-panel");
    const wasOpen = panelOpen;

    // Temporarily disable transitions to avoid cross-screen slide
    if (wasOpen) {
        $panel.css("transition", "none");
        $panel.addClass("lovense-hidden");
    }

    $panel.removeClass("lovense-dock-left lovense-dock-right");
    $panel.addClass(`lovense-dock-${side}`);

    // Update dock toggle arrow direction
    $("#lovense-dock-toggle i").removeClass("fa-chevron-left fa-chevron-right")
        .addClass(side === "right" ? "fa-chevron-left" : "fa-chevron-right");

    settings.dockSide = side;
    saveSettings();

    if (wasOpen) {
        // Force reflow, then re-enable transitions and show
        $panel[0].offsetHeight;
        $panel.css("transition", "");
        $panel.removeClass("lovense-hidden");
    }
}

// --- VISUAL FEEDBACK ---

function triggerCommandPulse() {
    const $panel = $("#lovense-panel");
    $panel.removeClass("lovense-pulse");
    // Force reflow to restart animation
    $panel[0].offsetHeight;
    $panel.addClass("lovense-pulse");
    $panel.one("animationend", () => {
        $panel.removeClass("lovense-pulse");
    });
}

function flashButton($btn) {
    $btn.removeClass("lovense-btn-flash");
    $btn[0].offsetHeight;
    $btn.addClass("lovense-btn-flash");
    $btn.one("animationend", () => {
        $btn.removeClass("lovense-btn-flash");
    });
}

function updateStatusDot(state) {
    const $dot = $("#lovense-status-dot");
    if (!$dot.length) return;

    $dot.removeClass("lovense-status-disconnected lovense-status-connected lovense-status-sending");
    $dot.addClass(`lovense-status-${state}`);

    const titles = { disconnected: "Disconnected", connected: "Connected", sending: "Sending..." };
    $dot.attr("title", titles[state] || "");

    // Mirror status to mini-bar dot
    $("#lovense-mini-dot").removeClass("lovense-status-disconnected lovense-status-connected lovense-status-sending")
        .addClass(`lovense-status-${state}`);

    if (state !== "sending") {
        lastStatusState = state;
    }
}

function updateActivityFeed(description) {
    const $container = $("#lovense-activity");
    const $text = $container.find(".lovense-activity-text");
    const $time = $container.find(".lovense-activity-time");

    if (!$text.length) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    $text.text(description).addClass("lovense-activity-active");

    if ($time.length) {
        $time.text(timeStr);
    } else {
        $container.append(`<span class="lovense-activity-time">${timeStr}</span>`);
    }

    // Replay fade-in animation
    $container.removeClass("lovense-activity-flash");
    $container[0].offsetHeight;
    $container.addClass("lovense-activity-flash");
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
                // Show QR drawer open and enable toggle
                $("#lovense-qr-drawer").removeClass("lovense-qr-collapsed");
                const $qrToggle = $("#lovense-qr-toggle");
                $qrToggle.css("display", "");
                $qrToggle.find("span").text("Hide QR Code");
                $qrToggle.find("i").css("transform", "rotate(180deg)");
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

    // Visual feedback
    updateStatusDot("sending");
    updateActivityFeed(action === "Stop" ? "Stop" : action);
    triggerCommandPulse();

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

    // Revert status dot after brief pulse
    setTimeout(() => updateStatusDot(lastStatusState), 1000);
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

    // Visual feedback
    updateStatusDot("sending");
    updateActivityFeed(`Preset: ${name}`);
    triggerCommandPulse();

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

    // Revert status dot after brief pulse
    setTimeout(() => updateStatusDot(lastStatusState), 1000);
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

function getBatteryColor(level) {
    if (level > 60) return "#4caf50";
    if (level > 25) return "#ff9800";
    return "#f44336";
}

function renderToyStatus(data) {
    const container = $("#lovense-toy-status");
    if (!container.length) return;

    console.log("[Lovense] renderToyStatus raw:", JSON.stringify(data));
    if (!data || (data.code != 200 && data.result !== true) || !data.data || !data.data.toys) {
        container.html('<span class="lovense-placeholder">No toys detected. Scan QR and connect first.</span>');
        updateStatusDot("disconnected");
        return;
    }

    let toys;
    try {
        toys = typeof data.data.toys === "string" ? JSON.parse(data.data.toys) : data.data.toys;
    } catch (e) {
        container.html('<span class="lovense-placeholder">Could not parse toy data.</span>');
        updateStatusDot("disconnected");
        return;
    }

    const entries = Object.values(toys);
    if (entries.length === 0) {
        container.html('<span class="lovense-placeholder">No toys connected.</span>');
        updateStatusDot("disconnected");
        return;
    }

    let hasConnected = false;

    const html = '<div class="lovense-toy-cards">' + entries.map(toy => {
        const connected = toy.status === "1" || toy.status === 1;
        if (connected) hasConnected = true;
        const name = toy.nickName || toy.name || "Unknown";
        const battery = toy.battery != null ? parseInt(toy.battery) : null;
        const batteryDisplay = battery != null ? `${battery}%` : "?";
        const batteryWidth = battery != null ? Math.max(2, battery) : 0;
        const batteryColor = battery != null ? getBatteryColor(battery) : "rgba(255,255,255,0.2)";

        return `<div class="lovense-toy-card">
            <div class="lovense-toy-card-header">
                <span class="lovense-toy-dot ${connected ? "connected" : "disconnected"}"></span>
                <span class="lovense-toy-name">${name}</span>
                <span class="lovense-toy-battery-label"><i class="fa-solid fa-battery-half"></i></span>
            </div>
            <div class="lovense-toy-battery">
                <div class="lovense-toy-battery-track">
                    <div class="lovense-toy-battery-bar" style="width: ${batteryWidth}%; background: ${batteryColor};"></div>
                </div>
                <span class="lovense-toy-battery-text">${batteryDisplay}</span>
            </div>
        </div>`;
    }).join("") + '</div>';

    container.html(html);
    updateStatusDot(hasConnected ? "connected" : "disconnected");
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
        const panelHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // Inject floating panel into document body
        $(document.body).append(panelHtml);

        // Apply saved dock side and start hidden
        const $panel = $("#lovense-panel");
        $panel.removeClass("lovense-dock-left lovense-dock-right");
        $panel.addClass(`lovense-dock-${settings.dockSide}`);
        $panel.addClass("lovense-hidden");
        $panel.css("display", "none");

        // Inject wand menu button
        const $wandBtn = $(`
            <div id="lovense-wand-btn" class="list-group-item flex-container flexGap5">
                <div class="fa-solid fa-satellite-dish extensionsMenuExtensionButton"></div>
                <span>Lovense Cloud</span>
            </div>
        `);
        $("#extensionsMenu").append($wandBtn);
        $wandBtn.on("click", togglePanel);

        // Panel controls
        $("#lovense-panel-close").on("click", dismissPanel);
        $("#lovense-dock-toggle").on("click", () => {
            const newSide = settings.dockSide === "right" ? "left" : "right";
            setDockSide(newSide);
        });

        // Escape key to dismiss
        $(document).on("keydown", (e) => {
            if (e.key === "Escape" && panelOpen) {
                dismissPanel();
            }
        });

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

        // Set initial dock toggle icon direction
        $("#lovense-dock-toggle i").removeClass("fa-chevron-left fa-chevron-right fa-arrow-right-arrow-left")
            .addClass(settings.dockSide === "right" ? "fa-chevron-left" : "fa-chevron-right");

        // QR drawer toggle
        $("#lovense-qr-toggle").on("click", function () {
            const $drawer = $("#lovense-qr-drawer");
            const isCollapsed = $drawer.hasClass("lovense-qr-collapsed");
            $drawer.toggleClass("lovense-qr-collapsed");
            $(this).find("span").text(isCollapsed ? "Hide QR Code" : "Show QR Code");
            $(this).find("i").css("transform", isCollapsed ? "rotate(180deg)" : "rotate(0deg)");
        });

        // Connection & manual controls with button flash
        $("#lovense-get-qr").on("click", function () { flashButton($(this)); getQrCode(); });
        $("#lovense-low").on("click", function () { flashButton($(this)); sendCommand("Vibrate:5"); });
        $("#lovense-med").on("click", function () { flashButton($(this)); sendCommand("Vibrate:10"); });
        $("#lovense-high").on("click", function () { flashButton($(this)); sendCommand("Vibrate:20"); });
        $("#lovense-stop").on("click", function () { flashButton($(this)); sendCommand("Stop"); });

        // Preset buttons with flash
        $("#lovense-pulse").on("click", function () { flashButton($(this)); sendPreset("pulse"); });
        $("#lovense-wave").on("click", function () { flashButton($(this)); sendPreset("wave"); });
        $("#lovense-fireworks").on("click", function () { flashButton($(this)); sendPreset("fireworks"); });
        $("#lovense-earthquake").on("click", function () { flashButton($(this)); sendPreset("earthquake"); });

        // Toy status
        $("#lovense-refresh-status").on("click", async function () {
            flashButton($(this));
            $("#lovense-toy-status").html('<i class="fa-solid fa-spinner fa-spin"></i> Checking...');
            const status = await getToyStatus();
            renderToyStatus(status);
        });

        // Mini-bar controls
        $("#lovense-mini-expand").on("click", togglePanel);
        $("#lovense-mini-vibrate").on("click", function () { sendCommand("Vibrate:10"); });
        $("#lovense-mini-stop").on("click", function () { sendCommand("Stop"); });
        $("#lovense-mini-enable").prop("checked", settings.isEnabled);
        $("#lovense-mini-enable").parent().on("click", function () {
            const $cb = $("#lovense-mini-enable");
            const newVal = !$cb.prop("checked");
            $cb.prop("checked", newVal);
            settings.isEnabled = newVal;
            $("#lovense-enable").prop("checked", newVal);
            saveSettings();
        });

        // Sync main enable toggle to mini-bar
        $("#lovense-enable").on("change", function () {
            $("#lovense-mini-enable").prop("checked", settings.isEnabled);
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
