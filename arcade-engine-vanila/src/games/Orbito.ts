import { GameModel } from './GameModel';
import { Grid } from '../engine/features/Grid';
import { GameLoop } from '../engine/features/GameLoop';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const EMPTY = 0;
const P1 = 1; // White Marble
const P2 = 2; // Black Marble

export default class Orbito extends GameModel {
    grid!: Grid<number>;
    cursor = { x: 0, y: 0 };
    currentPlayer = P1;
    gameLoop: GameLoop;
    
    isOrbiting = false;
    orbitProgress = 0;
    
    // Store the state before orbit for animation
    prevGridState: { type: number, x: number, y: number, nextX: number, nextY: number }[] = [];

    constructor(audio?: SoundEmitter) {
        super(4, 4, 'orbito', audio);
        this.grid = new Grid(4, 4, EMPTY);
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        const size = 4 + (this.level - 1);
        this.resize(size, size);
        this.grid = new Grid(size, size, EMPTY);
        this.currentPlayer = P1;
        this.cursor = { x: Math.floor(size/2), y: Math.floor(size/2) };
        this.isGameOver = false;
        this.isOrbiting = false;
        this.status$.next(`Level ${this.level}: Your Turn`);
        this.emit();
        this.gameLoop.start();
    }

    handleInput(action: InputAction) {
        if (this.isGameOver) {
            if (action.type === 'SELECT') this.start();
            return;
        }

        // Block input during computer turn
        if (this.currentPlayer !== P1) return;

        if (action.type === 'SELECT') {
            this.handleSelect();
            return;
        }

        let dx = 0, dy = 0;
        if (action.type === 'UP') dy = 1;
        if (action.type === 'DOWN') dy = -1;
        if (action.type === 'LEFT') dx = -1;
        if (action.type === 'RIGHT') dx = 1;

        if (dx !== 0 || dy !== 0) this.handleMove(dx, dy);
    }

    handleMove(dx: number, dy: number) {
        if (this.isGameOver || this.isOrbiting) return;

        const nx = this.cursor.x + dx;
        const ny = this.cursor.y + dy;

        if (nx >= 0 && nx < this.width) this.cursor.x = nx;
        if (ny >= 0 && ny < this.height) this.cursor.y = ny;

        this.emit();
    }

    handleSelect() {
        if (this.isOrbiting) return;

        if (this.grid.get(this.cursor.x, this.cursor.y) === EMPTY) {
            this.placeMarble();
        } else {
            this.audio.playTone(150, 'sawtooth', 0.1); // Error sound
        }
    }

    placeMarble() {
        this.grid.set(this.cursor.x, this.cursor.y, this.currentPlayer);
        this.audio.playSelect();
        this.startOrbit();
    }

    startOrbit() {
        this.isOrbiting = true;
        this.orbitProgress = 0;
        this.status$.next("Orbiting...");
        this.audio.playMove();

        // Calculate next positions for all marbles
        this.prevGridState = [];
        const newGrid = new Grid(this.width, this.height, EMPTY);

        this.grid.forEach((val, x, y) => {
            if (val !== EMPTY) {
                const next = this.getNextPosition(x, y);
                this.prevGridState.push({
                    type: val,
                    x: x,
                    y: y,
                    nextX: next.x,
                    nextY: next.y
                });
                newGrid.set(next.x, next.y, val);
            }
        });

        // Update logical grid immediately, visual will interpolate
        this.grid = newGrid;
    }

    // Counter-Clockwise Orbit Logic
    getNextPosition(x: number, y: number): { x: number, y: number } {
        const s = this.width;
        const r = Math.min(x, y, s - 1 - x, s - 1 - y);
        const max = s - 1 - r;

        // Bottom (y=r, x < max) -> Right
        if (y === r && x < max) return { x: x + 1, y: y };
        // Right (x=max, y < max) -> Up
        if (x === max && y < max) return { x: x, y: y + 1 };
        // Top (y=max, x > r) -> Left
        if (y === max && x > r) return { x: x - 1, y: y };
        // Left (x=r, y > r) -> Down
        if (x === r && y > r) return { x: x, y: y - 1 };

        return { x, y }; // Should not happen
    }

