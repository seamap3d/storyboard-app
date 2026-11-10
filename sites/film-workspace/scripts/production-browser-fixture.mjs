import { emptyProduction, validateProduction } from '../app/production-model.mjs';
export function productionBrowserFixture(project, board) {
  const fixture = {
    state: { project_id: project.id, version: 0, document: emptyProduction() },
    failure: null,
    extraBoards: [],
  };
  function snapshot() {
    return {
      ...structuredClone(fixture.state),
      storyboards: [board, ...fixture.extraBoards].map((source) => ({
        id: source.id,
        name: source.name,
        requirements: source.document.planning?.requirements || [],
        shots: source.document.shots.map((shot) => ({
          ...Object.fromEntries(
            [
              'id',
              'scene',
              'props',
              'equipment',
              'location',
              'desc',
              'type',
              'lens',
              'move',
              'chars',
              'notes',
              'shootDate',
              'estimatedMinutes',
              'status',
            ]
              .filter((key) => shot[key] !== undefined)
              .map((key) => [key, shot[key]]),
          ),
          name: shot.customTitle || shot.scene || 'Shot',
        })),
      })),
    };
  }
  fixture.handle = async (name, body, role) => {
    if (!['get_project_production', 'save_project_production'].includes(name)) return null;
    if (role === 'stranger')
      return Response.json(
        { code: '42501', message: 'Project not found or access denied.' },
        { status: 403 },
      );
    if (name === 'get_project_production') return Response.json(snapshot());
    if (!['owner', 'editor'].includes(role))
      return Response.json({ code: '42501', message: 'Editing access required.' }, { status: 403 });
    if (body.p_version !== fixture.state.version)
      return Response.json(
        { code: '40001', message: 'Production register changed.' },
        { status: 400 },
      );
    validateProduction(body.p_document);
    fixture.state = {
      project_id: project.id,
      version: fixture.state.version + 1,
      document: body.p_document,
    };
    if (fixture.failure === 'timeout') {
      fixture.failure = null;
      throw new DOMException('Fixture lost production commit response', 'TimeoutError');
    }
    return Response.json(fixture.state);
  };
  return fixture;
}
