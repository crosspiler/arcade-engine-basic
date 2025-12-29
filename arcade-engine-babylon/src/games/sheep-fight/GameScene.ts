import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { InputManager } from '../../InputManager';

interface Enemy {
    mesh: AbstractMesh;
    pathIndex: number;
    progress: number; // 0 to 1 between path points
    hp: number;
    speed: number;
}

interface Tower {
    mesh: AbstractMesh;
    range: number;
    cooldown: number;
    lastFired: number;
}

export class GameScene {
    private scene: Scene;
    private inputManager!: InputManager;

    // Game State
    private enemies: Enemy[] = [];
    private towers: Tower[] = [];
    private pathPoints: Vector3[] = [];
    private baseHealth = 100;
    private resources = 60; // Start with enough for 3 towers
    
    private spawnTimer = 0;
    private spawnInterval = 2000; // ms

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public async create() {
        // Create a camera
        const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 30, Vector3.Zero(), this.scene);
        this.scene.activeCamera = camera;
        
        // Attach camera to canvas for input handling
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (canvas) {
            camera.attachControl(canvas, true);
        }

        // Create a light
        new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
        const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, -1), this.scene);
        dirLight.position = new Vector3(20, 40, 20);

        // Environment
        this.createEnvironment();

        // Initialize InputManager with the specific camera to ensure raycasting works
        this.inputManager = new InputManager(this.scene, camera, (mesh, point) => this.handleInput(mesh, point));

        // Game Loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.update(this.scene.getEngine().getDeltaTime());
        });
    }

    private createEnvironment() {
        // Ground
        const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, this.scene);
        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(0.2, 0.6, 0.2);
        ground.material = groundMat;
        ground.isPickable = true;

        // Path
        this.pathPoints = [
            new Vector3(-15, 0, 15),
            new Vector3(-15, 0, 0),
            new Vector3(0, 0, 0),
            new Vector3(0, 0, -10),
            new Vector3(15, 0, -10)
        ];

        // Visual Path
        const pathLine = MeshBuilder.CreateLines("path", { points: this.pathPoints.map(p => p.add(new Vector3(0, 0.1, 0))) }, this.scene);
        pathLine.color = new Color3(0.6, 0.4, 0.2);

        // Base
        const base = MeshBuilder.CreateBox("base", { size: 3 }, this.scene);
        base.position = this.pathPoints[this.pathPoints.length - 1];
        const baseMat = new StandardMaterial("baseMat", this.scene);
        baseMat.diffuseColor = Color3.Blue();
        base.material = baseMat;

        // Spawner
        const spawner = MeshBuilder.CreateBox("spawner", { size: 2 }, this.scene);
        spawner.position = this.pathPoints[0];
        const spawnerMat = new StandardMaterial("spawnerMat", this.scene);
        spawnerMat.diffuseColor = Color3.Red();
        spawner.material = spawnerMat;
    }

    private handleInput(mesh: AbstractMesh, point: Vector3) {
        if (mesh.name === "ground") {
            this.placeTower(point);
        }
    }

    private placeTower(pos: Vector3) {
        if (this.resources < 20) {
            console.log("Not enough resources! Need 20.");
            return;
        }
        this.resources -= 20;

        const towerMesh = MeshBuilder.CreateCylinder("tower", { height: 3, diameter: 1 }, this.scene);
        towerMesh.position = pos.clone();
        towerMesh.position.y = 1.5;
        
        const mat = new StandardMaterial("towerMat", this.scene);
        mat.diffuseColor = Color3.Yellow();
        towerMesh.material = mat;

        this.towers.push({
            mesh: towerMesh,
            range: 10,
            cooldown: 800,
            lastFired: 0
        });
        console.log("Tower placed. Resources:", this.resources);
    }

    private update(dt: number) {
        // Spawning
        this.spawnTimer += dt;
        if (this.spawnTimer > this.spawnInterval) {
            this.spawnEnemy();
            this.spawnTimer = 0;
        }

        // Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            // Move
            const target = this.pathPoints[e.pathIndex + 1];
            const start = this.pathPoints[e.pathIndex];
            const dist = Vector3.Distance(start, target);
            
            e.progress += (e.speed * dt / 1000) / dist;
            
            if (e.progress >= 1.0) {
                e.pathIndex++;
                e.progress = 0;
                if (e.pathIndex >= this.pathPoints.length - 1) {
                    // Reached Base
                    this.baseHealth -= 10;
                    console.log("Base Hit! HP:", this.baseHealth);
                    e.mesh.dispose();
                    this.enemies.splice(i, 1);
                    if (this.baseHealth <= 0) console.log("GAME OVER");
                    continue;
                }
            }

            const currentStart = this.pathPoints[e.pathIndex];
            const currentEnd = this.pathPoints[e.pathIndex + 1];
            e.mesh.position = Vector3.Lerp(currentStart, currentEnd, e.progress);
            e.mesh.position.y = 0.5;
        }

        // Towers
        const now = Date.now();
        this.towers.forEach(t => {
            if (now - t.lastFired > t.cooldown) {
                // Find target
                const target = this.enemies.find(e => Vector3.Distance(t.mesh.position, e.mesh.position) < t.range);
                if (target) {
                    this.fireTower(t, target);
                    t.lastFired = now;
                }
            }
        });
    }

    private spawnEnemy() {
        const mesh = MeshBuilder.CreateSphere("enemy", { diameter: 1 }, this.scene);
        const mat = new StandardMaterial("enemyMat", this.scene);
        mat.diffuseColor = Color3.Purple();
        mesh.material = mat;
        
        mesh.position = this.pathPoints[0].clone();

        this.enemies.push({
            mesh,
            pathIndex: 0,
            progress: 0,
            hp: 3,
            speed: 5
        });
    }

    private fireTower(tower: Tower, enemy: Enemy) {
        // Visual beam
        const beam = MeshBuilder.CreateLines("beam", { points: [tower.mesh.position.add(new Vector3(0,1.5,0)), enemy.mesh.position] }, this.scene);
        beam.color = Color3.Red();
        setTimeout(() => beam.dispose(), 100);

        enemy.hp--;
        if (enemy.hp <= 0) {
            enemy.mesh.dispose();
            this.enemies = this.enemies.filter(e => e !== enemy);
            this.resources += 5;
            console.log("Enemy killed. Resources:", this.resources);
        }
    }
}