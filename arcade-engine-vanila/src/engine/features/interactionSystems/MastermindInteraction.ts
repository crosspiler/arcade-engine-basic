import type { InputAction } from '../../types';

export interface MastermindInteractionConfig {
    codeLength: number;
    numColors: number;
    currentRow: number;
    onMove: () => void;
    onSubmit: () => void;
    onRestart: () => void;
    getCurrentGuess: () => number[];
}

export class MastermindInteraction {
    cursor = 0;

    constructor(public config: MastermindInteractionConfig) {}

    handleInput(action: InputAction, isGameOver: boolean): boolean {
        if (isGameOver) {
            if (action.type === 'SELECT' || action.type === 'CLICK') {
                this.config.onRestart();
            }
            return false;
        }

        let changed = false;
        const { codeLength, numColors, currentRow, getCurrentGuess } = this.config;
        const currentGuess = getCurrentGuess();

        if (action.type === 'LEFT') { this.cursor = (this.cursor - 1 + codeLength) % codeLength; changed = true; }
        if (action.type === 'RIGHT') { this.cursor = (this.cursor + 1) % codeLength; changed = true; }
        if (action.type === 'UP') { currentGuess[this.cursor] = (currentGuess[this.cursor] % numColors) + 1; this.config.onMove(); changed = true; }
        if (action.type === 'DOWN') { currentGuess[this.cursor] = ((currentGuess[this.cursor] - 2 + numColors) % numColors) + 1; this.config.onMove(); changed = true; }

        if (action.type === 'CLICK') {
            const x = action.data?.gridPos?.x ?? (action as any).x;
            const y = action.data?.gridPos?.y ?? (action as any).y;

            if (typeof x === 'number' && typeof y === 'number' && y === currentRow) {
                if (x >= 0 && x < codeLength) {
                    if (this.cursor === x) {
                        currentGuess[this.cursor] = (currentGuess[this.cursor] % numColors) + 1;
                        this.config.onMove();
                    }
                    this.cursor = x;
                    changed = true;
                }
            }
        }
        if (action.type === 'SELECT') this.config.onSubmit();
        return changed;
    }
}