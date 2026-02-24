/**
 * ui.js — Orchestrateur principal.
 * Gère la sidebar, le panneau plugins, le verrouillage, les séquences spéciales.
 * Expose : window.UI
 */
(function () {
  'use strict';

  var _projectUuid = null;
  var _renameInProgress = false;
  var _selectedPluginId = null;
  var _codeManuallyEdited = false;
  var _pluginPreviewTimer = null;
  var _pluginSaveTimer = null;
  var _navTimer = null;

  /* ─────────────────────────────────────
     HELPERS DOM
     ───────────────────────────────────── */

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /**
   * Vérifie si le plugin sélectionné est verrouillé.
   * @returns {boolean}
   */
  function isSelectedPluginLocked() {
    var plugin = getSelectedPlugin();
    return plugin ? !!plugin.locked : false;
  }

  /**
   * Met à jour l'état verrouillé/déverrouillé de tous les éléments d'édition du plugin.
   * @param {boolean} locked
   */
  function setPluginEditorLocked(locked) {
    var nameEl = document.getElementById('plugin-name');
    var codeEl = document.getElementById('plugin-code');
    var testInputEl = document.getElementById('plugin-test-input');
    var addRuleBtn = document.getElementById('btn-add-rule');
    var deletePluginBtn = document.getElementById('btn-delete-plugin');
    var banner = document.getElementById('plugin-locked-banner');
    var lockBtn = document.getElementById('btn-lock-plugin');

    if (nameEl) nameEl.disabled = locked;
    if (codeEl) codeEl.disabled = locked;
    if (testInputEl) testInputEl.disabled = locked;
    if (addRuleBtn) addRuleBtn.disabled = locked;
    if (deletePluginBtn) deletePluginBtn.disabled = locked;

    // Radios de cible
    var radios = document.querySelectorAll('input[name="plugin-target"]');
    for (var i = 0; i < radios.length; i++) radios[i].disabled = locked;

    // Bannière
    if (banner) {
      if (locked) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
    }

    // Bouton cadenas
    if (lockBtn) {
      lockBtn.textContent = locked ? '🔒' : '🔓';
      lockBtn.title = locked ? 'Déverrouiller le plugin' : 'Verrouiller le plugin';
      if (locked) lockBtn.classList.add('locked');
      else lockBtn.classList.remove('locked');
    }

    // Éléments dans les règles
    var rulesContainer = document.getElementById('rules-container');
    if (rulesContainer) {
      var inputs = rulesContainer.querySelectorAll('input, select, button, textarea');
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = locked;
    }
  }

  /* ─────────────────────────────────────
     SIDEBAR
     ───────────────────────────────────── */

  function navigateToChapter(index) {
    Chapters.navigateTo(index).then(function (chapter) {
      Editor.setContent(chapter.content);
      Preview.renderPreview(Editor.getContent());
      renderSidebar();
      updateCurrentChapterTitle();
      Stats.updateStats();
      Editor.focus();
    });
  }

  function saveCurrentChapter() {
    var current = Chapters.getCurrentChapter();
    if (!current) return Promise.resolve();
    var content = Editor.getContent();
    Chapters.updateCurrentContent(content);
    return DB.saveChapter(current.id, _projectUuid, content);
  }

  function renderSidebar() {
    var list = document.getElementById('chapter-list');
    if (!list) return;
    list.innerHTML = '';

    var chapters = Chapters.getAll();
    var currentIndex = Chapters.getCurrentIndex();

    for (var i = 0; i < chapters.length; i++) {
      (function (index) {
        var ch = chapters[index];
        var li = document.createElement('li');
        li.className = 'chapter-item' + (index === currentIndex ? ' active' : '');
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-index', index);

        var handle = document.createElement('span');
        handle.className = 'chapter-drag-handle';
        handle.textContent = '⠿';
        li.appendChild(handle);

        var num = document.createElement('span');
        num.className = 'chapter-number';
        num.textContent = (index + 1) + '.';
        li.appendChild(num);

        var titleSpan = document.createElement('span');
        titleSpan.className = 'chapter-title';
        titleSpan.textContent = ch.title;
        li.appendChild(titleSpan);

        var delBtn = document.createElement('button');
        delBtn.className = 'chapter-delete-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Supprimer ce chapitre';
        li.appendChild(delBtn);

        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (_renameInProgress) return;
          if (Chapters.getCount() <= 1) { showStatus('Impossible de supprimer le dernier chapitre.'); return; }
          if (!confirm('Supprimer le chapitre "' + ch.title + '" ?')) return;
          Chapters.deleteChapter(index).then(function (newIndex) { navigateToChapter(newIndex); });
        });

        li.addEventListener('click', function (e) {
          if (_renameInProgress) return;
          if (e.target === delBtn) return;
          if (_navTimer) clearTimeout(_navTimer);
          _navTimer = setTimeout(function () {
            if (_renameInProgress) return;
            if (index !== Chapters.getCurrentIndex()) navigateToChapter(index);
          }, 280);
        });

        li.addEventListener('dblclick', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (_navTimer) { clearTimeout(_navTimer); _navTimer = null; }
          if (_renameInProgress) return;
          _renameInProgress = true;

          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'chapter-rename-input';
          input.value = ch.title;
          titleSpan.replaceWith(input);
          input.focus(); input.select();

          var finished = false;
          input.addEventListener('click', function (ev) { ev.stopPropagation(); });
          input.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

          function finishRename(save) {
            if (finished) return;
            finished = true;
            var newTitle = input.value.trim();
            if (save && newTitle && newTitle !== ch.title) {
              Chapters.renameChapter(index, newTitle).then(function () { renderSidebar(); updateCurrentChapterTitle(); });
            } else { renderSidebar(); }
            setTimeout(function () { _renameInProgress = false; }, 50);
          }

          input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); finishRename(true); }
            else if (ev.key === 'Escape') { ev.preventDefault(); finishRename(false); }
          });
          input.addEventListener('blur', function () { setTimeout(function () { finishRename(true); }, 50); });
        });

        li.addEventListener('dragstart', function (e) {
          if (_renameInProgress) { e.preventDefault(); return; }
          e.dataTransfer.setData('text/plain', String(index));
          e.dataTransfer.effectAllowed = 'move';
          li.classList.add('dragging');
        });
        li.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; li.classList.add('drag-over'); });
        li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
        li.addEventListener('drop', function (e) {
          e.preventDefault(); li.classList.remove('drag-over');
          var fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (!isNaN(fromIndex) && fromIndex !== index) {
            Chapters.moveChapter(fromIndex, index).then(function () { renderSidebar(); });
          }
        });
        li.addEventListener('dragend', function () {
          li.classList.remove('dragging');
          var items = list.querySelectorAll('.drag-over');
          for (var d = 0; d < items.length; d++) items[d].classList.remove('drag-over');
        });

        list.appendChild(li);
      })(i);
    }

    var activeItem = list.querySelector('.chapter-item.active');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  }

  function updateCurrentChapterTitle() { /* Titre visible via la sidebar */ }

  /* ─────────────────────────────────────
     MESSAGES ET INDICATEURS
     ───────────────────────────────────── */

  function showStatus(message, duration) {
    var el = document.getElementById('status-message');
    if (!el) return;
    duration = duration || 3000;
    el.textContent = message;
    el.style.opacity = '1';
    setTimeout(function () { el.style.opacity = '0'; }, duration);
  }

  function setAutosaveState(state) {
    var el = document.getElementById('autosave-indicator');
    if (el) el.setAttribute('data-state', state);
  }

  function setEpubOverlay(visible) {
    var el = document.getElementById('epub-overlay');
    if (el) { if (visible) el.classList.remove('hidden'); else el.classList.add('hidden'); }
  }

  function getBookMeta() {
    var titleEl = document.getElementById('meta-title');
    var authorEl = document.getElementById('meta-author');
    var langEl = document.getElementById('meta-language');
    return {
      title: titleEl ? titleEl.value : 'Mon livre',
      author: authorEl ? authorEl.value : '',
      language: (langEl && langEl.value.trim()) ? langEl.value.trim() : 'fr'
    };
  }

  /* ─────────────────────────────────────
     PANNEAU SÉQUENCES SPÉCIALES
     ───────────────────────────────────── */

  function renderSequencesPanel() {
    var body = document.getElementById('sequences-body');
    if (!body) return;

    var catalog = Corrections.getSequencesCatalog();

    // Grouper par catégorie
    var categories = {};
    for (var i = 0; i < catalog.length; i++) {
      var cat = catalog[i].category || 'Autres';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(catalog[i]);
    }

    var html = '';
    var catNames = Object.keys(categories);
    for (var c = 0; c < catNames.length; c++) {
      var name = catNames[c];
      var items = categories[name];
      html += '<div class="seq-category">';
      html += '<h3>' + escapeHtml(name) + '</h3>';
      html += '<table class="seq-table">';
      html += '<thead><tr><th>Séquence</th><th>Nom</th><th>Description</th></tr></thead>';
      html += '<tbody>';
      for (var s = 0; s < items.length; s++) {
        html += '<tr>';
        html += '<td><code>' + escapeHtml(items[s].sequence) + '</code></td>';
        html += '<td>' + escapeHtml(items[s].label) + '</td>';
        html += '<td>' + escapeHtml(items[s].description) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    body.innerHTML = html;
  }

  /* ─────────────────────────────────────
     PANNEAU PLUGINS
     ───────────────────────────────────── */

  var CONDITION_LABELS = {
    'text_contains': 'Le texte contient',
    'text_contains_ci': 'Le texte contient (insensible casse)',
    'text_matches_regex': 'Le texte correspond à la regex',
    'line_starts_with': 'La ligne commence par',
    'line_ends_with': 'La ligne se termine par',
    'preceded_by': 'Précédé par',
    'followed_by': 'Suivi par'
  };

  var ACTION_LABELS = {
    'replace_with': 'Remplacer par',
    'insert_before': 'Insérer avant',
    'insert_after': 'Insérer après',
    'delete': 'Supprimer',
    'wrap_with': 'Encadrer avec (avant|après)'
  };

  var TARGET_LABELS = { 'preview': 'Preview', 'editor': 'Éditeur', 'both': 'Les deux' };

  function renderPluginsList() {
    var list = document.getElementById('plugins-list');
    if (!list) return;
    list.innerHTML = '';
    var plugins = Corrections.getPlugins();

    for (var i = 0; i < plugins.length; i++) {
      (function (plugin) {
        var li = document.createElement('li');
        li.className = 'plugin-item' + (plugin.id === _selectedPluginId ? ' active' : '');
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-plugin-id', plugin.id);

        var handle = document.createElement('span');
        handle.className = 'plugin-drag-handle';
        handle.textContent = '⠿';
        li.appendChild(handle);

        // Icône cadenas si verrouillé
        if (plugin.locked) {
          var lockIcon = document.createElement('span');
          lockIcon.className = 'plugin-lock-icon';
          lockIcon.textContent = '🔒';
          lockIcon.title = 'Plugin verrouillé';
          li.appendChild(lockIcon);
        }

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = plugin.enabled;
        checkbox.title = plugin.enabled ? 'Désactiver' : 'Activer';
        li.appendChild(checkbox);

        var nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.88em;';
        nameSpan.textContent = plugin.name;
        li.appendChild(nameSpan);

        var badge = document.createElement('span');
        badge.className = 'plugin-target-badge';
        badge.textContent = TARGET_LABELS[plugin.target] || plugin.target;
        li.appendChild(badge);

        checkbox.addEventListener('change', function (e) {
          e.stopPropagation();
          Corrections.togglePlugin(plugin.id, checkbox.checked).then(function () {
            Preview.renderPreview(Editor.getContent());
          });
        });

        li.addEventListener('click', function (e) {
          if (e.target === checkbox) return;
          selectPlugin(plugin.id);
        });

        li.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', plugin.id);
          e.dataTransfer.effectAllowed = 'move';
          li.classList.add('dragging');
        });
        li.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; li.classList.add('drag-over'); });
        li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
        li.addEventListener('drop', function (e) {
          e.preventDefault(); li.classList.remove('drag-over');
          var fromId = e.dataTransfer.getData('text/plain');
          if (fromId === plugin.id) return;
          var plugins2 = Corrections.getPlugins();
          var ids = plugins2.map(function (p) { return p.id; });
          var fromIdx = ids.indexOf(fromId);
          if (fromIdx === -1) return;
          ids.splice(fromIdx, 1);
          ids.splice(ids.indexOf(plugin.id), 0, fromId);
          Corrections.reorderPlugins(ids).then(function () { renderPluginsList(); Preview.renderPreview(Editor.getContent()); });
        });
        li.addEventListener('dragend', function () {
          li.classList.remove('dragging');
          var items = list.querySelectorAll('.drag-over');
          for (var d = 0; d < items.length; d++) items[d].classList.remove('drag-over');
        });

        list.appendChild(li);
      })(plugins[i]);
    }
  }

  function selectPlugin(pluginId) {
    _selectedPluginId = pluginId;
    _codeManuallyEdited = false;

    var plugins = Corrections.getPlugins();
    var plugin = null;
    for (var i = 0; i < plugins.length; i++) {
      if (plugins[i].id === pluginId) { plugin = plugins[i]; break; }
    }
    if (!plugin) { clearPluginEditor(); return; }

    var nameEl = document.getElementById('plugin-name');
    if (nameEl) nameEl.value = plugin.name;

    var radios = document.querySelectorAll('input[name="plugin-target"]');
    for (var r = 0; r < radios.length; r++) radios[r].checked = (radios[r].value === plugin.target);

    var warning = document.getElementById('plugin-editor-warning');
    if (warning) {
      if (plugin.target === 'editor' || plugin.target === 'both') warning.classList.remove('hidden');
      else warning.classList.add('hidden');
    }

    renderRulesUI(plugin.rules || []);

    var codeEl = document.getElementById('plugin-code');
    if (codeEl) codeEl.value = plugin.code || '';

    var codeWarning = document.getElementById('plugin-code-warning');
    if (codeWarning) codeWarning.classList.add('hidden');

    var testInput = document.getElementById('plugin-test-input');
    if (testInput) testInput.value = plugin.testInput || '';

    // Appliquer le verrouillage
    setPluginEditorLocked(!!plugin.locked);

    triggerPluginPreview();
    renderPluginsList();
  }

  function clearPluginEditor() {
    _selectedPluginId = null;
    _codeManuallyEdited = false;
    var nameEl = document.getElementById('plugin-name'); if (nameEl) nameEl.value = '';
    var codeEl = document.getElementById('plugin-code'); if (codeEl) codeEl.value = '';
    var testInput = document.getElementById('plugin-test-input'); if (testInput) testInput.value = '';
    var rulesContainer = document.getElementById('rules-container'); if (rulesContainer) rulesContainer.innerHTML = '';
    var output = document.getElementById('plugin-test-output'); if (output) output.innerHTML = '';
    var errorEl = document.getElementById('plugin-test-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    var warning = document.getElementById('plugin-editor-warning'); if (warning) warning.classList.add('hidden');
    var codeWarning = document.getElementById('plugin-code-warning'); if (codeWarning) codeWarning.classList.add('hidden');
    var banner = document.getElementById('plugin-locked-banner'); if (banner) banner.classList.add('hidden');
    setPluginEditorLocked(false);
  }

  function renderRulesUI(rules) {
    var container = document.getElementById('rules-container');
    if (!container) return;
    container.innerHTML = '';
    for (var r = 0; r < rules.length; r++) {
      container.appendChild(createRuleBlock(rules[r], r));
    }
  }

  function createRuleBlock(rule, ruleIndex) {
    var block = document.createElement('div');
    block.className = 'rule-block';
    block.setAttribute('data-rule-id', rule.id);

    var header = document.createElement('div');
    header.className = 'rule-header';
    header.innerHTML = '<span>Règle ' + (ruleIndex + 1) + '</span>';
    var deleteRuleBtn = document.createElement('button');
    deleteRuleBtn.textContent = '✕';
    deleteRuleBtn.title = 'Supprimer cette règle';
    deleteRuleBtn.addEventListener('click', function () {
      if (isSelectedPluginLocked()) return;
      block.remove(); onRulesChanged();
    });
    header.appendChild(deleteRuleBtn);
    block.appendChild(header);

    var conditionsContainer = document.createElement('div');
    conditionsContainer.className = 'conditions-container';
    var conditions = rule.conditions || [{ type: 'text_contains', value: '' }];
    for (var c = 0; c < conditions.length; c++) {
      conditionsContainer.appendChild(createConditionLine(conditions[c], c, conditions.length, conditionsContainer));
    }
    block.appendChild(conditionsContainer);

    var logicDiv = document.createElement('div');
    logicDiv.className = 'logic-selector' + (conditions.length < 2 ? ' hidden-logic' : '');
    logicDiv.innerHTML = '<span>Logique : </span>';
    var logicSelect = document.createElement('select');
    logicSelect.className = 'logic-select';
    logicSelect.innerHTML = '<option value="AND">ET (toutes)</option><option value="OR">OU (au moins une)</option>';
    logicSelect.value = rule.logic || 'AND';
    logicSelect.addEventListener('change', function () { if (!isSelectedPluginLocked()) onRulesChanged(); });
    logicDiv.appendChild(logicSelect);
    block.appendChild(logicDiv);

    var addCondBtn = document.createElement('button');
    addCondBtn.className = 'btn-add-condition';
    addCondBtn.textContent = '＋ Ajouter une condition';
    addCondBtn.addEventListener('click', function () {
      if (isSelectedPluginLocked()) return;
      conditionsContainer.appendChild(createConditionLine({ type: 'text_contains', value: '' }, conditionsContainer.children.length, conditionsContainer.children.length + 1, conditionsContainer));
      if (conditionsContainer.children.length >= 2) logicDiv.classList.remove('hidden-logic');
      updateConditionLabels(conditionsContainer);
      onRulesChanged();
    });
    block.appendChild(addCondBtn);

    var actionDiv = document.createElement('div');
    actionDiv.className = 'action-line';
    actionDiv.innerHTML = '<span class="action-label">ALORS</span>';

    var actionSelect = document.createElement('select');
    actionSelect.className = 'action-type-select';
    var actionKeys = Object.keys(ACTION_LABELS);
    for (var a = 0; a < actionKeys.length; a++) {
      actionSelect.innerHTML += '<option value="' + actionKeys[a] + '">' + ACTION_LABELS[actionKeys[a]] + '</option>';
    }
    actionSelect.value = rule.action || 'replace_with';
    actionSelect.addEventListener('change', function () { if (!isSelectedPluginLocked()) onRulesChanged(); });
    actionDiv.appendChild(actionSelect);

    var actionInput = document.createElement('input');
    actionInput.type = 'text';
    actionInput.className = 'action-value-input';
    actionInput.value = rule.actionValue || '';
    actionInput.placeholder = 'Valeur (séquences $xxx disponibles)';
    actionInput.addEventListener('input', function () { if (!isSelectedPluginLocked()) onRulesChanged(); });
    actionDiv.appendChild(actionInput);
    block.appendChild(actionDiv);

    var helpDiv = document.createElement('div');
    helpDiv.className = 'rule-help';
    helpDiv.innerHTML = 'Séquences : <code>\\n</code> <code>\\t</code> <code>\\u00A0</code> <code>\\u00AB</code> <code>\\u00BB</code> ' +
      '<code>$mot</code> <code>$ponctuation</code> <code>$nombre</code> <code>$espace</code> … ' +
      '<em>Cliquez "📖 Séquences" pour la liste complète.</em>';
    block.appendChild(helpDiv);

    return block;
  }

  function createConditionLine(cond, condIndex, totalConditions, conditionsContainer) {
    var line = document.createElement('div');
    line.className = 'condition-line';

    var label = document.createElement('span');
    label.className = 'condition-label';
    label.textContent = condIndex === 0 ? 'SI' : 'ET SI';
    line.appendChild(label);

    var typeSelect = document.createElement('select');
    typeSelect.className = 'condition-type-select';
    var condKeys = Object.keys(CONDITION_LABELS);
    for (var k = 0; k < condKeys.length; k++) {
      typeSelect.innerHTML += '<option value="' + condKeys[k] + '">' + CONDITION_LABELS[condKeys[k]] + '</option>';
    }
    typeSelect.value = cond.type || 'text_contains';
    typeSelect.addEventListener('change', function () { if (!isSelectedPluginLocked()) onRulesChanged(); });
    line.appendChild(typeSelect);

    var valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'condition-value-input';
    valInput.value = cond.value || '';
    valInput.placeholder = 'Valeur (séquences $xxx disponibles)';
    valInput.addEventListener('input', function () { if (!isSelectedPluginLocked()) onRulesChanged(); });
    line.appendChild(valInput);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'condition-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Retirer cette condition';
    removeBtn.style.display = (totalConditions > 1) ? '' : 'none';
    removeBtn.addEventListener('click', function () {
      if (isSelectedPluginLocked()) return;
      line.remove();
      var ruleBlock = conditionsContainer.parentElement;
      var logicEl = ruleBlock.querySelector('.logic-selector');
      if (conditionsContainer.children.length < 2 && logicEl) logicEl.classList.add('hidden-logic');
      updateConditionLabels(conditionsContainer);
      onRulesChanged();
    });
    line.appendChild(removeBtn);
    return line;
  }

  function updateConditionLabels(conditionsContainer) {
    var lines = conditionsContainer.querySelectorAll('.condition-line');
    for (var i = 0; i < lines.length; i++) {
      var label = lines[i].querySelector('.condition-label');
      if (label) label.textContent = (i === 0) ? 'SI' : 'ET SI';
      var removeBtn = lines[i].querySelector('.condition-remove-btn');
      if (removeBtn) removeBtn.style.display = (lines.length > 1) ? '' : 'none';
    }
  }

  function collectRulesFromDOM() {
    var container = document.getElementById('rules-container');
    if (!container) return [];
    var blocks = container.querySelectorAll('.rule-block');
    var rules = [];
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var ruleId = block.getAttribute('data-rule-id') || DB.generateUUID();
      var logicSelect = block.querySelector('.logic-select');
      var logic = (logicSelect && logicSelect.value) || 'AND';
      var condLines = block.querySelectorAll('.condition-line');
      var conditions = [];
      for (var c = 0; c < condLines.length; c++) {
        conditions.push({
          type: (condLines[c].querySelector('.condition-type-select') || {}).value || 'text_contains',
          value: (condLines[c].querySelector('.condition-value-input') || {}).value || ''
        });
      }
      rules.push({
        id: ruleId, logic: logic, conditions: conditions,
        action: (block.querySelector('.action-type-select') || {}).value || 'replace_with',
        actionValue: (block.querySelector('.action-value-input') || {}).value || ''
      });
    }
    return rules;
  }

  function onRulesChanged() {
    if (!_selectedPluginId || isSelectedPluginLocked()) return;

    var plugins = Corrections.getPlugins();
    var plugin = null;
    for (var i = 0; i < plugins.length; i++) {
      if (plugins[i].id === _selectedPluginId) { plugin = JSON.parse(JSON.stringify(plugins[i])); break; }
    }
    if (!plugin) return;

    var rules = collectRulesFromDOM();

    if (_codeManuallyEdited) {
      var codeWarning = document.getElementById('plugin-code-warning');
      if (codeWarning) codeWarning.classList.remove('hidden');
      if (!confirm('Le code JavaScript a été modifié manuellement. La régénération écrasera vos modifications. Continuer ?')) return;
    }

    var code = Corrections.generateCodeFromRules(rules);
    plugin.rules = rules;
    plugin.code = code;
    var codeEl = document.getElementById('plugin-code');
    if (codeEl) codeEl.value = code;
    _codeManuallyEdited = false;
    var cw2 = document.getElementById('plugin-code-warning');
    if (cw2) cw2.classList.add('hidden');

    Corrections.savePlugin(plugin).then(function () {
      triggerPluginPreview();
      Preview.renderPreview(Editor.getContent());
    });
  }

  function triggerPluginPreview() {
    if (_pluginPreviewTimer) clearTimeout(_pluginPreviewTimer);
    _pluginPreviewTimer = setTimeout(function () {
      if (!_selectedPluginId) return;
      var plugin = getSelectedPlugin();
      if (!plugin) return;
      var testInput = document.getElementById('plugin-test-input');
      var testText = testInput ? testInput.value : '';
      var codeEl = document.getElementById('plugin-code');
      var currentCode = codeEl ? codeEl.value : plugin.code;
      var tempPlugin = { id: plugin.id, name: plugin.name, enabled: true, order: 0, target: plugin.target, rules: plugin.rules, code: currentCode, testInput: testText, locked: false };
      var result = Corrections.testPlugin(tempPlugin, testText);
      var outputEl = document.getElementById('plugin-test-output');
      var errorEl = document.getElementById('plugin-test-error');
      if (result.error) {
        if (outputEl) outputEl.textContent = testText;
        if (errorEl) { errorEl.textContent = 'Erreur : ' + result.error; errorEl.classList.remove('hidden'); }
      } else {
        if (outputEl) outputEl.innerHTML = buildDiffHtml(testText, result.output);
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      }
    }, 300);
  }

  function buildDiffHtml(original, modified) {
    if (original === modified) return escapeHtml(modified);
    var origTokens = tokenize(original);
    var modTokens = tokenize(modified);
    var lcs = computeLCS(origTokens, modTokens);
    var html = '';
    var oi = 0, mi = 0, li = 0;
    while (oi < origTokens.length || mi < modTokens.length) {
      if (li < lcs.length && oi < origTokens.length && mi < modTokens.length && origTokens[oi] === lcs[li] && modTokens[mi] === lcs[li]) {
        html += escapeHtml(origTokens[oi]); oi++; mi++; li++;
      } else if (li < lcs.length && mi < modTokens.length && modTokens[mi] !== lcs[li]) {
        html += '<span class="diff-added">' + escapeHtml(modTokens[mi]) + '</span>'; mi++;
      } else if (li < lcs.length && oi < origTokens.length && origTokens[oi] !== lcs[li]) {
        html += '<span class="diff-removed">' + escapeHtml(origTokens[oi]) + '</span>'; oi++;
      } else if (li >= lcs.length && oi < origTokens.length) {
        html += '<span class="diff-removed">' + escapeHtml(origTokens[oi]) + '</span>'; oi++;
      } else if (li >= lcs.length && mi < modTokens.length) {
        html += '<span class="diff-added">' + escapeHtml(modTokens[mi]) + '</span>'; mi++;
      } else break;
    }
    return html;
  }

  function tokenize(text) { if (!text) return []; return text.match(/\S+|\s+/g) || []; }

  function computeLCS(a, b) {
    var m = a.length, n = b.length;
    if (m > 1000 || n > 1000) return [];
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = []; for (var j = 0; j <= n; j++) { if (i === 0 || j === 0) dp[i][j] = 0; else if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1] + 1; else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]); } }
    var result = []; var x = m, y = n;
    while (x > 0 && y > 0) { if (a[x-1] === b[y-1]) { result.unshift(a[x-1]); x--; y--; } else if (dp[x-1][y] > dp[x][y-1]) x--; else y--; }
    return result;
  }

  function getSelectedPlugin() {
    if (!_selectedPluginId) return null;
    var plugins = Corrections.getPlugins();
    for (var i = 0; i < plugins.length; i++) {
      if (plugins[i].id === _selectedPluginId) return plugins[i];
    }
    return null;
  }

  /* ─────────────────────────────────────
     INITIALISATION
     ───────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    var loadingMessage = document.getElementById('loading-message');
    var loadingScreen = document.getElementById('loading-screen');

    function showLoadingError(msg) {
      if (loadingMessage) { loadingMessage.textContent = 'Erreur : ' + msg; loadingMessage.style.color = '#a0522d'; }
      console.error('[Initialisation]', msg);
    }

    (function initSequence() {
      try {
        if (typeof CodeMirror === 'undefined') throw new Error('CodeMirror non disponible.');
        if (typeof marked === 'undefined') throw new Error('marked.js non disponible.');
        if (typeof DOMPurify === 'undefined') throw new Error('DOMPurify non disponible.');
        if (typeof JSZip === 'undefined') throw new Error('JSZip non disponible.');

        DB.openDB().then(function () {
          return DB.getOrCreateProjectUuid();
        }).then(function (uuid) {
          _projectUuid = uuid;
          return DB.loadProject(uuid);
        }).then(function (project) {
          if (project) {
            var titleEl = document.getElementById('meta-title');
            var authorEl = document.getElementById('meta-author');
            var langEl = document.getElementById('meta-language');
            if (titleEl) titleEl.value = project.title || '';
            if (authorEl) authorEl.value = project.author || '';
            if (langEl) langEl.value = project.language || 'fr';
          }
          return Corrections.loadPlugins();
        }).then(function () {
          return Chapters.loadAllChapters(_projectUuid);
        }).then(function () {
          Editor.init(document.getElementById('editor-container'), _projectUuid);
          Preview.init(document.getElementById('preview-content'));
          renderSidebar();
          updateCurrentChapterTitle();
          var firstChapter = Chapters.getCurrentChapter();
          if (firstChapter) Editor.setContent(firstChapter.content);
          Preview.renderPreview(Editor.getContent());
          Stats.updateStats();

          var savedTheme = localStorage.getItem('theme');
          if (savedTheme === 'dark') { document.body.classList.add('dark-theme'); Editor.setTheme(true); }

          var savedFontSize = localStorage.getItem('fontSize');
          if (savedFontSize) { var size = parseInt(savedFontSize, 10); if (!isNaN(size) && size >= 10 && size <= 24) Editor.setFontSize(size); }

          attachEventListeners();

          if (loadingScreen) loadingScreen.classList.add('hidden');
          Editor.focus();
        }).catch(function (err) { showLoadingError(err.message || String(err)); });
      } catch (err) { showLoadingError(err.message || String(err)); }
    })();
  });

  function attachEventListeners() {

    document.getElementById('btn-add-chapter').addEventListener('click', function () {
      Chapters.createChapter(Chapters.getCurrentIndex()).then(function (newIndex) { navigateToChapter(newIndex); });
    });

    document.getElementById('btn-font-down').addEventListener('click', function () {
      var size = Editor.getFontSize(); if (size > 10) { size--; Editor.setFontSize(size); localStorage.setItem('fontSize', String(size)); }
    });

    document.getElementById('btn-font-up').addEventListener('click', function () {
      var size = Editor.getFontSize(); if (size < 24) { size++; Editor.setFontSize(size); localStorage.setItem('fontSize', String(size)); }
    });

    document.getElementById('btn-theme').addEventListener('click', function () {
      var isDark = document.body.classList.toggle('dark-theme');
      Editor.setTheme(isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    ['meta-title', 'meta-author', 'meta-language'].forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (el) el.addEventListener('input', function () {
        var meta = getBookMeta();
        DB.loadProject(_projectUuid).then(function (project) {
          if (project) { project.title = meta.title; project.author = meta.author; project.language = meta.language; return DB.saveProject(project); }
        });
      });
    });

    var fileImportMd = document.getElementById('file-import-md');
    document.getElementById('btn-import').addEventListener('click', function () { fileImportMd.click(); });
    fileImportMd.addEventListener('change', function () {
      var file = fileImportMd.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        Chapters.replaceAllFromMarkdown(e.target.result, _projectUuid).then(function (count) {
          navigateToChapter(0); showStatus(count + ' chapitre(s) importé(s).');
        }).catch(function (err) { showStatus('Erreur : ' + err.message); });
      };
      reader.readAsText(file, 'UTF-8'); fileImportMd.value = '';
    });

    document.getElementById('btn-export-md').addEventListener('click', function () {
      saveCurrentChapter().then(function () { ExportMD.exportMarkdown(getBookMeta().title); });
    });

    document.getElementById('btn-export-html').addEventListener('click', function () {
      saveCurrentChapter().then(function () { ExportHTML.exportHTML(getBookMeta()); });
    });

    document.getElementById('btn-export-epub').addEventListener('click', function () {
      saveCurrentChapter().then(function () { ExportEPUB.exportEPUB(getBookMeta()); });
    });

    var pluginsPanel = document.getElementById('plugins-panel');
    document.getElementById('btn-plugins').addEventListener('click', function () {
      pluginsPanel.classList.remove('hidden'); renderPluginsList();
    });
    document.getElementById('btn-close-plugins').addEventListener('click', function () {
      pluginsPanel.classList.add('hidden');
    });

    // Panneau séquences spéciales
    var sequencesPanel = document.getElementById('sequences-panel');
    document.getElementById('btn-sequences-help').addEventListener('click', function () {
      renderSequencesPanel();
      sequencesPanel.classList.remove('hidden');
    });
    document.getElementById('btn-close-sequences').addEventListener('click', function () {
      sequencesPanel.classList.add('hidden');
    });

    document.getElementById('btn-new-plugin').addEventListener('click', function () {
      var plugins = Corrections.getPlugins();
      var newPlugin = {
        id: DB.generateUUID(), name: 'Nouveau plugin', enabled: true,
        order: plugins.length, target: 'preview', rules: [], code: '',
        testInput: 'Texte de test avec des "guillemets" et des points de suspension...',
        locked: false
      };
      Corrections.savePlugin(newPlugin).then(function () { renderPluginsList(); selectPlugin(newPlugin.id); });
    });

    document.getElementById('btn-delete-plugin').addEventListener('click', function () {
      if (!_selectedPluginId) return;
      if (isSelectedPluginLocked()) { showStatus('Ce plugin est verrouillé. Déverrouillez-le d\'abord.'); return; }
      var plugin = getSelectedPlugin();
      if (!confirm('Supprimer le plugin "' + (plugin ? plugin.name : '') + '" ?')) return;
      Corrections.deletePlugin(_selectedPluginId).then(function () {
        _selectedPluginId = null; clearPluginEditor(); renderPluginsList(); Preview.renderPreview(Editor.getContent());
      });
    });

    document.getElementById('btn-export-plugins').addEventListener('click', function () {
      var json = Corrections.exportPlugins();
      downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), 'plugins.json');
      showStatus('Plugins exportés.');
    });

    var fileImportPlugins = document.getElementById('file-import-plugins');
    document.getElementById('btn-import-plugins').addEventListener('click', function () { fileImportPlugins.click(); });
    fileImportPlugins.addEventListener('change', function () {
      var file = fileImportPlugins.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        Corrections.importPlugins(e.target.result).then(function () {
          renderPluginsList(); Preview.renderPreview(Editor.getContent()); showStatus('Plugins importés.');
        }).catch(function (err) { showStatus('Erreur : ' + err.message); });
      };
      reader.readAsText(file, 'UTF-8'); fileImportPlugins.value = '';
    });

    // ─── Verrouillage plugin ───
    document.getElementById('btn-lock-plugin').addEventListener('click', function () {
      if (!_selectedPluginId) return;
      var plugin = getSelectedPlugin();
      if (!plugin) return;
      var newLocked = !plugin.locked;
      Corrections.lockPlugin(_selectedPluginId, newLocked).then(function () {
        setPluginEditorLocked(newLocked);
        renderPluginsList();
        showStatus(newLocked ? 'Plugin verrouillé.' : 'Plugin déverrouillé.');
      });
    });

    // ─── Nom plugin ───
    document.getElementById('plugin-name').addEventListener('input', function () {
      if (!_selectedPluginId || isSelectedPluginLocked()) return;
      var el = this;
      if (_pluginSaveTimer) clearTimeout(_pluginSaveTimer);
      _pluginSaveTimer = setTimeout(function () {
        var plugin = getSelectedPlugin(); if (!plugin) return;
        var updated = JSON.parse(JSON.stringify(plugin));
        updated.name = el.value || 'Sans nom';
        Corrections.savePlugin(updated).then(function () { renderPluginsList(); });
      }, 300);
    });

    // ─── Cible plugin ───
    var targetRadios = document.querySelectorAll('input[name="plugin-target"]');
    for (var tr = 0; tr < targetRadios.length; tr++) {
      targetRadios[tr].addEventListener('change', function () {
        if (!_selectedPluginId || isSelectedPluginLocked()) return;
        var newTarget = this.value;
        var plugin = getSelectedPlugin(); if (!plugin) return;
        var updated = JSON.parse(JSON.stringify(plugin));
        updated.target = newTarget;
        var warning = document.getElementById('plugin-editor-warning');
        if (warning) { if (newTarget === 'editor' || newTarget === 'both') warning.classList.remove('hidden'); else warning.classList.add('hidden'); }
        Corrections.savePlugin(updated).then(function () {
          renderPluginsList();
          if (newTarget === 'editor' || newTarget === 'both') {
            var current = Chapters.getCurrentChapter();
            if (current) Editor.setContent(current.content);
          }
          Preview.renderPreview(Editor.getContent());
        });
      });
    }

    // ─── Onglets plugin ───
    var pluginTabs = document.querySelectorAll('.plugin-tab');
    for (var pt = 0; pt < pluginTabs.length; pt++) {
      pluginTabs[pt].addEventListener('click', function () {
        var tabName = this.getAttribute('data-tab');
        document.querySelectorAll('.plugin-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
        var rulesTab = document.getElementById('tab-rules');
        var codeTab = document.getElementById('tab-code');
        if (tabName === 'rules') { if (rulesTab) rulesTab.classList.remove('hidden'); if (codeTab) codeTab.classList.add('hidden'); }
        else { if (rulesTab) rulesTab.classList.add('hidden'); if (codeTab) codeTab.classList.remove('hidden'); }
        triggerPluginPreview();
      });
    }

    // ─── Ajout règle ───
    document.getElementById('btn-add-rule').addEventListener('click', function () {
      if (!_selectedPluginId || isSelectedPluginLocked()) return;
      var container = document.getElementById('rules-container');
      if (container) {
        container.appendChild(createRuleBlock({
          id: DB.generateUUID(), logic: 'AND',
          conditions: [{ type: 'text_contains', value: '' }],
          action: 'replace_with', actionValue: ''
        }, container.children.length));
      }
      onRulesChanged();
    });

    // ─── Code JS ───
    document.getElementById('plugin-code').addEventListener('input', function () {
      if (!_selectedPluginId || isSelectedPluginLocked()) return;
      _codeManuallyEdited = true;
      var el = this;
      if (_pluginSaveTimer) clearTimeout(_pluginSaveTimer);
      _pluginSaveTimer = setTimeout(function () {
        var plugin = getSelectedPlugin(); if (!plugin) return;
        var updated = JSON.parse(JSON.stringify(plugin));
        updated.code = el.value;
        Corrections.savePlugin(updated).then(function () { Preview.renderPreview(Editor.getContent()); });
      }, 400);
      triggerPluginPreview();
    });

    // ─── Texte test ───
    document.getElementById('plugin-test-input').addEventListener('input', function () {
      if (!_selectedPluginId) return;
      var el = this;
      if (_pluginSaveTimer) clearTimeout(_pluginSaveTimer);
      _pluginSaveTimer = setTimeout(function () {
        var plugin = getSelectedPlugin(); if (!plugin) return;
        var updated = JSON.parse(JSON.stringify(plugin));
        updated.testInput = el.value;
        Corrections.savePlugin(updated);
      }, 400);
      triggerPluginPreview();
    });

    window.addEventListener('resize', function () { Editor.refresh(); });
  }

  /* ─────────────────────────────────────
     EXPOSITION PUBLIQUE
     ───────────────────────────────────── */
  window.UI = {
    renderSidebar: renderSidebar,
    updateCurrentChapterTitle: updateCurrentChapterTitle,
    showStatus: showStatus,
    setAutosaveState: setAutosaveState,
    setEpubOverlay: setEpubOverlay,
    getBookMeta: getBookMeta
  };

})();