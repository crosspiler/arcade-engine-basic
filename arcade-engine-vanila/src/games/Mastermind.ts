// src/games/Mastermind.ts

import { GameModel } from './GameModel';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import { MastermindInteraction } from '../engine/features/interactionSystems/MastermindInteraction';
import * as THREE from 'three';

const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff];
const EMPTY = 0;
const HIDDEN = 7;
const FEEDBACK_EXACT = 8;   // Black/Red peg
const FEEDBACK_PARTIAL = 9; // White peg
const CURSOR = 10;

export default class Mastermind extends GameModel {
    secretCode: number[] = [];
    guesses: { code: number[], feedback: { exact: number, partial: number } }[] = [];
    currentGuess: number[] = [1, 1, 1, 1];
    currentRow = 0;
    maxRows = 10;
    codeLength = 4;
    numColors = 6;
    interaction: MastermindInteraction;

    constructor(audio?: SoundEmitter) {
        super(5, 12, 'mastermind', audio); // Width 5 (4 Pegs + Feedback area), Height 12
        this.interaction = new MastermindInteraction({
            codeLength: 4,
            numColors: 6,
            currentRow: 0,
            onMove: () => { this.audio.playMove(); this.emit(); },
            onSubmit: () => this.submitGuess(),
            onRestart: () => this.startLevel(),
            getCurrentGuess: () => this.currentGuess
        });
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        this.guesses = [];
        this.currentGuess = [1, 1, 1, 1];
        this.currentRow = 0;
        this.interaction.cursor = 0;
        this.interaction.config.currentRow = 0;
        
        this.secretCode = [];
        for(let i=0; i<this.codeLength; i++) {
            this.secretCode.push(Math.floor(Math.random() * this.numColors) + 1);
        }

        this.status$.next('Guess the Code!');
        this.emit();
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    submitGuess() {
        const feedback = this.calculateFeedback(this.currentGuess, this.secretCode);
        
        this.guesses.push({
            code: [...this.currentGuess],
            feedback
        });

        this.audio.playSelect();

        if (feedback.exact === this.codeLength) {
            this.handleWin();
        } else {
            this.currentRow++;
            this.interaction.config.currentRow = this.currentRow;
            if (this.currentRow >= this.maxRows) {
                this.handleLoss();
            } else {
                this.emit();
            }
        }
    }

    calculateFeedback(guess: number[], secret: number[]) {
        let exact = 0;
        let partial = 0;
        const secretUsed = Array(this.codeLength).fill(false);
        const guessUsed = Array(this.codeLength).fill(false);

        // Check exact matches
        for (let i = 0; i < this.codeLength; i++) {
            if (guess[i] === secret[i]) {
                exact++;
                secretUsed[i] = true;
                guessUsed[i] = true;
            }
        }

        // Check partial matches
        for (let i = 0; i < this.codeLength; i++) {
            if (!guessUsed[i]) {
                for (let j = 0; j < this.codeLength; j++) {
                    if (!secretUsed[j] && guess[i] === secret[j]) {
                        partial++;
                        secretUsed[j] = true;
                        break;
                    }
                }
            }
        }

        return { exact, partial };
    }

    handleWin() {
        this.isGameOver = true;
        this.status$.next('CODE CRACKED! Press SELECT');
        this.updateScore(1000 + (this.maxRows - this.currentRow) * 100);
        this.audio.playMatch();
        this.effects$.next({ type: 'PARTICLE', x: 1.5, y: this.height - 1, color: 0x00ff00, style: 'CONFETTI' });
        this.emit();
    }

    handleLoss() {
        this.isGameOver = true;
        this.status$.next('GAME OVER. Press SELECT');
        this.audio.playGameOver();
        this.emit();
    }

    emit() {
        const items: GameItem[] = [];

        // Background Floor
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
            items.push({ id: `bg_${x}_${y}`, x, y, type: 0 });
        }

        // Secret Code Area (Top Row)
        const secretY = this.height - 1;
        for (let i = 0; i < this.codeLength; i++) {
            const type = this.isGameOver ? this.secretCode[i] : HIDDEN;
            items.push({ id: `secret_${i}`, x: i, y: secretY, type });
        }

        // Render Previous Guesses
        this.guesses.forEach((g, idx) => {
            const y = idx;
            // Pegs
            g.code.forEach((color, x) => {
                items.push({ id: `g_${idx}_${x}`, x: x, y, type: color });
            })
            
            // Feedback Pins (Arranged in a 2x2 grid at x ~ 4.0)
            let fbCount = 0;
            const baseX = 4.0;
            const baseY = y;
            
            const addPin = (type: number, count: number) => {
                const px = baseX + ((count % 2 === 0) ? -0.2 : 0.2);
                const py = baseY + ((count < 2) ? -0.2 : 0.2);
                items.push({ 
                    id: `fb_${idx}_${count}`, 
                    x: px, y: py, 
                    type, 
                    scale: 0.3 
                });
            };

            for(let k=0; k<g.feedback.exact; k++) addPin(FEEDBACK_EXACT, fbCount++);
            for(let k=0; k<g.feedback.partial; k++) addPin(FEEDBACK_PARTIAL, fbCount++);
        });

        // Render Current Active Row
        if (!this.isGameOver) {
            const y = this.currentRow;
            this.currentGuess.forEach((color, x) => {
                items.push({ id: `curr_${x}`, x: x, y, type: color });
            });
            
            // Cursor
            items.push({ id: 'cursor', x: this.interaction.cursor, y, type: CURSOR, scale: 1.1, opacity: 0.5 });
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'sphere' as const,
            colors: {
                0: 0x222222, // Floor
                1: 0xff0000, 2: 0x00ff00, 3: 0x0000ff, 4: 0xffff00, 5: 0x00ffff, 6: 0xff00ff,
                7: 0x111111, // Hidden (Dark Box)
                8: 0xff8800, // Exact (Orange)
                9: 0xffffff, // Partial (White)
                10: 0xffffff // Cursor
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === 0) return new THREE.BoxGeometry(1, 1, 0.1);
                if (type === 7) return new THREE.BoxGeometry(0.8, 0.8, 0.8);
                if (type === 10) return new THREE.BoxGeometry(1, 1, 1);
                return null;
            }
        }
    }
}
