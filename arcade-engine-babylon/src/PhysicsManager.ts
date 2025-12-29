import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import * as CANNON from 'cannon';

export class PhysicsManager {
    private scene: Scene;
    public world: CANNON.World;

    constructor(scene: Scene) {
        this.scene = scene;
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Set gravity

        this.scene.onBeforeRenderObservable.add(() => {
            this.world.step(1 / 60);
        });
    }

    public addBody(body: CANNON.Body) {
        this.world.addBody(body);
    }

    public removeBody(body: CANNON.Body) {
        this.world.removeBody(body);
    }
}
