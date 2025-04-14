import { LAST_SESSION_KEY } from "./Config.js";

/**
 * Manages chat sessions: loading, creating, switching, deleting,
 * and updating the UI selector.
 */
export class SessionManager {
  /**
   * @param {StorageManager} storageManager - Instance for DB operations.
   * @param {UIManager} uiManager - Instance for DOM interactions.
   */
  constructor(storageManager, uiManager) {
    this.storageManager = storageManager;
    this.uiManager = uiManager;
    this.currentSessionId = null;
    this.sessions = []; // Cache of loaded sessions {id, name, createdAt}

    this.sessionSelector = this.uiManager.getElement("sessionSelector");
    this.newSessionButton = this.uiManager.getElement("newSessionButton");
    this.deleteSessionButton = this.uiManager.getElement("deleteSessionButton");
  }

  /**
   * Loads existing sessions from storage, populates the dropdown,
   * and selects the last active or newest session. Creates an initial
   * session if none exist.
   * @returns {Promise<number | null>} The ID of the initially active session.
   */
  async initialize() {
    try {
      this.sessions = await this.storageManager.getAllSessions();
      this.uiManager.clearDropdown(this.sessionSelector);

      if (this.sessions.length === 0) {
        console.log("No existing sessions found, creating initial session.");
        this.currentSessionId = await this.createNewSession(true); // Create and select
      } else {
        this.sessions.forEach((session) => {
          this.populateSessionOption(session);
        });

        const lastSessionIdStr = localStorage.getItem(LAST_SESSION_KEY);
        let sessionToLoad = null;

        if (lastSessionIdStr) {
          const lastSessionId = parseInt(lastSessionIdStr, 10);
          if (this.sessions.some((s) => s.id === lastSessionId)) {
            sessionToLoad = lastSessionId;
          }
        }

        // If last active invalid or not set, default to the first (newest)
        if (!sessionToLoad && this.sessions.length > 0) {
          sessionToLoad = this.sessions[0].id; // sessions are sorted newest first
        }

        if (sessionToLoad) {
          this.currentSessionId = sessionToLoad;
          this.uiManager.selectDropdownValue(
            this.sessionSelector,
            this.currentSessionId
          );
          localStorage.setItem(LAST_SESSION_KEY, this.currentSessionId);
          console.log(
            "Sessions loaded. Initial session:",
            this.currentSessionId
          );
        } else {
          console.error(
            "Could not determine initial session ID even after loading/creating."
          );
          this.currentSessionId = null;
        }
      }
    } catch (error) {
      console.error("Error initializing sessions:", error);
      this.uiManager.updateStatus("Error loading sessions.", "error");
      this.currentSessionId = null;
    }

    this._setupEventListeners();
    return this.currentSessionId;
  }

  /**
   * Gets the ID of the currently active session.
   * @returns {number | null}
   */
  getCurrentSessionId() {
    return this.currentSessionId;
  }

  /**
   * Creates a new session, adds it to the UI, selects it, and makes it active.
   * @param {boolean} [isInitial=false] - Flag indicating if this is the very first session being created.
   * @returns {Promise<number>} The ID of the newly created session.
   */
  async createNewSession(isInitial = false) {
    try {
      const newSessionId = await this.storageManager.createNewSession();
      // Fetch the full session details to add to our cache and UI
      // This is slightly inefficient but ensures consistency
      const allSessions = await this.storageManager.getAllSessions();
      const newSession = allSessions.find((s) => s.id === newSessionId);

      if (!newSession) {
        throw new Error("Failed to retrieve newly created session details.");
      }

      this.sessions.unshift(newSession); // Add to start of cache (newest)
      this.populateSessionOption(newSession, true); // Add to top of dropdown

      this.currentSessionId = newSessionId;
      localStorage.setItem(LAST_SESSION_KEY, this.currentSessionId);
      this.uiManager.selectDropdownValue(
        this.sessionSelector,
        this.currentSessionId
      );

      console.log("New session created and selected:", this.currentSessionId);

      // Trigger session switch logic (clears history etc.) via callback
      if (!isInitial && this.onSessionChangeCallback) {
        await this.onSessionChangeCallback(this.currentSessionId, true); // Indicate it's a new session
      }

      return newSessionId;
    } catch (error) {
      console.error("Error creating new session:", error);
      this.uiManager.updateStatus(
        `Error creating session: ${error.message}`,
        "error"
      );
      throw error; // Re-throw for the caller
    }
  }

