import { GameModel } from './GameModel';
import { Grid } from '../engine/features/Grid';
import { GameLoop } from '../engine/features/GameLoop';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TILE_EMPTY = 0;
const TILE_TRACK = 1;
const TILE_BASE = 2;
const TILE_GOAL_PATH = 3;
const TILE_CENTER = 4;
const TILE_SAFE = 5;

interface Token {
    id: number;
    player: number; // 0-based index
    state: 'HOME' | 'TRACK' | 'GOAL' | 'FINISHED';
    pos: number; // Index in trackCoords or goalPath
    x: number;
    y: number;
    visualX: number;
    visualY: number;
    visualZ: number;
}

export default class Ludo extends GameModel {
    grid!: Grid<number>;
    gameLoop: GameLoop;
    
    numPlayers = 2;
    tokens: Token[] = [];
    currentPlayer = 0;
    diceValue = 0;
    turnState: 'ROLL' | 'SELECT' | 'ANIMATING' | 'AI_THINK' = 'ROLL';
    
    // Geometry
    trackCoords: {x: number, y: number}[] = [];
    playerStartIndices: number[] = []; // Index in trackCoords where each player starts
    goalPaths: {x: number, y: number}[][] = []; // [player][step]
    baseCoords: {x: number, y: number}[] = []; // [player] center of base

    // Selection
    selectedTokenIndex = -1;
    movableTokenIndices: number[] = [];

    // Animation
    animQueue: { tokenIdx: number, steps: number }[] = [];
    isAnimating = false;
    animProgress = 0;
    currentAnimTarget: {x: number, y: number} | null = null;

    constructor(audio?: SoundEmitter) {
        super(15, 15, 'ludo', audio);
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        // Dynamic difficulty: More players as levels progress
        this.numPlayers = 1 + this.level;
        if (this.numPlayers > 8) this.numPlayers = 8; // Cap at 8 players

        this.generateBoard();
        this.resetState();
        
        this.status$.next(`Level ${this.level}: ${this.numPlayers} Players`);
        this.emit();
        this.gameLoop.start();
    }

    generateBoard() {
        // 1. Calculate Size
        // We need a track long enough for N players.
        // Let's say 8 tiles per player segment.
        const segmentLen = 8;
        const trackLen = this.numPlayers * segmentLen;
        
        // A square track has perimeter ~ 4 * side.
        // side ~ trackLen / 4.
        let side = Math.ceil(trackLen / 4) + 4; // +4 for padding/bases
        if (side % 2 === 0) side++; // Ensure odd size for center
        
        this.resize(side, side);
        this.grid = new Grid(side, side, TILE_EMPTY);

        // 2. Build Track (Square Loop)
        this.trackCoords = [];
        const inset = 2;
        const min = inset;
        const max = side - 1 - inset;
        
        // Clockwise loop
        // Top edge (Left to Right)
        for(let x=min; x<max; x++) this.trackCoords.push({x, y: max});
        // Right edge (Top to Bottom)
        for(let y=max; y>min; y--) this.trackCoords.push({x: max, y});
        // Bottom edge (Right to Left)
        for(let x=max; x>min; x--) this.trackCoords.push({x, y: min});
        // Left edge (Bottom to Top)
        for(let y=min; y<max; y++) this.trackCoords.push({x: min, y});

        // Mark track on grid
        this.trackCoords.forEach(p => this.grid.set(p.x, p.y, TILE_TRACK));

        // 3. Assign Player Positions
        this.playerStartIndices = [];
        this.goalPaths = [];
        this.baseCoords = [];
        const center = Math.floor(side / 2);
        this.grid.set(center, center, TILE_CENTER);

        const totalTrack = this.trackCoords.length;
        
        for(let i=0; i<this.numPlayers; i++) {
            // Start Index
            const startIdx = Math.floor((totalTrack / this.numPlayers) * i);
            this.playerStartIndices.push(startIdx);

            // Mark Safe Zone (Start)
            const startPos = this.trackCoords[startIdx];
            this.grid.set(startPos.x, startPos.y, TILE_SAFE);

            // Base Position (Outside the track near start)
            // Simple heuristic: push outward from center
            const dx = startPos.x - center;
            const dy = startPos.y - center;
            const bx = startPos.x + Math.sign(dx) * 2;
            const by = startPos.y + Math.sign(dy) * 2;
            this.baseCoords.push({x: bx, y: by});
            
            // Mark Base area (2x2)
            this.grid.set(bx, by, TILE_BASE);
            this.grid.set(bx+1, by, TILE_BASE);
            this.grid.set(bx, by+1, TILE_BASE);
            this.grid.set(bx+1, by+1, TILE_BASE);

            // Goal Path (From track entry to center)
            // Entry is usually the tile before start index
            const entryIdx = (startIdx - 1 + totalTrack) % totalTrack;
            const entryPos = this.trackCoords[entryIdx];
            
            // Raycast from entry to center
            const path: {x: number, y: number}[] = [];
            let cx = entryPos.x;
            let cy = entryPos.y;
            const steps = Math.max(Math.abs(center - cx), Math.abs(center - cy)) - 1;
            
            for(let s=0; s<steps; s++) {
                cx += Math.sign(center - cx);
                cy += Math.sign(center - cy);
                if (cx !== center || cy !== center) {
                    path.push({x: cx, y: cy});
                    this.grid.set(cx, cy, TILE_GOAL_PATH);
                }
            }
            path.push({x: center, y: center}); // Final step is center
            this.goalPaths.push(path);
        }
    }

