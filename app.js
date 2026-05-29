/**
 * app.js  (ES module)
 * Main UI — Three.js viewer, file import/export, tree, property editor.
 */

import * as THREE    from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js';

import { WorldObjectCode, WorldObjectTypes } from './enums.js';

// ─── Worker bridge ────────────────────────────────────────────────────────────

const _worker    = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let   _nextId    = 0;
const _pending   = new Map();   // id → { resolve, reject, onProgress }

_worker.onmessage = ({ data: msg }) => {
    const handler = _pending.get(msg.id);
    if (!handler) return;
    if (msg.type === 'progress') { handler.onProgress?.(msg.pct); }
    else if (msg.type === 'done')  { _pending.delete(msg.id); handler.resolve(msg.result); }
    else if (msg.type === 'error') { _pending.delete(msg.id); handler.reject(new Error(msg.message)); }
};

/**
 * Decode raw .kgm bytes off the main thread.
 * @param {ArrayBuffer} buffer   Transferred to the worker (zero-copy).
 * @param {(pct:number)=>void} onProgress
 */
function workerDecode(buffer, onProgress) {
    return new Promise((resolve, reject) => {
        const id = _nextId++;
        _pending.set(id, { resolve, reject, onProgress });
        _worker.postMessage({ type: 'decode', id, buffer }, [buffer]);
    });
}

/**
 * Encode world data off the main thread.
 * @param {object} data
 * @param {(pct:number)=>void} onProgress
 * @returns {Promise<Uint8Array>}
 */
function workerEncode(data, onProgress) {
    return new Promise((resolve, reject) => {
        const id = _nextId++;
        _pending.set(id, { resolve, reject, onProgress });
        _worker.postMessage({ type: 'encode', id, data });
    });
}

// ─── Module-level state ───────────────────────────────────────────────────────

let jsonData        = null;   // currently loaded world
let ZoomSensitivity = 0.05;

// ─── DOM references ───────────────────────────────────────────────────────────

const ImportBtn             = document.getElementById('import-btn');
const ExportBtn             = document.getElementById('export-btn');
const SettingsBtn           = document.getElementById('settings-btn');
const FileInput             = document.querySelector('input[type="file"]');
const WorldObjectsPreviewer = document.getElementById('world-objects-previewer').children;
const PrototypesPreviewer   = document.getElementById('prototypes-previewer').children;
const LinksPreviewer        = document.getElementById('links-previewer').children;
const ObjectLinksPreviewer  = document.getElementById('object-links-previewer').children;
const Previewers            = [...document.getElementsByClassName('previewer')];
const PreviewersButton      = [...document.getElementsByClassName('preview-btn')];
const SizePreviewer         = document.getElementById('size-previewer');
const SettingsCloser        = document.getElementById('closer');
const SettingsContainer     = document.getElementById('settings-c');
const LoadingScreen         = document.getElementById('loading-screen');
const StylesButtons         = [...document.getElementsByClassName('styles-divs')];
const ZoomRange             = document.getElementById('zoomRange');


// ─── Loading screen ───────────────────────────────────────────────────────────

function loadingHide() {
    LoadingScreen.style.backdropFilter = 'blur(0px)';
    setTimeout(() => (LoadingScreen.style.display = 'none'), 200);
}
function loadingShow() {
    LoadingScreen.style.display        = 'flex';
    LoadingScreen.style.backdropFilter = 'blur(40px)';
}
function loadingSet(html) {
    LoadingScreen.children[0].innerHTML = html;
}

loadingSet(`
    <h1>
        <i class="fa-solid fa-cubes" style="margin-right:10px;color:var(--accent-color)"></i>
        SnapshotX
    </h1>
    <h5 style="font-family:NEON;margin:0;margin-bottom:10px;">Data Never Looked So Good.</h5>
`);

// ─── Settings & styles ────────────────────────────────────────────────────────

StylesButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const [radius, primary, accent, transition] = btn.getAttribute('datat').split('||');
        const root = document.documentElement.style;
        root.setProperty('--border-radius', radius + 'px');
        root.setProperty('--primary-color', primary);
        root.setProperty('--accent-color',  accent);
        root.setProperty('--transition',    transition);
    });
});

