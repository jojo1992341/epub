/**
 * db.js — Module de persistance IndexedDB
 * Seul module autorisé à accéder à IndexedDB.
 * Expose : window.DB
 */
(function () {
  'use strict';

  var _db = null;

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function txHelper(storeName, mode) {
    var tx = _db.transaction(storeName, mode);
    var store = tx.objectStore(storeName);
    var done = new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Transaction annulée')); };
    });
    return { store: store, done: done };
  }

  function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise(function (resolve, reject) {
      try {
        var request = indexedDB.open('markdown-book-editor', 2);

        request.onupgradeneeded = function (event) {
          var db = event.target.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'uuid' });
          }
          if (!db.objectStoreNames.contains('chapters')) {
            var chaptersStore = db.createObjectStore('chapters', { keyPath: 'id' });
            chaptersStore.createIndex('by_project', 'projectUuid', { unique: false });
          }
          if (!db.objectStoreNames.contains('plugins')) {
            db.createObjectStore('plugins', { keyPath: 'id' });
          }
        };

        request.onsuccess = function (event) {
          _db = event.target.result;
          _db.onversionchange = function () { _db.close(); _db = null; };
          resolve(_db);
        };

        request.onerror = function () {
          reject(new Error('Impossible d\'ouvrir IndexedDB : ' + (request.error ? request.error.message : 'erreur inconnue')));
        };

        request.onblocked = function () {
          reject(new Error('L\'accès à IndexedDB est bloqué. Fermez les autres onglets.'));
        };
      } catch (e) {
        reject(new Error(
          'IndexedDB n\'est pas disponible. Si vous utilisez Firefox, ouvrez via http://localhost.'
        ));
      }
    });
  }

  function getOrCreateProjectUuid() {
    var h = txHelper('projects', 'readonly');
    var getAllReq = h.store.getAll();
    return new Promise(function (resolve, reject) {
      getAllReq.onsuccess = function () {
        var projects = getAllReq.result;
        if (projects && projects.length > 0) {
          resolve(projects[0].uuid);
        } else {
          var newProject = {
            uuid: generateUUID(), title: 'Mon livre', author: '', language: 'fr', chaptersMeta: []
          };
          saveProject(newProject).then(function () { resolve(newProject.uuid); }).catch(reject);
        }
      };
      getAllReq.onerror = function () { reject(getAllReq.error); };
    });
  }

  function saveProject(projectMeta) {
    var h = txHelper('projects', 'readwrite');
    h.store.put(projectMeta);
    return h.done;
  }

  function loadProject(uuid) {
    var h = txHelper('projects', 'readonly');
    var getReq = h.store.get(uuid);
    return new Promise(function (resolve, reject) {
      getReq.onsuccess = function () { resolve(getReq.result || null); };
      getReq.onerror = function () { reject(getReq.error); };
    });
  }

  function saveChapter(id, projectUuid, content) {
    var h = txHelper('chapters', 'readwrite');
    h.store.put({ id: id, projectUuid: projectUuid, content: content });
    return h.done;
  }

  function loadChapter(id) {
    var h = txHelper('chapters', 'readonly');
    var getReq = h.store.get(id);
    return new Promise(function (resolve, reject) {
      getReq.onsuccess = function () { resolve(getReq.result ? getReq.result.content : ''); };
      getReq.onerror = function () { reject(getReq.error); };
    });
  }

  function deleteChapter(id) {
    var h = txHelper('chapters', 'readwrite');
    h.store.delete(id);
    return h.done;
  }

  function deleteOrphanChapters(projectUuid, validIds) {
    return new Promise(function (resolve, reject) {
      var tx = _db.transaction('chapters', 'readwrite');
      var store = tx.objectStore('chapters');
      var index = store.index('by_project');
      var request = index.openCursor(IDBKeyRange.only(projectUuid));
      request.onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          if (validIds.indexOf(cursor.value.id) === -1) cursor.delete();
          cursor.continue();
        }
      };
      request.onerror = function () { reject(request.error); };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function savePlugin(plugin) {
    var h = txHelper('plugins', 'readwrite');
    h.store.put(plugin);
    return h.done;
  }

  function loadAllPlugins() {
    var h = txHelper('plugins', 'readonly');
    var getAllReq = h.store.getAll();
    return new Promise(function (resolve, reject) {
      getAllReq.onsuccess = function () {
        var plugins = getAllReq.result || [];
        plugins.sort(function (a, b) { return a.order - b.order; });
        resolve(plugins);
      };
      getAllReq.onerror = function () { reject(getAllReq.error); };
    });
  }

  function deletePlugin(id) {
    var h = txHelper('plugins', 'readwrite');
    h.store.delete(id);
    return h.done;
  }

  window.DB = {
    generateUUID: generateUUID,
    openDB: openDB,
    getOrCreateProjectUuid: getOrCreateProjectUuid,
    saveProject: saveProject,
    loadProject: loadProject,
    saveChapter: saveChapter,
    loadChapter: loadChapter,
    deleteChapter: deleteChapter,
    deleteOrphanChapters: deleteOrphanChapters,
    savePlugin: savePlugin,
    loadAllPlugins: loadAllPlugins,
    deletePlugin: deletePlugin
  };

})();