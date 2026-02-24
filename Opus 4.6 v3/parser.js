/**
 * parser.js — Rendu Markdown vers HTML (preview) et XHTML (EPUB).
 * Utilise marked.js v12 avec un renderer personnalisé.
 * Expose : window.Parser
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  /**
   * Échappe les caractères spéciaux HTML.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Résout le texte inline d'un token marked v12.
   * Les tokens de bloc contiennent souvent des sous-tokens inline
   * qu'il faut résoudre récursivement via le walkTokens interne.
   * @param {object} token
   * @returns {string}
   */
  function resolveTokenText(token) {
    if (!token) return '';
    // Si tokens inline présents, les rendre récursivement
    if (token.tokens && Array.isArray(token.tokens)) {
      return renderInlineTokens(token.tokens);
    }
    // Sinon utiliser le texte brut
    if (typeof token.text === 'string') return token.text;
    return String(token.text || '');
  }

  /**
   * Rend un tableau de tokens inline en HTML.
   * @param {object[]} tokens
   * @returns {string}
   */
  function renderInlineTokens(tokens) {
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      switch (t.type) {
        case 'text':
          // Le texte peut lui-même contenir des sous-tokens
          if (t.tokens && t.tokens.length > 0) {
            html += renderInlineTokens(t.tokens);
          } else {
            html += t.raw || t.text || '';
          }
          break;
        case 'strong':
          html += '<strong>' + renderInlineTokens(t.tokens || []) + '</strong>';
          break;
        case 'em':
          html += '<em>' + renderInlineTokens(t.tokens || []) + '</em>';
          break;
        case 'del':
          html += '<del>' + renderInlineTokens(t.tokens || []) + '</del>';
          break;
        case 'codespan':
          html += '<code>' + escapeHtml(t.text) + '</code>';
          break;
        case 'br':
          html += '<br>';
          break;
        case 'link':
          html += '<a href="' + escapeHtml(t.href || '') + '"';
          if (t.title) html += ' title="' + escapeHtml(t.title) + '"';
          html += ' target="_blank">' + renderInlineTokens(t.tokens || []) + '</a>';
          break;
        case 'image':
          html += '<img src="' + escapeHtml(t.href || '') + '" alt="' + escapeHtml(t.text || '') + '"';
          if (t.title) html += ' title="' + escapeHtml(t.title) + '"';
          html += '>';
          break;
        case 'escape':
          html += t.text || '';
          break;
        case 'html':
          html += t.raw || t.text || '';
          break;
        default:
          html += t.raw || t.text || '';
          break;
      }
    }
    return html;
  }

  /**
   * Rend un tableau de tokens inline en XHTML.
   * @param {object[]} tokens
   * @returns {string}
   */
  function renderInlineTokensXhtml(tokens) {
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      switch (t.type) {
        case 'text':
          if (t.tokens && t.tokens.length > 0) {
            html += renderInlineTokensXhtml(t.tokens);
          } else {
            html += t.raw || t.text || '';
          }
          break;
        case 'strong':
          html += '<strong>' + renderInlineTokensXhtml(t.tokens || []) + '</strong>';
          break;
        case 'em':
          html += '<em>' + renderInlineTokensXhtml(t.tokens || []) + '</em>';
          break;
        case 'del':
          html += '<del>' + renderInlineTokensXhtml(t.tokens || []) + '</del>';
          break;
        case 'codespan':
          html += '<code>' + escapeHtml(t.text) + '</code>';
          break;
        case 'br':
          html += '<br />';
          break;
        case 'link':
          html += '<a href="' + escapeHtml(t.href || '') + '"';
          if (t.title) html += ' title="' + escapeHtml(t.title) + '"';
          html += '>' + renderInlineTokensXhtml(t.tokens || []) + '</a>';
          break;
        case 'image':
          html += '<img src="' + escapeHtml(t.href || '') + '" alt="' + escapeHtml(t.text || '') + '"';
          if (t.title) html += ' title="' + escapeHtml(t.title) + '"';
          html += ' />';
          break;
        case 'escape':
          html += t.text || '';
          break;
        case 'html':
          html += t.raw || t.text || '';
          break;
        default:
          html += t.raw || t.text || '';
          break;
      }
    }
    return html;
  }

  /**
   * Construit une carte des lignes sources via le lexer de marked.
   * @param {string} text
   * @returns {number[]}
   */
  function buildLineMap(text) {
    var tokens;
    try {
      tokens = marked.lexer(text);
    } catch (e) {
      return [];
    }
    var lineMap = [];
    var currentLine = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.type === 'space') {
        var spaceLines = (token.raw || '').split('\n').length - 1;
        currentLine += spaceLines;
      } else {
        lineMap.push(currentLine);
        var rawLines = (token.raw || '').split('\n').length - 1;
        currentLine += rawLines;
      }
    }

    return lineMap;
  }

  /**
   * Rendu complet d'un texte Markdown via le lexer de marked et un rendu manuel.
   * Cette approche contourne les problèmes d'API du renderer de marked v12.
   * @param {string} text
   * @param {boolean} isXhtml
   * @param {number[]} lineMap
   * @returns {string}
   */
  function renderTokens(text, isXhtml, lineMap) {
    var tokens;
    try {
      tokens = marked.lexer(text);
    } catch (e) {
      return escapeHtml(text);
    }

    var html = '';
    var blockIndex = 0;
    var lastTokenType = '';
    var lastHeadingDepth = 0;

    // Compteur pour les tokens non-espace (correspond à lineMap)
    var contentTokenIndex = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (token.type === 'space') {
        continue;
      }

      // Récupérer le numéro de ligne source
      var srcLine = (lineMap && contentTokenIndex < lineMap.length) ? lineMap[contentTokenIndex] : -1;
      var srcAttr = '';
      if (!isXhtml && srcLine >= 0) {
        srcAttr = ' data-source-line="' + srcLine + '"';
      }
      contentTokenIndex++;

      switch (token.type) {
        case 'heading':
          var headingText = isXhtml
            ? renderInlineTokensXhtml(token.tokens || [])
            : renderInlineTokens(token.tokens || []);
          var depth = token.depth || 1;

          // Détecter deux h4 consécutifs (séparateur de chapitre)
          var separator = '';
          if (depth === 4 && lastTokenType === 'heading' && lastHeadingDepth === 4) {
            separator = isXhtml
              ? '<hr class="chapter-separator" />\n'
              : '<hr class="chapter-separator">\n';
          }

          lastTokenType = 'heading';
          lastHeadingDepth = depth;

          html += separator + '<h' + depth + srcAttr + '>' + headingText + '</h' + depth + '>\n';
          break;

        case 'paragraph':
          var paraText = isXhtml
            ? renderInlineTokensXhtml(token.tokens || [])
            : renderInlineTokens(token.tokens || []);
          lastTokenType = 'paragraph';
          html += '<p' + srcAttr + '>' + paraText + '</p>\n';
          break;

        case 'list':
          lastTokenType = 'list';
          var tag = token.ordered ? 'ol' : 'ul';
          var startAttr = (token.ordered && token.start !== 1) ? ' start="' + token.start + '"' : '';
          html += '<' + tag + srcAttr + startAttr + '>\n';
          html += renderListItems(token.items || [], isXhtml);
          html += '</' + tag + '>\n';
          break;

        case 'code':
          lastTokenType = 'code';
          var langClass = token.lang ? ' class="language-' + escapeHtml(token.lang) + '"' : '';
          html += '<pre' + srcAttr + '><code' + langClass + '>' + escapeHtml(token.text || '') + '</code></pre>\n';
          break;

        case 'blockquote':
          lastTokenType = 'blockquote';
          // Le contenu de la citation est un ensemble de sous-tokens
          var quoteContent = '';
          if (token.tokens && token.tokens.length > 0) {
            quoteContent = renderTokens(
              token.tokens.map(function (t) { return t.raw || ''; }).join(''),
              isXhtml,
              null
            );
            // Alternative : rendre les sous-tokens directement
            quoteContent = renderSubBlockTokens(token.tokens, isXhtml);
          } else {
            quoteContent = token.text || '';
          }
          html += '<blockquote' + srcAttr + '>\n' + quoteContent + '</blockquote>\n';
          break;

        case 'hr':
          lastTokenType = 'hr';
          html += isXhtml
            ? '<hr' + srcAttr + ' />\n'
            : '<hr' + srcAttr + '>\n';
          break;

        case 'table':
          lastTokenType = 'table';
          html += renderTable(token, srcAttr, isXhtml);
          break;

        case 'html':
          lastTokenType = 'html';
          html += token.raw || token.text || '';
          break;

        default:
          // Token inconnu, afficher le brut
          if (token.raw) {
            html += token.raw;
          }
          break;
      }
    }

    return html;
  }

  /**
   * Rend les sous-tokens de bloc (utilisé dans les blockquotes).
   * @param {object[]} tokens
   * @param {boolean} isXhtml
   * @returns {string}
   */
  function renderSubBlockTokens(tokens, isXhtml) {
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      switch (token.type) {
        case 'paragraph':
          var text = isXhtml
            ? renderInlineTokensXhtml(token.tokens || [])
            : renderInlineTokens(token.tokens || []);
          html += '<p>' + text + '</p>\n';
          break;
        case 'space':
          break;
        case 'code':
          var langClass = token.lang ? ' class="language-' + escapeHtml(token.lang) + '"' : '';
          html += '<pre><code' + langClass + '>' + escapeHtml(token.text || '') + '</code></pre>\n';
          break;
        case 'list':
          var tag = token.ordered ? 'ol' : 'ul';
          html += '<' + tag + '>\n' + renderListItems(token.items || [], isXhtml) + '</' + tag + '>\n';
          break;
        default:
          if (token.tokens) {
            html += isXhtml
              ? renderInlineTokensXhtml(token.tokens)
              : renderInlineTokens(token.tokens);
          } else if (token.raw) {
            html += token.raw;
          }
          break;
      }
    }
    return html;
  }

  /**
   * Rend les éléments d'une liste.
   * @param {object[]} items
   * @param {boolean} isXhtml
   * @returns {string}
   */
  function renderListItems(items, isXhtml) {
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var content = '';

      if (item.tokens && item.tokens.length > 0) {
        // Vérifier si l'item contient des sous-blocs (loose list) ou juste du texte inline
        var hasBlocks = false;
        for (var j = 0; j < item.tokens.length; j++) {
          if (item.tokens[j].type === 'list' || item.tokens[j].type === 'paragraph' ||
              item.tokens[j].type === 'code' || item.tokens[j].type === 'blockquote') {
            hasBlocks = true;
            break;
          }
        }

        if (hasBlocks) {
          content = renderSubBlockTokens(item.tokens, isXhtml);
        } else {
          // Tokens inline simples (tight list)
          for (var k = 0; k < item.tokens.length; k++) {
            var sub = item.tokens[k];
            if (sub.type === 'text') {
              content += isXhtml
                ? renderInlineTokensXhtml(sub.tokens || [])
                : renderInlineTokens(sub.tokens || []);
              if (!content && sub.text) content = sub.text;
            } else {
              content += isXhtml
                ? renderInlineTokensXhtml([sub])
                : renderInlineTokens([sub]);
            }
          }
        }
      } else {
        content = item.text || '';
      }

      html += '<li>' + content + '</li>\n';
    }
    return html;
  }

  /**
   * Rend un tableau.
   * @param {object} token
   * @param {string} srcAttr
   * @param {boolean} isXhtml
   * @returns {string}
   */
  function renderTable(token, srcAttr, isXhtml) {
    var html = '<table' + srcAttr + '>\n<thead>\n<tr>\n';

    // En-tête
    var header = token.header || [];
    var aligns = token.align || [];
    for (var h = 0; h < header.length; h++) {
      var headerCell = header[h];
      var headerText = isXhtml
        ? renderInlineTokensXhtml(headerCell.tokens || [])
        : renderInlineTokens(headerCell.tokens || []);
      var alignAttr = aligns[h] ? ' style="text-align:' + aligns[h] + '"' : '';
      html += '<th' + alignAttr + '>' + headerText + '</th>\n';
    }
    html += '</tr>\n</thead>\n<tbody>\n';

    // Corps
    var rows = token.rows || [];
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>\n';
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var cellText = isXhtml
          ? renderInlineTokensXhtml(row[c].tokens || [])
          : renderInlineTokens(row[c].tokens || []);
        var cellAlign = aligns[c] ? ' style="text-align:' + aligns[c] + '"' : '';
        html += '<td' + cellAlign + '>' + cellText + '</td>\n';
      }
      html += '</tr>\n';
    }

    html += '</tbody>\n</table>\n';
    return html;
  }

  /**
   * Convertit du HTML brut en XHTML bien formé.
   * @param {string} html
   * @returns {string}
   */
  function convertToXhtml(html) {
    var wrapped = '<div xmlns="http://www.w3.org/1999/xhtml">' + html + '</div>';

    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(wrapped, 'application/xhtml+xml');

      var errors = doc.getElementsByTagName('parsererror');
      if (errors.length > 0) {
        return fallbackXhtml(html);
      }

      var serializer = new XMLSerializer();
      var serialized = serializer.serializeToString(doc.documentElement);

      var innerMatch = serialized.match(/^<div[^>]*>([\s\S]*)<\/div>$/);
      if (innerMatch) {
        return innerMatch[1];
      }
      return serialized;
    } catch (e) {
      return fallbackXhtml(html);
    }
  }

  /**
   * Fallback de conversion XHTML.
   * @param {string} html
   * @returns {string}
   */
  function fallbackXhtml(html) {
    return html
      .replace(/<br\s*>/gi, '<br />')
      .replace(/<hr([^/]*?)>/gi, '<hr$1 />')
      .replace(/<img([^/]*?)>/gi, '<img$1 />');
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  /**
   * Convertit du Markdown en HTML pour la preview (avec data-source-line).
   * @param {string} text
   * @returns {string}
   */
  function renderToHTML(text) {
    if (!text) return '';
    var lineMap = buildLineMap(text);
    return renderTokens(text, false, lineMap);
  }

  /**
   * Convertit du Markdown en XHTML valide pour l'export EPUB.
   * @param {string} text
   * @param {string} [chapterTitle]
   * @returns {string}
   */
  function renderToXHTML(text, chapterTitle) {
    if (!text && !chapterTitle) return '';

    var source = '';
    if (chapterTitle) {
      source = '# ' + chapterTitle + '\n\n';
    }
    source += (text || '');

    var html = renderTokens(source, true, null);
    return convertToXhtml(html);
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.Parser = {
    renderToHTML: renderToHTML,
    renderToXHTML: renderToXHTML
  };

})();