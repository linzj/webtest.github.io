/**
 * Handles rendering messages to the chat history DOM element,
 * including formatting (Markdown, KaTeX), code blocks, and copy buttons.
 */
export class ChatInterface {
  /**
   * @param {UIManager} uiManager - Instance for DOM interactions.
   */
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.chatHistoryElement = this.uiManager.getElement("chatHistory");
    this.onRetryCallback = null; // Callback for retry button clicks

    if (!this.chatHistoryElement) {
      console.error("Chat history element not found!");
      // Potentially throw an error or disable functionality
    }
  }

  /**
   * Adds a message to the chat history display.
   * @param {'user' | 'model' | 'system'} sender - The sender type.
   * @param {Array<object>} contentParts - Array of message parts (text, inlineData).
   * @param {object | null} [usageMetadata=null] - Optional token usage info for model messages.
   * @param {number | null} [messageId=null] - Optional database ID of the message.
   */
  addMessage(sender, contentParts, usageMetadata = null, messageId = null) {
    if (!this.chatHistoryElement) return;

    const messageDiv = this.uiManager.createMessageDiv(messageId, sender);

    const contentDiv = this.uiManager.createContentDiv();

    let hasTextContent = false;
    let fullTextMessage = ""; // Accumulate text for the main copy button

    contentParts.forEach((part) => {
      if (part.text) {
        hasTextContent = true;
        fullTextMessage += part.text + "\n"; // Add newline for separation if multiple text parts

        // 1. Parse Markdown -> HTML
        // Use { breaks: true } to interpret single newlines as <br>
        const markdownHtml = window.marked
          ? marked.parse(part.text, { breaks: true })
          : this._escapeHtml(part.text);

        // 2. Append HTML to a temporary container
        const tempDiv = this.uiManager.createTempDiv();
        tempDiv.innerHTML = markdownHtml;

        // 3. Render KaTeX within the temporary container
        try {
          if (window.renderMathInElement) {
            renderMathInElement(tempDiv, {
              delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true },
              ],
              throwOnError: false,
            });
          } else if (part.text.includes("$") || part.text.includes("\\")) {
            // Only warn if potential KaTeX is present but library isn't loaded
            console.warn(
              "KaTeX auto-render function (renderMathInElement) not found. Math expressions may not render."
            );
          }
        } catch (katexError) {
          console.error("KaTeX rendering error:", katexError);
          // Append error message or original text? For now, keep original.
        }

        // 4. Add Copy Buttons to Code Blocks within the temporary container
        tempDiv.querySelectorAll("pre").forEach((preElement) => {
          this._addCodeCopyButton(preElement);
        });

        // 5. Append processed content from tempDiv to the actual contentDiv
        while (tempDiv.firstChild) {
          contentDiv.appendChild(tempDiv.firstChild);
        }
      } else if (part.inlineData) {
        // Handle images and videos (similar to original script)
        const mimeType = part.inlineData.mimeType;
        const data = part.inlineData.data; // Assuming this is base64 data
        let mediaElement;

        if (mimeType.startsWith("image/")) {
          mediaElement = this.uiManager.createImageElement(
            `data:${mimeType};base64,${data}`,
            "User image"
          );
        } else if (mimeType.startsWith("video/")) {
          mediaElement = this.uiManager.createVideoElement(
            `data:${mimeType};base64,${data}`
          );
        }

        if (mediaElement) {
          contentDiv.appendChild(mediaElement);
        }
      } else if (part.fileData) {
        // Basic display for fileData (less common for direct display)
        const textNode = this.uiManager.createFileReferenceSpan(
          `[File Reference: ${part.fileData.mimeType}]`
        );
        contentDiv.appendChild(textNode);
      }
    }); // End of contentParts.forEach

    messageDiv.appendChild(contentDiv);

    // Add a general "Copy All" button if there was any text content
    if (hasTextContent) {
      this._addGeneralCopyButton(messageDiv, fullTextMessage.trim());
    }

    // Add Token Usage Info for model messages
    if (sender === "model" && usageMetadata) {
      this._addTokenUsageInfo(messageDiv, usageMetadata);
      // REMOVED: this._addRetryButton(messageDiv, messageId);
    }

    // Add Retry button for model messages that have an ID
    if (sender === "model" && messageId) {
      this._addRetryButton(messageDiv, messageId);
    }

    this.chatHistoryElement.appendChild(messageDiv);
    this.uiManager.scrollToChatBottom();
  }

  /**
   * Adds a temporary loading indicator message.
   * @returns {HTMLElement} The loading indicator element (to be removed later).
   */
  addLoadingIndicator() {
    if (!this.chatHistoryElement) return null;
    const loadingMessageDiv = this.uiManager.createMessageDiv(null, "model"); // Use createMessageDiv
    loadingMessageDiv.classList.add("loading-indicator"); // Add specific class
    loadingMessageDiv.textContent = "Generating response...";
    this.chatHistoryElement.appendChild(loadingMessageDiv);
    this.uiManager.scrollToChatBottom();
    return loadingMessageDiv;
  }

  /**
   * Removes a previously added element (like a loading indicator).
   * @param {HTMLElement} elementToRemove - The element to remove.
   */
  removeElement(elementToRemove) {
    if (
      this.chatHistoryElement &&
      elementToRemove &&
      this.chatHistoryElement.contains(elementToRemove)
    ) {
      this.chatHistoryElement.removeChild(elementToRemove);
    }
  }

  /**
   * Clears the entire chat history display.
   */
  clearHistoryDisplay() {
    this.uiManager.clearChatHistory();
  }

  /**
   * Adds a copy button to a <pre> code block element.
   * @param {HTMLPreElement} preElement - The <pre> element.
   * @private
   */
  _addCodeCopyButton(preElement) {
    // Avoid adding duplicate buttons
    if (preElement.querySelector(".copy-code-button")) return;

    const codeCopyButton = this.uiManager.createCopyButton(
      "Copy Code",
      "Copy code block",
      "copy-code-button"
    );

    // Get text content, preferring the inner <code> if it exists
    const codeElement = preElement.querySelector("code");
    const codeToCopy = codeElement
      ? codeElement.textContent
      : preElement.textContent;

    if (!codeToCopy) return; // Don't add button if no code

    codeCopyButton.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard
        .writeText(codeToCopy)
        .then(() => {
          codeCopyButton.textContent = "Copied!";
          setTimeout(() => {
            codeCopyButton.textContent = "Copy Code";
          }, 1500);
        })
        .catch((err) => {
          console.error("Failed to copy code: ", err);
          codeCopyButton.textContent = "Error";
          setTimeout(() => {
            codeCopyButton.textContent = "Copy Code";
          }, 1500);
        });
    });
    // Prepend button inside the <pre> tag for better positioning context
    preElement.style.position = "relative"; // Ensure pre is a positioning context
    preElement.insertBefore(codeCopyButton, preElement.firstChild);
  }

  /**
   * Adds a general "Copy All" button to a message div.
   * @param {HTMLDivElement} messageDiv - The main message container div.
   * @param {string} textToCopy - The full text content of the message.
   * @private
   */
  _addGeneralCopyButton(messageDiv, textToCopy) {
    const copyButton = this.uiManager.createCopyButton(
      "Copy All",
      "Copy entire message text",
      "copy-button"
    );

    copyButton.addEventListener("click", () => {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          copyButton.textContent = "Copied All!";
          setTimeout(() => {
            copyButton.textContent = "Copy All";
          }, 1500);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          copyButton.textContent = "Error";
          setTimeout(() => {
            copyButton.textContent = "Copy All";
          }, 1500);
        });
    });
    // Append this general button to the main message div
    messageDiv.appendChild(copyButton);
  }

  /**
   * Adds token usage information below a model message.
   * @param {HTMLDivElement} messageDiv - The message div to append to.
   * @param {object} usageMetadata - The usage metadata object.
   * @private
   */
  _addTokenUsageInfo(messageDiv, usageMetadata) {
    if (!usageMetadata || usageMetadata.totalTokenCount === undefined) return;

    const tokenInfoDiv = this.uiManager.createTokenInfoDiv(usageMetadata);

    messageDiv.appendChild(tokenInfoDiv);
  }

  /**
   * Basic HTML escaping function.
   * @param {string} text - Text to escape.
   * @returns {string} Escaped text.
   * @private
   */
  _escapeHtml(text) {
    const div = this.uiManager.createTempDiv(); // Use createTempDiv for a generic div
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Adds a "Retry" button to a model message div.
   * @param {HTMLDivElement} messageDiv - The main message container div.
   * @param {number | null} messageId - The database ID of this model message.
   * @private
   */
  _addRetryButton(messageDiv, messageId) {
    if (!messageId || !this.onRetryCallback) return; // Only add if ID and callback exist

    const retryButton = this.uiManager.createRetryButton(messageId);

    retryButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const idToRetry = parseInt(event.target.dataset.messageId, 10);
      if (!isNaN(idToRetry)) {
        console.log(`Retry clicked for message ID: ${idToRetry}`);
        this.onRetryCallback(idToRetry); // Call the registered callback
      } else {
        console.error("Could not get message ID for retry.");
      }
    });

    // Append the retry button next to other buttons (e.g., Copy All)
    messageDiv.appendChild(retryButton);
  }

  /**
   * Registers the callback function to be invoked when a retry button is clicked.
   * @param {Function} callback - The function to call, receives messageId as argument.
   */
  setOnRetryCallback(callback) {
    if (typeof callback === "function") {
      this.onRetryCallback = callback;
      console.log("Retry callback registered in ChatInterface.");
    } else {
      console.error("Invalid callback provided for setOnRetryCallback.");
    }
  }

  /**
   * Adds a message to the chat history display *before* a specified reference node.
   * If referenceNode is null, it appends to the end.
   * @param {'user' | 'model' | 'system'} sender - The sender type.
   * @param {Array<object>} contentParts - Array of message parts (text, inlineData).
   * @param {object | null} [usageMetadata=null] - Optional token usage info for model messages.
   * @param {number | null} [messageId=null] - Optional database ID of the message.
   * @param {Node | null} [referenceNode=null] - The node before which to insert the new message.
   * @returns {HTMLElement | null} The newly created message element, or null if creation failed.
   */
  addMessageBefore(
    sender,
    contentParts,
    usageMetadata = null,
    messageId = null,
    referenceNode = null
  ) {
    if (!this.chatHistoryElement) return null;

    // --- Create the message element (similar to addMessage) ---
    const messageDiv = this.uiManager.createMessageDiv(messageId, sender);

    const contentDiv = this.uiManager.createContentDiv();

    let hasTextContent = false;
    let fullTextMessage = "";

    contentParts.forEach((part) => {
      if (part.text) {
        hasTextContent = true;
        fullTextMessage += part.text + "\n";
        const markdownHtml = window.marked
          ? marked.parse(part.text, { breaks: true })
          : this._escapeHtml(part.text);
        const tempDiv = this.uiManager.createTempDiv();
        tempDiv.innerHTML = markdownHtml;
        try {
          if (window.renderMathInElement) {
            renderMathInElement(tempDiv, {
              /* ... KaTeX options ... */
            });
          }
        } catch (katexError) {
          console.error("KaTeX rendering error:", katexError);
        }
        tempDiv
          .querySelectorAll("pre")
          .forEach((pre) => this._addCodeCopyButton(pre));
        while (tempDiv.firstChild) {
          contentDiv.appendChild(tempDiv.firstChild);
        }
      } else if (part.inlineData) {
        const mimeType = part.inlineData.mimeType;
        const data = part.inlineData.data;
        let mediaElement;
        if (mimeType.startsWith("image/")) {
          mediaElement = this.uiManager.createImageElement(
            `data:${mimeType};base64,${data}`,
            "User image"
          );
        } else if (mimeType.startsWith("video/")) {
          mediaElement = this.uiManager.createVideoElement(
            `data:${mimeType};base64,${data}`
          );
        }
        if (mediaElement) {
          contentDiv.appendChild(mediaElement);
        }
      } else if (part.fileData) {
        const textNode = this.uiManager.createFileReferenceSpan(
          `[File Reference: ${part.fileData.mimeType}]`
        );
        contentDiv.appendChild(textNode);
      }
    });

    messageDiv.appendChild(contentDiv);

    if (hasTextContent) {
      this._addGeneralCopyButton(messageDiv, fullTextMessage.trim());
    }
    if (sender === "model" && usageMetadata) {
      this._addTokenUsageInfo(messageDiv, usageMetadata);
    }
    if (sender === "model" && messageId) {
      this._addRetryButton(messageDiv, messageId);
    }
    // --- End of message element creation ---

    // --- Insert the message ---
    this.chatHistoryElement.insertBefore(messageDiv, referenceNode); // Use insertBefore
    this.uiManager.scrollToChatBottom(); // Still scroll to bottom after insertion

    return messageDiv; // Return the created element
  }
}
