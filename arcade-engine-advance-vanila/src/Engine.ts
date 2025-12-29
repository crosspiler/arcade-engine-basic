import { Engine as BabylonEngine, Scene } from '@babylonjs/core';

export class Engine {
    private canvas: HTMLCanvasElement;
    public babylonEngine: BabylonEngine;
    public scene: Scene;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.babylonEngine = new BabylonEngine(this.canvas, true);
        this.scene = new Scene(this.babylonEngine);

        window.addEventListener('resize', () => {
            this.babylonEngine.resize();
        });
    }
}

