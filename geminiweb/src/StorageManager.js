import {
  DB_NAME,
  DB_VERSION,
  MSG_STORE_NAME,
  SESSION_STORE_NAME,
  MODEL_STORE_NAME,
} from "./Config.js";

/**
 * Manages all interactions with the IndexedDB database.
 */
export class StorageManager {
  constructor() {
    this.db = null; // Database connection variable
  }

  /**
   * Opens and initializes the IndexedDB database.
   * @returns {Promise<IDBPDatabase>} A promise that resolves with the database connection.
   */
  async openDb() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject("IndexedDB error: " + event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("Database opened successfully.");
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const dbInstance = event.target.result;
        const transaction = event.target.transaction;
        console.log(
          `Upgrading database from version ${event.oldVersion} to ${event.newVersion}...`
        );

        // Create sessions store
        if (!dbInstance.objectStoreNames.contains(SESSION_STORE_NAME)) {
          const sessionStore = dbInstance.createObjectStore(
            SESSION_STORE_NAME,
            {
              keyPath: "id",
              autoIncrement: true,
            }
          );
          sessionStore.createIndex("createdAt", "createdAt", { unique: false });
          console.log("Object store created:", SESSION_STORE_NAME);
        }

        // Create/Update messages store
        let msgStore;
        if (!dbInstance.objectStoreNames.contains(MSG_STORE_NAME)) {
          msgStore = dbInstance.createObjectStore(MSG_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          console.log("Object store created:", MSG_STORE_NAME);
        } else {
          msgStore = transaction.objectStore(MSG_STORE_NAME);
        }

        if (!msgStore.indexNames.contains("timestamp")) {
          msgStore.createIndex("timestamp", "timestamp", { unique: false });
          console.log("Index 'timestamp' created on", MSG_STORE_NAME);
        }
        if (!msgStore.indexNames.contains("sessionId")) {
          msgStore.createIndex("sessionId", "sessionId", { unique: false });
          console.log("Index 'sessionId' created on", MSG_STORE_NAME);
        }

        // Create models store
        if (!dbInstance.objectStoreNames.contains(MODEL_STORE_NAME)) {
          const modelStore = dbInstance.createObjectStore(MODEL_STORE_NAME, {
            keyPath: "name",
          });
          console.log("Object store created:", MODEL_STORE_NAME);
        }

        console.log("Database upgrade complete.");
      };
    });
  }

  /**
   * Retrieves all custom models stored in the database.
   * @returns {Promise<Array<{name: string}>>} A promise resolving to an array of model objects.
   */
  async getAllModels() {
    if (!this.db) await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MODEL_STORE_NAME], "readonly");
      const store = transaction.objectStore(MODEL_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };
      request.onerror = (event) => {
        console.error("Error getting all models from DB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Saves a custom model name to the database.
   * @param {string} modelName - The name of the model to save.
   * @returns {Promise<void>}
   */
  async saveModel(modelName) {
    if (!this.db) await this.openDb();
    if (!modelName) return Promise.reject("Model name cannot be empty.");
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MODEL_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MODEL_STORE_NAME);
      const request = store.put({ name: modelName }); // Use put to add or update

      request.onsuccess = () => {
        console.log("Model saved to DB:", modelName);
        resolve();
      };
      request.onerror = (event) => {
        console.error("Error saving model to DB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Retrieves all chat sessions from the database, sorted by creation date descending.
   * @returns {Promise<Array<object>>} A promise resolving to an array of session objects.
   */
  async getAllSessions() {
    if (!this.db) await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([SESSION_STORE_NAME], "readonly");
      const store = transaction.objectStore(SESSION_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        const sessions = event.target.result || [];
        sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
        resolve(sessions);
      };
      request.onerror = (event) => {
        console.error("Error loading sessions:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Creates a new chat session in the database.
   * @param {string} [name] - Optional name for the session.
   * @returns {Promise<number>} A promise resolving to the ID of the newly created session.
   */
  async createNewSession(name) {
    if (!this.db) await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        [SESSION_STORE_NAME],
        "readwrite"
      );
      const store = transaction.objectStore(SESSION_STORE_NAME);
      const newSession = {
        name: name || `Chat ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
      };
      const request = store.add(newSession);

      request.onsuccess = (event) => {
        const newSessionId = event.target.result;
        console.log("New session created with ID:", newSessionId);
        resolve(newSessionId);
      };
      request.onerror = (event) => {
        console.error("Error creating new session:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Deletes a session and all its associated messages from the database.
   * @param {number} sessionIdToDelete - The ID of the session to delete.
   * @returns {Promise<void>}
   */
  async deleteSession(sessionIdToDelete) {
    if (!this.db) await this.openDb();
    if (!sessionIdToDelete) return Promise.reject("Invalid session ID.");

    console.log("Attempting to delete session:", sessionIdToDelete);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        [SESSION_STORE_NAME, MSG_STORE_NAME],
        "readwrite"
      );
      const sessionStore = transaction.objectStore(SESSION_STORE_NAME);
      const messageStore = transaction.objectStore(MSG_STORE_NAME);
      const messageIndex = messageStore.index("sessionId");

      // 1. Delete session entry
      const deleteSessionRequest = sessionStore.delete(sessionIdToDelete);
      deleteSessionRequest.onerror = (event) => {
        console.error("Error deleting session entry:", event.target.error);
        // Continue to delete messages if possible
      };
      deleteSessionRequest.onsuccess = () => {
        console.log("Session entry deleted:", sessionIdToDelete);
      };

      // 2. Delete associated messages
      const deleteMessagesRequest = messageIndex.openCursor(
        IDBKeyRange.only(sessionIdToDelete)
      );
      let deletedMessagesCount = 0;

      deleteMessagesRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedMessagesCount++;
          cursor.continue();
        } else {
          console.log(
            `Deleted ${deletedMessagesCount} messages for session ${sessionIdToDelete}.`
          );
        }
      };
      deleteMessagesRequest.onerror = (event) => {
        console.error("Error iterating/deleting messages:", event.target.error);
      };

      // 3. Handle transaction completion
      transaction.oncomplete = () => {
        console.log("Session deletion transaction completed.");
        resolve();
      };

      transaction.onerror = (event) => {
        console.error(
          "Session deletion transaction failed:",
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  /**
   * Retrieves all messages for a specific session, formatted for the Gemini API history.
   * @param {number} sessionId - The ID of the session.
   * @returns {Promise<Array<{role: string, parts: Array<object>}>>} Formatted history array.
   */
  async getFormattedHistoryForSession(sessionId) {
    if (!this.db) await this.openDb();
    if (!sessionId) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readonly");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));

      request.onsuccess = (event) => {
        const messages = event.target.result || [];
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const formattedHistory = messages.map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: Array.isArray(msg.contentParts) ? msg.contentParts : [],
        }));
        resolve(formattedHistory);
      };

      request.onerror = (event) => {
        console.error(
          "Error getting formatted history from DB:",
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  /**
   * Retrieves all raw message objects for a specific session, sorted by timestamp.
   * @param {number} sessionId - The ID of the session.
   * @returns {Promise<Array<object>>} Array of raw message objects.
   */
  async getRawMessagesForSession(sessionId) {
    if (!this.db) await this.openDb();
    if (!sessionId) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readonly");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));

      request.onsuccess = (event) => {
        const messages = event.target.result || [];
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        console.log(
          `[StorageManager] Loaded ${messages.length} raw messages for session ${sessionId} from DB.`
        );
        // Log timestamps after sorting
        // console.log("[StorageManager] Timestamps after sort:", messages.map(m => ({id: m.id, ts: m.timestamp})));
        resolve(messages);
      };
      request.onerror = (event) => {
        console.error(
          "Error getting raw messages from DB:",
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  /**
   * Saves a single message to the database for a given session.
   * @param {object} message - The message object { sender: string, contentParts: Array<object> }.
   * @param {number} sessionId - The ID of the session to associate the message with.
   * @returns {Promise<number>} A promise resolving to the ID of the saved message.
   */
  async saveMessage(message, sessionId) {
    if (!this.db) await this.openDb();
    if (!sessionId)
      return Promise.reject("Cannot save message without a session ID.");
    if (!message || !message.sender || !Array.isArray(message.contentParts)) {
      return Promise.reject("Invalid message format for saving.");
    }

    // Ensure parts are serializable (convert data URLs back if needed, though unlikely here)
    const serializableParts = message.contentParts
      .map((part) => {
        if (part.text) return { text: part.text };
        if (part.inlineData) {
          let base64Data = part.inlineData.data;
          // Assuming data is already base64 here, but check just in case
          if (base64Data.startsWith("data:")) {
            base64Data = base64Data.split(",")[1];
          }
          return {
            inlineData: {
              mimeType: part.inlineData.mimeType,
              data: base64Data,
            },
          };
        }
        return null; // Exclude other types like fileData
      })
      .filter((part) => part !== null);

    // Only save if there are valid parts
    if (serializableParts.length === 0) {
      console.warn("Attempted to save a message with no serializable parts.");
      return Promise.resolve(); // Nothing to save
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const messageToSave = {
        ...message, // Spread original sender
        contentParts: serializableParts, // Use sanitized parts
        timestamp: new Date().toISOString(),
        sessionId: sessionId,
      };
      const request = store.add(messageToSave);

      request.onsuccess = (event) => {
        const savedMessageId = event.target.result;
        console.log(
          "[StorageManager] Message saved to DB for session:",
          sessionId,
          "with ID:",
          savedMessageId
        );
        resolve(savedMessageId);
      };

      request.onerror = (event) => {
        console.error("Error saving message to DB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Updates the contentParts of an existing message.
   * @param {number} messageId - The ID of the message to update.
   * @param {Array<object>} newContentParts - The new contentParts array.
   * @returns {Promise<void>}
   */
  async updateMessageContent(messageId, newContentParts) {
    if (!this.db) await this.openDb();
    if (!messageId) return Promise.reject("Invalid message ID for update.");
    if (!Array.isArray(newContentParts))
      return Promise.reject("Invalid contentParts for update.");

    // Ensure parts are serializable (similar to saveMessage)
    const serializableParts = newContentParts
      .map((part) => {
        if (part.text) return { text: part.text };
        if (part.inlineData) {
          let base64Data = part.inlineData.data;
          if (base64Data.startsWith("data:")) {
            base64Data = base64Data.split(",")[1];
          }
          return {
            inlineData: {
              mimeType: part.inlineData.mimeType,
              data: base64Data,
            },
          };
        }
        return null;
      })
      .filter((part) => part !== null);

    if (serializableParts.length === 0) {
      console.warn(
        `Attempted to update message ${messageId} with no serializable parts.`
      );
      // Decide if this should be an error or just do nothing. Let's reject for now.
      return Promise.reject(
        "Cannot update message with empty serializable content."
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const request = store.get(messageId);

      request.onerror = (event) => {
        console.error(
          `Error getting message ${messageId} for update:`,
          event.target.error
        );
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        const message = event.target.result;
        if (message) {
          // Log timestamp before update
          const originalTimestamp = message.timestamp;
          console.log(
            `[StorageManager] Timestamp BEFORE update for message ${messageId}: ${originalTimestamp}`
          );

          // Update only the contentParts
          message.contentParts = serializableParts;
          const updateRequest = store.put(message); // Put the modified object back

          updateRequest.onerror = (event) => {
            console.error(
              `Error updating message ${messageId}:`,
              event.target.error
            );
            reject(event.target.error);
          };
          updateRequest.onsuccess = () => {
            // Verify timestamp after update (optional, requires another get)
            // store.get(messageId).onsuccess = (e) => {
            //     console.log(`[StorageManager] Timestamp AFTER update for message ${messageId}: ${e.target.result.timestamp}`);
            // };
            console.log(
              `[StorageManager] Message ${messageId} content updated successfully. Original timestamp: ${originalTimestamp}`
            );
            resolve();
          };
        } else {
          console.error(`Message ${messageId} not found for update.`);
          reject(`Message ${messageId} not found.`);
        }
      };
    });
  }

  /**
   * Finds the ID of the most recent user message preceding a given model message ID within a session.
   * @param {number} sessionId - The ID of the session.
   * @param {number} modelMessageId - The ID of the model message.
   * @returns {Promise<number | null>} The ID of the preceding user message, or null if not found.
   */
  async findPreviousUserMessage(sessionId, modelMessageId) {
    if (!this.db) await this.openDb();
    if (!sessionId || !modelMessageId) return Promise.resolve(null);

    try {
      const messages = await this.getRawMessagesForSession(sessionId); // Already sorted by timestamp
      const modelMessageIndex = messages.findIndex(
        (msg) => msg.id === modelMessageId
      );

      if (modelMessageIndex === -1) {
        console.warn(
          `Model message ${modelMessageId} not found in session ${sessionId}.`
        );
        return null;
      }

      // Search backwards from the model message
      for (let i = modelMessageIndex - 1; i >= 0; i--) {
        if (messages[i].sender === "user") {
          return messages[i].id;
        }
      }

      console.warn(
        `No preceding user message found for model message ${modelMessageId} in session ${sessionId}.`
      );
      return null; // No preceding user message found
    } catch (error) {
      console.error("Error finding previous user message:", error);
      throw error; // Re-throw the error
    }
  }

  /**
   * Retrieves messages for a session up to and including a specific message ID, formatted for API history.
   * @param {number} sessionId - The ID of the session.
   * @param {number} userMessageId - The ID of the last message to include.
   * @returns {Promise<Array<{role: string, parts: Array<object>}>>} Formatted history array.
   */
  async getHistoryUpToMessage(sessionId, userMessageId) {
    if (!this.db) await this.openDb();
    if (!sessionId || !userMessageId) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readonly");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const index = store.index("sessionId");
      const request = index.getAll(IDBKeyRange.only(sessionId));

      request.onsuccess = (event) => {
        const messages = event.target.result || [];
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const userMessageIndex = messages.findIndex(
          (msg) => msg.id === userMessageId
        );
        if (userMessageIndex === -1) {
          console.warn(
            `User message ${userMessageId} not found in session ${sessionId} for history truncation.`
          );
          resolve([]); // Return empty if the target message isn't found
          return;
        }

        // Include messages up to and including the user message
        const truncatedMessages = messages.slice(0, userMessageIndex + 1);

        const formattedHistory = truncatedMessages.map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: Array.isArray(msg.contentParts) ? msg.contentParts : [],
        }));
        resolve(formattedHistory);
      };

      request.onerror = (event) => {
        console.error(
          "Error getting truncated history from DB:",
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  /**
   * Retrieves the contentParts of a specific message by its ID.
   * @param {number} sessionId - The ID of the session (optional, for context).
   * @param {number} messageId - The ID of the message to retrieve.
   * @returns {Promise<Array<object> | null>} The contentParts array or null if not found.
   */
  async getMessageContent(sessionId, messageId) {
    if (!this.db) await this.openDb();
    if (!messageId) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readonly");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const request = store.get(messageId);

      request.onsuccess = (event) => {
        const message = event.target.result;
        if (message) {
          // Optional: Check if message belongs to the expected session
          if (sessionId && message.sessionId !== sessionId) {
            console.warn(
              `Message ${messageId} found but belongs to session ${message.sessionId}, not expected session ${sessionId}.`
            );
            resolve(null); // Or reject? For now, return null.
          } else {
            resolve(
              Array.isArray(message.contentParts) ? message.contentParts : null
            );
          }
        } else {
          resolve(null); // Message not found
        }
      };

      request.onerror = (event) => {
        console.error(
          `Error getting message content for ID ${messageId}:`,
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }

  /**
   * Deletes a specific message from the database by its ID.
   * @param {number} sessionId - The ID of the session (for logging/context).
   * @param {number} messageId - The ID of the message to delete.
   * @returns {Promise<void>}
   */
  async deleteMessage(sessionId, messageId) {
    if (!this.db) await this.openDb();
    if (!messageId) return Promise.reject("Invalid message ID for deletion.");

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([MSG_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MSG_STORE_NAME);
      const request = store.delete(messageId);

      request.onsuccess = () => {
        console.log(
          `[StorageManager] Message ${messageId} deleted from session ${sessionId}.`
        );
        resolve();
      };

      request.onerror = (event) => {
        console.error(
          `Error deleting message ${messageId}:`,
          event.target.error
        );
        reject(event.target.error);
      };
    });
  }
}
