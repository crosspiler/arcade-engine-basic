// src/games/BoulderDash.ts

import { GameModel } from './GameModel';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import { DirectionalInteraction } from '../engine/features/interactionSystems/DirectionalInteraction';
import { GameLoop } from '../engine/features/GameLoop';
import { Grid } from '../engine/features/Grid';
import * as THREE from 'three';

const EMPTY = 0;
const DIRT = 1;
const WALL = 2;
const ROCK = 3;
const DIAMOND = 4;
const PLAYER = 5;
const EXIT = 6;
const EXIT_OPEN = 7;

export default class BoulderDash extends GameModel {
    grid!: Grid<number>;
    playerX = 1;
    playerY = 1;
    score = 0;
    diamondsCollected = 0;
    diamondsNeeded = 10;
    gameLoop: GameLoop;
    timeAccumulator = 0;
    level = 1;
    interaction: DirectionalInteraction;

    constructor(audio?: SoundEmitter) {
        super(10, 10, 'boulderdash', audio);
        this.grid = new Grid(10, 10, EMPTY);
        this.interaction = new DirectionalInteraction(
            (dx, dy) => this.movePlayer(dx, dy),
            () => this.handleRestart()
        );
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.level = 1;
        this.score = 0;
        this.startLevel();
    }

    startLevel() {
        // Procedural grid size: Start 10x10, grow by 2 every level, max 24x24
        const size = Math.min(24, 8 + (this.level * 2));
        this.width = size;
        this.height = size;

        this.isGameOver = false;
        this.diamondsCollected = 0;
        
        // Try to generate a solvable level
        let attempts = 0;
        while (attempts < 100) {
            // Init Grid
            this.grid = new Grid(this.width, this.height, EMPTY);
            const targetDiamonds = Math.floor(size * size * 0.05) + this.level;
            
            for(let x=0; x<this.width; x++) {
                for(let y=0; y<this.height; y++) {
                    if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
                        this.grid.set(x, y, WALL);
                    } else {
                        const rand = Math.random();
                        if (rand < 0.10) this.grid.set(x, y, DIAMOND);
                        else if (rand < 0.20) this.grid.set(x, y, ROCK);
                        else this.grid.set(x, y, DIRT);
                    }
                }
            }

            // Place Player (Clear area around start)
            this.playerX = 1;
            this.playerY = 1;
            
            // Clear a safe zone (3x3) around start to prevent immediate traps
            for(let dx=0; dx<=2; dx++) {
                for(let dy=0; dy<=2; dy++) {
                    const px = 1 + dx;
                    const py = 1 + dy;
                    if (px < this.width - 1 && py < this.height - 1) {
                        if (this.grid.get(px, py) === ROCK) this.grid.set(px, py, DIRT);
                    }
                }
            }

            this.grid.set(1, 1, EMPTY);

            // Place Exit
            this.grid.set(this.width-2, this.height-2, EXIT);

            // Count actual diamonds and adjust needed
            let totalDiamonds = 0;
            this.grid.forEach((val) => {
                if (val === DIAMOND) totalDiamonds++;
            });
            
            this.diamondsNeeded = Math.min(targetDiamonds, Math.max(1, Math.floor(totalDiamonds * 0.8)));

            if (this.checkSolvability()) break;
            attempts++;
        }

        this.status$.next(`Collect ${this.diamondsNeeded} Diamonds`);
        this.emit();

