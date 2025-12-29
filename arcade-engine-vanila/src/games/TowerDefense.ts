import { GameModel } from './GameModel';
import { Grid } from '../engine/features/Grid';
import { GameLoop } from '../engine/features/GameLoop';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

// Item types
const TILE_GROUND = 10;
const TILE_PATH = 11;
const TILE_BASE = 12;
const TILE_SPAWNER = 13;
const TILE_WALL = 14;
const TOWER_BASIC = 20;
const TOWER_SNIPER = 21;
const TOWER_RAPID = 22;
const TOWER_RANGE = 25;
const TOOL_SELL = 99;
const ENEMY = 30;
const ENEMY_FAST = 31;
const ENEMY_TANK = 32;
const CURSOR = 100;
const HEALTH_BG = 200;
const HEALTH_BAR = 201;

interface Enemy {
    id: number;
    pathIndex: number;
    progress: number; // 0 to 1 between path points
    hp: number;
    speed: number;
    type: number;
    damage: number;
    // For rendering
    visualX: number;
    visualY: number;
    hitFlash: number;
}

interface Tower {
    x: number;
    y: number;
    type: number;
    range: number;
    cooldown: number;
    damage: number;
    level: number;
    lastFired: number;
}

export default class TowerDefense extends GameModel {
    grid!: Grid<number>;
    gameLoop: GameLoop;
    cursor = { x: 1, y: 1 };
    selectedTowerType = TOWER_BASIC;
    elapsedTime = 0;

    // Game State
    enemies: Enemy[] = []; 
    spawnQueue: number[] = []; // Queue of enemy types to spawn
    towers: Tower[] = [];
    pathCoords: { x: number, y: number }[] = [];
    maxBaseHealth = 15;
    baseHealth = 15;
    resources = 50;
    
    private spawnTimer = 0;
    private spawnInterval = 1.0; // seconds
    private enemyCounter = 0;

    constructor(audio?: SoundEmitter) {
        super(20, 15, 'towerdefense', audio);
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
    }

    start() {
        this.level = 1;
        this.baseHealth = this.maxBaseHealth;
        this.startLevel();
    }

    startLevel() {
        // 1. Calculate Size (Increment row OR column alternating)
        const baseW = 15;
        const baseH = 10;
        const inc = this.level - 1;
        const w = baseW + Math.floor(inc / 2);
        const h = baseH + Math.ceil(inc / 2);
        this.resize(w, h);

        this.generateProceduralLevel();
        
        this.enemies = [];
        this.towers = [];
        this.spawnQueue = [];
        
        // Reset health on level start
        this.baseHealth = this.maxBaseHealth;
        
        this.resources = 50 + (this.level - 1) * 5;
        this.spawnTimer = 0;
        this.enemyCounter = 0;
        this.isGameOver = false;
        this.elapsedTime = 0;
        
        // Generate Wave Composition
        const count = 15 + Math.floor(this.level * 3.0);
        for(let i=0; i<count; i++) {
            const r = Math.random();
            // Progressive difficulty
            if (this.level >= 3 && r < 0.2) {
                this.spawnQueue.push(ENEMY_TANK);
            } else if (this.level >= 2 && r < 0.5) {
                this.spawnQueue.push(ENEMY_FAST);
            } else {
                this.spawnQueue.push(ENEMY);
            }
        }
        // Sort slightly so tanks come later
        this.spawnQueue.sort((a, b) => a - b); // Normal(30) -> Fast(31) -> Tank(32) order roughly

        this.status$.next(`Lv ${this.level}: Wave (${this.spawnQueue.length}). Click Path to Cycle Tool`);
        this.emit();
        this.gameLoop.start();
    }

