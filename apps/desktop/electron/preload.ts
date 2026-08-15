import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("zlog", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke("config:save", cfg),
  runSyncNow: () => ipcRenderer.invoke("sync:now"),
  getSyncStatus: () => ipcRenderer.invoke("sync:status"),
  openDataDir: () => ipcRenderer.invoke("app:openDataDir"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  quit: () => ipcRenderer.invoke("app:quit"),
  getLang: () => ipcRenderer.invoke("lang:get"),
  setLang: (pref: string) => ipcRenderer.invoke("lang:set", pref),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: (url: string) => ipcRenderer.invoke("update:download", url),
  openUpdate: (dest: string) => ipcRenderer.invoke("update:open", dest),
  onUpdateProgress: (cb: (p: { percent: number }) => void) => {
    const listener = (_e: unknown, p: { percent: number }) => cb(p)
    ipcRenderer.on("update:progress", listener)
    return () => ipcRenderer.removeListener("update:progress", listener)
  },
})
