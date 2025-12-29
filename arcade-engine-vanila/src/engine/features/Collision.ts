export class Collision {
    // Axis-Aligned Bounding Box vs Circle
    // Rect is defined by center (rx, ry) and half-extents (rw, rh)
    static checkAABBCircle(rx: number, ry: number, rw: number, rh: number, cx: number, cy: number, cr: number): boolean {
        const distIdx = Math.abs(cx - rx);
        const distIdy = Math.abs(cy - ry);

        if (distIdx > (rw + cr)) { return false; }
        if (distIdy > (rh + cr)) { return false; }

        if (distIdx <= rw) { return true; } 
        if (distIdy <= rh) { return true; }

        const dx = distIdx - rw;
        const dy = distIdy - rh;
        return (dx * dx + dy * dy) <= (cr * cr);
    }
}