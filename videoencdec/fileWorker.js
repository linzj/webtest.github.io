self.onmessage = async function (e) {
  const { type, data } = e.data;

  switch (type) {
    case "init": {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(data.fileName, {
        create: true,
      });
      self.accessHandle = await fileHandle.createSyncAccessHandle();
      self.writePosition = 0;
      break;
    }

    case "write": {
      const { chunk, position } = data;
      self.accessHandle.write(chunk, { at: position });
      self.writePosition = Math.max(
        self.writePosition,
        position + chunk.length
      );
      break;
    }

    case "close": {
      if (self.accessHandle) {
        self.accessHandle.flush();
        self.accessHandle.close();
        self.postMessage({ type: "closed" });
      }
      break;
    }
  }
};
