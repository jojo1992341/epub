/**
 * stats.js — Statistiques en temps réel.
 * Accède au DOM pour afficher les valeurs.
 * Expose : window.Stats
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Formate une taille en octets ou kilo-octets.
   * @param {number} bytes
   * @returns {string}
   */
  function formatSize(bytes) {
    if (bytes < 1024) {
      return bytes + ' o';
    }
    return (bytes / 1024).toFixed(1) + ' Ko';
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Compte le nombre de mots dans un texte, en nettoyant les éléments Markdown.
   * @param {string} text
   * @returns {number}
   */
  function countWords(text) {
    if (!text || typeof text !== 'string') return 0;

    var cleaned = text;

    // Retirer les blocs de code triple-backticks
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

    // Retirer le code inline
    cleaned = cleaned.replace(/`[^`\n]+`/g, '');

    // Retirer les images complètement
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

    // Conserver le texte des liens, retirer l'URL
    cleaned = cleaned.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Retirer les marques de titres (# au début de ligne)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // Retirer les caractères de formatage Markdown
    cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');  // Gras
    cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');      // Italique
    cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');           // Barré
    cleaned = cleaned.replace(/^>\s*/gm, '');                // Citations
    cleaned = cleaned.replace(/^[-*+]\s+/gm, '');           // Listes non ordonnées
    cleaned = cleaned.replace(/^\d+\.\s+/gm, '');           // Listes ordonnées
    cleaned = cleaned.replace(/^---+$/gm, '');              // Séparateurs
    cleaned = cleaned.replace(/^\|.*\|$/gm, '');            // Tableaux
    cleaned = cleaned.replace(/^[-|:\s]+$/gm, '');          // Lignes de séparation de tableaux

    // Nettoyer les espaces multiples et retours à la ligne
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (!cleaned) return 0;

    // Découper sur les espaces
    var words = cleaned.split(/\s+/).filter(function (w) {
      return w.length > 0;
    });

    return words.length;
  }

  /**
   * Met à jour toutes les statistiques affichées dans le footer.
   */
  function updateStats() {
    var chapters = Chapters.getAll();
    var current = Chapters.getCurrentChapter();
    var chapterCount = chapters.length;

    // Mots du chapitre courant
    var currentWords = current ? countWords(current.content) : 0;

    // Mots total et taille totale
    var totalWords = 0;
    var totalSize = 0;
    for (var i = 0; i < chapters.length; i++) {
      var content = chapters[i].content || '';
      totalWords += countWords(content);
      totalSize += new Blob([content]).size;
    }

    // Mise à jour du DOM
    var elChapters = document.getElementById('stat-chapters');
    var elWordsChapter = document.getElementById('stat-words-chapter');
    var elWordsTotal = document.getElementById('stat-words-total');
    var elSize = document.getElementById('stat-size');

    if (elChapters) elChapters.textContent = 'Chapitres : ' + chapterCount;
    if (elWordsChapter) elWordsChapter.textContent = 'Mots (chapitre) : ' + currentWords;
    if (elWordsTotal) elWordsTotal.textContent = 'Mots (total) : ' + totalWords;
    if (elSize) elSize.textContent = 'Taille : ' + formatSize(totalSize);
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.Stats = {
    countWords: countWords,
    updateStats: updateStats
  };

})();