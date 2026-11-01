/**
 * Card rendering emits actions; the editor owns the storyboard and persistence.
 * @typedef {Object} ShotCardActions
 * @property {HTMLTemplateElement} template
 * @property {number} nextNumber
 * @property {() => string} createId
 * @property {() => number | undefined} scope
 * @property {(card: HTMLLIElement) => void} onTitleChange
 * @property {(card: HTMLLIElement) => void} onTextChange
 * @property {(card: HTMLLIElement, selected: boolean) => void} onSelectionChange
 * @property {(card: HTMLLIElement) => void} onFold
 * @property {(card: HTMLLIElement, source: string | null) => void} onImageChange
 * @property {(card: HTMLLIElement) => void} onDuplicate
 * @property {(card: HTMLLIElement) => void} onDelete
 */

const fields = {
  scene: '.scene',
  number: '.shotnum',
  type: '.type',
  lens: '.lens',
  move: '.move',
  desc: '.desc',
  chars: '.chars',
  location: '.location',
  shootDate: '.shootdate',
  equipment: '.equipment',
  props: '.props',
  notes: '.notes',
};

function fieldValues(shot, nextNumber) {
  return {
    ...shot,
    number: shot.number || nextNumber,
    type: shot.type || 'Wide',
    lens: shot.lens || '35mm',
    move: shot.move || 'Locked',
    shootDate: shot.shootDate || shot.shootingDate || '',
  };
}

function fillFields(card, shot, nextNumber) {
  const values = fieldValues(shot, nextNumber);
  for (const [field, selector] of Object.entries(fields)) {
    const input = card.querySelector(selector);
    const value = values[field] || '';
    if (
      input.tagName === 'SELECT' &&
      value &&
      !Array.from(input.options).some((option) => option.value === value)
    ) {
      input.add(new Option(value, value));
    }
    input.value = value;
  }
}

function displayImage(card, source) {
  const visible = Boolean(source);
  const image = card.querySelector('.frame-image');
  image.src = source || '';
  image.classList.toggle('hidden', !visible);
  card.querySelector('.frame-placeholder').classList.toggle('hidden', visible);
  const remove = card.querySelector('.remove-image');
  remove.classList.toggle('hidden', !visible);
  remove.classList.toggle('flex', visible);
}

function bindImages(card, shot, actions) {
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(shot.imageData || '')) {
    displayImage(card, shot.imageData);
  }
  card.querySelector('.image-upload').addEventListener('change', (event) => {
    const scope = actions.scope();
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (scope !== actions.scope()) return;
      delete card.dataset.imagePath;
      displayImage(card, reader.result);
      actions.onImageChange(card, reader.result);
    };
    reader.readAsDataURL(file);
  });
  card.querySelector('.remove-image').addEventListener('click', () => {
    delete card.dataset.imagePath;
    displayImage(card, null);
    actions.onImageChange(card, null);
  });
}

function bindActions(card, actions) {
  card.querySelector('.shot-title').addEventListener('input', (event) => {
    card.dataset.customTitle = event.target.textContent.trim();
    actions.onTitleChange(card);
  });
  const select = card.querySelector('.select-shot');
  select.checked = false;
  select.addEventListener('change', () => actions.onSelectionChange(card, select.checked));
  card.querySelector('.btnToggleFold').addEventListener('click', () => actions.onFold(card));
  card.querySelector('.btnDup').addEventListener('click', () => actions.onDuplicate(card));
  card.querySelector('.btnDelete').addEventListener('click', () => actions.onDelete(card));
  for (const input of card.querySelectorAll('.inp')) {
    input.addEventListener('input', () => actions.onTextChange(card));
  }
}

/** @param {Object} shot @param {ShotCardActions} actions @returns {HTMLLIElement} */
export function createShotCard(shot, actions) {
  const card = actions.template.content.firstElementChild.cloneNode(true);
  card.dataset.id = shot.id || (shot.id = actions.createId());
  card.dataset.customTitle = shot.customTitle || '';
  if (shot.imagePath) card.dataset.imagePath = shot.imagePath;
  fillFields(card, shot, actions.nextNumber);
  bindImages(card, shot, actions);
  bindActions(card, actions);
  return card;
}
