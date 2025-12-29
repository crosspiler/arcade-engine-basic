// src/games/Singularity.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TYPE_FLOOR = 0;
const TYPE_MATTER = 1;
const TYPE_ANTIMATTER = 2;
const TYPE_SINGULARITY = 3;
const TYPE_WALL = 4;

interface Particle {
    type: typeof TYPE_MATTER | typeof TYPE_ANTIMATTER;
    mass: number;
    id: string;
}

export default class Singularity extends GameModel {
    grid!: Grid<Particle | null>;
    walls!: Grid<boolean>;
    interaction: GridCursorInteraction;
    level = 1;
    moves = 0;
    maxMoves = 0;
    singularityPos: {x: number, y: number} | null = null;
    isProcessing = false;

    constructor(audio?: SoundEmitter) {
        super(9, 9, 'singularity', audio);
        this.grid = new Grid(9, 9, null);
        this.walls = new Grid(9, 9, false);
        this.interaction = new GridCursorInteraction({
            width: 9,
            height: 9,
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
        this.singularityPos = null;
        this.moves = 0;
        // Stricter move limit to force efficiency
        this.maxMoves = 3 + Math.floor(this.level / 3);
        this.interaction.cursor = { x: 4, y: 4 };

        // Retry loop to ensure valid level generation
        let success = false;
        let attempts = 0;
        let wallScale = 1.0;

        while (!success && attempts < 50) {
            attempts++;
            this.grid = new Grid(this.width, this.height, null);
            this.walls = new Grid(this.width, this.height, false);
            
            // Reduce wall density if generation fails repeatedly
            if (attempts > 10) wallScale = 0.8;
            if (attempts > 20) wallScale = 0.6;
            if (attempts > 30) wallScale = 0.4;

            this.generateWalls(wallScale);
            success = this.placeParticles(true); // Try with connectivity check
        }

        // Ultimate fallback: If structured generation fails, use simplified layout
        if (!success) {
            this.grid = new Grid(this.width, this.height, null);
            this.walls = new Grid(this.width, this.height, false);
            
            // Generate minimal walls (just noise) to avoid empty room
            const fallbackObstacles = Math.max(3, Math.floor(this.level * 1.5));
            for(let i=0; i<fallbackObstacles; i++) {
                 const x = Math.floor(Math.random() * this.width);
                 const y = Math.floor(Math.random() * this.height);
                 this.walls.set(x, y, true);
            }
            
            // Try connectivity check on this simple layout
            if (!this.placeParticles(true)) {
                // If even simple layout fails (extremely unlikely), force placement
                this.placeParticles(false);
            }
        }

        this.status$.next(`Lv ${this.level}: Merge All! Moves: ${this.maxMoves}`);
        this.emit();
    }

    generateWalls(scale: number = 1.0) {
        // Structured walls: Lines (Horizontal/Vertical) to create barriers
        const numLines = Math.floor((2 + Math.floor(this.level / 2)) * scale);
        for(let i=0; i<numLines; i++) {
            const horizontal = Math.random() > 0.5;
            const len = Math.floor(Math.random() * 4) + 2;
            let x = Math.floor(Math.random() * this.width);
            let y = Math.floor(Math.random() * this.height);
            
            for(let j=0; j<len; j++) {
                if (x < this.width && y < this.height) {
                    this.walls.set(x, y, true);
                }
                if (horizontal) x++; else y++;
            }
        }
        
        // Add some random noise walls for complexity
        const noise = Math.floor(this.level * scale);
        for(let i=0; i<noise; i++) {
             const x = Math.floor(Math.random() * this.width);
             const y = Math.floor(Math.random() * this.height);
             this.walls.set(x, y, true);
        }
    }

    placeParticles(checkConnectivity: boolean): boolean {
        // 1. Identify Connected Components of empty space
        const visited = new Set<string>();
        const components: {x:number, y:number}[][] = [];

        for(let x=0; x<this.width; x++) {
            for(let y=0; y<this.height; y++) {
                if (!this.walls.get(x, y) && !visited.has(`${x},${y}`)) {
                    const comp: {x:number, y:number}[] = [];
                    const queue = [{x, y}];
                    visited.add(`${x},${y}`);
                    
                    while(queue.length > 0) {
                        const curr = queue.shift()!;
                        comp.push(curr);
                        
                        const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                        for(const d of dirs) {
                            const nx = curr.x + d.x;
                            const ny = curr.y + d.y;
                            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                                if (!this.walls.get(nx, ny) && !visited.has(`${nx},${ny}`)) {
                                    visited.add(`${nx},${ny}`);
                                    queue.push({x: nx, y: ny});
                                }
                            }
                        }
                    }
                    components.push(comp);
                }
            }
        }

        // 2. Pick largest component to ensure all particles are reachable
        const matterCount = 3 + this.level;
        const antiCount = Math.floor(this.level / 3);
        const totalNeeded = matterCount + antiCount;

        let validCells: {x:number, y:number}[] = [];

        if (checkConnectivity) {
            components.sort((a, b) => b.length - a.length);
            const largest = components[0];
            if (!largest || largest.length < totalNeeded + 2) return false; // Not enough space
            validCells = largest;
        } else {
            // Fallback: Use all empty cells
            for(let x=0; x<this.width; x++) {
                for(let y=0; y<this.height; y++) {
                    if (!this.walls.get(x, y)) validCells.push({x, y});
                }
            }
            if (validCells.length < totalNeeded) return false; // Should be impossible on 9x9
        }

        // 3. Place particles
        // Shuffle positions
        for (let i = validCells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validCells[i], validCells[j]] = [validCells[j], validCells[i]];
        }

        let idx = 0;
        for(let i=0; i<matterCount; i++) {
            if (idx >= validCells.length) break;
            const p = validCells[idx++];
            this.grid.set(p.x, p.y, { type: TYPE_MATTER, mass: 1, id: this.uid() });
        }
        for(let i=0; i<antiCount; i++) {
            if (idx >= validCells.length) break;
            const p = validCells[idx++];
            this.grid.set(p.x, p.y, { type: TYPE_ANTIMATTER, mass: 1, id: this.uid() });
        }

        return true;
    }

