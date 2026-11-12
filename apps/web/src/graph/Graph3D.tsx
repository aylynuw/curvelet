import { Complex, type Graphable } from '@math/engine';
import { colourOf } from '@math/render';
import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Strings } from '../i18n';
import { cssToRgb } from './exportGraph';
import { MathText } from '../components/MathText';
import { saveBlob } from '../files/save';

export type Surface = Extract<Graphable, { kind: 'surface' } | { kind: 'complex' }>;

export interface Graph3DHandle {
  reset(): void;
  png(): void;
}

/** half the width of the square of x and y shown */
const R = 5;
/** grid cells per side */
const N = 96;
/** heights beyond this are left out, so poles and steep walls don't swamp the view */
const CAP = 2 * R;

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

/**
 * z = f(x, y) surfaces and |f(z)| for complex functions, in one 3D view.
 * Draws only when the view changes (no animation loop).
 */
const EXAMPLES_3D = ['z = x^2 - y^2', 'z = sin(x) cos(y)', 'let g(z) = (z^2 - 1)/(z^2 + 1)'];

export const Graph3D = forwardRef<
  Graph3DHandle,
  { surfaces: Surface[]; seriesOf: (id: string) => number; t: Strings; onInsert: (source: string) => void }
>(function Graph3D({ surfaces, seriesOf, t, onInsert }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const api = useRef<Graph3DHandle & { rotate(dAz: number, dEl: number): void }>(null);
    const [failed, setFailed] = useState(false);
    const [themeVersion, themeChanged] = useReducer((n: number) => n + 1, 0);

    useImperativeHandle(ref, () => ({ reset: () => api.current?.reset(), png: () => api.current?.png() }), []);

    useEffect(() => {
      const dark = matchMedia('(prefers-color-scheme: dark)');
      dark.addEventListener('change', themeChanged);
      window.addEventListener('themechange', themeChanged);
      return () => {
        dark.removeEventListener('change', themeChanged);
        window.removeEventListener('themechange', themeChanged);
      };
    }, []);

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const css = getComputedStyle(wrap);
      const token = (name: string) => css.getPropertyValue(name).trim();
      // colours from CSS are sRGB; three.js works in linear light unless told
      const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      const rgb = (c: string) => srgb(...cssToRgb(c, token('--color-paper')));
      const paper = rgb(token('--color-paper'));
      const ink = rgb(token('--color-ink'));

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      } catch {
        setFailed(true);
        return;
      }
      setFailed(false);
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.domElement.className = 'graph3d__canvas';
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', surfaces.length ? t.graph3dOf(surfaces.map((s) => s.label).join('; ')) : t.graphEmptyLabel);
      renderer.domElement.setAttribute('aria-describedby', 'graph3d-help');
      wrap.append(renderer.domElement);
      const labels = new CSS2DRenderer();
      labels.domElement.className = 'graph3d__labels';
      wrap.append(labels.domElement);

      const scene = new THREE.Scene();
      scene.background = paper;
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(R, 3 * R, 2 * R);
      scene.add(sun);

      // floor grid and axes
      const grid = new THREE.GridHelper(2 * R, 10, rgb(token('--color-grid-2')), rgb(token('--color-grid-2')));
      scene.add(grid);
      const axisMaterial = new THREE.LineBasicMaterial({ color: ink });
      const label = (text: string, at: THREE.Vector3) => {
        const el = document.createElement('span');
        el.className = 'graph3d__label';
        el.textContent = text;
        const obj = new CSS2DObject(el);
        obj.position.copy(at);
        scene.add(obj);
      };
      for (const [name, end] of [
        ['x', toThree(R + 0.8, 0, 0)],
        ['y', toThree(0, R + 0.8, 0)],
        ['z', toThree(0, 0, R + 0.8)],
      ] as const) {
        const start = name === 'z' ? toThree(0, 0, -R) : end.clone().multiplyScalar(-1);
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), axisMaterial));
        label(name, end.clone().multiplyScalar(1.06));
      }
      label(String(R), toThree(R, 0, 0).add(new THREE.Vector3(0, -0.5, 0)));
      label(String(R), toThree(0, R, 0).add(new THREE.Vector3(0, -0.5, 0)));

      // the surfaces
      const disposables: { dispose(): void }[] = [grid.geometry, axisMaterial];
      for (const s of surfaces) {
        const base = rgb(token(`--color-curve-${(seriesOf(s.id) % 8) + 1}`));
        const positions = new Float32Array((N + 1) * (N + 1) * 3);
        const colors = new Float32Array((N + 1) * (N + 1) * 3);
        const ok = new Uint8Array((N + 1) * (N + 1));
        for (let j = 0; j <= N; j++) {
          for (let i = 0; i <= N; i++) {
            const x = -R + (2 * R * i) / N;
            const y = -R + (2 * R * j) / N;
            let z: number;
            let colour: THREE.Color;
            if (s.kind === 'complex') {
              let w: Complex;
              try {
                w = s.fn(new Complex(x, y));
              } catch {
                w = new Complex(NaN, NaN);
              }
              z = w.abs();
              colour = srgb(...colourOf(w));
            } else {
              z = s.fn(x, y);
              // the line's colour, darker low down and lighter high up
              const tone = Math.max(0, Math.min(1, (z + CAP) / (2 * CAP)));
              colour = base.clone().lerp(paper, 0.45 * tone).lerp(ink, 0.3 * (1 - tone));
            }
            const k = j * (N + 1) + i;
            ok[k] = Number.isFinite(z) && Math.abs(z) <= CAP ? 1 : 0;
            const p = toThree(x, y, ok[k] ? z : 0);
            positions.set([p.x, p.y, p.z], k * 3);
            colors.set([colour.r, colour.g, colour.b], k * 3);
          }
        }
        // a cell is drawn only when all four corners are in range
        const index: number[] = [];
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const a = j * (N + 1) + i;
            const b = a + 1;
            const c = a + N + 1;
            const d = c + 1;
            if (ok[a] && ok[b] && ok[c] && ok[d]) index.push(a, c, b, b, c, d);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
        scene.add(new THREE.Mesh(geometry, material));
        disposables.push(geometry, material);
      }

      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      const home = () => {
        camera.position.set(2.4 * R, 1.8 * R, 2.4 * R);
        camera.lookAt(0, 0, 0);
      };
      home();
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      const render = () => {
        renderer.render(scene, camera);
        labels.render(scene, camera);
      };
      controls.addEventListener('change', render);

      const resize = () => {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        labels.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      resize();

      api.current = {
        reset: () => {
          home();
          controls.target.set(0, 0, 0);
          controls.update();
          render();
        },
        png: () => {
          render();
          renderer.domElement.toBlob((b) => b && void saveBlob(b, 'graph-3d.png'), 'image/png');
        },
        // arrow keys: turn around the vertical axis, or tilt
        rotate: (dAz, dEl) => {
          const offset = camera.position.clone().sub(controls.target);
          const sph = new THREE.Spherical().setFromVector3(offset);
          sph.theta += dAz;
          sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi + dEl));
          camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
          camera.lookAt(controls.target);
          controls.update();
          render();
        },
      };

      return () => {
        ro.disconnect();
        controls.dispose();
        for (const d of disposables) d.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labels.domElement.remove();
        api.current = null;
      };
    }, [surfaces, seriesOf, t, themeVersion]);

    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
      const step = Math.PI / 18;
      const turn: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (turn[e.key]) {
        e.preventDefault();
        api.current?.rotate(...turn[e.key]!);
      } else if (e.key === '0') {
        api.current?.reset();
      }
    };

    return (
      <>
        <div className="graph__stage graph3d" ref={wrapRef} onKeyDown={onKey}>
          {failed && <p className="graph3d__failed">{t.no3d}</p>}
          {!failed && surfaces.length === 0 && (
            <div className="graph__empty">
              <p>{t.empty3d}</p>
              <ul className="examples__list">
                {EXAMPLES_3D.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="example" aria-label={t.insert(ex)} onClick={() => onInsert(ex)}>
                      <MathText text={ex} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p id="graph3d-help" className="visually-hidden">
          {t.help3d}
        </p>
      </>
    );
});

export default Graph3D;