ZoomRange.addEventListener('change', () => {
    ZoomSensitivity = Number(ZoomRange.value) * 0.001;
});

SettingsCloser.addEventListener('click', () => { SettingsContainer.style.display = 'none'; });
SettingsBtn.addEventListener('click',    () => { SettingsContainer.style.display = 'flex'; });

// ─── Texture quality buttons ──────────────────────────────────────────────────

const _tqBtns = { low: document.getElementById('tq-low'), mid: document.getElementById('tq-mid'), high: document.getElementById('tq-high') };

function _setQuality(q) {
    _currentQuality = q;
    _loadAtlas(q);
    Object.entries(_tqBtns).forEach(([k, el]) => {
        el.style.outline = k === q ? '2px solid var(--accent-color)' : '';
    });
}

Object.entries(_tqBtns).forEach(([q, el]) => el.addEventListener('click', () => _setQuality(q)));

// ─── Tab navigation ───────────────────────────────────────────────────────────

PreviewersButton.forEach(btn => {
    btn.onclick = () => {
        Previewers.forEach(p => (p.style.display = 'none'));
        SizePreviewer.textContent = btn.DataLength ?? '';
        document.getElementById(btn.id + '-previewer').style.display = '';
    };
});
PreviewersButton[0].click();

// ─── Context menu ─────────────────────────────────────────────────────────────

document.body.addEventListener('contextmenu', e => e.preventDefault());

let lastContextMenu = null;

document.body.addEventListener('mousedown', ({ button, target, clientX, clientY }) => {
    if (lastContextMenu && target !== lastContextMenu && target.parentNode !== lastContextMenu) {
        lastContextMenu.remove();
        lastContextMenu = null;
    }

    if (button !== 2 || !jsonData) return;

    try {
        if (target.parentNode.id.slice(0, 2) !== 'd-') return;

        lastContextMenu = showContextMenu(clientX, clientY, menu => {
            const isCubeModel = 'CubeModelPrototypeTerrainCubeModelTerrainFineGrained'
                .includes(target.textContent);

            if (isCubeModel) {
                menu.addButton('Go To Prototype', null, () => {
                    const id        = Number(target.parentNode.id.slice(2));
                    const cubeModel = jsonData.WorldObjects.find(o => o.Id === id);
                    const protoId   = cubeModel.Data.protoTypeID[0];
                    document.getElementById('prototypes').click();
                    document.getElementById('p-' + protoId).children[1].click();
                });
            }

            menu.addButton('Delete Object', '#dd7878', () => {
                const id       = Number(target.parentNode.id.slice(2));
                const obj      = jsonData.WorldObjects.find(o => o.Id === id);
                const children = getObjectChildren(jsonData.WorldObjects, obj);
                [obj, ...children].forEach(c => {
                    jsonData.WorldObjects = jsonData.WorldObjects.filter(o => o !== c);
                });
                document.getElementById('d-' + id).remove();
            });
        });
    } catch (e) { console.error(e); }
});


// ─── Import / Export ──────────────────────────────────────────────────────────

ImportBtn.addEventListener('click', () => FileInput.click());

ExportBtn.addEventListener('click', async () => {
    const popup = showPopup(`
        <h3 style="font-family:'NEON',sans-serif;">Download File</h3>
        <input id="dl-name" class="popup-input" placeholder="File name…">
        <select id="dl-fmt" class="popup-select">
            <option value=".json">JSON (.json)</option>
            <option value=".kgm" selected>Bytes (.kgm)</option>
        </select>
        <button class="btn-type1" id="dl-btn">Download</button>
    `);

    document.getElementById('dl-btn').addEventListener('click', async () => {
        const name = document.getElementById('dl-name').value || 'SnapXFile';
        const ext  = document.getElementById('dl-fmt').value;
        let   bytes;

        if (ext === '.json') {
            bytes = new TextEncoder().encode(JSON.stringify(jsonData));
        } else {
            loadingSet('<h1>Encoding Bytes</h1>');
            loadingShow();
            bytes = await workerEncode(jsonData, p => {
                loadingSet(`<h1>Encoding Bytes [${p}%]</h1>`);
            });
            loadingHide();
        }

        popup.delete();
        downloadBytes(bytes, name + ext);
    });
});

