// Import the GoogleGenerativeAI class using the ES module CDN link
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";

const apiKeyInput = document.getElementById("api-key");
const saveKeyButton = document.getElementById("save-key");
const keyStatus = document.getElementById("key-status");
const chatHistory = document.getElementById("chat-history");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const attachButton = document.getElementById("attach-button");
const fileInput = document.getElementById("file-input");
const previewArea = document.getElementById("preview-area");
const sessionSelector = document.getElementById("session-selector");
const newSessionButton = document.getElementById("new-session-button");
const deleteSessionButton = document.getElementById("delete-session-button"); // Added

let genAI;
let chat;
let apiKey = localStorage.getItem("geminiApiKey");
let attachedFiles = []; // To store { name, type, dataUrl, file }
let currentSessionId = null; // Track the active session ID
const LAST_SESSION_KEY = "lastActiveSessionId"; // localStorage key

// --- IndexedDB Setup ---
const DB_NAME = "geminiChatHistoryDB";
const DB_VERSION = 2; // Increment version for schema change
const MSG_STORE_NAME = "chatMessages";
const SESSION_STORE_NAME = "sessions";
let db; // Database connection variable

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("IndexedDB error: " + event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database opened successfully.");
      resolve(db);
    };

    // This event only executes if the version number changes
    // or the database is created for the first time.
    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      const transaction = event.target.transaction; // Get transaction for upgrade
      console.log(
        `Upgrading database from version ${event.oldVersion} to ${event.newVersion}...`
      );

      // Create sessions store if it doesn't exist (for new DB or upgrade from v1)
      if (!dbInstance.objectStoreNames.contains(SESSION_STORE_NAME)) {
        const sessionStore = dbInstance.createObjectStore(SESSION_STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
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
        // If upgrading, get the existing store via the transaction
        msgStore = transaction.objectStore(MSG_STORE_NAME);
      }

      // Add indexes if they don't exist (handles both creation and upgrade)
      if (!msgStore.indexNames.contains("timestamp")) {
        msgStore.createIndex("timestamp", "timestamp", { unique: false });
        console.log("Index 'timestamp' created on", MSG_STORE_NAME);
      }
      if (!msgStore.indexNames.contains("sessionId")) {
        // Add sessionId index to link messages to sessions
        msgStore.createIndex("sessionId", "sessionId", { unique: false });
        console.log("Index 'sessionId' created on", MSG_STORE_NAME);
      }

      console.log("Database upgrade complete.");
    };
  });
}

// --- Session Management Functions ---

async function loadSessions() {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE_NAME], "readonly");
    const store = transaction.objectStore(SESSION_STORE_NAME);
    const request = store.getAll(); // Or use index if sorting needed

    request.onsuccess = (event) => {
      const sessions = event.target.result;
      sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Show newest first
      sessionSelector.innerHTML = ""; // Clear existing options
      if (sessions.length === 0) {
        // If no sessions, create an initial one
        createNewSession(true).then(resolve).catch(reject); // Create and resolve when done
      } else {
        sessions.forEach((session) => {
          const option = document.createElement("option");
          option.value = session.id;
          // Use a user-friendly name, e.g., based on creation date
          option.textContent =
            session.name ||
            `Session ${new Date(session.createdAt).toLocaleString()}`;
          sessionSelector.appendChild(option);
        });
        resolve(sessions); // Resolve with the loaded sessions
      }
    };
    request.onerror = (event) => {
      console.error("Error loading sessions:", event.target.error);
      reject(event.target.error);
    };
  });
}

async function createNewSession(isInitial = false) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE_NAME], "readwrite");
    const store = transaction.objectStore(SESSION_STORE_NAME);
    const newSession = {
      name: `Chat ${new Date().toLocaleString()}`, // Default name
      createdAt: new Date().toISOString(),
    };
    const request = store.add(newSession);

    request.onsuccess = (event) => {
      const newSessionId = event.target.result;
      console.log("New session created with ID:", newSessionId);
      currentSessionId = newSessionId;
      localStorage.setItem(LAST_SESSION_KEY, currentSessionId); // Save as last active

      // Add to dropdown and select it
      const option = document.createElement("option");
      option.value = newSessionId;
      option.textContent = newSession.name;
      sessionSelector.insertBefore(option, sessionSelector.firstChild); // Add to top
      sessionSelector.value = newSessionId;

      // Clear chat history display only if not the very first initial session
      if (!isInitial) {
        chatHistory.innerHTML = "";
      }
      resolve(newSessionId); // Resolve with the new ID
    };
    request.onerror = (event) => {
      console.error("Error creating new session:", event.target.error);
      reject(event.target.error);
    };
  });
}

