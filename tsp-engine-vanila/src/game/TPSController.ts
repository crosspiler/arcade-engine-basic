import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { Engine } from '../engine/Engine';

export enum CameraStyle {
    SHOULDER = 0,
    SHOULDER_CLOSE = 1,
    TPS_STANDARD = 2,
    TOP_DOWN = 3
}

export class TPSController {
    mesh: BABYLON.Mesh;
    speed = 5.0;
    rotationSpeed = 10.0;
    
    private engine: Engine;
    private camera: BABYLON.ArcRotateCamera;
    
    private skeleton: BABYLON.Skeleton | null = null;
    
    // IK Controllers
    private leftIK: BABYLON.BoneIKController | null = null;
    private rightIK: BABYLON.BoneIKController | null = null;
    private leftIKTarget: BABYLON.TransformNode | null = null;
    private rightIKTarget: BABYLON.TransformNode | null = null;

    private verticalVelocity = 0;
    private gravity = -20.0;
    private jumpForce = 10.0;
    private isGrounded = false;
    private isClimbing = false;
    private wasWallDetected = false;
    private currentStyle: CameraStyle = CameraStyle.SHOULDER;

    // Animation
    private idleAnim: BABYLON.AnimationGroup | null = null;
    private walkAnim: BABYLON.AnimationGroup | null = null;
    private runAnim: BABYLON.AnimationGroup | null = null;
    private climbAnim: BABYLON.AnimationGroup | null = null;
    private currentIdleWeight = 1.0;
    private currentWalkWeight = 0.0;
    private currentRunWeight = 0.0;
    private currentClimbWeight = 0.0;

