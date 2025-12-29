// src/games/Reflector.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TYPE_FLOOR = 0;
const TYPE_WALL = 1;
const TYPE_EMITTER = 2;
const TYPE_RECEIVER = 3;
const TYPE_MIRROR_A = 4; // /
const TYPE_MIRROR_B = 5; // \
const TYPE_BEAM = 6;

interface Cell {
    type: number;
    fixed: boolean; // Cannot be removed (Walls, Emitter, Receiver)
    dir?: {x: number, y: number}; // For Emitter
}

export default class Reflector extends GameModel {
    grid!: Grid<Cell>;
    interaction: GridCursorInteraction;
    level = 1;
    mirrorsLeft = 0;
    beamPath: {x: number, y: number}[] = [];
    
    constructor(audio?: SoundEmitter) {
        super(10, 10, 'reflector', audio);
        this.grid = new Grid(10, 10, () => ({ type: TYPE_FLOOR, fixed: false }));
        this.interaction = new GridCursorInteraction({
            width: 10,
            height: 10,
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
        this.beamPath = [];
        this.interaction.cursor = { x: 5, y: 5 };
        
        // Init Grid
        this.grid = new Grid(this.width, this.height, () => ({ type: TYPE_FLOOR, fixed: false }));

        this.generateLevel();
        this.calculateBeam();
        
        this.status$.next(`Lv ${this.level}: Mirrors: ${this.mirrorsLeft}`);
        this.emit();
    }

    generateLevel() {
        // 1. Generate a complex valid path
        let attempts = 0;
        let bestPath: any = null;
        const minTurns = 3 + Math.floor(this.level * 0.6); // Harder: starts at 3, increases quickly
        
        while (attempts < 100) {
            attempts++;
            
            let cx = Math.floor(Math.random() * (this.width - 2)) + 1;
            let cy = Math.floor(Math.random() * (this.height - 2)) + 1;
            const startX = cx;
            const startY = cy;
            
            const dirs = [{x:1, y:0}, {x:-1, y:0}, {x:0, y:1}, {x:0, y:-1}];
            let dir = dirs[Math.floor(Math.random() * dirs.length)];
            const startDir = { ...dir };

            const pathCells = new Set<string>();
            pathCells.add(`${cx},${cy}`);

            let turns = 0;
            const maxSteps = 25 + this.level * 3;
            let steps = 0;

            while (steps < maxSteps) {
                cx += dir.x;
                cy += dir.y;
                steps++;

                // Check bounds AND self-intersection
                // If we hit the edge OR a cell we've already visited, stop the path here.
                if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height || pathCells.has(`${cx},${cy}`)) {
                    cx -= dir.x;
                    cy -= dir.y;
                    break;
                }

                pathCells.add(`${cx},${cy}`);

                // Randomly turn with higher probability
                if (Math.random() < 0.35 && steps > 1) {
                    if (dir.x !== 0) {
                        dir = Math.random() > 0.5 ? {x:0, y:1} : {x:0, y:-1};
                    } else {
                        dir = Math.random() > 0.5 ? {x:1, y:0} : {x:-1, y:0};
                    }
                    turns++;
                }
            }

            const result = { startX, startY, startDir, endX: cx, endY: cy, turns, pathCells };
            
            if (!bestPath || turns > bestPath.turns) {
                bestPath = result;
            }
            
            if (turns >= minTurns) {
                break;
            }
        }

        // Apply best path found
        const res = bestPath;
        
        // Place Emitter
        this.grid.set(res.startX, res.startY, { type: TYPE_EMITTER, fixed: true, dir: res.startDir });

        // Place Receiver at end of path
        this.grid.set(res.endX, res.endY, { type: TYPE_RECEIVER, fixed: true });

        // 2. Set Inventory
        // Give exactly enough mirrors for the turns generated (No buffer)
        this.mirrorsLeft = res.turns;

        // 3. Place Walls (Noise)
        const wallCount = 15 + this.level * 4;
        let placedWalls = 0;
        let wallAttempts = 0;
        while(placedWalls < wallCount && wallAttempts < 2000) {
            wallAttempts++;
            const wx = Math.floor(Math.random() * this.width);
            const wy = Math.floor(Math.random() * this.height);
            
            const cell = this.grid.get(wx, wy);
            if (cell && !res.pathCells.has(`${wx},${wy}`) && cell.type === TYPE_FLOOR) {
                this.grid.set(wx, wy, { type: TYPE_WALL, fixed: true });
                placedWalls++;
            }
        }
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction(x: number, y: number) {
        const cell = this.grid.get(x, y);
        
        if (cell.fixed) {
            this.audio.playTone(150, 'sawtooth', 0.1);
            return;
        }

        if (cell.type === TYPE_FLOOR) {
            // Place Mirror A
            if (this.mirrorsLeft > 0) {
                cell.type = TYPE_MIRROR_A;
                this.mirrorsLeft--;
                this.audio.playSelect();
            } else {
                this.audio.playTone(150, 'sawtooth', 0.1);
                this.status$.next("No mirrors left!");
            }
        } else if (cell.type === TYPE_MIRROR_A) {
            // Rotate to Mirror B
            cell.type = TYPE_MIRROR_B;
            this.audio.playMove();
        } else if (cell.type === TYPE_MIRROR_B) {
            // Remove
            cell.type = TYPE_FLOOR;
            this.mirrorsLeft++;
            this.audio.playMove();
        }

        this.calculateBeam();
        this.status$.next(`Lv ${this.level}: Mirrors: ${this.mirrorsLeft}`);
    }

    calculateBeam() {
        this.beamPath = [];
        
        // Find Emitter
        let ex = -1, ey = -1, dir = {x:0, y:0};
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
            const cell = this.grid.get(x, y);
            if (cell && cell.type === TYPE_EMITTER) {
                ex = x; ey = y;
                dir = { ...cell.dir! };
            }
        }

        if (ex === -1) return;

        // Trace
        let curr = {x: ex, y: ey};
        this.beamPath.push({...curr});

        let steps = 0;
        while(steps < 100) {
            curr.x += dir.x;
            curr.y += dir.y;
            steps++;

            // Bounds check
            if (curr.x < 0 || curr.x >= this.width || curr.y < 0 || curr.y >= this.height) break;

            this.beamPath.push({...curr});
            const cell = this.grid.get(curr.x, curr.y);

            if (cell.type === TYPE_WALL || cell.type === TYPE_EMITTER) {
                break; // Stop
            } else if (cell.type === TYPE_RECEIVER) {
                // Win!
                this.handleWin();
                break;
            } else if (cell.type === TYPE_MIRROR_A) {
                // Reflect / : Swap x/y
                // (1,0) -> (0,1) | (-1,0) -> (0,-1) | (0,1) -> (1,0) | (0,-1) -> (-1,0)
                const oldX = dir.x;
                dir.x = dir.y;
                dir.y = oldX;
            } else if (cell.type === TYPE_MIRROR_B) {
                // Reflect \ : Swap and Negate
                // (1,0) -> (0,-1) | (-1,0) -> (0,1) | (0,1) -> (-1,0) | (0,-1) -> (1,0)
                const oldX = dir.x;
                dir.x = -dir.y;
                dir.y = -oldX;
            }
        }
    }

    handleWin() {
        this.isGameOver = true;
        this.status$.next("TARGET LIT! Level Complete");
        this.audio.playMatch();
        this.effects$.next({ type: 'PARTICLE', x: this.beamPath[this.beamPath.length-1].x, y: this.beamPath[this.beamPath.length-1].y, color: 0x00FF00, style: 'CONFETTI' });
        setTimeout(() => { this.level++; this.startLevel(); }, 2000);
    }

    emit() {
        const items: GameItem[] = [];

        this.grid.forEach((cell, x, y) => {
            // Floor
            let color = 0x222222;
            if (!this.isGameOver && x === this.interaction.cursor.x && y === this.interaction.cursor.y) {
                color = 0x444444;
            }
            items.push({ id: `f_${x}_${y}`, x, y, type: TYPE_FLOOR, color });

            if (cell.type !== TYPE_FLOOR) {
                let rot = {x:0, y:0, z:0};
                if (cell.type === TYPE_MIRROR_A) rot.z = -Math.PI / 4;
                if (cell.type === TYPE_MIRROR_B) rot.z = Math.PI / 4;
                
                items.push({ id: `obj_${x}_${y}`, x, y, type: cell.type, rotation: rot });
            }
        });

        // Render Beam
        this.beamPath.forEach((p, i) => {
            items.push({ id: `beam_${i}`, x: p.x, y: p.y, type: TYPE_BEAM });
        });

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: { 0: 0x222222, 1: 0x555555, 2: 0x0000FF, 3: 0x00FF00, 4: 0xAAAAAA, 5: 0xAAAAAA, 6: 0xFF0000 },
            bgColor: 0x000000,
            customGeometry: (type: number) => {
                if (type === TYPE_FLOOR) return new THREE.BoxGeometry(0.95, 0.95, 0.1);
                if (type === TYPE_WALL) return new THREE.BoxGeometry(0.9, 0.9, 0.8);
                if (type === TYPE_EMITTER) return new THREE.BoxGeometry(0.6, 0.6, 0.6);
                if (type === TYPE_RECEIVER) return new THREE.SphereGeometry(0.4);
                if (type === TYPE_MIRROR_A || type === TYPE_MIRROR_B) return new THREE.BoxGeometry(0.1, 0.8, 0.6);
                if (type === TYPE_BEAM) return new THREE.SphereGeometry(0.15);
                return null;
            }
        }
    }
}