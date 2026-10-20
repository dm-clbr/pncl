import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SongWaveform } from '../components/SongWaveform';
import { waveformPeaks, loadSongWaveform } from '../lib/song-waveform';

const commit = vi.fn();
function Timeline({ disabled = false }: { disabled?: boolean }) {
  const [start, setStart] = useState(0);
  return <SongWaveform duration={30} start={start} peaks={[0.2, 1, 0.4]} loading={false}
    playhead={null} disabled={disabled} onChange={setStart} onCommit={commit} />;
}
function track(disabled = false) {
  render(<Timeline disabled={disabled} />);
  const slider = screen.getByRole('slider', { name: 'Section start' });
  Object.defineProperties(slider, {
    getBoundingClientRect: { value: () => ({ left: 100, width: 300 }) },
    setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() },
  });
  return slider;
}
beforeEach(() => {
  commit.mockReset();
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerId = options.pointerId ?? 1; }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('drags the whole fixed window without jumping at the grab point, and previews on release', () => {
  const slider = track();
  fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150, button: 0 });
  expect(slider).toHaveAttribute('aria-valuenow', '0');
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 270 });
  expect(slider).toHaveAttribute('aria-valuenow', '12');
  expect(slider).toHaveAttribute('aria-valuetext', '0:12 to 0:22, 10 seconds');
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 270 });
  expect(commit).toHaveBeenCalledExactlyOnceWith(12);
});
it('centers a tap outside the selection and clamps at the preview end', () => {
  const slider = track();
  fireEvent.pointerDown(slider, { pointerId: 1, clientX: 390, button: 0, pointerType: 'touch' });
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 390 });
  expect(slider).toHaveAttribute('aria-valuenow', '20'); expect(commit).toHaveBeenCalledWith(20);
});
it('ignores other pointers and does not preview a cancelled drag', () => {
  const slider = track();
  fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150, button: 0 });
  fireEvent.pointerMove(slider, { pointerId: 2, clientX: 350 });
  expect(slider).toHaveAttribute('aria-valuenow', '0');
  fireEvent.pointerCancel(slider, { pointerId: 1 });
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 350 });
  expect(commit).not.toHaveBeenCalled();
});
it('supports one-second keys, larger steps, and both endpoints', () => {
  const slider = track();
  fireEvent.keyDown(slider, { key: 'ArrowRight' }); expect(slider).toHaveAttribute('aria-valuenow', '1');
  fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true }); expect(slider).toHaveAttribute('aria-valuenow', '6');
  fireEvent.keyDown(slider, { key: 'End' }); fireEvent.keyUp(slider, { key: 'End' });
  expect(commit).toHaveBeenLastCalledWith(20);
  fireEvent.keyDown(slider, { key: 'Home' }); expect(slider).toHaveAttribute('aria-valuenow', '0');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' }); expect(slider).toHaveAttribute('aria-valuenow', '0');
});
it('disables pointer and keyboard edits while saving', () => {
  const slider = track(true);
  fireEvent.pointerDown(slider, { pointerId: 1, clientX: 350, button: 0 });
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 350 });
  fireEvent.keyDown(slider, { key: 'End' }); fireEvent.keyUp(slider, { key: 'End' });
  expect(slider).toHaveAttribute('aria-valuenow', '0'); expect(commit).not.toHaveBeenCalled();
});
it('derives amplitudes from both channels and represents silence honestly', () => {
  expect(waveformPeaks([new Float32Array([0, 0, 1, -1])], 2)).toEqual([0, 1]);
  expect(waveformPeaks([new Float32Array([0, 0]), new Float32Array([1, -1])], 2)).toEqual([1, 1]);
  expect(waveformPeaks([new Float32Array(4)], 2)).toEqual([0, 0]);
  expect(waveformPeaks([], 2)).toEqual([]);
});
it('decodes an allowed preview without credentials, persistence, or an audio output', async () => {
  const decode = vi.fn().mockResolvedValue({ duration: 30, numberOfChannels: 1, getChannelData: () => new Float32Array([0, 1, 0.5, 0]) });
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode; });
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetcher);
  const values = await loadSongWaveform('https://audio-ssl.itunes.apple.com/preview.m4a', new AbortController().signal);
  expect(values).toHaveLength(180); expect(Math.max(...values)).toBe(1);
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error', mode: 'cors' }));
});
it('rejects arbitrary URLs and oversized audio before decoding', async () => {
  const decode = vi.fn();
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode; });
  const fetcher = vi.fn().mockResolvedValue(new Response('too big', { headers: { 'content-length': String(9 * 1024 * 1024) } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(loadSongWaveform('https://example.test/audio', new AbortController().signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(loadSongWaveform('https://audio-ssl.itunes.apple.com/preview.m4a', new AbortController().signal)).rejects.toThrow();
  expect(decode).not.toHaveBeenCalled();
});
