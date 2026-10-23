export const VIDEO_LIMIT = 50 * 1024 * 1024;
export const formatFileSize = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
export function compressionPlan(duration: number, limit: number) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(limit) ||
    limit <= 0
  )
    throw new Error("Unable to read video duration or upload limit.");
  const target = Math.floor(limit * 0.9);
  const audioBitrate = 64000;
  const videoBitrate = Math.floor(
    (target * 8 * 0.96) / duration - audioBitrate,
  );
  if (videoBitrate < 100000)
    throw new Error(
      "This video is too long for the upload limit. Use a hosted video link or a shorter video.",
    );
  return {
    target,
    audioBitrate,
    videoBitrate,
    height: videoBitrate < 800000 ? 480 : 720,
  };
}
export function readVideoMetadata(
  file: Blob,
  signal?: AbortSignal,
): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      const duration = video.duration;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve({ duration });
    };
    const aborted = () => done(new DOMException("Canceled", "AbortError"));
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      Number.isFinite(video.duration) && video.duration > 0
        ? done()
        : done(
            new Error(
              "Unable to read this video. Use MP4, WebM or a hosted video link.",
            ),
          );
    video.onerror = () =>
      done(
        new Error(
          "This video cannot be played. Use MP4, WebM or a supported video link.",
        ),
      );
    const timer = setTimeout(
      () => done(new Error("Video inspection timed out. Try a video link.")),
      30000,
    );
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) {
      aborted();
      return;
    }
    video.src = url;
  });
}
export async function prepareVideo(
  file: File,
  limit: number,
  onProgress: (progress: number, label: string) => void,
  signal: AbortSignal,
): Promise<File> {
  onProgress(0, "Checking video");
  const { duration } = await readVideoMetadata(file, signal);
  if (file.size <= limit) return file;
  if (file.size > 1024 * 1024 * 1024)
    throw new Error("Use a hosted video link for files larger than 1 GB.");
  const plan = compressionPlan(duration, limit);
  onProgress(0, "Loading video compressor");
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
    throw new DOMException("Canceled", "AbortError");
  }
  try {
    // Same-origin, pinned single-thread core avoids cross-origin isolation requirements.
    let loadingTimeout: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        ffmpeg.load(
          {
            classWorkerURL: new URL("/ffmpeg/worker.js", location.origin).href,
            coreURL: new URL("/ffmpeg/ffmpeg-core.js", location.origin).href,
            wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", location.origin).href,
          },
          { signal },
        ),
        new Promise<never>((_, reject) => {
          loadingTimeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Video compressor could not load. Retry or use a hosted video link.",
                ),
              ),
            45000,
          );
        }),
      ]);
    } finally {
      clearTimeout(loadingTimeout!);
    }
    await ffmpeg.writeFile("input", new Uint8Array(await file.arrayBuffer()));
    ffmpeg.on("progress", ({ progress }) =>
      onProgress(
        Math.min(98, Math.max(0, Math.round(progress * 100))),
        "Compressing video",
      ),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      const bitrate = Math.floor(plan.videoBitrate * (attempt ? 0.8 : 1));
      const code = await ffmpeg.exec([
        "-i",
        "input",
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `scale=-2:'min(${plan.height},ih)'`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        String(bitrate),
        "-maxrate",
        String(bitrate),
        "-bufsize",
        String(bitrate * 2),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        String(plan.audioBitrate),
        "-movflags",
        "+faststart",
        "-y",
        "output.mp4",
      ]);
      if (code !== 0)
        throw new Error(
          "Video compression failed. Try a smaller file or a hosted video link.",
        );
      const data = await ffmpeg.readFile("output.mp4");
      if (typeof data === "string")
        throw new Error("Invalid compressed video.");
      const output = new File(
        [new Uint8Array(data)],
        file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4",
        { type: "video/mp4" },
      );
      if (output.size <= limit && output.size > 0) {
        await readVideoMetadata(output, signal);
        onProgress(100, "Ready to upload");
        return output;
      }
    }
    throw new Error(
      "The compressed video still exceeds the limit. Use a hosted video link or a shorter file.",
    );
  } catch (error) {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    ffmpeg.terminate();
  }
}
