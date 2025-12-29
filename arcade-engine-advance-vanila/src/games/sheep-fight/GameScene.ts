import { Scene, Vector3, HemisphericLight, ArcRotateCamera, MeshBuilder, Mesh } from '@babylonjs/core';
import { PhysicsManager } from '../../PhysicsManager';
import { Sheep } from './Sheep';
import { GameObject } from '../../GameObject';
import { PlayerController } from './PlayerController';
import { EnemyController } from './EnemyController';
import { UIManager } from '../../UIManager';
import * as CANNON from 'cannon';

export class GameScene {
    private scene: Scene;
    private physicsManager: PhysicsManager;
    private gameObjects: GameObject[] = [];
    private uiManager: UIManager;
    private score: number = 0;
    private isGameOver: boolean = false;

    constructor(scene: Scene) {
        this.scene = scene;
        this.physicsManager = new PhysicsManager(this.scene);
        this.uiManager = new UIManager(this.scene);
    }

    public create() {
        // Create a camera
        const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 15, Vector3.Zero(), this.scene);
        camera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);

        // Create a light
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

        // Create the arena
        const arena = MeshBuilder.CreateCylinder("arena", { diameter: 10, height: 0.5 }, this.scene);
        arena.position.y = -0.25;

        // Add physics to the arena
        const arenaShape = new CANNON.Cylinder(5, 5, 0.5, 32);
        const arenaBody = new CANNON.Body({ mass: 0, shape: arenaShape });
        arenaBody.position.y = -0.25;
        this.physicsManager.addBody(arenaBody);

        // Create the player sheep
        const playerSheep = new Sheep(this.scene, this.physicsManager, new Vector3(0, 1, -2));
        playerSheep.isPlayer = true;
        playerSheep.onFall = () => this.gameOver();
        this.gameObjects.push(playerSheep);

        // Create a player controller
        const playerController = new PlayerController(this.scene, playerSheep);
        this.gameObjects.push(playerController);

        // Create the enemy sheep
        this.spawnEnemy();

        // Start game loop
        this.scene.getEngine().runRenderLoop(() => {
            if (this.isGameOver) return;
            const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
            this.gameObjects.forEach(go => go.update(deltaTime));
            this.scene.render();
        });
    }

    private spawnEnemy() {
        const enemySheep = new Sheep(this.scene, this.physicsManager, new Vector3(Math.random() * 4 - 2, 1, Math.random() * 4 - 2));
        enemySheep.onFall = () => this.enemyFallen();
        this.gameObjects.push(enemySheep);

        const enemyController = new EnemyController(this.scene, enemySheep);
        this.gameObjects.push(enemyController);
    }

    private enemyFallen() {
        this.score++;
        this.uiManager.updateScore(this.score);
        this.spawnEnemy();
    }

    private gameOver() {
        this.isGameOver = true;
        this.uiManager.showGameOver();
    }
}