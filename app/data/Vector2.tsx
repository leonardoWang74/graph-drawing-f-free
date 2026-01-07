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

    public toString() : string {
        return `(${this.x}, ${this.y})`;
    }

    public toStringFraction(fractionDigits: number) : string {
        return `(${this.x.toFixed(fractionDigits)}, ${this.y.toFixed(fractionDigits)})`;
    }
}
