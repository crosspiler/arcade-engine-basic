import { Scene, Vector3, ActionManager, ExecuteCodeAction, Scalar } from '@babylonjs/core';
import { GameObject } from '../../GameObject';
import { Sheep } from './Sheep';

export class PlayerController extends GameObject {
    private sheep: Sheep;
    private inputMap: { [key: string]: boolean } = {};
    private forceAmount: number = 5;

    constructor(scene: Scene, sheep: Sheep) {
        super(scene);
        this.sheep = sheep;

        // Initialize action manager
        this.scene.actionManager = new ActionManager(this.scene);

        // Register keydown and keyup events
        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
                this.inputMap[evt.sourceEvent.key] = true;
            })
        );

        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, (evt) => {
                this.inputMap[evt.sourceEvent.key] = false;
            })
        );
    }

    start(): void {
        //
    }

    update(deltaTime: number): void {
        const force = new Vector3(0, 0, 0);

        if (this.inputMap["w"]) {
            force.z = this.forceAmount;
        }
        if (this.inputMap["s"]) {
            force.z = -this.forceAmount;
        }
        if (this.inputMap["a"]) {
            force.x = -this.forceAmount;
        }
        if (this.inputMap["d"]) {
            force.x = this.forceAmount;
        }

        if (force.length() > 0) {
            this.sheep.applyForce(force);
        }
    }

    destroy(): void {
        //
    }
}
