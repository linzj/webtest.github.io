/**
 * Manages interactions with the DOM and updates UI elements.
 */
export class UIManager {
  constructor() {
    // Get references to all necessary DOM elements
    this.elements = {
      apiKeyInput: document.getElementById("api-key"),
      saveKeyButton: document.getElementById("save-key"),
      keyStatus: document.getElementById("key-status"),
      chatHistory: document.getElementById("chat-history"),
      messageInput: document.getElementById("message-input"),
      sendButton: document.getElementById("send-button"),
      attachButton: document.getElementById("attach-button"),
      fileInput: document.getElementById("file-input"),
      previewArea: document.getElementById("preview-area"),
      sessionSelector: document.getElementById("session-selector"),
      newSessionButton: document.getElementById("new-session-button"),
      deleteSessionButton: document.getElementById("delete-session-button"),
      modelSelector: document.getElementById("model-selector"),
      newModelNameInput: document.getElementById("new-model-name"),
      addModelButton: document.getElementById("add-model-button"),
      useGoogleSearchCheckbox: document.getElementById("use-google-search"),
      chatContainer: document.getElementById("chat-container"),
      downloadPngButton: document.getElementById("download-png-button"), // Added
    };

    // Validate that all elements were found
    for (const key in this.elements) {
      if (!this.elements[key]) {
        console.warn(
          `UI element not found: ${key} (ID: ${key
            .replace(/([A-Z])/g, "-$1")
            .toLowerCase()})`
        );
        // You might want to throw an error here if an element is critical
      }
    }
  }

  /**
   * Gets a specific DOM element reference.
   * @param {string} key - The key corresponding to the element ID (e.g., 'apiKeyInput').
   * @returns {HTMLElement | null} The DOM element or null if not found.
   */
  getElement(key) {
    return this.elements[key] || null;
  }

  /**
   * Adds an event listener to the document.
   * @param {string} eventType - The type of event to listen for (e.g., 'DOMContentLoaded', 'click').
   * @param {Function} listener - The function to call when the event occurs.
   */
  addDocumentEventListener(eventType, listener) {
    document.addEventListener(eventType, listener);
  }

  /**
   * Updates the status message displayed to the user.
   * @param {string} text - The message text.
   * @param {'info' | 'success' | 'warning' | 'error'} type - The type of message (affects styling).
   */
  updateStatus(text, type = "info") {
    const statusElement = this.getElement("keyStatus");
    if (!statusElement) return;

    statusElement.textContent = text;
    statusElement.className = `status-${type}`; // Use classes for styling

    // Reset color mapping (or use CSS classes directly)
    switch (type) {
      case "success":
        statusElement.style.color = "green";
        break;
      case "warning":
        statusElement.style.color = "orange";
        break;
      case "error":
        statusElement.style.color = "red";
        break;
      case "info":
      default:
        statusElement.style.color = "black"; // Or inherit
        break;
    }
  }

  /**
   * Creates a div element for a chat message.
   * @param {number | null} messageId - The database ID of the message.
   * @param {'user' | 'model' | 'system'} sender - The sender type.
   * @returns {HTMLDivElement} The created message div.
   */
  createMessageDiv(messageId, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.dataset.messageId = messageId;
    messageDiv.classList.add("message", `${sender}-message`);
    return messageDiv;
  }

  /**
   * Creates a div element for message content.
   * @returns {HTMLDivElement} The created content div.
   */
  createContentDiv() {
    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    return contentDiv;
  }

  /**
   * Creates a temporary div element.
   * @returns {HTMLDivElement} The created temporary div.
   */
  createTempDiv() {
    return document.createElement("div");
  }

