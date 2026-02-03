import https from 'https';

// --- CONFIGURATION ---
// PASTE YOUR TOKEN HERE
const LOVENSE_DEV_TOKEN = 'PASTE_YOUR_DEVELOPER_TOKEN_HERE'; 
// ---------------------

export const info = {
    id: 'lovense',
    name: 'Lovense Cloud Control',
    description: 'Bridge for Lovense Online (Cloud) API',
};

export async function init(router) {
    console.log('Loading Lovense Cloud Control plugin...');

    // Helper to make HTTPS requests to Lovense
    const callLovenseApi = (path, data) => {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(data);
            const options = {
                hostname: 'api.lovense.com',
                port: 443,
                path: '/api/lan' + path, // Maps to https://api.lovense.com/api/lan/...
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.write(postData);
            req.end();
        });
    };

    // 1. Generate QR Code
    router.post('/get-qr', async (req, res) => {
        const { uid, uname } = req.body;
        
        if (!LOVENSE_DEV_TOKEN || LOVENSE_DEV_TOKEN.includes('PASTE_YOUR')) {
            return res.status(500).json({ error: 'Server Developer Token not configured' });
        }

        try {
            // Lovense API: Get QR Code
            const result = await callLovenseApi('/getQrCode', {
                token: LOVENSE_DEV_TOKEN,
                uid: uid, // Unique Session ID from client
                uname: uname || 'SillyTavern User',
                v: 2
            });
            res.json(result);
        } catch (error) {
            console.error('[Lovense] QR Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 2. Send Command via Cloud
    router.post('/command', async (req, res) => {
        const { uid, command, action, timeSec, loopRunningSec, loopPauseSec, stopPrevious, toy, apiVer } = req.body;

        // Construct payload for Lovense Cloud API
        // Note: The Cloud API parameters match the Local API parameters
        const payload = {
            token: LOVENSE_DEV_TOKEN,
            uid: uid, // Target the specific user
            command: command || 'Function',
            action,
            timeSec,
            loopRunningSec,
            loopPauseSec,
            stopPrevious,
            toy,
            apiVer: apiVer || 1
        };

        try {
            const result = await callLovenseApi('/command', payload);
            console.log(`[Lovense] Command sent to UID ${uid}: ${action} (Result: ${result.message})`);
            res.json(result);
        } catch (error) {
            console.error('[Lovense] Command Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    console.log('Lovense Cloud Control loaded. Remember to copy this file to /plugins/ if you haven\'t already!');
}
