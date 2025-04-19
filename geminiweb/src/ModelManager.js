import { DEFAULT_MODELS, LAST_MODEL_KEY } from "./Config.js";

/**
 * Manages available models (default and custom), handles UI selection,
 * and interacts with StorageManager for persistence.
 */
export class ModelManager {
  /**
   * @param {StorageManager} storageManager - Instance for DB operations.
   * @param {UIManager} uiManager - Instance for DOM interactions.
   * @param {ApiKeyManager} apiKeyManager - Instance for accessing the API key.
   */
  constructor(storageManager, uiManager, apiKeyManager) {
    this.storageManager = storageManager;
    this.uiManager = uiManager;
    this.apiKeyManager = apiKeyManager; // Added
    this.currentModelName = null;
    this.availableModels = []; // Combined list of default + custom

    this.modelSelector = this.uiManager.getElement("modelSelector");
    this.newModelNameInput = this.uiManager.getElement("newModelNameInput");
    this.addModelButton = this.uiManager.getElement("addModelButton");
  }

  /**
   * Loads default and custom models, populates the dropdown,
   * and selects the last used or default model.
   * @returns {Promise<string | null>} The name of the initially selected model, or null if none.
   */
  async initialize() {
    // 1. Load custom models from storage
    let customModels = [];
    try {
      customModels = await this.storageManager.getAllModels();
    } catch (error) {
      console.error("Error loading custom models from DB:", error);
      this.uiManager.updateStatus("Error loading custom models.", "warning");
      // Proceed even if DB load fails
    }
    const customModelNames = customModels.map((m) => m.name);

    // 2. Fetch online models
    let onlineModels = [];
    try {
      onlineModels = await this._fetchOnlineModels();
      console.log("Fetched online models:", onlineModels);
    } catch (error) {
      console.error("Error fetching online models:", error);
      this.uiManager.updateStatus(
        "Could not fetch online models. Using defaults/custom.",
        "warning"
      );
    }

    // 3. Combine all model sources (Default, Custom, Online)
    const allModelSources = [
      ...DEFAULT_MODELS,
      ...customModelNames,
      ...onlineModels,
    ];
    this.availableModels = [...new Set(allModelSources)].sort(); // Unique and sorted

    // 4. Populate dropdown
    this.uiManager.clearDropdown(this.modelSelector);
    this.availableModels.forEach((modelName) => {
      this.uiManager.addDropdownOption(
        this.modelSelector,
        modelName,
        modelName
      );
    });

    // Select the last used model or the first default
    const lastModel = localStorage.getItem(LAST_MODEL_KEY);
    let modelToSelect = null;

    if (lastModel && this.availableModels.includes(lastModel)) {
      modelToSelect = lastModel;
    } else if (this.availableModels.length > 0) {
      modelToSelect = this.availableModels[0]; // Default to the first in the sorted list
    }

    if (modelToSelect) {
      this.uiManager.selectDropdownValue(this.modelSelector, modelToSelect);
      this.currentModelName = modelToSelect;
      localStorage.setItem(LAST_MODEL_KEY, this.currentModelName); // Store the selection
      console.log("Models loaded. Initial model:", this.currentModelName);
    } else {
      this.currentModelName = null; // No models available
      console.warn("No models available to select.");
      this.uiManager.updateStatus("No models available.", "warning");
    }

    this._setupEventListeners();
    return this.currentModelName;
  }

  /**
   * Gets the currently selected model name.
   * @returns {string | null}
   */
  getCurrentModel() {
    return this.currentModelName;
  }

  /**
   * Handles the selection of a different model from the dropdown.
   * @param {string} selectedModel - The newly selected model name.
   * @returns {Promise<boolean>} True if the model switch was successful, false otherwise.
   */
  async handleModelChange(selectedModel) {
    if (selectedModel && selectedModel !== this.currentModelName) {
      console.log("Model selection changed to:", selectedModel);
      this.currentModelName = selectedModel;
      localStorage.setItem(LAST_MODEL_KEY, this.currentModelName);
      // The App/ChatClient will need to re-initialize the chat object.
      // We return true to signal the change was processed here.
      return true;
    }
    return false; // No change or invalid selection
  }