async function switchSession(sessionId) {
  if (!sessionId || sessionId === currentSessionId) return; // No change needed

  console.log("Switching to session:", sessionId);
  currentSessionId = sessionId;
  localStorage.setItem(LAST_SESSION_KEY, currentSessionId); // Remember this session
  sessionSelector.value = currentSessionId; // Update dropdown selection

  // Clear current chat display and load history for the new session
  chatHistory.innerHTML = "";
  await loadHistoryFromDb(currentSessionId); // Pass session ID
}

async function deleteSession(sessionIdToDelete) {
  if (!db || !sessionIdToDelete) return;

  // Confirmation dialog
  const sessionOption = sessionSelector.querySelector(
    `option[value="${sessionIdToDelete}"]`
  );
  const sessionName = sessionOption
    ? sessionOption.textContent
    : `Session ${sessionIdToDelete}`;
  if (
    !confirm(
      `Are you sure you want to delete "${sessionName}" and all its messages? This cannot be undone.`
    )
  ) {
    return; // User cancelled
  }

  console.log("Attempting to delete session:", sessionIdToDelete);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [SESSION_STORE_NAME, MSG_STORE_NAME],
      "readwrite"
    );
    const sessionStore = transaction.objectStore(SESSION_STORE_NAME);
    const messageStore = transaction.objectStore(MSG_STORE_NAME);
    const messageIndex = messageStore.index("sessionId");

    // 1. Delete the session entry
    const deleteSessionRequest = sessionStore.delete(sessionIdToDelete);
    deleteSessionRequest.onerror = (event) => {
      console.error("Error deleting session entry:", event.target.error);
      // Don't reject immediately, try deleting messages anyway if possible
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
        cursor.delete(); // Delete the message pointed to by the cursor
        deletedMessagesCount++;
        cursor.continue(); // Move to the next message in the index range
      } else {
        // No more messages for this session
        console.log(
          `Deleted ${deletedMessagesCount} messages for session ${sessionIdToDelete}.`
        );
      }
    };
    deleteMessagesRequest.onerror = (event) => {
      console.error("Error iterating/deleting messages:", event.target.error);
      // Don't reject immediately, wait for transaction completion
    };

    // 3. Handle transaction completion
    transaction.oncomplete = async () => {
      console.log("Session deletion transaction completed.");

      // Remove from dropdown
      const optionToRemove = sessionSelector.querySelector(
        `option[value="${sessionIdToDelete}"]`
      );
      if (optionToRemove) {
        sessionSelector.removeChild(optionToRemove);
      }

      // Determine the next session to load
      let nextSessionId = null;
      if (sessionSelector.options.length > 0) {
        // Select the first remaining option (which is the newest)
        nextSessionId = parseInt(sessionSelector.options[0].value, 10);
        sessionSelector.value = nextSessionId; // Update dropdown selection
      } else {
        // No sessions left, create a new one
        console.log("No sessions left, creating a new one.");
        try {
          nextSessionId = await createNewSession(true); // Create and get the new ID
        } catch (creationError) {
          console.error(
            "Failed to create new session after deletion:",
            creationError
          );
          chatHistory.innerHTML =
            "<p>Error: Could not create a new session.</p>";
          reject(creationError); // Reject the overall delete operation
          return;
        }
      }

      // Switch to the determined session (or the newly created one)
      if (nextSessionId) {
        await switchSession(nextSessionId); // This updates currentSessionId and loads history
      } else {
        // Should not happen if createNewSession worked, but handle defensively
        currentSessionId = null;
        localStorage.removeItem(LAST_SESSION_KEY);
        chatHistory.innerHTML = ""; // Clear display
        console.warn("Could not determine next session ID after deletion.");
      }

      resolve(); // Deletion process successful
    };

    transaction.onerror = (event) => {
      console.error("Session deletion transaction failed:", event.target.error);
      alert("Failed to delete session. Please check the console for errors.");
      reject(event.target.error);
    };
  });
}

