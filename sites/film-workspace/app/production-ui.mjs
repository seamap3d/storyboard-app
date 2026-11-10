import { productionFields, productionLabels } from './production-model.mjs';
import { readProduction, writeProduction } from './production-client.mjs';

const node = (tag, text) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
};
function labelFor(state, kind, record) {
  if (!['shotLinks', 'resourceLinks'].includes(kind)) return record.name;
  const board = state.storyboards.find((item) => item.id === record.boardId);
  const index = board?.shots.findIndex((shot) => shot.id === record.shotId);
  const resource = state.document.resources?.find((item) => item.id === record.resourceId);
  return `${resource?.name || ''} ${board?.name || 'Unavailable storyboard'} · shot ${index >= 0 ? index + 1 : record.shotId}`;
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
function fieldControl(state, key, definition, record, prefix) {
  const select = definition.reference || definition.shot || definition.choices;
  const input = node(select ? 'select' : definition.number ? 'input' : 'textarea');
  input.name = key;
  input.id = prefix + '-' + key;
  input.required = key === 'name' || Boolean(definition.required);
  if (select) fillOptions(input, state, definition, record);
  else configureText(input, key, definition, record);
  return input;
}
function configureText(input, key, definition, record) {
  input.rows = key === 'notes' ? 3 : 1;
  input.maxLength = key === 'name' ? 160 : 4000;
  input.value = record[key] ?? '';
  if (definition.number) {
    input.type = 'number';
    input.min = '0';
    input.max = '1000000';
    input.step = 'any';
  }
}
function selectedValues(definition, record, key) {
  if (definition.multiple) return record[key] || [];
  if (definition.choices) return [record[key] || definition.choices[0]];
  return [record[key] || ''];
}
function fillOptions(input, state, definition, record) {
  input.multiple = Boolean(definition.multiple);
  if (!input.multiple && !definition.choices)
    input.add(new Option(definition.required ? 'Choose…' : 'Unassigned / unknown', ''));
  const options =
    definition.choices?.map((value) => ({ id: value, name: value })) ||
    referenceOptions(state, definition, record);
  for (const value of options) input.add(new Option(value.name, value.id));
  const selected = selectedValues(definition, record, input.name);
  for (const option of input.options) option.selected = selected.includes(option.value);
  if (definition.multiple) input.size = Math.min(5, Math.max(2, options.length));
}
/** Owns register drafts separately from the current storyboard's save lifecycle. */
export function createProductionUI(
  panel,
  {
    prefix = 'production',
    collections = Object.keys(productionLabels).filter(
      (key) => !['resources', 'resourceLinks'].includes(key),
    ),
    onState = () => {},
    onControls = () => {},
    onEdit = () => {},
    summary,
  } = {},
) {
  const $ = (id) => panel.querySelector('#' + id.replace(/^production/, prefix));
  let context = {},
    state = null,
    scope = '',
    editing = null,
    changed = false,
    saving = false,
    uncertain = false,
    sequence = 0,
    externalBusy = false;
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
  const canWrite = () =>
    Boolean(state) && editable() && !saving && !uncertain && !context.busy && !externalBusy;
  function controls() {
    const locked = !canWrite();
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
    $('productionKind').disabled = saving || changed || externalBusy;
    onControls(canWrite());
  }
  function editor(record = null) {
    editing = record?.id || null;
    changed = false;
    const value = record || { permission: 'unconfirmed', category: 'prop', readiness: 'needed' };
    $('productionFields').replaceChildren();
    for (const [key, definition] of Object.entries(productionFields[kind()])) {
      const label = node('label', definition.label);
      label.htmlFor = prefix + '-' + key;
      label.append(fieldControl(state, key, definition, value, prefix));
      $('productionFields').append(label);
    }
    $('productionEditorTitle').textContent = editing ? 'Edit record' : 'New record';
    onEdit(kind(), record, state);
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
    $('productionSummary').textContent = summary
      ? summary(state)
      : `Register version ${state.version} · ${gaps.unassignedCharacters.length} characters without performers · ${gaps.unmappedSettings.length} settings without venues · ${gaps.incompleteVenues.length} venues needing logistics · ${gaps.peopleWithoutContact.length} people without contacts · ${gaps.unavailableShotAssignments.length} assignments with unavailable shots (remove those links before saving).`;
    editor();
    onState(state);
  }
  function announce() {
    document.dispatchEvent(
      new CustomEvent('projectproductionstate', { detail: { sender: prefix, state } }),
    );
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
      if (state && loaded.version < state.version) return;
      state = loaded;
      render();
      announce();
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
            : definition.number && input.value !== ''
              ? Number(input.value)
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
    if (!canWrite()) return;
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
      announce();
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
  for (const key of collections) $('productionKind').add(new Option(productionLabels[key], key));
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
      fillOptions(input, state, productionFields[kind()].shotId, { boardId: event.target.value });
    }
  };
  window.addEventListener('beforeunload', (event) => {
    if (changed) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('projectproductionstate', (event) => {
    const incoming = event.detail;
    if (incoming.sender === prefix || incoming.state.project_id !== context.project?.id) return;
    if (changed || saving) {
      message(
        'Production records changed in another view. Keep your edits and refresh before saving.',
      );
      return;
    }
    ++sequence;
    state = incoming.state;
    uncertain = false;
    message(
      'Project records loaded from another view. Save record shares changes independently of Save storyboard.',
    );
    render();
    controls();
  });
  document.addEventListener('projectproductionrefresh', () => {
    if (changed || saving) {
      message('Source storyboard changed. Keep your edits, then refresh production records.');
      return;
    }
    reload();
  });
  return {
    canLeave,
    canWrite,
    blockUntilRefresh() {
      uncertain = true;
      controls();
    },
    lock(value) {
      externalBusy = value;
      controls();
    },
    getState: () => state,
    acceptState(saved) {
      state = saved;
      render();
      announce();
      controls();
    },

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
      onState(null);
      if (next.project) reload();
    },
  };
}
