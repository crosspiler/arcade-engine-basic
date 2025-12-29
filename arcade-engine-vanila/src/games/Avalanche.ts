// src/games/Avalanche.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TYPE_FLOOR = 0;
const TYPE_ICE = 1;
const TYPE_GRAIN = 2;

const CRITICAL_MASS = 4;

interface Cell {
    count: number;
    isIce: boolean;
}

export default class Avalanche extends GameModel {
    grid!: Grid<Cell>;
    interaction: GridCursorInteraction;
    level = 1;
    movesLeft = 0;
    isProcessing = false;

    constructor(audio?: SoundEmitter) {
        super(6, 6, 'avalanche', audio);
        this.grid = new Grid(6, 6, () => ({ count: 0, isIce: false }));
        this.interaction = new GridCursorInteraction({
            width: 6,
            height: 6,
            onAction: (x, y) => this.handleAction(x, y),
            onStartLevel: () => this.startLevel()
        });
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        this.isProcessing = false;
        this.interaction.cursor = { x: 2, y: 2 };
        
        // Generate Level
        // Higher levels = more pre-filled grains (more unstable)
        this.movesLeft = 15 + this.level * 2;
        
        this.grid = new Grid(this.width, this.height, () => ({ count: 0, isIce: false }));

        // Place Ice (Targets)
        const iceCount = 3 + this.level;
        let placed = 0;
        while(placed < iceCount) {
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);
            const cell = this.grid.get(x, y);
            if (cell && !cell.isIce) {
                cell.isIce = true;
                // Give ice tiles some starting grains to make them volatile
                cell.count = 2; 
                placed++;
            }
        }

        // Fill random other spots - DENSELY to allow chain reactions
        for(let x=0; x<this.width; x++) {
            for(let y=0; y<this.height; y++) {
                const cell = this.grid.get(x, y);
                if (cell && !cell.isIce) {
                    // 60% chance to have grains
                    if (Math.random() < 0.6) {
                        cell.count = Math.floor(Math.random() * 2) + 1;
                    }
                }
            }
        }

        this.status$.next(`Lv ${this.level}: Topple neighbors to break Ice!`);
        this.emit();
    }

    handleInput(action: InputAction) {
        if (this.isProcessing) return; // Block input during avalanche
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    async handleAction(x: number, y: number) {
        if (this.movesLeft <= 0 || this.isProcessing) {
            this.audio.playTone(150, 'sawtooth', 0.1);
            return;
        }

        // Cannot add grains directly to Ice - must use avalanches
        const cell = this.grid.get(x, y);
        if (cell) {
            if (cell.isIce) {
                this.audio.playTone(150, 'sawtooth', 0.1);
                this.status$.next("Locked! Trigger an avalanche nearby.");
                return;
            }
            cell.count++;
        }

        this.movesLeft--;
        this.audio.playSelect();
        this.emit();

        // Check for avalanche
        if (cell && cell.count >= CRITICAL_MASS) {
            await this.processAvalanche();
        } else {
            this.checkWinLoss();
        }
    }

    async processAvalanche() {
        this.isProcessing = true;
        let unstable = true;
        let iterations = 0;

        while (unstable && iterations < 50) { // Limit to prevent infinite loops
            unstable = false;
            const topples: {x: number, y: number}[] = [];

            // 1. Identify unstable cells
            for(let x=0; x<this.width; x++) {
                for(let y=0; y<this.height; y++) {
                    const cell = this.grid.get(x, y);
                    if (cell && cell.count >= CRITICAL_MASS) {
                        topples.push({x, y});
                    }
                }
            }

            if (topples.length > 0) {
                unstable = true;
                this.audio.playMove(); // Rumble sound
                
                // 2. Process topples
                for (const t of topples) {
                    const cell = this.grid.get(t.x, t.y);
                    if (!cell) continue;
                    cell.count -= 4;
                    
                    // Break Ice
                    if (cell.isIce) {
                        cell.isIce = false;
                        this.audio.playMatch();
                        this.effects$.next({ type: 'EXPLODE', x: t.x, y: t.y, color: 0x00ffff, style: 'EXPLODE' });
                    }

                    // Distribute to neighbors
                    const neighbors = [
                        {x: t.x+1, y: t.y}, {x: t.x-1, y: t.y},
                        {x: t.x, y: t.y+1}, {x: t.x, y: t.y-1}
                    ];

                    for (const n of neighbors) {
                        if (n.x >= 0 && n.x < this.width && n.y >= 0 && n.y < this.height) {
                            const nCell = this.grid.get(n.x, n.y);
                            if (nCell) nCell.count++;
                        }
                    }
                }

                this.emit();
                await new Promise(r => setTimeout(r, 200)); // Visual delay
            }
            iterations++;
        }

        this.isProcessing = false;
        this.checkWinLoss();
    }

    checkWinLoss() {
        // Check if any ice remains
        let iceRemaining = 0;
        this.grid.forEach(cell => {
            if (cell.isIce) iceRemaining++;
        });

        if (iceRemaining === 0) {
            this.isGameOver = true;
            this.status$.next(`Avalanche! Level ${this.level} Cleared`);
            this.effects$.next({ type: 'PARTICLE', x: 3, y: 3, color: 0x00ff00, style: 'CONFETTI' });
            setTimeout(() => { this.level++; this.startLevel(); }, 2000);
        } else if (this.movesLeft === 0) {
            this.isGameOver = true;
            this.status$.next('Out of Moves! Press SELECT');
            this.audio.playGameOver();
        } else {
            this.status$.next(`Ice: ${iceRemaining} | Moves: ${this.movesLeft}`);
        }
    }

    emit() {
        const items: GameItem[] = [];
        this.grid.forEach((cell, x, y) => {
            // Floor (Ice or Normal)
            let floorColor = cell.isIce ? 0x00FFFF : 0x222222;

            // Cursor Highlight (Pipe Maze Style)
            if (!this.isGameOver && x === this.interaction.cursor.x && y === this.interaction.cursor.y) {
                // If Ice, tint Red to indicate locked. If Floor, brighten to indicate selection.
                floorColor = cell.isIce ? 0xFF4444 : 0x555555;
            }

            items.push({ 
                id: `f_${x}_${y}`, 
                x, y, 
                type: cell.isIce ? TYPE_ICE : TYPE_FLOOR, 
                color: floorColor,
                opacity: cell.isIce ? 0.6 : 1.0
            });

            // Grains (Single growing mass)
            if (cell.count > 0) {
                let color = 0x00FF00;
                let scale = 0.5;
                let radius = 0.15;

                if (cell.count === 2) {
                    color = 0xFFFF00;
                    scale = 0.8;
                    radius = 0.24;
                } else if (cell.count >= 3) {
                    color = 0xFF0000;
                    scale = 1.1;
                    radius = 0.33;
                }

                // Sit on floor (Floor top is at z=0.1)
                const z = 0.1 + radius;
                items.push({ id: `g_${x}_${y}_${cell.count}`, x, y, z, type: TYPE_GRAIN, color, scale });
            }
        });

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'cylinder' as const,
            colors: {
                0: 0x222222, // Floor
                1: 0x00FFFF, // Ice (Cyan)
                2: 0x00FF00, // Grain
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === TYPE_FLOOR || type === TYPE_ICE) return new THREE.BoxGeometry(0.95, 0.95, 0.2);
                if (type === TYPE_GRAIN) return new THREE.SphereGeometry(0.3, 16, 16);
                return null;
            }
        }
    }
}