// --- Message DB Functions (Modified) ---

async function saveMessageToDb(message) {
  if (!db || !currentSessionId) {
    console.error(
      "Database not open or no active session. Cannot save message."
    );
    return; // Don't save if no session is active
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MSG_STORE_NAME], "readwrite");
    const store = transaction.objectStore(MSG_STORE_NAME);
    // Add timestamp and sessionId before saving
    message.timestamp = new Date().toISOString();
    message.sessionId = currentSessionId; // Link message to the current session
    const request = store.add(message);

    request.onsuccess = () => {
      // console.log("Message saved to DB:", message);
      resolve();
    };

    request.onerror = (event) => {
      console.error("Error saving message to DB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Modified to load messages for a specific session
async function loadHistoryFromDb(sessionId) {
  if (!db || !sessionId) {
    console.error(
      "Database not open or no session ID provided. Cannot load history."
    );
    return;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MSG_STORE_NAME], "readonly");
    const store = transaction.objectStore(MSG_STORE_NAME);
    const index = store.index("sessionId"); // Use the sessionId index
    const request = index.getAll(IDBKeyRange.only(sessionId)); // Get messages for this session

    request.onsuccess = (event) => {
      const messages = event.target.result;
      // Sort by timestamp
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      console.log(
        `Loaded ${messages.length} messages for session ${sessionId} from DB.`
      );
      messages.forEach((msg) => {
        // Call addMessage WITHOUT saving again
        addMessage(msg.sender, msg.contentParts, false);
      });
      resolve(messages); // Resolve with the loaded messages
    };

    request.onerror = (event) => {
      console.error("Error loading history from DB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// --- API Key Handling ---

async function initializeGenAI() {
  // Make async to await DB operations
  // Try to open the database first
  try {
    await openDb();
  } catch (error) {
    console.error("Failed to open IndexedDB:", error);
    keyStatus.textContent =
      "Error initializing database. History may not work.";
    keyStatus.style.color = "orange";
    // Continue initialization even if DB fails, but history won't load/save
  }

  if (apiKey) {
    try {
      genAI = new GoogleGenerativeAI(apiKey);
      // Use a model that supports multimodal input, like gemini-pro-vision
      // Or the newer gemini-1.5-flash or gemini-1.5-pro models
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro-exp-03-25",
      });
      chat = model.startChat({
        // You might want to load/save history if needed
        // history: [],
        // generationConfig: { maxOutputTokens: 100 } // Optional config
      });
      keyStatus.textContent = "API Key loaded successfully.";
      keyStatus.style.color = "green";
      apiKeyInput.value = apiKey; // Show the key (masked by type="password")
      document.getElementById("chat-container").style.display = "flex"; // Show chat

      // Load sessions and determine active session
      if (db) {
        chatHistory.innerHTML = ""; // Clear history display initially
        try {
          await loadSessions(); // Populates dropdown, creates initial if needed
          // Determine which session to load
          const lastSessionId = localStorage.getItem(LAST_SESSION_KEY);
          const selectedOption = sessionSelector.querySelector(
            `option[value="${lastSessionId}"]`
          );

          if (lastSessionId && selectedOption) {
            // If last session exists in dropdown, load it
            currentSessionId = parseInt(lastSessionId, 10); // Ensure it's a number
            sessionSelector.value = currentSessionId;
            console.log("Loading last active session:", currentSessionId);
          } else if (sessionSelector.options.length > 0) {
            // Otherwise, load the first session in the (sorted) list (newest)
            currentSessionId = parseInt(sessionSelector.options[0].value, 10);
            sessionSelector.value = currentSessionId;
            localStorage.setItem(LAST_SESSION_KEY, currentSessionId); // Store as last active
            console.log("Loading newest session:", currentSessionId);
          } else {
            // This case should ideally be handled by loadSessions creating an initial one
            console.warn("No sessions found or created.");
            currentSessionId = null;
          }

          // Load history for the determined session
          if (currentSessionId) {
            await loadHistoryFromDb(currentSessionId);
          }
        } catch (sessionError) {
          console.error("Error loading/setting up sessions:", sessionError);
          keyStatus.textContent += " (Error loading sessions)";
          keyStatus.style.color = "orange";
        }
      }
    } catch (error) {
      console.error("Error initializing GenAI:", error);
      keyStatus.textContent = `Error initializing: ${error.message}. Please check your key.`;
      keyStatus.style.color = "red";
      apiKey = null; // Invalidate the key
      localStorage.removeItem("geminiApiKey");
      document.getElementById("chat-container").style.display = "none"; // Hide chat
    }
  } else {
    keyStatus.textContent = "API Key not set.";
    keyStatus.style.color = "orange";
    document.getElementById("chat-container").style.display = "none"; // Hide chat
  }
}

saveKeyButton.addEventListener("click", () => {
  const newKey = apiKeyInput.value.trim();
  if (newKey) {
    apiKey = newKey;
    localStorage.setItem("geminiApiKey", apiKey);
    initializeGenAI(); // Re-initialize with the new key
  } else {
    keyStatus.textContent = "Please enter an API Key.";
    keyStatus.style.color = "red";
  }
});

deleteSessionButton.addEventListener("click", async () => {
  const sessionIdToDelete = parseInt(sessionSelector.value, 10);
  if (!isNaN(sessionIdToDelete)) {
    try {
      await deleteSession(sessionIdToDelete);
      console.log("Session deletion process initiated for:", sessionIdToDelete);
    } catch (error) {
      console.error("Error during session deletion process:", error);
      // Error already alerted in deleteSession's transaction handler
    }
  } else {
    console.warn("No valid session selected for deletion.");
    alert("Please select a session to delete.");
  }
});

// --- Session UI Event Listeners ---

sessionSelector.addEventListener("change", (event) => {
  const selectedSessionId = parseInt(event.target.value, 10);
  if (!isNaN(selectedSessionId)) {
    switchSession(selectedSessionId);
  }
});

newSessionButton.addEventListener("click", async () => {
  console.log("New session button clicked.");
  try {
    await createNewSession(); // Creates, selects, and clears history
  } catch (error) {
    console.error("Failed to create new session from button:", error);
    // Optionally display an error to the user
  }
});

// --- Chat Message Display ---

// Add a flag to control saving to DB, default to true
// Add usageMetadata parameter
function addMessage(
  sender,
  contentParts,
  saveToDb = true,
  usageMetadata = null
) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add(
    "message",
    sender === "user" ? "user-message" : "model-message"
  );

  const contentDiv = document.createElement("div");
  contentDiv.classList.add("message-content");

  contentParts.forEach((part) => {
    if (part.text) {
      // 1. Parse Markdown
      // Use { breaks: true } in marked options to interpret single newlines as <br>
      const markdownHtml = marked.parse(part.text, { breaks: true });
      // 2. Set innerHTML (this handles HTML tags from Markdown)
      // Create a temporary div to avoid potential issues if contentDiv already has children
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = markdownHtml;
      // Append children from tempDiv to contentDiv
      while (tempDiv.firstChild) {
        contentDiv.appendChild(tempDiv.firstChild);
      }
      // 3. Render LaTeX using KaTeX auto-render
      // Ensure KaTeX and its auto-render extension are loaded before calling this
      if (window.renderMathInElement) {
        renderMathInElement(contentDiv, {
          // customised options
          // • auto-render specific keys, e.g.:
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          // • rendering keys, e.g.:
          throwOnError: false,
        });
      } else {
        console.warn("KaTeX auto-render not loaded yet.");
      }

      // Add copy buttons to code blocks *after* markdown is parsed and added to contentDiv
      // This needs to happen *after* the main text processing for this part
      contentDiv.querySelectorAll("pre").forEach((preElement) => {
        // Avoid adding duplicate buttons if we process multiple text parts
        if (preElement.querySelector(".copy-code-button")) return;

        const codeCopyButton = document.createElement("button");
        codeCopyButton.textContent = "Copy Code";
        codeCopyButton.classList.add("copy-code-button"); // Use a different class

        // Get text content, preferring the inner <code> if it exists
        const codeElement = preElement.querySelector("code");
        const codeToCopy = codeElement
          ? codeElement.textContent
          : preElement.textContent;

        codeCopyButton.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent triggering other click listeners if nested
          navigator.clipboard
            .writeText(codeToCopy)
            .then(() => {
              codeCopyButton.textContent = "Copied!";
              setTimeout(() => {
                codeCopyButton.textContent = "Copy Code";
              }, 1500);
            })
            .catch((err) => {
              console.error("Failed to copy code: ", err);
            });
        });
        // Prepend button inside the <pre> tag for better positioning context
        preElement.style.position = "relative"; // Ensure pre is a positioning context
        preElement.insertBefore(codeCopyButton, preElement.firstChild);
      });
    } else if (part.inlineData) {
      // This should be at the same level as if (part.text)
      const mimeType = part.inlineData.mimeType;
      const data = part.inlineData.data;
      if (mimeType.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = `data:${mimeType};base64,${data}`;
        img.alt = "User image";
        contentDiv.appendChild(img);
      } else if (mimeType.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = `data:${mimeType};base64,${data}`;
        video.controls = true;
        contentDiv.appendChild(video);
      }
    } else if (part.fileData) {
      // Handle fileData if API returns it (less common for display)
      const textNode = document.createTextNode(
        `[File: ${part.fileData.mimeType}]`
      );
      contentDiv.appendChild(textNode);
    } // End of the main part processing (text, inlineData, fileData)
  }); // End of contentParts.forEach loop

  // Add a general Copy Button for any message with text content (user or model)
  // This copies the *original* full text content
  if (contentParts.some((part) => part.text)) {
    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy All";
    copyButton.classList.add("copy-button"); // General copy button class
    // Find the original text content to copy
    const textToCopy = contentParts.find((part) => part.text)?.text || "";

    copyButton.addEventListener("click", () => {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          copyButton.textContent = "Copied All!";
          setTimeout(() => {
            copyButton.textContent = "Copy All";
          }, 1500); // Reset after 1.5 seconds
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
        });
    });
    // Append this general button to the main message div, not the content div
    messageDiv.appendChild(copyButton);
  }

  messageDiv.appendChild(contentDiv); // Append the actual content

  // --- Add Token Usage Info ---
  if (
    sender === "model" &&
    usageMetadata &&
    usageMetadata.totalTokenCount !== undefined
  ) {
    const tokenInfoDiv = document.createElement("div");
    tokenInfoDiv.classList.add("token-usage-info"); // Add a class for styling
    // Display detailed token breakdown
    const promptTokens = usageMetadata.promptTokenCount ?? "N/A"; // Use ?? for safety
    const responseTokens = usageMetadata.candidatesTokenCount ?? "N/A";
    const totalTokens = usageMetadata.totalTokenCount ?? "N/A";
    tokenInfoDiv.textContent = `Tokens: ${totalTokens} (Prompt: ${promptTokens}, Response: ${responseTokens})`;
    messageDiv.appendChild(tokenInfoDiv); // Append below the content
  }
  // --- End Token Usage Info ---

  chatHistory.appendChild(messageDiv); // Append the message to history
  chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom

  // Save the message to IndexedDB if requested and DB is available
  if (saveToDb && db) {
    // Need to handle potential serialization issues with complex objects like File
    // Store only serializable parts (text, inlineData base64)
    // Important: Convert dataUrl back to base64 for storage if needed
    const serializableParts = contentParts
      .map((part) => {
        if (part.text) return { text: part.text };
        if (part.inlineData) {
          // Ensure data is base64 string, not data URL
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
        // Exclude fileData or other non-serializable parts for storage
        return null;
      })
      .filter((part) => part !== null); // Remove null entries

    // Only save if there are parts to save
    if (serializableParts.length > 0) {
      saveMessageToDb({ sender, contentParts: serializableParts }).catch(
        (error) => console.error("Failed to save message:", error)
      );
    }
  }
}