// ─── File input ───────────────────────────────────────────────────────────────

FileInput.addEventListener('change', async ({ target }) => {
    const file = target.files[0];
    if (!file) return;

    const ext    = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (ext === 'json') {
        reader.onload = ({ target: t }) => {
            try {
                clearPreviewers();
                applyWorldData(JSON.parse(t.result));
            } catch (e) { console.error('JSON parse error:', e); }
        };
        reader.readAsText(file);
    } else {
        reader.onload = async () => {
            try {
                clearPreviewers();
                loadingSet('<h1>Decoding Bytes</h1>');
                loadingShow();
                // Transfer the buffer to the worker — zero-copy
                const data = await workerDecode(
                    reader.result,
                    p => { loadingSet(`<h1>Decoding Bytes [${p}%]</h1>`); if (p === 100) loadingHide(); }
                );
                applyWorldData(data);
            } catch (e) { console.error('Decode error:', e); }
        };
        reader.readAsArrayBuffer(file);
    }
});

function applyWorldData(data) {
    jsonData = data;
    document.getElementById('world-objects').DataLength  = data.WorldObjects.length;
    document.getElementById('prototypes').DataLength     = data.Prototypes.length;
    document.getElementById('links').DataLength          = data.Links.length;
    document.getElementById('object-links').DataLength   = data.ObjectLinks.length;
    displayWorldObjects(data.WorldObjects);
    displayPrototypes(data.Prototypes);
    displayLinks(data.Links, false);
    displayLinks(data.ObjectLinks, true);
    PreviewersButton[0].click();
}

