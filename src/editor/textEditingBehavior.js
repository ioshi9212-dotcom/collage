import Konva from 'konva';

const TRANSFORMER_NAME = 'collage-text-selection-transformer';
const SAFE_BODY_FONT_ID = 'system';
const BODY_TEXT_BUTTONS = new Set(['+ Обычный текст', '+ Текст']);
const MIN_TEXT_WIDTH = 40;
const MAX_TEXT_WIDTH = 4000;

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function visibleEditorStage() {
  return Array.from(Konva.stages || []).find((stage) => {
    const container = stage?.container?.();
    return container?.closest?.('.stage-frame') && container.offsetParent !== null;
  }) || null;
}

function isUserTextNode(node) {
  return node?.getClassName?.() === 'Text'
    && node.attrs?.width != null
    && typeof node.text?.() === 'string';
}

function userTextNodes(stage) {
  if (!stage?.find) return [];
  return stage.find('Text').filter(isUserTextNode);
}

function selectedTextNode(stage) {
  return userTextNodes(stage).find((node) => (
    node.listening?.()
    && Number(node.shadowBlur?.() || 0) > 0
  )) || null;
}

function targetPreviewPixelRatio() {
  return Math.min(2, Math.max(1.5, Number(window.devicePixelRatio) || 1));
}

function sharpenVisibleStage(stage) {
  if (!stage) return 1;
  const target = targetPreviewPixelRatio();
  let applied = 1;

  stage.getLayers?.().forEach((layer) => {
    const sceneCanvas = layer.getCanvas?.();
    const hitCanvas = layer.getHitCanvas?.();
    const current = Number(sceneCanvas?.getPixelRatio?.() || 1);
    applied = Math.max(applied, current);

    if (current + 0.01 < target) {
      sceneCanvas?.setPixelRatio?.(target);
      hitCanvas?.setPixelRatio?.(target);
      applied = target;
      layer.batchDraw?.();
    }
  });

  return applied;
}

function fieldControl(labelText, selector) {
  const labels = Array.from(document.querySelectorAll('.album-mode-inspector label.field'));
  const field = labels.find((label) => normalizeLabel(label.querySelector('span')?.textContent) === labelText);
  return field?.querySelector(selector) || null;
}

function setNativeControlValue(control, value, eventName = 'input') {
  if (!control) return false;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;

  control.focus?.();
  setter.call(control, String(value));
  control.dispatchEvent(new Event(eventName, { bubbles: true }));
  if (eventName !== 'change') control.dispatchEvent(new Event('change', { bubbles: true }));
  control.blur?.();
  return true;
}

function commitSelectedTextWidth(width) {
  const safeWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, Math.round(Number(width) || MIN_TEXT_WIDTH)));
  const input = fieldControl('Ширина', 'input[type="number"]');
  return setNativeControlValue(input, safeWidth, 'input');
}

function currentTextInspectorState() {
  const inspector = document.querySelector('.album-mode-inspector');
  const textarea = inspector?.querySelector('textarea');
  const fontSelect = fieldControl('Гарнитура', 'select');
  return {
    textarea,
    fontSelect,
    text: textarea?.value || '',
    fontId: fontSelect?.value || '',
  };
}

function applySafeBodyFont({ allowExistingPlaceholder = false } = {}) {
  const { textarea, fontSelect, text, fontId } = currentTextInspectorState();
  if (!textarea || !fontSelect || fontId !== 'onest') return false;
  if (!allowExistingPlaceholder && !BODY_TEXT_BUTTONS.has(normalizeLabel(document.body.dataset.pendingTextPreset))) return false;
  if (allowExistingPlaceholder && text !== 'Новый текст') return false;
  return setNativeControlValue(fontSelect, SAFE_BODY_FONT_ID, 'change');
}

function destroyTransformer(stage) {
  const transformer = stage?.findOne?.(`.${TRANSFORMER_NAME}`);
  if (!transformer) return;
  const layer = transformer.getLayer?.();
  transformer.destroy?.();
  layer?.batchDraw?.();
}

