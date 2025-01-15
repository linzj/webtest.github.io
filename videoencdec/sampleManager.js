export class SampleManager {
  constructor() {
    this.samples = [];
    this.currentIndex = 0;
    this.finalized = false;
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

  finalizeTimeRange(timeRangeStart, timeRangeEnd) {
    let startIndex = 0;
    let endIndex = this.samples.length;

    if (timeRangeStart !== undefined) {
      startIndex = this.binarySearchTime(timeRangeStart);
      while (startIndex > 0 && !this.samples[startIndex].is_sync) {
        startIndex--;
      }
    }

    if (timeRangeEnd !== undefined) {
      endIndex = this.binarySearchTime(timeRangeEnd);
      while (
        endIndex < this.samples.length - 1 &&
        !this.samples[endIndex + 1].is_sync
      ) {
        endIndex++;
      }
      endIndex++;
    }

    this.samples = this.samples.slice(startIndex, endIndex);
    this.currentIndex = 0;
    this.finalized = true;
    return this.samples.length;
  }

  finalizeSampleInIndex(startIndex, endIndex) {
    while (startIndex > 0 && !this.samples[startIndex].is_sync) {
      startIndex--;
    }
    this.samples = this.samples.slice(startIndex, endIndex + 1);
    this.currentIndex = 0;
    this.finalized = true;
    return this.samples.length;
  }

  binarySearchTime(targetTime) {
    let left = 0;
    let right = this.samples.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sampleTimeMs =
        (this.samples[mid].cts * 1000) / this.samples[mid].timescale;

      if (sampleTimeMs < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return left;
  }

  requestChunks(count, onChunk, onExhausted) {
    let processed = 0;

    while (processed < count && this.currentIndex < this.samples.length) {
      const sample = this.samples[this.currentIndex];
      onChunk(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data,
        })
      );
      this.currentIndex++;
      processed++;
    }

    if (this.currentIndex >= this.samples.length) {
      onExhausted();
    }

    return processed;
  }

  reset() {
    this.currentIndex = 0;
    this.samples = [];
    this.currentIndex = 0;
    this.finalized = false;
  }
}
