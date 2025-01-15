import { TimeStampProvider } from "./timeStampProvider.js";
import { TimeRangeProvider } from "./timeRangeProvider.js";
import { VideoProcessor } from "./videoProcessor.js";
import { FrameRangeSlider } from "./frameRangeSlider.js";

// Initialize the slider
const frameRangeSlider = new FrameRangeSlider();

const timeRangeProvider = new TimeRangeProvider({
  startTimeInput: document.getElementById("startTime"),
  endTimeInput: document.getElementById("endTime"),
});

const timestampProvider = new TimeStampProvider({
  timestampStartInput: document.getElementById("timestampStart"),
  enableTimestampCheckbox: document.getElementById("enableTimestamp"),
  timestampInputs: document.getElementById("timestampInputs"),
});

const processor = new VideoProcessor({
  canvas: document.getElementById("processorCanvas"),
  statusElement: document.getElementById("status"),
  frameCountDisplay: document.getElementById("frameCount"),
  timestampProvider: timestampProvider,
  frameRangeSlider: frameRangeSlider,
});

// Event listener for file input
document.getElementById("videoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) {
    document.getElementById("processButton").disabled = true;
    return;
  }

  // Enable the process button when a file is selected
  document.getElementById("processButton").disabled = false;

  // Initialize slider when video is loaded
  if (file) {
    // You'll need to get the total frame count from your video processing logic
    // This might need to be moved to after the video metadata is loaded
    frameRangeSlider.initialize(0); // Initially set to 0, update when frame count is known
    processor.onInitialized = (nb_samples) => {
      frameRangeSlider.initialize(nb_samples);
    };
    processor.initFile(file);
  }
});

// Add process button click handler
document.getElementById("processButton").addEventListener("click", async () => {
  const file = document.getElementById("videoInput").files[0];
  if (!file) return;

  try {
    document.getElementById("processButton").disabled = true;
    if (frameRangeSlider.isSliderModeActive()) {
      const { startFrame, endFrame } = frameRangeSlider.getFrameRange();
      await processor.processFileByFrame(startFrame, endFrame);
    } else {
      const { startMs, endMs } = timeRangeProvider.getTimeRange();
      await processor.processFileByTime(startMs, endMs);
    }
  } catch (error) {
    console.error("Error processing video:", error);
    processor.status.textContent = "Error processing video";
  } finally {
    document.getElementById("processButton").disabled = false;
  }
});
