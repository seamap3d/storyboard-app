import { readProduction, saveProductionDocument } from '../app/production-client.mjs';
import {
  resourceSuggestions,
  promoteResources,
  projectResources,
  resourceReadiness,
} from '../app/resource-model.mjs';
import { isProductionId } from '../app/production-model.mjs';
const project = { type: 'string', format: 'uuid' };
export const resourceToolDefinitions = [
  {
    name: 'get_project_resources',
    description:
      'Read project-wide props/equipment, quantities, suppliers/responsible people, readiness, collection/return notes, shot/scene usage and reviewed-source candidates across all storyboards. Mentions are requirements, not evidence of quantity or availability. No image bytes/private image paths. Unknown quantities remain unknown. Read the current register revision before editing.',
    inputSchema: {
      type: 'object',
      properties: { project_id: project },
      required: ['project_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'promote_resource_mentions',
    description:
      'Promote user-reviewed source requirements into canonical project resources and stable shot links in one revision-checked save. Read get_project_resources first. Supply exact source category/name; optionally select an existing same-category resource_id for an explicit merge. Preserve existing quantities, suppliers, readiness and notes; legacy details remain source provenance. Never infer available/required/allocated quantity from mention counts. Does not rewrite source shots or images. Use update_production_record collections resources/resourceLinks for manual edits.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: project,
        expected_revision: { type: 'integer', minimum: 0 },
        requirements: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['prop', 'equipment'] },
              name: { type: 'string', minLength: 1, maxLength: 160 },
              resource_id: project,
            },
            required: ['category', 'name'],
            additionalProperties: false,
          },
        },
      },
      required: ['project_id', 'expected_revision', 'requirements'],
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
function validate(name, args) {
  const definition = resourceToolDefinitions.find((tool) => tool.name === name);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Arguments must be an object.');
  if (Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key)))
    throw new Error('Unknown argument.');
  if (!isProductionId(args.project_id)) throw new Error('A valid project ID is required.');
  if (
    name === 'promote_resource_mentions' &&
    (!Number.isSafeInteger(args.expected_revision) || args.expected_revision < 0)
  )
    throw new Error('Production register revision is required.');
}
export async function runResourceTool(client, name, args) {
  validate(name, args);
  const state = await readProduction(client, args.project_id);
  if (name === 'get_project_resources')
    return {
      project_id: state.project_id,
      revision: state.version,
      resources: projectResources(state).map((resource) => ({
        ...resource,
        gaps: resourceReadiness(resource),
      })),
      suggestions: resourceSuggestions(state),
      limitation:
        'Source mentions do not confirm inventory, bookings or availability. Per-shot quantities are not summed across sequential shots or alternate storyboards. Dated allocation/conflict checks require the later shoot-day planner.',
    };
  if (args.expected_revision !== state.version)
    throw new Error('Production register changed. Read it again before promoting requirements.');
  const document = promoteResources(state, args.requirements);
  return saveProductionDocument(client, state, document);
}
