export const resourceFields = {
  resources: {
    name: { label: 'Item' },
    category: { label: 'Category', choices: ['prop', 'equipment'], required: true },
    unit: { label: 'Unit (items, litres, kits…)' },
    availableQuantity: { label: 'Available quantity (blank = unknown)', number: true },
    providedBy: { label: 'Supplier / provided by' },
    responsiblePersonId: { label: 'Responsible person', reference: 'people' },
    readiness: {
      label: 'Readiness',
      choices: ['needed', 'sourcing', 'ready', 'on set', 'returned'],
    },
    availability: { label: 'Availability / booking notes' },
    collectionNotes: { label: 'Collection / pickup' },
    returnNotes: { label: 'Return arrangements' },
    notes: { label: 'Notes' },
  },
  resourceLinks: {
    resourceId: { label: 'Resource', reference: 'resources', required: true },
    boardId: { label: 'Storyboard', reference: 'storyboards', required: true },
    shotId: { label: 'Shot', shot: true, required: true },
    requiredQuantity: { label: 'Required quantity (blank = unknown)', number: true },
    allocatedQuantity: { label: 'Allocated quantity (blank = unknown)', number: true },
    notes: { label: 'Shot-specific requirements / allocation notes' },
  },
};
export const resourceKey = (category, name) =>
  `${category}:${String(name).trim().replace(/\s+/g, ' ').toLowerCase()}`;
export function validateResourceUniqueness(document) {
  const resources = document.resources || [],
    links = document.resourceLinks || [];
  const names = resources.map((resource) => resourceKey(resource.category, resource.name));
  if (new Set(names).size !== names.length)
    throw new Error(
      'Production resource already exists. Reuse its stable ID or review a deliberate merge.',
    );
  const targets = links.map((link) => `${link.resourceId}:${link.boardId}:${link.shotId}`);
  if (new Set(targets).size !== targets.length)
    throw new Error('Production resource is already linked to this shot. Edit the existing link.');
}
