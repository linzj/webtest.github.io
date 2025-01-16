export class SampleManager {
  static sampleTimeMs(sample) {
    return (sample.cts * 1000) / sample.timescale;
  }

  static encodedVideoChunkFromSample(sample) {
    return new EncodedVideoChunk({
      type: sample.is_sync ? "key" : "delta",
      timestamp: (1e6 * sample.cts) / sample.timescale,
      duration: (1e6 * sample.duration) / sample.timescale,
      data: sample.data,
    });
  }

  constructor() {
    this.samples = [];
    this.currentIndex = 0;
    this.finalized = false;
    this.state = "receiving";
    this.readyPromise = new Promise((resolve) => {
      this.resolveReadyPromise = resolve;
    });
  }

  sampleCount() {
    return this.samples.length;
  }

  addSamples(newSamples) {
    if (this.finalized) {
      throw new Error("Cannot add samples to finalized SampleManager");
    }
    this.samples.push(...newSamples);
  }

  async waitForReady() {
    if (this.state === "finalized") {
      return;
    }
    await this.readyPromise;
  }

  finalize() {
    this.resolveReadyPromise();
    this.resolveReadyPromise = null;
    this.state = "finalized";
  }

  finalizeTimeRange(timeRangeStart, timeRangeEnd) {
    let startIndex = 0;
    let endIndex = this.samples.length;
    let preciousStartIndex = 0;
    let preciousEndIndex = this.samples.length - 1;

    if (timeRangeStart !== undefined) {
      startIndex = this.lowerBound(timeRangeStart);
      preciousStartIndex = startIndex;
      while (startIndex > 0 && !this.samples[startIndex].is_sync) {
        startIndex--;
      }
    }

    if (timeRangeEnd !== undefined) {
      endIndex = this.upperBound(timeRangeEnd);
      preciousEndIndex = endIndex;
      while (
        endIndex < this.samples.length - 1 &&
        !this.samples[endIndex + 1].is_sync
      ) {
        endIndex++;
      }
      endIndex++;
    }

    if (preciousEndIndex >= this.samples.length) {
      preciousEndIndex = this.samples.length - 1;
    }

    if (preciousStartIndex >= this.samples.length) {
      throw new Error("Invalid sample range");
    }

    const outputTimeRangeStart = SampleManager.sampleTimeMs(
      this.samples[preciousStartIndex]
    );
    const outputTimeRangeEnd = SampleManager.sampleTimeMs(
      this.samples[preciousEndIndex]
    );

    this.samples = this.samples.slice(startIndex, endIndex);
    this.currentIndex = 0;
    this.finalized = true;
    return [this.samples.length, outputTimeRangeStart, outputTimeRangeEnd];
  }

  finalizeSampleInIndex(startIndex, endIndex) {
    let preciousStartIndex = startIndex;
    while (startIndex > 0 && !this.samples[startIndex].is_sync) {
      startIndex--;
    }
    if (endIndex >= this.samples.length) {
      endIndex = this.samples.length - 1;
    }
    while (endIndex > 0 && !this.samples[endIndex].cts) {
      endIndex--;
    }

    if (startIndex >= endIndex) {
      throw new Error("Invalid sample range");
    }

    const outputTimeRangeStart = SampleManager.sampleTimeMs(
      this.samples[preciousStartIndex]
    );
    const outputTimeRangeEnd = SampleManager.sampleTimeMs(
      this.samples[endIndex]
    );
    this.samples = this.samples.slice(startIndex, endIndex + 1);
    this.currentIndex = 0;
    this.finalized = true;
    return [this.samples.length, outputTimeRangeStart, outputTimeRangeEnd];
  }

  lowerBound(targetTime) {
    let left = 0;
    let right = this.samples.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sampleTimeMs = SampleManager.sampleTimeMs(this.samples[mid]);

      if (sampleTimeMs < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return left;
  }

  upperBound(targetTime) {
    let left = 0;
    let right = this.samples.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sampleTimeMs = SampleManager.sampleTimeMs(this.samples[mid]);

      if (sampleTimeMs <= targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return right;
  }

  requestChunks(count, onChunk, onExhausted) {
    let processed = 0;

    while (processed < count && this.currentIndex < this.samples.length) {
      const sample = this.samples[this.currentIndex];
      onChunk(SampleManager.encodedVideoChunkFromSample(sample));
      this.currentIndex++;
      processed++;
    }

    if (this.currentIndex >= this.samples.length) {
      onExhausted();
    }

    return processed;
  }

  findSamplesAtPercentage(percentage) {
    if (this.finalized) {
      throw new Error("Cannot find sample in finalized SampleManager");
    }
    const sampleIndex = Math.floor(
      (percentage / 100) * (this.samples.length - 1)
    );

    let keyFrameIndex = sampleIndex;
    while (keyFrameIndex > 0 && !this.samples[keyFrameIndex].is_sync) {
      keyFrameIndex--;
    }
    return this.samples.slice(keyFrameIndex, sampleIndex + 1);
  }

  reset() {
    this.currentIndex = 0;
    this.samples = [];
    this.currentIndex = 0;
    this.finalized = false;
  }
}
