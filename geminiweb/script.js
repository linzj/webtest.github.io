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

let genAI;
let chat;
let apiKey = localStorage.getItem("geminiApiKey");
let attachedFiles = []; // To store { name, type, dataUrl, file }

// --- API Key Handling ---

function initializeGenAI() {
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

// --- Chat Message Display ---

function addMessage(sender, contentParts) {
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
  chatHistory.appendChild(messageDiv); // Append the message to history
  chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
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
  addMessage("user", userDisplayParts);

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

    // Remove loading indicator
    chatHistory.removeChild(loadingMessageDiv);

    // Display model response
    addMessage("model", [{ text: responseText }]);
  } catch (error) {
    // Remove loading indicator
    chatHistory.removeChild(loadingMessageDiv);
    console.error("Error sending message:", error);
    addMessage("model", [{ text: `Error: ${error.message}` }]);
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
