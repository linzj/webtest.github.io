import { ChatClient } from "./ChatClient.js";
import { FileManager } from "./FileManager.js";
import { StorageManager } from "./StorageManager.js";
import { ChatInterface } from "./ChatInterface.js";
import { UIManager } from "./UIManager.js";
import { SessionManager } from "./SessionManager.js"; // Need SessionManager to get current session ID
import { ModelManager } from "./ModelManager.js"; // Need ModelManager to get current model

/**
 * Handles chat-related workflows, including sending messages and retries.
 */
export class ChatController {
  constructor(
    chatClient,
    fileManager,
    storageManager,
    chatInterface,
    uiManager,
    sessionManager,
    modelManager
  ) {
    if (
      !chatClient ||
      !fileManager ||
      !storageManager ||
      !chatInterface ||
      !uiManager ||
      !sessionManager ||
      !modelManager
    ) {
      console.error("ChatController: Missing required dependencies.");
      throw new Error("ChatController: Missing required dependencies.");
    }

    this.chatClient = chatClient;
    this.fileManager = fileManager;
    this.storageManager = storageManager;
    this.chatInterface = chatInterface;
    this.uiManager = uiManager;
    this.sessionManager = sessionManager;
    this.modelManager = modelManager;

    // Get references to specific UI elements needed for ChatController logic
    this.messageInput = this.uiManager.getElement("messageInput");
    this.useGoogleSearchCheckbox = this.uiManager.getElement(
      "useGoogleSearchCheckbox"
    );

    console.log("ChatController constructed.");
  }

  /**
   * Handles the process of sending a message from the user input.
   */
  async handleSendMessage() {
    const textInput = this.messageInput?.value.trim() ?? "";
    const filesToSend = this.fileManager.getAttachedFiles(); // Get copies

    if (!textInput && filesToSend.length === 0) {
      return; // Nothing to send
    }

    const currentSessionId = this.sessionManager.getCurrentSessionId();
    if (!currentSessionId) {
      this.chatInterface.addMessage("system", [
        { text: "Error: No active chat session selected." },
      ]);
      return;
    }
    if (!this.chatClient.isChatReady()) {
      this.chatInterface.addMessage("system", [
        {
          text: `Error: Chat not ready. Please check API key and model selection.`,
        },
      ]);
      return;
    }

    // --- Prepare User Message ---
    const userDisplayParts = [];
    const apiMessageParts = [];

    // Text part
    if (textInput) {
      userDisplayParts.push({ text: textInput });
      apiMessageParts.push({ text: textInput });
    }

    // File parts (convert for API, use dataUrl for display)
    let fileParts = [];
    if (filesToSend.length > 0) {
      try {
        fileParts = await this.fileManager.getFilesAsGenerativeParts();
        apiMessageParts.push(...fileParts);

        filesToSend.forEach((f) => {
          // Extract base64 data from dataUrl for display consistency
          const base64Data = f.dataUrl.split(",")[1];
          userDisplayParts.push({
            inlineData: { mimeType: f.type, data: base64Data },
          });
        });
      } catch (fileError) {
        console.error("Error processing files for sending:", fileError);
        this.chatInterface.addMessage("system", [
          { text: `Error processing files: ${fileError.message}` },
        ]);
        this.uiManager.updateStatus(
          `Error processing files: ${fileError.message}`,
          "error"
        );
        return; // Don't proceed if files failed
      }
    }

    // --- Clear Inputs ---
    this.uiManager.clearMessageInput();
    this.fileManager.clearAttachments();

    // --- Save and Display User Message ---
    let userMessageId = null;
    try {
      // Save the message first to get its ID
      userMessageId = await this.storageManager.saveMessage(
        { sender: "user", contentParts: apiMessageParts },
        currentSessionId
      );
      // Display user message *after* saving, passing the ID
      this.chatInterface.addMessage(
        "user",
        userDisplayParts,
        null,
        userMessageId
      );
    } catch (saveError) {
      console.error("Failed to save user message:", saveError);
      // Display user message even if save failed, but without an ID
      this.chatInterface.addMessage("user", userDisplayParts);
    }

    // --- Send to API ---
    const loadingIndicator = this.chatInterface.addLoadingIndicator();
    const result = await this.chatClient.sendMessage(apiMessageParts);
    if (loadingIndicator) {
      this.chatInterface.removeElement(loadingIndicator);
    }

    // --- Handle API Response ---
    if (result.response) {
      const response = result.response;
      let responseText = "";
      let responseParts = []; // Potentially handle function calls/other parts later

      // Attempt to get text content
      try {
        responseText = response.text(); // Call the function
        responseParts.push({ text: responseText });
      } catch (textError) {
        console.error("Error extracting text from API response:", textError);
        responseText = "[Error extracting text content]";
        responseParts.push({ text: responseText });
      }

      const usageInfo = response.usageMetadata; // Extract usage metadata

      // Save and Display model response
      let modelMessageId = null;
      try {
        modelMessageId = await this.storageManager.saveMessage(
          { sender: "model", contentParts: responseParts },
          currentSessionId
        );
        // Display model response *after* saving, passing the ID
        this.chatInterface.addMessage(
          "model",
          responseParts,
          usageInfo,
          modelMessageId
        );
      } catch (saveError) {
        console.error("Failed to save model response:", saveError);
        // Display model response even if save failed, but without an ID
        this.chatInterface.addMessage("model", responseParts, usageInfo);
      }
    } else if (result.error) {
      // Display error message from sending
      this.chatInterface.addMessage("model", [
        { text: `Error: ${result.error}` },
      ]);
      this.uiManager.updateStatus(
        `Error sending message: ${result.error}`,
        "error"
      );
    }
  }

