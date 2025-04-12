/**
 * Manages file attachments, UI previews, and conversion for the API.
 */
export class FileManager {
    /**
     * @param {UIManager} uiManager - Instance for DOM interactions.
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.attachedFiles = []; // Stores { name, type, dataUrl, file }

        this.attachButton = this.uiManager.getElement('attachButton');
        this.fileInput = this.uiManager.getElement('fileInput');
        this.previewArea = this.uiManager.getElement('previewArea');
        this.messageInput = this.uiManager.getElement('messageInput'); // For drag/drop

        this._setupEventListeners();
    }

    /**
     * Handles files selected via input or drag/drop.
     * @param {FileList} files - The files to process.
     */
    handleFiles(files) {
        if (!files) return;
        for (const file of files) {
            // Basic validation (allow images and videos)
            if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
                alert(`File type not supported: ${file.name} (${file.type})`);
                continue;
            }

            // Prevent duplicates by name
            if (this.attachedFiles.some(f => f.name === file.name)) {
                console.warn(`File already attached: ${file.name}`);
                continue;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                this.attachedFiles.push({
                    name: file.name,
                    type: file.type,
                    dataUrl: dataUrl,
                    file: file, // Keep the original File object
                });
                this._displayPreview(file.name, file.type, dataUrl);
            };
            reader.onerror = (e) => {
                console.error(`Error reading file ${file.name}:`, reader.error);
                alert(`Error reading file: ${file.name}`);
            };
            reader.readAsDataURL(file);
        }
    }

    /**
     * Displays a preview for an attached file.
     * @param {string} name - File name.
     * @param {string} type - MIME type.
     * @param {string} dataUrl - Data URL for preview.
     * @private
     */
    _displayPreview(name, type, dataUrl) {
        if (!this.previewArea) return;

        const previewItem = document.createElement("div");
        previewItem.classList.add("preview-item");
        previewItem.dataset.fileName = name; // Store name for removal

        let mediaElement;
        if (type.startsWith("image/")) {
            mediaElement = document.createElement("img");
            mediaElement.src = dataUrl;
            mediaElement.alt = name;
        } else if (type.startsWith("video/")) {
            mediaElement = document.createElement("video");
            mediaElement.src = dataUrl;
            mediaElement.muted = true; // Mute previews by default
            mediaElement.playsInline = true;
            mediaElement.addEventListener('loadedmetadata', () => { // Autoplay short videos on hover maybe?
                 // Example: mediaElement.play(); on mouseenter
            });
            // video.controls = true; // Controls might be too large for small previews
        } else {
            return; // Should not happen based on handleFiles validation
        }
        previewItem.appendChild(mediaElement);

        const removeButton = document.createElement("button");
        removeButton.classList.add("remove-preview");
        removeButton.textContent = "x";
        removeButton.title = `Remove ${name}`;
        removeButton.onclick = (e) => {
            e.stopPropagation(); // Prevent potential parent event listeners
            this._removePreview(name);
        };
        previewItem.appendChild(removeButton);

        this.previewArea.appendChild(previewItem);
    }

    /**
     * Removes a file preview and the corresponding file data.
     * @param {string} name - The name of the file to remove.
     * @private
     */
    _removePreview(name) {
        this.attachedFiles = this.attachedFiles.filter((f) => f.name !== name);
        const previewItem = this.previewArea?.querySelector(
            `.preview-item[data-file-name="${name}"]`
        );
        if (previewItem) {
            this.previewArea.removeChild(previewItem);
        }
        console.log(`Removed file: ${name}`);
    }

    /**
     * Clears all attached files and their previews.
     */
    clearAttachments() {
        this.attachedFiles = [];
        if (this.previewArea) {
            this.previewArea.innerHTML = '';
        }
        // Also reset the file input value if needed
        if (this.fileInput) {
            this.fileInput.value = "";
        }
        console.log("Cleared all attachments.");
    }

    /**
     * Gets the currently attached files.
     * @returns {Array<{name: string, type: string, dataUrl: string, file: File}>}
     */
    getAttachedFiles() {
        return [...this.attachedFiles]; // Return a copy
    }

    /**
     * Converts the currently attached files into the GenerativePart format for the API.
     * @returns {Promise<Array<{inlineData: {data: string, mimeType: string}}>>}
     */
    async getFilesAsGenerativeParts() {
        const filePromises = this.attachedFiles.map(fileInfo =>
            this._fileToGenerativePart(fileInfo.file)
        );
        return Promise.all(filePromises);
    }

    /**
     * Helper to convert a single File object to a GenerativePart.
     * @param {File} file - The file object.
     * @returns {Promise<{inlineData: {data: string, mimeType: string}}>}
     * @private
     */
    async _fileToGenerativePart(file) {
        const base64EncodedDataPromise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    resolve(reader.result.toString().split(",")[1]); // Get base64 part
                } else {
                    reject(new Error("FileReader result was null"));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        try {
            const base64Data = await base64EncodedDataPromise;
            return {
                inlineData: { data: base64Data, mimeType: file.type },
            };
        } catch (error) {
             console.error(`Error converting file ${file.name} to base64:`, error);
             throw new Error(`Failed to process file: ${file.name}`); // Re-throw for upstream handling
        }
    }


    /**
     * Sets up event listeners for file input and drag/drop.
     * @private
     */
    _setupEventListeners() {
        if (this.attachButton && this.fileInput) {
            this.attachButton.addEventListener("click", () => {
                this.fileInput.click(); // Trigger hidden file input
            });

            this.fileInput.addEventListener("change", (event) => {
                if (event.target instanceof HTMLInputElement && event.target.files) {
                    this.handleFiles(event.target.files);
                    // Reset input value to allow selecting the same file again
                    event.target.value = "";
                }
            });
        }

        // Drag and Drop listeners
        if (this.messageInput) {
            this.messageInput.addEventListener("dragover", (event) => {
                event.preventDefault();
                this.messageInput.classList.add("dragover");
            });
            this.messageInput.addEventListener("dragleave", (event) => {
                 // Check if the leave target is outside the messageInput area
                 // The relatedTarget might be null or not a Node, contains handles this gracefully.
                 if (!this.messageInput.contains(event.relatedTarget)) {
                    this.messageInput.classList.remove("dragover");
                 }
            });
            this.messageInput.addEventListener("drop", (event) => {
                event.preventDefault();
                this.messageInput.classList.remove("dragover");
                if (event.dataTransfer?.files) {
                    this.handleFiles(event.dataTransfer.files);
                }
            });
        } else {
            console.warn("Message input element not found for drag/drop setup.");
        }
    }
}
