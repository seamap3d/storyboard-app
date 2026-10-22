// IndexedDB stores structured storyboard documents without localStorage's small
// string quota. Callers retain their in-memory draft if a transaction fails.
const DATABASE = 'apeOnAWhaleDrafts';
let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Draft database is blocked by another tab.'));
  }).catch(error => { database = null; throw error; });
  return database;
}
export async function readDraft() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readonly');
    const request = transaction.objectStore('drafts').get('browser-draft');
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Draft read failed.'));
  });
}
export async function writeDraft(data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put(data, 'browser-draft');
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Draft save failed.'));
  });
}
