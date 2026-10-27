/**
 * Auto OPFS workspace
 *
 * Browsers expire File System Access folder permission between sessions, which
 * shows the "Reconnect your workspace" splash and needs a human click on a
 * native prompt. That blocks unattended use (automation, kiosks, CI previews).
 *
 * When enabled, WorkspaceGate falls back to the Origin Private File System
 * (OPFS) as the workspace instead of the splash. OPFS handles are always
 * readable/writable, so no folder picker or permission prompt is ever needed.
 * Files live inside the browser profile for this origin (not a visible
 * folder), and previously picked folder workspaces stay in the known-
 * workspaces list so the user can switch back to them.
 *
 * Enable with `VITE_AUTO_OPFS_WORKSPACE=1` at build/dev time, or by adding
 * `?workspace=opfs` to the URL (remembered in localStorage).
 */

const OPFS_WORKSPACE_DIR = 'freecut-workspace'
const STORAGE_FLAG = 'freecut:auto-opfs-workspace'

export function isAutoOpfsWorkspaceEnabled(): boolean {
  const envFlag = import.meta.env.VITE_AUTO_OPFS_WORKSPACE
  if (envFlag === '1' || envFlag === 'true') return true
  if (typeof window === 'undefined') return false
  try {
    const param = new URLSearchParams(window.location.search).get('workspace')
    if (param === 'opfs') {
      window.localStorage.setItem(STORAGE_FLAG, '1')
      return true
    }
    if (param === 'folder') {
      window.localStorage.removeItem(STORAGE_FLAG)
      return false
    }
    return window.localStorage.getItem(STORAGE_FLAG) === '1'
  } catch {
    return false
  }
}

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

/** Return the OPFS workspace directory, creating it on first use. */
export async function getOpfsWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null
  const root = await navigator.storage.getDirectory()
  const handle = await root.getDirectoryHandle(OPFS_WORKSPACE_DIR, { create: true })
  try {
    // Ask the browser not to evict this origin's storage under pressure.
    await navigator.storage.persist?.()
  } catch {
    // Best effort only.
  }
  return handle
}