    resetState() {
        this.tokens = [];
        for(let p=0; p<this.numPlayers; p++) {
            for(let t=0; t<4; t++) {
                const bx = this.baseCoords[p].x + (t%2);
                const by = this.baseCoords[p].y + Math.floor(t/2);
                this.tokens.push({
                    id: p*4 + t,
                    player: p,
                    state: 'HOME',
                    pos: 0,
                    x: bx,
                    y: by,
                    visualX: bx,
                    visualY: by,
                    visualZ: 0
                });
            }
        }
        this.currentPlayer = 0;
        this.diceValue = 0;
        this.turnState = 'ROLL';
        this.animQueue = [];
        this.isAnimating = false;
    }

    handleInput(action: InputAction) {
        if (this.turnState !== 'ROLL' && this.turnState !== 'SELECT') return;
        if (this.currentPlayer !== 0) return; // AI Turn

        if (action.type === 'SELECT') {
            if (this.turnState === 'ROLL') {
                this.rollDice();
            } else if (this.turnState === 'SELECT') {
                this.moveSelectedToken();
            }
        }

        if (this.turnState === 'SELECT') {
            if (action.type === 'LEFT') this.cycleSelection(-1);
            if (action.type === 'RIGHT') this.cycleSelection(1);
        }
    }

    rollDice() {
        this.diceValue = Math.floor(Math.random() * 6) + 1;
        this.audio.playTone(400 + this.diceValue * 50, 'square', 0.1);
        this.status$.next(`You rolled a ${this.diceValue}`);
        
        this.findMovableTokens();
        
        if (this.movableTokenIndices.length === 0) {
            setTimeout(() => this.nextTurn(), 1000);
        } else {
            this.turnState = 'SELECT';
            this.selectedTokenIndex = 0;
            this.emit();
        }
    }

    findMovableTokens() {
        this.movableTokenIndices = [];
        this.tokens.forEach((t, idx) => {
            if (t.player !== this.currentPlayer) return;
            if (t.state === 'FINISHED') return;

            // Rule: Need 6 to leave HOME
            if (t.state === 'HOME') {
                if (this.diceValue === 6) this.movableTokenIndices.push(idx);
                return;
            }

            // Rule: Check Goal overflow
            if (t.state === 'GOAL') {
                if (t.pos + this.diceValue < this.goalPaths[t.player].length) {
                    this.movableTokenIndices.push(idx);
                }
                return;
            }

            // Track move always valid unless blocked (we ignore blocks for simplicity)
            this.movableTokenIndices.push(idx);
        });
    }

    cycleSelection(dir: number) {
        if (this.movableTokenIndices.length === 0) return;
        this.selectedTokenIndex = (this.selectedTokenIndex + dir + this.movableTokenIndices.length) % this.movableTokenIndices.length;
        this.emit();
    }

    moveSelectedToken() {
        const tokenIdx = this.movableTokenIndices[this.selectedTokenIndex];
        this.executeMove(tokenIdx);
    }