  /**
   * Creates an image element.
   * @param {string} src - The image source URL.
   * @param {string} alt - The alt text for the image.
   * @returns {HTMLImageElement} The created image element.
   */
  createImageElement(src, alt) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    return img;
  }

  /**
   * Creates a video element.
   * @param {string} src - The video source URL.
   * @returns {HTMLVideoElement} The created video element.
   */
  createVideoElement(src) {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.muted = true;
    return video;
  }

  /**
   * Creates a span element for a file reference.
   * @param {string} text - The text content for the span.
   * @returns {HTMLSpanElement} The created span element.
   */
  createFileReferenceSpan(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  /**
   * Creates a copy button element.
   * @param {string} text - The text content for the button.
   * @param {string} title - The title attribute for the button.
   * @param {string} className - The class name for the button.
   * @returns {HTMLButtonElement} The created button element.
   */
  createCopyButton(text, title, className) {
    const button = document.createElement("button");
    button.textContent = text;
    button.title = title;
    button.classList.add(className);
    return button;
  }

  /**
   * Creates a retry button element.
   * @param {number} messageId - The message ID to associate with the button.
   * @returns {HTMLButtonElement} The created retry button.
   */
  createRetryButton(messageId) {
    const retryButton = document.createElement("button");
    retryButton.textContent = "Retry";
    retryButton.classList.add("retry-button");
    retryButton.title = "Retry generating this response";
    retryButton.dataset.messageId = messageId;
    return retryButton;
  }

  /**
   * Creates a div element for token usage information.
   * @param {object} usageMetadata - The usage metadata object.
   * @returns {HTMLDivElement} The created token info div.
   */
  createTokenInfoDiv(usageMetadata) {
    const tokenInfoDiv = document.createElement("div");
    tokenInfoDiv.classList.add("token-usage-info");
    const promptTokens = usageMetadata.promptTokenCount ?? "N/A";
    const responseTokens = usageMetadata.candidatesTokenCount ?? "N/A";
    const totalTokens = usageMetadata.totalTokenCount ?? "N/A";
    tokenInfoDiv.textContent = `Tokens: ${totalTokens} (Prompt: ${promptTokens}, Response: ${responseTokens})`;
    tokenInfoDiv.title = `Prompt Tokens: ${promptTokens}\nResponse Tokens: ${responseTokens}`;
    return tokenInfoDiv;
  }

  /**
   * Shows or hides the main chat interface container.
   * @param {boolean} show - True to show, false to hide.
   */
  showChatContainer(show) {
    const container = this.getElement("chatContainer");
    if (container) {
      container.style.display = show ? "flex" : "none";
    }
  }

  /**
   * Clears the content of the chat history display area.
   */
  clearChatHistory() {
    const chatHistory = this.getElement("chatHistory");
    if (chatHistory) {
      chatHistory.innerHTML = "";
    }
  }

  /**
   * Clears the message input field.
   */
  clearMessageInput() {
    const messageInput = this.getElement("messageInput");
    if (messageInput) {
      messageInput.value = "";
    }
  }

  /**
   * Scrolls the chat history area to the bottom.
   */
  scrollToChatBottom() {
    const chatHistory = this.getElement("chatHistory");
    if (chatHistory) {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  }

  /**
   * Adds an option to a select dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @param {string} text - The visible text of the option.
   * @param {string | number} value - The value of the option.
   * @param {boolean} [prepend=false] - Whether to add the option at the beginning.
   */
  addDropdownOption(selector, text, value, prepend = false) {
    if (!selector) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (prepend) {
      selector.insertBefore(option, selector.firstChild);
    } else {
      selector.appendChild(option);
    }
  }

  /**
   * Clears all options from a select dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   */
  clearDropdown(selector) {
    if (selector) {
      selector.innerHTML = "";
    }
  }

  /**
   * Removes a specific option from a select dropdown by its value.
   * @param {HTMLSelectElement} selector - The select element.
   * @param {string | number} value - The value of the option to remove.
   */
  removeDropdownOption(selector, value) {
    if (!selector) return;
    const optionToRemove = selector.querySelector(`option[value="${value}"]`);
    if (optionToRemove) {
      selector.removeChild(optionToRemove);
    }
  }

  /**
   * Sets the selected value of a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @param {string | number} value - The value to select.
   */
  selectDropdownValue(selector, value) {
    if (selector) {
      selector.value = value;
    }
  }

  /**
   * Gets the selected value from a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @returns {string | null} The selected value or null.
   */
  getSelectedDropdownValue(selector) {
    return selector ? selector.value : null;
  }

  /**
   * Gets the text content of the selected option in a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @returns {string | null} The text content or null.
   */
  getSelectedDropdownText(selector) {
    if (!selector || selector.selectedIndex < 0) return null;
    return selector.options[selector.selectedIndex].textContent;
  }

  /**
   * Gets the number of options in a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @returns {number} The number of options.
   */
  getDropdownLength(selector) {
    return selector ? selector.options.length : 0;
  }

  /**
   * Gets the value of the first option in a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @returns {string | null} The value or null if empty.
   */
  getFirstDropdownValue(selector) {
    return selector && selector.options.length > 0
      ? selector.options[0].value
      : null;
  }
  /**
   * Checks if a specific value exists as an option in a dropdown.
   * @param {HTMLSelectElement} selector - The select element.
   * @param {string | number} value - The value to check for.
   * @returns {boolean} True if the option exists, false otherwise.
   */
  dropdownOptionExists(selector, value) {
    if (!selector) return false;
    return !!selector.querySelector(`option[value="${value}"]`);
  }
}
