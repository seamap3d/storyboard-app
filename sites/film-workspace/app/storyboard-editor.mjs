import { createShotCard } from './shot-card.mjs';
async function readTextFromFile(file) {
  return await file.text();
}

function extractScenes(rawText) {
  const lines = rawText.split(/\r?\n/);
  const scenes = [];
  let current = null;
  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line) continue;
    if (/^(INT\.|EXT\.)/i.test(line)) {
      if (current) scenes.push(current);
      current = { heading: line, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) scenes.push(current);
  return scenes;
}

function guessChars(block) {
  const names = [];
  if (/CHARACTER\s*A/i.test(block)) names.push('Character A');
  if (/CHARACTER\s*B/i.test(block)) names.push('Character B');
  if (/(PERSON|PROTAGONIST|HERO)/i.test(block)) names.push('Main Character');
  if (/(DETECTIVE|OFFICER)/i.test(block)) names.push('Detective');
  if (/(PARTNER|SIDEKICK)/i.test(block)) names.push('Partner');
  return names.length ? names.join(', ') : 'Characters TBD';
}

function deriveLocationFromHeading(heading) {
  const withoutPrefix = heading.replace(/^(INT\.|EXT\.)\s*/i, '');
  const locationPart = withoutPrefix.split(/[-–—]/)[0] || '';
  return locationPart.trim();
}

function buildShotPreset(scene) {
  const bodyText = scene.body.join('\n').trim();
  const summary = bodyText ? bodyText.slice(0, 600) : '';
  return {
    scene: scene.heading,
    type: /ESTABLISH|EXT\./i.test(scene.heading) ? 'Establishing' : 'Medium',
    desc: summary,
    chars: guessChars(bodyText),
    location: deriveLocationFromHeading(scene.heading),
    shootDate: '',
    equipment: '',
    props: '',
    notes: '',
    folded: false,
  };
}

function applyBreakdown(text) {
  const scenes = extractScenes(text);
  if (!scenes.length) {
    alert('No scene headings (INT. / EXT.) were detected in the uploaded script.');
    return;
  }
  resetShots();
  scenes.forEach((scene) => addShotFromData(buildShotPreset(scene)));
  renumber();
  saveLocal();
}
// --- State ---
const STORAGE_KEY = 'apeOnAWhaleStoryboard';
const LEGACY_STORAGE_KEY = 'grittyStoryboard';
let isHydrating = false;

let documentExtras = {};
let metadataExtras = {};
const state = {
  shots: [],
};

// --- Elements ---
const shotList = document.getElementById('shotList');
const tmpl = document.getElementById('shotTmpl');
const btnNew = document.getElementById('btnNew');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnPrint = document.getElementById('btnPrint');
const btnReset = document.getElementById('btnReset');
const btnFoldSelected = document.getElementById('btnFoldSelected');
const btnUnfoldSelected = document.getElementById('btnUnfoldSelected');
const btnClearSelection = document.getElementById('btnClearSelection');
const selectAllShots = document.getElementById('selectAllShots');
const scriptInput = document.getElementById('scriptInput');
const btnUploadScript = document.getElementById('btnUploadScript');
const fileInput = document.getElementById('fileInput');
const projTitle = document.getElementById('projTitle');
const director = document.getElementById('director');
const productionCompany = document.getElementById('productionCompany');
const dop = document.getElementById('dop');
const producer = document.getElementById('producer');
const shootSchedule = document.getElementById('shootSchedule');
const projNotes = document.getElementById('projNotes');
btnUploadScript.addEventListener('click', async () => {
  const scope = window.storyboard?.scope;
  const file = scriptInput.files && scriptInput.files[0];
  if (!file) {
    alert('Please select a text file.');
    return;
  }
  if (file.type && file.type !== 'text/plain') {
    const proceed = confirm('This file is not marked as plain text. Try to import it anyway?');
    if (!proceed) return;
  }
  try {
    const text = await readTextFromFile(file);
    if (scope !== window.storyboard?.scope) return;
    applyBreakdown(text);
    scriptInput.value = '';
  } catch (error) {
    console.error('Text parsing failed', error);
    alert('We couldn’t read that text file. Please try another file.');
  }
});

// --- Helpers ---
const uid = () => crypto.randomUUID();