    executeMove(tokenIdx: number) {
        const token = this.tokens[tokenIdx];
        this.turnState = 'ANIMATING';

        if (token.state === 'HOME') {
            // Move to Start (1 step logic effectively)
            this.animQueue = [{ tokenIdx, steps: 1 }];
        } else {
            // Move forward N steps
            this.animQueue = [{ tokenIdx, steps: this.diceValue }];
        }
        this.isAnimating = true;
        this.animProgress = 0;
        this.currentAnimTarget = null;
    }

    stepToken(t: Token) {
        if (t.state === 'FINISHED') return;

        if (t.state === 'TRACK') {
            // Check if entering goal
            // Entry index is (startIdx - 1)
            const startIdx = this.playerStartIndices[t.player];
            const entryIdx = (startIdx - 1 + this.trackCoords.length) % this.trackCoords.length;
            
            if (t.pos === entryIdx) {
                t.state = 'GOAL';
                t.pos = 0;
                const c = this.goalPaths[t.player][0];
                t.x = c.x; t.y = c.y;
                return;
            }

            t.pos = (t.pos + 1) % this.trackCoords.length;
            const c = this.trackCoords[t.pos];
            t.x = c.x; t.y = c.y;
        } else if (t.state === 'GOAL') {
            t.pos++;
            if (t.pos >= this.goalPaths[t.player].length - 1) {
                t.state = 'FINISHED'; // Reached center
                // Stack in center visually?
            }
            const c = this.goalPaths[t.player][t.pos];
            t.x = c.x; t.y = c.y;
        }
    }

    checkCollisions(activeToken: Token) {
        if (activeToken.state === 'FINISHED') return;
        
        // Safe zone check
        const tile = this.grid.get(activeToken.x, activeToken.y);
        if (tile === TILE_SAFE) return;

        // Check against other tokens
        this.tokens.forEach(t => {
            if (t.id !== activeToken.id && t.x === activeToken.x && t.y === activeToken.y && t.state !== 'HOME' && t.state !== 'FINISHED') {
                if (t.player !== activeToken.player) {
                    // Capture!
                    t.state = 'HOME';
                    t.x = this.baseCoords[t.player].x + (t.id%4)%2;
                    t.y = this.baseCoords[t.player].y + Math.floor((t.id%4)/2);
                    t.visualX = t.x;
                    t.visualY = t.y;
                    t.visualZ = 0;
                    this.audio.playTone(100, 'sawtooth', 0.2);
                    this.status$.next("Captured!");
                }
            }
        });
    }

    nextTurn() {
        this.currentPlayer = (this.currentPlayer + 1) % this.numPlayers;
        this.diceValue = 0;
        
        if (this.currentPlayer === 0) {
            this.turnState = 'ROLL';
            this.status$.next("Your Turn");
        } else {
            this.turnState = 'AI_THINK';
            this.status$.next(`Player ${this.currentPlayer + 1}'s Turn`);
            setTimeout(() => this.aiTurn(), 1000);
        }
        this.emit();
    }

    aiTurn() {
        this.diceValue = Math.floor(Math.random() * 6) + 1;
        this.audio.playTone(400 + this.diceValue * 50, 'square', 0.1);
        this.emit();

        this.findMovableTokens();
        
        if (this.movableTokenIndices.length === 0) {
            setTimeout(() => this.nextTurn(), 1000);
        } else {
            // Simple AI: Prioritize capturing or leaving home
            // For now, just random valid move
            const pick = this.movableTokenIndices[Math.floor(Math.random() * this.movableTokenIndices.length)];
            setTimeout(() => this.executeMove(pick), 800);
        }
    }

    checkWin(player: number): boolean {
        const finished = this.tokens.filter(t => t.player === player && t.state === 'FINISHED').length;
        return finished === 4;
    }

    handleWin(player: number) {
        if (player === 0) {
            this.status$.next("You Win! Level Up!");
            this.audio.playMatch();
            setTimeout(() => {
                this.level++;
                this.startLevel();
            }, 2000);
        } else {
            this.status$.next(`Player ${player+1} Wins! Game Over`);
            this.audio.playGameOver();
            this.isGameOver = true;
        }
    }

