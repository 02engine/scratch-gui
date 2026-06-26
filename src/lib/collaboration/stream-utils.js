const calculateChecksum = buffer => {
    const view = new Uint8Array(buffer);
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < view.length; i++) {
        crc ^= view[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    
    return crc ^ 0xFFFFFFFF;
};

class StreamProcessor {
    constructor () {
        this.chunks = [];
        this.totalSize = 0;
        this.receivedSize = 0;
        this.expectedChecksum = 0;
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
    }
    
    start (totalSize, checksum) {
        this.totalSize = totalSize;
        this.expectedChecksum = checksum;
        this.receivedSize = 0;
        this.chunks = [];
    }
    
    processChunk (chunk) {
        const chunkArray = Array.isArray(chunk) ? new Uint8Array(chunk) : chunk;
        this.chunks.push(chunkArray);
        this.receivedSize += chunkArray.byteLength;
        
        if (this.onProgress) {
            this.onProgress({
                progress: Math.round((this.receivedSize / this.totalSize) * 100),
                receivedBytes: this.receivedSize,
                totalSize: this.totalSize
            });
        }
        
        if (this.receivedSize >= this.totalSize) {
            this._complete();
        }
    }
    
    complete () {
        if (this.receivedSize !== this.totalSize) {
            const errorMsg = `Stream incomplete: received ${this.receivedSize} bytes, expected ${this.totalSize} bytes`;
            const error = new Error(errorMsg);
            if (this.onError) {
                this.onError(error);
            }
            return;
        }
        this._complete();
    }
    
    async _complete () {
        try {
            const combinedBuffer = await this._combineChunks();
            
            const actualChecksum = calculateChecksum(combinedBuffer);
            if (actualChecksum !== this.expectedChecksum) {
                throw new Error(`Checksum mismatch: expected ${this.expectedChecksum}, got ${actualChecksum}`);
            }
            
            if (this.onComplete) {
                this.onComplete(combinedBuffer);
            }
        } catch (error) {
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    _combineChunks () {
        const result = new Uint8Array(this.totalSize);
        let offset = 0;
        
        for (const chunk of this.chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        return result.buffer;
    }
}

export {
    StreamProcessor
};
