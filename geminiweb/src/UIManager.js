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
        };

        // Validate that all elements were found
        for (const key in this.elements) {
            if (!this.elements[key]) {
                console.warn(`UI element not found: ${key} (ID: ${key.replace(/([A-Z])/g, '-$1').toLowerCase()})`);
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
     * Updates the status message displayed to the user.
     * @param {string} text - The message text.
     * @param {'info' | 'success' | 'warning' | 'error'} type - The type of message (affects styling).
     */
    updateStatus(text, type = 'info') {
        const statusElement = this.getElement('keyStatus');
        if (!statusElement) return;

        statusElement.textContent = text;
        statusElement.className = `status-${type}`; // Use classes for styling

        // Reset color mapping (or use CSS classes directly)
        switch (type) {
            case 'success':
                statusElement.style.color = "green";
                break;
            case 'warning':
                statusElement.style.color = "orange";
                break;
            case 'error':
                statusElement.style.color = "red";
                break;
            case 'info':
            default:
                statusElement.style.color = "black"; // Or inherit
                break;
        }
    }

    /**
     * Shows or hides the main chat interface container.
     * @param {boolean} show - True to show, false to hide.
     */
    showChatContainer(show) {
        const container = this.getElement('chatContainer');
        if (container) {
            container.style.display = show ? "flex" : "none";
        }
    }

    /**
     * Clears the content of the chat history display area.
     */
    clearChatHistory() {
        const chatHistory = this.getElement('chatHistory');
        if (chatHistory) {
            chatHistory.innerHTML = '';
        }
    }

     /**
     * Clears the message input field.
     */
     clearMessageInput() {
        const messageInput = this.getElement('messageInput');
        if (messageInput) {
            messageInput.value = '';
        }
    }

    /**
     * Scrolls the chat history area to the bottom.
     */
    scrollToChatBottom() {
        const chatHistory = this.getElement('chatHistory');
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
        return selector && selector.options.length > 0 ? selector.options[0].value : null;
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
