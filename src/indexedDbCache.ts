interface CachedArchive {
  key: string
  files: Array<{
    path: string
    content: Uint8Array
    size: number
  }>
  timestamp: number
}

class ArchiveCache {
  private dbName = 'twitter-archive-cache'
  private version = 1
  private storeName = 'archives'
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' })
        }
      }
    })
  }

  async generateKey(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async save(key: string, files: Array<{ path: string, content: Uint8Array, size: number }>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    const startTime = performance.now()
    const transaction = this.db.transaction([this.storeName], 'readwrite')
    const store = transaction.objectStore(this.storeName)
    
    const cachedArchive: CachedArchive = {
      key,
      files,
      timestamp: Date.now()
    }
    
    return new Promise((resolve, reject) => {
      const request = store.put(cachedArchive)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const duration = performance.now() - startTime
        console.log(`IndexedDB save took ${duration.toFixed(2)}ms for ${files.length} files`)
        resolve()
      }
    })
  }

  async get(key: string): Promise<Array<{ path: string, content: Uint8Array, size: number }> | null> {
    if (!this.db) throw new Error('Database not initialized')
    
    const startTime = performance.now()
    const transaction = this.db.transaction([this.storeName], 'readonly')
    const store = transaction.objectStore(this.storeName)
    
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const duration = performance.now() - startTime
        const result = request.result as CachedArchive | undefined
        const files = result ? result.files : null
        console.log(`IndexedDB get took ${duration.toFixed(2)}ms ${files ? `for ${files.length} files` : '(cache miss)'}`)
        resolve(files)
      }
    })
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    const transaction = this.db.transaction([this.storeName], 'readwrite')
    const store = transaction.objectStore(this.storeName)
    
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

export const archiveCache = new ArchiveCache()