        this.timeAccumulator = 0;
        this.gameLoop.start();
    }

    checkSolvability() {
        const visited = new Set<string>();
        const queue: {x: number, y: number}[] = [{x: this.playerX, y: this.playerY}];
        visited.add(`${this.playerX},${this.playerY}`);
        
        let reachableDiamonds = 0;
        let exitReachable = false;

        while (queue.length > 0) {
            const {x, y} = queue.shift()!;
            
            const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                    const key = `${nx},${ny}`;
                    if (!visited.has(key)) {
                        const cell = this.grid.get(nx, ny);
                        if (cell !== WALL && cell !== ROCK) {
                            visited.add(key);
                            queue.push({x: nx, y: ny});
                            if (cell === DIAMOND) reachableDiamonds++;
                            if (cell === EXIT) exitReachable = true;
                        }
                    }
                }
            }
        }
        return reachableDiamonds >= this.diamondsNeeded && exitReachable;
    }

    handleInput(action: InputAction) {
        this.interaction.handleInput(action, this.isGameOver);
    }

    handleRestart() {
        if (this.diamondsCollected >= this.diamondsNeeded) {
            this.level++;
        } else {
            this.level = 1;
            this.score = 0;
        }
        this.startLevel();
    }

    movePlayer(dx: number, dy: number) {
        const newX = this.playerX + dx;
        const newY = this.playerY + dy;
        const target = this.grid.get(newX, newY);

        if (target === WALL) return;
        
        // Pushing rocks (only horizontal)
        if (target === ROCK && dy === 0) {
            const behindRockX = newX + dx;
            if (this.grid.get(behindRockX, newY) === EMPTY) {
                this.grid.set(behindRockX, newY, ROCK);
                this.grid.set(newX, newY, EMPTY);
                this.audio.playMove();
            } else {
                return; // Can't push
            }
        } else if (target === ROCK) {
            return; // Can't walk into rocks vertically
        }

        if (target === DIAMOND) {
            this.collectDiamond();
        }

        if (target === EXIT || target === EXIT_OPEN) {
            if (this.diamondsCollected >= this.diamondsNeeded) {
                this.handleWin();
                return;
            }
            if (target === EXIT) return; // Locked
        }

        // Move
        this.playerX = newX;
        this.playerY = newY;
        this.grid.set(newX, newY, EMPTY); // Dig dirt
        this.audio.playMove();
        this.emit();
    }

    collectDiamond() {
        this.diamondsCollected++;
        this.score += 10;
        this.audio.playMatch();
        
        if (this.diamondsCollected >= this.diamondsNeeded) {
            this.status$.next('EXIT OPEN!');
            // Find exit and open it
            this.grid.forEach((val, x, y) => {
                if (val === EXIT) {
                    this.grid.set(x, y, EXIT_OPEN);
                }
            });
        } else {
            this.status$.next(`Diamonds: ${this.diamondsCollected}/${this.diamondsNeeded}`);
        }
    }

    tick(dt: number) {
        if (this.isGameOver) return;

        this.timeAccumulator += dt;
        if (this.timeAccumulator < 0.2) return; // 200ms tick rate
        this.timeAccumulator -= 0.2;

        let changed = false;
        // Scan from bottom to top to handle falling correctly
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.grid.get(x, y);
                
                if (cell === ROCK || cell === DIAMOND) {
                    // Check below
                    if (y > 0) {
                        const below = this.grid.get(x, y-1);
                        
                        // Fall down into empty space (Player is technically in EMPTY space in the grid)
                        // We check player coordinates explicitly for collision
                        const isPlayerBelow = (x === this.playerX && y - 1 === this.playerY);

                        if (below === EMPTY) {
                            this.grid.set(x, y-1, cell!);
                            this.grid.set(x, y, EMPTY);
                            changed = true;
                            
                            if (isPlayerBelow && cell === ROCK) {
                                this.handleLoss();
                                return;
                            }
                        } 
                    }
                }
            }
        }

        if (changed) this.emit();
    }

    handleLoss() {
        this.isGameOver = true;
        this.status$.next('CRUSHED! Game Over');
        this.audio.playGameOver();
        this.gameLoop.stop();
        this.emit();
    }

    handleWin() {
        this.isGameOver = true;
        this.status$.next('Level Complete! Press SELECT');
        this.audio.playMatch();
        this.gameLoop.stop();
        this.emit();
    }

    emit() {
        const items: GameItem[] = [];
        
        this.grid.forEach((type, x, y) => {
            if (type !== EMPTY) {
                items.push({ id: `t_${x}_${y}`, x, y, type });
            }
        });

        if (!this.isGameOver) {
            items.push({ id: 'player', x: this.playerX, y: this.playerY, type: PLAYER });
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                1: 0x8B4513, // Dirt (Brown)
                2: 0x555555, // Wall (Dark Grey)
                3: 0x888888, // Rock (Grey)
                4: 0x00FFFF, // Diamond (Cyan)
                5: 0x00FF00, // Player (Green)
                6: 0xFF0000, // Exit Closed (Red)
                7: 0x0000FF  // Exit Open (Blue)
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === ROCK) return new THREE.DodecahedronGeometry(0.4);
                if (type === DIAMOND) return new THREE.OctahedronGeometry(0.3);
                if (type === PLAYER) return new THREE.SphereGeometry(0.4);
                if (type === DIRT) return new THREE.BoxGeometry(0.9, 0.9, 0.9);
                return null;
            }
        }
    }
}