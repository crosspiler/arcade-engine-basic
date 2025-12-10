import { GAME_LIST } from '../../GameRegistry';
import type { GameId } from '../../engine/types';
import * as THREE from 'three';
import type { GameRenderer } from '../../engine/core/GameRenderer';

interface DebugUIState {
    gameId: GameId;
    score: number;
    highScore: number;
    subStat: number;
    status: string;
    isOrtho: boolean;
    isSoundOn: boolean;
    isMenuOpen: boolean;
    isSaveLoadEnabled: boolean;
    // Post Processing State
    isBloomOn: boolean;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
    isFilmOn: boolean;
    filmNoise: number;
    filmScanlines: number;
    isGlitchOn: boolean;
    // New: DotScreen
    isDotScreenOn: boolean;
    dotScreenScale: number;
    // New: RGB Shift
    isRGBShiftOn: boolean;
    rgbShiftAmount: number;
    // New: Afterimage
    isAfterimageOn: boolean;
    afterimageDamp: number;
    // New: Curvature
    isCurvatureOn: boolean;
    curvatureAmount: number;
    // New: Color Grading
    tintColor: string;
    grayscale: number;
}

interface DebugCallbacks {
    onSwitchGame: (id: string) => void;
    onDebugWin: () => void;
    onToggleDebugCam: () => void;
    onToggleView: () => void;
    onToggleSound: () => void;
    onToggleMenu: () => void;
    onToggleSaveLoad: (enabled: boolean) => void;
    // Post Processing Callbacks
    onUpdateBloom: (enabled: boolean, strength: number, radius: number, threshold: number) => void;
    onUpdateFilm: (enabled: boolean, noise: number, scanlines: number) => void;
    onToggleGlitch: (enabled: boolean) => void;
    onSetToneMapping: (mapping: THREE.ToneMapping) => void;
    onUpdateDotScreen: (enabled: boolean, scale: number) => void;
    onUpdateRGBShift: (enabled: boolean, amount: number) => void;
    onUpdateAfterimage: (enabled: boolean, damp: number) => void;
    onUpdateCurvature: (enabled: boolean, amount: number) => void;
    onUpdateColorCorrection: (tint: string, grayscale: number) => void;
}

export class DebugUI {
    private element: HTMLElement;
    private callbacks: DebugCallbacks;
    private engine: GameRenderer;
    private state: DebugUIState;

    // DOM Element References
    private selectGame!: HTMLSelectElement;
    private scoreEl!: HTMLSpanElement;
    private highScoreEl!: HTMLSpanElement;
    private subStatEl!: HTMLSpanElement;
    private statusEl!: HTMLSpanElement;
    private viewBtn!: HTMLButtonElement;
    private soundBtn!: HTMLButtonElement;
    private fpsEl!: HTMLSpanElement;
    private trianglesEl!: HTMLSpanElement;
    
    private saveLoadToggle!: HTMLInputElement;
    // Post Processing Elements
    private bloomToggle!: HTMLInputElement;
    private bloomStrength!: HTMLInputElement;
    private bloomRadius!: HTMLInputElement;
    private bloomThreshold!: HTMLInputElement;
    private filmToggle!: HTMLInputElement;
    private filmNoise!: HTMLInputElement;
    private filmScanlines!: HTMLInputElement;
    private glitchToggle!: HTMLInputElement;
    private dotScreenToggle!: HTMLInputElement;
    private dotScreenScale!: HTMLInputElement;
    private rgbShiftToggle!: HTMLInputElement;
    private rgbShiftAmount!: HTMLInputElement;
    private afterimageToggle!: HTMLInputElement;
    private afterimageDamp!: HTMLInputElement;
    private curvatureToggle!: HTMLInputElement;
    private curvatureAmount!: HTMLInputElement;
    private tintInput!: HTMLInputElement;
    private grayscaleInput!: HTMLInputElement;

