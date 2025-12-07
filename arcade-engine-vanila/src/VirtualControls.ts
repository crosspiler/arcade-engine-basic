import type { Action } from "rxjs/internal/scheduler/Action";
import type { InputManager } from "./engine/core/InputManager";


export class VirtualControls {
    private container: HTMLElement;
    private element: HTMLElement;
    private inputManager: InputManager;

    constructor(inputManager: InputManager) {
        this.element = document.createElement('div');
        this.inputManager = inputManager;

        this.render();
        this.attachEventListeners();
    }

    private render() {
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'md:hidden'; // Hide on medium screens and up

        controlsContainer.innerHTML = `
            <div class="absolute bottom-8 right-8 grid grid-cols-3 grid-rows-2 gap-2 z-10">
                <button data-action='{"type": "MOVE", "data": {"direction": "UP"}}' class="col-start-2 row-start-1 w-16 h-16 bg-white/10 backdrop-blur border border-white/30 rounded-xl flex items-center justify-center text-2xl active:bg-cyan-400 active:text-black transition-colors">↑</button>
                <button data-action='{"type": "MOVE", "data": {"direction": "LEFT"}}' class="col-start-1 row-start-2 w-16 h-16 bg-white/10 backdrop-blur border border-white/30 rounded-xl flex items-center justify-center text-2xl active:bg-cyan-400 active:text-black transition-colors">←</button>
                <button data-action='{"type": "MOVE", "data": {"direction": "DOWN"}}' class="col-start-2 row-start-2 w-16 h-16 bg-white/10 backdrop-blur border border-white/30 rounded-xl flex items-center justify-center text-2xl active:bg-cyan-400 active:text-black transition-colors">↓</button>
                <button data-action='{"type": "MOVE", "data": {"direction": "RIGHT"}}' class="col-start-3 row-start-2 w-16 h-16 bg-white/10 backdrop-blur border border-white/30 rounded-xl flex items-center justify-center text-2xl active:bg-cyan-400 active:text-black transition-colors">→</button>
            </div>
            <button data-action='{"type": "ACTION"}' class="absolute bottom-8 left-8 w-20 h-20 bg-yellow-400/20 border-2 border-yellow-400/50 rounded-full flex items-center justify-center text-yellow-400 font-bold backdrop-blur z-10 active:bg-yellow-400 active:text-black active:scale-95 transition-all">ACT</button>
        `;
        this.element.appendChild(controlsContainer);
    }

    public getElement(): HTMLElement {
        return this.element;
    }

    private attachEventListeners() {
        this.element.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('button[data-action]');
            if (!button) return;
            const actionData = button.getAttribute('data-action');
            if (actionData) {
                this.inputManager.emitVirtual(JSON.parse(actionData));
            }
        });
    }
}