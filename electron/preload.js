const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("credstoreWindow", {
  minimize: () => ipcRenderer.invoke("credstore:window-control", "minimize"),
  maximize: () => ipcRenderer.invoke("credstore:window-control", "maximize"),
  close: () => ipcRenderer.invoke("credstore:window-control", "close"),
})