function ensureTextTransformer(stage, textNode) {
  if (!stage || !textNode) {
    destroyTransformer(stage);
    return null;
  }

  const layer = textNode.getLayer?.();
  if (!layer) return null;

  let transformer = stage.findOne?.(`.${TRANSFORMER_NAME}`) || null;
  if (!transformer) {
    transformer = new Konva.Transformer({
      name: TRANSFORMER_NAME,
      rotateEnabled: false,
      keepRatio: false,
      flipEnabled: false,
      enabledAnchors: ['middle-left', 'middle-right'],
      anchorSize: 30,
      anchorCornerRadius: 3,
      anchorStroke: '#3e484d',
      anchorStrokeWidth: 2,
      anchorFill: '#ffffff',
      borderStroke: '#3e484d',
      borderStrokeWidth: 2,
      borderDash: [12, 8],
      padding: 10,
      ignoreStroke: true,
      boundBoxFunc: (oldBox, newBox) => ({
        ...newBox,
        width: Math.max(MIN_TEXT_WIDTH, newBox.width),
        height: oldBox.height,
        y: oldBox.y,
      }),
    });
    layer.add(transformer);
  } else if (transformer.getLayer?.() !== layer) {
    transformer.moveTo?.(layer);
  }

  transformer.off?.('.stage4b');
  transformer.nodes?.([textNode]);
  transformer.moveToTop?.();
  transformer.on?.('transformend.stage4b', () => {
    const node = transformer.nodes?.()[0];
    if (!node) return;
    const nextWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, node.width() * node.scaleX()));
    node.width(nextWidth);
    node.scaleX(1);
    node.scaleY(1);
    transformer.forceUpdate?.();
    commitSelectedTextWidth(nextWidth);
    node.getLayer?.()?.batchDraw?.();
  });

  transformer.forceUpdate?.();
  layer.batchDraw?.();
  return transformer;
}

export function installTextEditingBehavior() {
  if (window.__collageTextEditingBehaviorInstalled) return;
  window.__collageTextEditingBehaviorInstalled = true;

  let scheduled = false;
  let lastPixelRatio = 1;

  function sync() {
    scheduled = false;
    const stage = visibleEditorStage();
    if (!stage) return;

    lastPixelRatio = sharpenVisibleStage(stage);
    const textNode = selectedTextNode(stage);
    ensureTextTransformer(stage, textNode);

    if (textNode) applySafeBodyFont({ allowExistingPlaceholder: true });
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    afterReactPaint(sync);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    const label = normalizeLabel(button?.textContent);

    if (BODY_TEXT_BUTTONS.has(label)) {
      document.body.dataset.pendingTextPreset = label;
      afterReactPaint(() => {
        applySafeBodyFont();
        delete document.body.dataset.pendingTextPreset;
        scheduleSync();
      });
      return;
    }

    scheduleSync();
  }, true);

  document.addEventListener('pointerup', scheduleSync, true);
  document.addEventListener('change', scheduleSync, true);
  document.addEventListener('input', scheduleSync, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.fonts?.ready?.then(scheduleSync).catch(() => {});
  window.addEventListener('resize', scheduleSync);

  window.__collageTextEditing = {
    getState: () => {
      const stage = visibleEditorStage();
      const selected = selectedTextNode(stage);
      const transformer = stage?.findOne?.(`.${TRANSFORMER_NAME}`) || null;
      const inspector = currentTextInspectorState();
      return {
        hasStage: Boolean(stage),
        hasSelectedText: Boolean(selected),
        hasTransformer: Boolean(transformer),
        pixelRatio: lastPixelRatio,
        fontId: inspector.fontId,
        text: inspector.text,
        width: selected ? Math.round(selected.width() * selected.scaleX()) : null,
      };
    },
    resizeSelectedText: (width) => {
      const stage = visibleEditorStage();
      const selected = selectedTextNode(stage);
      if (!selected) return false;
      const safeWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, Math.round(Number(width) || MIN_TEXT_WIDTH)));
      selected.width(safeWidth);
      selected.scaleX(1);
      selected.getLayer?.()?.batchDraw?.();
      const committed = commitSelectedTextWidth(safeWidth);
      scheduleSync();
      return committed;
    },
  };

  scheduleSync();
}
