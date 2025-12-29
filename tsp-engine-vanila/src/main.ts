import { Engine } from './engine/Engine';
import { PlaygroundScene } from './game/PlaygroundScene';
import './style.css'

// Setup Canvas
const app = document.querySelector<HTMLDivElement>('#app')!;

// Reset styles for fullscreen
document.documentElement.style.cssText = 'width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;';
document.body.style.cssText = 'width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;';
app.style.cssText = 'width: 100%; height: 100%; margin: 0; padding: 0; max-width: none;';

app.innerHTML = '<canvas id="renderCanvas" style="width: 100%; height: 100%; touch-action: none;"></canvas>';

// Add UI Overlay
const ui = document.createElement('div');
ui.style.cssText = 'position: absolute; top: 20px; left: 20px; color: white; font-family: sans-serif; pointer-events: none; text-shadow: 1px 1px 2px black;';
ui.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px;">Controls</div>
    <div>WASD / Arrows : Move</div>
    <div>Shift : High Profile (Sprint/Parkour)</div>
    <div>Space : Jump</div>
    <div>C : Switch Camera</div>
`;
app.appendChild(ui);

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

// Initialize Engine
const engine = new Engine(canvas);

// Load Game Scene
const scene = new PlaygroundScene(engine);

engine.start();
