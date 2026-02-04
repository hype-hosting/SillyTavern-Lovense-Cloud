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

    // Helper to clean token
    const getToken = () => {
        if (!LOVENSE_DEV_TOKEN || LOVENSE_DEV_TOKEN.includes('PASTE_YOUR')) {
            return null;
        }
        return LOVENSE_DEV_TOKEN.trim(); // Removes accidental spaces
    };

    // Helper to make HTTPS requests to Lovense
    const callLovenseApi = (path, data) => {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(data);
            const options = {
                hostname: 'api.lovense.com',
                port: 443,
                path: '/api/lan' + path, 
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
                        console.error('[Lovense] Parse Error. Body:', body);
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
        const token = getToken();
        
        if (!token) {
            return res.status(500).json({ error: 'Server Developer Token not configured' });
        }

        try {
            const result = await callLovenseApi('/getQrCode', {
                token: token,
                uid: uid, 
                uname: uname || 'SillyTavern User',
                v: 2
            });
            res.json(result);
        } catch (error) {
            console.error('[Lovense] QR Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 2. Check connected toys
    router.post('/check-toys', async (req, res) => {
        const { uid } = req.body;
        const token = getToken();

        if (!token) return res.status(500).json({ error: 'Token missing' });

        try {
            const result = await callLovenseApi('/command', {
                token: token,
                uid: uid,
                command: 'GetToys',
                apiVer: 1,
            });
            res.json(result);
        } catch (error) {
            console.error('[Lovense] Check Toys Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 3. Send Command via Cloud
    router.post('/command', async (req, res) => {
        const { uid, command, action, timeSec, loopRunningSec, loopPauseSec, stopPrevious, toy, apiVer } = req.body;
        const token = getToken();

        if (!token) return res.status(500).json({ error: 'Token missing' });

        const payload = {
            token: token,
            uid: uid,
            command: command || 'Function',
            action,
            timeSec,
            loopRunningSec,
            loopPauseSec,
            stopPrevious,
            toy,
            apiVer: 2 // FORCE API VERSION 2
        };

        try {
            const result = await callLovenseApi('/command', payload);
            console.log(`[Lovense] Command sent to UID ${uid}: ${action} (Result: ${result.message || 'Unknown'})`);
            
            // Log full result if invalid token to debug
            if (result.message === 'Invalid token!') {
                console.warn('[Lovense] TOKEN INVALID. Please check "Standard API Settings" in Lovense Dashboard.');
            }
            
            res.json(result);
        } catch (error) {
            console.error('[Lovense] Command Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    console.log('Lovense Cloud Control loaded. Remember to copy this file to /plugins/ if you haven\'t already!');
}
