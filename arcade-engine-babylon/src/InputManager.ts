import { Scene } from '@babylonjs/core/scene';
import { PointerEventTypes, PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Ray } from '@babylonjs/core/Culling/ray';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

export class InputManager {
    private scene: Scene;
    private camera: Camera;

    constructor(scene: Scene, camera: Camera, onPick?: (mesh: AbstractMesh, point: Vector3) => void) {
        this.scene = scene;
        this.camera = camera;

        this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                console.log("Pointer down event");
                
                // Explicitly create a ray from the camera to the pointer position
                // This bypasses 'activeCamera' ambiguity
                // We instantiate Ray directly to ensure the class is loaded and side-effects run, preventing the "Ray needs to be imported" error
                const ray = new Ray(Vector3.Zero(), Vector3.Zero());
                this.scene.createPickingRayToRef(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), ray, this.camera);
                const pickResult = this.scene.pickWithRay(ray);

                if (pickResult && pickResult.hit && pickResult.pickedMesh && pickResult.pickedPoint) {
                    console.log("Picked mesh:", pickResult.pickedMesh.name);
                    const clickFeedback = MeshBuilder.CreateSphere("clickFeedback", { diameter: 0.5 }, this.scene);
                    clickFeedback.position = pickResult.pickedPoint.clone();
                    const material = new StandardMaterial("clickMaterial", this.scene);
                    material.emissiveColor = new Color3(1, 1, 0);
                    clickFeedback.material = material;
                    setTimeout(() => {
                        clickFeedback.dispose();
                    }, 500);
                    if (onPick) onPick(pickResult.pickedMesh, pickResult.pickedPoint);
                } else {
                    console.log("No mesh picked.");
                }
            }
        });
    }
}
