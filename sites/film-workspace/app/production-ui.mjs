import { productionFields, productionLabels } from './production-model.mjs';
import { readProduction, writeProduction } from './production-client.mjs';

const node = (tag, text) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
};
function labelFor(state, kind, record) {
  if (kind !== 'shotLinks') return record.name;
  const board = state.storyboards.find((item) => item.id === record.boardId);
  const index = board?.shots.findIndex((shot) => shot.id === record.shotId);
  return `${board?.name || 'Unavailable storyboard'} · shot ${index >= 0 ? index + 1 : record.shotId}`;
}
function referenceOptions(state, definition, record) {
  if (definition.shot) {
    const shots = state.storyboards.find((board) => board.id === record.boardId)?.shots || [];
    return shots.map((shot, index) => ({ id: shot.id, name: `${index + 1}. ${shot.name}` }));
  }
  return definition.reference === 'storyboards'
    ? state.storyboards
    : state.document[definition.reference];
}
function fieldControl(state, key, definition, record) {
  const select = definition.reference || definition.shot || definition.choices;
  const input = node(select ? 'select' : 'textarea');
  input.name = key;
  input.id = 'production-' + key;
  input.required = key === 'name' || Boolean(definition.required);
  if (select) fillOptions(input, state, definition, record);
  else {
    input.rows = key === 'notes' ? 3 : 1;
    input.maxLength = key === 'name' ? 160 : 4000;
    input.value = record[key] || '';
  }
  return input;
}
function fillOptions(input, state, definition, record) {
  input.multiple = Boolean(definition.multiple);
  if (!input.multiple)
    input.add(new Option(definition.required ? 'Choose…' : 'Unassigned / unknown', ''));
  const options =
    definition.choices?.map((value) => ({ id: value, name: value })) ||
    referenceOptions(state, definition, record);
  for (const value of options) input.add(new Option(value.name, value.id));
  const selected = definition.multiple ? record[input.name] || [] : [record[input.name] || ''];
  for (const option of input.options) option.selected = selected.includes(option.value);
  if (definition.multiple) input.size = Math.min(5, Math.max(2, options.length));
}
/** Owns register drafts separately from the current storyboard's save lifecycle. */
export function createProductionUI(panel) {
  const $ = (id) => panel.querySelector('#' + id);
  let context = {},
    state = null,
    scope = '',
    editing = null,
    changed = false,
    saving = false,
    uncertain = false,
    sequence = 0;
  const kind = () => $('productionKind').value;
  const message = (text) => {
    $('productionStatus').textContent = text;
  };
  const editable = () =>
    Boolean(
      context.project &&
      context.user &&
      (context.project.owner_id === context.user.id || context.project.role === 'editor'),
    );
  const canLeave = () =>
    !changed || confirm('Discard unsaved production record edits? Copy them first to keep them.');
  function controls() {
    const locked = !state || !editable() || saving || uncertain || context.busy;
    $('productionForm')
      .querySelectorAll('textarea,select,input,button')
      .forEach((input) => {
        input.disabled = locked;
      });
    $('productionDelete').disabled = locked || !editing;
    $('productionRecords')
      .querySelectorAll('button')
      .forEach((button) => {
        button.disabled = saving || context.busy;
      });
    $('productionReload').disabled = !context.project || saving;
    $('productionNew').disabled = locked;
    $('productionKind').disabled = saving || changed;
  }
  function editor(record = null) {
    editing = record?.id || null;
    changed = false;
    const value = record || { permission: 'unconfirmed' };
    $('productionFields').replaceChildren();
    for (const [key, definition] of Object.entries(productionFields[kind()])) {
      const label = node('label', definition.label);
      label.htmlFor = 'production-' + key;
      label.append(fieldControl(state, key, definition, value));
      $('productionFields').append(label);
    }
    $('productionEditorTitle').textContent = editing ? 'Edit record' : 'New record';
    controls();
  }
  function render() {
    $('productionRecords').replaceChildren();
    if (!state) return;
    for (const record of state.document[kind()]) {
      const button = node('button', labelFor(state, kind(), record));
      button.type = 'button';
      button.onclick = () => {
        if (canLeave()) editor(record);
      };
      $('productionRecords').append(button);
    }
    if (!state.document[kind()].length) $('productionRecords').append(node('p', 'No records yet.'));
    const gaps = state.gaps;
    $('productionSummary').textContent =
      `Register version ${state.version} · ${gaps.unassignedCharacters.length} characters without performers · ${gaps.unmappedSettings.length} settings without venues · ${gaps.incompleteVenues.length} venues needing logistics · ${gaps.peopleWithoutContact.length} people without contacts · ${gaps.unavailableShotAssignments.length} assignments with unavailable shots (remove those links before saving).`;
    editor();
  }
  async function reload() {
    if (!context.project) return;
    const ticket = ++sequence,
      current = context;
    state = null;
    uncertain = false;
    controls();
    message('Loading project production records…');
    try {
      const loaded = await readProduction(current.client, current.project.id);
      if (ticket !== sequence) return;
      state = loaded;
      render();
      message(
        'Project records loaded. Save record shares changes independently of Save storyboard.',
      );
    } catch (error) {
      if (ticket === sequence) message(error.message);
    } finally {
      if (ticket === sequence) controls();
    }
  }
  function values() {
    return Object.fromEntries(
      Object.entries(productionFields[kind()]).map(([key, definition]) => {
        const input = $('production-' + key);
        return [
          key,
          definition.multiple
            ? [...input.selectedOptions].map((option) => option.value)
            : input.value,
        ];
      }),
    );
  }
  function saveFailure(error) {
    uncertain = ['40001', 'RPC_UNCONFIRMED', 'SAVE_UNCONFIRMED'].includes(error.code);
    changed = true;
    message(error.message + ' Your form edits remain here.');
  }
  function persist(current, before, remove) {
    return writeProduction(
      current.client,
      before,
      kind(),
      editing || crypto.randomUUID(),
      remove ? {} : values(),
      remove,
    );
  }
  async function save(remove = false) {
    if (!state || !editable() || saving || uncertain) return;
    const ticket = sequence,
      current = context,
      before = state;
    saving = true;
    message('Saving production record…');
    controls();
    try {
      const saved = await persist(current, before, remove);
      if (ticket !== sequence) return;
      state = saved;
      render();
      message(
        `Production record ${remove ? 'removed' : 'saved'}, register version ${state.version}.`,
      );
    } catch (error) {
      if (ticket !== sequence) return;
      saveFailure(error);
    } finally {
      saving = false;
      controls();
    }
  }
  for (const [key, label] of Object.entries(productionLabels))
    $('productionKind').add(new Option(label, key));
  $('productionKind').onchange = render;
  $('productionNew').onclick = () => {
    if (canLeave()) editor();
  };
  $('productionReload').onclick = () => {
    if (canLeave()) {
      changed = false;
      reload();
    }
  };
  $('productionForm').onsubmit = (event) => {
    event.preventDefault();
    save();
  };
  $('productionDelete').onclick = () => {
    if (confirm('Remove this production record? Referenced records must be unlinked first.'))
      save(true);
  };
  $('productionForm').oninput = () => {
    changed = true;
    controls();
  };
  $('productionForm').onchange = (event) => {
    changed = true;
    controls();
    if (event.target.name === 'boardId') {
      const input = $('production-shotId');
      input.replaceChildren();
      fillOptions(input, state, productionFields.shotLinks.shotId, { boardId: event.target.value });
    }
  };
  window.addEventListener('beforeunload', (event) => {
    if (changed) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  return {
    canLeave,
    context(next) {
      context = next;
      const nextScope = `${next.user?.id || ''}:${next.project?.id || ''}`;
      if (nextScope === scope) {
        controls();
        return;
      }
      scope = nextScope;
      ++sequence;
      state = null;
      editing = null;
      changed = false;
      uncertain = false;
      $('productionFields').replaceChildren();
      $('productionRecords').replaceChildren();
      $('productionSummary').textContent = '';
      message('Choose a shared film project to manage its production records.');
      controls();
      if (next.project) reload();
    },
  };
}