  /**
   * Handles adding a new custom model name.
   */
  async handleAddModel() {
    const newModel = this.newModelNameInput?.value.trim();
    if (!newModel) {
      alert("Please enter a model name to add.");
      return;
    }
    if (this.availableModels.includes(newModel)) {
      alert(`Model "${newModel}" already exists.`);
      return;
    }

    try {
      await this.storageManager.saveModel(newModel);
      console.log("Custom model saved:", newModel);
      if (this.newModelNameInput) this.newModelNameInput.value = ""; // Clear input

      // Add to available models list and dropdown
      this.availableModels.push(newModel);
      this.availableModels.sort(); // Keep it sorted
      this.uiManager.addDropdownOption(this.modelSelector, newModel, newModel);
      // Re-sort dropdown options (simple way: clear and re-add)
      this.uiManager.clearDropdown(this.modelSelector);
      this.availableModels.forEach((model) => {
        this.uiManager.addDropdownOption(this.modelSelector, model, model);
      });

      // Automatically select the newly added model and trigger change
      this.uiManager.selectDropdownValue(this.modelSelector, newModel);
      // Manually trigger the change event logic if needed, or let the App handle it
      await this.handleModelChange(newModel);
      // Notify the main application that the model changed
      if (this.onModelChangeCallback) {
        await this.onModelChangeCallback(newModel);
      }
    } catch (error) {
      console.error("Error adding custom model:", error);
      alert(`Failed to add model: ${error.message || error}`);
      this.uiManager.updateStatus(
        `Error adding model: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Sets up internal event listeners for model UI elements.
   * @private
   */
  _setupEventListeners() {
    if (this.modelSelector) {
      this.modelSelector.addEventListener("change", async (event) => {
        const modelChanged = await this.handleModelChange(event.target.value);
        if (modelChanged && this.onModelChangeCallback) {
          // Notify the main application that the model changed
          await this.onModelChangeCallback(this.currentModelName);
        }
      });
    }

    if (this.addModelButton) {
      this.addModelButton.addEventListener("click", () =>
        this.handleAddModel()
      );
    }
    // Optional: Allow adding model by pressing Enter in the input field
    if (this.newModelNameInput) {
      this.newModelNameInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
          event.preventDefault(); // Prevent form submission if applicable
          this.handleAddModel();
        }
      });
    }
  }

  /**
   * Registers a callback function to be invoked when the model selection changes.
   * The callback will receive the new model name as an argument.
   * @param {Function} callback - The function to call on model change.
   */
  setOnModelChange(callback) {
    this.onModelChangeCallback = callback;
  }

  /**
   * Fetches available models from the Google Generative Language API.
   * Requires an API key to be configured.
   * @returns {Promise<string[]>} A list of model names (e.g., "gemini-1.5-flash-latest").
   * @private
   */
  async _fetchOnlineModels() {
    const apiKey = this.apiKeyManager.getKey();
    if (!apiKey) {
      console.warn("Cannot fetch online models: API key not set.");
      // Optionally inform the user via uiManager
      // this.uiManager.updateStatus("API key needed to fetch online models.", "info");
      return []; // Return empty array if no key
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const fetchedModelNames = [];

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Attempt to read error message from API response
        let errorBody = "Unknown error";
        try {
          const errorData = await response.json();
          errorBody = errorData?.error?.message || JSON.stringify(errorData);
        } catch (parseError) {
          // Ignore if error response isn't valid JSON
          errorBody = await response.text();
        }
        throw new Error(`API Error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();

      if (data.models && Array.isArray(data.models)) {
        data.models.forEach((model) => {
          // Extract the part after "models/" e.g. "gemini-1.5-flash-001" from "models/gemini-1.5-flash-001"
          // Also filter for gemini models specifically if desired
          if (model.name && typeof model.name === "string") {
            const modelIdMatch = model.name.match(/^models\/(gemini-.*)$/); // Updated regex to capture full gemini model name
            if (modelIdMatch && modelIdMatch[1]) {
              // Check if it supports the required generation method
              if (
                model.supportedGenerationMethods?.includes("generateContent")
              ) {
                fetchedModelNames.push(modelIdMatch[1]);
              }
            }
          }
        });
      }
      // Handle pagination if necessary (check for data.nextPageToken)
      // For simplicity, this example assumes all models fit in one page.
    } catch (error) {
      console.error("Failed to fetch or process online models:", error);
      this.uiManager.updateStatus(
        `Error fetching models: ${error.message}`,
        "error"
      );
      // Re-throw or return empty to signal failure
      throw error; // Propagate error to initialize method
    }

    return [...new Set(fetchedModelNames)]; // Return unique names
  }
}