    tick(dt: number) {
        if (this.isOrbiting) {
            this.orbitProgress += dt * 2.0; // 0.5 seconds duration
            
            if (this.orbitProgress >= 1.0) {
                this.isOrbiting = false;
                this.checkWin();
                if (!this.isGameOver) {
                    this.currentPlayer = this.currentPlayer === P1 ? P2 : P1;
                    
                    if (this.currentPlayer === P2) {
                        this.status$.next("Computer's Turn...");
                        setTimeout(() => this.computerMove(), 800);
                    } else {
                        this.status$.next(`Level ${this.level}: Your Turn`);
                    }
                }
            }
            this.emit();
        }
    }

    computerMove() {
        if (this.isGameOver || this.currentPlayer !== P2) return;

        const empty: {x: number, y: number}[] = [];
        this.grid.forEach((v, x, y) => {
            if (v === EMPTY) empty.push({x, y});
        });
        
        if (empty.length === 0) return;

        let bestScore = -Infinity;
        let bestMoves: {x: number, y: number}[] = [];

        for (const move of empty) {
            let score = 0;

            // 1. Simulate P2 Move (My Move)
            const gridP2 = this.simulateMove(move.x, move.y, P2);
            
            const p2Score = this.evaluateGrid(gridP2, P2);
            const p1Score = this.evaluateGrid(gridP2, P1);

            // Maximize my position, minimize opponent's position
            score += p2Score;
            score -= p1Score * 2.0; // Heavily penalize leaving P1 with a strong board

            // 2. Block Check: What if P1 played here?
            const gridP1 = this.simulateMove(move.x, move.y, P1);
            const p1PotentialScore = this.evaluateGrid(gridP1, P1);
            
            // If P1 playing here gives them a huge advantage, we must block
            score += p1PotentialScore * 1.5;

            // 3. Positional Heuristic (Prefer center)
            const dist = Math.abs(move.x - this.width/2) + Math.abs(move.y - this.height/2);
            score -= dist;

            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (score === bestScore) {
                bestMoves.push(move);
            }
        }

        const selected = bestMoves[Math.floor(Math.random() * bestMoves.length)];

        // Move cursor visually
        this.cursor.x = selected.x;
        this.cursor.y = selected.y;
        this.emit();

        setTimeout(() => {
            if (!this.isGameOver) this.placeMarble();
        }, 400);
    }

    evaluateGrid(grid: Grid<number>, player: number): number {
        let score = 0;
        const size = this.width;

        const evalLine = (count: number, empty: number) => {
            if (count === size) return 100000; // Win
            if (count === size - 1) return 1000; // Threat
            if (count === size - 2) return 100;  // Build up
            return count * 10;
        };

        // Rows
        for(let y=0; y<size; y++) {
            let c = 0, e = 0;
            for(let x=0; x<size; x++) {
                const v = grid.get(x, y);
                if (v === player) c++; else if (v === EMPTY) e++;
            }
            score += evalLine(c, e);
        }
        // Cols
        for(let x=0; x<size; x++) {
            let c = 0, e = 0;
            for(let y=0; y<size; y++) {
                const v = grid.get(x, y);
                if (v === player) c++; else if (v === EMPTY) e++;
            }
            score += evalLine(c, e);
        }
        // Diagonals
        let c1=0, e1=0, c2=0, e2=0;
        for(let i=0; i<size; i++) {
            const v1 = grid.get(i, i);
            if (v1 === player) c1++; else if (v1 === EMPTY) e1++;

            const v2 = grid.get(i, size - 1 - i);
            if (v2 === player) c2++; else if (v2 === EMPTY) e2++;
        }
        score += evalLine(c1, e1);
        score += evalLine(c2, e2);

        return score;
    }

    simulateMove(mx: number, my: number, player: number): Grid<number> {
        const tempGrid = new Grid(this.width, this.height, EMPTY);
        this.grid.forEach((val, x, y) => {
            const v = (x === mx && y === my) ? player : val;
            if (v !== EMPTY) {
                const next = this.getNextPosition(x, y);
                tempGrid.set(next.x, next.y, v);
            }
        });
        return tempGrid;
    }

