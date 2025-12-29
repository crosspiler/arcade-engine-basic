// src/games/TowerOfHanoi.ts

import { GameModel } from './GameModel';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import * as THREE from 'three';

const NUM_DISKS = 5;
const RODS = 3;
const TYPE_ROD = 6;
const TYPE_BASE = 7;
const TYPE_CURSOR = 10;

export default class TowerOfHanoi extends GameModel {
    stacks: number[][] = [];
    hand: number | null = null;
    moves = 0;
    interaction: GridCursorInteraction;

    constructor(audio?: SoundEmitter) {
        super(3, 8, 'towerofhanoi', audio); // 3 Columns, 8 Rows
        this.interaction = new GridCursorInteraction({
            width: 3,
            height: 1, // Treat as 1D row for cursor purposes
            onAction: () => this.handleAction(),
            onStartLevel: () => this.startLevel()
        });
    }

    start() {
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        this.moves = 0;
        this.interaction.cursor = { x: 0, y: 0 };
        this.hand = null;
        this.stacks = [[], [], []];
        
        // Initialize Rod 0 with disks: 5 (bottom) to 1 (top)
        for (let i = NUM_DISKS; i >= 1; i--) {
            this.stacks[0].push(i);
        }

        this.status$.next('Move stack to Right');
        this.emit();
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction() {
        const cursorX = this.interaction.cursor.x;
        if (this.hand === null) {
            // Pick up top disk
            const stack = this.stacks[cursorX];
            if (stack.length > 0) {
                this.hand = stack.pop()!;
                this.audio.playSelect();
            }
        } else {
            // Drop disk
            const stack = this.stacks[cursorX];
            const topDisk = stack.length > 0 ? stack[stack.length - 1] : 999;
            
            if (this.hand < topDisk) {
                stack.push(this.hand);
                this.hand = null;
                this.moves++;
                this.audio.playMove();
                this.checkWin();
            } else {
                // Invalid move
                this.audio.playGameOver();
                this.status$.next('Invalid Move!');
            }
        }
    }

    checkWin() {
        // Win if all disks are on the last rod (index 2)
        if (this.stacks[2].length === NUM_DISKS) {
            this.isGameOver = true;
            this.status$.next(`Solved in ${this.moves} moves! Press SELECT`);
            this.audio.playMatch();
            this.effects$.next({ type: 'PARTICLE', x: 2, y: 0, color: 0x00ff00, style: 'CONFETTI' });
        } else {
            this.status$.next(`Moves: ${this.moves}`);
        }
    }

    emit() {
        const items: GameItem[] = [];

        // Render Base
        for(let x=0; x<this.width; x++) {
            items.push({ id: `base_${x}`, x, y: 0, type: TYPE_BASE });
        }

        // Render Rods (Visual background)
        for(let x=0; x<this.width; x++) {
            for(let y=0; y<this.height-2; y++) {
                 items.push({ id: `rod_${x}_${y}`, x, y, type: TYPE_ROD });
            }
        }

        // Render Disks in stacks
        this.stacks.forEach((stack, x) => {
            stack.forEach((disk, i) => {
                items.push({ id: `d_${disk}`, x, y: i + 1, type: disk });
            });
        });

        // Render Hand (Floating disk)
        if (this.hand !== null) {
            items.push({ id: `d_${this.hand}`, x: this.interaction.cursor.x, y: this.height - 2, type: this.hand });
        }

        // Render Cursor
        items.push({ id: 'cursor', x: this.interaction.cursor.x, y: this.height - 1, type: TYPE_CURSOR });

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                1: 0xff0000, // Smallest
                2: 0xff8800,
                3: 0xffff00,
                4: 0x00ff00,
                5: 0x0088ff, // Largest
                6: 0x888888, // Rod (Grey)
                7: 0x8B4513, // Base (Wood)
                10: 0xffffff // Cursor
            },
            bgColor: 0x222222,
            customGeometry: (type: number) => {
                // Rods
                if (type === TYPE_ROD) return new THREE.CylinderGeometry(0.1, 0.1, 1, 16);
                
                // Base
                if (type === TYPE_BASE) return new THREE.BoxGeometry(1, 0.2, 0.8);
                
                // Disks
                if (type >= 1 && type <= 5) {
                    const r = 0.15 + (type/5) * 0.3;
                    return new THREE.CylinderGeometry(r, r, 0.3, 32);
                }
                
                // Cursor
                if (type === TYPE_CURSOR) return new THREE.ConeGeometry(0.3, 0.5, 16);
                
                return null;
            }
        }
    }
}