function updateShotTitle(li) {
  const titleEl = li.querySelector('.shot-title');
  if (!titleEl) return;
  const sceneVal = li.querySelector('.scene')?.value.trim() || '';
  const shotNumVal = li.querySelector('.shotnum')?.value.trim() || '';
  let label = li.dataset.customTitle || sceneVal;
  if (!label) {
    const index = Array.from(shotList.children).indexOf(li);
    const fallbackNumber = index > -1 ? index + 1 : shotNumVal || '';
    label = fallbackNumber ? `Shot ${fallbackNumber}` : 'Shot';
  }
  titleEl.textContent = label;
}

function setShotFolded(li, folded) {
  const isFolded = Boolean(folded);
  const body = li.querySelector('.shot-body');
  const toggle = li.querySelector('.btnToggleFold');
  li.dataset.folded = isFolded ? 'true' : 'false';
  if (body) body.classList.toggle('hidden', isFolded);
  if (toggle) {
    toggle.textContent = isFolded ? 'Unfold' : 'Fold';
    toggle.setAttribute('aria-expanded', (!isFolded).toString());
    toggle.setAttribute('aria-label', isFolded ? 'Unfold shot details' : 'Fold shot details');
  }
  li.classList.toggle('opacity-60', isFolded);
}

function updateShotSelectionVisual(li, selected) {
  if (!li) return;
  li.classList.toggle('ring-2', selected);
  li.classList.toggle('ring-emerald-400', selected);
  li.classList.toggle('ring-opacity-60', selected);
}

function getSelectedShotLis() {
  return Array.from(shotList.querySelectorAll('.select-shot:checked'))
    .map((cb) => cb.closest('li'))
    .filter(Boolean);
}

function updateSelectAll() {
  const checkboxes = Array.from(shotList.querySelectorAll('.select-shot'));
  const selected = checkboxes.filter((cb) => cb.checked).length;
  selectAllShots.checked = checkboxes.length > 0 && selected === checkboxes.length;
  selectAllShots.indeterminate = selected > 0 && selected < checkboxes.length;
  selectAllShots.disabled = checkboxes.length === 0;
}

selectAllShots.addEventListener('change', () => {
  shotList.querySelectorAll('.select-shot').forEach((cb) => {
    cb.checked = selectAllShots.checked;
    updateShotSelectionVisual(cb.closest('li'), cb.checked);
  });
  updateSelectAll();
});

function clearShotSelection() {
  shotList.querySelectorAll('.select-shot').forEach((cb) => {
    cb.checked = false;
    updateShotSelectionVisual(cb.closest('li'), false);
  });
  updateSelectAll();
}

let draftStore;
let draftData = { meta: {}, shots: [] };
let draftSave = Promise.resolve();
let draftRevision = 0;
let draftUnsaved = false;
const draftStatus = document.getElementById('draftStatus');
function persistDraft() {
  const revision = ++draftRevision;
  const snapshot = structuredClone(draftData);
  draftUnsaved = true;
  draftStatus.textContent = 'Saving browser draft…';
  draftSave = draftSave
    .catch(() => {})
    .then(() => {
      if (!draftStore) throw new Error('Draft storage unavailable.');
      return draftStore.writeDraft(snapshot);
    })
    .then(() => {
      if (revision !== draftRevision) return;
      draftUnsaved = false;
      draftStatus.textContent = 'Browser draft saved on this device.';
    })
    .catch(() => {
      if (revision !== draftRevision) return;
      draftStatus.textContent =
        'Browser draft could not be saved on this device. Your changes remain open; export JSON or copy the draft to a shared project before closing.';
    });
}
function saveLocal() {
  if (isHydrating) return;
  document.dispatchEvent(new Event('storyboardchange'));
  if (window.storyboard?.mode === 'shared') {
    window.storyboard.onChange?.();
    return;
  }
  draftData = collectData();
  persistDraft();
}
async function loadLocal() {
  let readable = false;
  try {
    draftStore = await import('./local-draft.mjs');
    const saved = await draftStore.readDraft();
    readable = true;
    if (saved) {
      draftData = saved;
      hydrate(draftData);
      draftStatus.textContent = 'Browser draft saved on this device.';
      return;
    }
  } catch {
    draftStatus.textContent =
      'Browser draft storage is unavailable. Export changes before closing.';
  }
  // Keep legacy data unchanged until the new draft is safely stored, and retain
  // it as a fallback backup. The in-memory snapshot always tracks current edits.
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      draftData = JSON.parse(raw);
      hydrate(draftData);
      persistDraft();
    } else if (readable)
      draftStatus.textContent = 'Browser draft ready. Changes save on this device.';
  } catch {
    draftStatus.textContent =
      'Previous browser draft could not be read. Your exported JSON files can still be imported.';
  }
}

