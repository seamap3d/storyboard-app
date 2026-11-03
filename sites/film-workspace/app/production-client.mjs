import { validateProduction, patchProduction, productionGaps } from './production-model.mjs';

export async function readProduction(client, projectId) {
  const value = await client.rpc('get_project_production', { p_project: projectId });
  validateProduction(value.document);
  return { ...value, gaps: registerGaps(value) };
}
export async function writeProduction(client, state, kind, id, changes, remove = false) {
  const document = patchProduction(state.document, kind, id, changes, remove);
  const response = await saveRequest(client, {
    p_project: state.project_id,
    p_version: state.version,
    p_document: document,
  });
  const saved = Array.isArray(response) ? response[0] : response;
  if (saved?.project_id !== state.project_id || !Number.isSafeInteger(saved.version))
    throw Object.assign(
      new Error('Production save could not be confirmed. Reload before retrying; keep your edits.'),
      { code: 'RPC_UNCONFIRMED' },
    );
  validateProduction(saved.document);
  return {
    ...saved,
    storyboards: state.storyboards,
    gaps: registerGaps({ ...saved, storyboards: state.storyboards }),
  };
}

async function saveRequest(client, body) {
  try {
    return await client.rpc('save_project_production', body);
  } catch (error) {
    if (!error.status && !error.code) error.code = 'RPC_UNCONFIRMED';
    throw error;
  }
}

function registerGaps(state) {
  return {
    ...productionGaps(state.document),
    unavailableShotAssignments: state.document.shotLinks
      .filter(
        (link) =>
          !state.storyboards.some(
            (board) =>
              board.id === link.boardId && board.shots.some((shot) => shot.id === link.shotId),
          ),
      )
      .map((link) => link.id),
  };
}
