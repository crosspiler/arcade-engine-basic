export class Grid<T> {
    readonly width: number;
    readonly height: number;
    private data: T[][];

    constructor(width: number, height: number, initializer: T | ((x: number, y: number) => T)) {
        this.width = width;
        this.height = height;
        this.data = [];
        
        for (let x = 0; x < width; x++) {
            const col: T[] = [];
            for (let y = 0; y < height; y++) {
                const val = (initializer instanceof Function) ? initializer(x, y) : initializer;
                col.push(val);
            }
            this.data.push(col);
        }
    }

    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    get(x: number, y: number): T | undefined {
        if (!this.isValid(x, y)) return undefined;
        return this.data[x][y];
    }

    set(x: number, y: number, value: T) {
        if (this.isValid(x, y)) {
            this.data[x][y] = value;
        }
    }

    swap(x1: number, y1: number, x2: number, y2: number) {
        if (this.isValid(x1, y1) && this.isValid(x2, y2)) {
            const tmp = this.data[x1][y1];
            this.data[x1][y1] = this.data[x2][y2];
            this.data[x2][y2] = tmp;
        }
    }

    forEach(callback: (value: T, x: number, y: number) => void) {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                callback(this.data[x][y], x, y);
            }
        }
    }

    getColumn(x: number): T[] {
        if (!this.isValid(x, 0)) return [];
        return [...this.data[x]];
    }

    clone(): Grid<T> {
        const first = this.data.length > 0 && this.data[0].length > 0 ? this.data[0][0] : undefined;
        const newGrid = new Grid<T>(this.width, this.height, first as any);
        for(let x=0; x<this.width; x++) {
            for(let y=0; y<this.height; y++) {
                newGrid.set(x, y, this.data[x][y]);
            }
        }
        return newGrid;
    }
}