/**
 * editor.js — Encapsulation de CodeMirror 5.
 * Seul module autorisé à écrire dans le DOM éditeur.
 * Expose : window.Editor
 */
(function () {
  'use strict';

  /** L'instance CodeMirror */
  var _cm = null;

  /** UUID du projet courant */
  var _projectUuid = null;

  /** Timer pour le debounce de sauvegarde (500ms) */
  var _saveTimer = null;

  /** Timer pour le debounce de preview (280ms) */
  var _previewTimer = null;

  /** Callback pour les mouvements de curseur */
  var _onCursorMoveCb = null;

  /** Callback pour les clics de paragraphe */
  var _onParagraphClickCb = null;

  /** Taille de police courante en pixels */
  var _fontSize = 16;

  /** Timer pour le highlight */
  var _highlightTimer = null;
  var _highlightFadeTimer = null;

  /** Flag interne pour ignorer les changements lors de setContent */
  var _ignoreChanges = false;

  /** Marks de synchronisation courants */
  var _syncMarks = [];

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Trouve le bloc de paragraphe (lignes non vides contiguës) contenant une ligne donnée.
   * @param {number} lineNum
   * @returns {{ from: number, to: number }|null}
   */
  function findParagraphBlock(lineNum) {
    if (!_cm) return null;
    var totalLines = _cm.lineCount();
    if (lineNum < 0 || lineNum >= totalLines) return null;

    // Vérifier que la ligne n'est pas vide
    var lineText = _cm.getLine(lineNum);
    if (lineText === null || lineText.trim() === '') return null;

    // Remonter tant que la ligne précédente n'est pas vide
    var from = lineNum;
    while (from > 0) {
      var prevLine = _cm.getLine(from - 1);
      if (prevLine === null || prevLine.trim() === '') break;
      from--;
    }

    // Descendre tant que la ligne suivante n'est pas vide
    var to = lineNum;
    while (to < totalLines - 1) {
      var nextLine = _cm.getLine(to + 1);
      if (nextLine === null || nextLine.trim() === '') break;
      to++;
    }

    return { from: from, to: to };
  }

  /**
   * Centre un bloc de lignes dans la vue de l'éditeur.
   * @param {{ from: number, to: number }} block
   */
  function centerBlockInView(block) {
    if (!_cm) return;

    var midLine = Math.floor((block.from + block.to) / 2);
    var coords = _cm.charCoords({ line: midLine, ch: 0 }, 'local');
    var scrollInfo = _cm.getScrollInfo();
    var viewportHeight = scrollInfo.clientHeight;

    var targetScroll = coords.top - (viewportHeight / 2) + 10;
    _cm.scrollTo(null, Math.max(0, targetScroll));
  }

  /**
   * Applique un highlight visuel temporaire sur un bloc de lignes dans l'éditeur.
   * @param {{ from: number, to: number }} block
   */
  function highlightBlock(block) {
    // Nettoyer les marks précédents
    clearSyncMarks();

    if (_highlightTimer) {
      clearTimeout(_highlightTimer);
      _highlightTimer = null;
    }
    if (_highlightFadeTimer) {
      clearTimeout(_highlightFadeTimer);
      _highlightFadeTimer = null;
    }

    // Créer les marks avec la classe highlight
    for (var i = block.from; i <= block.to; i++) {
      var lineLength = (_cm.getLine(i) || '').length;
      if (lineLength > 0) {
        var mark = _cm.markText(
          { line: i, ch: 0 },
          { line: i, ch: lineLength },
          { className: 'sync-highlight' }
        );
        _syncMarks.push(mark);
      }
    }

    // Après 800ms, passer en mode fade
    _highlightTimer = setTimeout(function () {
      clearSyncMarks();

      for (var j = block.from; j <= block.to; j++) {
        var len = (_cm.getLine(j) || '').length;
        if (len > 0) {
          var fadeMark = _cm.markText(
            { line: j, ch: 0 },
            { line: j, ch: len },
            { className: 'sync-fade' }
          );
          _syncMarks.push(fadeMark);
        }
      }

      // Après 800ms supplémentaires, retirer tous les marks
      _highlightFadeTimer = setTimeout(function () {
        clearSyncMarks();
      }, 800);
    }, 800);
  }

  /**
   * Retire tous les marks de synchronisation.
   */
  function clearSyncMarks() {
    for (var i = 0; i < _syncMarks.length; i++) {
      _syncMarks[i].clear();
    }
    _syncMarks = [];
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Initialise l'éditeur CodeMirror.
   * @param {HTMLElement} container — Élément DOM conteneur
   * @param {string} projectUuid
   */
  function init(container, projectUuid) {
    _projectUuid = projectUuid;

    _cm = CodeMirror(container, {
      mode: 'markdown',
      lineWrapping: true,
      lineNumbers: false,
      theme: 'default',
      autofocus: false,
      indentWithTabs: false,
      tabSize: 2,
      indentUnit: 2
    });

    // Handler sur change
    _cm.on('change', function () {
      if (_ignoreChanges) return;

      var content = _cm.getValue();

      // Debounce sauvegarde (500ms)
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        Chapters.updateCurrentContent(content);
        var current = Chapters.getCurrentChapter();
        if (current) {
          DB.saveChapter(current.id, _projectUuid, content).then(function () {
            UI.setAutosaveState('saved');
          });
        }
        Stats.updateStats();
      }, 500);

      // Debounce preview (280ms)
      if (_previewTimer) clearTimeout(_previewTimer);
      _previewTimer = setTimeout(function () {
        Preview.renderPreview(content);
      }, 280);

      // Indicateur autosave immédiat
      UI.setAutosaveState('saving');
    });

    // Handler cursorActivity
    _cm.on('cursorActivity', function () {
      if (_onCursorMoveCb) {
        var cursor = _cm.getCursor();
        _onCursorMoveCb(cursor.line);
      }
    });

    // Handler mousedown
    _cm.on('mousedown', function () {
      setTimeout(function () {
        var cursor = _cm.getCursor();
        var block = findParagraphBlock(cursor.line);
        if (block && _onParagraphClickCb) {
          _onParagraphClickCb(block);
          centerBlockInView(block);
          highlightBlock(block);
        }
      }, 10);
    });
  }

  /**
   * Met à jour le UUID du projet courant.
   * @param {string} uuid
   */
  function setProjectUuid(uuid) {
    _projectUuid = uuid;
  }

  /**
   * Injecte un contenu dans l'éditeur en appliquant les plugins éditeur.
   * @param {string} content
   */
  function setContent(content) {
    if (!_cm) return;

    // Appliquer les plugins ciblant editor
    var processed = Corrections.applyCorrections(content, 'editor');

    // Injecter sans déclencher le handler change
    _ignoreChanges = true;
    _cm.setValue(processed);
    _ignoreChanges = false;

    // Si le texte a été modifié par les plugins, persister
    if (processed !== content) {
      Chapters.updateCurrentContent(processed);
      var current = Chapters.getCurrentChapter();
      if (current) {
        DB.saveChapter(current.id, _projectUuid, processed);
      }
    }

    // Effacer l'historique d'annulation
    _cm.clearHistory();
  }

  /**
   * Retourne le contenu actuel de l'éditeur.
   * @returns {string}
   */
  function getContent() {
    return _cm ? _cm.getValue() : '';
  }

  /**
   * Donne le focus à l'éditeur.
   */
  function focus() {
    if (_cm) _cm.focus();
  }

  /**
   * Force le rafraîchissement de l'affichage.
   */
  function refresh() {
    if (_cm) _cm.refresh();
  }

  /**
   * Fait défiler et centre une ligne donnée dans l'éditeur.
   * @param {number} lineNum
   */
  function scrollToLine(lineNum) {
    scrollToLineCentered(lineNum);
  }

  /**
   * Fait défiler vers une ligne, centre le bloc de paragraphe et applique le highlight.
   * @param {number} lineNum
   */
  function scrollToLineCentered(lineNum) {
    if (!_cm) return;

    var block = findParagraphBlock(lineNum);
    if (block) {
      centerBlockInView(block);
      highlightBlock(block);
    }
  }

  /**
   * Enregistre un callback pour les mouvements de curseur.
   * @param {function} cb
   */
  function onCursorMove(cb) {
    _onCursorMoveCb = cb;
  }

  /**
   * Enregistre un callback pour les clics de paragraphe.
   * @param {function} cb — Reçoit un objet { from, to }
   */
  function onParagraphClick(cb) {
    _onParagraphClickCb = cb;
  }

  /**
   * Définit la taille de police de l'éditeur.
   * @param {number} size — Taille en pixels
   */
  function setFontSize(size) {
    _fontSize = size;
    if (_cm) {
      _cm.getWrapperElement().style.fontSize = size + 'px';
      _cm.refresh();
    }
  }

  /**
   * Retourne la taille de police courante.
   * @returns {number}
   */
  function getFontSize() {
    return _fontSize;
  }

  /**
   * Applique le thème clair ou sombre sur l'éditeur.
   * @param {boolean} isDark
   */
  function setTheme(isDark) {
    if (!_cm) return;
    // Le CSS gère le thème via body.dark-theme, on force un rafraîchissement
    _cm.refresh();
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.Editor = {
    init: init,
    setProjectUuid: setProjectUuid,
    setContent: setContent,
    getContent: getContent,
    focus: focus,
    refresh: refresh,
    scrollToLine: scrollToLine,
    scrollToLineCentered: scrollToLineCentered,
    onCursorMove: onCursorMove,
    onParagraphClick: onParagraphClick,
    setFontSize: setFontSize,
    getFontSize: getFontSize,
    setTheme: setTheme
  };

})();