// --- State ---
const STORAGE_KEY = 'apeOnAWhaleStoryboard';
const LEGACY_STORAGE_KEY = 'grittyStoryboard';
let isHydrating = false;

const state = {
  shots: [],
  layoutColumns: 1,
  sceneColors: {},
  activeTab: 'storyboard',
};

const SHOT_TYPE_OPTIONS = ['Wide', 'Establishing', 'Medium', 'Close‑Up', 'Extreme CU', 'Over‑the‑Shoulder', 'POV', 'Drone', 'Insert'];
const LENS_OPTIONS = ['24mm', '35mm', '50mm', '85mm', '105mm'];
const MOVE_OPTIONS = ['Locked', 'Pan', 'Tilt', 'Dolly', 'Handheld', 'Crane', 'Drone'];