    checkWin() {
        const winner = this.findWinner(this.grid);

        if (winner !== 0) {
            this.handleWin(winner);
            return;
        }

        // Check Draw (Full board)
        let full = true;
        this.grid.forEach(v => { if (v === EMPTY) full = false; });
        if (full) {
            this.isGameOver = true;
            this.status$.next("Draw! Press SELECT");
            this.audio.playGameOver();
        }
    }

    findWinner(grid: Grid<number>): number {
        const WIN_LEN = this.width;
        let p1Wins = false;
        let p2Wins = false;

        const check = (x: number, y: number, dx: number, dy: number) => {
            const p = grid.get(x, y);
            if (p === EMPTY) return false;
            for(let i = 1; i < WIN_LEN; i++) {
                if (grid.get(x + dx * i, y + dy * i) !== p) return false;
            }
            return true;
        };

        for(let x = 0; x < this.width; x++) {
            for(let y = 0; y < this.height; y++) {
                const p = grid.get(x, y);
                if (p === EMPTY) continue;

                // Horizontal
                if (x <= this.width - WIN_LEN && check(x, y, 1, 0)) { if (p === P1) p1Wins = true; else p2Wins = true; }
                // Vertical
                if (y <= this.height - WIN_LEN && check(x, y, 0, 1)) { if (p === P1) p1Wins = true; else p2Wins = true; }
                // Diag Up-Right
                if (x <= this.width - WIN_LEN && y <= this.height - WIN_LEN && check(x, y, 1, 1)) { if (p === P1) p1Wins = true; else p2Wins = true; }
                // Diag Down-Right
                if (x <= this.width - WIN_LEN && y >= WIN_LEN - 1 && check(x, y, 1, -1)) { if (p === P1) p1Wins = true; else p2Wins = true; }
                
                if (p1Wins && p2Wins) return 3;
            }
        }
        
        if (p1Wins && p2Wins) return 3;
        if (p1Wins) return P1;
        if (p2Wins) return P2;
        return 0;
    }

    handleWin(winner: number) {
        if (winner === 3) {
            this.status$.next("Draw! Restarting Level...");
            this.audio.playGameOver();
            this.effects$.next({ type: 'GAMEOVER' });
            this.gameLoop.stop();
            setTimeout(() => {
                this.startLevel();
            }, 2000);
            return;
        }

        if (winner === P1) {
            this.status$.next("You Win! Level Up!");
            this.audio.playMatch();
            this.gameLoop.stop();
            setTimeout(() => {
                this.level++;
                this.startLevel();
            }, 2000);
        } else {
            this.status$.next("Computer Wins! Game Over");
            this.audio.playGameOver();
            this.effects$.next({ type: 'GAMEOVER' });
            this.gameLoop.stop();
            this.isGameOver = true;
        }
    }

    emit() {
        const items: GameItem[] = [];

        // Render Board Grid (Visual only)
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
             let color = 0x333333;

             if (!this.isGameOver && x === this.cursor.x && y === this.cursor.y) {
                 color = 0x666666;
             }

             items.push({ 
                 id: `floor_${x}_${y}`, 
                 x, y, 
                 type: 10, // Floor tile
                 color
             });
        }

        if (this.isOrbiting) {
            // Render moving marbles
            const t = Math.min(1, this.orbitProgress);
            // Ease in-out
            const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            this.prevGridState.forEach((p, i) => {
                const cx = p.x + (p.nextX - p.x) * ease;
                const cy = p.y + (p.nextY - p.y) * ease;
                items.push({ id: `m_${i}`, x: cx, y: cy, type: p.type });
            });
        } else {
            // Render static marbles
            this.grid.forEach((val, x, y) => {
                if (val !== EMPTY) {
                    items.push({ id: `m_${x}_${y}`, x, y, type: val });
                }
            });
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                1: 0xFFFFFF, // P1 White
                2: 0x111111, // P2 Black
                10: 0x555555 // Floor
            },
            bgColor: 0x222222,
            customGeometry: (type: number) => {
                if (type === P1 || type === P2) return new THREE.SphereGeometry(0.4);
                if (type === 10) return new THREE.BoxGeometry(0.9, 0.9, 0.1);
                return null;
            }
        }
    }
}