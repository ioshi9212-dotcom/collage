import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeExtraLayers } from './extraLayers.js';

test('drawing layers preserve front/back placement and editable shape settings', () => {
  const layers = sanitizeExtraLayers({
    pages: {
      1: {
        drawings: [
          {
            id: 'shape-1',
            type: 'shape',
            plane: 'back',
            shapeKind: 'ellipse',
            x: 100,
            y: 120,
            width: 640,
            height: 280,
            fillEnabled: false,
            fillColor: '#123456',
            strokeEnabled: true,
            strokeColor: '#abcdef',
            strokeWidth: 18,
            opacity: 0.42,
          },
          {
            id: 'line-1',
            type: 'line',
            plane: 'back',
            length: 500,
          },
          {
            id: 'image-1',
            type: 'image',
            src: 'https://example.test/drawing.png',
          },
        ],
      },
    },
  });

  const [shape, line, image] = layers.pages['1'].drawings;
  assert.deepEqual(shape, {
    id: 'shape-1',
    type: 'shape',
    plane: 'back',
    shapeKind: 'ellipse',
    x: 100,
    y: 120,
    width: 640,
    height: 280,
    fillEnabled: false,
    fillColor: '#123456',
    strokeEnabled: true,
    strokeColor: '#abcdef',
    strokeWidth: 18,
    opacity: 0.42,
  });
  assert.equal(line.plane, 'back');
  assert.equal(image.plane, 'front');
});

test('shape geometry and style values are safely clamped', () => {
  const layers = sanitizeExtraLayers({
    pages: {
      1: {
        drawings: [{
          id: 'shape-clamped',
          type: 'shape',
          plane: 'somewhere',
          shapeKind: 'triangle',
          width: 1,
          height: 999999,
          strokeWidth: 999999,
          opacity: 4,
        }],
      },
    },
  });

  const shape = layers.pages['1'].drawings[0];
  assert.equal(shape.plane, 'front');
  assert.equal(shape.shapeKind, 'rectangle');
  assert.equal(shape.width, 20);
  assert.equal(shape.height, 10000);
  assert.equal(shape.strokeWidth, 500);
  assert.equal(shape.opacity, 1);
});
