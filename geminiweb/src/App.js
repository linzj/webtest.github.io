import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm"; // Keep this for potential direct use or type checking if needed

import { StorageManager } from "./StorageManager.js";
import { UIManager } from "./UIManager.js";
import { ApiKeyManager } from "./ApiKeyManager.js";
import { ModelManager } from "./ModelManager.js";
import { SessionManager } from "./SessionManager.js";
import { FileManager } from "./FileManager.js";
import { ChatInterface } from "./ChatInterface.js";
import { ChatClient } from "./ChatClient.js";
import { ImageExporter } from "./ImageExporter.js"; // Added

/**
 * Main application class. Initializes and coordinates all managers and UI interactions.
 */
class App {
  constructor() {
    // Instantiate managers
    this.uiManager = new UIManager();
    this.storageManager = new StorageManager();
    this.apiKeyManager = new ApiKeyManager();
    this.modelManager = new ModelManager(this.storageManager, this.uiManager);
    this.sessionManager = new SessionManager(
      this.storageManager,
      this.uiManager
    );
    this.fileManager = new FileManager(this.uiManager);
    this.chatInterface = new ChatInterface(this.uiManager);
    this.chatClient = new ChatClient(
      this.apiKeyManager,
      this.storageManager,
      this.uiManager
    );

    // Get references to specific UI elements needed for App logic
    this.saveKeyButton = this.uiManager.getElement("saveKeyButton");
    this.apiKeyInput = this.uiManager.getElement("apiKeyInput");
    this.sendButton = this.uiManager.getElement("sendButton");
    this.messageInput = this.uiManager.getElement("messageInput");
    this.useGoogleSearchCheckbox = this.uiManager.getElement(
      "useGoogleSearchCheckbox"
    );
    this.downloadPngButton = this.uiManager.getElement("downloadPngButton"); // Added

    console.log("App constructed.");
  }

  /**
   * Initializes the entire application.
   */
  async initialize() {
    console.log("App initialization started...");
    this.uiManager.updateStatus("Initializing...", "info");

    // 1. Initialize Database Connection
    try {
      await this.storageManager.openDb();
      this.uiManager.updateStatus("Database ready.", "info");
    } catch (dbError) {
      console.error("Fatal: Failed to open IndexedDB.", dbError);
      this.uiManager.updateStatus(
        "Error: Database initialization failed. Chat history and custom models unavailable.",
        "error"
      );
      // Allow limited functionality? Or stop? For now, continue but warn.
    }

    // 2. Check API Key and Initialize UI State
    if (this.apiKeyManager.isKeySet()) {
      this.uiManager.getElement("apiKeyInput").value =
        this.apiKeyManager.getKey();
      this.uiManager.showChatContainer(true);
      this.uiManager.updateStatus("API Key loaded.", "success");

      // 3. Initialize GenAI Client (requires key)
      if (!this.chatClient.initializeGenAI()) {
        // Error status already set by chatClient
        this.uiManager.showChatContainer(false); // Hide chat if client fails
        this._setupEventListeners(); // Still setup key listener if client fails
        return; // Stop further initialization if GenAI client fails
      }
      this.uiManager.updateStatus(
        "API Key loaded. GenAI Client ready.",
        "success"
      );

      // 4. Initialize Models (requires DB potentially)
      let initialModel = null;
      try {
        initialModel = await this.modelManager.initialize();
        this.uiManager.updateStatus(
          "API Key loaded. Models loaded.",
          "success"
        );
      } catch (modelError) {
        console.error("Error initializing models:", modelError);
        this.uiManager.updateStatus(
          "API Key loaded. (Error loading models)",
          "warning"
        );
      }

      // 5. Initialize Sessions (requires DB potentially)
      let initialSessionId = null;
      try {
        initialSessionId = await this.sessionManager.initialize();
        this.uiManager.updateStatus(
          "API Key loaded. Models loaded. Sessions loaded.",
          "success"
        );
      } catch (sessionError) {
        console.error("Error initializing sessions:", sessionError);
        this.uiManager.updateStatus(
          "API Key loaded. Models loaded. (Error loading sessions)",
          "warning"
        );
      }

      // 6. Setup Event Listeners (before loading history that needs them)
      this._setupEventListeners();

      // 7. Load Initial Chat History Display (requires session)
      if (initialSessionId) {
        await this.loadChatHistory(initialSessionId);
      } else {
        this.chatInterface.clearHistoryDisplay(); // Ensure it's clear if no session
      }

      // 8. Initialize Chat Session (requires model and session)
      if (initialModel && initialSessionId) {
        const chatReady = await this.chatClient.initializeChatSession(
          initialModel,
          initialSessionId
        );
        if (chatReady) {
          this.uiManager.updateStatus(
            `Chat ready (${initialModel}).`,
            "success"
          );
        } else {
          // Status already updated by chatClient
        }
      } else {
        this.uiManager.updateStatus(
          "Chat not ready (missing model or session).",
          "warning"
        );
      }
    } else {
      // API Key not set
      this.uiManager.updateStatus("API Key not set.", "warning");
      this.uiManager.showChatContainer(false);
      // Setup listeners even if key isn't set, so the save button works
      this._setupEventListeners();
    }

    // 9. Final log
    console.log("App initialization complete.");
  }

