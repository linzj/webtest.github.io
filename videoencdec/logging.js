export const kEncodeQueueSize = 33;
export const kDecodeQueueSize = kEncodeQueueSize;
export const kEnableVerboseLogging = false;
export const kEnablePerformanceLogging = true;

export function verboseLog() {
  if (kEnableVerboseLogging) {
    console.log.apply(console, arguments);
  }
}

export function performanceLog(message) {
  if (kEnablePerformanceLogging) {
    alert(message);
  }
}
