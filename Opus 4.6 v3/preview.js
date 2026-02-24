/**
 * preview.js — Prévisualisation HTML et synchronisation bidirectionnelle avec l'éditeur.
 * Centrage et highlight dans les deux panneaux.
 * Expose : window.Preview
 */
(function () {
  'use strict';

  /** Référence vers l'élément DOM de la preview */
  var _previewEl = null;

  /** Mutex de synchronisation pour empêcher les boucles */
  var _syncMutex = false;

  /** Timer pour le mutex (150ms) */
  var _mutexTimer = null;

  /** Timer pour le highlight */
  var _highlightTimer = null;

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Active le mutex de synchronisation pendant 150ms.
   */
  function activateMutex() {
    _syncMutex = true;
    if (_mutexTimer) clearTimeout(_mutexTimer);
    _mutexTimer = setTimeout(function () {
      _syncMutex = false;
    }, 150);
  }

  /**
   * Trouve l'élément de la preview correspondant à un numéro de ligne source.
   * Recherche l'élément dont data-source-line est le plus proche inférieur ou égal.
   * @param {number} lineNum
   * @returns {HTMLElement|null}
   */
  function findElementForLine(lineNum) {
    if (!_previewEl) return null;

    var elements = _previewEl.querySelectorAll('[data-source-line]');
    if (elements.length === 0) return null;

    var bestElement = null;
    var bestLine = -1;

    for (var i = 0; i < elements.length; i++) {
      var srcLine = parseInt(elements[i].getAttribute('data-source-line'), 10);
      if (!isNaN(srcLine) && srcLine <= lineNum && srcLine > bestLine) {
        bestLine = srcLine;
        bestElement = elements[i];
      }
    }

    return bestElement;
  }

  /**
   * Centre un élément dans la preview avec un défilement doux.
   * @param {HTMLElement} el
   */
  function centerElementInPreview(el) {
    if (!_previewEl || !el) return;

    var container = _previewEl.parentElement || _previewEl;
    // Chercher le conteneur scrollable (preview-container)
    var scrollContainer = _previewEl;
    while (scrollContainer && scrollContainer.scrollHeight <= scrollContainer.clientHeight && scrollContainer.parentElement) {
      scrollContainer = scrollContainer.parentElement;
      if (scrollContainer.id === 'preview-container') break;
    }
    if (!scrollContainer || scrollContainer === document.body) {
      scrollContainer = document.getElementById('preview-container') || _previewEl;
    }

    var elRect = el.getBoundingClientRect();
    var containerRect = scrollContainer.getBoundingClientRect();

    var elRelativeTop = elRect.top - containerRect.top + scrollContainer.scrollTop;
    var elMiddle = elRelativeTop + (elRect.height / 2);
    var targetScroll = elMiddle - (containerRect.height / 2);

    scrollContainer.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth'
    });
  }

  /**
   * Applique un highlight temporaire sur un élément de la preview.
   * @param {HTMLElement} el
   */
  function highlightElement(el) {
    if (!el) return;

    // Retirer le highlight précédent
    if (_highlightTimer) clearTimeout(_highlightTimer);
    var highlighted = _previewEl.querySelectorAll('.preview-sync-highlight, .preview-sync-fading');
    for (var i = 0; i < highlighted.length; i++) {
      highlighted[i].classList.remove('preview-sync-highlight');
      highlighted[i].classList.remove('preview-sync-fading');
    }

    // Appliquer le highlight
    el.classList.add('preview-sync-highlight');

    // Après 800ms, basculer en mode fade
    _highlightTimer = setTimeout(function () {
      el.classList.remove('preview-sync-highlight');
      el.classList.add('preview-sync-fading');

      // Après 800ms de fondu, retirer la classe
      setTimeout(function () {
        el.classList.remove('preview-sync-fading');
      }, 800);
    }, 800);
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Initialise le module Preview.
   * @param {HTMLElement} previewElement — L'élément DOM du contenu de la preview
   */
  function init(previewElement) {
    _previewEl = previewElement;

    // S'abonner aux clics de paragraphe de l'éditeur (éditeur → preview)
    Editor.onParagraphClick(function (block) {
      if (_syncMutex) return;
      activateMutex();

      // Utiliser la ligne de début du bloc pour trouver l'élément correspondant
      var el = findElementForLine(block.from);
      if (el) {
        centerElementInPreview(el);
        highlightElement(el);
      }
    });

    // Attacher un handler de clic sur la preview (preview → éditeur)
    var previewContainer = document.getElementById('preview-container');
    if (previewContainer) {
      previewContainer.addEventListener('click', function (e) {
        if (_syncMutex) return;
        activateMutex();

        // Remonter le DOM pour trouver un élément avec data-source-line
        var target = e.target;
        while (target && target !== previewContainer) {
          if (target.hasAttribute && target.hasAttribute('data-source-line')) {
            var lineNum = parseInt(target.getAttribute('data-source-line'), 10);
            if (!isNaN(lineNum)) {
              highlightElement(target);
              Editor.scrollToLineCentered(lineNum);
            }
            return;
          }
          target = target.parentElement;
        }
      });
    }
  }

  /**
   * Rend la preview à partir d'un texte Markdown.
   * Applique les plugins preview, convertit en HTML, sanitise et injecte.
   * @param {string} text
   */
  function renderPreview(text) {
    if (!_previewEl) return;

    // Appliquer les plugins de corrections ciblant preview
    var corrected = Corrections.applyCorrections(text || '', 'preview');

    // Convertir en HTML
    var html = Parser.renderToHTML(corrected);

    // Sanitiser via DOMPurify en autorisant data-source-line et target
    var clean = DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-source-line', 'target'],
      ALLOW_DATA_ATTR: true
    });

    // Injecter dans la preview
    _previewEl.innerHTML = clean;
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.Preview = {
    init: init,
    renderPreview: renderPreview
  };

})();