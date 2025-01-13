const kEncodeQueueSize = 33;
const kEnableVerboseLogging = false;

function verboseLog() {
  // unpack arguments to suite into console.log.
  if (kEnableVerboseLogging) {
    console.log.apply(console, arguments);
  }
}

class VideoEncoder {
  constructor(canvas, mp4File) {
    this.canvas = canvas;
    this.mp4File = mp4File;
    this.encoder = null;
    this.trackId = null;
    this.firstKeyFrame = true;
    this.spsData = null;
    this.ppsData = null;
    this.blockingPromise = null;
    this.blockingPromiseResolve = null;
    this.timescale = 10000;
  }

  async init(width, height, fps) {
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

    const config = {
      codec: "avc1.640033", // Level 5.1 supports up to 4096x2304
      width: targetWidth,
      height: targetHeight,
      // bitrate: targetBitrate,
      framerate: fps,
      avc: { format: "annexb" },
    };

    // Initialize MP4Box with explicit file type
    this.trackId = this.mp4File.addTrack({
      type: "avc1",
      codecs: "avc1.640033",
      width: targetWidth,
      height: targetHeight,
      timescale: this.timescale,
      framerate: {
        fixed: true,
        fps: fps,
      },
    });

    verboseLog("Track ID returned:", this.trackId);

    if (!this.trackId || this.trackId < 0) {
      throw new Error(`Invalid track ID returned: ${this.trackId}`);
    }

    this.encoder = new window.VideoEncoder({
      output: async (chunk, cfg) => {
        try {
          const buffer = new ArrayBuffer(chunk.byteLength);
          const initialView = new Uint8Array(buffer);
          chunk.copyTo(initialView);

          let frameData = initialView;

          if (chunk.type === "key") {
            const nalUnits = this.parseNALUnits(initialView);
            for (const nal of nalUnits) {
              const nalType = nal[0] & 0x1f;
              if (nalType === 7 && !this.spsData) {
                this.spsData = nal;
                verboseLog("Found SPS:", this.spsData);
              } else if (nalType === 8 && !this.ppsData) {
                this.ppsData = nal;
                verboseLog("Found PPS:", this.ppsData);
              }
            }

            if (this.spsData && this.ppsData && this.firstKeyFrame) {
              this.firstKeyFrame = false;
              const avcC = this.createAVCCBox();
              this.setAvccBox(this.trackId, avcC);
            }

            if (this.spsData && this.ppsData) {
              frameData = this.createFullFrame(initialView);
            }
          }

          const sample = {
            data: frameData,
            duration: Math.round((chunk.duration * this.timescale) / 1000000),
            dts: Math.round((chunk.timestamp * this.timescale) / 1000000),
            cts: Math.round((chunk.timestamp * this.timescale) / 1000000),
            is_sync: chunk.type === "key",
          };

          this.mp4File.addSample(this.trackId, sample.data, sample);
          verboseLog("Added sample:", sample);
          verboseLog("From chunk:", chunk);
        } catch (error) {
          console.error("Error processing video chunk:", error);
        }
      },
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

    await this.encoder.configure(config);
  }

  parseNALUnits(data) {
    const nalUnits = [];
    let offset = 0;

    while (offset < data.length - 4) {
      if (
        data[offset] === 0 &&
        data[offset + 1] === 0 &&
        data[offset + 2] === 0 &&
        data[offset + 3] === 1
      ) {
        const start = offset + 4;
        let end = data.length;

        for (let i = start; i < data.length - 4; i++) {
          if (
            data[i] === 0 &&
            data[i + 1] === 0 &&
            data[i + 2] === 0 &&
            data[i + 3] === 1
          ) {
            end = i;
            break;
          }
        }

        nalUnits.push(data.slice(start, end));
        offset = end;
      } else {
        offset++;
      }
    }

    return nalUnits;
  }

  createAVCCBox() {
    return {
      configurationVersion: 1,
      AVCProfileIndication: this.spsData[1],
      profile_compatibility: this.spsData[2],
      AVCLevelIndication: this.spsData[3],
      lengthSizeMinusOne: 3,
      nb_SPS: 1,
      SPS: [this.spsData],
      nb_PPS: 1,
      PPS: [this.ppsData],
    };
  }

  createFullFrame(initialView) {
    const fullFrame = new Uint8Array(
      4 + this.spsData.length + 4 + this.ppsData.length + initialView.length
    );

    let offset = 0;
    // Add SPS
    fullFrame.set([0, 0, 0, 1], offset);
    offset += 4;
    fullFrame.set(this.spsData, offset);
    offset += this.spsData.length;

    // Add PPS
    fullFrame.set([0, 0, 0, 1], offset);
    offset += 4;
    fullFrame.set(this.ppsData, offset);
    offset += this.ppsData.length;

    // Add frame data
    fullFrame.set(initialView, offset);

    return fullFrame;
  }

  setAvccBox(trackId, avcC) {
    const track = this.mp4File.getTrackById(trackId);
    if (
      track &&
      track.trak &&
      track.trak.mdia &&
      track.trak.mdia.minf &&
      track.trak.mdia.minf.stbl &&
      track.trak.mdia.minf.stbl.stsd
    ) {
      const stsd = track.trak.mdia.minf.stbl.stsd;
      if (!stsd.entries) stsd.entries = [];
      if (!stsd.entries[0]) {
        stsd.entries[0] = {
          type: "avc1",
          width: track.width,
          height: track.height,
          avcC: avcC,
        };
      } else {
        stsd.entries[0].avcC = avcC;
      }
    }
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
    this.mp4File.save("processed-video.mp4");
  }
}

class VideoProcessor {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.status = document.getElementById("status");
    document.getElementById("canvasContainer").appendChild(this.canvas);
    this.mp4File = null;
    this.encoder = null;
    this.frameCountDisplay = document.getElementById("frameCount");
    this.nb_samples = 0;
    this.frame_count = 0;
    this.isFinalized = false;
    this.previousPromise = null;
    this.matrix = null; // replace this.rotation with this.matrix
    this.startTime = 0;
    this.startTimeInput = document.getElementById("startTime");
    this.endTimeInput = document.getElementById("endTime");
    this.timeRangeStart = undefined;
    this.timeRangeEnd = undefined;
    this.timestampStartInput = document.getElementById("timestampStart");
    this.userStartTime = null;
    this.outputTaskPromises = [];
  }

  setStatus(phase, message) {
    this.status.textContent = `${phase}: ${message}`;
  }

  setMatrix(matrix) {
    this.matrix = matrix;
  }

  convertTimeToMs(timeStr) {
    const [minutes, seconds] = timeStr.split(":").map(Number);
    return (minutes * 60 + seconds) * 1000;
  }

  validateTimeInput(input) {
    const regex = /^[0-5][0-9]:[0-5][0-9]$/;
    if (!regex.test(input.value)) {
      input.value = "00:00";
    }
  }

  validateTimestampInput(input) {
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (input.value && !regex.test(input.value)) {
      alert("Invalid timestamp format. Please use YYYY-MM-DD HH:MM:SS");
      input.value = "";
      return false;
    }
    return true;
  }

  async finalize() {
    if (this.outputTaskPromises.length > 0) {
      await Promise.all(this.outputTaskPromises);
      this.outputTaskPromises = [];
    }
    if (!this.isFinalized) {
      this.isFinalized = true;
      this.encoder.finalize();
    }
  }

  async processFile(file) {
    this.validateTimeInput(this.startTimeInput);
    this.validateTimeInput(this.endTimeInput);

    const startMs = this.convertTimeToMs(this.startTimeInput.value);
    const endMs = this.convertTimeToMs(this.endTimeInput.value);

    this.timeRangeStart = startMs > 0 ? startMs : undefined;
    this.timeRangeEnd = endMs > 0 ? endMs : undefined;

    if (
      this.timeRangeEnd !== undefined &&
      this.timeRangeStart !== undefined &&
      this.timeRangeEnd <= this.timeRangeStart
    ) {
      this.timeRangeEnd = undefined;
      this.endTimeInput.value = "00:00";
    }

    // Add timestamp validation
    if (
      this.timestampStartInput.value &&
      !this.validateTimestampInput(this.timestampStartInput)
    ) {
      return;
    }

    if (this.timestampStartInput.value) {
      this.userStartTime = new Date(this.timestampStartInput.value);
      if (isNaN(this.userStartTime.getTime())) {
        alert("Invalid date. Please check your input.");
        return;
      }
    }

    try {
      const videoURL = URL.createObjectURL(file);
      await this.processVideo(videoURL);
      URL.revokeObjectURL(videoURL);
    } catch (error) {
      console.error("Error processing video:", error);
      this.setStatus("error", error.message);
    }
  }

  async processVideo(uri) {
    let sawChunks = 0;
    const demuxer = new MP4Demuxer(uri, {
      onConfig: (config) => this.setupDecoder(config),
      onChunk: (chunk) => {
        sawChunks++;
        this.decoder.decode(chunk);
      },
      setStatus: (phase, message) => this.setStatus(phase, message),
      onChunkEnd: (sampleProcessed) => {
        this.nb_samples = sampleProcessed;
        verboseLog(`Saw ${sawChunks} chunks`);
        this.decoder.flush();
      },
      timeRangeStart: this.timeRangeStart,
      timeRangeEnd: this.timeRangeEnd,
    });
  }

  async setupDecoder(config) {
    // Initialize the decoder
    this.decoder = new VideoDecoder({
      output: (frame) => this.outputTaskPromises.push(this.processFrame(frame)),
      error: (e) => console.error(e),
    });

    this.decoder.ondequeue = () => {
      if (this.decoder.decodeQueueSize == 0) {
        this.finalize();
      }
    };

    await this.decoder.configure(config);
    this.setStatus("decode", "Decoder configured");

    // Set up canvas dimensions - now using matrix[0] and matrix[1] to detect rotation
    let canvasWidth = undefined;
    let canvasHeight = undefined;
    if (config.matrix[0] === 0) {
      // 90 or 270 degree rotation
      canvasWidth = config.codedHeight;
      canvasHeight = config.codedWidth;
    } else {
      canvasWidth = config.codedWidth;
      canvasHeight = config.codedHeight;
    }
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.mp4File = MP4Box.createFile({ ftyp: "isom" });
    this.encoder = new VideoEncoder(this.canvas, this.mp4File);
    this.encoder.init(canvasWidth, canvasHeight, config.fps);
    this.frame_count = 0;
    this.frameCountDisplay.textContent = `Processed frames: 0 / ${this.nb_samples}`;
    this.setMatrix(config.matrix);
    this.startTime = this.userStartTime || config.startTime || new Date();
  }

  async processFrame(frame) {
    const frameTimeMs = Math.floor(frame.timestamp / 1000);

    // Skip frames before start time
    if (
      this.timeRangeStart !== undefined &&
      frameTimeMs < this.timeRangeStart
    ) {
      frame.close();
      return;
    }

    // Stop processing after end time
    if (this.timeRangeEnd !== undefined && frameTimeMs > this.timeRangeEnd) {
      frame.close();
      return;
    }

    let tempPromise = this.previousPromise;
    while (tempPromise) {
      await tempPromise;
      if (tempPromise === this.previousPromise) {
        break;
      }
      tempPromise = this.previousPromise;
    }

    try {
      this.ctx.save();

      // Apply transformation matrix
      if (this.matrix) {
        // Scale the matrix values back from fixed-point to floating-point
        const scale = 1 / 65536;
        const [a, b, u, c, d, v, x, y, w] = this.matrix.map(
          (val) => val * scale
        );

        if (a === -1 && d === -1) {
          // 180 degree rotation
          this.ctx.translate(this.canvas.width, this.canvas.height);
          this.ctx.rotate(Math.PI);
        } else if (a === 0 && b === 1 && c === -1 && d === 0) {
          // 90 degree rotation
          this.ctx.translate(this.canvas.width, 0);
          this.ctx.rotate(Math.PI / 2);
        } else if (a === 0 && b === -1 && c === 1 && d === 0) {
          // 270 degree rotation
          this.ctx.translate(0, this.canvas.height);
          this.ctx.rotate(-Math.PI / 2);
        }
        // For identity matrix (a=1, d=1) or other transforms, no transformation needed
      }

      // Draw the frame
      this.ctx.drawImage(frame, 0, 0);

      this.ctx.restore();

      // Convert frame.timestamp (microseconds) to milliseconds and add to startTime
      let frameTimeMs = Math.floor(frame.timestamp / 1000);
      if (this.timeRangeStart !== undefined) {
        frameTimeMs += this.timeRangeStart;
      }

      const frameTime = new Date(this.startTime.getTime() + frameTimeMs);
      const timestamp = frameTime
        .toLocaleString("sv", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        .replace(" ", " "); // Ensure proper spacing

      // Calculate font size based on canvas dimensions
      const fontSize = Math.min(this.canvas.width, this.canvas.height) * 0.03;
      this.ctx.fillStyle = "white";
      this.ctx.font = `${fontSize}px Arial`;
      this.ctx.textAlign = "right";
      this.ctx.fillText(
        timestamp,
        this.canvas.width - 10,
        this.canvas.height - 10
      );

      const videoFrameOptions = {
        timestamp: frame.timestamp,
        duration: frame.duration,
      };
      frame.close();
      verboseLog(`videoFrameOptions: ${JSON.stringify(videoFrameOptions)}`);
      const newFrame = new VideoFrame(this.canvas, videoFrameOptions);

      this.frame_count++;
      this.frameCountDisplay.textContent = `Processed frames: ${this.frame_count} / ${this.nb_samples}`;
      this.previousPromise = this.encoder.encode(newFrame);
      await this.previousPromise;
    } catch (error) {
      console.error("Error processing frame:", error);
    }
  }
}

// MP4 demuxer class implementation
class MP4Demuxer {
  constructor(
    uri,
    { onConfig, onChunk, setStatus, onChunkEnd, timeRangeStart, timeRangeEnd }
  ) {
    this.onConfig = onConfig;
    this.onChunk = onChunk;
    this.setStatus = setStatus;
    this.onChunkEnd = onChunkEnd;
    this.timeRangeStart = timeRangeStart;
    this.timeRangeEnd = timeRangeEnd;
    this.file = MP4Box.createFile();

    this.file.onError = (error) => setStatus("demux", error);
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);
    this.nb_samples = 0;
    this.samples_passed = 0;
    this.samples_processed = 0;
    this.stopProcessingSamples = false;
    this.setupFile(uri);
  }

  async setupFile(uri) {
    const fileSink = new MP4FileSink(this.file, this.setStatus);
    const response = await fetch(uri);
    await response.body.pipeTo(
      new WritableStream(fileSink, { highWaterMark: 2 })
    );
  }

  getDescription(track) {
    const trak = this.file.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // Remove the box header.
      }
    }
    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }

  calculateFPS(track) {
    // Convert duration to seconds using timescale
    const durationInSeconds = track.duration / track.timescale;

    // Calculate FPS using number of samples (frames) divided by duration
    const fps = track.nb_samples / durationInSeconds;

    // Round to 2 decimal places for cleaner display
    return Math.round(fps * 100) / 100;
  }

  onReady(info) {
    this.setStatus("demux", "Ready");
    const track = info.videoTracks[0];

    // Calculate duration in milliseconds
    const durationMs = (track.duration * 1000) / track.timescale;

    // Create a Date object for startTime
    const startTime = track.created
      ? new Date(track.created.getTime() - durationMs)
      : new Date();

    this.onConfig({
      codec: track.codec,
      codedHeight: track.video.height,
      codedWidth: track.video.width,
      description: this.getDescription(track),
      nb_samples: track.nb_samples,
      matrix: track.matrix, // Pass matrix directly instead of rotation
      startTime: startTime,
      fps: this.calculateFPS(track),
    });
    this.nb_samples = track.nb_samples;

    this.file.setExtractionOptions(track.id);
    this.file.start();
  }

  onSamples(track_id, ref, samples) {
    if (this.stopProcessingSamples) return;
    // Must add before the samples array is modified.
    this.samples_passed += samples.length;

    if (this.timeRangeStart !== undefined) {
      // Binary search the sample that is closest to the start time and is a keyframe(lower bound).
      let left = 0;
      let right = samples.length - 1;
      let startIndex = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const sampleTimeMs = (samples[mid].cts * 1000) / samples[mid].timescale;

        if (sampleTimeMs < this.timeRangeStart) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      // Find the nearest keyframe at or before the desired start time
      startIndex = left;
      while (startIndex > 0 && !samples[startIndex].is_sync) {
        startIndex--;
      }

      // Trim samples array to start from the found keyframe
      samples = samples.slice(startIndex);
    }

    let sliceEnd = false;
    if (this.timeRangeEnd !== undefined) {
      // Binary search the sample that is closest to the end time and is a keyframe(upper bound).
      let left = 0;
      let right = samples.length - 1;
      let endIndex = samples.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const sampleTimeMs = (samples[mid].cts * 1000) / samples[mid].timescale;

        if (sampleTimeMs <= this.timeRangeEnd) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      // Find the next keyframe after the desired end time
      endIndex = right;
      while (endIndex < samples.length - 1 && !samples[endIndex + 1].is_sync) {
        endIndex++;
      }

      // Trim samples array to end at the found keyframe
      if (endIndex < samples.length - 1) {
        samples = samples.slice(0, endIndex + 1);
        sliceEnd = true;
      }
    }

    for (const sample of samples) {
      verboseLog(
        `Sample: sample.cts:${sample.cts}, sample.timescale:${sample.timescale}, sample.duration:${sample.duration}, sample.data.byteLength:${sample.data.byteLength}`
      );
      this.onChunk(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data,
        })
      );
    }
    this.samples_processed += samples.length;
    if (sliceEnd || this.samples_passed === this.nb_samples) {
      this.stopProcessingSamples = true;
      this.onChunkEnd(this.samples_processed);
    }
  }
}

// MP4 file sink implementation
class MP4FileSink {
  constructor(file, setStatus) {
    this.file = file;
    this.setStatus = setStatus;
    this.offset = 0;
  }

  write(chunk) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    buffer.fileStart = this.offset;
    this.offset += buffer.byteLength;

    this.setStatus("fetch", `${(this.offset / 1024 / 1024).toFixed(1)} MB`);
    this.file.appendBuffer(buffer);
  }

  close() {
    this.setStatus("fetch", "Complete");
    this.file.flush();
  }
}

// Event listener for file input
document.getElementById("videoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const processor = new VideoProcessor();

  try {
    await processor.processFile(file);
  } catch (error) {
    console.error("Error processing video:", error);
    processor.status.textContent = "Error processing video";
  }
});
