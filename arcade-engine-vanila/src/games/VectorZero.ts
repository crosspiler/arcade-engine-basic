// src/games/VectorZero.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TYPE_FLOOR = 0;
const TYPE_VECTOR = 1;
const TYPE_OBSTACLE = 2;

interface TileData {
    type: typeof TYPE_VECTOR | typeof TYPE_OBSTACLE;
    vx: number;
    vy: number;
    id: string;
}

export default class VectorZero extends GameModel {
    grid!: Grid<TileData | null>;
    interaction: GridCursorInteraction;
    level = 1;
    moves = 0;

    constructor(audio?: SoundEmitter) {
        super(8, 8, 'vectorzero', audio);
        this.grid = new Grid(8, 8, null);
        this.interaction = new GridCursorInteraction({
            width: 8,
            height: 8,
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
        this.moves = 0;
        this.interaction.cursor = { x: 3, y: 3 };
        
        // Grid size grows with level
        const size = Math.min(10, 6 + Math.floor((this.level - 1) / 2));
        this.width = size;
        this.height = size;
        this.interaction.updateConfig({ width: size, height: size });

        this.generateLevel();
        
        this.status$.next(`Level ${this.level}: Zero out vectors`);
        this.emit();
    }

    generateLevel() {
        this.grid = new Grid(this.width, this.height, null);
        
        // Number of pairs increases with level
        const targetChains = 2 + Math.floor(this.level / 2);
        const obstacleCount = Math.floor(this.width * this.height * 0.05) + Math.floor(this.level / 2);
        
        // 1. Place Obstacles
        let placedObs = 0;
        while (placedObs < obstacleCount) {
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);
            if (!this.grid.get(x, y)) {
                this.grid.set(x, y, { type: TYPE_OBSTACLE, vx: 0, vy: 0, id: this.uid() });
                placedObs++;
            }
        }

        // 2. Place Chains
        let placedChains = 0;
        let attempts = 0;

        while (placedChains < targetChains && attempts < 5000) {
            attempts++;
            
            // Determine chain length (number of vectors involved)
            // Min 2 (Pair), Max increases with level (longer is better!)
            const maxLen = Math.min(6, 2 + Math.floor(this.level / 2));
            const len = Math.floor(Math.random() * (maxLen - 1)) + 2; // 2 to maxLen

            // Generate a path of positions P_0 to P_{len-1}
            const path: {x: number, y: number}[] = [];
            
            // Pick Start P_0
            let currX = Math.floor(Math.random() * this.width);
            let currY = Math.floor(Math.random() * this.height);
            
            if (this.grid.get(currX, currY)) continue;
            path.push({x: currX, y: currY});

            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            let validPath = true;
            const segmentDirs: {x: number, y: number}[] = [];

            for (let i = 0; i < len - 1; i++) {
                // Pick direction (avoid immediate 180 reversal)
                const availableDirs = (i === 0) 
                    ? dirs 
                    : dirs.filter(d => !(d[0] === -segmentDirs[i-1].x && d[1] === -segmentDirs[i-1].y));
                
                const dir = availableDirs[Math.floor(Math.random() * availableDirs.length)];
                const dist = Math.floor(Math.random() * 3) + 1;
                
                // Check full path for obstacles/occupancy (Line of Sight)
                let pathClear = true;
                for(let k=1; k<=dist; k++) {
                    const cx = currX + dir[0] * k;
                    const cy = currY + dir[1] * k;
                    
                    // Bounds check
                    if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) {
                        pathClear = false; break;
                    }
                    // Grid check (Obstacles or existing vectors)
                    if (this.grid.get(cx, cy)) {
                        pathClear = false; break;
                    }
                    // Path self-intersection check
                    if (path.some(p => p.x === cx && p.y === cy)) {
                        pathClear = false; break;
                    }
                }

                if (pathClear) {
                    const nextX = currX + dir[0] * dist;
                    const nextY = currY + dir[1] * dist;
                    
                    path.push({x: nextX, y: nextY});
                    segmentDirs.push({x: dir[0], y: dir[1]});
                    currX = nextX;
                    currY = nextY;
                } else { 
                    validPath = false; 
                    break; 
                }
            }

            if (validPath && path.length === len) {
                // Place V_0
                this.grid.set(path[0].x, path[0].y, { type: TYPE_VECTOR, vx: segmentDirs[0].x, vy: segmentDirs[0].y, id: this.uid() });

                // Place Intermediates (V_i = U_i - U_{i-1})
                for (let i = 1; i < len - 1; i++) {
                    const uPrev = segmentDirs[i-1];
                    const uCurr = segmentDirs[i];
                    this.grid.set(path[i].x, path[i].y, { type: TYPE_VECTOR, vx: uCurr.x - uPrev.x, vy: uCurr.y - uPrev.y, id: this.uid() });
                }

                // Place Last (V_last = -U_last)
                const uLast = segmentDirs[len - 2];
                this.grid.set(path[len-1].x, path[len-1].y, { type: TYPE_VECTOR, vx: -uLast.x, vy: -uLast.y, id: this.uid() });

                placedChains++;
            }
        }
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction(x: number, y: number) {
        const tile = this.grid.get(x, y);
        if (!tile || tile.type !== TYPE_VECTOR) return;

        // Calculate target position based on vector direction
        let tx = x + tile.vx;
        let ty = y + tile.vy;
        
        // Raycast to find hit
        let hitX = -1;
        let hitY = -1;

        // Move until hit or wall
        while (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            const target = this.grid.get(tx, ty);
            if (target) {
                if (target.type === TYPE_OBSTACLE) {
                    // Hit obstacle - Invalid move (or stop? Let's say invalid for now to force planning)
                    break; 
                } else {
                    hitX = tx;
                    hitY = ty;
                    break;
                }
            }
            tx += tile.vx;
            ty += tile.vy;
        }

        if (hitX !== -1) {
            // Hit another tile -> Merge
            this.mergeTiles(x, y, hitX, hitY);
        } else {
            // Hit wall or Obstacle -> Invalid move
            this.audio.playTone(150, 'sawtooth', 0.1);
        }
    }

    mergeTiles(x1: number, y1: number, x2: number, y2: number) {
        const t1 = this.grid.get(x1, y1)!;
        const t2 = this.grid.get(x2, y2)!;

        // Calculate new vector
        const newVx = t1.vx + t2.vx;
        const newVy = t1.vy + t2.vy;

        this.moves++;

        // Remove source
        this.grid.set(x1, y1, null);

        if (newVx === 0 && newVy === 0) {
            // Annihilation!
            this.grid.set(x2, y2, null);
            this.audio.playMatch();
            this.effects$.next({ type: 'EXPLODE', x: x2, y: y2, color: 0x00ffff, style: 'EXPLODE' });
        } else {
            // Merge
            t2.vx = newVx;
            t2.vy = newVy;
            this.audio.playMove();
        }

        this.checkWin();
        this.emit();
    }

    checkWin() {
        let count = 0;
        this.grid.forEach((tile) => {
            if (tile && tile.type === TYPE_VECTOR) {
                count++;
            }
        });

        if (count === 0) {
            this.isGameOver = true;
            this.status$.next(`Zeroed Out! Level ${this.level} Done`);
            this.audio.playMatch();
            this.effects$.next({ type: 'PARTICLE', x: this.width/2, y: this.height/2, color: 0x00ff00, style: 'CONFETTI' });
            setTimeout(() => { this.level++; this.startLevel(); }, 2000);
        }
    }

    emit() {
        const items: GameItem[] = [];

        this.grid.forEach((t, x, y) => {
            // Floor Tile
            let color = 0x222222;
            
            // Highlight cursor position on the floor
            if (!this.isGameOver && x === this.interaction.cursor.x && y === this.interaction.cursor.y) {
                color = 0x444444; // Lighter grey for cursor
            }

            items.push({ id: `f_${x}_${y}`, x, y, type: TYPE_FLOOR, color });

            // Vector Tile
            if (t && t.type === TYPE_VECTOR) {
                // Calculate rotation from vector
                const angle = Math.atan2(t.vy, t.vx); // -PI to PI
                // Three.js Cone points up (Y+). We need to rotate Z.
                // atan2(y,x): 0 is Right. PI/2 is Up.
                // Cone default: Up.
                // So rotation = angle - PI/2
                
                items.push({ 
                    id: t.id, 
                    x, y, 
                    type: TYPE_VECTOR, 
                    rotation: { x: 0, y: 0, z: angle - Math.PI/2 } 
                });
            } else if (t && t.type === TYPE_OBSTACLE) {
                items.push({ id: t.id, x, y, type: TYPE_OBSTACLE });
            }
        });

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const, // Default geometry
            colors: {
                0: 0x222222, // Floor
                1: 0x00ff00, // Vector (Green)
                2: 0x555555, // Obstacle (Grey)
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === TYPE_FLOOR) return new THREE.BoxGeometry(0.95, 0.95, 0.1);
                if (type === TYPE_VECTOR) return new THREE.ConeGeometry(0.3, 0.7, 16);
                if (type === TYPE_OBSTACLE) return new THREE.BoxGeometry(0.8, 0.8, 0.8);
                return null;
            }
        }
    }
}