function clearPreviewers() {
    [...document.getElementsByClassName('preview')]
        .filter(el => { try { return el.children[0].tagName.toLowerCase() !== 'ul'; } catch { return true; } })
        .forEach(el => (el.innerHTML = ''));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function downloadBytes(bytes, filename) {
    const link    = document.createElement('a');
    link.href     = URL.createObjectURL(new Blob([bytes]));
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function findByValue(obj, value) {
    return Object.entries(obj).find(([, v]) => v === value)?.[0] ?? null;
}

function removeAtIndex(arr, i) {
    return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

function createElement(tag, parent) {
    const el = document.createElement(tag);
    parent.appendChild(el);
    return el;
}

function getObjectChildren(objects, { Id }) {
    const result = [];
    for (const child of objects.filter(o => o.GroupId === Id)) {
        result.push(child, ...getObjectChildren(objects, child));
    }
    return result;
}


// ─── UI component builders ────────────────────────────────────────────────────

function addMultipleInputs(parent, label, values, onChange) {
    const div = createElement('div', parent);
    div.className  = 'input-parent';
    div.SetDisplay = show => (div.style.display = show ? 'flex' : 'none');
    createElement('h5', div).textContent = label;

    const wrap  = createElement('div', div);
    const clone = [...values];
    values.forEach((val, i) => {
        const input     = createElement('input', wrap);
        input.className = 'input';
        input.value     = val ?? 0;
        input.oninput   = () => { clone[i] = input.value = Number(input.value); };
        input.onchange  = () => { clone[i] = Number(input.value); onChange?.(clone); };
    });
}

function addTextInput(parent, label, value, isTextArea = false, onChange) {
    const div = createElement('div', parent);
    div.className  = 'input-parent';
    div.SetDisplay = show => (div.style.display = show ? 'flex' : 'none');
    createElement('h5', div).textContent = label;

    const input     = createElement(isTextArea ? 'textarea' : 'input', div);
    input.className = 'input' + (isTextArea ? ' scroller' : '');
    input.value     = isTextArea ? JSON.stringify(value ?? {}, null, 2) : (value ?? 0);

    input.oninput  = () => { if (!isTextArea) input.value = JSON.stringify(Number(input.value)); };
    input.onchange = () => {
        if (!isTextArea) { onChange?.(Number(input.value)); return; }
        try {
            const parsed = JSON.parse(input.value);
            input.value  = JSON.stringify(parsed, null, 2);
            onChange?.(parsed);
        } catch (e) {
            const orig = input.value;
            input.value = 'JSON error: ' + e.message;
            setTimeout(() => (input.value = orig), 2000);
        }
    };
    input.div = div;
    return input;
}

function addSelect(parent, label, options, selected, onChange) {
    const div = createElement('div', parent);
    div.className = 'input-parent';
    createElement('h5', div).textContent = label;

    const sel = createElement('select', div);
    let   activeOption = null;

    sel.populate = (opts, current) => {
        sel.options.length = 0;
        opts.forEach(opt => {
            const o       = createElement('option', sel);
            o.textContent = opt;
            o.selected    = opt === current;
            if (o.selected) activeOption = o;
        });
    };
    sel.selectByText = text => {
        if (activeOption) activeOption.selected = false;
        activeOption = [...sel.options].find(o => o.textContent === text);
        if (activeOption) activeOption.selected = true;
    };

    sel.populate(options, selected);
    sel.onchange = () => onChange(sel.options[sel.selectedIndex].textContent);
    return sel;
}

// ─── Context menu & popup ─────────────────────────────────────────────────────

function showContextMenu(x, y, buildFn) {
    const menu = createElement('div', document.body);
    menu.style.cssText = `
        position: absolute;
        width: 200px;
        background: var(--card-background);
        backdrop-filter: blur(30px);
        border-radius: var(--border-radius);
    `;
    menu.addButton = (label, color, fn) => {
        const btn       = createElement('button', menu);
        btn.className   = 'leftc-btn';
        btn.textContent = label;
        if (color) btn.style.color = color;
        btn.addEventListener('click', () => { menu.remove(); fn(); });
    };
    buildFn(menu);

    const cw = menu.clientWidth, ch = menu.clientHeight;
    menu.style.left = `${cw + x > window.innerWidth  ? window.innerWidth  - cw - 10 : x}px`;
    menu.style.top  = `${ch + y > window.innerHeight ? window.innerHeight - ch - 10 : y}px`;
    return menu;
}

function showPopup(inner) {
    const overlay = createElement('div', document.body);
    overlay.className     = 'loading-screen';
    overlay.style.display = 'none';
    overlay.style.opacity = '0';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const box = createElement('div', overlay);
    box.style.cssText = `
        width: 70%; max-width: 480px;
        border: 1px solid var(--card-border-color);
        background: var(--card-background);
        border-radius: var(--border-radius);
        aspect-ratio: 8 / 5; padding: 10px;
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
    `;
    box.innerHTML = inner || '';
    box.delete    = () => overlay.remove();
    box.show      = () => { overlay.style.display = 'flex'; overlay.style.opacity = '1'; };
    box.show();
    return box;
}


// ─── 3-D model helpers ────────────────────────────────────────────────────────

const CUBE_COLORS = [
    '#f25830ff','#c7331bff','#992f16ff','#faeb77ff','#dfcacbff','#73d8e6ff',
    '#479bb7ff','#26586fff','#d77b25ff','#b49785ff','#9cbd2cff','#798f0bff',
    '#5b670dff','#965724ff','#705153ff','#e8a316ff','#f5b116ff','#f4f372ff',
    '#edd95eff','#d7d997ff','#b2b782ff','#949971ff','#8b8c5dff','#3e4529ff',
    '#b5a64dff','#83a78eff','#58452cff','#924d24ff','#9ae225ff','#cad187ff',
    '#cb8b4dff','#72582dff','#827869ff','#ab9a6eff','#b4b24fff','#3c6c46ff',
    '#b08c29ff','#935a33ff','#c9a831ff','#b7c178ff','#706a44ff','#856f49ff',
    '#e4724cff','#706c78ff','#d45295ff','#ca4722ff','#8cb63eff','#3c7572ff',
    '#877d58ff','#cbe393ff','#b0c884ff','#92ce47ff','#a22941ff','#6e3d17ff',
    '#df8930ff','#ebddcfff','#7c7b3dff','#ebbe49e8','#ced098e6','#edfbfce6',
    '#868f6aff','#3e9590ff','#6d9384ff','#a39e80ff','#c57cd0ff','#a39d7fff',
    '#a5967aff','#a9755aff','#949568f7','#959f9066','#99969c59','#a19e9e5c',
];

function findCornerCoords(n) {
    for (let x = 0; x <= 4; x++)
        for (let y = 0; y <= 4; y++)
            for (let z = 0; z <= 4; z++)
                if (25 * x + 5 * y + z === n) return { x, y, z };
    return null;
}

function modelToFV(cubes) {
    const faces = [], vertices = [];
    cubes.forEach((cube, i) => {
        let { x, y, z, corners, material, materials } = cube;
        corners   ??= [20, 120, 124, 24, 4, 104, 100, 0];
        material  ??= 1;
        materials ??= Array(6).fill(material);

        const base = i * 8;
        const lvs  = corners.map(findCornerCoords);
        lvs.forEach(({ x: dx, y: dy, z: dz }) => {
            vertices.push([x + dx * 0.25, y + dy * 0.25, z + dz * 0.25]);
        });

        const n = k => base + k;
        // Store material index per face instead of hex color
        const faceQuads = [
            [4,5,6,7], [0,1,2,3], [0,1,6,7],
            [1,2,5,6], [0,3,4,7], [2,3,4,5],
        ];
        faceQuads.forEach((q, fi) => {
            faces.push([...q.map(n), materials[fi] ?? material]);
        });
    });

    // quad → 2 triangles
    const tris = [];
    faces.forEach(([a, b, c, d, matIdx]) => {
        tris.push([a, b, d, matIdx]);
        tris.push([b, c, d, matIdx]);
    });
    return { faces: tris, vertices };
}

function hexToRGBA(hex) {
    hex = hex.replace(/^#/, '');
    const len = hex.length;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = len === 8 ? Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100 : 1;
    return [r, g, b, a];
}

// ─── Texture atlas — quality-switchable ──────────────────────────────────────

/*
const ATLAS_PATHS = {
    low:  './images/atlasLowArray.png',
    mid:  './images/atlasMidArray.png',
    high: './images/atlasHighArray.png',
};
*/
const origin = "https://media.githubusercontent.com/media/Zpayer/SnapShotX/main";
const ATLAS_PATHS = {
    low:  origin + '/images/atlasLowArray.png',
    mid:  origin + '/images/atlasMidArray.png',
    high: origin + '/images/atlasHighArray.png',
};


let _currentQuality = 'high';
let _tileCache      = new Map();
let _atlasImg       = new Image();
let _atlasReady     = null;

function _loadAtlas(quality) {
    _tileCache  = new Map();
    _atlasImg   = new Image();
    _atlasReady = new Promise(resolve => {
        _atlasImg.onload  = resolve;
        _atlasImg.onerror = () => console.error('Failed to load atlas:', ATLAS_PATHS[quality]);
    });
    _atlasImg.src = ATLAS_PATHS[quality];
}

_loadAtlas(_currentQuality);

function _getTileTexture(matIdx, onReady) {
    const idx = Math.max(0, Math.min(matIdx, 79));
    if (_tileCache.has(idx)) return _tileCache.get(idx);

    const offscreen = document.createElement('canvas');
    const ctx       = offscreen.getContext('2d');

    const tex = new THREE.CanvasTexture(offscreen);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    _tileCache.set(idx, tex);

    const draw = () => {
        // tile size = image width (width == height of one tile)
        const s = _atlasImg.width;
        offscreen.width = offscreen.height = s;
        ctx.drawImage(_atlasImg, 0, idx * s, s, s, 0, 0, s, s);
        tex.needsUpdate = true;
        onReady?.();
    };

    if (_atlasImg.complete && _atlasImg.naturalWidth > 0) draw();
    else _atlasReady.then(draw);

    return tex;
}

function addModelCanvas(parent, data) {
    const label = createElement('h5', parent);
    label.textContent   = `Data (${data.length} Cube${data.length === 1 ? '' : 's'})`;
    label.style.cssText = 'margin:0;margin-top:10px;margin-left:20px;padding:3px;';

    const canvas = createElement('canvas', parent);
    canvas.style.cssText = 'height:300px;width:98%;margin-top:10px;margin-left:1%;';

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight);
    camera.position.z = 3;
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const { faces, vertices } = modelToFV(data);

    // Each face in modelToFV is a quad split into 2 triangles:
    //   tri 0 (even fi): verts a,b,d  → UV (0,1),(1,1),(0,0)
    //   tri 1 (odd  fi): verts b,c,d  → UV (1,1),(1,0),(0,0)
    // This maps exactly one full tile texture onto each quad face.
    const TRI_UV = [
        [[0,1],[1,1],[0,0]],   // first  tri of quad
        [[1,1],[1,0],[0,0]],   // second tri of quad
    ];

    const positions = [];
    const uvs       = [];
    const groupData = [];
    let cursor = 0, i = 0;

    while (i < faces.length) {
        const matIdx = faces[i][faces[i].length - 1];
        const start  = cursor;
        while (i < faces.length && faces[i][faces[i].length - 1] === matIdx) {
            const face    = faces[i];
            const triUVs  = TRI_UV[i % 2];
            face.slice(0, -1).forEach((idx, vi) => {
                const [px, py, pz] = vertices[idx];
                positions.push(px, py, pz);
                uvs.push(triUVs[vi][0], triUVs[vi][1]);
            });
            cursor += 3;
            i++;
        }
        groupData.push({ start, count: cursor - start, matIdx });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs),       2));
    geo.computeVertexNormals();
    groupData.forEach(({ start, count }, i) => geo.addGroup(start, count, i));

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    let rotX = 0, rotY = 0, zoom = -40, dragging = false, lx = 0, ly = 0;
    const tick = () => {
        camera.position.set(
            zoom * Math.sin(rotY) * Math.cos(rotX),
            zoom * Math.sin(rotX),
            zoom * Math.cos(rotY) * Math.cos(rotX)
        );
        camera.lookAt(scene.position);
        renderer.render(scene, camera);
    };

    // Build materials after tick is defined so the onReady callback can call it
    const mats = groupData.map(({ matIdx }) =>
        new THREE.MeshLambertMaterial({
            map:         _getTileTexture(matIdx, tick),
            side:        THREE.DoubleSide,
            transparent: true,
            alphaTest:   0.05,
        })
    );
    scene.add(new THREE.Mesh(geo, mats));

    canvas.addEventListener('mousedown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('mouseup',   () => { dragging = false; });
    canvas.addEventListener('mousemove', e => {
        if (!dragging) return;
        rotY -= (e.clientX - lx) * 0.01; rotX -= (e.clientY - ly) * 0.01;
        lx = e.clientX; ly = e.clientY; tick();
    });
    canvas.addEventListener('wheel', e => {
        if (zoom - e.deltaY * 0.01 < -0.667) zoom -= e.deltaY * ZoomSensitivity;
        tick();
    });
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        tick();
    });
    tick();
}