    handleInput(action: InputAction) {
        if (this.isProcessing) return;
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    async handleAction(x: number, y: number) {
        if (this.moves >= this.maxMoves) {
            this.audio.playTone(150, 'sawtooth', 0.1);
            return;
        }

        if (this.grid.get(x, y) || this.walls.get(x, y)) {
            this.audio.playTone(150, 'sawtooth', 0.1); // Cannot place on existing object
            return;
        }

        // Place Singularity
        this.singularityPos = {x, y};
        this.moves++;
        this.audio.playSelect(); // Sci-fi activation sound ideally
        this.emit();

        await this.processGravity(x, y);
        
        this.singularityPos = null;
        this.checkWinLoss();
        this.emit();
    }

    async processGravity(sx: number, sy: number) {
        this.isProcessing = true;
        let moved = true;

        // Pull everything towards (sx, sy) step by step
        while (moved) {
            moved = false;
            const moves: {fromX: number, fromY: number, toX: number, toY: number}[] = [];

            // 1. Calculate desired moves for all particles
            for(let x=0; x<this.width; x++) {
                for(let y=0; y<this.height; y++) {
                    if (this.grid.get(x, y)) {
                        // Determine direction to singularity
                        const dx = Math.sign(sx - x);
                        const dy = Math.sign(sy - y);
                        
                        if (dx !== 0 || dy !== 0) {
                            moves.push({fromX: x, fromY: y, toX: x + dx, toY: y + dy});
                        }
                    }
                }
            }

            // 2. Sort moves by distance to singularity (closest moves first to prevent overlapping logic)
            moves.sort((a, b) => {
                const distA = Math.abs(a.toX - sx) + Math.abs(a.toY - sy);
                const distB = Math.abs(b.toX - sx) + Math.abs(b.toY - sy);
                return distA - distB;
            });

            // 3. Execute moves
            for (const m of moves) {
                const p = this.grid.get(m.fromX, m.fromY);
                if (!p) continue; // Already moved/merged in this step

                // Check collision
                if (this.walls.get(m.toX, m.toY)) {
                    // Hit wall, stop
                    continue;
                }

                const target = this.grid.get(m.toX, m.toY);

                if (!target) {
                    // Move into empty space
                    this.grid.set(m.toX, m.toY, p);
                    this.grid.set(m.fromX, m.fromY, null);
                    moved = true;
                } else {
                    // Collision!
                    if (target.type !== p.type) {
                        // Annihilation (Matter + Antimatter)
                        this.grid.set(m.toX, m.toY, null);
                        this.grid.set(m.fromX, m.fromY, null);
                        this.effects$.next({ type: 'EXPLODE', x: m.toX, y: m.toY, color: 0xFFFFFF, style: 'EXPLODE' });
                        this.audio.playMatch();
                        moved = true;
                    } else {
                        // Fusion (Matter + Matter)
                        target.mass += p.mass;
                        this.grid.set(m.fromX, m.fromY, null);
                        this.effects$.next({ type: 'PARTICLE', x: m.toX, y: m.toY, color: 0x00FFFF, style: 'PUFF' });
                        this.audio.playMove();
                        moved = true;
                    }
                }
            }

            if (moved) {
                this.emit();
                await new Promise(r => setTimeout(r, 100)); // Fast, fluid animation
            }
        }
        this.isProcessing = false;
    }

    checkWinLoss() {
        let count = 0;
        this.grid.forEach(p => {
            if (p) count++;
        });

        if (count <= 1) {
            this.isGameOver = true;
            this.status$.next(`Singularity Achieved!`);
            this.effects$.next({ type: 'PARTICLE', x: 4, y: 4, color: 0xFF00FF, style: 'CONFETTI' });
            setTimeout(() => { this.level++; this.startLevel(); }, 2000);
        } else if (this.moves >= this.maxMoves) {
            this.isGameOver = true;
            this.status$.next('Entropy Won (No Moves)');
            this.audio.playGameOver();
        } else {
            this.status$.next(`Particles: ${count} | Moves: ${this.maxMoves - this.moves}`);
        }
    }

    emit() {
        const items: GameItem[] = [];
        this.grid.forEach((p, x, y) => {
            // Floor
            items.push({ id: `f_${x}_${y}`, x, y, type: TYPE_FLOOR, color: 0x111111 });

            if (this.walls.get(x, y)) {
                // Lift walls to sit on top of floor (Floor top is ~0.05, Wall height 0.5)
                items.push({ id: `w_${x}_${y}`, x, y, z: 0.25, type: TYPE_WALL, color: 0x444444 });
            }

            if (p) {
                // Scale based on mass
                const scale = Math.min(1.5, 0.5 + (p.mass * 0.1));
                const color = p.type === TYPE_MATTER ? 0x00FFFF : 0xFF0055;
                
                // Lift particles to ensure visibility (z=0.3 ensures they float well above floor)
                const z = 0.3;
                items.push({ id: p.id, x, y, z, type: p.type, color, scale });
            }
        });

        if (this.singularityPos) {
            // Lift Singularity sphere
            items.push({ id: 'singularity', x: this.singularityPos.x, y: this.singularityPos.y, z: 0.5, type: TYPE_SINGULARITY, scale: 1.2 });
        } else if (!this.isGameOver) {
            // Lift Cursor ring
            items.push({ id: 'cursor', x: this.interaction.cursor.x, y: this.interaction.cursor.y, z: 0.1, type: 100 });
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                0: 0x111111, // Floor
                1: 0x00FFFF, // Matter (Cyan)
                2: 0xFF0055, // Antimatter (Pink)
                3: 0xFFFFFF, // Singularity (White)
                4: 0x444444, // Wall
                100: 0x888888 // Cursor
            },
            bgColor: 0x000000,
            customGeometry: (type: number) => {
                if (type === TYPE_FLOOR) return new THREE.BoxGeometry(0.95, 0.95, 0.1);
                if (type === TYPE_MATTER) return new THREE.SphereGeometry(0.35, 16, 16);
                if (type === TYPE_ANTIMATTER) return new THREE.SphereGeometry(0.35, 16, 16); // Differentiate by color for now
                if (type === TYPE_SINGULARITY) return new THREE.SphereGeometry(0.4, 16, 16);
                if (type === TYPE_WALL) return new THREE.BoxGeometry(0.9, 0.9, 0.5);
                if (type === 100) return new THREE.RingGeometry(0.3, 0.4, 4);
                return null;
            }
        }
    }
}