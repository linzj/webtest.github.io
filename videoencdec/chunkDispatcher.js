export class ChunkDispatcher {
  constructor() {
    this.chunkArrays = [];
    this.currentChunkIndex = 0;
  }

  addChunks(newChunks) {
    if (!Array.isArray(newChunks)) {
      throw new Error("Input must be an array");
    }
    this.chunkArrays.push(newChunks);
  }

  addChunk(chunk) {
    // Throws if chunk is not a EncodedVideoChunk
    if (!(chunk instanceof EncodedVideoChunk)) {
      throw new Error("Chunk must be an instance of EncodedVideoChunk");
    }
    // If this.currentArrays is empty, create a new array
    if (this.chunkArrays.length === 0) {
      this.chunkArrays.push([]);
    }
    // Add the chunk to the last array
    this.chunkArrays[this.chunkArrays.length - 1].push(chunk);
  }
  requestChunks(count, iterateCallback, exhaustedCallback) {
    if (typeof count !== "number" || count <= 0) {
      throw new Error("Count must be a positive number");
    }
    if (
      typeof iterateCallback !== "function" ||
      typeof exhaustedCallback !== "function"
    ) {
      throw new Error("Callbacks must be functions");
    }

    let processed = 0;

    while (processed < count && this.chunkArrays.length > 0) {
      const currentArray = this.chunkArrays[0];

      while (
        processed < count &&
        this.currentChunkIndex < currentArray.length
      ) {
        iterateCallback(currentArray[this.currentChunkIndex]);
        this.currentChunkIndex++;
        processed++;
      }

      if (this.currentChunkIndex >= currentArray.length) {
        this.chunkArrays.shift(); // Remove the exhausted array
        this.currentChunkIndex = 0;
      }
    }

    if (processed < count && this.chunkArrays.length === 0) {
      exhaustedCallback();
    }

    return processed;
  }

  reset() {
    this.currentChunkIndex = 0;
  }

  clear() {
    this.chunkArrays = [];
    this.currentChunkIndex = 0;
  }

  get remaining() {
    if (this.chunkArrays.length === 0) {
      return 0;
    }

    let count = this.chunkArrays[0].length - this.currentChunkIndex;

    // Add lengths of remaining arrays
    for (let i = 1; i < this.chunkArrays.length; i++) {
      count += this.chunkArrays[i].length;
    }

    return count;
  }
}
