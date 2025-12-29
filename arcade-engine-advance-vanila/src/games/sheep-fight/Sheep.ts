import { Scene, Mesh, MeshBuilder, Vector3 } from '@babylonjs/core';
import { GameObject } from '../../GameObject';
import { PhysicsManager } from '../../PhysicsManager';
import * as CANNON from 'cannon';

export class Sheep extends GameObject {
    private physicsManager: PhysicsManager;
    public body: CANNON.Body;
    private mesh: Mesh;
    public isPlayer: boolean = false;
    public onFall?: () => void;

    constructor(scene: Scene, physicsManager: PhysicsManager, position: Vector3) {
        super(scene);
        this.physicsManager = physicsManager;

        // Create the sheep mesh
        this.mesh = MeshBuilder.CreateSphere(`sheep_${Math.random()}`, { diameter: 1 }, this.scene);
        this.mesh.position = position;

        // Create the sheep physics body
        const shape = new CANNON.Sphere(0.5);
        this.body = new CANNON.Body({ mass: 1, shape });
        this.body.position.copy(this.mesh.position as any);
        this.physicsManager.addBody(this.body);

        this.body.addEventListener("collide", (event: any) => {
            const otherBody = event.body as CANNON.Body;
            const relativeVelocity = event.contact.getImpactVelocityAlongNormal();

            if (Math.abs(relativeVelocity) > 1) { // check for significant impact
                const knockback = new CANNON.Vec3();
                event.contact.ni.scale(-1 * this.body.mass * relativeVelocity, knockback);
                otherBody.applyImpulse(knockback, event.contact.ri);
            }
        });
    }

    start(): void {
        //
    }

    update(deltaTime: number): void {
        // Sync mesh with physics body
        this.mesh.position.copyFrom(this.body.position as any);
        this.mesh.rotation.copyFrom(this.body.quaternion as any);

        // Check for fall
        if (this.mesh.position.y < -5) {
            this.destroy();
            if (this.onFall) {
                this.onFall();
            }
        }
    }

    destroy(): void {
        this.physicsManager.removeBody(this.body);
        this.mesh.dispose();
    }

    public applyForce(force: Vector3) {
        this.body.applyForce(new CANNON.Vec3(force.x, force.y, force.z), this.body.position);
    }
}