function collectData() {
  return {
    ...documentExtras,
    meta: {
      ...metadataExtras,
      title: projTitle.value.trim(),
      director: director.value.trim(),
      productionCompany: productionCompany.value.trim(),
      dop: dop.value.trim(),
      producer: producer.value.trim(),
      shootSchedule: shootSchedule.value.trim(),
      notes: projNotes.value.trim(),
    },
    shots: state.shots.map((s) => ({ ...s })),
  };
}

function hydrate(data) {
  isHydrating = true;
  const { meta, shots, ...extra } = data || {};
  documentExtras = structuredClone(extra);
  metadataExtras = structuredClone(meta || {});
  projTitle.value = data?.meta?.title || '';
  director.value = data?.meta?.director || '';
  productionCompany.value = data?.meta?.productionCompany || '';
  dop.value = data?.meta?.dop || '';
  producer.value = data?.meta?.producer || '';
  shootSchedule.value = data?.meta?.shootSchedule || '';
  projNotes.value = data?.meta?.notes || '';
  resetShots();
  (data?.shots || []).forEach(addShotFromData);
  isHydrating = false;
}

function resetShots() {
  clearShotSelection();
  state.shots = [];
  shotList.innerHTML = '';
}

function addShotFromData(shot) {
  const card = createShotCard(shot, {
    template: tmpl,
    nextNumber: state.shots.length + 1,
    createId: uid,
    scope: () => window.storyboard?.scope,
    onTitleChange: () => persistFromDOM(),
    onTextChange: (card) => {
      updateShotTitle(card);
      persistFromDOM();
    },
    onSelectionChange: (card, selected) => {
      updateShotSelectionVisual(card, selected);
      updateSelectAll();
    },
    onFold: (card) => {
      setShotFolded(card, card.dataset.folded !== 'true');
      persistFromDOM();
    },
    onImageChange: (card, imageData) => {
      const index = indexOfShot(card.dataset.id);
      if (index < 0) return;
      if (imageData) state.shots[index].imageData = imageData;
      else delete state.shots[index].imageData;
      delete state.shots[index].imagePath;
      saveLocal();
    },
    onDuplicate: (card) => {
      const current = readShotFromLI(card);
      const index = indexOfShot(shot.id);
      state.shots.splice(index + 1, 0, { ...state.shots[index], ...current, id: uid() });
      renderAll();
      saveLocal();
    },
    onDelete: (card) => {
      state.shots = state.shots.filter((item) => item.id !== shot.id);
      card.remove();
      renumber();
      saveLocal();
    },
  });
  updateShotSelectionVisual(card, false);
  setShotFolded(card, shot.folded);
  shotList.appendChild(card);
  updateShotTitle(card);
  state.shots.push({ ...shot, ...readShotFromLI(card) });
}

function readShotFromLI(li) {
  const frameImg = li.querySelector('.frame-image');
  const original = state.shots.find((shot) => shot.id === li.dataset.id) || {};
  const { imageData, imagePath, ...preserved } = original;
  const data = {
    ...preserved,
    customTitle: li.dataset.customTitle || '',
    scene: li.querySelector('.scene').value,
    number: li.querySelector('.shotnum').value,
    type: li.querySelector('.type').value,
    lens: li.querySelector('.lens').value,
    move: li.querySelector('.move').value,
    desc: li.querySelector('.desc').value,
    chars: li.querySelector('.chars').value,
    location: li.querySelector('.location').value,
    shootDate: li.querySelector('.shootdate').value,
    equipment: li.querySelector('.equipment').value,
    props: li.querySelector('.props').value,
    notes: li.querySelector('.notes').value,
    folded: li.dataset.folded === 'true',
  };

  if (li.dataset.imagePath) data.imagePath = li.dataset.imagePath;
  if (frameImg.src && !frameImg.classList.contains('hidden')) {
    data.imageData = frameImg.src;
  }

  return data;
}

