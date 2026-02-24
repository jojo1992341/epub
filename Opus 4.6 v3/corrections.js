/**
 * corrections.js — Moteur d'exécution des plugins de corrections.
 * Gère les séquences spéciales étendues et la génération de code IFTTT.
 * Expose : window.Corrections
 */
(function () {
  'use strict';

  var _plugins = [];

  /* ─────────────────────────────────────
     CATALOGUE DES SÉQUENCES SPÉCIALES
     ───────────────────────────────────── */

  /**
   * Catalogue complet des séquences spéciales utilisables dans les valeurs.
   * Chaque entrée : { sequence, label, description, regex, replacement }
   * - sequence : ce que l'utilisateur tape
   * - label : nom court en français
   * - description : explication
   * - regex : la regex JS correspondante (chaîne)
   * - replacement : le texte de remplacement si applicable (pour convertSpecialSequences)
   */
  var SEQUENCES_CATALOG = [
    // ── Caractères spéciaux ──
    { category: 'Caractères spéciaux', sequence: '\\n', label: 'Retour à la ligne', description: 'Insère un retour à la ligne réel.', regex: null, replacement: '\n' },
    { category: 'Caractères spéciaux', sequence: '\\t', label: 'Tabulation', description: 'Insère une tabulation.', regex: null, replacement: '\t' },
    { category: 'Caractères spéciaux', sequence: '\\u00A0', label: 'Espace insécable', description: 'Insère un espace insécable (non-breaking space).', regex: null, replacement: '\u00A0' },
    { category: 'Caractères spéciaux', sequence: '\\u00AB', label: 'Guillemet ouvrant «', description: 'Insère un guillemet français ouvrant.', regex: null, replacement: '\u00AB' },
    { category: 'Caractères spéciaux', sequence: '\\u00BB', label: 'Guillemet fermant »', description: 'Insère un guillemet français fermant.', regex: null, replacement: '\u00BB' },
    { category: 'Caractères spéciaux', sequence: '\\u2019', label: 'Apostrophe typographique', description: 'Insère une apostrophe courbe \u2019.', regex: null, replacement: '\u2019' },
    { category: 'Caractères spéciaux', sequence: '\\u2013', label: 'Tiret demi-cadratin –', description: 'Insère un tiret moyen (en dash).', regex: null, replacement: '\u2013' },
    { category: 'Caractères spéciaux', sequence: '\\u2014', label: 'Tiret cadratin —', description: 'Insère un tiret long (em dash).', regex: null, replacement: '\u2014' },
    { category: 'Caractères spéciaux', sequence: '\\u2026', label: 'Points de suspension …', description: 'Insère le caractère points de suspension.', regex: null, replacement: '\u2026' },
    { category: 'Caractères spéciaux', sequence: '\\u0153', label: 'Ligature œ', description: 'Insère la ligature œ.', regex: null, replacement: '\u0153' },
    { category: 'Caractères spéciaux', sequence: '\\u0152', label: 'Ligature Œ', description: 'Insère la ligature Œ majuscule.', regex: null, replacement: '\u0152' },

    // ── Motifs textuels (pour conditions et valeurs) ──
    { category: 'Motifs textuels', sequence: '$mot', label: 'N\'importe quel mot', description: 'Correspond à un mot (lettres, chiffres, accents, tirets).', regex: '[\\w\\u00C0-\\u024F\\-]+', replacement: null },
    { category: 'Motifs textuels', sequence: '$MOT', label: 'Mot capturé (groupe)', description: 'Capture un mot pour référence via $1, $2…', regex: '([\\w\\u00C0-\\u024F\\-]+)', replacement: null },
    { category: 'Motifs textuels', sequence: '$nombre', label: 'Un nombre', description: 'Correspond à un nombre entier ou décimal.', regex: '\\d+(?:[.,]\\d+)?', replacement: null },
    { category: 'Motifs textuels', sequence: '$NOMBRE', label: 'Nombre capturé', description: 'Capture un nombre pour référence.', regex: '(\\d+(?:[.,]\\d+)?)', replacement: null },
    { category: 'Motifs textuels', sequence: '$lettre', label: 'Une lettre', description: 'Correspond à une seule lettre (avec accents).', regex: '[a-zA-Z\\u00C0-\\u024F]', replacement: null },
    { category: 'Motifs textuels', sequence: '$LETTRE', label: 'Lettre capturée', description: 'Capture une lettre.', regex: '([a-zA-Z\\u00C0-\\u024F])', replacement: null },
    { category: 'Motifs textuels', sequence: '$majuscule', label: 'Lettre majuscule', description: 'Correspond à une majuscule (avec accents).', regex: '[A-Z\\u00C0-\\u00DE]', replacement: null },
    { category: 'Motifs textuels', sequence: '$minuscule', label: 'Lettre minuscule', description: 'Correspond à une minuscule (avec accents).', regex: '[a-z\\u00DF-\\u00FF]', replacement: null },
    { category: 'Motifs textuels', sequence: '$chiffre', label: 'Un chiffre', description: 'Correspond à un seul chiffre (0-9).', regex: '\\d', replacement: null },
    { category: 'Motifs textuels', sequence: '$voyelle', label: 'Une voyelle', description: 'Correspond à une voyelle (avec accents).', regex: '[aeiouyàâäéèêëïîôùûüÿæœAEIOUYÀÂÄÉÈÊËÏÎÔÙÛÜŸÆŒ]', replacement: null },
    { category: 'Motifs textuels', sequence: '$consonne', label: 'Une consonne', description: 'Correspond à une consonne.', regex: '[bcdfghjklmnpqrstvwxzBCDFGHJKLMNPQRSTVWXZçÇ]', replacement: null },

    // ── Ponctuation ──
    { category: 'Ponctuation', sequence: '$ponctuation', label: 'Signe de ponctuation', description: 'Correspond à tout signe de ponctuation courant : . , ; : ! ? … « » " \' \‘ \’ ( ) [ ] { } – —', regex: '[.,;:!?…«»""\'\‘\’()\\[\\]{}–—\\-]', replacement: null },
    { category: 'Ponctuation', sequence: '$PONCTUATION', label: 'Ponctuation capturée', description: 'Capture un signe de ponctuation.', regex: '([.,;:!?…«»""\'\‘\’()\\[\\]{}–—\\-])', replacement: null },
    { category: 'Ponctuation', sequence: '$ponctuationForte', label: 'Ponctuation forte', description: 'Point, point d\'exclamation, point d\'interrogation, points de suspension.', regex: '[.!?…]', replacement: null },
    { category: 'Ponctuation', sequence: '$ponctuationFaible', label: 'Ponctuation faible', description: 'Virgule, point-virgule, deux-points.', regex: '[,;:]', replacement: null },
    { category: 'Ponctuation', sequence: '$ouvrante', label: 'Ponctuation ouvrante', description: 'Guillemet ouvrant, parenthèse ouvrante, crochet ouvrant.', regex: '[«"\'(\\[]', replacement: null },
    { category: 'Ponctuation', sequence: '$fermante', label: 'Ponctuation fermante', description: 'Guillemet fermant, parenthèse fermante, crochet fermant.', regex: '[»"\'\\)\\]]', replacement: null },
    { category: 'Ponctuation', sequence: '$tiret', label: 'Un tiret (tout type)', description: 'Tiret simple, demi-cadratin ou cadratin.', regex: '[\\-–—]', replacement: null },
    { category: 'Ponctuation', sequence: '$guillemet', label: 'Un guillemet (tout type)', description: 'Guillemets français, anglais, simples ou doubles.', regex: '[«»""\'\'‹›]', replacement: null },

    // ── Espaces et blancs ──
    { category: 'Espaces et blancs', sequence: '$espace', label: 'Espace simple', description: 'Un espace régulier.', regex: ' ', replacement: null },
    { category: 'Espaces et blancs', sequence: '$espaces', label: 'Un ou plusieurs espaces', description: 'Correspond à une séquence d\'espaces.', regex: ' +', replacement: null },
    { category: 'Espaces et blancs', sequence: '$blanc', label: 'Caractère blanc', description: 'Espace, tabulation, espace insécable.', regex: '[\\s\\u00A0]', replacement: null },
    { category: 'Espaces et blancs', sequence: '$blancs', label: 'Un ou plusieurs blancs', description: 'Séquence de caractères blancs.', regex: '[\\s\\u00A0]+', replacement: null },
    { category: 'Espaces et blancs', sequence: '$debutLigne', label: 'Début de ligne', description: 'Ancre de début de ligne.', regex: '^', replacement: null },
    { category: 'Espaces et blancs', sequence: '$finLigne', label: 'Fin de ligne', description: 'Ancre de fin de ligne.', regex: '$', replacement: null },

    // ── Motifs de contenu ──
    { category: 'Motifs de contenu', sequence: '$phrase', label: 'Une phrase', description: 'Séquence de caractères terminée par un signe de ponctuation forte.', regex: '[^.!?…]+[.!?…]+', replacement: null },
    { category: 'Motifs de contenu', sequence: '$email', label: 'Adresse email', description: 'Correspond à une adresse email simple.', regex: '[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}', replacement: null },
    { category: 'Motifs de contenu', sequence: '$url', label: 'URL', description: 'Correspond à une URL commençant par http ou https.', regex: 'https?://[^\\s<>]+', replacement: null },
    { category: 'Motifs de contenu', sequence: '$tout', label: 'N\'importe quoi', description: 'Correspond à n\'importe quelle séquence de caractères (gourmand).', regex: '.*', replacement: null },
    { category: 'Motifs de contenu', sequence: '$TOUT', label: 'N\'importe quoi (capturé)', description: 'Capture n\'importe quelle séquence.', regex: '(.*)', replacement: null },
    { category: 'Motifs de contenu', sequence: '$quelconque', label: 'Un caractère quelconque', description: 'Correspond à un seul caractère quel qu\'il soit.', regex: '.', replacement: null },
    { category: 'Motifs de contenu', sequence: '$optionnel', label: 'Suffixe optionnel (0 ou 1)', description: 'Rend l\'élément précédent optionnel. À placer après un motif.', regex: '?', replacement: null },
    { category: 'Motifs de contenu', sequence: '$plusieurs', label: 'Suffixe 1 ou plus', description: 'Répète l\'élément précédent une ou plusieurs fois.', regex: '+', replacement: null },

    // ── Informations format regex ──
    { category: 'Format', sequence: 'pattern|flags', label: 'Format regex', description: 'Pour les conditions regex : le pattern est avant le pipe, les flags après. Exemple : \\btest\\b|gi', regex: null, replacement: null },
    { category: 'Format', sequence: 'avant|après', label: 'Format encadrer', description: 'Pour l\'action Encadrer : la partie avant le pipe est insérée avant, la partie après est insérée après.', regex: null, replacement: null },
    { category: 'Format', sequence: '$1, $2…', label: 'Références de capture', description: 'Dans les actions, référence les groupes capturés par $MOT, $NOMBRE, $LETTRE, $PONCTUATION, $TOUT ou les parenthèses des regex.', regex: null, replacement: null }
  ];

  /* ─────────────────────────────────────
     HELPERS INTERNES
     ───────────────────────────────────── */

  function escapeForJS(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Convertit les séquences spéciales (caractères) en vrais caractères Unicode.
   * @param {string} str
   * @returns {string}
   */
  function convertSpecialChars(str) {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\u00A0/g, '\u00A0')
      .replace(/\\u00AB/g, '\u00AB')
      .replace(/\\u00BB/g, '\u00BB')
      .replace(/\\u2019/g, '\u2019')
      .replace(/\\u2013/g, '\u2013')
      .replace(/\\u2014/g, '\u2014')
      .replace(/\\u2026/g, '\u2026')
      .replace(/\\u0153/g, '\u0153')
      .replace(/\\u0152/g, '\u0152');
  }

  /**
   * Convertit les motifs $xxx en regex dans une chaîne.
   * Retourne la chaîne avec les motifs remplacés par leur regex.
   * @param {string} str
   * @returns {string}
   */
  function expandMotifs(str) {
    if (!str) return '';
    var result = str;
    // Trier par longueur décroissante pour éviter les remplacements partiels
    var motifs = SEQUENCES_CATALOG.filter(function (s) { return s.regex !== null && s.sequence.charAt(0) === '$'; });
    motifs.sort(function (a, b) { return b.sequence.length - a.sequence.length; });
    for (var i = 0; i < motifs.length; i++) {
      var seq = motifs[i].sequence;
      var regex = motifs[i].regex;
      // Utiliser split/join pour remplacement littéral
      result = result.split(seq).join(regex);
    }
    return result;
  }

  /**
   * Convertit toutes les séquences spéciales (caractères + motifs) dans une valeur.
   * Pour les caractères, les remplace par les vrais caractères.
   * Pour les motifs, les laisse tels quels (ils seront expandus dans le code généré).
   * @param {string} str
   * @returns {string}
   */
  function convertSpecialSequences(str) {
    return convertSpecialChars(str);
  }

  /**
   * Vérifie si une chaîne contient des motifs $xxx.
   * @param {string} str
   * @returns {boolean}
   */
  function containsMotifs(str) {
    if (!str) return false;
    return /\$(?:mot|MOT|nombre|NOMBRE|lettre|LETTRE|majuscule|minuscule|chiffre|voyelle|consonne|ponctuation|PONCTUATION|ponctuationForte|ponctuationFaible|ouvrante|fermante|tiret|guillemet|espace|espaces|blanc|blancs|debutLigne|finLigne|phrase|email|url|tout|TOUT|quelconque|optionnel|plusieurs)/.test(str);
  }

  function escapeRegexChars(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractProtectedSegments(text) {
    var segments = [];
    var counter = 0;
    var masked = text;
    masked = masked.replace(/```[\s\S]*?```/g, function (match) {
      var marker = '\x00PROTECTED_' + counter + '\x00';
      segments.push({ marker: marker, content: match });
      counter++;
      return marker;
    });
    masked = masked.replace(/`[^`\n]+`/g, function (match) {
      var marker = '\x00PROTECTED_' + counter + '\x00';
      segments.push({ marker: marker, content: match });
      counter++;
      return marker;
    });
    return { masked: masked, segments: segments };
  }

  function restoreProtectedSegments(text, segments) {
    var result = text;
    for (var i = segments.length - 1; i >= 0; i--) {
      result = result.split(segments[i].marker).join(segments[i].content);
    }
    return result;
  }

  function executePluginCode(text, code, pluginName) {
    try {
      var fn = new Function('text', code + '\nreturn text;');
      var result = fn(text);
      if (typeof result !== 'string') {
        console.error('[Plugin "' + pluginName + '"] Résultat non textuel.');
        if (typeof UI !== 'undefined' && UI.showStatus) {
          UI.showStatus('Erreur plugin "' + pluginName + '" : résultat non textuel');
        }
        return text;
      }
      return result;
    } catch (e) {
      console.error('[Plugin "' + pluginName + '"] Erreur :', e);
      if (typeof UI !== 'undefined' && UI.showStatus) {
        UI.showStatus('Erreur plugin "' + pluginName + '" : ' + e.message);
      }
      return text;
    }
  }

  function validatePlugin(plugin) {
    if (typeof plugin.id !== 'string' || !plugin.id) throw new Error('Plugin invalide : id manquant.');
    if (typeof plugin.name !== 'string' || !plugin.name.trim()) throw new Error('Plugin invalide : name vide.');
    if (typeof plugin.enabled !== 'boolean') throw new Error('Plugin invalide : enabled non booléen.');
    if (typeof plugin.order !== 'number') throw new Error('Plugin invalide : order non numérique.');
    if (['editor', 'preview', 'both'].indexOf(plugin.target) === -1) throw new Error('Plugin invalide : target invalide.');
    if (!Array.isArray(plugin.rules)) throw new Error('Plugin invalide : rules non tableau.');
    if (typeof plugin.code !== 'string') throw new Error('Plugin invalide : code non textuel.');
    if (typeof plugin.testInput !== 'string') plugin.testInput = '';
    if (typeof plugin.locked !== 'boolean') plugin.locked = false;
  }

  function parseRegexValue(value) {
    var lastPipe = value.lastIndexOf('|');
    if (lastPipe === -1) return { pattern: value, flags: 'g' };
    var possibleFlags = value.substring(lastPipe + 1);
    if (/^[gimsuy]*$/.test(possibleFlags)) {
      return { pattern: value.substring(0, lastPipe), flags: possibleFlags };
    }
    return { pattern: value, flags: 'g' };
  }

  function getActionReplacement(action, actionValue) {
    var val = escapeForJS(convertSpecialChars(actionValue));
    switch (action) {
      case 'replace_with': return '"' + val + '"';
      case 'insert_before': return '"' + val + '$&"';
      case 'insert_after': return '"$&' + val + '"';
      case 'delete': return '""';
      case 'wrap_with':
        var parts = actionValue.split('|');
        var before = escapeForJS(convertSpecialChars(parts[0] || ''));
        var after = escapeForJS(convertSpecialChars(parts[1] || ''));
        return '"' + before + '$&' + after + '"';
      default: return '"' + val + '"';
    }
  }

  /**
   * Construit le pattern de recherche pour une condition textuelle,
   * en expandant les motifs $xxx si présents.
   * @param {string} condValue — Valeur brute de la condition
   * @param {string} condType — Type de condition
   * @returns {{ pattern: string, isRegex: boolean, flags: string }}
   */
  function buildSearchPattern(condValue, condType) {
    var hasMotifs = containsMotifs(condValue);

    if (condType === 'text_matches_regex') {
      var parsed = parseRegexValue(condValue);
      // Expander les motifs dans le pattern regex
      var expandedPattern = expandMotifs(parsed.pattern);
      return { pattern: expandedPattern, isRegex: true, flags: parsed.flags };
    }

    if (hasMotifs) {
      // La valeur contient des motifs : convertir les parties littérales en regex échappées
      // et les motifs en leur regex
      var converted = convertSpecialChars(condValue);
      // Échapper d'abord les caractères regex dans les parties littérales
      // Pour cela, on travaille segment par segment
      var expanded = expandMotifsWithEscape(condValue);
      var flags = (condType === 'text_contains_ci') ? 'gi' : 'g';
      return { pattern: expanded, isRegex: true, flags: flags };
    }

    // Valeur simple sans motifs
    var simpleVal = convertSpecialChars(condValue);
    if (condType === 'text_contains_ci') {
      return { pattern: escapeRegexChars(simpleVal), isRegex: true, flags: 'gi' };
    }

    return { pattern: simpleVal, isRegex: false, flags: '' };
  }

  /**
   * Expande les motifs $xxx dans une chaîne, en échappant les parties littérales.
   * @param {string} str
   * @returns {string} — Pattern regex
   */
  function expandMotifsWithEscape(str) {
    if (!str) return '';
    // D'abord convertir les caractères spéciaux
    var converted = convertSpecialChars(str);

    // Identifier les motifs et les parties littérales
    var motifs = SEQUENCES_CATALOG.filter(function (s) { return s.regex !== null && s.sequence.charAt(0) === '$'; });
    motifs.sort(function (a, b) { return b.sequence.length - a.sequence.length; });

    // Construire un pattern pour trouver les motifs dans la chaîne originale
    var motifPatterns = motifs.map(function (m) {
      return m.sequence.replace(/\$/g, '\\$');
    });
    var splitRegex = new RegExp('(' + motifPatterns.join('|') + ')');

    var parts = str.split(splitRegex);
    var result = '';
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      // Vérifier si c'est un motif
      var isMotif = false;
      for (var m = 0; m < motifs.length; m++) {
        if (part === motifs[m].sequence) {
          result += motifs[m].regex;
          isMotif = true;
          break;
        }
      }
      if (!isMotif) {
        result += escapeRegexChars(convertSpecialChars(part));
      }
    }
    return result;
  }

  function genSplitJoinCode(searchValue, action, actionValue) {
    var sv = escapeForJS(convertSpecialChars(searchValue));
    var av = escapeForJS(convertSpecialChars(actionValue));
    switch (action) {
      case 'replace_with': return 'text = text.split("' + sv + '").join("' + av + '");';
      case 'insert_before': return 'text = text.split("' + sv + '").join("' + av + sv + '");';
      case 'insert_after': return 'text = text.split("' + sv + '").join("' + sv + av + '");';
      case 'delete': return 'text = text.split("' + sv + '").join("");';
      case 'wrap_with':
        var parts = actionValue.split('|');
        var before = escapeForJS(convertSpecialChars(parts[0] || ''));
        var after = escapeForJS(convertSpecialChars(parts[1] || ''));
        return 'text = text.split("' + sv + '").join("' + before + sv + after + '");';
      default: return 'text = text.split("' + sv + '").join("' + av + '");';
    }
  }

  function genRegexReplaceCode(regexLiteral, action, actionValue) {
    var replacement = getActionReplacement(action, actionValue);
    return 'text = text.replace(' + regexLiteral + ', ' + replacement + ');';
  }

  function genLineCode(conditions, logic, action, actionValue) {
    var lines = [];
    lines.push('var lines = text.split("\\n");');
    lines.push('for (var i = 0; i < lines.length; i++) {');
    var checks = [];
    for (var c = 0; c < conditions.length; c++) {
      var cond = conditions[c];
      var val = escapeForJS(convertSpecialChars(cond.value));
      if (cond.type === 'line_starts_with') {
        if (containsMotifs(cond.value)) {
          var pat = expandMotifsWithEscape(cond.value);
          checks.push('new RegExp("^' + escapeForJS(pat) + '").test(lines[i])');
        } else {
          checks.push('lines[i].indexOf("' + val + '") === 0');
        }
      } else if (cond.type === 'line_ends_with') {
        if (containsMotifs(cond.value)) {
          var pat2 = expandMotifsWithEscape(cond.value);
          checks.push('new RegExp("' + escapeForJS(pat2) + '$").test(lines[i])');
        } else {
          checks.push('lines[i].slice(-' + convertSpecialChars(cond.value).length + ') === "' + val + '"');
        }
      }
    }
    var operator = logic === 'OR' ? ' || ' : ' && ';
    lines.push('  if (' + checks.join(operator) + ') {');
    var av = escapeForJS(convertSpecialChars(actionValue));
    switch (action) {
      case 'replace_with': lines.push('    lines[i] = "' + av + '";'); break;
      case 'insert_before': lines.push('    lines[i] = "' + av + '" + lines[i];'); break;
      case 'insert_after': lines.push('    lines[i] = lines[i] + "' + av + '";'); break;
      case 'delete': lines.push('    lines[i] = "";'); break;
      case 'wrap_with':
        var pts = actionValue.split('|');
        var bef = escapeForJS(convertSpecialChars(pts[0] || ''));
        var aft = escapeForJS(convertSpecialChars(pts[1] || ''));
        lines.push('    lines[i] = "' + bef + '" + lines[i] + "' + aft + '";');
        break;
    }
    lines.push('  }');
    lines.push('}');
    lines.push('text = lines.join("\\n");');
    return lines.join('\n');
  }

  /* ─────────────────────────────────────
     MÉTHODES PUBLIQUES
     ───────────────────────────────────── */

  function loadPlugins() {
    return DB.loadAllPlugins().then(function (plugins) {
      _plugins = plugins || [];
      // S'assurer que locked est défini
      for (var i = 0; i < _plugins.length; i++) {
        if (typeof _plugins[i].locked !== 'boolean') _plugins[i].locked = false;
      }
    });
  }

  function getPlugins() { return _plugins.slice(); }

  function savePlugin(plugin) {
    validatePlugin(plugin);
    return DB.savePlugin(plugin).then(function () { return loadPlugins(); });
  }

  function deletePlugin(id) {
    return DB.deletePlugin(id).then(function () { return loadPlugins(); });
  }

  function reorderPlugins(orderedIds) {
    var promises = [];
    for (var i = 0; i < orderedIds.length; i++) {
      var id = orderedIds[i];
      for (var j = 0; j < _plugins.length; j++) {
        if (_plugins[j].id === id) {
          _plugins[j].order = i;
          promises.push(DB.savePlugin(_plugins[j]));
          break;
        }
      }
    }
    return Promise.all(promises).then(function () { return loadPlugins(); });
  }

  function togglePlugin(id, enabled) {
    for (var i = 0; i < _plugins.length; i++) {
      if (_plugins[i].id === id) {
        _plugins[i].enabled = enabled;
        return DB.savePlugin(_plugins[i]).then(function () { return loadPlugins(); });
      }
    }
    return Promise.resolve();
  }

  function lockPlugin(id, locked) {
    for (var i = 0; i < _plugins.length; i++) {
      if (_plugins[i].id === id) {
        _plugins[i].locked = locked;
        return DB.savePlugin(_plugins[i]).then(function () { return loadPlugins(); });
      }
    }
    return Promise.resolve();
  }

  function exportPlugins() { return JSON.stringify(_plugins, null, 2); }

  function importPlugins(jsonStr) {
    var imported;
    try { imported = JSON.parse(jsonStr); } catch (e) {
      return Promise.reject(new Error('JSON invalide : ' + e.message));
    }
    if (!Array.isArray(imported)) return Promise.reject(new Error('Le JSON doit contenir un tableau.'));
    var existingCount = _plugins.length;
    var promises = [];
    for (var i = 0; i < imported.length; i++) {
      var p = imported[i];
      if (!p || typeof p.name !== 'string') continue;
      p.id = DB.generateUUID();
      p.order = existingCount + i;
      p.enabled = typeof p.enabled === 'boolean' ? p.enabled : true;
      p.target = ['editor', 'preview', 'both'].indexOf(p.target) !== -1 ? p.target : 'preview';
      p.rules = Array.isArray(p.rules) ? p.rules : [];
      p.code = typeof p.code === 'string' ? p.code : '';
      p.testInput = typeof p.testInput === 'string' ? p.testInput : '';
      p.locked = typeof p.locked === 'boolean' ? p.locked : false;
      for (var r = 0; r < p.rules.length; r++) { p.rules[r].id = DB.generateUUID(); }
      promises.push(DB.savePlugin(p));
    }
    return Promise.all(promises).then(function () { return loadPlugins(); });
  }

  function applyCorrections(text, target) {
    if (!text || _plugins.length === 0) return text;
    var extracted = extractProtectedSegments(text);
    var masked = extracted.masked;
    for (var i = 0; i < _plugins.length; i++) {
      var plugin = _plugins[i];
      if (!plugin.enabled) continue;
      if (target === 'editor' && plugin.target !== 'editor' && plugin.target !== 'both') continue;
      if (target === 'preview' && plugin.target !== 'preview' && plugin.target !== 'both') continue;
      if (!plugin.code || !plugin.code.trim()) continue;
      masked = executePluginCode(masked, plugin.code, plugin.name);
    }
    return restoreProtectedSegments(masked, extracted.segments);
  }

  function generateCodeFromRules(rules) {
    if (!rules || rules.length === 0) return '';
    var codeLines = [];

    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if (!rule.conditions || rule.conditions.length === 0) continue;
      if (!rule.action) continue;

      var logic = rule.logic || 'AND';
      var conditions = rule.conditions;
      var action = rule.action;
      var actionValue = rule.actionValue || '';

      // Commentaire descriptif
      var condDescs = [];
      for (var cd = 0; cd < conditions.length; cd++) {
        condDescs.push(conditions[cd].type + '("' + (conditions[cd].value || '') + '")');
      }
      codeLines.push('// Règle : SI ' + condDescs.join(logic === 'OR' ? ' OU ' : ' ET ') +
        ' ALORS ' + action + '("' + actionValue + '")');

      if (conditions.length === 1) {
        var cond = conditions[0];
        var condValue = cond.value || '';
        var condType = cond.type;
        var sp = buildSearchPattern(condValue, condType);

        if (condType === 'line_starts_with' || condType === 'line_ends_with') {
          codeLines.push(genLineCode([cond], logic, action, actionValue));
        } else if (condType === 'preceded_by') {
          var precVal = containsMotifs(condValue) ? expandMotifsWithEscape(condValue) : escapeRegexChars(convertSpecialChars(condValue));
          var repl3 = getActionReplacement(action, actionValue);
          codeLines.push('try {');
          codeLines.push('  text = text.replace(new RegExp("(?<=' + escapeForJS(precVal) + ')(.)", "g"), ' + repl3 + ');');
          codeLines.push('} catch(e) {}');
        } else if (condType === 'followed_by') {
          var folVal = containsMotifs(condValue) ? expandMotifsWithEscape(condValue) : escapeRegexChars(convertSpecialChars(condValue));
          var repl4 = getActionReplacement(action, actionValue);
          codeLines.push('try {');
          codeLines.push('  text = text.replace(new RegExp("(.)(?=' + escapeForJS(folVal) + ')", "g"), ' + repl4 + ');');
          codeLines.push('} catch(e) {}');
        } else if (sp.isRegex) {
          var replacement = getActionReplacement(action, actionValue);
          codeLines.push('try {');
          codeLines.push('  text = text.replace(new RegExp("' + escapeForJS(sp.pattern) + '", "' + escapeForJS(sp.flags) + '"), ' + replacement + ');');
          codeLines.push('} catch(e) {}');
        } else {
          codeLines.push(genSplitJoinCode(condValue, action, actionValue));
        }
      } else {
        // Conditions multiples
        var lineConditions = conditions.filter(function (c) {
          return c.type === 'line_starts_with' || c.type === 'line_ends_with';
        });
        var textConds = conditions.filter(function (c) {
          return c.type === 'text_contains' || c.type === 'text_contains_ci';
        });
        var lookConds = conditions.filter(function (c) {
          return c.type === 'preceded_by' || c.type === 'followed_by';
        });

        if (lineConditions.length === conditions.length) {
          codeLines.push(genLineCode(lineConditions, logic, action, actionValue));
        } else if (logic === 'AND' && textConds.length >= 1 && lookConds.length >= 1) {
          var mainSearch = textConds[0];
          var mainPattern = containsMotifs(mainSearch.value) ? expandMotifsWithEscape(mainSearch.value) : escapeRegexChars(convertSpecialChars(mainSearch.value));
          var lookParts = '';
          var followParts = '';
          for (var lc = 0; lc < lookConds.length; lc++) {
            var lcVal = containsMotifs(lookConds[lc].value) ? expandMotifsWithEscape(lookConds[lc].value) : escapeRegexChars(convertSpecialChars(lookConds[lc].value));
            if (lookConds[lc].type === 'preceded_by') lookParts += '(?<=' + lcVal + ')';
            else followParts += '(?=' + lcVal + ')';
          }
          var combinedRegex = lookParts + mainPattern + followParts;
          var repl5 = getActionReplacement(action, actionValue);
          var ciFlag = mainSearch.type === 'text_contains_ci' ? 'gi' : 'g';
          codeLines.push('try {');
          codeLines.push('  text = text.replace(new RegExp("' + escapeForJS(combinedRegex) + '", "' + ciFlag + '"), ' + repl5 + ');');
          codeLines.push('} catch(e) {}');
        } else if (logic === 'OR' && textConds.length === conditions.length) {
          var alternatives = [];
          var allCI = true;
          for (var tc = 0; tc < textConds.length; tc++) {
            var tcSp = buildSearchPattern(textConds[tc].value, textConds[tc].type);
            alternatives.push(tcSp.pattern);
            if (textConds[tc].type !== 'text_contains_ci') allCI = false;
          }
          var altPattern = '(' + alternatives.join('|') + ')';
          var altFlags = allCI ? 'gi' : 'g';
          var repl6 = getActionReplacement(action, actionValue);
          codeLines.push('text = text.replace(new RegExp("' + escapeForJS(altPattern) + '", "' + altFlags + '"), ' + repl6 + ');');
        } else if (logic === 'OR') {
          for (var oc = 0; oc < conditions.length; oc++) {
            var singleRule = { id: rule.id, logic: 'AND', conditions: [conditions[oc]], action: action, actionValue: actionValue };
            var singleCode = generateCodeFromRules([singleRule]);
            var singleLines = singleCode.split('\n').filter(function (l) { return l.indexOf('// Règle') !== 0; });
            codeLines.push(singleLines.join('\n'));
          }
        } else {
          var checks = [];
          for (var mc = 0; mc < conditions.length; mc++) {
            var mcVal = convertSpecialChars(conditions[mc].value || '');
            switch (conditions[mc].type) {
              case 'text_contains': checks.push('text.indexOf("' + escapeForJS(mcVal) + '") !== -1'); break;
              case 'text_contains_ci': checks.push('text.toLowerCase().indexOf("' + escapeForJS(mcVal.toLowerCase()) + '") !== -1'); break;
              case 'text_matches_regex':
                var prs = parseRegexValue(conditions[mc].value);
                checks.push('(function(){try{return new RegExp("' + escapeForJS(prs.pattern) + '","' + escapeForJS(prs.flags) + '").test(text);}catch(e){return false;}})()');
                break;
              default: checks.push('true');
            }
          }
          codeLines.push('if (' + checks.join(' && ') + ') {');
          var firstTC = textConds[0] || conditions[0];
          var innerRule = { id: rule.id, logic: 'AND', conditions: [firstTC], action: action, actionValue: actionValue };
          var innerCode = generateCodeFromRules([innerRule]);
          var innerLines = innerCode.split('\n').filter(function (l) { return l.indexOf('// Règle') !== 0; });
          codeLines.push('  ' + innerLines.join('\n  '));
          codeLines.push('}');
        }
      }
      codeLines.push('');
    }

    return codeLines.join('\n').trim();
  }

  function testPlugin(plugin, inputText) {
    if (!inputText) return { output: '', error: null };
    var extracted = extractProtectedSegments(inputText);
    var masked = extracted.masked;
    try {
      var code = plugin.code || '';
      if (!code.trim()) return { output: inputText, error: null };
      var fn = new Function('text', code + '\nreturn text;');
      var result = fn(masked);
      if (typeof result !== 'string') return { output: inputText, error: 'Résultat non textuel.' };
      return { output: restoreProtectedSegments(result, extracted.segments), error: null };
    } catch (e) {
      console.error('[Test plugin "' + plugin.name + '"]', e);
      return { output: inputText, error: e.message };
    }
  }

  /**
   * Retourne le catalogue des séquences spéciales pour l'affichage.
   * @returns {object[]}
   */
  function getSequencesCatalog() {
    return SEQUENCES_CATALOG.slice();
  }

  window.Corrections = {
    loadPlugins: loadPlugins,
    getPlugins: getPlugins,
    savePlugin: savePlugin,
    deletePlugin: deletePlugin,
    reorderPlugins: reorderPlugins,
    togglePlugin: togglePlugin,
    lockPlugin: lockPlugin,
    exportPlugins: exportPlugins,
    importPlugins: importPlugins,
    applyCorrections: applyCorrections,
    generateCodeFromRules: generateCodeFromRules,
    testPlugin: testPlugin,
    getSequencesCatalog: getSequencesCatalog
  };

})();