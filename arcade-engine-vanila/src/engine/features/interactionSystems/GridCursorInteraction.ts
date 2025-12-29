import type { InputAction } from '../../types';

export interface GridCursorConfig {
    width: number;
    height: number;
    onAction: (x: number, y: number) => void;
    onStartLevel: () => void;
}

export class GridCursorInteraction {
    cursor = { x: 0, y: 0 };

    constructor(private config: GridCursorConfig) {}

    updateConfig(config: Partial<GridCursorConfig>) {
        Object.assign(this.config, config);
    }

    handleInput(action: InputAction, isGameOver: boolean): boolean {
        if (isGameOver) {
            if (action.type === 'SELECT' || action.type === 'CLICK') {
                this.config.onStartLevel();
            }
            return false;
        }

        let changed = false;
        const { width, height } = this.config;

        // Navigation
        if (action.type === 'UP' && this.cursor.y < height - 1) { this.cursor.y++; changed = true; }
        if (action.type === 'DOWN' && this.cursor.y > 0) { this.cursor.y--; changed = true; }
        if (action.type === 'LEFT' && this.cursor.x > 0) { this.cursor.x--; changed = true; }
        if (action.type === 'RIGHT' && this.cursor.x < width - 1) { this.cursor.x++; changed = true; }

        // Mouse/Touch
        let inputX: number | undefined;
        let inputY: number | undefined;

        if (action.type === 'CLICK' || action.type === 'SELECT') {
            if (action.data && action.data.gridPos) {
                inputX = action.data.gridPos.x;
                inputY = action.data.gridPos.y;
            } else if (typeof (action as any).x === 'number' && typeof (action as any).y === 'number') {
                inputX = (action as any).x;
                inputY = (action as any).y;
            }
        }

        if (inputX !== undefined && inputY !== undefined && inputX >= 0 && inputX < width && inputY >= 0 && inputY < height) {
            this.cursor.x = inputX;
            this.cursor.y = inputY;
            this.config.onAction(inputX, inputY);
            changed = true;
        } else if (action.type === 'SELECT') {
            this.config.onAction(this.cursor.x, this.cursor.y);
            changed = true;
        }

        return changed;
    }
}