    generateProceduralLevel() {
        this.grid = new Grid(this.width, this.height, TILE_GROUND);
        this.pathCoords = [];
        
        // Start at left-middle
        let cx = 0;
        let cy = Math.floor(this.height / 2);
        this.pathCoords.push({x: cx, y: cy});
        
        const targetX = this.width - 1;
        
        // Random Walk towards right
        while(cx < targetX) {
            // Move Horizontal
            cx++;
            this.pathCoords.push({x: cx, y: cy});
            
            // Chance to move Vertical (Zig-Zag)
            if (cx < targetX && Math.random() < 0.5) {
                const dir = Math.random() < 0.5 ? 1 : -1;
                const len = Math.floor(Math.random() * (this.height / 3)) + 1;
                
                for(let i=0; i<len; i++) {
                    const ny = cy + dir;
                    if (ny >= 1 && ny < this.height - 1) {
                        cy = ny;
                        this.pathCoords.push({x: cx, y: cy});
                    }
                }
            }
        }

        // Apply Path and Walls
        const pathSet = new Set(this.pathCoords.map(p => `${p.x},${p.y}`));
        this.pathCoords.forEach(p => this.grid.set(p.x, p.y, TILE_PATH));
        
        // Random Walls
        this.grid.forEach((v, x, y) => {
            if (!pathSet.has(`${x},${y}`) && Math.random() < 0.05) {
                this.grid.set(x, y, TILE_WALL);
            }
        });

        const start = this.pathCoords[0];
        const end = this.pathCoords[this.pathCoords.length - 1];
        this.grid.set(start.x, start.y, TILE_SPAWNER);
        this.grid.set(end.x, end.y, TILE_BASE);
    }

