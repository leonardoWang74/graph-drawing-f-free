export default class Vector2 {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public plus(b: Vector2): Vector2 {
        return new Vector2(this.x + b.x, this.y + b.y);
    }
    public minus(b: Vector2): Vector2 {
        return new Vector2(this.x - b.x, this.y - b.y);
    }
    public round(): Vector2 {
        return new Vector2(Math.round(this.x), Math.round(this.y));
    }
    public grid(gridSize: number): Vector2 {
        if(gridSize<=1) return new Vector2(this.x, this.y);
        return new Vector2(Math.round(this.x/gridSize)*gridSize, Math.round(this.y/gridSize)*gridSize);
    }

    public toString() : string {
        return `(${this.x}, ${this.y})`;
    }

    public toStringFraction(fractionDigits: number) : string {
        return `(${this.x.toFixed(fractionDigits)}, ${this.y.toFixed(fractionDigits)})`;
    }
}
