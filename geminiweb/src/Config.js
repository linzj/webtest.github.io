// Constants for the application

// IndexedDB
export const DB_NAME = "geminiChatDB";
export const DB_VERSION = 3; // Increment if schema changes
export const MSG_STORE_NAME = "chatMessages";
export const SESSION_STORE_NAME = "sessions";
export const MODEL_STORE_NAME = "customModels";

// localStorage Keys
export const API_KEY_STORAGE_KEY = "geminiApiKey";
export const LAST_SESSION_KEY = "lastActiveSessionId";
export const LAST_MODEL_KEY = "lastSelectedModel";

// Default Models (Consider making this configurable or fetching dynamically if possible)
export const DEFAULT_MODELS = [
    "gemini-2.5-pro-exp-03-25",
    "gemini-2.5-pro-preview-03-25",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
    "gemini-pro",
];

// DOM Element IDs (Optional, but can help centralize)
// export const DOM_IDS = {
//     apiKeyInput: "api-key",
//     saveKeyButton: "save-key",
//     keyStatus: "key-status",
//     chatHistory: "chat-history",
//     messageInput: "message-input",
//     sendButton: "send-button",
//     attachButton: "attach-button",
//     fileInput: "file-input",
//     previewArea: "preview-area",
//     sessionSelector: "session-selector",
//     newSessionButton: "new-session-button",
//     deleteSessionButton: "delete-session-button",
//     modelSelector: "model-selector",
//     newModelNameInput: "new-model-name",
//     addModelButton: "add-model-button",
//     useGoogleSearchCheckbox: "use-google-search",
//     chatContainer: "chat-container",
// };