  /**
   * Handles the "Retry" button click on a model message.
   * @param {number} modelMessageId - The ID of the model message to retry.
   */
  async handleRetry(modelMessageId) {
    console.log(
      `[ChatController] Handling retry for model message ID: ${modelMessageId}`
    );
    this.uiManager.updateStatus("Retrying...", "info");

    const currentSessionId = this.sessionManager.getCurrentSessionId();
    const currentModelName = this.modelManager.getCurrentModel();
    const useGoogleSearch = this.useGoogleSearchCheckbox?.checked ?? false;

    if (!currentSessionId || !currentModelName) {
      console.error(
        "[ChatController] Cannot retry: Missing session ID or model name."
      );
      this.uiManager.updateStatus(
        "Error: Cannot retry (missing session or model).",
        "error"
      );
      return;
    }

    let loadingIndicator = null;

    try {
      // --- Preparation Phase ---
      console.log(
        "[ChatController] Retry Step 1: Finding previous user message..."
      );
      const userMessageId = await this.storageManager.findPreviousUserMessage(
        currentSessionId,
        modelMessageId
      );
      if (!userMessageId) {
        throw new Error("Could not find the preceding user message to retry.");
      }
      console.log(
        `[ChatController] Retry Step 1: Found user message ID: ${userMessageId}`
      );

      console.log(
        "[ChatController] Retry Step 2: Getting user message content..."
      );
      const userMessageParts = await this.storageManager.getMessageContent(
        currentSessionId,
        userMessageId
      );
      if (!userMessageParts) {
        throw new Error(
          "Could not retrieve the content of the user message to retry."
        );
      }

      console.log(
        "[ChatController] Retry Step 3: Getting truncated history..."
      );
      const truncatedHistory = await this.storageManager.getHistoryUpToMessage(
        currentSessionId,
        userMessageId
      );

      // --- Execution Phase ---
      console.log("[ChatController] Retry Step 4: Adding loading indicator...");
      loadingIndicator = this.chatInterface.addLoadingIndicator();

      console.log("[ChatController] Retry Step 5: Sending request to API...");
      const result = await this.chatClient.sendMessageWithHistory(
        currentModelName,
        truncatedHistory,
        userMessageParts,
        useGoogleSearch
      );

      console.log(
        "[ChatController] Retry Step 6: Removing loading indicator..."
      );
      if (loadingIndicator) {
        this.chatInterface.removeElement(loadingIndicator);
        loadingIndicator = null;
      }

      console.log("[ChatController] Retry Step 7: Handling API response...");
      if (result.response) {
        const response = result.response;
        let responseText = "";
        let responseParts = [];
        try {
          responseText = response.text();
          responseParts.push({ text: responseText });
        } catch (textError) {
          console.error(
            "[ChatController] Error extracting text from retry response:",
            textError
          );
          responseParts.push({ text: "[Error extracting text content]" });
        }
        // const usageInfo = response.usageMetadata; // Not needed for this approach

        // --- Commit Phase (DB & UI) ---
        console.log(
          `[ChatController] Retry Step 8: Updating message ${modelMessageId} content in DB...`
        );
        await this.storageManager.updateMessageContent(
          modelMessageId,
          responseParts
        ); // Use update instead of delete/save
        console.log(
          `[ChatController] Retry Step 8: Updated message ${modelMessageId} content.`
        );

        // 9. Re-initialize the main chat client *before* reloading UI
        console.log(
          "[ChatController] Retry Step 9: Re-initializing chat client state..."
        );
        await this.chatClient.reInitializeChatSession(currentSessionId);
        console.log(
          "[ChatController] Retry Step 9: Chat client re-initialized"
        );

        // 10. Visually replace by reloading the entire history display
        console.log(
          "[ChatController] Retry Step 10: Reloading chat history display..."
        );
        // This requires App to expose a method or ChatController to have access to loadChatHistory
        // For now, I will call loadChatHistory directly, assuming ChatController has access or App provides it.
        // A better approach might be for App to listen for a 'retryComplete' event from ChatController and then call loadChatHistory.
        // For this refactoring step, I will assume ChatController can call loadChatHistory.
        // NOTE: This is a temporary assumption for the diff. The ideal solution involves eventing or passing the method.
        // I will add a placeholder comment here to indicate this needs further refinement.
        // TODO: Refactor loadChatHistory to be accessible or use an eventing mechanism.
        // For now, I will add a method placeholder in ChatController that App will call.
        // This method will be called by App after retry is complete to reload history.
        // Let's adjust the plan: ChatController will NOT call loadChatHistory directly.
        // It will signal completion, and App will handle the history reload.
        // So, remove the loadChatHistory call here.
        // Instead, the handleRetry method will return a boolean indicating success.
        // App will check this boolean and reload history if successful.

        // Reverting the direct loadChatHistory call and adding a success return
        console.log("[ChatController] Retry successful.");
        this.uiManager.updateStatus("Retry successful.", "success");
        return true; // Indicate success

        // --- End Commit Phase ---
      } else {
        // API call failed
        throw new Error(result.error || "Unknown error during retry API call.");
      }
    } catch (error) {
      // --- Error Handling ---
      console.error("[ChatController] Error during retry process:", error);
      this.uiManager.updateStatus(`Retry failed: ${error.message}`, "error");

      // Ensure loading indicator is removed if it exists
      if (loadingIndicator) {
        this.chatInterface.removeElement(loadingIndicator);
      }

      // Do NOT reload history here. App will handle it based on the return value.
      return false; // Indicate failure
    }
  }

  // Placeholder for App to call after retry to reload history
  // App will need to call this.chatController.handleRetry(...) and then if it returns true, call this.loadChatHistory(...)
  // This method is not needed in ChatController itself.
  // async reloadHistoryAfterRetry(sessionId) {
  //   await this.loadChatHistory(sessionId);
  // }
}
