import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("zlog", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke("config:save", cfg),
  runSyncNow: () => ipcRenderer.invoke("sync:now"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  openDataDir: () => ipcRenderer.invoke("app:openDataDir"),
  quit: () => ipcRenderer.invoke("app:quit"),
})
