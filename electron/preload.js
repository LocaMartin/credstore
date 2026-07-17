const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("credstoreWindow", {
  minimize: () => ipcRenderer.invoke("credstore:window-control", "minimize"),
  maximize: () => ipcRenderer.invoke("credstore:window-control", "maximize"),
  close: () => ipcRenderer.invoke("credstore:window-control", "close"),
})

contextBridge.exposeInMainWorld("credstoreNative", {
  biometric: {
    isAvailable: () => ipcRenderer.invoke("credstore:biometric:is-available"),
    createSecret: (options) => ipcRenderer.invoke("credstore:biometric:create-secret", options),
    getSecret: (options) => ipcRenderer.invoke("credstore:biometric:get-secret", options),
  },
  bluetooth: {
    isAvailable: () => ipcRenderer.invoke("credstore:bluetooth:is-available"),
  },
  localSync: {
    isAvailable: () => ipcRenderer.invoke("credstore:local-sync:is-available"),
    discoverReceivers: (options) => ipcRenderer.invoke("credstore:local-sync:discover-receivers", options),
    startReceiver: (options) => ipcRenderer.invoke("credstore:local-sync:start-receiver", options),
    sendPayload: (options) => ipcRenderer.invoke("credstore:local-sync:send-payload", options),
    stopReceiver: () => ipcRenderer.invoke("credstore:local-sync:stop-receiver"),
  },
})
