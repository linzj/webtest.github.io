// Import the SDK class
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";

/**
 * Manages interactions with the Google Generative AI SDK.
 * Initializes the client, starts chat sessions, and sends messages.
 */
export class ChatClient {
    /**
     * @param {ApiKeyManager} apiKeyManager - To get the API key.
     * @param {StorageManager} storageManager - To get session history.
     * @param {UIManager} uiManager - To check UI state like search checkbox.
     */
    constructor(apiKeyManager, storageManager, uiManager) {
        this.apiKeyManager = apiKeyManager;
        this.storageManager = storageManager;
        this.uiManager = uiManager;

        this.genAI = null; // GoogleGenerativeAI instance
        this.chat = null; // Active ChatSession instance
        this.currentModelName = null; // Track the model used for the current chat session

        this.useGoogleSearchCheckbox = this.uiManager.getElement('useGoogleSearchCheckbox');
    }

    /**
     * Initializes the main GoogleGenerativeAI client instance if an API key is available.
     * @returns {boolean} True if initialization was successful, false otherwise.
     */
    initializeGenAI() {
        const apiKey = this.apiKeyManager.getKey();
        if (!apiKey) {
            console.error("Cannot initialize GenAI client: API Key not set.");
            this.genAI = null;
            this.chat = null;
            return false;
        }

        try {
            // Only create a new instance if it doesn't exist or key changed (handled externally)
            if (!this.genAI) {
                 this.genAI = new GoogleGenerativeAI(apiKey);
                 console.log("GoogleGenerativeAI client initialized.");
            }
            return true;
        } catch (error) {
            console.error("Error initializing GoogleGenerativeAI:", error);
            this.genAI = null;
            this.chat = null;
            // Consider notifying the UI Manager here
            this.uiManager.updateStatus(`Error initializing GenAI: ${error.message}. Check key/network.`, "error");
            return false;
        }
    }

    /**
     * Starts or restarts a chat session with the specified model and session history.
     * @param {string} modelName - The generative model name to use.
     * @param {number} sessionId - The ID of the session to load history for.
     * @returns {Promise<boolean>} True if the chat session was initialized successfully, false otherwise.
     */
    async initializeChatSession(modelName, sessionId) {
        if (!this.genAI) {
            console.error("GenAI client not initialized. Cannot start chat session.");
            this.chat = null;
            return false;
        }
        if (!modelName) {
             console.error("Model name required to initialize chat session.");
             this.chat = null;
             return false;
        }
         if (!sessionId) {
             console.error("Session ID required to initialize chat session.");
             this.chat = null;
             return false;
        }


        this.currentModelName = modelName; // Store the model name for this session
        console.log(`Initializing chat session for model: ${modelName}, session: ${sessionId}`);

        try {
            // 1. Get Formatted History from Storage
            let history = [];
            try {
                 history = await this.storageManager.getFormattedHistoryForSession(sessionId);
                 console.log(`Loaded ${history.length} history entries for session ${sessionId}.`);
            } catch (histError) {
                console.error(`Error loading history for session ${sessionId}:`, histError);
                 this.uiManager.updateStatus(`Error loading history for session ${sessionId}.`, "warning");
                 // Proceed with empty history
            }


            // 2. Get Model Instance
            const model = this.genAI.getGenerativeModel({ model: modelName });

            // 3. Prepare StartChatParams (History and Tools)
            const startChatParams = {
                history: history,
                tools: [],
            };

            // Check if Google Search tool should be enabled
            if (this.useGoogleSearchCheckbox?.checked) {
                const googleSearchTool = {
                    googleSearch: {}, // Empty object enables the tool
                };
                startChatParams.tools.push(googleSearchTool);
                console.log("Google Search Retrieval tool enabled for this chat session.");
            } else {
                 console.log("Google Search Retrieval tool disabled for this chat session.");
            }

            // 4. Start Chat
            this.chat = model.startChat(startChatParams);

            console.log("Chat session initialized successfully.");
            return true;

        } catch (error) {
            console.error(`Error initializing chat session for model ${modelName}:`, error);
            this.uiManager.updateStatus(`Error initializing model ${modelName}. Check model name/permissions.`, "error");
            this.chat = null;
            return false;
        }
    }

     /**
     * Checks if the chat session is currently initialized and ready.
     * @returns {boolean}
     */
     isChatReady() {
        return !!this.chat;
    }

    /**
     * Sends a message (with text and/or files) to the current chat session.
     * @param {Array<object>} messageParts - An array of parts (text or inlineData).
     * @returns {Promise<{response: object, error?: string}>} An object containing the API response or an error message.
     */
    async sendMessage(messageParts) {
        if (!this.isChatReady()) {
            console.error("Chat session is not ready. Cannot send message.");
            return { error: "Chat session not initialized." };
        }
        if (!messageParts || messageParts.length === 0) {
             console.warn("Attempted to send an empty message.");
             return { error: "Cannot send empty message." };
        }

        console.log(`Sending ${messageParts.length} parts to model ${this.currentModelName}...`);

        try {
            const result = await this.chat.sendMessage(messageParts);
            console.log("Message sent successfully.");
            // Note: result.response.text() is a function that needs to be called
            // We return the whole response object so the caller can extract text, usage, etc.
            return { response: result.response };
        } catch (error) {
            console.error("Error sending message via Gemini API:", error);
            return { error: error.message || "Unknown error sending message." };
        }
    }

     /**
      * Re-initializes the chat session, typically after settings like the model or Google Search change.
      * Uses the currently stored model name and the provided session ID.
      * @param {number} sessionId - The current session ID to load history for.
      * @returns {Promise<boolean>} True if re-initialization was successful.
      */
     async reInitializeChatSession(sessionId) {
         if (!this.currentModelName) {
             console.error("Cannot re-initialize chat: No current model name set.");
             return false;
         }
         if (!sessionId) {
             console.error("Cannot re-initialize chat: No session ID provided.");
             return false;
         }
         console.log(`Re-initializing chat session for model ${this.currentModelName}, session ${sessionId}...`);
         return this.initializeChatSession(this.currentModelName, sessionId);
     }
}
