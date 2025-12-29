export class GameLoop {
    private lastTime = 0;
    private running = false;
    private callback: (dt: number) => void;
    private animationFrameId: number | null = null;

    constructor(callback: (dt: number) => void) {
        this.callback = callback;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    stop() {
        this.running = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private loop = (time: number) => {
        if (!this.running) return;
        
        // Calculate delta time in seconds
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        // Cap dt to prevent huge jumps (e.g. tab backgrounded)
        const safeDt = Math.min(dt, 0.1);

        this.callback(safeDt);
        
        this.animationFrameId = requestAnimationFrame(this.loop);
    }
}