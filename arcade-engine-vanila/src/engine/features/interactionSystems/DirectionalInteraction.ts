import type { InputAction } from '../../types';

export class DirectionalInteraction {
    constructor(
        private onMove: (dx: number, dy: number) => void,
        private onRestart: () => void
    ) {}

    handleInput(action: InputAction, isGameOver: boolean) {
        if (isGameOver) {
            if (action.type === 'SELECT') this.onRestart();
            return;
        }

        let dx = 0, dy = 0;
        if (action.type === 'UP') dy = 1;
        if (action.type === 'DOWN') dy = -1;
        if (action.type === 'LEFT') dx = -1;
        if (action.type === 'RIGHT') dx = 1;

        if (dx !== 0 || dy !== 0) {
            this.onMove(dx, dy);
        }
    }
}