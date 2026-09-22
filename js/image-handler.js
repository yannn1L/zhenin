/* ============================================================
   ZHENIN - Image Handler (v2.9.0)
   Manage image upload, compress, base64, thumbnail, state

   Fitur:
   - Client-side compression (max 1280px, JPEG 0.8)
   - Auto-convert HEIC/PNG/WebP → JPEG
   - Thumbnail generation (200px)
   - Max 3 gambar, 2 MB per gambar
   - State management

   Usage:
     await ImageHandler.addFiles(files)
     ImageHandler.getImages()
     ImageHandler.removeImage(id)
     ImageHandler.clear()
   ============================================================ */

export const ImageHandler = {
  MAX_IMAGES: 3,
  MAX_SIZE_MB: 2,
  MAX_DIMENSION: 1280,
  THUMB_SIZE: 200,
  JPEG_QUALITY: 0.8,
  
  _images: [],
  
  /**
   * Add files dari input/change event
   * Return array of added images (yang berhasil)
   */
  async addFiles(files) {
    if (!files || !files.length) return [];
    
    const remaining = this.MAX_IMAGES - this._images.length;
    if (remaining <= 0) {
      throw new Error('Maksimal ' + this.MAX_IMAGES + ' gambar');
    }
    
    const toProcess = Array.from(files).slice(0, remaining);
    const results = [];
    const errors = [];
    
    for (const file of toProcess) {
      try {
        const processed = await this._processFile(file);
        this._images.push(processed);
        results.push(processed);
      } catch (err) {
        console.warn('[ImageHandler] Failed:', file.name, err.message);
        errors.push({ name: file.name, error: err.message });
      }
    }
    
    if (results.length === 0 && errors.length > 0) {
      throw new Error(errors[0].error);
    }
    
    return results;
  },
  
  /**
   * Process single file: validate → compress → base64 → thumbnail
   */
  async _processFile(file) {
    // Validate type
    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('File harus berupa gambar');
    }
    
    // Compress
    const compressed = await this._compressImage(file);
    
    // Check size after compress
    const sizeMB = compressed.size / (1024 * 1024);
    if (sizeMB > this.MAX_SIZE_MB) {
      throw new Error('Gambar terlalu besar (' + sizeMB.toFixed(1) + ' MB). Max ' + this.MAX_SIZE_MB + ' MB');
    }
    
    // Base64
    const base64 = await this._blobToBase64(compressed);
    
    // Thumbnail
    const thumbnail = await this._createThumbnail(compressed);
    
    return {
      id: this._generateId(),
      originalName: file.name || 'image',
      sizeMB: sizeMB.toFixed(2),
      mimeType: 'image/jpeg',
      base64: base64,
      thumbnail: thumbnail,
      addedAt: Date.now()
    };
  },
  
  /**
   * Compress image via Canvas API
   * Auto-resize max 1280px, convert to JPEG 0.8
   */
  async _compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          let { width, height } = img;
          
          // Resize kalau melebihi max dimension
          if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
            const ratio = Math.min(
              this.MAX_DIMENSION / width,
              this.MAX_DIMENSION / height
            );
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          
          // Canvas compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          
          // White background (untuk PNG transparan → JPEG)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Kompresi gambar gagal'));
                return;
              }
              resolve(blob);
            },
            'image/jpeg',
            this.JPEG_QUALITY
          );
        };
        
        img.onerror = () => reject(new Error('Gambar rusak atau tidak valid'));
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
  },
  
  /**
   * Convert blob → base64 string (tanpa prefix data:...)
   */
  async _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        // result: "data:image/jpeg;base64,/9j/4AAQ..."
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        if (commaIdx === -1) {
          reject(new Error('Format base64 tidak valid'));
          return;
        }
        resolve(result.slice(commaIdx + 1));
      };
      
      reader.onerror = () => reject(new Error('Base64 conversion gagal'));
      reader.readAsDataURL(blob);
    });
  },
  
  /**
   * Create small thumbnail untuk preview
   */
  async _createThumbnail(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          let { width, height } = img;
          const ratio = Math.min(this.THUMB_SIZE / width, this.THUMB_SIZE / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        
        img.onerror = () => reject(new Error('Thumbnail gagal'));
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject(new Error('Thumbnail read error'));
      reader.readAsDataURL(blob);
    });
  },
  
  /**
   * Remove image by id
   */
  removeImage(id) {
    const before = this._images.length;
    this._images = this._images.filter(img => img.id !== id);
    return before !== this._images.length;
  },
  
  /**
   * Clear all images
   */
  clear() {
    this._images = [];
  },
  
  /**
   * Get all images (copy)
   */
  getImages() {
    return this._images.slice();
  },
  
  /**
   * Get images formatted untuk backend
   */
  getImagesForAPI() {
    return this._images.map(img => ({
      data: img.base64,
      mimeType: img.mimeType
    }));
  },
  
  /**
   * Get count
   */
  getCount() {
    return this._images.length;
  },
  
  /**
   * Check apakah bisa add more
   */
  canAddMore() {
    return this._images.length < this.MAX_IMAGES;
  },
  
  /**
   * Get remaining slots
   */
  getRemaining() {
    return Math.max(0, this.MAX_IMAGES - this._images.length);
  },
  
  /**
   * Generate unique id
   */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
};

export default ImageHandler;