// No relative imports — use SillyTavern.getContext() for all ST APIs.

// --- SERVER ADMIN: Paste your Lovense Developer Token below ---
const DEV_TOKEN = "PASTE_YOUR_TOKEN_HERE";

const extensionName = "SillyTavern-Lovense-Cloud";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Maximum intensity per action type (API constraint, not user-configurable).
const ACTION_MAX = {
    Vibrate: 20, Rotate: 20, Pump: 3, Thrusting: 20,
    Fingering: 20, Suction: 20, Oscillate: 20, Depth: 3, Stroke: 100,
};

// Short codes for Pattern API rule string.
const ACTION_SHORT_CODES = {
    Vibrate: "v", Rotate: "r", Pump: "p", Thrusting: "t",
    Fingering: "f", Suction: "s", Depth: "d", Oscillate: "o",
};

// Built-in pattern templates (manual-only, no default keywords).
const BUILTIN_PATTERNS = {
    tease:     { name: "Tease",     interval: 500, strengths: [2, 3, 5, 3, 2, 1, 2, 4, 3, 1] },
    escalate:  { name: "Escalate",  interval: 400, strengths: [1, 2, 3, 5, 7, 9, 11, 14, 17, 20] },
    waves:     { name: "Waves",     interval: 300, strengths: [3, 6, 10, 14, 17, 20, 17, 14, 10, 6, 3, 1] },
    chaos:     { name: "Chaos",     interval: 200, strengths: [18, 3, 15, 7, 20, 1, 12, 9, 20, 4, 16, 2] },
    heartbeat: { name: "Heartbeat", interval: 150, strengths: [0, 15, 20, 5, 0, 0, 12, 18, 3, 0, 0, 0] },
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
        Stroke:    { keywords: "stroke,glide,slide", baseIntensity: 50 },
    },
    patterns: {},
    patternKeywordMode: true,
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
let toyRunning = false; // True while a command/pattern/preset is active (not Stop)
let connectedToyCapabilities = null; // null = unknown, Set of action names when toys connected
let lovenseSocket = null; // Socket.IO connection to Lovense for instant pairing
let lastKnownToyData = null; // Last device info received from socket events

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

    // v3.x -> v4.0 migration: patterns
    if (!settings.patterns) {
        settings.patterns = {};
    }
    if (settings.patternKeywordMode === undefined) {
        settings.patternKeywordMode = true;
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
        // Dim orb when opening panel
        $("#lovense-orb").addClass("lovense-orb-panel-open");
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

    // Hide display after transition completes, restore orb
    setTimeout(() => {
        if (!panelOpen) {
            $panel.css("display", "none");
            $("#lovense-orb").removeClass("lovense-orb-panel-open");
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

    // Move orb to match dock side
    $("#lovense-orb").toggleClass("lovense-orb-dock-left", side === "left");

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

    // Update orb state: keep "active" if toy is still running
    const orbState = state === "sending" ? "active"
        : (toyRunning && state !== "disconnected") ? "active"
        : state;
    updateOrbState(orbState);

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

// --- ORB & AMBIENT FEEDBACK ---

function updateOrbState(state) {
    const $orb = $("#lovense-orb");
    if (!$orb.length) return;
    $orb.removeClass("lovense-orb-disconnected lovense-orb-connected lovense-orb-active");
    $orb.addClass(`lovense-orb-${state}`);

    // Sync mobile chatbar button dot
    const $dot = $(".lovense-chatbar-btn-dot");
    if ($dot.length) {
        $dot.removeClass("lovense-dot-disconnected lovense-dot-connected lovense-dot-active");
        $dot.addClass(`lovense-dot-${state}`);
    }
}

function flashOrb() {
    const $orb = $("#lovense-orb");
    if (!$orb.length) return;
    $orb.removeClass("lovense-orb-flash");
    $orb[0].offsetHeight;
    $orb.addClass("lovense-orb-flash");
    $orb.one("animationend", () => $orb.removeClass("lovense-orb-flash"));
}

function setAmbientGlow(active) {
    $("#lovense-ambient").toggleClass("lovense-ambient-active", active);
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
                // Try instant pairing via Socket API, fall back to polling
                connectLovenseSocket();
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
    flashOrb();

    // Track running state for persistent orb animation
    if (action === "Stop") {
        toyRunning = false;
        setAmbientGlow(false);
    } else {
        toyRunning = true;
        updateOrbState("active");
        setAmbientGlow(true);
    }

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

    // Revert status dot after brief pulse (orb stays active if toyRunning)
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
    flashOrb();
    toyRunning = true;
    updateOrbState("active");
    setAmbientGlow(true);

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

    // Revert status dot after brief pulse (orb stays active if toyRunning)
    setTimeout(() => updateStatusDot(lastStatusState), 1000);
}

// Sends a Pattern command with a custom strength sequence.
async function sendPattern(patternDef, actionTypes) {
    if (!settings.isEnabled || !DEV_TOKEN || DEV_TOKEN === "PASTE_YOUR_TOKEN_HERE") return;

    const shortCodes = (actionTypes || ["v"]).join("");
    const rule = `V:1;F:${shortCodes};S:${patternDef.interval}#`;
    const strength = patternDef.strengths.join(";");

    const payload = {
        token: DEV_TOKEN,
        uid: settings.uid,
        command: "Pattern",
        rule: rule,
        strength: strength,
        timeSec: 0,
        apiVer: 1,
    };

    console.log(`[Lovense] Sending pattern: ${patternDef.name} (${rule})`);

    updateStatusDot("sending");
    updateActivityFeed(`Pattern: ${patternDef.name}`);
    triggerCommandPulse();
    flashOrb();
    toyRunning = true;
    updateOrbState("active");
    setAmbientGlow(true);

    try {
        const response = await fetch("https://api.lovense.com/api/lan/v2/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.log("[Lovense] Pattern response:", data);
    } catch (e) {
        console.error("[Lovense] Pattern Failed:", e);
    }

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
        // Cloud HTTP API doesn't return toy data — fall back to last socket info
        if (lastKnownToyData && !data) {
            // Re-invoke with cached socket data
            handleSocketDeviceInfo(lastKnownToyData);
            return;
        }
        // HTTP API returned 200 but no toys — app is online but no toy details available
        if (data && (data.code == 200 || data.result === true) && (!data.data || !data.data.toys)) {
            container.html('<span class="lovense-placeholder">App connected — waiting for toy data via socket...</span>');
            updateStatusDot("connected");
            return;
        }
        container.html('<span class="lovense-placeholder">No toys detected. Scan QR and connect first.</span>');
        connectedToyCapabilities = null;
        updateActionGroupVisibility();
        updateStatusDot("disconnected");
        return;
    }

    let toys;
    try {
        toys = typeof data.data.toys === "string" ? JSON.parse(data.data.toys) : data.data.toys;
    } catch (e) {
        container.html('<span class="lovense-placeholder">Could not parse toy data.</span>');
        connectedToyCapabilities = null;
        updateActionGroupVisibility();
        updateStatusDot("disconnected");
        return;
    }

    const entries = Object.values(toys);
    if (entries.length === 0) {
        container.html('<span class="lovense-placeholder">No toys connected.</span>');
        connectedToyCapabilities = null;
        updateActionGroupVisibility();
        updateStatusDot("disconnected");
        return;
    }

    // Collect capabilities from all connected toys
    const allCapabilities = new Set();
    let hasConnected = false;

    const html = '<div class="lovense-toy-cards">' + entries.map(toy => {
        const connected = toy.status === "1" || toy.status === 1;
        if (connected) {
            hasConnected = true;
            if (Array.isArray(toy.fullFunctionNames)) {
                toy.fullFunctionNames.forEach(fn => allCapabilities.add(fn));
            }
        }
        const name = toy.nickName || toy.name || "Unknown";
        const battery = toy.battery != null ? parseInt(toy.battery) : null;
        const batteryDisplay = battery != null ? `${battery}%` : "?";
        const batteryWidth = battery != null ? Math.max(2, battery) : 0;
        const batteryColor = battery != null ? getBatteryColor(battery) : "rgba(255,255,255,0.2)";
        const functions = Array.isArray(toy.fullFunctionNames) ? toy.fullFunctionNames.join(", ") : "";

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
            ${functions ? `<div class="lovense-toy-functions">${functions}</div>` : ""}
        </div>`;
    }).join("") + '</div>';

    container.html(html);
    connectedToyCapabilities = allCapabilities.size > 0 ? allCapabilities : null;
    updateActionGroupVisibility();
    updateStatusDot(hasConnected ? "connected" : "disconnected");
}

function updateActionGroupVisibility() {
    for (const actionName of Object.keys(ACTION_MAX)) {
        const $group = $(`.lovense-action-group[data-action="${actionName}"]`);
        if (!$group.length) continue;

        if (connectedToyCapabilities === null || connectedToyCapabilities.has(actionName)) {
            $group.removeClass("lovense-action-unsupported");
            $group.attr("title", "");
        } else {
            $group.addClass("lovense-action-unsupported");
            $group.attr("title", "Not supported by connected toys");
        }
    }
}

// --- SOCKET API (INSTANT PAIRING) ---

function loadSocketIO() {
    return new Promise((resolve, reject) => {
        if (typeof io !== "undefined") {
            resolve(io);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.5.0/socket.io.js";
        script.onload = () => resolve(io);
        script.onerror = () => reject(new Error("Failed to load Socket.IO"));
        document.head.appendChild(script);
    });
}

async function initSocketApi() {
    const response = await fetch("https://api.lovense-api.com/api/basicApi/getSocketUrl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "SillyTavern", authToken: DEV_TOKEN }),
    });
    const data = await response.json();
    console.log("[Lovense] Socket init response:", data);
    if (data.message === "Success" && data.data) {
        return { socketIoUrl: data.data.socketIoUrl, socketIoPath: data.data.socketIoPath };
    }
    throw new Error("Socket init failed: " + (data.message || "Unknown error"));
}

function handleSocketDeviceInfo(res) {
    try {
        const resData = typeof res === "string" ? JSON.parse(res) : (res || {});
        console.log("[Lovense] Parsed device info:", resData);

        // Store raw data for fallback
        lastKnownToyData = resData;

        // Normalize to the format renderToyStatus() expects
        // Socket event data may contain toys directly or nested under various keys
        let toys = null;
        if (resData.toys) {
            toys = typeof resData.toys === "string" ? JSON.parse(resData.toys) : resData.toys;
        } else if (resData.data && resData.data.toys) {
            toys = typeof resData.data.toys === "string" ? JSON.parse(resData.data.toys) : resData.data.toys;
        }

        if (toys) {
            renderToyStatus({ result: true, code: 200, data: { toys: toys } });
        } else {
            // Event arrived but no toy details — may just be an app status update
            console.log("[Lovense] Device info event had no toy details, raw:", resData);
            // Still mark as connected if we got any event
            updateStatusDot("connected");
        }
    } catch (e) {
        console.error("[Lovense] Failed to parse device info:", e);
    }
}

async function connectLovenseSocket() {
    try {
        const socketIO = await loadSocketIO();
        const { socketIoUrl, socketIoPath } = await initSocketApi();

        console.log("[Lovense] Connecting socket to:", socketIoUrl, "path:", socketIoPath);

        if (lovenseSocket) {
            lovenseSocket.disconnect();
        }

        lovenseSocket = socketIO(socketIoUrl, {
            path: socketIoPath,
            transports: ["websocket"],
            forceNew: true,
            reconnection: true,
            timeout: 5000,
            upgrade: false,
            rememberUpgrade: false,
        });

        lovenseSocket.on("connect", () => {
            console.log("[Lovense] Socket connected");
        });

        lovenseSocket.on("basicapi_update_app_status_tc", (res) => {
            console.log("[Lovense] QR scanned event:", res);
            toastr.success("Toy app connected!");
            handleSocketDeviceInfo(res);
        });

        lovenseSocket.on("basicapi_update_device_info_tc", (res) => {
            console.log("[Lovense] Device info update:", res);
            handleSocketDeviceInfo(res);
        });

        lovenseSocket.on("basicapi_update_app_online_tc", (res) => {
            console.log("[Lovense] App online status:", res);
            const data = typeof res === "string" ? JSON.parse(res) : (res || {});
            if (data.status === 0) {
                updateStatusDot("disconnected");
                connectedToyCapabilities = null;
                lastKnownToyData = null;
                updateActionGroupVisibility();
            }
        });

        lovenseSocket.on("connect_error", (err) => {
            console.error("[Lovense] Socket connection error:", err);
        });

        lovenseSocket.on("disconnect", () => {
            console.log("[Lovense] Socket disconnected");
        });

        lovenseSocket.on("error", (err) => {
            console.error("[Lovense] Socket error:", err);
        });

    } catch (e) {
        console.warn("[Lovense] Socket.IO unavailable, falling back to polling:", e);
        // Fallback to 15-second polling
        setTimeout(async () => {
            const status = await getToyStatus();
            renderToyStatus(status);
        }, 15000);
    }
}

// --- PATTERN MANAGEMENT ---

function generatePatternId() {
    return "pat_" + Math.random().toString(36).substr(2, 8);
}

function renderPatternPreview(strengths) {
    const max = Math.max(1, ...strengths);
    return '<div class="lovense-pattern-preview">' +
        strengths.map(v => `<div class="lovense-pattern-bar" style="height: ${Math.max(1, (v / max) * 16)}px;"></div>`).join("") +
        '</div>';
}

function renderPatternList() {
    const $list = $("#lovense-custom-patterns-list");
    if (!$list.length) return;

    const patterns = settings.patterns || {};
    const ids = Object.keys(patterns);

    if (ids.length === 0) {
        $list.html('<span class="lovense-placeholder" style="font-size:0.8em;">No custom patterns yet.</span>');
        return;
    }

    $list.html(ids.map(id => {
        const p = patterns[id];
        return `<div class="lovense-pattern-item" data-id="${id}">
            ${renderPatternPreview(p.strengths)}
            <span class="lovense-pattern-name">${p.name}</span>
            <div class="lovense-pattern-actions">
                <button class="menu_button lovense-pat-play" data-id="${id}" title="Play"><i class="fa-solid fa-play"></i></button>
                <button class="menu_button lovense-pat-edit" data-id="${id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="menu_button lovense-pat-delete" data-id="${id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join(""));

    // Bind pattern list actions
    $list.find(".lovense-pat-play").off("click").on("click", function () {
        const id = $(this).data("id");
        const p = settings.patterns[id];
        if (p) {
            flashButton($(this));
            sendPattern(p, p.actionTypes || ["v"]);
        }
    });
    $list.find(".lovense-pat-edit").off("click").on("click", function () {
        openPatternEditor($(this).data("id"));
    });
    $list.find(".lovense-pat-delete").off("click").on("click", function () {
        const id = $(this).data("id");
        delete settings.patterns[id];
        saveSettings();
        renderPatternList();
    });
}

function openPatternEditor(editId) {
    const $editor = $("#lovense-pattern-editor");
    const isEdit = editId && settings.patterns[editId];
    const pattern = isEdit ? settings.patterns[editId] : {
        name: "", interval: 300, strengths: [5, 10, 15, 20, 15, 10, 5, 3], keywords: "", actionTypes: ["v"],
    };

    $editor.data("editId", editId || "");

    $editor.html(`
        <div class="lovense-editor-form">
            <label style="font-size:0.8em; opacity:0.8;">Pattern Name</label>
            <input type="text" id="lovense-editor-name" class="text_pole" value="${pattern.name}" placeholder="My Pattern" style="width:100%; font-size:0.85em;">

            <label style="font-size:0.8em; opacity:0.8; margin-top:6px; display:block;">Intensity Bars <span style="opacity:0.5;">(click/drag to draw, max 50)</span></label>
            <div id="lovense-bar-editor" class="lovense-bar-editor"></div>
            <div style="display:flex; gap:6px; margin-top:4px;">
                <button id="lovense-editor-add-bar" class="menu_button" style="font-size:0.75em;"><i class="fa-solid fa-plus"></i> Bar</button>
                <button id="lovense-editor-remove-bar" class="menu_button" style="font-size:0.75em;"><i class="fa-solid fa-minus"></i> Bar</button>
                <span id="lovense-editor-bar-count" style="font-size:0.75em; opacity:0.5; margin-left:auto; align-self:center;">${pattern.strengths.length} bars</span>
            </div>

            <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                <label style="font-size:0.8em; opacity:0.8; white-space:nowrap;">Interval (ms)</label>
                <input type="range" id="lovense-editor-interval" min="100" max="1000" step="50" value="${pattern.interval}" style="flex:1;">
                <span id="lovense-editor-interval-val" style="font-size:0.85em; font-weight:bold; min-width:40px; text-align:center;">${pattern.interval}ms</span>
            </div>

            <label style="font-size:0.8em; opacity:0.8; margin-top:6px; display:block;">Action Types</label>
            <div id="lovense-editor-actions" class="lovense-editor-actions">
                ${Object.entries(ACTION_SHORT_CODES).map(([name, code]) =>
                    `<label class="lovense-editor-action-label"><input type="checkbox" value="${code}" ${pattern.actionTypes.includes(code) ? "checked" : ""}> ${name}</label>`
                ).join("")}
            </div>

            <label style="font-size:0.8em; opacity:0.8; margin-top:6px; display:block;">Keywords <span style="opacity:0.5;">(comma separated, for automation)</span></label>
            <input type="text" id="lovense-editor-keywords" class="text_pole" value="${pattern.keywords || ""}" placeholder="Optional" style="width:100%; font-size:0.85em;">

            <div style="display:flex; gap:6px; margin-top:8px;">
                <button id="lovense-editor-save" class="menu_button" style="flex:1;"><i class="fa-solid fa-check"></i> Save</button>
                <button id="lovense-editor-cancel" class="menu_button" style="flex:1;"><i class="fa-solid fa-xmark"></i> Cancel</button>
            </div>
        </div>
    `);

    // Store strengths in editor data
    $editor.data("strengths", [...pattern.strengths]);
    renderBarEditor();

    // Interval slider
    $("#lovense-editor-interval").on("input", function () {
        $("#lovense-editor-interval-val").text($(this).val() + "ms");
    });

    // Add/remove bars
    $("#lovense-editor-add-bar").on("click", function () {
        const s = $editor.data("strengths");
        if (s.length < 50) { s.push(10); $editor.data("strengths", s); renderBarEditor(); }
    });
    $("#lovense-editor-remove-bar").on("click", function () {
        const s = $editor.data("strengths");
        if (s.length > 2) { s.pop(); $editor.data("strengths", s); renderBarEditor(); }
    });

    // Save
    $("#lovense-editor-save").on("click", function () {
        const name = $("#lovense-editor-name").val().trim() || "Untitled";
        const interval = parseInt($("#lovense-editor-interval").val()) || 300;
        const strengths = $editor.data("strengths");
        const keywords = $("#lovense-editor-keywords").val().trim();
        const actionTypes = [];
        $("#lovense-editor-actions input:checked").each(function () { actionTypes.push($(this).val()); });
        if (actionTypes.length === 0) actionTypes.push("v");

        const id = isEdit ? editId : generatePatternId();
        settings.patterns[id] = { name, interval, strengths, keywords, actionTypes };
        saveSettings();
        $editor.slideUp(150);
        renderPatternList();
    });

    // Cancel
    $("#lovense-editor-cancel").on("click", function () {
        $editor.slideUp(150);
    });

    $editor.slideDown(150);
}

function renderBarEditor() {
    const $editor = $("#lovense-pattern-editor");
    const strengths = $editor.data("strengths") || [];
    const $container = $("#lovense-bar-editor");
    const maxVal = 20;

    $container.html(strengths.map((v, i) =>
        `<div class="lovense-editor-bar" data-index="${i}" style="height: ${Math.max(2, (v / maxVal) * 60)}px;" title="${v}"></div>`
    ).join(""));

    $("#lovense-editor-bar-count").text(`${strengths.length} bars`);

    // Click/drag to set bar heights
    let dragging = false;
    $container.off("mousedown mousemove mouseup mouseleave");
    $container.on("mousedown", ".lovense-editor-bar", function (e) {
        dragging = true;
        setBarFromEvent(e, $(this));
    });
    $container.on("mousemove", ".lovense-editor-bar", function (e) {
        if (dragging) setBarFromEvent(e, $(this));
    });
    $(document).on("mouseup.barEditor", () => { dragging = false; });

    function setBarFromEvent(e, $bar) {
        const rect = $container[0].getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;
        const ratio = Math.max(0, Math.min(1, 1 - (y / height)));
        const value = Math.round(ratio * maxVal);
        const idx = parseInt($bar.data("index"));
        const s = $editor.data("strengths");
        s[idx] = value;
        $bar.css("height", Math.max(2, (value / maxVal) * 60) + "px").attr("title", value);
    }
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

        // 3. Check custom pattern keywords (patterns take priority)
        if (settings.patternKeywordMode) {
            for (const [patternId, pattern] of Object.entries(settings.patterns || {})) {
                const patternKeywords = (pattern.keywords || "").split(",").map(s => s.trim()).filter(Boolean);
                if (patternKeywords.some(word => word && text.includes(word))) {
                    console.log(`[Lovense] Pattern keyword match -> ${pattern.name}`);
                    sendPattern(pattern, pattern.actionTypes || ["v"]);
                    return;
                }
            }
        }

        // 4. Send combined command if any actions matched
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

        // Mobile chatbar button — inject near ST's chatbar buttons
        const $chatbarBtn = $("#lovense-chatbar-btn");
        const $leftSendForm = $("#leftSendForm");
        if ($leftSendForm.length) {
            $chatbarBtn.detach().appendTo($leftSendForm);
        }
        $chatbarBtn.on("click", function (e) {
            e.stopPropagation(); // Prevent ST from swallowing the click
            togglePanel();
        });

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

        // Built-in pattern buttons
        for (const [key, pattern] of Object.entries(BUILTIN_PATTERNS)) {
            $(`#lovense-pat-${key}`).on("click", function () {
                flashButton($(this));
                sendPattern(pattern, ["v"]);
            });
        }

        // Custom pattern management
        renderPatternList();
        $("#lovense-add-pattern").on("click", function () { openPatternEditor(); });

        // Toy status
        $("#lovense-refresh-status").on("click", async function () {
            flashButton($(this));
            $("#lovense-toy-status").html('<i class="fa-solid fa-spinner fa-spin"></i> Checking...');
            const status = await getToyStatus();
            // Cloud API GetToys doesn't return toy data — use lastKnownToyData if available
            if (status && (status.code == 200 || status.result === true) && (!status.data || !status.data.toys) && lastKnownToyData) {
                handleSocketDeviceInfo(lastKnownToyData);
            } else {
                renderToyStatus(status);
            }
        });

        // Floating orb — click to toggle panel
        $("#lovense-orb").on("click", togglePanel);

        // Initial orb dock side
        if (settings.dockSide === "left") {
            $("#lovense-orb").addClass("lovense-orb-dock-left");
        }

        // Initial orb state
        updateOrbState("disconnected");

        // Cleanup socket on page unload
        window.addEventListener("beforeunload", () => {
            if (lovenseSocket) lovenseSocket.disconnect();
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