    constructor(callbacks: DebugCallbacks, engine: GameRenderer) {
        this.element = document.createElement('div');
        this.callbacks = callbacks;
        this.engine = engine;
        this.state = {
            gameId: GAME_LIST[0].id,
            score: 0,
            highScore: 0,
            subStat: 0,
            status: 'Loading...',
            isOrtho: false,
            isSoundOn: false,
            isMenuOpen: false,
            isSaveLoadEnabled: false,
            isBloomOn: false,
            bloomStrength: 1.5,
            bloomRadius: 0.5,
            bloomThreshold: 0,
            isFilmOn: false,
            filmNoise: 0.35,
            filmScanlines: 0.05,
            isGlitchOn: false,
            isDotScreenOn: false,
            dotScreenScale: 0.5,
            isRGBShiftOn: false,
            rgbShiftAmount: 0.005,
            isAfterimageOn: false,
            afterimageDamp: 0.96,
            isCurvatureOn: false,
            curvatureAmount: 0.5,
            tintColor: '#ffffff',
            grayscale: 0,
        };

        this.render();
        this.attachEventListeners();
        this.startPerfMonitor();
    }

    private render() {
        this.element.className = 'absolute top-5 right-5 z-50 pointer-events-auto bg-black/90 backdrop-blur-md p-4 rounded-xl border border-red-500/30 shadow-2xl min-w-[240px] animate-in fade-in slide-in-from-top-5 duration-200 font-mono';
        
        const gameOptions = GAME_LIST.map(game => 
            `<option value="${game.id}" class="bg-neutral-800">${game.name}</option>`
        ).join('');

        this.element.innerHTML = `
            <div class="flex justify-between items-center mb-3 border-b border-red-500/30 pb-2">
                <h2 class="text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>Debug Control
                </h2>
                <button class="text-gray-500 hover:text-white transition-colors" data-action="toggleMenu">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
            </div>
            <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-500 font-bold uppercase">Active Game</label>
                    <select class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-red-500/50 transition-colors" data-element="selectGame">
                        ${gameOptions}
                    </select>
                </div>
                <div class="h-px bg-white/5 my-1"></div>
                
                <div class="flex items-center justify-between text-xs mb-2">
                    <label class="text-gray-400">Auto Save/Load</label>
                    <input type="checkbox" data-action="toggleSaveLoad" class="h-3 w-3 rounded bg-white/10 border-white/20 text-green-500 focus:ring-green-500/50">
                </div>

                <details open class="group">
                    <summary class="text-[10px] text-gray-500 font-bold uppercase mb-1 cursor-pointer select-none list-none flex justify-between items-center">
                        Live Stats <span class="text-[8px] group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div class="flex justify-between text-xs"><span class="text-gray-400">Score</span><span class="text-yellow-400 font-bold" data-element="score">0</span></div>
                    <div class="flex justify-between text-xs"><span class="text-gray-400">Best</span><span class="text-gray-400 font-bold" data-element="highScore">0</span></div>
                    <div class="flex justify-between text-xs"><span class="text-gray-400">Moves/Lines</span><span class="text-blue-300 font-bold" data-element="subStat">0</span></div>
                    <div class="h-px bg-white/5 my-1"></div>
                    <div class="flex justify-between text-xs"><span class="text-gray-400">FPS</span><span class="text-green-400 font-bold" data-element="fps">0</span></div>
                    <div class="flex justify-between text-xs"><span class="text-gray-400">Triangles</span><span class="text-green-400 font-bold" data-element="triangles">0</span></div>

                    <div class="flex justify-between text-xs mt-1 pt-1 border-t border-white/5"><span class="text-gray-500">Status</span><span class="text-gray-300 max-w-[100px] truncate text-right" data-element="status">Level 1</span></div>
                </details>
                
                <div class="h-px bg-white/5 my-1"></div>
                <details class="group">
                    <summary class="text-[10px] text-gray-500 font-bold uppercase mb-1 cursor-pointer select-none list-none flex justify-between items-center">
                        Post-Processing <span class="text-[8px] group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    
                    <!-- Bloom -->
                    <div class="flex items-center justify-between text-xs">
                        <label class="text-gray-400">Bloom</label>
                        <input type="checkbox" data-action="toggleBloom" class="h-3 w-3">
                    </div>
                    <input type="range" min="0" max="3" step="0.1" data-action="updateBloom" data-param="strength" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    
                    <!-- Film -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">Film Grain</label>
                        <input type="checkbox" data-action="toggleFilm" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>
                    <div class="flex flex-col gap-1 pl-2 border-l border-white/10">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Noise</span></div>
                        <input type="range" min="0" max="1" step="0.05" data-action="updateFilm" data-param="noise" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Scanlines</span></div>
                        <input type="range" min="0" max="2" step="0.05" data-action="updateFilm" data-param="scanlines" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <!-- Glitch -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">Glitch</label>
                        <input type="checkbox" data-action="toggleGlitch" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>

                    <!-- Dot Screen -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">Dot Screen</label>
                        <input type="checkbox" data-action="toggleDotScreen" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>
                    <div class="flex flex-col gap-1 pl-2 border-l border-white/10">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Scale</span></div>
                        <input type="range" min="0.1" max="2" step="0.1" data-action="updateDotScreen" data-param="scale" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- RGB Shift -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">RGB Shift</label>
                        <input type="checkbox" data-action="toggleRGBShift" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>
                    <div class="flex flex-col gap-1 pl-2 border-l border-white/10">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Amount</span></div>
                        <input type="range" min="0" max="0.05" step="0.001" data-action="updateRGBShift" data-param="amount" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- Afterimage -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">Trails</label>
                        <input type="checkbox" data-action="toggleAfterimage" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>
                    <div class="flex flex-col gap-1 pl-2 border-l border-white/10">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Damp</span></div>
                        <input type="range" min="0.5" max="0.99" step="0.01" data-action="updateAfterimage" data-param="damp" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- Curvature -->
                    <div class="flex items-center justify-between text-xs mt-1">
                        <label class="text-gray-400">CRT Curve</label>
                        <input type="checkbox" data-action="toggleCurvature" class="h-3 w-3 rounded bg-white/10 border-white/20 text-red-500 focus:ring-red-500/50">
                    </div>
                    <div class="flex flex-col gap-1 pl-2 border-l border-white/10">
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Amount</span></div>
                        <input type="range" min="0" max="2" step="0.1" data-action="updateCurvature" data-param="amount" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <!-- Color Grading -->
                    <div class="flex flex-col gap-1 mt-2 pt-2 border-t border-white/10">
                        <label class="text-[10px] text-gray-500 font-bold uppercase">Color Grading</label>
                        <div class="flex items-center justify-between text-xs">
                            <label class="text-gray-400">Tint</label>
                            <input type="color" data-action="updateColor" data-param="tint" class="h-4 w-8 bg-transparent border-none cursor-pointer" value="#ffffff">
                        </div>
                        <div class="flex justify-between text-[10px] text-gray-500"><span>Grayscale</span></div>
                        <input type="range" min="0" max="1" step="0.01" data-action="updateColor" data-param="grayscale" class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>

                    <select class="w-full bg-white/5 border border-white/10 rounded px-1 py-1 text-[10px] text-gray-300 mt-1" data-action="setToneMapping">
                        <option value="0">No Tone Mapping</option>
                        <option value="1">Linear</option>
                        <option value="3">Cineon</option>
                        <option value="4">ACES Filmic</option>
                    </select>
                </details>

                <div class="h-px bg-white/5 my-1"></div>
                <div class="grid grid-cols-3 gap-1">
                    <button class="py-1.5 border text-[10px] rounded hover:bg-white/10 transition-colors bg-green-900/30 border-green-500/30 text-green-200" data-action="toggleView">3D</button>
                    <button class="py-1.5 border text-[10px] rounded hover:bg-white/10 transition-colors bg-white/5 border-white/10 text-gray-400" data-action="toggleSound">MUTE</button>
                    <button class="py-1.5 border text-[10px] rounded hover:bg-white/10 transition-colors bg-white/5 border-white/10 text-gray-400" data-action="toggleMenu">MENU</button>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-1">
                    <button class="py-2 bg-yellow-600/20 border border-yellow-500/30 text-yellow-200 text-[10px] rounded hover:bg-yellow-600/40 uppercase font-bold tracking-wider transition-all active:scale-95" data-action="debugWin">Force Win</button>
                    <button class="py-2 bg-blue-600/20 border border-blue-500/30 text-blue-200 text-[10px] rounded hover:bg-blue-600/40 uppercase font-bold tracking-wider transition-all active:scale-95" data-action="toggleDebugCam">Free Cam</button>
                </div>
            </div>
        `;

        // Store references to dynamic elements
        this.selectGame = this.element.querySelector('[data-element="selectGame"]') as HTMLSelectElement;
        this.scoreEl = this.element.querySelector('[data-element="score"]') as HTMLSpanElement;
        this.highScoreEl = this.element.querySelector('[data-element="highScore"]') as HTMLSpanElement;
        this.subStatEl = this.element.querySelector('[data-element="subStat"]') as HTMLSpanElement;
        this.statusEl = this.element.querySelector('[data-element="status"]') as HTMLSpanElement;
        this.viewBtn = this.element.querySelector('[data-action="toggleView"]') as HTMLButtonElement;
        this.soundBtn = this.element.querySelector('[data-action="toggleSound"]') as HTMLButtonElement;
        this.fpsEl = this.element.querySelector('[data-element="fps"]') as HTMLSpanElement;
        this.trianglesEl = this.element.querySelector('[data-element="triangles"]') as HTMLSpanElement;
        
        this.saveLoadToggle = this.element.querySelector('[data-action="toggleSaveLoad"]') as HTMLInputElement;
        this.bloomToggle = this.element.querySelector('[data-action="toggleBloom"]') as HTMLInputElement;
        this.bloomStrength = this.element.querySelector('[data-action="updateBloom"]') as HTMLInputElement;
        this.filmToggle = this.element.querySelector('[data-action="toggleFilm"]') as HTMLInputElement;
        this.filmNoise = this.element.querySelector('[data-action="updateFilm"][data-param="noise"]') as HTMLInputElement;
        this.filmScanlines = this.element.querySelector('[data-action="updateFilm"][data-param="scanlines"]') as HTMLInputElement;
        this.glitchToggle = this.element.querySelector('[data-action="toggleGlitch"]') as HTMLInputElement;
        this.dotScreenToggle = this.element.querySelector('[data-action="toggleDotScreen"]') as HTMLInputElement;
        this.dotScreenScale = this.element.querySelector('[data-action="updateDotScreen"][data-param="scale"]') as HTMLInputElement;
        this.rgbShiftToggle = this.element.querySelector('[data-action="toggleRGBShift"]') as HTMLInputElement;
        this.rgbShiftAmount = this.element.querySelector('[data-action="updateRGBShift"][data-param="amount"]') as HTMLInputElement;
        this.afterimageToggle = this.element.querySelector('[data-action="toggleAfterimage"]') as HTMLInputElement;
        this.afterimageDamp = this.element.querySelector('[data-action="updateAfterimage"][data-param="damp"]') as HTMLInputElement;
        this.curvatureToggle = this.element.querySelector('[data-action="toggleCurvature"]') as HTMLInputElement;
        this.curvatureAmount = this.element.querySelector('[data-action="updateCurvature"][data-param="amount"]') as HTMLInputElement;
        this.tintInput = this.element.querySelector('[data-action="updateColor"][data-param="tint"]') as HTMLInputElement;
        this.grayscaleInput = this.element.querySelector('[data-action="updateColor"][data-param="grayscale"]') as HTMLInputElement;
    }