    handleInput(action: InputAction) {
        if (this.isGameOver) {
            if (action.type === 'SELECT') this.start();
            return;
        }

        if (action.type === 'SELECT') {
            const tile = this.grid.get(this.cursor.x, this.cursor.y);
            // Allow cycling tools by clicking on any non-buildable area (Base, Spawner, Path, Wall)
            if (tile === TILE_BASE || tile === TILE_SPAWNER || tile === TILE_PATH || tile === TILE_WALL) {
                this.cycleTowerType();
                return;
            }
            this.placeTower();
            return;
        }

        let dx = 0, dy = 0;
        if (action.type === 'UP') dy = 1;
        if (action.type === 'DOWN') dy = -1;
        if (action.type === 'LEFT') dx = -1;
        if (action.type === 'RIGHT') dx = 1;

        if (dx !== 0 || dy !== 0) {
            const nx = this.cursor.x + dx;
            const ny = this.cursor.y + dy;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                this.cursor.x = nx;
                this.cursor.y = ny;
                this.emit();
            }
        }
    }

    cycleTowerType() {
        if (this.selectedTowerType === TOWER_BASIC) this.selectedTowerType = TOWER_SNIPER;
        else if (this.selectedTowerType === TOWER_SNIPER) this.selectedTowerType = TOWER_RAPID;
        else if (this.selectedTowerType === TOWER_RAPID) this.selectedTowerType = TOOL_SELL;
        else this.selectedTowerType = TOWER_BASIC;
        
        this.audio.playSelect();
    }

    placeTower() {
        const tile = this.grid.get(this.cursor.x, this.cursor.y);
        
        if (this.selectedTowerType === TOOL_SELL) {
            if (tile >= TOWER_BASIC && tile <= TOWER_RAPID) {
                this.removeTower();
            } else {
                this.audio.playTone(150, 'sawtooth', 0.1);
            }
            return;
        }

        if (tile >= TOWER_BASIC && tile <= TOWER_RAPID) {
            this.upgradeTower();
            return;
        }

        if (tile !== TILE_GROUND) {
            this.audio.playTone(150, 'sawtooth', 0.1); // Error
            return;
        }

        let type = this.selectedTowerType;
        let range = 3.0;
        let cooldown = 0.8;
        let damage = 1;
        let cost = 25;

        if (type === TOWER_SNIPER) {
            range = 5.0;
            cooldown = 2.0;
            damage = 4;
            cost = 50;
        } else if (type === TOWER_RAPID) {
            range = 2.0;
            cooldown = 0.25;
            damage = 0.4;
            cost = 40;
        }

        if (this.resources < cost) {
            this.status$.next("Not enough resources!");
            this.audio.playTone(150, 'sawtooth', 0.1);
            return;
        }

        this.resources -= cost;
        this.grid.set(this.cursor.x, this.cursor.y, type);
        this.towers.push({
            x: this.cursor.x, y: this.cursor.y, type,
            range, cooldown,
            damage,
            level: 1,
            lastFired: -10
        });
        this.audio.playSelect();
        this.emit();
    }

    upgradeTower() {
        const tower = this.towers.find(t => t.x === this.cursor.x && t.y === this.cursor.y);
        if (!tower) return;

        if (tower.level >= 3) {
            this.status$.next("Max Level! Switch to Sell Tool to remove.");
            return;
        }

        const cost = 25 * (tower.level + 1);
        if (this.resources >= cost) {
            this.resources -= cost;
            tower.level++;
            tower.damage *= 1.3; 
            tower.range += 1.0;
            tower.cooldown *= 0.85; // Faster fire
            this.status$.next(`Upgraded to Level ${tower.level}!`);
            this.audio.playTone(600, 'sine', 0.1);
            this.emit();
        } else {
            this.status$.next(`Need ${cost} to upgrade!`);
            this.audio.playTone(150, 'sawtooth', 0.1);
        }
    }

    removeTower() {
        const idx = this.towers.findIndex(t => t.x === this.cursor.x && t.y === this.cursor.y);
        if (idx !== -1) {
            const t = this.towers[idx];
            let refund = 15;
            if (t.type === TOWER_SNIPER) refund = 25;
            if (t.type === TOWER_RAPID) refund = 20;
            refund += (t.level - 1) * 10;

            this.towers.splice(idx, 1);
            this.grid.set(this.cursor.x, this.cursor.y, TILE_GROUND);
            this.resources += refund;
            this.audio.playTone(600, 'sine', 0.1);
            this.emit();
        }
    }

    tick(dt: number) {
        if (this.isGameOver) return;

        this.elapsedTime += dt;
        const now = this.elapsedTime;

        if (this.spawnQueue.length > 0) {
            this.spawnTimer += dt;
            if (this.spawnTimer > this.spawnInterval) {
                this.spawnEnemy();
                this.spawnTimer = 0;
                this.spawnInterval = Math.max(0.2, 1.0 * Math.pow(0.85, this.level));
            }
        } else if (this.enemies.length === 0 && this.spawnQueue.length === 0) {
            // Level Complete
            this.audio.playMatch();
            this.level++;
            this.startLevel();
            return;
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.hitFlash > 0) e.hitFlash -= dt;
            e.progress += e.speed * dt;
            if (e.progress >= 1.0) {
                e.pathIndex++;
                e.progress = 0;
                if (e.pathIndex >= this.pathCoords.length - 1) {
                    this.baseHealth -= e.damage;
                    this.audio.playTone(100, 'sawtooth', 0.3);
                    this.enemies.splice(i, 1);
                    if (this.baseHealth <= 0) this.handleGameOver("Base destroyed!");
                    continue;
                }
            }
            const start = this.pathCoords[e.pathIndex];
            const end = this.pathCoords[e.pathIndex + 1];
            e.visualX = start.x + (end.x - start.x) * e.progress;
            e.visualY = start.y + (end.y - start.y) * e.progress;
        }

        this.towers.forEach(t => {
            if (now - t.lastFired > t.cooldown) {
                let bestTarget: Enemy | null = null;
                let maxProgress = -1;
                this.enemies.forEach(e => {
                    const dist = Math.sqrt(Math.pow(t.x - e.visualX, 2) + Math.pow(t.y - e.visualY, 2));
                    if (dist < t.range) {
                        const progress = e.pathIndex + e.progress;
                        if (progress > maxProgress) {
                            maxProgress = progress;
                            bestTarget = e;
                        }
                    }
                });
                if (bestTarget) {
                    this.fireTower(t, bestTarget);
                    t.lastFired = now;
                }
            }
        });

        this.emit();
    }
    
    fireTower(tower: Tower, enemy: Enemy) {
        this.audio.playTone(800, 'sine', 0.05);
        enemy.hitFlash = 0.1;
        enemy.hp -= tower.damage;
        if (enemy.hp <= 0) {
            this.enemies = this.enemies.filter(e => e.id !== enemy.id);
            // Reward based on enemy type
            const reward = enemy.type === ENEMY_TANK ? 8 : (enemy.type === ENEMY_FAST ? 5 : 3);
            this.resources += reward;
            this.audio.playTone(200, 'triangle', 0.1);
        }
    }

    spawnEnemy() {
        const type = this.spawnQueue.shift() || ENEMY;
        const start = this.pathCoords[0];
        
        let hp = 8 + Math.floor(this.level * 3.0);
        let speed = 1.2 + this.level * 0.2;
        let damage = 1;

        if (type === ENEMY_FAST) {
            hp = Math.floor(hp * 0.6);
            speed *= 1.8;
        } else if (type === ENEMY_TANK) {
            hp = hp * 4;
            speed *= 0.6;
            damage = 5;
        }

        this.enemies.push({
            id: this.enemyCounter++, pathIndex: 0, progress: 0,
            hp, speed, type, damage,
            visualX: start.x, visualY: start.y,
            hitFlash: 0
        });
    }
    
    handleGameOver(reason: string) {
        this.isGameOver = true;
        this.status$.next(`Game Over: ${reason}`);
        this.audio.playGameOver();
        this.effects$.next({ type: 'GAMEOVER' });
        this.gameLoop.stop();
    }

    emit() {
        const items: GameItem[] = [];
        this.grid.forEach((v, x, y) => items.push({ id: `g_${x}_${y}`, x, y, type: v }));
        
        this.towers.forEach(t => {
            // Color based on level
            let baseColor = 0xFFFF00;
            if (t.type === TOWER_SNIPER) baseColor = 0x0000FF;
            if (t.type === TOWER_RAPID) baseColor = 0xFF0000;
            
            items.push({ id: `t_${t.x}_${t.y}`, x: t.x, y: t.y, type: t.type, color: baseColor, scale: 1.0 + (t.level-1)*0.2 });
            
            // Range Ring
            items.push({ id: `tr_${t.x}_${t.y}`, x: t.x, y: t.y, type: TOWER_RANGE, scale: t.range, z: 0.06, color: 0xFFFFFF, opacity: 0.2 });
        });

        this.enemies.forEach(e => {
            items.push({ id: `e_${e.id}`, x: e.visualX, y: e.visualY, type: e.type, z: 0.1, color: e.hitFlash > 0 ? 0xFFFFFF : undefined });
        });
        if (!this.isGameOver) items.push({ id: 'cursor', x: this.cursor.x, y: this.cursor.y, type: CURSOR, z: 0.2 });
        
        // Ghost Range for Cursor
        if (!this.isGameOver && this.selectedTowerType !== TOOL_SELL) {
            let range = 3.0;
            if (this.selectedTowerType === TOWER_SNIPER) range = 5.0;
            if (this.selectedTowerType === TOWER_RAPID) range = 2.0;
            items.push({ id: 'cr', x: this.cursor.x, y: this.cursor.y, type: TOWER_RANGE, scale: range, z: 0.06, color: 0xAAAAAA, opacity: 0.2 });
        }

        // Health Bar
        const basePos = this.pathCoords[this.pathCoords.length - 1];
        if (basePos && !this.isGameOver) {
            // Background
            items.push({ 
                id: 'h_bg', x: basePos.x, y: basePos.y, 
                type: HEALTH_BG, z: 0.8 
            });
            // Foreground
            const pct = Math.max(0, this.baseHealth / this.maxBaseHealth);

            // The bar's geometry has a base width of 0.8. When we apply uniform scale,
            // it shrinks towards its center. We must shift it to the left to keep its
            // left edge aligned with the background bar's left edge.
            const barWidth = 0.8;
            const xOffset = (barWidth * (1 - pct)) / 2;
            items.push({ 
                id: 'h_bar', x: basePos.x - xOffset, y: basePos.y, 
                type: HEALTH_BAR, z: 0.85, scale: pct 
            });
        }

        // Cursor Color Logic (Feedback for "Why can't I plant?")
        const tile = this.grid.get(this.cursor.x, this.cursor.y);
        let cursorColor = 0xFFFFFF; // Default White
        
        let cost = 25;
        if (this.selectedTowerType === TOWER_SNIPER) cost = 50;
        if (this.selectedTowerType === TOWER_RAPID) cost = 40;
        if (this.selectedTowerType === TOOL_SELL) cost = 0;

        if (this.selectedTowerType === TOOL_SELL) {
            if (tile >= TOWER_BASIC && tile <= TOWER_RAPID) {
                cursorColor = 0xFF0000; // Red: Sell
            } else {
                cursorColor = 0x555555; // Grey: N/A
            }
        } else if (tile === TILE_GROUND) {
            if (this.resources >= cost) {
                cursorColor = 0x00FF00; // Green: Can Build
            } else {
                cursorColor = 0xFF0000; // Red: Not enough resources
            }
        } else if (tile >= TOWER_BASIC && tile <= TOWER_RAPID) {
            cursorColor = 0x00FFFF; // Cyan: Can Upgrade
        } else {
            cursorColor = 0xFF0000; // Red: Invalid Terrain
        }
        // Update cursor color in items list
        const cursorItem = items.find(i => i.id === 'cursor');
        if (cursorItem) cursorItem.color = cursorColor;

        let typeName = "Basic";
        if (this.selectedTowerType === TOWER_SNIPER) typeName = "Sniper";
        else if (this.selectedTowerType === TOWER_RAPID) typeName = "Rapid";
        else if (this.selectedTowerType === TOOL_SELL) typeName = "Sell";

        // Contextual Status Message
        let actionMsg = `Build: ${typeName} ${cost > 0 ? '('+cost+')' : ''}`;

        if (tile >= TOWER_BASIC && tile <= TOWER_RAPID) {
            const t = this.towers.find(tw => tw.x === this.cursor.x && tw.y === this.cursor.y);
            if (this.selectedTowerType === TOOL_SELL) {
                let refund = 15; // Base refund
                if (t) refund += (t.level - 1) * 10;
                actionMsg = `SELL (+${refund})`;
            } else if (t) {
                if (t.level >= 3) actionMsg = "MAX LEVEL";
                else {
                    const upCost = 25 * (t.level + 1);
                    actionMsg = `UPGRADE (${upCost})`;
                }
            }
        }

        this.status$.next(`HP: ${this.baseHealth} | Res: ${this.resources} | ${actionMsg}`);
        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                [TILE_GROUND]: 0x338833, [TILE_PATH]: 0x8B4513, [TILE_BASE]: 0x0000FF,
                [TILE_SPAWNER]: 0xFF0000, [TILE_WALL]: 0x000000, 
                [TOWER_BASIC]: 0xFFFF00, [TOWER_SNIPER]: 0x0000FF, [TOWER_RAPID]: 0xFF0000,
                [TOWER_RANGE]: 0xFFFFFF,
                [ENEMY]: 0x800080, [ENEMY_FAST]: 0x00FFFF, [ENEMY_TANK]: 0xFFA500,
                [HEALTH_BG]: 0xFF0000, [HEALTH_BAR]: 0x00FF00,
                [CURSOR]: 0xFFFFFF,
            },
            bgColor: 0x114411,
            customGeometry: (type: number) => {
                if (type === TILE_GROUND || type === TILE_PATH || type === TILE_WALL) return new THREE.BoxGeometry(1, 1, 0.1);
                if (type === TILE_BASE || type === TILE_SPAWNER) return new THREE.BoxGeometry(1, 1, 0.5);
                if (type >= TOWER_BASIC && type <= TOWER_RAPID) return new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
                if (type === TOWER_RANGE) return new THREE.CircleGeometry(1, 32);
                if (type === HEALTH_BG) return new THREE.BoxGeometry(0.8, 0.15, 0.05);
                if (type === HEALTH_BAR) return new THREE.BoxGeometry(0.8, 0.15, 0.05);
                if (type === ENEMY || type === ENEMY_FAST || type === ENEMY_TANK) return new THREE.SphereGeometry(0.4);
                if (type === CURSOR) return new THREE.BoxGeometry(1.1, 1.1, 0.2);
                return null;
            }
        }
    }
}