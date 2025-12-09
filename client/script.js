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

// Fungsi mengecek apakah dua kotak bersentuhan
function isOverlapping(bbox1, bbox2) {
    // Kita bongkar array-nya dulu
    const [x1, y1, w1, h1] = bbox1;
    const [x2, y2, w2, h2] = bbox2;

    // Rumus Matematika Tabrakan (AABB Collision)
    return (
        x1 < x2 + w2 &&
        x1 + w1 > x2 &&
        y1 < y2 + h2 &&
        y1 + h1 > y2
    );
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

    // 1. Deteksi semua objek dulu
    const predictions = await model.detect(video);
    
    // 2. Bersihkan canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const minScore = parseFloat(thresholdInput.value);

    // 3. Pisahkan antara ORANG dan OBJEK LAIN
    let persons = [];
    let objects = [];

    predictions.forEach(prediction => {
        if (prediction.score >= minScore) {
            if (prediction.class === 'person') {
                persons.push(prediction); // Simpan daftar orang
            } else {
                objects.push(prediction); // Simpan benda (hp, motor, tas, dll)
            }
        }
    });

    // 4. Proses Logika Penggabungan
    persons.forEach(person => {
        // Default label awal
        let finalLabel = "Orang";
        let statusColor = "#00FF00"; // Hijau (Aman)

        // Loop untuk mengecek setiap benda (HP, Motor, dll)
        objects.forEach(obj => {
            // Cek apakah benda ini menempel dengan orang?
            if (isOverlapping(person.bbox, obj.bbox)) {
                
                // LOGIKA GANTI LABEL ORANG
                if (obj.class === 'cell phone') {
                    finalLabel = "⚠️ Orang Memegang HP";
                    statusColor = "#FFFF00"; // Kuning
                } 
                else if (obj.class === 'motorcycle') {
                    finalLabel = "🛵 Orang Naik Motor";
                    statusColor = "#FFA500"; // Oranye
                }
                else if (obj.class === 'bicycle') {
                    finalLabel = "🚲 Orang Naik Sepeda";
                }
            }

            // --- GAMBAR KOTAK BENDA (HP/MOTOR) DI SINI ---
            
            const [ox, oy, ow, oh] = obj.bbox;
            
            // 1. Gambar Kotak Biru Benda
            ctx.strokeStyle = "blue";
            ctx.lineWidth = 2;
            ctx.strokeRect(ox, oy, ow, oh);

            // 2. Gambar Teks Nama Benda
            ctx.fillStyle = "blue"; 
            ctx.font = "bold 16px Arial";
            ctx.fillText(
                `${obj.class} (${Math.round(obj.score * 100)}%)`, 
                ox, 
                oy > 10 ? oy - 5 : 10
            );
        }); 

        
        const [x, y, width, height] = person.bbox;
        
        // 1. Gambar Kotak Orang (Warna sesuai status)
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);

        // 2. Gambar Teks Label Orang (Misal: Orang Memegang HP)
        ctx.fillStyle = statusColor;
        ctx.font = "bold 20px Arial";
        ctx.fillText(
            `${finalLabel} (${Math.round(person.score * 100)}%)`,
            x, y > 10 ? y - 10 : 10
        );

        // 6. Kirim Notifikasi
        // Kirim jika labelnya sudah berubah (mengandung kata "Orang")
        if (finalLabel.includes("Orang")) { 
            sendNotification(finalLabel, person.score);
        }
    });
    requestAnimationFrame(detectFrame);
}

// 4. Kirim Data ke Backend (server.js)
// Client-side cooldown agar tidak membanjiri request HTTP
let lastRequestTime = {}; 

function sendNotification(label, score) {
    const now = Date.now();
    // Contoh: Jika "Orang" cooldown, "Orang Memegang HP" TETAP BOLEH LEWAT
    if (lastRequestTime[label] && (now - lastRequestTime[label] < 5000)) {
        // Jika belum 5 detik sejak pesan terakhir untuk label ini, batalkan.
        console.log(`⏳ Skip kirim "${label}" (Masih Cooldown)`);
        return; 
    }

    // Update waktu terakhir untuk label ini saja
    lastRequestTime[label] = now;

    // Log ke layar dan Console
    log(`🚀 Mengirim Notifikasi: ${label}`);
    console.log("Mencoba fetch ke server untuk:", label);

    fetch('http://localhost:3000/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label, score: score })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'sent') log(`✅ WA Terkirim: ${label}`);
        else if(data.status === 'cooldown') log("⏳ Server sedang sibuk.");
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