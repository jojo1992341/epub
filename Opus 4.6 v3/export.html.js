/**
 * export.html.js — Export du livre complet en fichier HTML autonome avec table des matières.
 * Expose : window.ExportHTML
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function sanitizeFilename(title) {
    if (!title || !title.trim()) return 'livre';
    return title.trim().replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

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

  function stripSourceLineAttrs(html) {
    return html.replace(/\s*data-source-line="\d+"/g, '');
  }

  function buildFullDocument(meta, bodyContent) {
    var title = escapeHtml(meta.title || 'Mon livre');
    var author = escapeHtml(meta.author || '');
    var lang = escapeHtml(meta.language || 'fr');

    return '<!DOCTYPE html>\n' +
      '<html lang="' + lang + '">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>' + title + '</title>\n' +
      '  <style>\n' +
      '    body {\n' +
      '      font-family: Georgia, "Times New Roman", serif;\n' +
      '      background: #f5f0e1;\n' +
      '      color: #3b2a1a;\n' +
      '      max-width: 700px;\n' +
      '      margin: 0 auto;\n' +
      '      padding: 40px 30px;\n' +
      '      line-height: 1.8;\n' +
      '    }\n' +
      '    h1, h2, h3, h4 { color: #b8860b; font-family: Georgia, "Times New Roman", serif; margin-top: 1.6em; margin-bottom: 0.5em; }\n' +
      '    h1 { text-align: center; border-bottom: 2px solid #b8860b; padding-bottom: 0.3em; font-size: 1.8em; }\n' +
      '    p { text-align: justify; text-indent: 1.5em; margin-bottom: 0.6em; }\n' +
      '    h1 + p, h2 + p, h3 + p, h4 + p { text-indent: 0; }\n' +
      '    blockquote { margin: 1em 0 1em 1.5em; padding: 0.5em 0 0.5em 1em; border-left: 3px solid #b8860b; color: #6b5440; font-style: italic; }\n' +
      '    pre { background: #ebe3d0; padding: 12px 16px; border-radius: 5px; overflow-x: auto; }\n' +
      '    code { background: #ebe3d0; padding: 2px 5px; border-radius: 3px; font-family: "Courier New", Courier, monospace; font-size: 0.9em; }\n' +
      '    pre code { background: transparent; padding: 0; }\n' +
      '    a { color: #a0522d; }\n' +
      '    table { width: 100%; border-collapse: collapse; margin: 1em 0; }\n' +
      '    th, td { border: 1px solid #c4b38a; padding: 8px 10px; }\n' +
      '    thead th { background: #ebe3d0; }\n' +
      '    hr { border: none; border-top: 1px solid #c4b38a; margin: 1.5em 0; }\n' +
      '    hr.chapter-separator { border-top-width: 3px; border-top-color: #b8860b; width: 60%; margin-left: auto; margin-right: auto; }\n' +
      '    img { max-width: 100%; height: auto; }\n' +
      '    .chapter-section { margin-bottom: 3em; }\n' +
      (author ? '    .book-author { text-align: center; color: #6b5440; font-style: italic; margin-bottom: 2em; text-indent: 0; }\n' : '') +
      '    nav.toc { margin: 2em 0; padding: 1.5em; background: #ebe3d0; border-radius: 6px; border: 1px solid #c4b38a; }\n' +
      '    nav.toc h2 { text-align: center; margin-top: 0; font-size: 1.3em; }\n' +
      '    nav.toc ol { padding-left: 1.5em; }\n' +
      '    nav.toc li { margin: 0.4em 0; }\n' +
      '    nav.toc a { color: #a0522d; text-decoration: none; }\n' +
      '    nav.toc a:hover { text-decoration: underline; }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      bodyContent +
      '</body>\n' +
      '</html>';
  }

  function exportHTML(meta) {
    var chapters = Chapters.getAll();
    var bodyParts = [];

    // Titre du livre
    bodyParts.push('<h1>' + escapeHtml(meta.title || 'Mon livre') + '</h1>');
    if (meta.author) {
      bodyParts.push('<p class="book-author">' + escapeHtml(meta.author) + '</p>');
    }

    // Table des matières
    bodyParts.push('<nav class="toc">');
    bodyParts.push('  <h2>Table des matières</h2>');
    bodyParts.push('  <ol>');
    for (var t = 0; t < chapters.length; t++) {
      bodyParts.push('    <li><a href="#chapter-' + (t + 1) + '">' + escapeHtml(chapters[t].title) + '</a></li>');
    }
    bodyParts.push('  </ol>');
    bodyParts.push('</nav>');

    // Chapitres
    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      var corrected = Corrections.applyCorrections(ch.content || '', 'preview');
      var html = Parser.renderToHTML(corrected);
      html = stripSourceLineAttrs(html);

      bodyParts.push('<section class="chapter-section" id="chapter-' + (i + 1) + '">');
      bodyParts.push('<h2>' + escapeHtml(ch.title) + '</h2>');
      bodyParts.push(html);
      bodyParts.push('</section>');
    }

    var bodyContent = bodyParts.join('\n');
    var fullDoc = buildFullDocument(meta, bodyContent);

    var blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    var filename = sanitizeFilename(meta.title) + '.html';
    downloadBlob(blob, filename);

    if (typeof UI !== 'undefined' && UI.showStatus) {
      UI.showStatus('Export HTML terminé.');
    }
  }

  window.ExportHTML = { exportHTML: exportHTML };
})();