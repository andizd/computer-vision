// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_NUMBER = process.env.WHATSAPP_NUMBER;

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Matikan CSP agar script eksternal (TensorFlow) jalan
app.use(cors());
app.use(bodyParser.json());

// 1. SAJIKAN FOLDER CLIENT SEBAGAI WEBSITE
// Ini yang membuat index.html bisa dibuka di browser
app.use(express.static(path.join(__dirname, 'client')));

// --- SETUP WHATSAPP ---
console.log('[SYSTEM] Menyiapkan WhatsApp Client...');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // Jendela browser akan muncul
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // OPSI: Gunakan Chrome asli laptop (lebih stabil)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Mencegah crash memori
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu' // Matikan GPU agar enteng
        ]
    }
});

client.on('qr', (qr) => {
    console.log('[WA] Scan QR Code ini:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('[WA] Client Siap! Notifikasi aktif.');
});

client.initialize();
// ---------------------

// Variabel Cooldown Server (agar tidak spam WA)
const lastSentTime = {}; 
const SERVER_COOLDOWN = 15000; // 15 Detik

// 2. ENDPOINT UNTUK MENERIMA LAPORAN DARI WEBSITE
app.post('/notify', async (req, res) => {
    try {
        const { label, score } = req.body;
        
        if (!label) return res.status(400).json({ error: 'Label required' });

        const now = Date.now();
        const lastTime = lastSentTime[label] || 0;

        // Cek Cooldown Server
        if (now - lastTime < SERVER_COOLDOWN) {
            console.log(`[SKIP] ${label} terdeteksi, tapi masih cooldown.`);
            return res.json({ status: 'cooldown' });
        }

        // Cek Status WA
        if (!client.info) {
            return res.status(503).json({ error: 'WA belum siap/login' });
        }

        // Update waktu terakhir kirim
        lastSentTime[label] = now;

        // Format Pesan
        const text = `🚨 *PERINGATAN KEAMANAN*\n\nObjek Terdeteksi: *${label.toUpperCase()}*\nAkurasi: *${(score * 100).toFixed(1)}%*\nWaktu: ${new Date().toLocaleTimeString()}`;
        
        // Kirim Pesan
        const chatId = `${TARGET_NUMBER}@c.us`;
        await client.sendMessage(chatId, text);
        
        console.log(`[SENT] Notifikasi ${label} dikirim ke ${TARGET_NUMBER}`);
        res.json({ status: 'sent' });

    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});