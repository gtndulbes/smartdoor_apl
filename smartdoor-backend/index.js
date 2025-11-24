// index.js (COPY PASTED - replace your file)
require('dotenv').config();

console.log("ENV MONGO_URL =", process.env.MONGO_URL);
const mongoose = require('mongoose');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

// koneksi database
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

app.use(cors());
app.use(express.json());

// pastikan folder uploads ada
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// serve folder uploads statically
app.use('/uploads', express.static(UPLOAD_DIR));

// simple in-memory device store for dev
const devices = {}; // { deviceId: { unlock: false, lastSeen: Date } }

// --- MULTER config (disk storage) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // buat nama unik
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // ambil ekstensi asli jika ada
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // limit 5MB (ubah jika perlu)
  }
});

// simple SSE broadcast example in backend
const clients = [];
app.get('/motion', (req, res) => {
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // send an initial comment so browsers treat the connection as active
  try {
    res.write(': connected\n\n');
  } catch (err) {
    console.warn('SSE initial write failed', err);
  }

  // heartbeat to keep the connection alive and detect dropped clients
  const heartbeat = setInterval(() => {
    try {
      newClient.res.write(': heartbeat\n\n');
    } catch (e) {
      // if write fails, cleanup will happen on close
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = clients.findIndex(c => c.id === clientId);
    if (idx !== -1) clients.splice(idx,1);
  });
});

// when motion occurs (e.g., in /upload or separate endpoint), broadcast:
function broadcastMotion(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  // write to each client and remove ones that fail
  clients.forEach((c, idx) => {
    try {
      c.res.write(data);
    } catch (err) {
      console.warn('SSE write failed, removing client', c.id, err);
      try { c.res.end(); } catch (e) {}
      clients.splice(idx, 1);
    }
  });
}

// --- Health check ---
app.get('/', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- List files ---
app.get('/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Tidak bisa membaca folder uploads' });
    res.json({ count: files.length, files });
  });
});

// --- Upload endpoint (expects form-data with key 'photo' type File) ---
const Photo = require('./models/Photo');
const Device = require('./models/Device');

app.post('/upload', (req, res) => {
  // call multer middleware manually so we can catch multer errors and respond clearly
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      console.error('Multer error on upload:', err);
      // Multer error (file too large, invalid form, etc.)
      return res.status(400).json({ status: 'error', message: err.message || 'Upload failed (multer error)' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded. Use key "photo".' });
      }

      const deviceId = req.header('x-device-id') || req.body.device_id || 'unknown';
      const filename = req.file.filename;
      const url = `/uploads/${filename}`;

      // Save photo log
      const photoDoc = await Photo.create({ device_id: deviceId, filename, url });

      // Update device metadata
      await Device.findOneAndUpdate(
        { device_id: deviceId },
        { lastSeen: new Date(), lastPhoto: filename },
        { upsert: true }
      );

      console.log(`Saved photo from ${deviceId}: ${filename}`);

      // broadcast to SSE clients that motion/photo arrived
      try {
        broadcastMotion({ type: 'photo', device_id: deviceId, filename, url, timestamp: photoDoc.timestamp });
      } catch (bErr) {
        console.warn('Broadcast failed', bErr);
      }

      return res.json({ status: 'ok', device_id: deviceId, filename, url, timestamp: photoDoc.timestamp });
    } catch (err2) {
      console.error('Upload error processing file:', err2);
      return res.status(500).json({ status: 'error', message: err2.message || 'Internal upload error' });
    }
  });
});


// --- Unlock endpoints (in-memory) ---
// App requests unlock -> set flag true
// --- Unlock endpoints (in-memory) ---
app.post('/api/devices/:id/unlock', (req, res) => {
  const id = req.params.id;

  devices[id] = devices[id] || {};

  const user = (req.body && req.body.user) ? req.body.user : 'app';

  devices[id].unlock = true;
  devices[id].lastRequestFrom = user;

  console.log(`[UNLOCK REQUEST] device=${id} from=${user}`);

  res.json({ status: 'queued', device: id });
});

// receive motion event (without photo) and broadcast to clients
app.post('/api/motion', async (req, res) => {
  try {
    const { device_id, message } = req.body || {};
    const payload = {
      type: 'motion',
      device_id: device_id || 'unknown',
      message: message || 'motion detected',
      timestamp: new Date()
    };
    broadcastMotion(payload);
    return res.json({ status: 'ok', payload });
  } catch (err) {
    console.error('Motion endpoint error', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ESP32 polls this endpoint
app.get('/api/devices/:id/unlock_status', (req, res) => {
  const id = req.params.id;
  devices[id] = devices[id] || {};
  const shouldUnlock = !!devices[id].unlock;
  if (shouldUnlock) {
    // reset flag so unlock is one-time
    devices[id].unlock = false;
    console.log(`[POLL] unlock for ${id} -> true`);
    return res.json({ unlock: true });
  }
  res.json({ unlock: false });
});

app.get('/api/photos', async (req, res) => {
  const data = await Photo.find().sort({ timestamp: -1 });
  res.json(data);
});

// --- fallback error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



