/** Seal the unknown-length WAV header emitted by streaming speech providers. */
export function normalizeWavDataUrl(value: string): string {
  try {
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]+=*)$/.exec(value);
    if (!match) return value;
    const binary = atob(match[1]);
    if (binary.slice(0, 4) !== 'RIFF' || binary.slice(8, 12) !== 'WAVE') return value;
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0)), data = new DataView(bytes.buffer);
    if (data.getUint32(4, true) === 0xffffffff) data.setUint32(4, bytes.length - 8, true);
    for (let at = 12; at + 8 <= bytes.length;) {
      const size = data.getUint32(at + 4, true);
      if (binary.slice(at, at + 4) === 'data' && size === 0xffffffff) {
        data.setUint32(at + 4, bytes.length - at - 8, true); break;
      }
      at += 8 + size + size % 2;
    }
    let encoded = '';
    for (let at = 0; at < bytes.length; at += 8192) {
      encoded += String.fromCharCode(...Array.from(bytes.subarray(at, at + 8192)));
    }
    return 'data:audio/wav;base64,' + btoa(encoded);
  } catch { return value; }
}

/** Inspect provider PCM before accepting it as pronunciation audio. */
export function isAudibleWavDataUrl(value: string): boolean {
  try {
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]+=*)$/.exec(value);
    if (!match) return false;
    const binary = atob(match[1]);
    const data = new DataView(Uint8Array.from(binary, c => c.charCodeAt(0)).buffer);
    const tag = (at: number) => binary.slice(at, at + 4);
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return false;
    let channels = 0, rate = 0, bits = 0, pcm = false, offset = 0, length = 0;
    for (let at = 12; at + 8 <= data.byteLength;) {
      const size = data.getUint32(at + 4, true), start = at + 8;
      if (size > data.byteLength - start) return false;
      if (tag(at) === 'fmt ' && size >= 16) {
        pcm = data.getUint16(start, true) === 1;
        channels = data.getUint16(start + 2, true);
        rate = data.getUint32(start + 4, true);
        bits = data.getUint16(start + 14, true);
      } else if (tag(at) === 'data') { offset = start; length = size; }
      at = start + size + (size % 2);
    }
    const duration = length / (rate * channels * 2);
    if (!pcm || bits !== 16 || ![1, 2].includes(channels) || rate < 8000 || rate > 96000
        || duration < 0.12 || duration > 90 || length % (channels * 2)) return false;
    let peak = 0, energy = 0;
    for (let at = offset; at < offset + length; at += 2) {
      const sample = data.getInt16(at, true);
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    return peak >= 328 && Math.sqrt(energy / (length / 2)) >= 33;
  } catch { return false; }
}

/** Old saved MP3 cards stay MP3; new validated PCM must keep its WAV extension. */
export function audioFileExtension(value?: string | null): string {
  return /^data:audio\/(?:wav|wave|x-wav);/i.test(value || '') ? 'wav' : 'mp3';
}
