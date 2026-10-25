import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'

const INBOX_ROUTE = '/__dev-inbox'

export interface DevImportItemResult {
  source: string
  imported: { id: string; fileName: string }[]
  error: string | null
}

export interface DevImportApi {
  (sources: string | string[]): Promise<DevImportItemResult[]>
  list: () => Promise<{ dir: string; files: { name: string; size: number }[] }>
}

function resolveSourceUrl(source: string): string {
  const trimmed = source.trim()
  const path = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${INBOX_ROUTE}/${encodeURIComponent(trimmed)}`
  return new URL(path, window.location.origin).toString()
}

async function importOne(source: string): Promise<DevImportItemResult> {
  const store = useMediaLibraryStore.getState()
  const items = await store.importMediaFromUrl(resolveSourceUrl(source))
  const error = useMediaLibraryStore.getState().error

  if (items.length > 0) {
    return {
      source,
      imported: items.map((item) => ({ id: item.id, fileName: item.fileName })),
      error: null,
    }
  }
  return { source, imported: [], error: error ?? 'Nothing imported (already in this project?)' }
}

export function initializeDevImport(): void {
  if (!import.meta.env.DEV) return

  const devImport = (async (sources: string | string[]) => {
    const results: DevImportItemResult[] = []
    for (const source of Array.isArray(sources) ? sources : [sources]) {
      results.push(await importOne(source))
    }
    return results
  }) as DevImportApi

  devImport.list = async () => {
    const response = await fetch(`${INBOX_ROUTE}/`)
    if (!response.ok) throw new Error(`dev inbox unavailable (${response.status})`)
    return response.json()
  }

  window.__devImport = devImport
}

declare global {
  interface Window {
    __devImport?: DevImportApi
  }
}
