import { GameModel } from './GameModel';
import { Grid } from '../engine/features/Grid';
import { GameLoop } from '../engine/features/GameLoop';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const P1 = 0;
const CPU = 1;

export default class SnakeAndLadder extends GameModel {
    grid!: Grid<number>;
    gameLoop: GameLoop;

    players = [
        { id: P1, pos: 0, color: 0xFFFFFF }, // White
        { id: CPU, pos: 0, color: 0x4444FF } // Blue
    ];
    currentPlayer = P1;
    
    // Game State
    state: 'ROLL' | 'ANIMATING' | 'CPU_THINK' = 'ROLL';
    diceValue = 0;
    
    // Animation
    animQueue: { playerId: number, targetPos: number, type: 'STEP' | 'JUMP' }[] = [];
    animProgress = 0;
    
    // Board Data
    jumps: Map<number, { dest: number, color: number }> = new Map(); // start -> {dest, color}
    boardSize = 10;

    constructor(audio?: SoundEmitter) {
        super(10, 10, 'snake_ladder', audio);
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        this.boardSize = 10 + (this.level - 1);
        this.resize(this.boardSize, this.boardSize);
        this.grid = new Grid(this.boardSize, this.boardSize, 0);
        
        this.players.forEach(p => p.pos = 0);
        this.currentPlayer = P1;
        this.state = 'ROLL';
        this.isGameOver = false;
        this.animQueue = [];
        this.animProgress = 0;
        
        this.generateBoard();
        this.status$.next(`Level ${this.level}: Your Turn (Press SELECT)`);
        this.emit();
        this.gameLoop.start();
    }

    generateBoard() {
        this.jumps.clear();
        const numFeatures = 5 + Math.min(this.level, 10);
        const occupied = new Set<number>();
        const lastTile = this.boardSize * this.boardSize - 1;

        const findFreeSpot = (min: number, max: number, exclude: Set<number>): number | null => {
            if (max <= min) return null;
            for (let i = 0; i < 20; i++) {
                const pos = Math.floor(min + Math.random() * (max - min));
                if (!exclude.has(pos)) return pos;
            }
            return null;
        };

        // 1. Generate Ladders (Up) - Distribute starts uniformly
        const ladderMaxStart = Math.floor(lastTile * 0.85);
        const ladderStep = Math.floor((ladderMaxStart - 2) / numFeatures);
        for(let i=0; i<numFeatures; i++) {
            const rangeMin = 2 + i * ladderStep;
            const rangeMax = rangeMin + ladderStep;
            
            const start = findFreeSpot(rangeMin, rangeMax, occupied);
            if (start === null) continue;

            const end = findFreeSpot(start + 5, lastTile - 1, occupied);
            if (end === null) continue;

            const color = Math.floor(Math.random() * 0xFFFFFF);
            this.jumps.set(start, { dest: end, color });
            occupied.add(start);
            occupied.add(end);
        }

        // 2. Generate Snakes (Down) - Distribute starts uniformly
        const snakeMinStart = Math.floor(lastTile * 0.15);
        const snakeMaxStart = lastTile - 1;
        const snakeStep = Math.floor((snakeMaxStart - snakeMinStart) / numFeatures);
        for(let i=0; i<numFeatures; i++) {
            const rangeMin = snakeMinStart + i * snakeStep;
            const rangeMax = rangeMin + snakeStep;

            const start = findFreeSpot(rangeMin, rangeMax, occupied);
            if (start === null) continue;

            const end = findFreeSpot(2, start - 5, occupied);
            if (end === null) continue;

            const color = Math.floor(Math.random() * 0xFFFFFF);
            this.jumps.set(start, { dest: end, color });
            occupied.add(start);
            occupied.add(end);
        }
    }

    handleInput(action: InputAction) {
        if (this.isGameOver) {
            if (action.type === 'SELECT') this.start();
            return;
        }

        if (this.state !== 'ROLL') return;
        
        if (action.type === 'SELECT') {
            this.rollDice();
        }
    }

    rollDice() {
        this.diceValue = Math.floor(Math.random() * 6) + 1;
        this.audio.playTone(400 + this.diceValue * 50, 'square', 0.1);
        
        const p = this.players[this.currentPlayer];
        const name = this.currentPlayer === P1 ? "You" : "CPU";
        this.status$.next(`${name} rolled ${this.diceValue}`);
        
        let target = p.pos + this.diceValue;
        const lastTile = this.boardSize * this.boardSize - 1;
        
        // Exact roll rule: if overshoot, stay put
        if (target > lastTile) {
             target = p.pos;
        }

        this.state = 'ANIMATING';
        
        // 1. Move Animation
        if (target > p.pos) {
            for (let i = p.pos + 1; i <= target; i++) {
                this.animQueue.push({ playerId: this.currentPlayer, targetPos: i, type: 'STEP' });
            }
        }
        
        // 2. Jump Animation (Snake/Ladder)
        if (this.jumps.has(target)) {
            const jumpDest = this.jumps.get(target)!.dest;
            this.animQueue.push({ playerId: this.currentPlayer, targetPos: jumpDest, type: 'JUMP' });
        }

        // If no move (overshot), just end turn after delay
        if (this.animQueue.length === 0) {
            setTimeout(() => this.endTurn(), 1000);
        }
    }