// ─── Icon helpers ─────────────────────────────────────────────────────────────

function iconClass(type) {
    switch (type) {
        case 0:          return 'fa-solid fa-user';
        case 2:          return 'fa-solid fa-lightbulb';
        case 133:        return 'fa-solid fa-user-plus';
        case 135:        return 'fa-solid fa-gears';
        case 9: case 45: return 'fa-solid fa-object-group';
        case 1: case 32: return 'fa-solid fa-cubes';
        case 38:         return 'fa-solid fa-rainbow';
        case 8:          return 'fa-solid fa-cube';
        default:         return 'fa-solid fa-question';
    }
}

const ICON_PALETTE = [
    '#f8f1f1','#f3d5d5','#e4bad4','#c9b6be','#c4c1e0','#b5ead7','#b2f7ef',
    '#bae1ff','#a2d2ff','#ffc8dd','#ffafcc','#ffd6a5','#fdffb6','#caffbf',
    '#d0f4de','#e4f9f5','#defcf9','#d0ebff','#c3bef0','#f6dfeb','#faedcb',
    '#f8edeb','#e8e8e4','#d5f0c1','#e2f0cb','#cce2cb','#b6cfb6','#97cba9',
    '#90f1ef','#a9def9','#e4c1f9','#f694c1','#ede7f6','#d1c4e9','#c5cae9',
    '#b3e5fc','#b2dfdb','#dcedc1','#f0f4c3','#ffe0b2','#ffccbc','#f8bbd0',
    '#e1bee7','#c8e6c9','#d1f2eb','#f1f8e9','#e3f2fd','#e8f5e9','#fce4ec',
    '#f3e5f5','#f9fbe7','#fff9c4','#fff3e0','#efebe9','#f5f5f5','#eeeeee',
    '#e0f7fa','#f1f8ff','#fbe9e7','#ede7f6','#e8f5e9','#f9fbe7','#ffecb3',
    '#fff8e1','#f3f4ed','#e5eaf5','#d6e2e9','#f9f9f9','#f0efeb','#e3f6f5',
    '#c9e4de','#e0cfc1','#d5bdaf','#b8bedd','#d6cfe0','#dbe7e4','#e5f4e3',
];
const iconColor = type => ICON_PALETTE[type] ?? '#392f5a';

