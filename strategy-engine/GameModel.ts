import { BehaviorSubject, Subject } from 'rxjs';
import type { GameItem, InputAction, SoundEmitter } from './types';

export abstract class GameModel {
    width: number;
    height: number;
    id: string;
    audio: SoundEmitter;

    // Reactive State
    state$ = new BehaviorSubject<GameItem[]>([]);
    status$ = new BehaviorSubject<string>('');
    effects$ = new Subject<{ type: string, payload?: any }>();

    constructor(width: number, height: number, id: string, audio?: SoundEmitter) {
        this.width = width;
        this.height = height;
        this.id = id;
        this.audio = audio || {
            playTone: () => {}, playSelect: () => {}, playMove: () => {}, playMatch: () => {}, playGameOver: () => {}
        };
    }

    abstract start(): void;
    abstract handleInput(action: InputAction): void;
    abstract getRenderConfig(): any;
}