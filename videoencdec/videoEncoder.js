import { verboseLog, kEncodeQueueSize } from "./logging.js";

export class VideoEncoder {
  constructor() {
    this.encoder = null;
    this.blockingPromise = null;
    this.blockingPromiseResolve = null;
    this.muxer = null;
    this.chunks = [];
  }

  async init(width, height, fps, useCalculatedBitrate) {
    verboseLog("Initializing encoder with dimensions:", { width, height });

    // Calculate maximum dimensions for Level 5.1 (4096x2304)
    const maxWidth = 4096;
    const maxHeight = 2304;
    let targetWidth = width;
    let targetHeight = height;

    // Scale down if needed while maintaining aspect ratio
    if ((width > maxWidth || height > maxHeight) && false) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      targetWidth = Math.floor(width * ratio);
      targetHeight = Math.floor(height * ratio);
      console.log("Scaling video to:", { targetWidth, targetHeight });
    }

    // Calculate appropriate bitrate (0.2 bits per pixel per frame)
    const pixelCount = targetWidth * targetHeight;
    const bitsPerPixel = 0.2;
    const targetBitrate = Math.min(
      Math.floor(pixelCount * bitsPerPixel * 30),
      50_000_000 // Cap at 50Mbps for Level 5.1
    );

    this.muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.StreamTarget({
        chunked: true,
        onData: (data, position) => {
          this.chunks.push({ data: new Uint8Array(data), position });
        }
      }),
      fastStart: "fragmented",
      video: {
        codec: "avc",
        width: targetWidth,
        height: targetHeight,
      },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });

    this.encoder = new window.VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error("Encoding error:", e),
    });

    this.encoder.ondequeue = () => {
      if (
        this.blockingPromise &&
        this.encoder.encodeQueueSize < kEncodeQueueSize
      ) {
        this.blockingPromiseResolve();
        this.blockingPromise = null;
        this.blockingPromiseResolve = null;
      }
    };

    const config = {
      codec: "avc1.640033",
      width: targetWidth,
      height: targetHeight,
      framerate: fps,
    };
    if (useCalculatedBitrate) {
      config.bitrate = targetBitrate;
    }

    await this.encoder.configure(config);
  }

  async encode(frame) {
    while (this.encoder.encodeQueueSize > kEncodeQueueSize) {
      if (this.blockingPromise) {
        throw new Error("Blocking promise already exists");
      }
      this.blockingPromise = new Promise((resolve) => {
        this.blockingPromiseResolve = resolve;
      });
      verboseLog(
        `Blocking until queue size is reduced: ${this.encoder.encodeQueueSize}`
      );
      await this.blockingPromise;
    }
    verboseLog("Encoding frame:", frame);
    this.encoder.encode(frame);
    frame.close();
  }

  async finalize() {
    await this.encoder.flush();
    this.encoder.close();
    this.muxer.finalize();
    const sortedChunks = this.chunks.sort((a, b) => a.position - b.position);
    const lastChunk = sortedChunks[sortedChunks.length - 1];
    const totalSize = lastChunk.position + lastChunk.data.length;
    const result = new Uint8Array(totalSize);
    for (const chunk of sortedChunks) {
      result.set(chunk.data, chunk.position);
    }
    const blob = new Blob([result], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "processed-video.mp4";
    a.click();
    URL.revokeObjectURL(url);
  }
}