
import { GameModel } from './GameModel';
import type{ GameItem, InputAction, SoundEmitter } from '../engine/types';
import { DirectionalInteraction } from '../engine/features/interactionSystems/DirectionalInteraction';
import { GameLoop } from '../engine/features/GameLoop';

export default class SnakeGame extends GameModel {
    d = { x: 0, y: 1 };
    nd = { x: 0, y: 1 };
    snake: GameItem[] = [];
    food: GameItem | null = null;
    interaction: DirectionalInteraction;
    gameLoop: GameLoop;
    timeAccumulator = 0;

    constructor(audio?: SoundEmitter) { 
        super(15, 15, 'snake', audio);
        this.interaction = new DirectionalInteraction(
            (dx, dy) => {
                // Prevent 180 degree turns
                if (dx !== -this.d.x || dy !== -this.d.y) {
                    this.nd = { x: dx, y: dy };
                }
            },
            () => this.start()
        );
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.isGameOver = false;
        this.snake = [{ x: 7, y: 7, id: this.uid(), type: 0 }];
        this.d = { x: 0, y: 1 };
        this.nd = { x: 0, y: 1 };
        this.spawn();
        this.status$.next('Eat');

        this.timeAccumulator = 0;
        this.gameLoop.start();
    }

    handleInput(action: InputAction) {
        this.interaction.handleInput(action, this.isGameOver);
    }

    tick(dt: number) {
        if (this.isPaused || this.isGameOver) return;

        this.timeAccumulator += dt;
        if (this.timeAccumulator < 0.15) return; // 150ms tick (slightly faster than before)
        this.timeAccumulator -= 0.15;

        this.d = this.nd;
        const h = this.snake[0];
        const nh: GameItem = { x: h.x + this.d.x, y: h.y + this.d.y, id: this.uid(), type: 0 };

        if (nh.x < 0 || nh.x >= 15 || nh.y < 0 || nh.y >= 15 || this.snake.some(s => s.x === nh.x && s.y === nh.y)) {
            this.isGameOver = true;
            this.status$.next('GAME OVER');
            this.audio.playGameOver();
            this.gameLoop.stop();
            setTimeout(() => this.effects$.next({ type: 'GAMEOVER' }), 2000);
            return;
        }

        this.snake.unshift(nh);
        
        if (this.food && nh.x === this.food.x && nh.y === this.food.y) {
            this.updateScore(50);
            this.subStat$.next(++this.subStat);
            this.effects$.next({ type: 'PARTICLE', x: nh.x, y: nh.y, color: 0xff0000, style: 'PUFF' });
            this.effects$.next({ type: 'AUDIO', name: 'SELECT' });
            this.spawn();
        } else {
            this.snake.pop();
        }
        this.emit();
    }

    spawn() {
        while (true) {
            const x = Math.floor(Math.random() * 15);
            const y = Math.floor(Math.random() * 15);
            if (!this.snake.some(s => s.x === x && s.y === y)) {
                this.food = { x, y, id: 'f', type: 2 };
                break;
            }
        }
    }

    emit() {
        const r: GameItem[] = this.snake.map((s, i) => ({ id: s.id, x: s.x, y: s.y, type: i ? 1 : 0 }));
        if (this.food) r.push({ ...this.food });
        this.state$.next(r);
    }

    getRenderConfig() {
        return { 
            geometry: 'box' as const, 
            colors: { 0: 0x00ff00, 1: 0x008800, 2: 0xff0000 },
            bgColor: 0x0a1a0a
        };
    }
}