    tick(dt: number) {
        if (this.isAnimating && this.animQueue.length > 0) {
            const anim = this.animQueue[0];
            const t = this.tokens[anim.tokenIdx];
            
            // Initialize step target if needed
            if (this.animProgress === 0 && !this.currentAnimTarget) {
                const temp = { ...t }; // Clone to peek next pos
                if (temp.state === 'HOME') {
                    temp.state = 'TRACK';
                    temp.pos = this.playerStartIndices[temp.player];
                    const c = this.trackCoords[temp.pos];
                    temp.x = c.x; temp.y = c.y;
                } else {
                    this.stepToken(temp);
                }
                this.currentAnimTarget = { x: temp.x, y: temp.y };
            }

            this.animProgress += dt * 6.0; // Speed
            
            if (this.animProgress >= 1.0) {
                // Step complete
                this.animProgress = 0;
                this.currentAnimTarget = null;
                
                // Apply Logic
                if (t.state === 'HOME') {
                    t.state = 'TRACK';
                    t.pos = this.playerStartIndices[t.player];
                    const c = this.trackCoords[t.pos];
                    t.x = c.x; t.y = c.y;
                } else {
                    this.stepToken(t);
                }
                
                // Sync Visuals
                t.visualX = t.x;
                t.visualY = t.y;
                t.visualZ = 0;
                this.audio.playMove();

                anim.steps--;
                if (anim.steps <= 0) {
                    this.animQueue.shift();
                    if (this.animQueue.length === 0) {
                        this.isAnimating = false;
                        this.checkCollisions(t);
                        this.emit();
                        
                        if (this.checkWin(t.player)) {
                            this.handleWin(t.player);
                        } else {
                            if (this.diceValue === 6) {
                                this.turnState = this.currentPlayer === 0 ? 'ROLL' : 'AI_THINK';
                                this.status$.next(this.currentPlayer === 0 ? "Roll again!" : `Player ${this.currentPlayer+1} rolls again`);
                                if (this.currentPlayer !== 0) setTimeout(() => this.aiTurn(), 1000);
                            } else {
                                setTimeout(() => this.nextTurn(), 500);
                            }
                        }
                    }
                }
            } else if (this.currentAnimTarget) {
                // Interpolate
                t.visualX = t.x + (this.currentAnimTarget.x - t.x) * this.animProgress;
                t.visualY = t.y + (this.currentAnimTarget.y - t.y) * this.animProgress;
                t.visualZ = Math.sin(this.animProgress * Math.PI) * 0.5;
                this.emit();
            }
        }
    }

    emit() {
        const items: GameItem[] = [];

        // Render Grid
        this.grid.forEach((v, x, y) => {
            let color = 0x222222;
            if (v === TILE_TRACK) color = 0x444444;
            if (v === TILE_BASE) color = 0x333333;
            if (v === TILE_GOAL_PATH) color = 0x555555;
            if (v === TILE_CENTER) color = 0xFFD700;
            if (v === TILE_SAFE) color = 0x888888;

            // Highlight player bases
            this.baseCoords.forEach((b, i) => {
                if (Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2) {
                    color = this.getPlayerColor(i, true);
                }
            });

            items.push({ id: `f_${x}_${y}`, x, y, type: 10, color });
        });

        // Render Tokens
        this.tokens.forEach(t => {
            const isSelected = this.turnState === 'SELECT' && 
                             this.movableTokenIndices[this.selectedTokenIndex] === this.tokens.indexOf(t);
            
            items.push({
                id: `t_${t.id}`,
                x: t.visualX,
                y: t.visualY,
                type: 20, // Token geometry
                color: this.getPlayerColor(t.player, false),
                scale: isSelected ? 1.2 : 1.0,
                z: t.visualZ + (isSelected ? 0.5 : 0)
            });
        });

        this.state$.next(items);
    }

    getPlayerColor(p: number, dim: boolean): number {
        const colors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 0x00FFFF, 0xFF00FF, 0xFFFFFF, 0xFFA500];
        let c = colors[p % colors.length];
        if (dim) {
            // Darken for floor
            const r = ((c >> 16) & 255) * 0.3;
            const g = ((c >> 8) & 255) * 0.3;
            const b = (c & 255) * 0.3;
            return (r << 16) | (g << 8) | b;
        }
        return c;
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: { 10: 0x555555, 20: 0xFFFFFF },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === 10) return new THREE.BoxGeometry(0.95, 0.95, 0.1);
                if (type === 20) return new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16);
                return null;
            }
        }
    }
}