export class GameLoop {
    private lastTime = 0;
    private callback: (dt: number) => void;
    private running = false;
    elapsedTime = 0;

    constructor(callback: (dt: number) => void) {
        this.callback = callback;
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    stop() {
        this.running = false;
    }

    private loop = (time: number) => {
        if (!this.running) return;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        this.elapsedTime += dt;
        this.callback(dt);
        requestAnimationFrame(this.loop);
    }
}