  /**
   * Loads and displays the chat history for a given session ID.
   * @param {number} sessionId - The session ID to load history for.
   */
  async loadChatHistory(sessionId) {
    console.log(`[App] loadChatHistory called for session ${sessionId}`);
    this.chatInterface.clearHistoryDisplay(); // Clear existing display first
    if (!sessionId) {
      console.log("[App] No session ID provided to loadChatHistory.");
      return;
    }

    try {
      const messages = await this.storageManager.getRawMessagesForSession(
        sessionId
      );
      console.log(
        `[App] Displaying ${messages.length} messages for session ${sessionId}.`
      );
      // Log the order just before displaying to verify sorting
      console.log(
        "[App] Messages order before display:",
        messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          timestamp: m.timestamp,
        }))
      );
      messages.forEach((msg) => {
        // Pass message ID when loading from DB
        this.chatInterface.addMessage(
          msg.sender,
          msg.contentParts,
          null,
          msg.id
        );
      });
      console.log(
        `[App] Finished adding messages to display for session ${sessionId}.`
      );
    } catch (error) {
      console.error(
        `[App] Error loading or displaying history for session ${sessionId}:`,
        error
      );
      this.chatInterface.addMessage("system", [
        { text: `Error loading chat history for session ${sessionId}.` },
      ]);
      this.uiManager.updateStatus(
        `Error loading history for session ${sessionId}.`,
        "error"
      );
    }
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
   * Handles changes to the API key input.
   */
  handleApiKeySave() {
    const newKey = this.apiKeyInput?.value ?? "";
    const oldKey = this.apiKeyManager.getKey();

    if (newKey.trim() === oldKey) {
      console.log("API Key unchanged.");
      return; // No change
    }

    if (this.apiKeyManager.saveKey(newKey)) {
      console.log("New API Key saved. Re-initializing application state...");
      this.uiManager.updateStatus("API Key saved. Re-initializing...", "info");
      // Re-initialize parts that depend on the key
      this.uiManager.showChatContainer(true); // Assume valid key for now
      if (this.chatClient.initializeGenAI()) {
        this.uiManager.updateStatus(
          "API Key valid. GenAI Client ready.",
          "success"
        );
        // Need to re-initialize model, session, and chat session
        this.reinitializeAppState();
      } else {
        // Error status handled by initializeGenAI
        this.uiManager.showChatContainer(false);
      }
    } else {
      this.uiManager.updateStatus("Please enter a valid API Key.", "warning");
      this.apiKeyManager.clearKey(); // Clear if invalid key was entered
      this.uiManager.showChatContainer(false);
      this.chatClient.genAI = null; // Ensure client is reset
      this.chatClient.chat = null;
    }
  }

  /**
   * Re-initializes model, session, history display, and chat session.
   * Called after significant changes like API key update.
   */
  async reinitializeAppState() {
    console.log("Re-initializing app state (model, session, chat)...");
    const currentModel = this.modelManager.getCurrentModel();
    const currentSession = this.sessionManager.getCurrentSessionId();

    // Re-init Models (might not be necessary unless key affects model access)
    // await this.modelManager.initialize(); // Optional: reload models

    // Re-init Sessions (might not be necessary unless key affects session access)
    // await this.sessionManager.initialize(); // Optional: reload sessions

    // Setup listeners *before* loading history
    this._setupEventListeners();

    // Reload history display for current session
    if (currentSession) {
      await this.loadChatHistory(currentSession);
    } else {
      this.chatInterface.clearHistoryDisplay();
    }

    // Re-init chat session with current model and session
    if (currentModel && currentSession) {
      const chatReady = await this.chatClient.initializeChatSession(
        currentModel,
        currentSession
      );
      if (chatReady) {
        this.uiManager.updateStatus(`Chat ready (${currentModel}).`, "success");
      }
    } else {
      this.uiManager.updateStatus(
        "Chat not ready (missing model or session).",
        "warning"
      );
    }
  }

  /**
   * Handles changes triggered by the ModelManager (model selection).
   * @param {string} newModelName - The newly selected model name.
   */
  async handleModelChange(newModelName) {
    console.log(`App received model change: ${newModelName}`);
    this.uiManager.updateStatus(
      `Switching to model ${newModelName}...`,
      "info"
    );
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (newModelName && sessionId) {
      const chatReady = await this.chatClient.initializeChatSession(
        newModelName,
        sessionId
      );
      if (chatReady) {
        this.uiManager.updateStatus(`Chat ready (${newModelName}).`, "success");
      }
    } else {
      this.uiManager.updateStatus(
        "Chat not ready (missing model or session).",
        "warning"
      );
    }
  }

  /**
   * Handles changes triggered by the SessionManager (session switch/creation/deletion).
   * @param {number | null} newSessionId - The new active session ID, or null.
   * @param {boolean} isNewSession - True if the session was just created.
   */
  async handleSessionChange(newSessionId, isNewSession) {
    console.log(
      `App received session change: ${newSessionId}${
        isNewSession ? " (new)" : ""
      }`
    );
    this.uiManager.updateStatus(`Loading session ${newSessionId}...`, "info");

    // 1. Load and display history for the new session
    await this.loadChatHistory(newSessionId);

    // 2. Re-initialize the chat client for the new session's history
    const modelName = this.modelManager.getCurrentModel();
    if (modelName && newSessionId) {
      const chatReady = await this.chatClient.initializeChatSession(
        modelName,
        newSessionId
      );
      if (chatReady) {
        this.uiManager.updateStatus(`Chat ready (${modelName}).`, "success");
      }
    } else {
      this.chatInterface.clearHistoryDisplay(); // Clear display if no valid session/model
      this.uiManager.updateStatus(
        "Chat not ready (missing model or session).",
        "warning"
      );
    }
  }

  /**
   * Handles changes to the Google Search checkbox.
   */
  async handleSearchToggle() {
    console.log(
      "Google Search checkbox toggled. Re-initializing chat object..."
    );
    const modelName = this.modelManager.getCurrentModel();
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (modelName && sessionId) {
      // Re-initialize the chat session with the new tool setting
      const chatReady = await this.chatClient.reInitializeChatSession(
        sessionId
      );
      if (chatReady) {
        const searchStatus = this.useGoogleSearchCheckbox?.checked
          ? "ON"
          : "OFF";
        this.uiManager.updateStatus(
          `Chat ready (${modelName}). Search: ${searchStatus}`,
          "success"
        );
      } else {
        this.uiManager.updateStatus(
          `Failed to re-initialize chat for search toggle.`,
          "error"
        );
      }
    } else {
      console.warn(
        "Cannot re-initialize chat for search toggle: Missing model or session."
      );
    }
  }

  /**
   * Handles the "Retry" button click on a model message.
   * @param {number} modelMessageId - The ID of the model message to retry.
   */
  async handleRetry(modelMessageId) {
    console.log(`[App] Handling retry for model message ID: ${modelMessageId}`);
    this.uiManager.updateStatus("Retrying...", "info");

    const currentSessionId = this.sessionManager.getCurrentSessionId();
    const currentModelName = this.modelManager.getCurrentModel();
    const useGoogleSearch = this.useGoogleSearchCheckbox?.checked ?? false;

    if (!currentSessionId || !currentModelName) {
      console.error("[App] Cannot retry: Missing session ID or model name.");
      this.uiManager.updateStatus(
        "Error: Cannot retry (missing session or model).",
        "error"
      );
      return;
    }

    let loadingIndicator = null;

    try {
      // --- Preparation Phase ---
      console.log("[App] Retry Step 1: Finding previous user message...");
      const userMessageId = await this.storageManager.findPreviousUserMessage(
        currentSessionId,
        modelMessageId
      );
      if (!userMessageId) {
        throw new Error("Could not find the preceding user message to retry.");
      }
      console.log(
        `[App] Retry Step 1: Found user message ID: ${userMessageId}`
      );

      console.log("[App] Retry Step 2: Getting user message content...");
      const userMessageParts = await this.storageManager.getMessageContent(
        currentSessionId,
        userMessageId
      );
      if (!userMessageParts) {
        throw new Error(
          "Could not retrieve the content of the user message to retry."
        );
      }

      console.log("[App] Retry Step 3: Getting truncated history...");
      const truncatedHistory = await this.storageManager.getHistoryUpToMessage(
        currentSessionId,
        userMessageId
      );

      // --- Execution Phase ---
      console.log("[App] Retry Step 4: Adding loading indicator...");
      loadingIndicator = this.chatInterface.addLoadingIndicator();

      console.log("[App] Retry Step 5: Sending request to API...");
      const result = await this.chatClient.sendMessageWithHistory(
        currentModelName,
        truncatedHistory,
        userMessageParts,
        useGoogleSearch
      );

      console.log("[App] Retry Step 6: Removing loading indicator...");
      if (loadingIndicator) {
        this.chatInterface.removeElement(loadingIndicator);
        loadingIndicator = null;
      }

      console.log("[App] Retry Step 7: Handling API response...");
      if (result.response) {
        const response = result.response;
        let responseText = "";
        let responseParts = [];
        try {
          responseText = response.text();
          responseParts.push({ text: responseText });
        } catch (textError) {
          console.error(
            "[App] Error extracting text from retry response:",
            textError
          );
          responseParts.push({ text: "[Error extracting text content]" });
        }
        // const usageInfo = response.usageMetadata; // Not needed for this approach

        // --- Commit Phase (DB & UI) ---
        console.log(
          `[App] Retry Step 8: Updating message ${modelMessageId} content in DB...`
        );
        await this.storageManager.updateMessageContent(
          modelMessageId,
          responseParts
        ); // Use update instead of delete/save
        console.log(
          `[App] Retry Step 8: Updated message ${modelMessageId} content.`
        );

        // 9. Re-initialize the main chat client *before* reloading UI
        console.log("[App] Retry Step 9: Re-initializing chat client state...");
        await this.chatClient.reInitializeChatSession(currentSessionId);
        console.log("[App] Retry Step 9: Chat client re-initialized");

        // 10. Visually replace by reloading the entire history display
        console.log("[App] Retry Step 10: Reloading chat history display...");
        await this.loadChatHistory(currentSessionId); // Reload UI from DB
        console.log("[App] Retry Step 10: Chat history display reloaded");
        // --- End Commit Phase ---

        this.uiManager.updateStatus("Retry successful.", "success");
      } else {
        // API call failed
        throw new Error(result.error || "Unknown error during retry API call.");
      }
    } catch (error) {
      // --- Error Handling ---
      console.error("[App] Error during retry process:", error);
      this.uiManager.updateStatus(`Retry failed: ${error.message}`, "error");

      // Ensure loading indicator is removed if it exists
      if (loadingIndicator) {
        this.chatInterface.removeElement(loadingIndicator);
      }

      // Reload history to ensure UI consistency after any failure
      console.warn(
        "[App] Retry failed, reloading history to ensure UI consistency."
      );
      await this.loadChatHistory(currentSessionId);
    }
  }

  /**
   * Sets up the main application event listeners.
   * @private
   */
  _setupEventListeners() {
    // API Key Saving
    if (this.saveKeyButton) {
      this.saveKeyButton.addEventListener("click", () =>
        this.handleApiKeySave()
      );
    }
    // Allow saving key by pressing Enter in the input field
    if (this.apiKeyInput) {
      this.apiKeyInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
          this.handleApiKeySave();
        }
      });
    }

    // Sending Messages
    if (this.sendButton) {
      this.sendButton.addEventListener("click", () => this.handleSendMessage());
    }
    if (this.messageInput) {
      this.messageInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Google Search Toggle
    if (this.useGoogleSearchCheckbox) {
      this.useGoogleSearchCheckbox.addEventListener("change", () =>
        this.handleSearchToggle()
      );
    }

    // Manager Callbacks
    this.modelManager.setOnModelChange((newModel) =>
      this.handleModelChange(newModel)
    );
    this.sessionManager.setOnSessionChange((newSessionId, isNew) =>
      this.handleSessionChange(newSessionId, isNew)
    );

    // Retry Callback
    this.chatInterface.setOnRetryCallback((messageId) =>
      this.handleRetry(messageId)
    );

    // Download PNG Button
    if (this.downloadPngButton) {
      this.downloadPngButton.addEventListener("click", () => {
        const chatHistoryElement = this.uiManager.getElement("chatHistory");
        const currentSessionId = this.sessionManager.getCurrentSessionId();
        // Pass the element, session ID, and the UI manager's updateStatus method as a callback
        ImageExporter.exportElementToPng(
          chatHistoryElement,
          currentSessionId,
          this.uiManager.updateStatus.bind(this.uiManager) // Ensure 'this' context for updateStatus
        );
      });
    }

    console.log("App event listeners configured.");
  }
}

// --- Global Initialization ---
// Ensure the DOM is ready before creating the App instance
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed.");
  const app = new App();
  app.initialize().catch((error) => {
    console.error("Unhandled error during app initialization:", error);
    // Display a critical error message to the user if necessary
    const statusElement = document.getElementById("key-status");
    if (statusElement) {
      statusElement.textContent =
        "Critical Error: App failed to initialize. Check console.";
      statusElement.style.color = "red";
    }
  });
  // Make app instance globally accessible for debugging (optional)
  // window.geminiApp = app;
});
