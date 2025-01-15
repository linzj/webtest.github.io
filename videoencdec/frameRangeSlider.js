export class FrameRangeSlider {
  constructor() {
    this.timeSelectionRadios = document.getElementsByName("timeSelection");
    this.sliderContainer = document.querySelector(".slider-container");
    this.timeInputs = document.querySelector(".time-inputs");
    this.thumbStart = document.getElementById("thumbStart");
    this.thumbEnd = document.getElementById("thumbEnd");
    this.sliderTrack = document.querySelector(".slider-track");
    this.sliderRange = document.querySelector(".slider-range");
    this.startFrameDisplay = document.getElementById("startFrame");
    this.endFrameDisplay = document.getElementById("endFrame");
    this.totalFramesDisplay = document.getElementById("totalFrames");

    this.isDragging = null;
    this.startPercent = 0;
    this.endPercent = 100;
    this.totalFrames = 0;

    this.initializeEventListeners();
  }

  initializeEventListeners() {
    this.timeSelectionRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const useSlider = e.target.value === "slider";
        this.sliderContainer.classList.toggle("visible", useSlider);
        this.timeInputs.classList.toggle("visible", !useSlider);
      });
    });

    this.sliderTrack.addEventListener(
      "mousedown",
      this.handleSliderMouseDown.bind(this)
    );
  }

  initialize(totalFrames) {
    this.totalFramesDisplay.textContent = totalFrames;
    this.totalFrames = totalFrames;
    this.updateSliderDisplay();
  }

  updateSliderDisplay() {
    this.thumbStart.style.left = `${this.startPercent}%`;
    this.thumbEnd.style.left = `${this.endPercent}%`;
    this.sliderRange.style.left = `${this.startPercent}%`;
    this.sliderRange.style.width = `${this.endPercent - this.startPercent}%`;

    const totalFrames = parseInt(this.totalFramesDisplay.textContent) || 0;
    const startFrame = Math.floor((this.startPercent / 100) * totalFrames);
    const endFrame = Math.floor((this.endPercent / 100) * totalFrames);

    this.startFrameDisplay.textContent = startFrame;
    this.endFrameDisplay.textContent = endFrame;
  }

  handleSliderMouseDown(e) {
    const thumb = e.target;
    if (thumb.classList.contains("slider-thumb")) {
      this.isDragging = thumb.id;
      document.addEventListener(
        "mousemove",
        this.handleSliderMouseMove.bind(this)
      );
      document.addEventListener("mouseup", this.handleSliderMouseUp.bind(this));
    }
  }

  handleSliderMouseMove(e) {
    if (!this.isDragging) return;

    const rect = this.sliderTrack.getBoundingClientRect();
    let percent = ((e.clientX - rect.left) / rect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));

    if (this.isDragging === "thumbStart") {
      this.startPercent = Math.min(percent, this.endPercent - 1);
    } else {
      this.endPercent = Math.max(percent, this.startPercent + 1);
    }

    this.updateSliderDisplay();
  }

  handleSliderMouseUp() {
    this.isDragging = null;
    document.removeEventListener(
      "mousemove",
      this.handleSliderMouseMove.bind(this)
    );
    document.removeEventListener(
      "mouseup",
      this.handleSliderMouseUp.bind(this)
    );
  }

  isSliderModeActive() {
    return this.sliderContainer.classList.contains("visible");
  }

  getFrameRange() {
    const totalFrames = this.totalFrames;
    return {
      startFrame: Math.floor((this.startPercent / 100) * totalFrames),
      endFrame: Math.floor((this.endPercent / 100) * totalFrames),
    };
  }
}
