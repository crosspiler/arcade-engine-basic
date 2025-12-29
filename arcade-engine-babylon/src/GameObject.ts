import { Scene } from '@babylonjs/core/scene';

export abstract class GameObject {
    protected scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    abstract start(): void;
    abstract update(deltaTime: number): void;
    abstract destroy(): void;
}