// --- File Handling ---

attachButton.addEventListener("click", () => {
  fileInput.click(); // Trigger hidden file input
});

fileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  handleFiles(files);
  fileInput.value = ""; // Reset input to allow selecting the same file again
});

// Allow dropping files onto the textarea
messageInput.addEventListener("dragover", (event) => {
  event.preventDefault();
  messageInput.classList.add("dragover"); // Optional: Add visual feedback
});
messageInput.addEventListener("dragleave", () => {
  messageInput.classList.remove("dragover"); // Optional: Remove visual feedback
});
messageInput.addEventListener("drop", (event) => {
  event.preventDefault();
  messageInput.classList.remove("dragover");
  const files = event.dataTransfer.files;
  handleFiles(files);
});

function handleFiles(files) {
  if (!files) return;
  for (const file of files) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      alert(`File type not supported: ${file.name} (${file.type})`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      attachedFiles.push({
        name: file.name,
        type: file.type,
        dataUrl: dataUrl,
        file: file,
      });
      displayPreview(file.name, file.type, dataUrl);
    };
    reader.readAsDataURL(file);
  }
}

function displayPreview(name, type, dataUrl) {
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
    // video.controls = true; // Maybe too small for controls
  }
  previewItem.appendChild(mediaElement);

  const removeButton = document.createElement("button");
  removeButton.classList.add("remove-preview");
  removeButton.textContent = "x";
  removeButton.onclick = () => removePreview(name);
  previewItem.appendChild(removeButton);

  previewArea.appendChild(previewItem);
}

