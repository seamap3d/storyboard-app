import { createProductionUI } from './production-ui.mjs';
import { saveProductionDocument } from './production-client.mjs';
import {
  resourceSuggestions,
  promoteResources,
  projectResources,
  resourceReadiness,
} from './resource-model.mjs';
import { csv } from './workspace-model.mjs';

const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const quantity = (value) => (value === '' || value === undefined ? 'Unknown' : String(value));
const useLabel = (use) =>
  `${use.boardName} #${use.number || '?'}${use.scene ? ' · ' + use.scene : ''}`;
export function createResourceWorkspace(panel) {
  const $ = (id) => panel.querySelector('#' + id);
  let context = {},
    latest = null;
  const message = (text) => {
    $('resourcesStatus').textContent = text;
  };
  function visibleResources() {
    return projectResources(latest, {
      search: $('resourceSearch').value,
      category: $('resourceCategory').value,
    });
  }
  function renderTable() {
    const table = $('projectResourcesTable');
    table.replaceChildren();
    if (!latest) return;
    const head = element('tr');
    for (const title of [
      'Category',
      'Item',
      'Available',
      'Supplier / responsible person',
      'Readiness',
      'Shot / scene use and quantities',
      'Review gaps',
    ])
      head.append(element('th', title));
    const thead = element('thead');
    thead.append(head);
    table.append(thead);
    const body = element('tbody');
    for (const resource of visibleResources()) {
      const row = element('tr');
      row.dataset.resourceId = resource.id;
      const person = latest.document.people.find(
        (item) => item.id === resource.responsiblePersonId,
      );
      const uses = resource.uses
        .map(
          (use) =>
            `${useLabel(use)} · required ${quantity(use.requiredQuantity)}, allocated ${quantity(use.allocatedQuantity)}`,
        )
        .join('\n');
      for (const value of [
        resource.category,
        resource.name,
        `${quantity(resource.availableQuantity)} ${resource.unit || ''}`,
        [resource.providedBy, person?.name].filter(Boolean).join(' · '),
        resource.readiness || 'needed',
        uses || 'No current shot assignments — retained',
        resourceReadiness(resource).join('; ') || 'Recorded details complete',
      ])
        row.append(element('td', value));
      body.append(row);
    }
    table.append(body);
  }
  async function promote(selected) {
    if (!controller.canWrite() || !controller.canLeave()) return;
    controller.lock(true);
    message('Saving reviewed project requirements…');
    try {
      const before = controller.getState();
      const document = promoteResources(before, selected);
      const saved = await saveProductionDocument(context.client, before, document);
      if (context.project?.id !== saved.project_id) return;
      controller.acceptState(saved);
      message(
        `Reviewed requirement saved, register version ${saved.version}. Quantities and availability need confirmation.`,
      );
    } catch (error) {
      if (['40001', 'RPC_UNCONFIRMED', 'SAVE_UNCONFIRMED'].includes(error.code))
        controller.blockUntilRefresh();
      message(error.message + ' Read back before retrying an uncertain save.');
    } finally {
      controller.lock(false);
    }
  }
  function renderSuggestions() {
    $('resourceSuggestions').replaceChildren();
    if (!latest) return;
    for (const candidate of resourceSuggestions(latest)) {
      const row = element('div');
      row.className = 'resource-suggestion';
      row.dataset.requirementKey = candidate.key;
      row.append(
        element(
          'span',
          `${candidate.category} · ${candidate.name} · ${candidate.uses.length} shot references`,
        ),
      );
      const checked = element('input');
      checked.type = 'checkbox';
      checked.className = 'review-resource';
      checked.setAttribute('aria-label', `Review ${candidate.name}`);
      row.append(checked);
      const target = element('select');
      target.setAttribute('aria-label', `Project resource for ${candidate.name}`);
      target.add(new Option('Create / reuse matching item', ''));
      for (const resource of latest.document.resources.filter(
        (item) => item.category === candidate.category,
      ))
        target.add(new Option(resource.name, resource.id));
      const button = element('button', 'Link reviewed mentions');
      button.type = 'button';
      button.dataset.resourceAction = 'promote';
      button.disabled = !controller.canWrite();
      button.onclick = () =>
        promote([
          {
            category: candidate.category,
            name: candidate.name,
            ...(target.value ? { resource_id: target.value } : {}),
          },
        ]);
      row.dataset.category = candidate.category;
      row.dataset.name = candidate.name;
      const details = element('details');
      details.append(element('summary', 'Earlier source notes'));
      for (const source of candidate.legacyDetails)
        details.append(element('p', legacyText(source, latest)));
      row.append(details);
      row.append(target, button);
      $('resourceSuggestions').append(row);
    }
  }
  function render(state) {
    latest = state;
    renderTable();
    renderSuggestions();
  }
  function legacyText(source, state) {
    const board = state.storyboards.find((item) => item.id === source.boardId);
    return `${board?.name || 'Earlier storyboard'} — earlier quantity: ${quantity(source.quantity)}; supplier: ${source.providedBy || 'unknown'}; readiness: ${source.readiness || 'unknown'}; notes: ${source.notes || 'none'}`;
  }
  function legacyNotes(_kind, record, state) {
    $('resourceLegacyNotes').replaceChildren();
    const sources = Array.isArray(record?.sourceDetails) ? record.sourceDetails : [];
    for (const source of sources)
      $('resourceLegacyNotes').append(element('p', legacyText(source, state)));
  }
  const controller = createProductionUI(panel, {
    prefix: 'resources',
    collections: ['resources', 'resourceLinks'],
    onState: render,
    onEdit: legacyNotes,
    onControls: (editable) =>
      panel.querySelectorAll('[data-resource-action]').forEach((button) => {
        button.disabled = !editable;
      }),
    summary: (state) =>
      `${state.document.resources.length} project resources · ${state.document.resourceLinks.length} shot assignments. Unknown quantities require review; source mentions do not confirm inventory.`,
  });
  $('promoteSelectedResources').onclick = () => {
    const selections = [...panel.querySelectorAll('.resource-suggestion')]
      .filter((row) => row.querySelector('.review-resource').checked)
      .map((row) => ({
        category: row.dataset.category,
        name: row.dataset.name,
        ...(row.querySelector('select').value
          ? { resource_id: row.querySelector('select').value }
          : {}),
      }));
    if (!selections.length) {
      message('Select reviewed requirements first.');
      return;
    }
    promote(selections);
  };
  for (const id of ['resourceSearch', 'resourceCategory'])
    $(id).addEventListener('input', renderTable);
  $('exportProjectResources').onclick = () => {
    if (!latest) return;
    const rows = [
      [
        'Category',
        'Item',
        'Available quantity',
        'Unit',
        'Supplier',
        'Responsible person',
        'Readiness',
        'Collection',
        'Return',
        'Availability',
        'Notes',
        'Shot / scene use',
        'Review gaps',
      ],
      ...visibleResources().map((resource) => [
        resource.category,
        resource.name,
        quantity(resource.availableQuantity),
        resource.unit || '',
        resource.providedBy || '',
        latest.document.people.find((item) => item.id === resource.responsiblePersonId)?.name || '',
        resource.readiness || 'needed',
        resource.collectionNotes || '',
        resource.returnNotes || '',
        resource.availability || '',
        resource.notes || '',
        resource.uses
          .map(
            (use) =>
              `${useLabel(use)} · required ${quantity(use.requiredQuantity)}, allocated ${quantity(use.allocatedQuantity)}${use.notes ? ' · ' + use.notes : ''}`,
          )
          .join('; '),
        resourceReadiness(resource).join('; '),
      ]),
    ];
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })),
      link = element('a');
    link.href = url;
    link.download = 'project-props-equipment.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    canLeave: controller.canLeave,
    context(next) {
      context = next;
      controller.context(next);
    },
  };
}
