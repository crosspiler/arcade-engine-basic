export class Grid<T> {
    width: number;
    height: number;
    data: T[];

    constructor(width: number, height: number, initial: T | (() => T)) {
        this.width = width;
        this.height = height;
        this.data = new Array(width * height);
        for (let i = 0; i < this.data.length; i++) {
            this.data[i] = typeof initial === 'function' ? (initial as any)() : initial;
        }
    }

    get(x: number, y: number): T {
        if (!this.isValid(x, y)) return this.data[0]; // Fallback
        return this.data[y * this.width + x];
    }

    set(x: number, y: number, value: T) {
        if (this.isValid(x, y)) {
            this.data[y * this.width + x] = value;
        }
    }

    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    forEach(callback: (value: T, x: number, y: number) => void) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                callback(this.get(x, y), x, y);
            }
        }
    }
}