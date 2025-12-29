import * as BABYLON from '@babylonjs/core';

export class InputManager {
    private keys = new Set<string>();
    
    // Axis state
    horizontal = 0;
    vertical = 0;
    jump = false;
    sprint = false;

    constructor(scene: BABYLON.Scene) {
        scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.code;
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                this.keys.add(key);
            } else {
                this.keys.delete(key);
            }
            this.updateAxes();
        });
    }

    private updateAxes() {
        this.vertical = 0;
        this.horizontal = 0;

        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.vertical = 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.vertical = -1;
        
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.horizontal = -1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.horizontal = 1;

        this.jump = this.keys.has('Space');
        this.sprint = this.keys.has('ShiftLeft');
    }
}