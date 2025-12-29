export interface GameItem {
    id: string;
    x: number;
    y: number;
    z?: number;
    type: number;
    color?: number;
    scale?: number;
}

export interface InputAction {
    type: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SELECT' | 'BACK';
}

export interface SoundEmitter {
    playTone(freq: number, type: 'sine' | 'square' | 'sawtooth' | 'triangle', duration: number): void;
    playSelect(): void;
    playMove(): void;
    playMatch(): void;
    playGameOver(): void;
}