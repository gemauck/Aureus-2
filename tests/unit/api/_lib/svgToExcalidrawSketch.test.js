import { describe, test, expect } from '@jest/globals';
import { svgToExcalidrawSketch, pathDToRoughBBox } from '../../../../api/_lib/svgToExcalidrawSketch.js';

describe('pathDToRoughBBox', () => {
    test('parses simple M L path', () => {
        const b = pathDToRoughBBox('M 10 20 L 30 40');
        expect(b).toEqual({ x: 10, y: 20, width: 20, height: 20 });
    });

    test('returns null for empty', () => {
        expect(pathDToRoughBBox('')).toBeNull();
    });
});

describe('svgToExcalidrawSketch', () => {
    test('converts rect and circle', () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="5" y="6" width="10" height="12"/><circle cx="20" cy="20" r="4"/></svg>`;
        const { elements, warnings } = svgToExcalidrawSketch(svg);
        const rect = elements.find((e) => e.type === 'rectangle' && e.x === 5 && e.y === 6);
        expect(rect).toBeTruthy();
        expect(rect.roughness).toBe(0);
        expect(elements.some((e) => e.type === 'ellipse' && e.width === 8 && e.height === 8)).toBe(true);
        expect(warnings.length).toBeGreaterThan(0);
    });
});
