/**
 * chapters.js — Gestion des chapitres en mémoire et synchronisation avec IndexedDB.
 * Aucun accès DOM.
 * Expose : window.Chapters
 */
(function () {
  'use strict';

  /** Tableau interne des chapitres : [{ id, title, content }] */
  var _chapters = [];

  /** Index du chapitre courant */
  var _currentIndex = 0;

  /** UUID du projet en cours */
  var _projectUuid = null;

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Persiste les métadonnées des chapitres dans le projet.
   * Construit chaptersMeta à partir du tableau interne.
   */
  function _persistMeta() {
    var meta = _chapters.map(function (ch, i) {
      return { id: ch.id, title: ch.title, order: i };
    });

    return DB.loadProject(_projectUuid).then(function (project) {
      if (!project) {
        project = {
          uuid: _projectUuid,
          title: 'Mon livre',
          author: '',
          language: 'fr',
          chaptersMeta: []
        };
      }
      project.chaptersMeta = meta;
      return DB.saveProject(project);
    });
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Charge tous les chapitres d'un projet depuis IndexedDB.
   * Crée un chapitre par défaut si aucun n'existe.
   * @param {string} projectUuid
   * @returns {Promise<void>}
   */
  function loadAllChapters(projectUuid) {
    _projectUuid = projectUuid;

    return DB.loadProject(projectUuid).then(function (project) {
      if (!project || !project.chaptersMeta || project.chaptersMeta.length === 0) {
        // Créer un chapitre par défaut
        var chapterId = DB.generateUUID();
        var defaultChapter = { id: chapterId, title: 'Chapitre 1', content: '' };
        _chapters = [defaultChapter];
        _currentIndex = 0;

        return DB.saveChapter(chapterId, projectUuid, '').then(function () {
          return _persistMeta();
        });
      }

      // Trier par order croissant
      var sorted = project.chaptersMeta.slice().sort(function (a, b) {
        return a.order - b.order;
      });

      // Charger le contenu de chaque chapitre
      var promises = sorted.map(function (meta) {
        return DB.loadChapter(meta.id).then(function (content) {
          return { id: meta.id, title: meta.title, content: content || '' };
        });
      });

      return Promise.all(promises).then(function (chapters) {
        _chapters = chapters;
        _currentIndex = 0;
      });
    });
  }

  /**
   * Retourne le chapitre à l'index courant ou null.
   * @returns {object|null}
   */
  function getCurrentChapter() {
    return _chapters.length > 0 ? _chapters[_currentIndex] : null;
  }

  /**
   * Retourne l'index courant.
   * @returns {number}
   */
  function getCurrentIndex() {
    return _currentIndex;
  }

  /**
   * Retourne une copie superficielle du tableau de chapitres.
   * @returns {object[]}
   */
  function getAll() {
    return _chapters.slice();
  }

  /**
   * Retourne le nombre de chapitres.
   * @returns {number}
   */
  function getCount() {
    return _chapters.length;
  }

  /**
   * Met à jour le contenu du chapitre courant en mémoire (pas de persistance).
   * @param {string} content
   */
  function updateCurrentContent(content) {
    if (_chapters.length > 0 && _currentIndex >= 0 && _currentIndex < _chapters.length) {
      _chapters[_currentIndex].content = content;
    }
  }

  /**
   * Navigue vers un chapitre donné. Sauvegarde d'abord le chapitre courant.
   * @param {number} index
   * @returns {Promise<object>}
   */
  function navigateTo(index) {
    // Sauvegarder le chapitre courant
    var current = _chapters[_currentIndex];
    var savePromise = current
      ? DB.saveChapter(current.id, _projectUuid, current.content)
      : Promise.resolve();

    return savePromise.then(function () {
      _currentIndex = Math.max(0, Math.min(index, _chapters.length - 1));
      return _chapters[_currentIndex];
    });
  }

  /**
   * Crée un nouveau chapitre après l'index spécifié.
   * @param {number} afterIndex
   * @returns {Promise<number>} — Index du nouveau chapitre
   */
  function createChapter(afterIndex) {
    var newId = DB.generateUUID();
    var insertAt = Math.min(afterIndex + 1, _chapters.length);
    var title = 'Chapitre ' + (_chapters.length + 1);
    var newChapter = { id: newId, title: title, content: '' };

    _chapters.splice(insertAt, 0, newChapter);

    return DB.saveChapter(newId, _projectUuid, '').then(function () {
      return _persistMeta();
    }).then(function () {
      return insertAt;
    });
  }

  /**
   * Supprime un chapitre par son index.
   * Refuse de supprimer le dernier chapitre.
   * @param {number} index
   * @returns {Promise<number>} — Nouvel index courant
   */
  function deleteChapter(index) {
    if (_chapters.length <= 1) {
      return Promise.reject(new Error('Impossible de supprimer le dernier chapitre.'));
    }

    var chapterId = _chapters[index].id;
    _chapters.splice(index, 1);

    // Ajuster l'index courant
    if (index <= _currentIndex && _currentIndex > 0) {
      _currentIndex--;
    }
    _currentIndex = Math.max(0, Math.min(_currentIndex, _chapters.length - 1));

    return DB.deleteChapter(chapterId).then(function () {
      return _persistMeta();
    }).then(function () {
      return _currentIndex;
    });
  }

  /**
   * Renomme un chapitre.
   * @param {number} index
   * @param {string} newTitle
   * @returns {Promise<void>}
   */
  function renameChapter(index, newTitle) {
    var trimmed = (newTitle || '').trim();
    if (!trimmed) {
      return Promise.reject(new Error('Le titre ne peut pas être vide.'));
    }

    if (index >= 0 && index < _chapters.length) {
      _chapters[index].title = trimmed;
    }

    return _persistMeta();
  }

  /**
   * Déplace un chapitre de l'index source vers l'index destination.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {Promise<void>}
   */
  function moveChapter(fromIndex, toIndex) {
    // Mémoriser l'id du chapitre courant
    var currentId = _chapters[_currentIndex] ? _chapters[_currentIndex].id : null;

    // Retirer et réinsérer
    var moved = _chapters.splice(fromIndex, 1)[0];
    _chapters.splice(toIndex, 0, moved);

    // Retrouver l'index courant
    if (currentId) {
      for (var i = 0; i < _chapters.length; i++) {
        if (_chapters[i].id === currentId) {
          _currentIndex = i;
          break;
        }
      }
    }

    return _persistMeta();
  }

  /**
   * Découpe un texte Markdown en chapitres selon le délimiteur ####.
   * @param {string} text
   * @returns {{ title: string, content: string }[]}
   */
  function getChaptersFromMarkdown(text) {
    var result = [];
    var lines = text.split('\n');
    var currentTitle = null;
    var currentLines = [];
    var hasFoundFirst = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Vérifier si la ligne commence par #### suivi d'un espace
      if (/^#### /.test(line)) {
        // Sauvegarder le bloc précédent
        if (hasFoundFirst || currentLines.length > 0) {
          var content = currentLines.join('\n').trim();
          if (!hasFoundFirst && content) {
            // Texte avant le premier ####
            result.push({ title: 'Introduction', content: content });
          } else if (hasFoundFirst) {
            result.push({ title: currentTitle, content: content });
          }
        }
        // Nouveau chapitre
        currentTitle = line.replace(/^#### /, '').trim();
        currentLines = [];
        hasFoundFirst = true;
      } else {
        currentLines.push(line);
      }
    }

    // Dernier bloc
    if (hasFoundFirst) {
      result.push({ title: currentTitle, content: currentLines.join('\n').trim() });
    } else if (currentLines.length > 0) {
      var lastContent = currentLines.join('\n').trim();
      if (lastContent) {
        result.push({ title: 'Introduction', content: lastContent });
      }
    }

    // Si rien n'a été trouvé, créer un chapitre par défaut
    if (result.length === 0) {
      result.push({ title: 'Chapitre 1', content: '' });
    }

    return result;
  }

  /**
   * Reconstruit le texte complet du livre en concaténant tous les chapitres.
   * @returns {string}
   */
  function reassemble() {
    var parts = [];
    for (var i = 0; i < _chapters.length; i++) {
      var ch = _chapters[i];
      var content = (ch.content || '').trim();
      parts.push('#### ' + ch.title + '\n\n' + content);
    }
    return parts.join('\n\n');
  }

  /**
   * Remplace tous les chapitres depuis un texte Markdown importé.
   * @param {string} text
   * @param {string} projectUuid
   * @returns {Promise<number>} — Nombre de chapitres créés
   */
  function replaceAllFromMarkdown(text, projectUuid) {
    _projectUuid = projectUuid;
    var parsed = getChaptersFromMarkdown(text);
    var newChapters = [];
    var newIds = [];

    // Créer les nouveaux chapitres
    var savePromises = parsed.map(function (ch) {
      var id = DB.generateUUID();
      newIds.push(id);
      newChapters.push({ id: id, title: ch.title, content: ch.content });
      return DB.saveChapter(id, projectUuid, ch.content);
    });

    return Promise.all(savePromises).then(function () {
      _chapters = newChapters;
      _currentIndex = 0;

      // Supprimer les chapitres orphelins
      return DB.deleteOrphanChapters(projectUuid, newIds);
    }).then(function () {
      return _persistMeta();
    }).then(function () {
      return _chapters.length;
    });
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.Chapters = {
    loadAllChapters: loadAllChapters,
    getCurrentChapter: getCurrentChapter,
    getCurrentIndex: getCurrentIndex,
    getAll: getAll,
    getCount: getCount,
    updateCurrentContent: updateCurrentContent,
    navigateTo: navigateTo,
    createChapter: createChapter,
    deleteChapter: deleteChapter,
    renameChapter: renameChapter,
    moveChapter: moveChapter,
    getChaptersFromMarkdown: getChaptersFromMarkdown,
    reassemble: reassemble,
    replaceAllFromMarkdown: replaceAllFromMarkdown
  };

})();