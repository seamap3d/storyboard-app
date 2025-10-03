// --- Shot Management Functions ---

function updateShotFieldFromTable(shotId, key, value) {
  const idx = indexOfShot(shotId);
  if (idx === -1) return;
  const targetShot = state.shots[idx];
  if (!targetShot) return;

  switch (key) {
    case 'folded':
      targetShot.folded = Boolean(value);
      break;
    case 'number':
      targetShot.number = value === '' ? '' : String(value);
      break;
    case 'shootDate':
      targetShot.shootDate = value || '';
      break;
    default:
      targetShot[key] = typeof value === 'string' ? value : (value ?? '');
  }

  renderAll();
  saveLocal();
}

function attachShotlistInput(element, shotId, key, { parser, eventType = 'change' } = {}) {
  const parseValue = parser || ((el) => {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const trimmed = el.value.trim();
      return trimmed;
    }
    return el.value.trim();
  });

  const commit = () => {
    updateShotFieldFromTable(shotId, key, parseValue(element));
  };

  if (eventType === 'blur') {
    element.addEventListener('blur', commit);
    if (element.tagName !== 'TEXTAREA') {
      element.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' && !evt.shiftKey) {
          evt.preventDefault();
          element.blur();
        }
      });
    }
  } else {
    element.addEventListener(eventType, commit);
  }
}

function indexOfShot(id) { 
  return state.shots.findIndex(s => s.id === id); 
}

function renderAll() {
  shotList.innerHTML = '';
  const existing = [...state.shots];
  state.shots = [];
  existing.forEach(addShotFromData);
  if (typeof window.renderShotListTable === 'function') {
    window.renderShotListTable();
  }
  if (typeof window.renderProductionSchedule === 'function') {
    window.renderProductionSchedule();
  }
}

function newShot(preset={}) {
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
  if (typeof window.renderShotListTable === 'function') {
    window.renderShotListTable();
  }
  if (typeof window.renderProductionSchedule === 'function') {
    window.renderProductionSchedule();
  }
  saveLocal();
}

function resetShots(options = {}) {
  clearShotSelection();
  if (!options.preserveSceneColors) {
    state.sceneColors = {};
  }
  state.shots = [];
  shotList.innerHTML = '';
  if (typeof window.renderShotListTable === 'function') {
    window.renderShotListTable();
  }
}

function readShotFromLI(li) {
  const frameImg = li.querySelector('.frame-image');
  const data = {
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
  
  if (frameImg.src && !frameImg.classList.contains('hidden')) {
    data.imageData = frameImg.src;
  }
  
  return data;
}

function persistFromDOM() {
  if (isHydrating) return;
  // Walk DOM list order to persist state
  state.shots = Array.from(shotList.children).map(li => ({ id: li.dataset.id, ...readShotFromLI(li) }));
  renumber();
  if (typeof window.renderShotListTable === 'function') {
    window.renderShotListTable();
  }
  if (typeof window.renderProductionSchedule === 'function') {
    window.renderProductionSchedule();
  }
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