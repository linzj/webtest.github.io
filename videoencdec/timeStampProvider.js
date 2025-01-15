export class TimeStampProvider {
  constructor({
    timestampStartInput,
    enableTimestampCheckbox,
    timestampInputs,
  }) {
    this.timestampStartInput = timestampStartInput;
    this.enableTimestampCheckbox = enableTimestampCheckbox;
    this.timestampInputs = timestampInputs;
    this.userStartTime = null;

    // Set up timestamp checkbox handler
    this.enableTimestampCheckbox.addEventListener("change", () => {
      this.timestampInputs.classList.toggle(
        "visible",
        this.enableTimestampCheckbox.checked
      );
    });
  }

  isEnabled() {
    return this.enableTimestampCheckbox.checked;
  }

  validateTimestampInput() {
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (
      this.timestampStartInput.value &&
      !regex.test(this.timestampStartInput.value)
    ) {
      alert("Invalid timestamp format. Please use YYYY-MM-DD HH:MM:SS");
      this.timestampStartInput.value = "";
      return false;
    }
    return true;
  }

  getUserStartTime() {
    if (!this.timestampStartInput.value) {
      return null;
    }

    const startTime = new Date(this.timestampStartInput.value);
    if (isNaN(startTime.getTime())) {
      alert("Invalid date. Please check your input.");
      return null;
    }
    return startTime;
  }

  hasValidStartTime() {
    if (!this.timestampStartInput.value) {
      return true; // No timestamp is considered valid
    }
    return this.getUserStartTime() !== null;
  }
}
