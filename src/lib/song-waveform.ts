const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const WAVEFORM_BARS = 180;

/** Reduce the actual decoded samples to amplitudes; never invent a waveform. */
export function waveformPeaks(channels: readonly Float32Array[], bars = WAVEFORM_BARS): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length || !channels.length || !Number.isInteger(bars) || bars < 1 || bars > 1000) return [];
  const values = Array.from({ length: bars }, (_, bar) => {
    const from = Math.floor(bar * length / bars);
    const to = Math.min(length, Math.max(from + 1, Math.floor((bar + 1) * length / bars)));
    let energy = 0;
    for (const channel of channels) {
      for (let i = from; i < to; i++) {
        const sample = channel[i] ?? 0;
        if (Number.isFinite(sample)) energy += sample * sample;
      }
    }
    return Math.sqrt(energy / ((to - from) * channels.length));
  });
  const peak = Math.max(...values);
  return values.map(value => peak > 0 ? value / peak : 0);
}

/** Audio is decoded briefly in browser memory, then discarded. Only the
 * amplitude array lives with the mounted picker; nothing is uploaded/stored. */
export async function loadSongWaveform(url: string, signal: AbortSignal): Promise<number[]> {
  const source = new URL(url);
  if (source.protocol !== 'https:' || source.hostname !== 'audio-ssl.itunes.apple.com'
    || source.username || source.password || source.port) throw new Error('invalid_preview');
  if (typeof OfflineAudioContext === 'undefined') throw new Error('waveform_unavailable');
  const request = new AbortController();
  const cancel = () => request.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = window.setTimeout(cancel, 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, {
      signal: request.signal, credentials: 'omit', cache: 'no-store', mode: 'cors', redirect: 'error',
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES || !response.body) {
      await response.body?.cancel();
      throw new Error('waveform_unavailable');
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_AUDIO_BYTES) throw new Error('preview_too_large');
      chunks.push(value);
    }
    if (request.signal.aborted) throw new Error('cancelled');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    // Offline decoding does not open an audio output or need autoplay access.
    const context = new OfflineAudioContext(1, 1, 11025);
    let cancelDecode: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      cancelDecode = () => reject(new Error('cancelled'));
      request.signal.addEventListener('abort', cancelDecode, { once: true });
    });
    let buffer: AudioBuffer;
    try { buffer = await Promise.race([context.decodeAudioData(bytes.buffer), cancelled]); }
    finally { if (cancelDecode) request.signal.removeEventListener('abort', cancelDecode); }
    if (request.signal.aborted || buffer.duration > 600) throw new Error('waveform_unavailable');
    return waveformPeaks(Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i)));
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