function persistFromDOM() {
  if (isHydrating) return;
  // Walk DOM list order to persist state
  state.shots = Array.from(shotList.children).map((li) => ({
    id: li.dataset.id,
    ...readShotFromLI(li),
  }));
  renumber();
  saveLocal();
}

function renumber() {
  Array.from(shotList.children).forEach((li, i) => {
    li.querySelector('.shotnum').value = i + 1;
    updateShotTitle(li);
    const idx = indexOfShot(li.dataset.id);
    if (idx > -1) state.shots[idx].number = i + 1;
  });
}

function indexOfShot(id) {
  return state.shots.findIndex((s) => s.id === id);
}

function renderAll() {
  shotList.innerHTML = '';
  const existing = [...state.shots];
  state.shots = [];
  existing.forEach(addShotFromData);
}

function newShot(preset = {}) {
  addShotFromData({
    id: uid(),
    scene: preset.scene || '',
    type: preset.type || 'Wide',
    lens: preset.lens || '35mm',
    move: preset.move || 'Locked',
    desc: preset.desc || '',
    chars: preset.chars || '',
    location: preset.location || '',
    shootDate: preset.shootDate || '',
    equipment: preset.equipment || '',
    props: preset.props || '',
    notes: preset.notes || '',
    folded: preset.folded || false,
  });
  saveLocal();
}

// --- Drag to reorder ---
let dragSrcEl = null;
let ghost;

function addDragHandlers(li) {
  if (li.dataset.dragBound) return;
  li.dataset.dragBound = 'true';
  const h = li.querySelector('.handle');
  h.addEventListener('pointerdown', () => {
    if (window.storyboard && !window.storyboard.canEdit) return;
    dragSrcEl = li;
    ghost = li.cloneNode(true);
    ghost.classList.add('opacity-50');
    ghost.style.pointerEvents = 'none';
    li.parentNode.insertBefore(ghost, li.nextSibling);
    li.classList.add('ring-2', 'ring-emerald-500');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  });
}

function onMove(e) {
  const y = e.clientY;
  const items = Array.from(shotList.children).filter((el) => el !== dragSrcEl);
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    if (before) {
      shotList.insertBefore(ghost, item);
      break;
    }
    if (item === items[items.length - 1]) {
      shotList.appendChild(ghost);
    }
  }
}

function onUp() {
  const moved = dragSrcEl;
  if (moved) {
    moved.classList.remove('ring-2', 'ring-emerald-500');
    shotList.insertBefore(moved, ghost);
  }
  if (ghost) ghost.remove();
  ghost = null;
  dragSrcEl = null;
  persistFromDOM();
  if (moved) {
    const cb = moved.querySelector('.select-shot');
    if (cb) updateShotSelectionVisual(moved, cb.checked);
  }
  document.removeEventListener('pointermove', onMove);
}

// Observe list for new items to wire drag
const mo = new MutationObserver(() => {
  Array.from(shotList.children).forEach(addDragHandlers);
  updateSelectAll();
});
mo.observe(shotList, { childList: true });

