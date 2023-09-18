export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64 = '';

    let group;
    for (let i = 0; i < binary.length; i += 3) {
        group = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i + 2);
        base64 += base64Chars.charAt((group >> 18) & 63);
        base64 += base64Chars.charAt((group >> 12) & 63);
        base64 += base64Chars.charAt((group >> 6) & 63);
        base64 += base64Chars.charAt(group & 63);
    }

    // handle padding
    const mod = binary.length % 3;
    if (mod === 1) {
        base64 = base64.slice(0, -2) + '==';
    } else if (mod === 2) {
        base64 = base64.slice(0, -1) + '=';
    }

    return base64;
}
