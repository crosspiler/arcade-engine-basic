export type MoveDirection = 'up' | 'down' | 'left' | 'right' | 'none';
export type ActionButton = 'a' | 'b';

interface VirtualControlsState {
    visible: boolean;
}

interface VirtualControlsCallbacks {
    onMove: (direction: MoveDirection) => void;
    onAction: (button: ActionButton) => void;
}

export class VirtualControls {
    private element: HTMLDivElement;

    constructor(callbacks: VirtualControlsCallbacks) {
        this.element = document.createElement('div');
        this.element.className = "absolute inset-0 w-full h-full pointer-events-none";

        // --- D-Pad (Movement) ---
        const dpad = this.createDPad(callbacks.onMove);

        // --- Action Buttons ---
        const actionButtons = this.createActionButtons(callbacks.onAction);

        this.element.append(dpad, actionButtons);
    }

    private createDPad(onMove: (direction: MoveDirection) => void): HTMLDivElement {
        const container = document.createElement('div');
        container.className = "absolute bottom-8 left-8 grid grid-cols-3 gap-2 w-36 h-36 pointer-events-auto";

        const directions: { dir: MoveDirection, gridArea: string }[] = [
            { dir: 'up', gridArea: '1 / 2 / 2 / 3' },
            { dir: 'left', gridArea: '2 / 1 / 3 / 2' },
            { dir: 'right', gridArea: '2 / 3 / 3 / 4' },
            { dir: 'down', gridArea: '3 / 2 / 4 / 3' },
        ];

        directions.forEach(({ dir, gridArea }) => {
            const button = this.createControlButton(dir.toUpperCase());
            button.style.gridArea = gridArea;
            // Use pointer events for touch compatibility
            button.addEventListener('pointerdown', () => onMove(dir));
            button.addEventListener('pointerup', () => onMove('none'));
            button.addEventListener('pointerleave', () => onMove('none'));
            container.appendChild(button);
        });

        return container;
    }

    private createActionButtons(onAction: (button: ActionButton) => void): HTMLDivElement {
        const container = document.createElement('div');
        container.className = "absolute bottom-12 right-8 flex gap-4 pointer-events-auto";

        const buttonA = this.createControlButton('A', 'w-16 h-16 rounded-full');
        buttonA.addEventListener('pointerdown', () => onAction('a'));

        const buttonB = this.createControlButton('B', 'w-16 h-16 rounded-full');
        buttonB.addEventListener('pointerdown', () => onAction('b'));

        container.append(buttonB, buttonA);
        return container;
    }

    private createControlButton(text: string, extraClasses: string = 'w-12 h-12'): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = `bg-black/40 text-white font-bold rounded-md flex items-center justify-center ${extraClasses}`;
        // Prevent context menu on long press on mobile
        button.addEventListener('contextmenu', (e) => e.preventDefault());
        return button;
    }

    public getElement(): HTMLElement {
        return this.element;
    }

    public update(state: VirtualControlsState): void {
        this.element.style.display = state.visible ? 'block' : 'none';
    }
}