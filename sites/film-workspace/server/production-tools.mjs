import { productionFields, isProductionId } from '../app/production-model.mjs';
import { readProduction, writeProduction } from '../app/production-client.mjs';

const uuid = { type: 'string', format: 'uuid' };
const collection = { type: 'string', enum: Object.keys(productionFields) };
const changes = Object.fromEntries(
  Object.entries(productionFields).map(([kind, fields]) => [
    kind,
    {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(fields).map(([key, definition]) => [
          key,
          definition.multiple
            ? { type: 'array', items: uuid, maxItems: 100, uniqueItems: true }
            : definition.number
              ? {
                  type: ['number', 'string'],
                  minimum: 0,
                  maximum: 1000000,
                  description:
                    'Nonnegative number, or empty string for unknown. Numeric strings are rejected.',
                }
              : { type: 'string', maxLength: key === 'name' ? 160 : 4000 },
        ]),
      ),
      additionalProperties: false,
    },
  ]),
);
export const productionToolDefinitions = [
  {
    name: 'get_project_production',
    description:
      'Read project-wide people, characters/performers, real filming venues, script settings, scenes, props/equipment resources and shot/resource assignments, with stable IDs and revision. Includes minimal storyboard/shot IDs for linking and incomplete-logistics flags. Script labels and availability notes do not confirm bookings. Contact data is private project data; do not disclose outside the authorized workflow.',
    inputSchema: {
      type: 'object',
      properties: { project_id: uuid },
      required: ['project_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_production_record',
    description:
      'Create or patch one project production record using the current register revision. Use a new stable UUID to create; reuse existing IDs to edit. Supply only approved factual changes. Separate characters from performers and script settings from filming venues. Use collections resources/resourceLinks for project props/equipment. Never invent real contacts, quantities, availability or bookings. Omitted fields and storyboard images/text are preserved. Read back after uncertain saves before retrying.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: uuid,
        expected_revision: { type: 'integer', minimum: 0 },
        collection,
        record_id: uuid,
        changes: {
          type: 'object',
          properties: Object.assign(
            {},
            ...Object.values(changes).map((schema) => schema.properties),
          ),
          minProperties: 1,
          additionalProperties: false,
        },
      },
      required: ['project_id', 'expected_revision', 'collection', 'record_id', 'changes'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_production_record',
    description:
      'Remove an explicitly user-requested production record using its stable ID and current register revision. Referenced records cannot be removed until their assignments are cleared. Never deletes storyboard shots or images.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: uuid,
        expected_revision: { type: 'integer', minimum: 0 },
        collection,
        record_id: uuid,
      },
      required: ['project_id', 'expected_revision', 'collection', 'record_id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];
function validateArguments(name, args) {
  const definition = productionToolDefinitions.find((tool) => tool.name === name);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Arguments must be an object.');
  if (Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key)))
    throw new Error('Unknown argument.');
  if (!isProductionId(args.project_id)) throw new Error('A valid project ID is required.');
}
function validateWrite(args) {
  if (!Object.hasOwn(productionFields, args.collection) || !isProductionId(args.record_id))
    throw new Error('Production collection and stable record ID are required.');
  if (!Number.isSafeInteger(args.expected_revision) || args.expected_revision < 0)
    throw new Error('Production register revision is required.');
}
export async function runProductionTool(client, name, args) {
  validateArguments(name, args);
  if (name !== 'get_project_production') validateWrite(args);
  if (name === 'update_production_record' && !Object.keys(args.changes || {}).length)
    throw new Error('Production update needs at least one field.');
  const state = await readProduction(client, args.project_id);
  if (name === 'get_project_production') return state;
  if (state.version !== args.expected_revision)
    throw new Error('Production register changed. Read it again before making changes.');
  return writeProduction(
    client,
    state,
    args.collection,
    args.record_id,
    name === 'delete_production_record' ? {} : args.changes,
    name === 'delete_production_record',
  );
}
