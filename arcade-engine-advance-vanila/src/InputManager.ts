import { Scene, PointerEventTypes, PointerInfo } from '@babylonjs/core';

export class InputManager {
    private scene: Scene;
    public mousePosition: { x: number, y: number } = { x: 0, y: 0 };
    public isMouseDown: boolean = false;

    constructor(scene: Scene) {
        this.scene = scene;

        this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
            switch (pointerInfo.type) {
                case PointerEventTypes.POINTERDOWN:
                    this.isMouseDown = true;
                    break;
                case PointerEventTypes.POINTERUP:
                    this.isMouseDown = false;
                    break;
                case PointerEventTypes.POINTERMOVE:
                    this.mousePosition.x = this.scene.pointerX;
                    this.mousePosition.y = this.scene.pointerY;
                    break;
            }
        });
    }
}