// --- Import/Export ---
btnExport.addEventListener('click', async () => {
  let data;
  try {
    const media = await import('./storyboard-media.mjs');
    data = media.portableDocument(collectData());
  } catch (error) {
    alert(error.message);
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (data.meta.title || 'storyboard') + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

btnImport.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const scope = window.storyboard?.scope;
  const reader = new FileReader();
  reader.onerror = () =>
    alert('The JSON file could not be read. Your current storyboard is unchanged.');
  reader.onload = async () => {
    if (scope !== window.storyboard?.scope) return;
    try {
      const media = await import('./storyboard-media.mjs');
      const data = media.validateStoryboard(JSON.parse(reader.result));
      if (scope !== window.storyboard?.scope) return;
      hydrate(data);
      saveLocal();
      window.storyboard.onImport?.(data.shots.length);
    } catch (error) {
      alert(
        error instanceof SyntaxError
          ? 'Invalid JSON. Your current storyboard is unchanged.'
          : error.message,
      );
    }
  };
  reader.readAsText(f);
  fileInput.value = '';
});

btnPrint.addEventListener('click', () => {
  window.print();
});

btnReset.addEventListener('click', () => {
  const confirmed = confirm(
    'This will delete all shots and production data for this storyboard. Continue?',
  );
  if (!confirmed) return;

  // Clear meta fields
  projTitle.value = '';
  director.value = '';
  productionCompany.value = '';
  dop.value = '';
  producer.value = '';
  shootSchedule.value = '';
  projNotes.value = '';

  // Clear shots and state
  documentExtras = {};
  metadataExtras = {};
  resetShots();
  clearShotSelection();
  saveLocal();
});

if (btnFoldSelected) {
  btnFoldSelected.addEventListener('click', () => {
    const items = getSelectedShotLis();
    if (!items.length) {
      alert('Select at least one shot to fold.');
      return;
    }
    items.forEach((li) => setShotFolded(li, true));
    clearShotSelection();
    persistFromDOM();
  });
}

if (btnUnfoldSelected) {
  btnUnfoldSelected.addEventListener('click', () => {
    const items = getSelectedShotLis();
    if (!items.length) {
      alert('Select at least one shot to unfold.');
      return;
    }
    items.forEach((li) => setShotFolded(li, false));
    clearShotSelection();
    persistFromDOM();
  });
}

if (btnClearSelection) {
  btnClearSelection.addEventListener('click', () => {
    clearShotSelection();
  });
}

// --- New shot ---
btnNew.addEventListener('click', () => newShot());

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.tagName === 'SELECT' ||
    e.target.isContentEditable
  )
    return;
  if (window.storyboard && !window.storyboard.canEdit && e.key.toLowerCase() === 'n') return;
  if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    newShot();
  }
  if (e.key.toLowerCase() === 'e') {
    e.preventDefault();
    btnExport.click();
  }
  if (e.key.toLowerCase() === 'p') {
    e.preventDefault();
    btnPrint.click();
  }
});

window.storyboard = {
  mode: 'local',
  canEdit: true,
  scope: 0,
  collectData,
  hydrate(data) {
    this.scope++;
    hydrate(data);
    document.dispatchEvent(new Event('storyboardchange'));
  },
  updateShot(id, patch) {
    if (!this.canEdit) return;
    const shot = state.shots.find((s) => s.id === id);
    if (!shot) return;
    const fields = [
      'scene',
      'desc',
      'type',
      'lens',
      'move',
      'location',
      'chars',
      'shootDate',
      'estimatedMinutes',
      'status',
      'props',
      'equipment',
      'notes',
    ];
    for (const field of fields) if (Object.hasOwn(patch, field)) shot[field] = patch[field];
    renderAll();
    saveLocal();
  },
  updateRequirements(requirements) {
    if (!this.canEdit) return;
    documentExtras.planning = { ...documentExtras.planning, requirements };
    saveLocal();
  },
  localData() {
    return structuredClone(draftData);
  },
  get localUnsaved() {
    return draftUnsaved;
  },
  setEditable(value) {
    this.canEdit = value;
    document
      .querySelectorAll(
        '#storyboardEditor input, #storyboardEditor textarea, #storyboardEditor select',
      )
      .forEach((el) => {
        el.disabled = !value && !el.classList.contains('select-shot') && el.id !== 'selectAllShots';
      });
    document.querySelectorAll('#storyboardEditor button').forEach((el) => {
      const viewOnly =
        el.classList.contains('btnToggleFold') ||
        ['btnFoldSelected', 'btnUnfoldSelected', 'btnClearSelection'].includes(el.id);
      el.disabled = !value && !viewOnly;
    });
    [btnNew, btnImport, btnReset].forEach((button) => (button.disabled = !value));
    shotList
      .querySelectorAll('[contenteditable]')
      .forEach((el) => (el.contentEditable = String(value)));
    updateSelectAll();
    document.dispatchEvent(new Event('storyboardpermissions'));
  },
};
// --- Init ---
window.storyboard.setEditable(false);
window.storyboard.ready = loadLocal().finally(() => {
  if (!projTitle.value) projTitle.value = 'Project Title (working title)';
  window.storyboard.setEditable(true);
});
window.addEventListener('beforeunload', (event) => {
  if (draftUnsaved) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// Persist meta edits
[projTitle, director, productionCompany, dop, producer, shootSchedule, projNotes].forEach((el) =>
  el.addEventListener('input', saveLocal),
);
