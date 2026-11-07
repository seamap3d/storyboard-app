import { resourceFields, validateResourceUniqueness } from './resource-fields.mjs';
// Project-wide production records. These never rewrite storyboard documents.
const field = (label, options = {}) => ({ label, ...options });
export const productionFields = {
  people: {
    name: field('Name'),
    job: field('Production role / department'),
    email: field('Email', { type: 'email' }),
    phone: field('Phone'),
    availability: field('Availability / restrictions'),
    callNotes: field('Call / preparation requirements'),
    notes: field('Notes'),
  },
  characters: {
    name: field('Character'),
    performerId: field('Performer', { reference: 'people' }),
    notes: field('Notes'),
  },
  locations: {
    name: field('Filming venue'),
    address: field('Address'),
    contact: field('Venue contact'),
    access: field('Access / permission arrangements'),
    parking: field('Parking / arrival'),
    travel: field('Travel / setup notes'),
    availability: field('Availability / restrictions'),
    permission: field('Permission', { choices: ['unconfirmed', 'requested', 'confirmed'] }),
    notes: field('Notes'),
  },
  settings: {
    name: field('Script setting'),
    locationId: field('Filming venue', { reference: 'locations' }),
    notes: field('Notes'),
  },
  scenes: {
    name: field('Scene'),
    settingId: field('Script setting', { reference: 'settings' }),
    notes: field('Notes'),
  },
  shotLinks: {
    boardId: field('Storyboard', { reference: 'storyboards', required: true }),
    shotId: field('Shot', { shot: true, required: true }),
    sceneId: field('Scene', { reference: 'scenes' }),
    characterIds: field('Characters', { reference: 'characters', multiple: true }),
    crewIds: field('Assigned crew', { reference: 'people', multiple: true }),
  },
};
Object.assign(productionFields, resourceFields);
export const productionLabels = {
  resources: 'Resources',
  resourceLinks: 'Resource assignments',
  people: 'People',
  characters: 'Characters & performers',
  locations: 'Filming venues',
  settings: 'Script settings',
  scenes: 'Scenes',
  shotLinks: 'Shot assignments',
};
export const isProductionId = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const emptyProduction = () =>
  Object.fromEntries(Object.keys(productionFields).map((key) => [key, []]));
const object = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function validateMultiple(value) {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    new Set(value).size !== value.length ||
    !value.every(isProductionId)
  )
    throw new Error('Production links must contain unique record IDs.');
}
function validateQuantity(value) {
  if (value === '') return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000)
    throw new Error(
      'Production quantities must be numbers from 0 to 1000000, or blank for unknown.',
    );
}
function validateValue(value, definition) {
  if (definition.multiple) return validateMultiple(value);
  if (definition.number) return validateQuantity(value);
  if (typeof value !== 'string' || value.length > 4000)
    throw new Error('Production fields must be text of at most 4000 characters.');
  if (definition.choices && !definition.choices.includes(value))
    throw new Error('Production field has an invalid choice.');
  validateReferenceValue(value, definition);
  if (definition.required && !value.trim())
    throw new Error('Production assignment requires a storyboard and shot.');
}
function validateReferenceValue(value, definition) {
  if (definition.reference && value && !isProductionId(value))
    throw new Error('Production link needs a valid record ID.');
}
function validateRecord(kind, record) {
  if (!object(record) || !isProductionId(record.id))
    throw new Error('Production record needs a valid stable ID.');
  const fields = productionFields[kind];
  for (const [key, definition] of Object.entries(fields)) {
    if (record[key] !== undefined) validateValue(record[key], definition);
    else if (definition.required)
      throw new Error('Production assignment requires a storyboard and shot.');
  }
  if (
    Object.hasOwn(fields, 'name') &&
    (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 160)
  )
    throw new Error('Production name must contain 1–160 characters.');
}
function validateReferences(document, kind, record) {
  for (const [key, definition] of Object.entries(productionFields[kind])) {
    if (!definition.reference || definition.reference === 'storyboards') continue;
    const values = definition.multiple ? record[key] || [] : [record[key]].filter(Boolean);
    for (const id of values) {
      if (!(document[definition.reference] || []).some((item) => item.id === id))
        throw new Error(
          'Production link is missing. Remove its assignments before deleting a record.',
        );
    }
  }
}
function collectionRecords(document, kind) {
  const records =
    document[kind] === undefined && Object.hasOwn(resourceFields, kind) ? [] : document[kind];
  if (!Array.isArray(records) || records.length > 1000)
    throw new Error('Production collections must be arrays with at most 1000 records.');
  return records;
}
export function validateProduction(document) {
  if (!object(document) || new TextEncoder().encode(JSON.stringify(document)).length > 1048576)
    throw new Error('Production register must be an object under 1 MiB.');
  const ids = new Set();
  for (const kind of Object.keys(productionFields)) {
    const records = collectionRecords(document, kind);
    for (const record of records) {
      validateRecord(kind, record);
      if (ids.has(record.id)) throw new Error('Production record IDs must be unique.');
      ids.add(record.id);
      validateReferences(document, kind, record);
    }
  }
  const targets = document.shotLinks.map((link) => link.boardId + ':' + link.shotId);
  if (new Set(targets).size !== targets.length)
    throw new Error(
      'A shot can have only one production assignment. Edit its existing assignment.',
    );
  validateResourceUniqueness(document);
  return document;
}
export function normalizeProduction(document) {
  const copy = structuredClone(document);
  for (const kind of Object.keys(resourceFields)) if (copy[kind] === undefined) copy[kind] = [];
  return copy;
}
/** Patch one record; preserve all unmentioned fields and forward-compatible data. */
export function patchProduction(document, kind, id, changes, remove = false) {
  if (!Object.hasOwn(productionFields, kind) || !isProductionId(id))
    throw new Error('Production collection and stable record ID are required.');
  if (
    !object(changes) ||
    Object.keys(changes).some((key) => !Object.hasOwn(productionFields[kind], key))
  )
    throw new Error('Production changes contain unsupported fields.');
  const next = normalizeProduction(document),
    records = next[kind];
  const index = records.findIndex((record) => record.id === id);
  if (remove) {
    if (index < 0) throw new Error('Production record was not found.');
    records.splice(index, 1);
  } else {
    const record = { ...(index < 0 ? { id } : records[index]), ...changes };
    if (index < 0) records.push(record);
    else records[index] = record;
  }
  return validateProduction(next);
}
export function productionGaps(document) {
  return {
    unassignedCharacters: document.characters
      .filter((record) => !record.performerId)
      .map((record) => record.id),
    unmappedSettings: document.settings
      .filter((record) => !record.locationId)
      .map((record) => record.id),
    incompleteVenues: document.locations
      .filter((record) => !record.address || !record.access || record.permission !== 'confirmed')
      .map((record) => record.id),
    peopleWithoutContact: document.people
      .filter((record) => !record.email && !record.phone)
      .map((record) => record.id),
  };
}
