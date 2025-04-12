import { API_KEY_STORAGE_KEY } from './Config.js';

/**
 * Manages the storage and retrieval of the Gemini API key using localStorage.
 */
export class ApiKeyManager {
    constructor() {
        this.apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || null;
        console.log("ApiKeyManager initialized. Key loaded:", !!this.apiKey);
    }

    /**
     * Gets the currently stored API key.
     * @returns {string | null} The API key, or null if not set.
     */
    getKey() {
        return this.apiKey;
    }

    /**
     * Saves a new API key to localStorage and updates the internal state.
     * @param {string} newKey - The new API key to save.
     * @returns {boolean} True if the key was saved (non-empty), false otherwise.
     */
    saveKey(newKey) {
        const trimmedKey = newKey ? newKey.trim() : null;
        if (trimmedKey) {
            this.apiKey = trimmedKey;
            localStorage.setItem(API_KEY_STORAGE_KEY, this.apiKey);
            console.log("API Key saved.");
            return true;
        } else {
            console.warn("Attempted to save an empty API key.");
            // Optionally clear the stored key if an empty string is provided
            // this.clearKey();
            return false;
        }
    }

    /**
     * Clears the API key from localStorage and internal state.
     */
    clearKey() {
        this.apiKey = null;
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        console.log("API Key cleared.");
    }

    /**
     * Checks if an API key is currently set.
     * @returns {boolean} True if an API key is set, false otherwise.
     */
    isKeySet() {
        return !!this.apiKey;
    }
}
