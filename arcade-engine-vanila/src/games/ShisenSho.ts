// src/games/ShisenSho.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

// Using Mahjong Connect (Shisen-Sho) rules as they fit the 2D grid engine best.

const EMPTY = 0;
const CURSOR = 100;
const SELECTED = 101;
const PATH = 102;

// Tile types 1-16
const NUM_TILE_TYPES = 16;

export default class ShisenSho extends GameModel {
    grid!: Grid<number>;
    selected: {x: number, y: number} | null = null;
    matches = 0;
    totalPairs = 0;
    pathPoints: {x: number, y: number}[] = [];
    pathTimer: any;
    level = 1;
    interaction: GridCursorInteraction;
    
    constructor(audio?: SoundEmitter) {
        // Start small: 6x6 grid (4x4 playable)
        super(6, 6, 'shisensho', audio);
        this.grid = new Grid(6, 6, EMPTY);
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
        // Gradual expansion: 4x4, 6x4, 6x6, 8x6, 8x8...
        // Ensures total tiles is always even.
        const playableW = Math.min(16, 4 + 2 * Math.floor(this.level / 2));
        const playableH = Math.min(16, 4 + 2 * Math.floor((this.level - 1) / 2));
        
        this.width = playableW + 2;
        this.height = playableH + 2;
        this.interaction.updateConfig({ width: this.width, height: this.height });

        this.isGameOver = false;
        this.matches = 0;
        this.selected = null;
        this.interaction.cursor = {x: 1, y: 1};
        this.pathPoints = [];
        
        // Retry generation until solvable
        let attempts = 0;
        while(attempts < 50) {
            this.generateGrid();
            if (this.checkSolvability()) {
                break;
            }
            attempts++;
        }
        if (attempts >= 50) {
            console.warn("Could not generate solvable level, using last attempt");
        }

        this.status$.next(`Lv ${this.level}: Connect pairs`);
        this.emit();
    }

    generateGrid() {
        // Initialize grid with border
        this.grid = new Grid(this.width, this.height, (x, y) => {
            if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
                return EMPTY; // Border is empty for pathing
            } else {
                return -1; // Placeholder
            }
        });

        // Generate Tiles
        const playableWidth = this.width - 2;
        const playableHeight = this.height - 2;
        const totalTiles = playableWidth * playableHeight;
        this.totalPairs = totalTiles / 2;

        const tiles: number[] = [];
        for (let i = 0; i < this.totalPairs; i++) {
            const type = (i % NUM_TILE_TYPES) + 1;
            tiles.push(type);
            tiles.push(type);
        }
        