// ─── Tree renderers ───────────────────────────────────────────────────────────

function displayWorldObjects(worldObjects) {
    const tree    = WorldObjectsPreviewer[0].children[0];
    const preview = WorldObjectsPreviewer[1];
    let   active  = null;
    tree.innerHTML = '';

    for (const obj of worldObjects) {
        const { WorldObjectType, WorldObjectTypeId, GroupId, Id } = obj;
        const parentEl = GroupId === -1 ? tree : document.getElementById('d-' + GroupId)?.children[3];
        if (!parentEl) continue;

        const li = createElement('li', parentEl);
        li.id        = 'd-' + Id;
        li.className = 'folderContainer';
        li.innerHTML = `
            <i class="${iconClass(WorldObjectTypeId)} XHIcon" style="--c:${iconColor(WorldObjectTypeId)}"></i>
            <h5 class="text">${WorldObjectType}</h5>
            <span>-${Id}</span>
            <ul></ul>
        `;
        li.children[0].addEventListener('click', () => li.children[3].classList.toggle('disable'));
        li.children[1].addEventListener('click', () => {
            if (active) active.style.background = '';
            active = li; active.style.background = 'var(--card-border-color)';
            preview.innerHTML = '';
            previewObjectData(preview, 0, obj, worldObjects);
        });
    }
}

