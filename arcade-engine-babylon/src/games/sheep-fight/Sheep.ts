import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { GameObject } from '../../GameObject';

export enum UnitType {
    Player,
    Enemy
}

export enum SheepState {
    Moving,
    Attacking
}

export class Sheep extends GameObject {
    public mesh: Mesh;
    public health: number = 100;
    public damage: number = 10;
    public speed: number = 1;
    public unitType: UnitType;
    public state: SheepState = SheepState.Moving;
    private attackTimer: number = 0;

    constructor(scene: Scene, unitType: UnitType, position: Vector3) {
        super(scene);
        this.unitType = unitType;

        this.mesh = MeshBuilder.CreateBox(`sheep_${Math.random()}`, { size: 0.8 }, this.scene);
        this.mesh.position = position;

        const material = new StandardMaterial(`material_${Math.random()}`, this.scene);
        if (this.unitType === UnitType.Player) {
            material.diffuseColor = new Color3(0, 0, 1); // Blue
        } else {
            material.diffuseColor = new Color3(1, 0, 0); // Red
        }
        this.mesh.material = material;
    }

    start(): void {
        //
    }

    update(deltaTime: number, allSheeps: Sheep[]): void {
        if (this.state === SheepState.Moving) {
            const direction = this.unitType === UnitType.Player ? 1 : -1;
            this.mesh.position.y += this.speed * direction * deltaTime;
        }

        const enemy = this.findClosestEnemy(allSheeps);
        if (enemy && this.mesh.intersectsMesh(enemy.mesh, false)) {
            this.state = SheepState.Attacking;
            this.attackTimer += deltaTime;
            if (this.attackTimer > 1) {
                this.attackTimer = 0;
                enemy.takeDamage(this.damage);
            }
        } else {
            this.state = SheepState.Moving;
        }
    }

    private findClosestEnemy(allSheeps: Sheep[]): Sheep | null {
        let closestEnemy: Sheep | null = null;
        let minDistance = Infinity;

        for (const sheep of allSheeps) {
            if (sheep.unitType !== this.unitType && Math.abs(sheep.mesh.position.x - this.mesh.position.x) < 0.1) {
                const distance = Math.abs(sheep.mesh.position.y - this.mesh.position.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestEnemy = sheep;
                }
            }
        }
        return closestEnemy;
    }

    public takeDamage(damage: number) {
        this.health -= damage;
        if (this.health <= 0) {
            this.destroy();
        }
    }

    destroy(): void {
        this.mesh.dispose();
    }
}
