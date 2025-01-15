export class TimeStampRenderer {
  constructor(startTime) {
    this.startTime = startTime;
  }

  draw(ctx, frameTimeMs) {
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
    const fontSize = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.03;
    ctx.fillStyle = "white";
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = "right";
    ctx.fillText(timestamp, ctx.canvas.width - 10, ctx.canvas.height - 10);
  }
}
