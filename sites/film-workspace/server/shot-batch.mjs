const patchKeys = new Set(['shot_id', 'changes']);

function validateEntry(entry, args, seen, validateTarget, validateChanges) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Shot update entries must be objects.');
  }
  if (Object.keys(entry).some((key) => !patchKeys.has(key))) {
    throw new Error('Shot update contains an unsupported field.');
  }
  validateTarget({ ...entry, expected_revision: args.expected_revision });
  validateChanges(entry);
  if (seen.has(entry.shot_id)) throw new Error('Shot update IDs must be unique.');
  seen.add(entry.shot_id);
}

export function validateBatch(args, validateTarget, validateChanges) {
  if (!Array.isArray(args.updates) || args.updates.length < 1 || args.updates.length > 100) {
    throw new Error('Shot updates require between 1 and 100 entries.');
  }
  const seen = new Set();
  for (const entry of args.updates)
    validateEntry(entry, args, seen, validateTarget, validateChanges);
}

export function findShot(document, id) {
  const matches = document.shots.filter((shot) => shot.id === id);
  if (matches.length !== 1) throw new Error('Shot not found or ambiguous ID.');
  return matches[0];
}

/** Mutate only an authorized clone; the caller saves once after every patch succeeds. */
export function prepareBatch(document, updates, patchText) {
  return updates.map((entry) => ({
    shot_id: entry.shot_id,
    updated_fields: patchText(findShot(document, entry.shot_id), entry.changes),
  }));
}
