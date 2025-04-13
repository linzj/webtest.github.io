/**
 * Handles exporting content, like chat history, to image formats.
 */
export class ImageExporter {
  /**
   * Captures a given HTML element and triggers a PNG download.
   * @param {HTMLElement} elementToCapture - The DOM element to capture.
   * @param {string | number | null} sessionId - The current session ID for the filename.
   * @param {function(string, 'info' | 'success' | 'warning' | 'error'): void} updateStatusCallback - Callback to update UI status.
   */
  static async exportElementToPng(
    elementToCapture,
    sessionId,
    updateStatusCallback
  ) {
    if (!elementToCapture) {
      console.error("Element to capture not provided for PNG export.");
      if (updateStatusCallback)
        updateStatusCallback(
          "Error: Could not find content to capture.",
          "error"
        );
      return;
    }

    if (updateStatusCallback) updateStatusCallback("Generating PNG...", "info");

    // Store original styles
    const originalOverflow = elementToCapture.style.overflow;
    const originalHeight = elementToCapture.style.height;

    try {
      // Temporarily modify styles to capture full content
      elementToCapture.style.overflow = "visible";
      elementToCapture.style.height = "auto";

      // Ensure html2canvas is loaded (it should be from index.html)
      if (typeof html2canvas === "undefined") {
        console.error("html2canvas library is not loaded.");
        if (updateStatusCallback)
          updateStatusCallback(
            "Error: Image capture library not loaded.",
            "error"
          );
        return;
      }

      const canvas = await html2canvas(elementToCapture, {
        useCORS: true,
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const sessionIdForFilename = sessionId || "current";
      link.download = `gemini-chat-session-${sessionIdForFilename}-${timestamp}.png`;
      document.body.appendChild(link); // Required for Firefox
      link.click();
      document.body.removeChild(link);

      if (updateStatusCallback)
        updateStatusCallback("PNG download initiated.", "success");
    } catch (error) {
      console.error("Error capturing element as PNG:", error);
      if (updateStatusCallback)
        updateStatusCallback(`Error generating PNG: ${error.message}`, "error");
    } finally {
      // Restore original styles
      elementToCapture.style.overflow = originalOverflow;
      elementToCapture.style.height = originalHeight;
      if (updateStatusCallback)
        updateStatusCallback("Cleanup complete.", "info"); // Optional status update
    }
  }
}