        // Shuffle
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }

        // Fill Grid
        let idx = 0;
        for(let x=1; x<this.width-1; x++) {
            for(let y=1; y<this.height-1; y++) {
                this.grid.set(x, y, tiles[idx++]);
            }
        }
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction(cx: number, cy: number) {
        const tile = this.grid.get(cx, cy);

        if (tile === EMPTY) return;

        if (!this.selected) {
            this.selected = {x: cx, y: cy};
            this.audio.playSelect();
        } else {
            if (this.selected.x === cx && this.selected.y === cy) {
                // Deselect
                this.selected = null;
            } else {
                const selectedTile = this.grid.get(this.selected.x, this.selected.y);
                if (selectedTile === tile) {
                    // Find path
                    const path = this.findPath(this.selected.x, this.selected.y, cx, cy);
                    if (path) {
                        // Match!
                        this.grid.set(this.selected.x, this.selected.y, EMPTY);
                        this.grid.set(cx, cy, EMPTY);
                        this.matches++;
                        this.selected = null;
                        this.audio.playMatch();
                        
                        // Show path briefly
                        this.pathPoints = path;
                        if (this.pathTimer) clearTimeout(this.pathTimer);
                        this.pathTimer = setTimeout(() => { this.pathPoints = []; this.emit(); }, 500);
                        this.emit();
                        
                        if (this.matches >= this.totalPairs) {
                            this.handleWin();
                        }
                    } else {
                        this.audio.playGameOver(); // Error sound
                        this.status$.next('No path!');
                        this.selected = null;
                    }
                } else {
                    // Mismatch
                    this.selected = {x: cx, y: cy}; // Switch selection
                    this.audio.playSelect();
                }
            }
        }
    }

    // BFS for path with max 2 turns (3 segments)
    findPath(x1: number, y1: number, x2: number, y2: number, grid: Grid<number> = this.grid): {x: number, y: number}[] | null {
        // Queue: [x, y, direction (-1 start), turns, parentIndex]
        const queue: number[][] = [[x1, y1, -1, 0]];
        const visited = new Set<string>();
        
        // Directions: 0:Up, 1:Right, 2:Down, 3:Left
        const dx = [0, 1, 0, -1];
        const dy = [1, 0, -1, 0];

        // To reconstruct path
        const parents: Record<string, string> = {}; // key -> parentKey

        let head = 0;
        while(head < queue.length) {
            const [cx, cy, cDir, cTurns] = queue[head++];
            const currentKey = `${cx},${cy},${cDir},${cTurns}`;

            if (cx === x2 && cy === y2) {
                // Reconstruct
                const path = [{x: cx, y: cy}];
                let curr = currentKey;
                while (parents[curr]) {
                    const pKey = parents[curr];
                    const [px, py] = pKey.split(',').map(Number);
                    path.unshift({x: px, y: py});
                    curr = pKey;
                }
                return path;
            }

            for(let i=0; i<4; i++) {
                // Don't reverse
                if (cDir !== -1 && Math.abs(cDir - i) === 2) continue;

                const newTurns = (cDir !== -1 && cDir !== i) ? cTurns + 1 : cTurns;
                
                if (newTurns > 2) continue;

                const nx = cx + dx[i];
                const ny = cy + dy[i];

                // Bounds
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

                // Collision (must be empty or target)
                if (grid.get(nx, ny) !== EMPTY && (nx !== x2 || ny !== y2)) continue;

                const key = `${nx},${ny},${i},${newTurns}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    parents[key] = currentKey;
                    queue.push([nx, ny, i, newTurns]);
                }
            }
        }
        return null;
    }

    checkSolvability() {
        // Clone grid
        const tempGrid = this.grid.clone();
        let pairsFound = 0;
        const total = this.totalPairs;
        
        // Greedy solver loop
        let changed = true;
        while(changed && pairsFound < total) {
            changed = false;
            
            // Find all remaining tiles
            const tiles: {x: number, y: number, type: number}[] = [];
            for(let x=1; x<this.width-1; x++) {
                for(let y=1; y<this.height-1; y++) {
                    const val = tempGrid.get(x, y);
                    if (val !== undefined && val !== EMPTY) {
                        tiles.push({x, y, type: val});
                    }
                }
            }

            // Group by type
            const byType: Record<number, {x:number, y:number}[]> = {};
            for(const t of tiles) {
                if(!byType[t.type]) byType[t.type] = [];
                byType[t.type].push(t);
            }

            for(const type in byType) {
                const positions = byType[type];
                if (positions.length < 2) continue;

                // Check all combinations of this type
                for(let i=0; i<positions.length; i++) {
                    for(let j=i+1; j<positions.length; j++) {
                        const p1 = positions[i];
                        const p2 = positions[j];
                        
                        // Check path on tempGrid
                        if (this.findPath(p1.x, p1.y, p2.x, p2.y, tempGrid)) {
                            // Remove pair
                            tempGrid.set(p1.x, p1.y, EMPTY);
                            tempGrid.set(p2.x, p2.y, EMPTY);
                            pairsFound++;
                            changed = true;
                            break; 
                        }
                    }
                    if(changed) break;
                }
                if(changed) break;
            }
        }
        
        return pairsFound === total;
    }

    handleWin() {
        this.isGameOver = true;
        this.status$.next('CLEARED! Level Up!');
        this.effects$.next({ type: 'PARTICLE', x: this.width/2, y: this.height/2, color: 0xFFD700, style: 'CONFETTI' });
        setTimeout(() => {
            this.level++;
            this.startLevel();
        }, 2000);
    }

    emit() {
        const items: GameItem[] = [];

        this.grid.forEach((t, x, y) => {
            if (t !== EMPTY) {
                items.push({ id: `t_${x}_${y}`, x, y, type: t });
            }
        });

        // Selection Highlight
        if (this.selected) {
            items.push({ id: 'sel', x: this.selected.x, y: this.selected.y, type: SELECTED, scale: 1.1 });
        }

        // Cursor
        if (!this.isGameOver) {
            items.push({ id: 'cursor', x: this.interaction.cursor.x, y: this.interaction.cursor.y, type: CURSOR, z: 0 } as any);
        }

        // Path Visualization
        this.pathPoints.forEach((p, i) => {
            items.push({ id: `path_${i}`, x: p.x, y: p.y, type: PATH, scale: 0.5 });
        });

        this.state$.next(items);
    }

    getRenderConfig() {
        const colors: Record<number, number> = {
            100: 0xFFFFFF, // Cursor
            101: 0xFFD700, // Selected (Gold)
            102: 0x00FF00, // Path (Green)
        };
        
        // Generate colors for tiles
        const baseColors = [
            0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 
            0x00FFFF, 0xFF00FF, 0xC0C0C0, 0x800000,
            0x808000, 0x008000, 0x800080, 0x008080,
            0x000080, 0xFFA500, 0xA52A2A, 0xDEB887
        ];

        for(let i=1; i<=NUM_TILE_TYPES; i++) {
            colors[i] = baseColors[(i-1) % baseColors.length];
        }

        return {
            geometry: 'box' as const,
            colors,
            bgColor: 0x222222,
            customGeometry: (type: number) => {
                if (type === CURSOR) return new THREE.BoxGeometry(0.9, 0.9, 0.2);
                if (type === SELECTED) return new THREE.BoxGeometry(0.9, 0.9, 0.2);
                if (type === PATH) return new THREE.SphereGeometry(0.2);
                if (type >= 1 && type <= NUM_TILE_TYPES) return new THREE.BoxGeometry(0.8, 0.8, 0.6); // Thicker tiles (0.6)
                return null;
            }
        }
    }
}