    tick(dt: number) {
        if (this.state === 'ANIMATING' && this.animQueue.length > 0) {
            const anim = this.animQueue[0];
            const p = this.players[anim.playerId];
            
            this.animProgress += dt * (anim.type === 'JUMP' ? 1.5 : 8.0);
            
            if (this.animProgress >= 1.0) {
                p.pos = anim.targetPos;
                this.animProgress = 0;
                this.animQueue.shift();
                this.audio.playMove();
                
                if (this.animQueue.length === 0) {
                    this.checkWin();
                }
            }
            this.emit();
        }
    }

    checkWin() {
        const p = this.players[this.currentPlayer];
        const lastTile = this.boardSize * this.boardSize - 1;
        if (p.pos === lastTile) {
            if (this.currentPlayer === P1) {
                this.status$.next("You Win! Level Up!");
                this.audio.playMatch();
                setTimeout(() => {
                    this.level++;
                    this.startLevel();
                }, 2000);
            } else {
                this.status$.next("CPU Wins! Game Over");
                this.audio.playGameOver();
                this.effects$.next({ type: 'GAMEOVER' });
                this.gameLoop.stop();
                this.isGameOver = true;
            }
        } else {
            this.endTurn();
        }
    }

    endTurn() {
        if (this.isGameOver) return;
        this.currentPlayer = this.currentPlayer === P1 ? CPU : P1;
        
        if (this.currentPlayer === CPU) {
            this.state = 'CPU_THINK';
            this.status$.next("CPU Turn...");
            setTimeout(() => this.rollDice(), 1000);
        } else {
            this.state = 'ROLL';
            this.status$.next(`Level ${this.level}: Your Turn`);
        }
    }

    getCoord(index: number) {
        const y = Math.floor(index / this.boardSize);
        // Boustrophedon path (zig-zag)
        const x = (y % 2 === 0) ? (index % this.boardSize) : ((this.boardSize - 1) - (index % this.boardSize));
        return { x, y };
    }

    emit() {
        const items: GameItem[] = [];
        
        // Render Board
        const totalTiles = this.boardSize * this.boardSize;
        for(let i=0; i<totalTiles; i++) {
            const {x, y} = this.getCoord(i);
            const color = (x+y)%2 === 0 ? 0x333333 : 0x444444;
            
            items.push({ id: `t_${i}`, x, y, type: 10, color });
        }

        // Render Snakes and Ladders
        this.jumps.forEach((data, start) => {
            const end = data.dest;
            const startPos = this.getCoord(start);
            const endPos = this.getCoord(end);
            const isLadder = end > start;
            
            const dx = endPos.x - startPos.x;
            const dy = endPos.y - startPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (isLadder) {
                // Ladder: Straight line of rectangular steps
                const steps = Math.floor(dist * 2.5); 
                for(let i=0; i<=steps; i++) {
                    const t = i / steps;
                    items.push({
                        id: `l_${start}_${i}`,
                        x: startPos.x + dx * t,
                        y: startPos.y + dy * t,
                        z: 0.1,
                        type: 30, // Ladder Step
                        color: data.color
                    });
                }
            } else {
                // Snake: Sine wave of spheres (Pipe-like)
                const steps = Math.floor(dist * 4);
                // Perpendicular vector for wave
                const nx = -dy / dist;
                const ny = dx / dist;
                
                for(let i=0; i<=steps; i++) {
                    const t = i / steps;
                    const wave = Math.sin(t * Math.PI * 2) * 0.4; // Wiggle
                    const arch = Math.sin(t * Math.PI) * 0.5; // Arch up
                    
                    items.push({
                        id: `s_${start}_${i}`,
                        x: startPos.x + dx * t + nx * wave,
                        y: startPos.y + dy * t + ny * wave,
                        z: 0.2 + arch,
                        type: 31, // Snake Body
                        color: data.color
                    });
                }
            }
        });

        // Render Players
        this.players.forEach(p => {
            let {x, y} = this.getCoord(p.pos);
            let z = 0;
            
            if (this.state === 'ANIMATING' && this.animQueue.length > 0 && this.animQueue[0].playerId === p.id) {
                const anim = this.animQueue[0];
                const target = anim.targetPos;
                const start = p.pos;
                const t = this.animProgress;
                
                const startC = this.getCoord(start);
                const endC = this.getCoord(target);
                
                x = startC.x + (endC.x - startC.x) * t;
                y = startC.y + (endC.y - startC.y) * t;
                
                if (anim.type === 'JUMP') {
                    z = Math.sin(t * Math.PI) * 2.0; // High arc for jumps
                } else {
                    z = Math.sin(t * Math.PI) * 0.5; // Small hop for steps
                }
            }
            
            items.push({
                id: `p_${p.id}`,
                x, y, 
                type: 20, 
                color: p.color,
                z: z
            });
        });

        this.state$.next(items);
    }
    
    getRenderConfig() {
         return {
            geometry: 'box' as const,
            colors: { 10: 0x555555, 20: 0xFFFFFF, 30: 0x8B4513, 31: 0x228B22 },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === 10) return new THREE.BoxGeometry(0.95, 0.95, 0.1);
                if (type === 20) return new THREE.SphereGeometry(0.3);
                if (type === 30) return new THREE.BoxGeometry(0.6, 0.15, 0.1); // Ladder Step (Thinner)
                if (type === 31) return new THREE.SphereGeometry(0.15); // Snake Body
                return null;
            }
        }
    }
}