function displayPrototypes(prototypes) {
    const tree    = PrototypesPreviewer[0].children[0];
    const preview = PrototypesPreviewer[1];
    let   active  = null;
    tree.innerHTML = '';

    for (const proto of prototypes) {
        const li = createElement('li', tree);
        li.id        = 'p-' + proto.Id;
        li.innerHTML = `
            <i class="fa-solid fa-cube XHIcon" style="--c:#b99b57"></i>
            <h5 class="text">--Scale:${proto.Scale} --Author:${proto.AuthorProfileId}</h5>
            <span>-${proto.Id}</span>
        `;
        li.children[1].addEventListener('click', () => {
            if (active) active.style.background = '';
            active = li; active.style.background = 'var(--card-border-color)';
            preview.innerHTML = '';
            previewObjectData(preview, 1, proto, prototypes);
        });
    }
}

function displayLinks(links, isObjectLinks) {
    const col     = isObjectLinks ? ObjectLinksPreviewer : LinksPreviewer;
    const tree    = col[0].children[0];
    const preview = col[1];
    let   active  = null;
    tree.innerHTML = '';

    for (const link of links) {
        const prefix = isObjectLinks ? 'ol-' : 'l-';
        const li     = createElement('li', tree);
        li.id        = prefix + link.Id;
        li.innerHTML = `
            <i class="fa-solid fa-link XHIcon" style="--c:#e58282"></i>
            <h5 class="text">${link.LinkFromID} → ${link.LinkToID}</h5>
            <span>-${link.Id}</span>
        `;
        li.children[1].addEventListener('click', () => {
            if (active) active.style.background = '';
            active = li; active.style.background = 'var(--card-border-color)';
            preview.innerHTML = '';
            previewObjectData(preview, isObjectLinks ? 3 : 2, link, links);
        });
    }
}

// ─── Property editor ──────────────────────────────────────────────────────────

