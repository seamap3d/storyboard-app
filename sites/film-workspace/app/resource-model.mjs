import { collectRequirements, filterShots } from './workspace-model.mjs';
import { resourceKey } from './resource-fields.mjs';
import { normalizeProduction, validateProduction, isProductionId } from './production-model.mjs';

/** Mentions are candidates for review, never counts of real inventory. */
export function resourceSuggestions(state) {
  const suggestions = new Map();
  for (const board of state.storyboards) {
    const items = collectRequirements({
      shots: board.shots,
      planning: { requirements: board.requirements },
    });
    for (const item of items) {
      const key = resourceKey(item.kind, item.name);
      if (!suggestions.has(key))
        suggestions.set(key, {
          key,
          category: item.kind,
          name: item.name,
          uses: [],
          legacyDetails: [],
        });
      const candidate = suggestions.get(key);
      candidate.uses.push(
        ...item.shots.map((shot) => ({
          boardId: board.id,
          shotId: shot.id,
          number: shot.number,
          scene: shot.scene,
          boardName: board.name,
        })),
      );
      const { shots: _shots, key: _key, ...legacy } = item;
      candidate.legacyDetails.push({ boardId: board.id, ...legacy });
    }
  }
  return [...suggestions.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function reviewedCandidates(state, selections) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 100)
    throw new Error('Production promotion needs 1–100 reviewed requirements.');
  const source = new Map(resourceSuggestions(state).map((item) => [item.key, item]));
  const keys = new Set();
  return selections.map((selection) => {
    if (
      !selection ||
      !['prop', 'equipment'].includes(selection.category) ||
      typeof selection.name !== 'string'
    )
      throw new Error('Production promotion needs a category and source name.');
    if (Object.keys(selection).some((key) => !['category', 'name', 'resource_id'].includes(key)))
      throw new Error('Production promotion contains unsupported selection fields.');
    const key = resourceKey(selection.category, selection.name),
      candidate = source.get(key);
    if (!candidate || keys.has(key))
      throw new Error(
        'Production promotion contains a missing or duplicate source requirement. Refresh and review again.',
      );
    keys.add(key);
    return { candidate, target: selection.resource_id };
  });
}
function promotionTarget(document, candidate, target, uuid) {
  if (target !== undefined && !isProductionId(target))
    throw new Error('Production merge needs a valid target resource ID.');
  const existing = target
    ? document.resources.find((item) => item.id === target)
    : document.resources.find((item) => resourceKey(item.category, item.name) === candidate.key);
  if (existing) {
    if (existing.category !== candidate.category)
      throw new Error('Production merge cannot combine props and equipment.');
    return existing;
  }
  if (target) throw new Error('Production merge target was not found.');
  const resource = {
    id: uuid(),
    name: candidate.name,
    category: candidate.category,
    availableQuantity: '',
    readiness: 'needed',
    sourceDetails: structuredClone(candidate.legacyDetails),
  };
  document.resources.push(resource);
  return resource;
}
export function promoteResources(state, selections, uuid = () => crypto.randomUUID()) {
  const reviewed = reviewedCandidates(state, selections),
    document = normalizeProduction(state.document);
  for (const { candidate, target } of reviewed) {
    const resource = promotionTarget(document, candidate, target, uuid);
    for (const use of candidate.uses) {
      if (!use.shotId)
        throw new Error(
          'Production source shot needs a stable ID. Save its storyboard before linking resources.',
        );
      if (
        document.resourceLinks.some(
          (link) =>
            link.resourceId === resource.id &&
            link.boardId === use.boardId &&
            link.shotId === use.shotId,
        )
      )
        continue;
      document.resourceLinks.push({
        id: uuid(),
        resourceId: resource.id,
        boardId: use.boardId,
        shotId: use.shotId,
        requiredQuantity: '',
        allocatedQuantity: '',
      });
    }
  }
  return validateProduction(document);
}
function resourceUse(state, link) {
  const board = state.storyboards.find((item) => item.id === link.boardId);
  const index = board?.shots.findIndex((shot) => shot.id === link.shotId);
  const shot = index >= 0 ? board.shots[index] : null;
  const assignment = state.document.shotLinks.find(
    (item) => item.boardId === link.boardId && item.shotId === link.shotId,
  );
  const scene = state.document.scenes.find((item) => item.id === assignment?.sceneId);
  return {
    ...link,
    boardName: board?.name || 'Unavailable storyboard',
    number: index >= 0 ? index + 1 : '',
    scene: scene?.name || shot?.scene || '',
    shootDate: shot?.shootDate || '',
    unavailable: !shot,
  };
}
export function projectResources(state, filters = {}) {
  const query = String(filters.search || '').toLowerCase();
  return (state.document.resources || [])
    .map((resource) => ({
      ...resource,
      uses: (state.document.resourceLinks || [])
        .filter((link) => link.resourceId === resource.id)
        .map((link) => resourceUse(state, link)),
    }))
    .filter(
      (resource) =>
        (!filters.category || resource.category === filters.category) &&
        (!query ||
          [resource.name, resource.providedBy, resource.notes]
            .join(' ')
            .toLowerCase()
            .includes(query)),
    );
}
export function resourceReadiness(resource) {
  const messages = [];
  if (resource.availableQuantity === '' || resource.availableQuantity === undefined)
    messages.push('Available quantity unknown');
  if (!resource.providedBy && !resource.responsiblePersonId)
    messages.push('Supplier / responsible person missing');
  if (!['ready', 'on set'].includes(resource.readiness)) messages.push('Readiness unconfirmed');
  if (
    resource.uses.some((use) => use.requiredQuantity === '' || use.requiredQuantity === undefined)
  )
    messages.push('Shot quantities unknown');
  if (resource.uses.some((use) => use.unavailable)) messages.push('Linked shot unavailable');
  if (
    resource.uses.some(
      (use) =>
        typeof use.requiredQuantity === 'number' &&
        typeof resource.availableQuantity === 'number' &&
        use.requiredQuantity > resource.availableQuantity,
    )
  )
    messages.push('Shot requirement exceeds recorded availability');
  return messages;
}
export function projectShotRows(state, filters = {}) {
  const source = state.storyboards.flatMap((board) =>
    board.shots.map((shot, index) => ({
      ...shot,
      customTitle: shot.name,
      boardId: board.id,
      boardName: board.name,
      localNumber: index + 1,
    })),
  );
  return filterShots(source, filters).map((shot) => ({ ...shot, displayNumber: shot.localNumber }));
}
export function linkedResourceNames(state, boardId, shotId) {
  const ids = new Set(
    (state.document.resourceLinks || [])
      .filter((link) => link.boardId === boardId && link.shotId === shotId)
      .map((link) => link.resourceId),
  );
  return (state.document.resources || [])
    .filter((resource) => ids.has(resource.id))
    .map((resource) => resource.name);
}
