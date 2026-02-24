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
   * Exporte le livre complet en fichier Markdown.
   * @param {string} title — Titre du livre
   */
  function exportMarkdown(title) {
    var text = Chapters.reassemble();
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