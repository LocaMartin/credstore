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
})
