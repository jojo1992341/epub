/**
 * export.epub.js — Export EPUB 3 avec compatibilité EPUB 2 (NCX).
 * Inclut une table des matières dans le spine.
 * Expose : window.ExportEPUB
 */
(function () {
  'use strict';

  function escapeXml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function sanitizeFilename(title) {
    if (!title || !title.trim()) return 'livre';
    return title.trim().replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function pad3(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }

  function getISODate() {
    var d = new Date();
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0') + 'T' +
      String(d.getUTCHours()).padStart(2, '0') + ':' +
      String(d.getUTCMinutes()).padStart(2, '0') + ':' +
      String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
  }

  function generateContainer() {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '  <rootfiles>\n' +
      '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
      '  </rootfiles>\n' +
      '</container>';
  }

  function wrapXhtml(title, body, lang) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + escapeXml(lang) + '" lang="' + escapeXml(lang) + '">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8" />\n' +
      '  <title>' + escapeXml(title) + '</title>\n' +
      '  <link rel="stylesheet" type="text/css" href="style.css" />\n' +
      '</head>\n' +
      '<body>\n' + body + '\n</body>\n</html>';
  }

  function generateTitlePage(title, author, lang) {
    var body = '<div class="title-page">\n  <h1 class="book-title">' + escapeXml(title) + '</h1>\n';
    if (author) body += '  <p class="book-author">' + escapeXml(author) + '</p>\n';
    body += '</div>';
    return wrapXhtml(title, body, lang);
  }

  function generateTocXhtml(chapters, lang) {
    var body = '<nav epub:type="toc" id="toc">\n  <h1>Table des matières</h1>\n  <ol>\n';
    for (var i = 0; i < chapters.length; i++) {
      body += '    <li><a href="' + chapters[i].filename + '">' + escapeXml(chapters[i].title) + '</a></li>\n';
    }
    body += '  </ol>\n</nav>';
    return wrapXhtml('Table des matières', body, lang);
  }

  function generateTocNcx(bookUuid, title, chapters) {
    var ncx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '  <head>\n' +
      '    <meta name="dtb:uid" content="' + escapeXml(bookUuid) + '" />\n' +
      '    <meta name="dtb:depth" content="1" />\n' +
      '    <meta name="dtb:totalPageCount" content="0" />\n' +
      '    <meta name="dtb:maxPageNumber" content="0" />\n' +
      '  </head>\n' +
      '  <docTitle><text>' + escapeXml(title) + '</text></docTitle>\n' +
      '  <navMap>\n';
    for (var i = 0; i < chapters.length; i++) {
      ncx += '    <navPoint id="navpoint-' + (i + 1) + '" playOrder="' + (i + 1) + '">\n' +
        '      <navLabel><text>' + escapeXml(chapters[i].title) + '</text></navLabel>\n' +
        '      <content src="' + chapters[i].filename + '" />\n' +
        '    </navPoint>\n';
    }
    ncx += '  </navMap>\n</ncx>';
    return ncx;
  }

  function generateContentOpf(bookUuid, meta, isoDate, chapters) {
    var opf = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">\n' +
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '    <dc:identifier id="bookid">' + escapeXml(bookUuid) + '</dc:identifier>\n' +
      '    <dc:title>' + escapeXml(meta.title || 'Mon livre') + '</dc:title>\n' +
      '    <dc:creator>' + escapeXml(meta.author || '') + '</dc:creator>\n' +
      '    <dc:language>' + escapeXml(meta.language || 'fr') + '</dc:language>\n' +
      '    <dc:date>' + isoDate.split('T')[0] + '</dc:date>\n' +
      '    <meta property="dcterms:modified">' + isoDate + '</meta>\n' +
      '  </metadata>\n' +
      '  <manifest>\n' +
      '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />\n' +
      '    <item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav" />\n' +
      '    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml" />\n' +
      '    <item id="stylesheet" href="style.css" media-type="text/css" />\n';
    for (var i = 0; i < chapters.length; i++) {
      opf += '    <item id="' + chapters[i].id + '" href="' + chapters[i].filename + '" media-type="application/xhtml+xml" />\n';
    }
    opf += '  </manifest>\n' +
      '  <spine toc="ncx">\n' +
      '    <itemref idref="title-page" />\n' +
      '    <itemref idref="nav" />\n';
    for (var j = 0; j < chapters.length; j++) {
      opf += '    <itemref idref="' + chapters[j].id + '" />\n';
    }
    opf += '  </spine>\n</package>';
    return opf;
  }

  function generateStylesheet() {
    return 'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.8; color: #3b2a1a; margin: 1em; }\n' +
      'h1, h2, h3, h4 { color: #b8860b; font-family: Georgia, "Times New Roman", serif; margin-top: 1.5em; margin-bottom: 0.5em; }\n' +
      'h1 { text-align: center; font-size: 1.8em; border-bottom: 2px solid #b8860b; padding-bottom: 0.3em; }\n' +
      'h2 { font-size: 1.4em; } h3 { font-size: 1.2em; } h4 { font-size: 1.05em; }\n' +
      'p { text-align: justify; text-indent: 1.5em; margin-bottom: 0.5em; margin-top: 0; }\n' +
      'h1 + p, h2 + p, h3 + p, h4 + p { text-indent: 0; }\n' +
      'blockquote { margin: 1em 0 1em 1.5em; padding: 0.5em 0 0.5em 1em; border-left: 3px solid #b8860b; color: #6b5440; font-style: italic; }\n' +
      'pre { background: #ebe3d0; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.9em; }\n' +
      'code { font-family: "Courier New", Courier, monospace; font-size: 0.9em; background: #ebe3d0; padding: 1px 3px; border-radius: 2px; }\n' +
      'pre code { background: transparent; padding: 0; }\n' +
      'a { color: #a0522d; text-decoration: underline; }\n' +
      'table { width: 100%; border-collapse: collapse; margin: 1em 0; }\n' +
      'th, td { border: 1px solid #c4b38a; padding: 6px 8px; text-align: left; }\n' +
      'thead th { background: #ebe3d0; font-weight: bold; }\n' +
      'hr { border: none; border-top: 1px solid #c4b38a; margin: 1.5em 0; }\n' +
      'hr.chapter-separator { border-top-width: 3px; border-top-color: #b8860b; width: 60%; margin-left: auto; margin-right: auto; }\n' +
      'img { max-width: 100%; height: auto; }\n' +
      '.title-page { text-align: center; margin-top: 30%; }\n' +
      '.book-title { font-size: 2em; border-bottom: none; }\n' +
      '.book-author { font-style: italic; color: #6b5440; font-size: 1.2em; text-indent: 0; margin-top: 1em; }\n' +
      'nav#toc ol { padding-left: 1.5em; }\n' +
      'nav#toc li { margin: 0.3em 0; }\n';
  }

  function exportEPUB(meta) {
    if (typeof UI !== 'undefined' && UI.setEpubOverlay) UI.setEpubOverlay(true);

    var bookUuid = 'urn:uuid:' + DB.generateUUID();
    var isoDate = getISODate();
    var chapters = Chapters.getAll();
    var lang = meta.language || 'fr';
    var title = meta.title || 'Mon livre';
    var author = meta.author || '';

    return new Promise(function (resolve, reject) {
      try {
        var zip = new JSZip();

        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('META-INF/container.xml', generateContainer());

        var chapterData = [];
        for (var i = 0; i < chapters.length; i++) {
          var ch = chapters[i];
          var filename = 'chapter_' + pad3(i + 1) + '.xhtml';
          var itemId = 'chapter-' + pad3(i + 1);
          var corrected = Corrections.applyCorrections(ch.content || '', 'preview');
          var xhtmlContent = Parser.renderToXHTML(corrected, ch.title);
          zip.file('OEBPS/' + filename, wrapXhtml(ch.title, xhtmlContent, lang));
          chapterData.push({ title: ch.title, filename: filename, id: itemId });
        }

        zip.file('OEBPS/title.xhtml', generateTitlePage(title, author, lang));
        zip.file('OEBPS/toc.xhtml', generateTocXhtml(chapterData, lang));
        zip.file('OEBPS/toc.ncx', generateTocNcx(bookUuid, title, chapterData));
        zip.file('OEBPS/content.opf', generateContentOpf(bookUuid, meta, isoDate, chapterData));
        zip.file('OEBPS/style.css', generateStylesheet());

        zip.generateAsync({
          type: 'blob', mimeType: 'application/epub+zip',
          compression: 'DEFLATE', compressionOptions: { level: 9 }
        }).then(function (blob) {
          downloadBlob(blob, sanitizeFilename(title) + '.epub');
          if (typeof UI !== 'undefined' && UI.showStatus) UI.showStatus('Export EPUB terminé.');
          resolve();
        }).catch(function (err) {
          console.error('[ExportEPUB]', err);
          if (typeof UI !== 'undefined' && UI.showStatus) UI.showStatus('Erreur EPUB : ' + err.message);
          reject(err);
        }).finally(function () {
          if (typeof UI !== 'undefined' && UI.setEpubOverlay) UI.setEpubOverlay(false);
        });
      } catch (err) {
        console.error('[ExportEPUB]', err);
        if (typeof UI !== 'undefined' && UI.setEpubOverlay) UI.setEpubOverlay(false);
        if (typeof UI !== 'undefined' && UI.showStatus) UI.showStatus('Erreur EPUB : ' + err.message);
        reject(err);
      }
    });
  }

  window.ExportEPUB = { exportEPUB: exportEPUB };
})();