function previewObjectData(parent, type, data, _allData) {
    if (type === 0) {
        const el           = document.getElementById('d-' + data.Id);
        const ownerFlags   = f => [(f & 1) !== 0, (f & 2) !== 0];

        addTextInput(parent, 'ID',             data.Id,            false);
        addTextInput(parent, 'Group ID',        data.GroupId,       false);
        addTextInput(parent, 'Item ID',         data.ItemId,        false);
        addTextInput(parent, 'Owner Ship Flag', data.OwnerShipFlag, false, v => {
            const [a, b] = ownerFlags(v);
            actorInput.div.SetDisplay(a);
            profileInput.div.SetDisplay(b);
        });

        const actorInput   = addTextInput(parent, 'Owner Actor Number',       data.OwnerActorNumber,      false, v => { data.OwnerActorNumber      = v; });
        const profileInput = addTextInput(parent, 'Preview Owner Profile ID', data.PreviewOwnerProfileId, false, v => { data.PreviewOwnerProfileId = v; });

        addMultipleInputs(parent, 'Position', [data.Position.X, data.Position.Y, data.Position.Z], ([x, y, z]) => {
            data.Position.X = x; data.Position.Y = y; data.Position.Z = z;
        });
        addMultipleInputs(parent, 'Rotation', [data.Rotation.X, data.Rotation.Y, data.Rotation.Z, data.Rotation.W], ([x, y, z, w]) => {
            data.Rotation.X = x; data.Rotation.Y = y; data.Rotation.Z = z; data.Rotation.W = w;
        });

        const typeSelect = addSelect(parent, 'World Object Type', Object.keys(WorldObjectCode), data.WorldObjectType, name => {
            data.WorldObjectTypeId = WorldObjectCode[name];
            data.WorldObjectType   = name;
            el.children[0].className   = iconClass(data.WorldObjectTypeId) + ' XHIcon';
            el.children[0].style       = '--c:' + iconColor(data.WorldObjectTypeId);
            el.children[1].textContent = name;
            typeIdInput.value = data.WorldObjectTypeId;
        });

        const typeIdInput = addTextInput(parent, 'World Object Type ID', data.WorldObjectTypeId, false, v => {
            data.WorldObjectTypeId = Number(v);
            data.WorldObjectType   = findByValue(WorldObjectCode, data.WorldObjectTypeId);
            el.children[0].className   = iconClass(data.WorldObjectTypeId) + ' XHIcon';
            el.children[0].style       = '--c:' + iconColor(data.WorldObjectTypeId);
            el.children[1].textContent = data.WorldObjectType;
            typeSelect.selectByText(data.WorldObjectType);
        });

        addTextInput(parent, 'Data',         data.Data,        true, v => { data.Data        = v; });
        addTextInput(parent, 'Runtime Data', data.RuntimeData, true, v => { data.RuntimeData = v; });

        const [a, b] = ownerFlags(data.OwnerShipFlag);
        actorInput.div.SetDisplay(a);
        profileInput.div.SetDisplay(b);

    } else if (type === 1) {
        const el = document.getElementById('p-' + data.Id);
        addTextInput(parent, 'ID',                data.Id,              false);
        addTextInput(parent, 'Author Profile ID', data.AuthorProfileId, false, v => {
            data.AuthorProfileId = v;
            el.children[1].textContent = `--Scale:${data.Scale} --Author:${data.AuthorProfileId}`;
        });
        addTextInput(parent, 'Scale', data.Scale, false, v => {
            data.Scale = v;
            el.children[1].textContent = `--Scale:${data.Scale} --Author:${data.AuthorProfileId}`;
        });
        addModelCanvas(parent, data.Data);

    } else {
        const prefix = type === 2 ? 'l-' : 'ol-';
        const el     = document.getElementById(prefix + data.Id);
        addTextInput(parent, 'ID',           data.Id,         false);
        addTextInput(parent, 'Link To ID',   data.LinkToID,   false, v => {
            data.LinkToID = v;
            el.children[1].textContent = `${data.LinkFromID} → ${data.LinkToID}`;
        });
        addTextInput(parent, 'Link From ID', data.LinkFromID, false, v => {
            data.LinkFromID = v;
            el.children[1].textContent = `${data.LinkFromID} → ${data.LinkToID}`;
        });
    }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

setTimeout(loadingHide, 1000);
