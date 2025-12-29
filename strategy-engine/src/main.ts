import { Engine } from '@babylonjs/core/Engines/engine';
import PoliticalConquest from '../PoliticalConquest';
import './style.css';

// --- Setup Canvas ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = ''; // Clear default Vite content

const canvas = document.createElement('canvas');
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.id = 'renderCanvas';
app.appendChild(canvas);

// --- Initialize Engine ---
const engine = new Engine(canvas, true);

// --- Initialize Game ---
const game = new PoliticalConquest();
game.createScene(engine, canvas);

// --- Resize Handling ---
window.addEventListener('resize', () => {
    engine.resize();
});

// --- Render Loop ---
engine.runRenderLoop(() => {
    game.render();
});