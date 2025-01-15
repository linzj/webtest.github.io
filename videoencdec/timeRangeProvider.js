export class TimeRangeProvider {
  constructor({ startTimeInput, endTimeInput }) {
    this.startTimeInput = startTimeInput;
    this.endTimeInput = endTimeInput;
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

  getTimeRange() {
    this.validateTimeInput(this.startTimeInput);
    this.validateTimeInput(this.endTimeInput);

    const startMs = this.convertTimeToMs(this.startTimeInput.value);
    const endMs = this.convertTimeToMs(this.endTimeInput.value);

    let timeRangeStart = startMs > 0 ? startMs : undefined;
    let timeRangeEnd = endMs > 0 ? endMs : undefined;

    if (
      timeRangeEnd !== undefined &&
      timeRangeStart !== undefined &&
      timeRangeEnd <= timeRangeStart
    ) {
      timeRangeEnd = undefined;
      this.endTimeInput.value = "00:00";
    }

    return { startMs: timeRangeStart, endMs: timeRangeEnd };
  }
}