    private attachEventListeners() {
        this.selectGame.addEventListener('change', (e) => this.callbacks.onSwitchGame((e.target as HTMLSelectElement).value));
        this.element.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const button = target.closest('button');
            if (!button) return;

            const action = button.dataset.action;
            switch (action) {
                case 'toggleMenu': this.callbacks.onToggleMenu(); break;
                case 'debugWin': this.callbacks.onDebugWin(); break;
                case 'toggleDebugCam': this.callbacks.onToggleDebugCam(); break;
                case 'toggleView': this.callbacks.onToggleView(); break;
                case 'toggleSound': this.callbacks.onToggleSound(); break;
            }
        });

        this.saveLoadToggle.addEventListener('change', () => {
            this.callbacks.onToggleSaveLoad(this.saveLoadToggle.checked);
        });

        // Post Processing Listeners
        const updateBloom = () => {
            this.callbacks.onUpdateBloom(
                this.bloomToggle.checked,
                parseFloat(this.bloomStrength.value),
                this.state.bloomRadius,
                this.state.bloomThreshold
            );
        };
        this.bloomToggle.addEventListener('change', updateBloom);
        this.bloomStrength.addEventListener('input', updateBloom);

        const updateFilm = () => {
            this.callbacks.onUpdateFilm(this.filmToggle.checked, parseFloat(this.filmNoise.value), parseFloat(this.filmScanlines.value));
        };
        this.filmToggle.addEventListener('change', updateFilm);
        this.filmNoise.addEventListener('input', updateFilm);
        this.filmScanlines.addEventListener('input', updateFilm);

        this.glitchToggle.addEventListener('change', () => {
            this.callbacks.onToggleGlitch(this.glitchToggle.checked);
        });

        const updateDotScreen = () => {
            this.callbacks.onUpdateDotScreen(this.dotScreenToggle.checked, parseFloat(this.dotScreenScale.value));
        };
        this.dotScreenToggle.addEventListener('change', updateDotScreen);
        this.dotScreenScale.addEventListener('input', updateDotScreen);

        const updateRGBShift = () => {
            this.callbacks.onUpdateRGBShift(this.rgbShiftToggle.checked, parseFloat(this.rgbShiftAmount.value));
        };
        this.rgbShiftToggle.addEventListener('change', updateRGBShift);
        this.rgbShiftAmount.addEventListener('input', updateRGBShift);

        const updateAfterimage = () => {
            this.callbacks.onUpdateAfterimage(this.afterimageToggle.checked, parseFloat(this.afterimageDamp.value));
        };
        this.afterimageToggle.addEventListener('change', updateAfterimage);
        this.afterimageDamp.addEventListener('input', updateAfterimage);

        const updateCurvature = () => {
            this.callbacks.onUpdateCurvature(this.curvatureToggle.checked, parseFloat(this.curvatureAmount.value));
        };
        this.curvatureToggle.addEventListener('change', updateCurvature);
        this.curvatureAmount.addEventListener('input', updateCurvature);

        const updateColor = () => {
            this.callbacks.onUpdateColorCorrection(this.tintInput.value, parseFloat(this.grayscaleInput.value));
        };
        this.tintInput.addEventListener('input', updateColor);
        this.grayscaleInput.addEventListener('input', updateColor);

        const toneMappingSelect = this.element.querySelector('[data-action="setToneMapping"]') as HTMLSelectElement;
        toneMappingSelect.addEventListener('change', (e) => {
            this.callbacks.onSetToneMapping(parseInt((e.target as HTMLSelectElement).value));
        });
    }

    private startPerfMonitor() {
        setInterval(() => {
            const fps = Math.round(this.engine.fps);
            const triangles = this.engine.triangles;
            if (this.fpsEl.textContent !== String(fps)) this.fpsEl.textContent = String(fps);
            if (this.trianglesEl.textContent !== String(triangles)) this.trianglesEl.textContent = String(triangles);
        }, 500); // Update twice a second
    }

    public getElement(): HTMLElement {
        return this.element;
    }

    public update(newState: Partial<DebugUIState>) {
        Object.assign(this.state, newState);

        if (this.selectGame.value !== this.state.gameId) this.selectGame.value = this.state.gameId;
        if (this.scoreEl.textContent !== String(this.state.score)) this.scoreEl.textContent = String(this.state.score);
        if (this.highScoreEl.textContent !== String(this.state.highScore)) this.highScoreEl.textContent = String(this.state.highScore);
        if (this.subStatEl.textContent !== String(this.state.subStat)) this.subStatEl.textContent = String(this.state.subStat);
        if (this.statusEl.textContent !== this.state.status) this.statusEl.textContent = this.state.status;

        this.viewBtn.textContent = this.state.isOrtho ? '3D' : '2D';
        this.soundBtn.textContent = this.state.isSoundOn ? 'MUTE' : 'UNMUTE';
        
        this.saveLoadToggle.checked = this.state.isSaveLoadEnabled;
        this.bloomToggle.checked = this.state.isBloomOn;
        this.bloomStrength.value = String(this.state.bloomStrength);
        this.filmToggle.checked = this.state.isFilmOn;
        this.filmNoise.value = String(this.state.filmNoise);
        this.filmScanlines.value = String(this.state.filmScanlines);
        this.glitchToggle.checked = this.state.isGlitchOn;
        this.dotScreenToggle.checked = this.state.isDotScreenOn;
        this.dotScreenScale.value = String(this.state.dotScreenScale);
        this.rgbShiftToggle.checked = this.state.isRGBShiftOn;
        this.rgbShiftAmount.value = String(this.state.rgbShiftAmount);
        this.afterimageToggle.checked = this.state.isAfterimageOn;
        this.afterimageDamp.value = String(this.state.afterimageDamp);
        this.curvatureToggle.checked = this.state.isCurvatureOn;
        this.curvatureAmount.value = String(this.state.curvatureAmount);
        this.tintInput.value = this.state.tintColor;
        this.grayscaleInput.value = String(this.state.grayscale);
    }
}