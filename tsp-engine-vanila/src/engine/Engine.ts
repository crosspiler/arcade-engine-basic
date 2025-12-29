import * as BABYLON from '@babylonjs/core';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';

export class Engine {
    canvas: HTMLCanvasElement;
    babylonEngine: BABYLON.Engine;
    scene: BABYLON.Scene;
    gameLoop: GameLoop;
    input: InputManager;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        
        // Initialize Babylon
        this.babylonEngine = new BABYLON.Engine(canvas, true);
        this.scene = new BABYLON.Scene(this.babylonEngine);
        
        // Enable Physics (Using built-in collisions for vanilla, can upgrade to Havok)
        this.scene.collisionsEnabled = true;
        this.scene.gravity = new BABYLON.Vector3(0, -9.81, 0);

        // Core Systems
        this.input = new InputManager(this.scene);
        this.gameLoop = new GameLoop();

        // Handle Resize
        window.addEventListener('resize', () => this.babylonEngine.resize());
    }

    start() {
        this.babylonEngine.runRenderLoop(() => {
            const dt = this.babylonEngine.getDeltaTime() / 1000;
            this.gameLoop.tick(dt);
            this.scene.render();
        });
    }
}