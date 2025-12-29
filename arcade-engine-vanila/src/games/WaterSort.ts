// src/games/WaterSort.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TUBE_CAPACITY = 4;

const TYPE_TUBE = 100;
const TYPE_CURSOR = 101;
const TYPE_SELECTED = 102;

export default class WaterSort extends GameModel {
    tubes: number[][] = []; // Array of stacks. Each number represents a color.
    selectedTube: number | null = null;
    interaction: GridCursorInteraction;
    moves = 0;
    level = 1;

    constructor(audio?: SoundEmitter) {
        // Width = Number of tubes, Height = Visual height for camera
        super(4, TUBE_CAPACITY + 2, 'watersort', audio);
        this.interaction = new GridCursorInteraction({
            width: 4,
            height: 1, // 1D selection (Left/Right only)
            onAction: (x, y) => this.handleAction(x),
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
        this.selectedTube = null;
        this.interaction.cursor = { x: 0, y: 0 };

        // Increment containers on each level: Level 1 = 4, Level 2 = 5, etc.
        this.width = 3 + this.level;
        this.interaction.updateConfig({ width: this.width });
        
        this.generateLevel();
        
        this.status$.next('Sort the colors!');
        this.emit();
    }

    generateLevel() {
        this.tubes = Array(this.width).fill(null).map(() => []);
        const numColors = this.width - 2;
        
        // Create segments
        const segments: number[] = [];
        for (let c = 1; c <= numColors; c++) {
            for (let i = 0; i < TUBE_CAPACITY; i++) {
                segments.push(c);
            }
        }
        
        // Shuffle
        for (let i = segments.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [segments[i], segments[j]] = [segments[j], segments[i]];
        }

        // Distribute to first N tubes (leave 2 empty for maneuvering)
        let tubeIdx = 0;
        for (const color of segments) {
            if (this.tubes[tubeIdx].length < TUBE_CAPACITY) {
                this.tubes[tubeIdx].push(color);
            } else {
                tubeIdx++;
                if (tubeIdx < this.width) {
                    this.tubes[tubeIdx].push(color);
                }
            }
        }
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction(x: number) {
        if (this.selectedTube === null) {
            // Select Source
            if (this.tubes[x].length > 0) {
                this.selectedTube = x;
                this.audio.playSelect();
            }
        } else {
            // Select Destination
            if (this.selectedTube === x) {
                // Deselect
                this.selectedTube = null;
            } else {
                this.tryPour(this.selectedTube, x);
                this.selectedTube = null;
            }
        }
    }

    tryPour(from: number, to: number) {
        const source = this.tubes[from];
        const dest = this.tubes[to];

        if (source.length === 0) return;
        if (dest.length >= TUBE_CAPACITY) {
            this.audio.playTone(150, 'sawtooth', 0.1); // Full
            return;
        }

        const colorToMove = source[source.length - 1];

        // Check compatibility: Destination must be empty OR match top color
        if (dest.length > 0 && dest[dest.length - 1] !== colorToMove) {
            this.audio.playTone(150, 'sawtooth', 0.1); // Mismatch
            return;
        }

        // Pour logic: Move all consecutive segments of same color that fit
        let moved = false;
        while (
            source.length > 0 && 
            dest.length < TUBE_CAPACITY && 
            source[source.length - 1] === colorToMove
        ) {
            dest.push(source.pop()!);
            moved = true;
        }

        if (moved) {
            this.moves++;
            this.audio.playMove();
            this.checkWin();
        }
    }

    checkWin() {
        let complete = true;
        for (const tube of this.tubes) {
            if (tube.length === 0) continue;
            if (tube.length !== TUBE_CAPACITY) {
                complete = false;
                break;
            }
            // Check uniformity
            const first = tube[0];
            for (const c of tube) {
                if (c !== first) {
                    complete = false;
                    break;
                }
            }
        }

        if (complete) {
            this.isGameOver = true;
            this.status$.next(`Level ${this.level} Complete!`);
            this.audio.playMatch();
            this.effects$.next({ type: 'PARTICLE', x: this.width/2, y: this.height/2, color: 0x00ff00, style: 'CONFETTI' });
            setTimeout(() => { this.level++; this.startLevel(); }, 2000);
        }
    }

    emit() {
        const items: GameItem[] = [];

        // Render Tubes and Liquid
        for (let x = 0; x < this.width; x++) {
            // Tube visual (Base)
            items.push({ id: `tube_${x}`, x, y: 0, type: TYPE_TUBE, opacity: 0.2 });
            
            // Render Liquid Segments
            this.tubes[x].forEach((color, i) => {
                // Stack them up. y=0 is tube base, so start liquid at y=0.5 relative to tube
                items.push({ id: `l_${x}_${i}`, x, y: i + 0.5, type: color });
            });
        }

        // Selection Highlight (Indicator above tube)
        if (this.selectedTube !== null) {
             items.push({ id: 'sel', x: this.selectedTube, y: TUBE_CAPACITY + 0.5, type: TYPE_SELECTED });
        }

        // Cursor (Below tubes)
        if (!this.isGameOver) {
            items.push({ id: 'cursor', x: this.interaction.cursor.x, y: -0.5, type: TYPE_CURSOR });
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'cylinder' as const,
            colors: {
                1: 0xff0000, 2: 0x00ff00, 3: 0x0000ff, 4: 0xffff00, 5: 0x00ffff,
                100: 0xAADDFF, // Tube Color (Glassy)
                101: 0xffffff, // Cursor
                102: 0xffffff  // Selected
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === TYPE_TUBE) {
                    // Full cylinder, relying on opacity for visibility to ensure perfect alignment
                    const height = TUBE_CAPACITY + 1;
                    const geo = new THREE.CylinderGeometry(0.5, 0.5, height, 32, 1, true);
                    geo.translate(0, height / 2.1, 0);
                    return geo;
                }
                if (type >= 1 && type <= 10) {
                    // Liquid segment - slightly taller to overlap and prevent gaps
                    return new THREE.CylinderGeometry(0.4, 0.4, 1.1, 32);
                }
                if (type === TYPE_CURSOR) return new THREE.ConeGeometry(0.3, 0.5, 16);
                if (type === TYPE_SELECTED) return new THREE.BoxGeometry(0.5, 0.5, 0.5);
                return null;
            }
        }
    }
}