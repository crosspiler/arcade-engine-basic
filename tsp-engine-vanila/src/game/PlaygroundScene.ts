import * as BABYLON from '@babylonjs/core';
import { Engine } from '../engine/Engine';
import { TPSController } from './TPSController';

export class PlaygroundScene {
    constructor(engine: Engine) {
        const scene = engine.scene;

        // 1. Lighting
        new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
        const dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), scene);
        dirLight.position = new BABYLON.Vector3(20, 40, 20);
        
        // Shadows
        const shadowGen = new BABYLON.ShadowGenerator(1024, dirLight);
        shadowGen.useBlurExponentialShadowMap = true;

        // 2. Environment (Parkour Course)
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
        ground.checkCollisions = true;
        ground.receiveShadows = true;
        const groundMat = new BABYLON.StandardMaterial("gMat", scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        ground.material = groundMat;

        // Obstacles
        for(let i=0; i<5; i++) {
            const box = BABYLON.MeshBuilder.CreateBox(`box_${i}`, { size: 2 + i }, scene);
            box.position.set(-10 + i * 5, 1 + i * 0.5, 5);
            box.checkCollisions = true;
            box.receiveShadows = true;
            shadowGen.addShadowCaster(box);
        }
        
        // Climbing Wall Structure (Base)
        const wallStructure = BABYLON.MeshBuilder.CreateBox("wall_structure", { width: 10, height: 10, depth: 2 }, scene);
        wallStructure.position.set(0, 5, 10);
        wallStructure.checkCollisions = true;
        wallStructure.receiveShadows = true;
        shadowGen.addShadowCaster(wallStructure);

        // Climbable Bricks (Visual Points for IK)
        const ledgeMat = new BABYLON.StandardMaterial("ledgeMat", scene);
        ledgeMat.diffuseColor = new BABYLON.Color3(0.6, 0.3, 0.1); // Brick color
        
        // Create a scattered pattern of bricks
        for(let y=0; y<10; y++) {
            for(let x=0; x<5; x++) {
                // Staggered pattern
                const xOffset = (y % 2 === 0) ? 0 : 1.0;
                if (Math.random() > 0.7) continue; // Random gaps

                const brick = BABYLON.MeshBuilder.CreateBox(`climbable_brick_${x}_${y}`, { width: 0.4, height: 0.2, depth: 0.3 }, scene);
                // Position on the FRONT face of the wall (Z=9 is the face, so 8.85 pops out towards player)
                brick.position.set(-3 + x * 1.5 + xOffset, 1.5 + y * 0.8, 8.85); 
                brick.material = ledgeMat;
                shadowGen.addShadowCaster(brick);
            }
        }

        // Invisible Climbable Volume (Logic)
        // This covers the ledges so the raycast hits a continuous "climbable" surface
        // We name it 'climbable_wall' so the controller detects it for state, but ignores it for IK
        const climbZone = BABYLON.MeshBuilder.CreateBox("climbable_wall", { width: 8, height: 9, depth: 0.5 }, scene);
        climbZone.position.set(0, 5, 8.75); // Slightly in front of the wall (Z=9)
        climbZone.isVisible = false; // Invisible hitbox
        climbZone.checkCollisions = true;

        // Boundaries
        const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
        wallMat.alpha = 0; // Invisible
        const bounds = [
            { x: 25, z: 0, w: 1, h: 20, d: 50 },
            { x: -25, z: 0, w: 1, h: 20, d: 50 },
            { x: 0, z: 25, w: 50, h: 20, d: 1 },
            { x: 0, z: -25, w: 50, h: 20, d: 1 },
        ];
        bounds.forEach((b, i) => {
            const wall = BABYLON.MeshBuilder.CreateBox(`wall_${i}`, { width: b.w, height: b.h, depth: b.d }, scene);
            wall.position.set(b.x, b.h/2, b.z);
            wall.checkCollisions = true;
            wall.material = wallMat;
        });

        // 3. Camera (TPS)
        const camera = new BABYLON.ArcRotateCamera("tpsCam", -Math.PI/2, Math.PI/3, 8, BABYLON.Vector3.Zero(), scene);
        camera.attachControl(engine.canvas, true);
        camera.wheelPrecision = 50;

        // 4. Player
        const player = new TPSController(engine, new BABYLON.Vector3(0, 2, 0), camera);
        shadowGen.addShadowCaster(player.mesh);
    }
}