    constructor(engine: Engine, startPos: BABYLON.Vector3, camera: BABYLON.ArcRotateCamera) {
        this.engine = engine;
        this.camera = camera;

        // Create Player Mesh (Capsule)
        this.mesh = BABYLON.MeshBuilder.CreateCapsule("player", { height: 2, radius: 0.5 }, engine.scene);
        this.mesh.position = startPos;
        this.mesh.checkCollisions = true;
        this.mesh.ellipsoid = new BABYLON.Vector3(0.5, 1.0, 0.5);
        this.mesh.ellipsoidOffset = new BABYLON.Vector3(0, 0, 0);
        this.mesh.isVisible = true; // Show collider

        // Debug Material
        const debugMat = new BABYLON.StandardMaterial("debugMat", engine.scene);
        debugMat.wireframe = true;
        debugMat.emissiveColor = BABYLON.Color3.Red();
        this.mesh.material = debugMat;

        // Load Character Model
        this.loadCharacter();

        // Hook into GameLoop
        engine.gameLoop.add((dt) => this.update(dt));

        // Initialize Camera Style
        this.setCameraStyle(CameraStyle.SHOULDER);

        // Switch Camera Style on 'C'
        engine.scene.onKeyboardObservable.add((kbInfo) => {
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN && kbInfo.event.code === 'KeyC') {
                this.cycleCameraStyle();
            }
        });
    }

    async loadCharacter() {
        try {
            // https://assets.babylonjs.com/meshes/Xbot.glb
            const result = await BABYLON.SceneLoader.ImportMeshAsync("", "https://assets.babylonjs.com/meshes/", "Xbot.glb", this.engine.scene);
            
            const root = result.meshes[0];
            this.skeleton = result.skeletons[0] || null;
            root.parent = this.mesh;
            root.position.y = -1.0; // Align feet to bottom of capsule
            root.scaling.setAll(1.0);
            
            // Setup IK
            if (this.skeleton) {
                // Helper to find bone
                const getBone = (name: string) => this.skeleton!.bones.find(b => b.name.endsWith(name));
                
                const leftHand = getBone("LeftHand");
                const rightHand = getBone("RightHand");

                if (leftHand && rightHand) {
                    // Create Targets
                    this.leftIKTarget = new BABYLON.TransformNode("leftIKTarget", this.engine.scene);
                    this.rightIKTarget = new BABYLON.TransformNode("rightIKTarget", this.engine.scene);
                    
                    // Initialize Controllers
                    // Note: Pole targets are omitted for simplicity; elbows might guess, but usually works for simple reaching
                    this.leftIK = new BABYLON.BoneIKController(this.mesh, leftHand, { targetMesh: this.leftIKTarget });
                    this.rightIK = new BABYLON.BoneIKController(this.mesh, rightHand, { targetMesh: this.rightIKTarget });
                    
                    this.leftIK.maxAngle = Math.PI * 0.9;
                    this.rightIK.maxAngle = Math.PI * 0.9;

                    // Debug IK Targets (Red/Green spheres)
                    const lSphere = BABYLON.MeshBuilder.CreateSphere("lDebug", { diameter: 0.2 }, this.engine.scene);
                    lSphere.parent = this.leftIKTarget;
                    lSphere.material = this.mesh.material; // Reuse red debug mat
                    const rSphere = BABYLON.MeshBuilder.CreateSphere("rDebug", { diameter: 0.2 }, this.engine.scene);
                    rSphere.parent = this.rightIKTarget;
                    rSphere.material = this.mesh.material;
                }
            }

            // Stop all default animations
            result.animationGroups.forEach(ag => ag.stop());

            // Debug available animations
            console.log("Loaded animations:", result.animationGroups.map(ag => ag.name));

            // Find specific animations
            this.idleAnim = result.animationGroups.find(ag => ag.name.toLowerCase().includes("idle")) || null;
            this.walkAnim = result.animationGroups.find(ag => ag.name.toLowerCase().includes("walk")) || null;
            this.runAnim = result.animationGroups.find(ag => ag.name.toLowerCase().includes("run")) || null;
            this.climbAnim = result.animationGroups.find(ag => ag.name.toLowerCase().includes("climb")) || null;

            // Start Idle
            if (this.idleAnim) {
                this.idleAnim.start(true);
                this.idleAnim.setWeightForAllAnimatables(1);
            }
            if (this.walkAnim) {
                this.walkAnim.start(true);
                this.walkAnim.setWeightForAllAnimatables(0);
            }
            if (this.runAnim) {
                this.runAnim.start(true);
                this.runAnim.setWeightForAllAnimatables(0);
            }
            if (this.climbAnim) {
                this.climbAnim.start(true);
                this.climbAnim.setWeightForAllAnimatables(0);
            }
        } catch (e) {
            console.error("Failed to load character model:", e);
        }
    }

    cycleCameraStyle() {
        const next = (this.currentStyle + 1) % 4;
        this.setCameraStyle(next);
    }

    setCameraStyle(style: CameraStyle) {
        this.currentStyle = style;
        switch (style) {
            case CameraStyle.TPS_STANDARD:
                this.camera.radius = 8;
                this.camera.beta = Math.PI / 3;
                this.camera.lowerRadiusLimit = 2;
                this.camera.upperRadiusLimit = 15;
                this.camera.lowerBetaLimit = 0.1;
                this.camera.upperBetaLimit = Math.PI / 2 - 0.1;
                break;
            case CameraStyle.SHOULDER:
                this.camera.radius = 3.5;
                this.camera.beta = Math.PI / 2.2;
                this.camera.lowerRadiusLimit = 2;
                this.camera.upperRadiusLimit = 6;
                this.camera.lowerBetaLimit = 0.5;
                this.camera.upperBetaLimit = Math.PI / 2 - 0.2;
                break;
            case CameraStyle.SHOULDER_CLOSE:
                this.camera.radius = 2.0;
                this.camera.beta = Math.PI / 2.2;
                this.camera.lowerRadiusLimit = 1.5;
                this.camera.upperRadiusLimit = 4;
                this.camera.lowerBetaLimit = 0.5;
                this.camera.upperBetaLimit = Math.PI / 2 - 0.2;
                break;
            case CameraStyle.TOP_DOWN:
                this.camera.radius = 25;
                this.camera.beta = 0.1;
                this.camera.lowerRadiusLimit = 10;
                this.camera.upperRadiusLimit = 40;
                this.camera.lowerBetaLimit = 0;
                this.camera.upperBetaLimit = 0.5;
                break;
        }
    }

    update(dt: number) {
        const input = this.engine.input;
        
        // Check Grounded
        this.checkGrounded();

        // Check Wall
        const wallNormal = this.checkWall(1.5, 1.0, true); // Check from center height, enable logging
        const moveVector = new BABYLON.Vector3(0, 0, 0);
        let isMoving = false;
        let isSprinting = input.sprint;

        if (this.isClimbing) {
            // --- CLIMBING STATE ---
            if (!wallNormal || (this.isGrounded && input.vertical < 0)) {
                this.isClimbing = false; // Drop off
            } else {
                this.verticalVelocity = 0; // Disable Gravity
                
                // Climb Movement
                const climbSpeed = isSprinting ? 5.0 : 2.5;
                // Vertical (W/S -> Up/Down)
                moveVector.y = input.vertical * climbSpeed * dt;
                
                // Horizontal (A/D -> Left/Right along wall)
                if (input.horizontal !== 0 && wallNormal) {
                    const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), wallNormal).normalize();
                    moveVector.addInPlace(right.scale(input.horizontal * climbSpeed * dt));
                }

                // Wall Jump (Space)
                if (input.jump) {
                    this.isClimbing = false;
                    this.verticalVelocity = this.jumpForce;
                    // Push away from wall slightly
                    const push = wallNormal.scale(5.0 * dt);
                    moveVector.addInPlace(push);
                }

                // Ledge Vault (Reached Top)
                // If we are moving up and suddenly no wall is detected, we reached the top
                if (input.vertical > 0 && !this.checkWall(1.0, 0.5)) { // Check slightly higher
                     this.isClimbing = false;
                     this.verticalVelocity = 0;
                     // Vault movement: Move forward and up
                     const vaultDir = this.mesh.forward.scale(1.5).add(new BABYLON.Vector3(0, 1.5, 0));
                     this.mesh.position.addInPlace(vaultDir);
                }

                // Face the wall
                if (wallNormal) {
                    // We want the character to face the wall.
                    // wallNormal points AWAY from wall. We want Forward to be Opposite to Normal.
                    const targetRotation = Math.atan2(-wallNormal.x, -wallNormal.z);
                    this.mesh.rotation.y = BABYLON.Scalar.Lerp(this.mesh.rotation.y, targetRotation, 20 * dt);
                }
            }
        } else {
            // --- NORMAL STATE ---
            
            // Jump
            if (this.isGrounded && input.jump) {
                this.verticalVelocity = this.jumpForce;
                this.isGrounded = false;
            }

            // Apply Gravity
            if (this.isGrounded && this.verticalVelocity < 0) {
                this.verticalVelocity = -2; // Stick to ground
            } else {
                this.verticalVelocity += this.gravity * dt;
            }
            moveVector.y = this.verticalVelocity * dt;

            if (input.horizontal !== 0 || input.vertical !== 0) {
            isMoving = true;
            // Calculate movement direction relative to camera
            const forward = this.camera.getDirection(BABYLON.Vector3.Forward());
            const right = this.camera.getDirection(BABYLON.Vector3.Right());
            
            // Flatten to XZ plane (no flying)
            forward.y = 0;
            right.y = 0;
            forward.normalize();
            right.normalize();

            const moveDir = forward.scale(input.vertical).add(right.scale(input.horizontal)).normalize();
            
            // Apply Movement
            // AC Style: Default = Walk (3.0), Shift = Sprint (6.0)
            const currentSpeed = isSprinting ? this.speed * 1.5 : this.speed * 0.6;
            const velocity = moveDir.scale(currentSpeed * dt);
            moveVector.addInPlace(velocity);

            // Rotate character to face movement
            const targetRotation = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
            
            // Smooth rotation
            let diff = targetRotation - this.mesh.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.mesh.rotation.y += diff * this.rotationSpeed * dt;

            // --- PARKOUR TRIGGERS ---
            // 1. Auto-Climb: Sprinting + Moving Forward + Wall
            // 2. Ledge Grab: In Air + Moving Forward + Wall
            const autoClimb = isSprinting && this.isGrounded;
            const ledgeGrab = !this.isGrounded && this.verticalVelocity < 0;

            if ((autoClimb || ledgeGrab) && wallNormal && input.vertical > 0) {
                console.log("Climb Triggered!");
                this.isClimbing = true;
                this.verticalVelocity = 0;
            }
        }
        }

        this.mesh.moveWithCollisions(moveVector);

        // Update Animation State
        this.updateAnimation(isMoving, isSprinting, this.isClimbing, dt);
        
        // Apply IK / Procedural Poses
        if (this.isClimbing) {
            this.updateClimbingIK();
            // this.applyProceduralClimb(); // Disable simple procedural in favor of IK
        }

        // Camera Follow
        const targetPos = this.mesh.position.add(new BABYLON.Vector3(0, 1.5, 0));
        this.camera.target = BABYLON.Vector3.Lerp(this.camera.target, targetPos, 10 * dt);
    }

    updateAnimation(isMoving: boolean, isSprinting: boolean, isClimbing: boolean, dt: number) {
        let targetIdle = 0.0;
        let targetWalk = 0.0;
        let targetRun = 0.0;
        let targetClimb = 0.0;

        if (isClimbing) targetClimb = 1.0;
        else if (!isMoving) targetIdle = 1.0;
        else if (isSprinting) targetRun = 1.0;
        else targetWalk = 1.0;

        const blendSpeed = 5.0;

        this.currentIdleWeight = BABYLON.Scalar.Lerp(this.currentIdleWeight, targetIdle, blendSpeed * dt);
        this.currentWalkWeight = BABYLON.Scalar.Lerp(this.currentWalkWeight, targetWalk, blendSpeed * dt);
        this.currentRunWeight = BABYLON.Scalar.Lerp(this.currentRunWeight, targetRun, blendSpeed * dt);
        this.currentClimbWeight = BABYLON.Scalar.Lerp(this.currentClimbWeight, targetClimb, blendSpeed * dt);

        if (this.idleAnim) this.idleAnim.setWeightForAllAnimatables(this.currentIdleWeight);
        if (this.walkAnim) this.walkAnim.setWeightForAllAnimatables(this.currentWalkWeight);
        if (this.runAnim) this.runAnim.setWeightForAllAnimatables(this.currentRunWeight);
        if (this.climbAnim) this.climbAnim.setWeightForAllAnimatables(this.currentClimbWeight);
    }

    private updateClimbingIK() {
        if (!this.leftIK || !this.rightIK || !this.leftIKTarget || !this.rightIKTarget) return;

        this.leftIK.update();
        this.rightIK.update();

        // Ideal hand positions (relative to player)
        // Character is facing the wall.
        // mesh.forward points TOWARDS the wall.
        // mesh.right points RIGHT.
        
        // Left hand: Up + Left (-Right) + Forward
        const leftIdeal = this.mesh.position.add(new BABYLON.Vector3(0, 1.6, 0)).add(this.mesh.right.scale(-0.3)).add(this.mesh.forward.scale(0.5));
        // Right hand: Up + Right + Forward
        const rightIdeal = this.mesh.position.add(new BABYLON.Vector3(0, 1.6, 0)).add(this.mesh.right.scale(0.3)).add(this.mesh.forward.scale(0.5));

        // Find nearest bricks
        const findNearestBrick = (pos: BABYLON.Vector3) => {
            let nearest: BABYLON.AbstractMesh | null = null;
            let minDst = Infinity;
            
            // Optimization: In a real game, use a spatial partition. Here we scan scene meshes.
            // We filter by name 'climbable_brick'
            this.engine.scene.meshes.forEach(m => {
                if (m.name.includes("climbable_brick")) {
                    const dst = BABYLON.Vector3.DistanceSquared(pos, m.position);
                    if (dst < minDst && dst < 4.0) { // Max reach distance squared
                        minDst = dst;
                        nearest = m;
                    }
                }
            });
            return nearest;
        };

        const leftBrick = findNearestBrick(leftIdeal);
        const rightBrick = findNearestBrick(rightIdeal);

        if (leftBrick) {
            this.leftIKTarget.position = leftBrick.position.clone();
            this.leftIK.weight = BABYLON.Scalar.Lerp(this.leftIK.weight, 1.0, 0.1);
        } else {
            this.leftIK.weight = BABYLON.Scalar.Lerp(this.leftIK.weight, 0.0, 0.1);
        }

        if (rightBrick) {
            this.rightIKTarget.position = rightBrick.position.clone();
            this.rightIK.weight = BABYLON.Scalar.Lerp(this.rightIK.weight, 1.0, 0.1);
        } else {
            this.rightIK.weight = BABYLON.Scalar.Lerp(this.rightIK.weight, 0.0, 0.1);
        }
    }

    private applyProceduralClimb() {
        if (!this.skeleton) return;

        // Helper to find bone by name (handling mixamorig prefix if present)
        const getBone = (name: string) => {
            return this.skeleton!.bones.find(b => b.name.endsWith(name));
        };

        const leftArm = getBone("LeftArm");
        const rightArm = getBone("RightArm");
        const leftUpLeg = getBone("LeftUpLeg");
        const rightUpLeg = getBone("RightUpLeg");
        const leftLeg = getBone("LeftLeg");
        const rightLeg = getBone("RightLeg");

        // Simple cyclic movement based on vertical position
        const t = Date.now() * 0.005;
        const offset = Math.sin(t) * 0.2;

        // Override rotations (Local space)
        // Note: These values are tuned for the Xbot skeleton T-pose/Idle baseline
        if (leftArm) {
            leftArm.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, 0, -1.5 + offset);
            // Force update to override animation
            leftArm.getTransformNode()?.rotate(BABYLON.Axis.Z, -1.5 + offset, BABYLON.Space.LOCAL);
        }
        if (rightArm) {
            rightArm.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, 0, 1.5 - offset);
        }
        
        if (leftUpLeg) {
            leftUpLeg.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(-1.0 - offset, 0, 0);
        }
        if (rightUpLeg) {
            rightUpLeg.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(-1.0 + offset, 0, 0);
        }

        // Bend knees
        if (leftLeg) leftLeg.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(1.5, 0, 0);
        if (rightLeg) rightLeg.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(1.5, 0, 0);

        this.skeleton.prepare();
    }

    private checkGrounded() {
        const ray = new BABYLON.Ray(this.mesh.position, BABYLON.Vector3.Down(), 1.05);
        const pick = this.engine.scene.pickWithRay(ray, (mesh) => mesh.isPickable && mesh.checkCollisions && mesh !== this.mesh && !mesh.isDescendantOf(this.mesh));
        this.isGrounded = pick?.hit || false;
    }

    private checkWall(length = 1.0, yOffset = 0, log = false): BABYLON.Vector3 | null {
        const origin = this.mesh.position.add(new BABYLON.Vector3(0, yOffset, 0));
        
        // Character faces the wall, so Forward is towards the wall.
        // We cast the ray in the Forward direction.
        const ray = new BABYLON.Ray(origin, this.mesh.forward, length);
        const pick = this.engine.scene.pickWithRay(ray, (mesh) => {
            return mesh.isPickable && mesh.checkCollisions && mesh !== this.mesh && !mesh.isDescendantOf(this.mesh) && mesh.name.includes("climbable");
        });
        
        // Only manage logging state if requested
        if (log) {
            if (pick?.hit) {
                if (!this.wasWallDetected) {
                    console.log("Wall Detected");
                    this.wasWallDetected = true;
                }
            } else {
                this.wasWallDetected = false;
            }
        }
        return pick?.hit && pick.getNormal(true) ? pick.getNormal(true) : null;
    }
}