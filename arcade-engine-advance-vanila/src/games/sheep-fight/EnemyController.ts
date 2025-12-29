import { Scene, Vector3 } from '@babylonjs/core';
import { GameObject } from '../../GameObject';
import { Sheep } from './Sheep';

export class EnemyController extends GameObject {
    private sheep: Sheep;
    private forceAmount: number = 5;
    private nextActionTime: number = 0;

    constructor(scene: Scene, sheep: Sheep) {
        super(scene);
        this.sheep = sheep;
    }

    start(): void {
        //
    }

    update(deltaTime: number): void {
        if (this.scene.getEngine().getDeltaTime() > this.nextActionTime) {
            const force = new Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
            force.normalize().scaleInPlace(this.forceAmount);
            this.sheep.applyForce(force);
            this.nextActionTime = this.scene.getEngine().getDeltaTime() + Math.random() * 2000 + 1000;
        }
    }

    destroy(): void {
        //
    }
}
