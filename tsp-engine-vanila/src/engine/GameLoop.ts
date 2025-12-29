type TickCallback = (dt: number) => void;

export class GameLoop {
    private callbacks: TickCallback[] = [];

    add(callback: TickCallback) {
        this.callbacks.push(callback);
    }

    tick(dt: number) {
        for (const cb of this.callbacks) {
            cb(dt);
        }
    }
}