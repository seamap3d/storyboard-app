// --- Helper Functions ---
const uid = () => Math.random().toString(36).slice(2,9);

function updateShotTitle(li) {
  const titleEl = li.querySelector('.shot-title');
  if (!titleEl) return;
  
  // If the title input already has a custom value that was manually set, don't override it
  const shotId = li.dataset.id;
  const shotIndex = indexOfShot(shotId);
  
  // Only auto-update if there's no custom title set or if the field is empty
  if (shotIndex > -1 && state.shots[shotIndex].customTitle !== undefined) {
    titleEl.value = state.shots[shotIndex].customTitle;
    return;
  }
  
  const sceneVal = li.querySelector('.scene')?.value.trim() || '';
  const shotNumVal = li.querySelector('.shotnum')?.value.trim() || '';
  let label = sceneVal;
  if (!label) {
    const index = Array.from(shotList.children).indexOf(li);
    const fallbackNumber = index > -1 ? index + 1 : shotNumVal || '';
    label = fallbackNumber ? `Shot ${fallbackNumber}` : 'Shot';
  }
  
  // Only update if the input is currently empty or matches auto-generated content
  if (!titleEl.value || titleEl.value === titleEl.placeholder) {
    titleEl.value = label;
  }
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
  return Array.from(shotList.querySelectorAll('.select-shot:checked')).map(cb => cb.closest('li')).filter(Boolean);
}

function clearShotSelection() {
  shotList.querySelectorAll('.select-shot').forEach(cb => {
    cb.checked = false;
    updateShotSelectionVisual(cb.closest('li'), false);
  });
}

function selectAllShots() {
  shotList.querySelectorAll('.select-shot').forEach(cb => {
    cb.checked = true;
    updateShotSelectionVisual(cb.closest('li'), true);
  });
}

function applyLayoutColumns(count, { updateControl = true } = {}) {
  let cols = parseInt(count, 10);
  if (Number.isNaN(cols)) cols = state.layoutColumns || 1;
  cols = Math.min(5, Math.max(1, cols));
  shotList.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  state.layoutColumns = cols;
  if (updateControl && layoutSelect) {
    const desiredValue = String(cols);
    if (layoutSelect.value !== desiredValue) {
      layoutSelect.value = desiredValue;
    }
  }
}

function setActiveTab(tab, { save = true } = {}) {
  const availableTabs = new Set(Array.from(tabPanes).map(pane => pane.dataset.pane));
  const target = availableTabs.has(tab) ? tab : 'storyboard';
  state.activeTab = target;

  tabPanes.forEach(pane => {
    const isActive = pane.dataset.pane === target;
    pane.classList.toggle('hidden', !isActive);
  });

  const activeClasses = ['bg-slate-800/60', 'border-slate-700', 'text-slate-100', 'shadow-lg'];
  const inactiveClasses = ['bg-slate-900/30', 'border-slate-800/50', 'text-slate-300'];

  tabLinks.forEach(btn => {
    const isActive = btn.dataset.tab === target;
    btn.classList.remove(...activeClasses, ...inactiveClasses);
    btn.classList.add(...(isActive ? activeClasses : inactiveClasses));
  });

  if (target === 'shotlist' && typeof window.renderShotListTable === 'function') {
    window.renderShotListTable();
  }

  if (target === 'schedule' && typeof window.renderProductionSchedule === 'function') {
    window.renderProductionSchedule();
  }

  if (save) saveLocal();
}