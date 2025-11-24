const mongoose = require('mongoose');

// Schema untuk model Device, digunakan untuk menyimpan data perangkat ESP32
// Termasuk informasi seperti ID unik, waktu terakhir terlihat, foto terakhir, dan status unlock
const DeviceSchema = new mongoose.Schema({
    // ID unik perangkat (misalnya, dari ESP32), wajib dan unik
    device_id: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true,  // Menghapus spasi di awal/akhir
        maxlength: 50  // Batas panjang untuk keamanan
    },
    // Waktu terakhir perangkat terlihat (otomatis diupdate saat ada aktivitas)
    lastSeen: { 
        type: Date, 
        default: Date.now  // Default ke waktu sekarang
    },
    // URL atau path ke foto terakhir yang diambil (misalnya, dari kamera ESP32)
    lastPhoto: { 
        type: String, 
        trim: true,
        maxlength: 500  // Batas panjang untuk URL/path
    },
    // Status unlock (true jika perangkat di-unlock via API)
    unlock: { 
        type: Boolean, 
        default: false 
    }
}, {
    // Mengaktifkan timestamps otomatis (createdAt dan updatedAt)
    timestamps: true
});

// Index untuk query yang efisien berdasarkan device_id
DeviceSchema.index({ device_id: 1 });

// Middleware pre-save untuk validasi tambahan (opsional, bisa diperluas)
DeviceSchema.pre('save', function(next) {
    // Contoh: Pastikan device_id tidak kosong setelah trim
    if (!this.device_id || this.device_id.trim().length === 0) {
        return next(new Error('Device ID is required and cannot be empty.'));
    }
    next();
});

module.exports = mongoose.model('Device', DeviceSchema);
