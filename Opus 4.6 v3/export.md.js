/**
 * export.md.js — Export du livre complet en fichier Markdown.
 * Expose : window.ExportMD
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Nettoie un titre pour en faire un nom de fichier valide.
   * @param {string} title
   * @returns {string}
   */
  function sanitizeFilename(title) {
    if (!title || !title.trim()) return 'livre';
    return title
      .trim()
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  /**
   * Déclenche le téléchargement d'un Blob.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Exporte le livre complet en fichier Markdown avec les corrections de la preview.
   * @param {string} title — Titre du livre
   */
  function exportMarkdown(title) {
    var chapters = Chapters.getAll();
    var parts = [];

    // On assemble les chapitres en appliquant les corrections de la preview
    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      // On applique les corrections dédiées à la vue 'preview' (ou 'both')
      var corrected = Corrections.applyCorrections(ch.content || '', 'preview');
      var content = corrected.trim();
      parts.push('#### ' + ch.title + '\n\n' + content);
    }
    
    var text = parts.join('\n\n');

    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var filename = sanitizeFilename(title) + '.md';
    downloadBlob(blob, filename);

    if (typeof UI !== 'undefined' && UI.showStatus) {
      UI.showStatus('Export Markdown terminé.');
    }
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.ExportMD = {
    exportMarkdown: exportMarkdown
  };

})();