function removePreview(name) {
  attachedFiles = attachedFiles.filter((f) => f.name !== name);
  const previewItem = previewArea.querySelector(
    `.preview-item[data-file-name="${name}"]`
  );
  if (previewItem) {
    previewArea.removeChild(previewItem);
  }
}

// Helper to convert file to GenerativePart
async function fileToGenerativePart(file) {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]); // Get base64 part
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
}

// --- Sending Message ---

async function sendMessage() {
  if (!apiKey || !chat) {
    addMessage("model", [
      { text: "Error: API Key not configured or initialization failed." },
    ]);
    return;
  }

  const textInput = messageInput.value.trim();
  const filesToSend = [...attachedFiles]; // Copy the array

  if (!textInput && filesToSend.length === 0) {
    return; // Nothing to send
  }

  // Clear input and previews immediately
  messageInput.value = "";
  previewArea.innerHTML = "";
  attachedFiles = [];

  // Prepare parts for the API
  const messageParts = [];

  // Add text part if present
  if (textInput) {
    messageParts.push({ text: textInput });
  }

  // Add file parts
  const filePromises = filesToSend.map((fileInfo) =>
    fileToGenerativePart(fileInfo.file)
  );
  const fileParts = await Promise.all(filePromises);
  messageParts.push(...fileParts);

  // Display user message (including previews of sent files)
  const userDisplayParts = [];
  if (textInput) {
    userDisplayParts.push({ text: textInput });
  }
  filesToSend.forEach((f) => {
    userDisplayParts.push({
      inlineData: { mimeType: f.type, data: f.dataUrl.split(",")[1] },
    });
  });
  // Ensure this call saves the user message
  addMessage("user", userDisplayParts, true);

  // Add loading indicator (optional)
  const loadingMessageDiv = document.createElement("div");
  loadingMessageDiv.classList.add("message", "model-message");
  loadingMessageDiv.textContent = "Generating response...";
  chatHistory.appendChild(loadingMessageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const result = await chat.sendMessage(messageParts);
    const response = result.response;
    const responseText = response.text(); // Get text response
    const usageInfo = response.usageMetadata; // <-- Extract usage metadata

    // Remove loading indicator
    chatHistory.removeChild(loadingMessageDiv);

    // Display model response, pass usageInfo, and ensure it's saved
    addMessage("model", [{ text: responseText }], true, usageInfo); // <-- Pass usageInfo
  } catch (error) {
    // Remove loading indicator
    chatHistory.removeChild(loadingMessageDiv);
    console.error("Error sending message:", error);
    // Display error message but DO NOT save it to history
    addMessage("model", [{ text: `Error: ${error.message}` }], false);
  }
}

sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (event) => {
  // Send on Enter, but allow Shift+Enter for new lines
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault(); // Prevent default newline behavior
    sendMessage();
  }
});

// --- Initialization ---
initializeGenAI();