  /**
   * Switches the active session to the specified ID.
   * @param {number} sessionId - The ID of the session to switch to.
   * @returns {Promise<void>}
   */
  async switchSession(sessionId) {
    const newSessionId = parseInt(sessionId, 10);
    if (isNaN(newSessionId) || newSessionId === this.currentSessionId) {
      return; // No valid change needed
    }

    if (!this.sessions.some((s) => s.id === newSessionId)) {
      console.warn(
        `Attempted to switch to non-existent session ID: ${newSessionId}`
      );
      // Optionally reload sessions here or show an error
      return;
    }

    console.log("Switching to session:", newSessionId);
    this.currentSessionId = newSessionId;
    localStorage.setItem(LAST_SESSION_KEY, this.currentSessionId);
    this.uiManager.selectDropdownValue(
      this.sessionSelector,
      this.currentSessionId
    );

    // Trigger session switch logic (load history etc.) via callback
    if (this.onSessionChangeCallback) {
      await this.onSessionChangeCallback(this.currentSessionId, false); // Not a new session
    }
  }

  /**
   * Handles the deletion of the currently selected session.
   */
  async deleteCurrentSession() {
    const sessionIdToDelete = this.currentSessionId;
    if (!sessionIdToDelete) {
      alert("No session selected to delete.");
      return;
    }

    const sessionName =
      this.uiManager.getSelectedDropdownText(this.sessionSelector) ||
      `Session ${sessionIdToDelete}`;
    if (
      !confirm(
        `Are you sure you want to delete "${sessionName}" and all its messages? This cannot be undone.`
      )
    ) {
      return; // User cancelled
    }

    try {
      await this.storageManager.deleteSession(sessionIdToDelete);
      console.log("Session deleted from storage:", sessionIdToDelete);

      // Remove from UI and cache
      this.uiManager.removeDropdownOption(
        this.sessionSelector,
        sessionIdToDelete
      );
      this.sessions = this.sessions.filter((s) => s.id !== sessionIdToDelete);

      // Determine the next session to load
      let nextSessionId = null;
      if (this.uiManager.getDropdownLength(this.sessionSelector) > 0) {
        // Select the first remaining option (newest)
        nextSessionId = parseInt(
          this.uiManager.getFirstDropdownValue(this.sessionSelector),
          10
        );
      } else {
        // No sessions left, create a new one
        console.log("No sessions left after deletion, creating a new one.");
        nextSessionId = await this.createNewSession(true); // Create and select
      }

      // Switch to the determined/new session
      if (nextSessionId) {
        // Check if we are already on the next session (if createNewSession was called)
        if (this.currentSessionId !== nextSessionId) {
          await this.switchSession(nextSessionId);
        } else {
          // If createNewSession already set currentSessionId, we still need to trigger
          // the callback to load history etc. for the *new* session.
          if (this.onSessionChangeCallback) {
            await this.onSessionChangeCallback(this.currentSessionId, true); // Indicate it's new
          }
        }
      } else {
        // Should not happen if createNewSession worked
        this.currentSessionId = null;
        localStorage.removeItem(LAST_SESSION_KEY);
        console.warn("Could not determine next session ID after deletion.");
        if (this.onSessionChangeCallback) {
          await this.onSessionChangeCallback(null, false); // Signal no active session
        }
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      alert(`Failed to delete session: ${error.message || error}`);
      this.uiManager.updateStatus(
        `Error deleting session: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Adds or updates a session option in the dropdown.
   * @param {object} session - The session object {id, name, createdAt}.
   * @param {boolean} [prepend=false] - Add to the beginning of the list.
   */
  populateSessionOption(session, prepend = false) {
    const sessionName =
      session.name || `Session ${new Date(session.createdAt).toLocaleString()}`;
    this.uiManager.addDropdownOption(
      this.sessionSelector,
      sessionName,
      session.id,
      prepend
    );
  }

  /**
   * Sets up internal event listeners for session UI elements.
   * @private
   */
  _setupEventListeners() {
    if (this.sessionSelector) {
      this.sessionSelector.addEventListener("change", (event) => {
        this.switchSession(event.target.value);
      });
    }
    if (this.newSessionButton) {
      this.newSessionButton.addEventListener("click", () => {
        this.createNewSession(); // Don't mark as initial here
      });
    }
    if (this.deleteSessionButton) {
      this.deleteSessionButton.addEventListener("click", () => {
        this.deleteCurrentSession();
      });
    }
  }

  /**
   * Registers a callback function to be invoked when the active session changes
   * (either by switching, creating, or after deletion).
   * The callback will receive the new session ID (or null) and a boolean indicating
   * if it's a newly created session.
   * @param {Function} callback - The function to call on session change.
   */
  setOnSessionChange(callback) {
    this.onSessionChangeCallback = callback;
  }
}
