import { Engine as BabylonEngine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';

export class Engine {
    private canvas: HTMLCanvasElement;
    public babylonEngine: BabylonEngine;
    public scene: Scene;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.babylonEngine = new BabylonEngine(this.canvas, true);
        this.scene = new Scene(this.babylonEngine);

        this.babylonEngine.runRenderLoop(() => {
            this.scene.render();
        });

        window.addEventListener('resize', () => {
            this.babylonEngine.resize();
        });
    }
}

