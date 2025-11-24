const mongoose = require('mongoose');

// Schema untuk model Photo, digunakan untuk menyimpan data foto yang diambil dari kamera ESP32
// Termasuk informasi seperti ID perangkat, nama file, URL, dan timestamp
const PhotoSchema = new mongoose.Schema({
    // ID perangkat yang mengambil foto (harus sesuai dengan Device model)
    device_id: { 
        type: String, 
        required: true, 
        trim: true,  // Menghapus spasi di awal/akhir
        maxlength: 50  // Batas panjang untuk keamanan
    },
    // Nama file foto (misalnya, 'photo_123456.jpg')
    filename: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 100  // Batas panjang untuk nama file
    },
    // URL atau path lengkap ke foto (misalnya, untuk akses dari frontend)
    url: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 500  // Batas panjang untuk URL/path
    },
    // Timestamp kapan foto diambil (default ke waktu sekarang)
    timestamp: { 
        type: Date, 
        default: Date.now 
    }
}, {
    // Mengaktifkan timestamps otomatis (createdAt dan updatedAt)
    timestamps: true
});

// Index untuk query yang efisien berdasarkan device_id dan timestamp (misalnya, untuk mengambil foto terbaru per perangkat)
PhotoSchema.index({ device_id: 1, timestamp: -1 });

// Middleware pre-save untuk validasi tambahan (opsional, bisa diperluas)
PhotoSchema.pre('save', function(next) {
    // Contoh: Pastikan URL valid (sederhana, bisa gunakan library seperti 'validator' untuk lebih ketat)
    if (!this.url || !this.url.startsWith('http') && !this.url.startsWith('/')) {
        return next(new Error('URL must be a valid HTTP URL or relative path.'));
    }
    next();
});

module.exports = mongoose.model('Photo', PhotoSchema);
