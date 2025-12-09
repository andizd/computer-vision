// client/script.js
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const logsDiv = document.getElementById('logs');
const thresholdInput = document.getElementById('threshold');
const threshVal = document.getElementById('threshVal');

let model = null;
let isDetecting = false;
let detectionInterval = null;

// Tampilkan nilai slider
thresholdInput.addEventListener('input', () => {
    threshVal.innerText = Math.round(thresholdInput.value * 100) + '%';
});

function log(msg) {
    const time = new Date().toLocaleTimeString();
    logsDiv.innerHTML = `[${time}] ${msg}<br>` + logsDiv.innerHTML;
}

// 1. Fungsi Menyalakan Kamera
async function setupCamera() {
    statusText.innerText = "Meminta akses kamera...";
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
    });
    video.srcObject = stream;
    
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve();
        };
    });
}

// 2. Fungsi Load Model
async function loadModel() {
    statusText.innerText = "Sedang memuat Model AI...";
    model = await cocoSsd.load();
    statusText.innerText = "Model Siap! CCTV Aktif.";
    log("Model COCO-SSD berhasil dimuat.");
}

// 3. Fungsi Deteksi Berulang
async function detectFrame() {
    if (!isDetecting) return;

    // Deteksi objek
    const predictions = await model.detect(video);
    
    // Bersihkan canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const minScore = parseFloat(thresholdInput.value);

    predictions.forEach(prediction => {
        if (prediction.score >= minScore) {
            // Gambar Kotak
            const [x, y, width, height] = prediction.bbox;
            ctx.strokeStyle = "#00FF00";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            // Gambar Teks
            ctx.fillStyle = "#00FF00";
            ctx.font = "18px Arial";
            ctx.fillText(
                `${prediction.class} (${Math.round(prediction.score * 100)}%)`,
                x, y > 10 ? y - 5 : 10
            );

            // LOGIKA PENGIRIMAN KE SERVER (WA)
            if (prediction.class === 'person') {
                sendNotification(prediction.class, prediction.score);
            }
        }
    });

    // Loop secepat mungkin menggunakan requestAnimationFrame
    requestAnimationFrame(detectFrame);
}

// 4. Kirim Data ke Backend (server.js)
// Client-side cooldown agar tidak membanjiri request HTTP
let lastRequestTime = 0;
function sendNotification(label, score) {
    const now = Date.now();
    if (now - lastRequestTime < 5000) return; // Client cooldown 5 detik

    lastRequestTime = now;
    log(`⚠️ Mendeteksi ${label}. Mengirim sinyal ke server...`);

    fetch('http://localhost:3000/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label, score: score })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'sent') log("✅ Notifikasi WA Terkirim!");
        else if(data.status === 'cooldown') log("⏳ Server sedang cooldown (skip WA).");
    })
    .catch(err => log("❌ Gagal connect server: " + err));
}

// Event Listeners
startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    isDetecting = true;

    await setupCamera();
    await loadModel();
    
    video.play();
    detectFrame();
});

stopBtn.addEventListener('click', () => {
    isDetecting = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.innerText = "CCTV Dimatikan.";
    
    // Matikan stream kamera
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});