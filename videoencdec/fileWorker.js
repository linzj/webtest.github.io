// Create a global Promise that will be resolved when initialization is complete.
let initPromiseResolve;
const initPromise = new Promise((resolve) => {
  initPromiseResolve = resolve;
});

let lastWritePromise;

self.onmessage = async function (e) {
  const { type, data } = e.data;

  switch (type) {
    case "init": {
      // Get the root directory.
      const root = await navigator.storage.getDirectory();
      try {
        // Try to remove the file if it already exists.
        await root.removeEntry(data.fileName);
      } catch (e) {
        // If the file does not exist, ignore the error.
      }
      // Create or get the file handle.
      const fileHandle = await root.getFileHandle(data.fileName, {
        create: true,
      });
      // Get the file from the file handle.
      const file = await fileHandle.getFile();
      // If the file size is not 0, throw an error.
      if (file.size !== 0) {
        throw new Error("File is not empty");
      }
      // Create a synchronous access handle for the file.
      self.accessHandle = await fileHandle.createSyncAccessHandle();
      self.writePosition = 0;

      // Resolve the init promise to indicate initialization is complete.
      initPromiseResolve();
      break;
    }

    case "write": {
      // Wait for the initialization to complete before writing.
      await initPromise;

      const { chunk, position } = data;
      // Write the chunk at the specified position.
      lastWritePromise = self.accessHandle.write(chunk, { at: position });
      // Update the write position.
      self.writePosition = Math.max(
        self.writePosition,
        position + chunk.length
      );
      break;
    }

    case "close": {
      if (self.accessHandle) {
        await lastWritePromise;
        // Flush any pending writes.
        await self.accessHandle.flush();
        // Close the access handle.
        await self.accessHandle.close();
        // Notify that the file has been closed.
        self.postMessage({ type: "closed" });
      }
      break;
    }
  }
};
