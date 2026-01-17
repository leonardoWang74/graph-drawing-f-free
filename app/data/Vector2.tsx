export default class Vector2 {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    public static fromAngleAndLength(angleInRadians: number, length: number): Vector2 {
        return new Vector2(length * Math.cos(angleInRadians), length * Math.sin(angleInRadians));
    }

    public plus(b: Vector2): Vector2 {
        return new Vector2(this.x + b.x, this.y + b.y);
    }
    public minus(b: Vector2): Vector2 {
        return new Vector2(this.x - b.x, this.y - b.y);
    }
    public mult(s: number): Vector2 {
        return new Vector2(this.x * s, this.y * s);
    }
    public divide(s: number): Vector2 {
        return new Vector2(this.x / s, this.y / s);
    }
    public unit(): Vector2 {
        const length = this.length();
        return new Vector2(this.x / length, this.y / length);
    }
    public round(): Vector2 {
        return new Vector2(Math.round(this.x), Math.round(this.y));
    }
    public length(): number {
        return Math.hypot(this.x, this.y);
    }
    public clone(): Vector2 {
        return new Vector2(this.x, this.y);
    }
    public abs(): Vector2 {
        return new Vector2(Math.abs(this.x), Math.abs(this.y));
    }

    /** returns the distance of `current` to a line starting in the `initial` point with slant `angleRadians` */
    public static distancePointToLine(initial: Vector2, current: Vector2, angleRadians: number): number {
        const dx = current.x - initial.x;
        const dy = current.y - initial.y;

        return Math.abs(
            dx * Math.sin(angleRadians) - dy * Math.cos(angleRadians)
        );
    }

    // https://www.geeksforgeeks.org/dsa/convex-hull-monotone-chain-algorithm/
    // retrieved 13.01.2026
    public static crossProduct(O: Vector2, A: Vector2, B: Vector2) {
        return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
    }

    public static toArrayStatic(a: Vector2): number[] {
        return [a.x, a.y];
    }
    public static toVectorStatic(point: number[]) {
        if(point.length < 2) return new Vector2(0,0);
        return new Vector2(point[0], point[1]);
    }

    public static concaveHull(A: Vector2[]): Vector2[] {
        let n = A.length;
        let k = 0;

        if (n <= 3)
            return A;

        let ans = new Array(2 * n);

        // Sort points lexicographically
        A.sort((a, b) => {
            return a.x < b.x || (a.x == b.x && a.y < b.y) ? -1 : 1;
        });

        // Build lower hull
        for (let i = 0; i < n; ++i) {

            // If the point at K-1 position is not a part
            // of hull as vector from ans[k-2] to ans[k-1]
            // and ans[k-2] to A[i] has a clockwise turn
            while (k >= 2 && Vector2.crossProduct(ans[k - 2], ans[k - 1], A[i]) <= 0)
                k--;
            ans[k++] = A[i];
        }

        // Build upper hull
        for (let i = n - 1, t = k + 1; i > 0; --i) {

            // If the point at K-1 position is not a part
            // of hull as vector from ans[k-2] to ans[k-1]
            // and ans[k-2] to A[i] has a clockwise turn
            while (k >= t && Vector2.crossProduct(ans[k - 2], ans[k - 1], A[i - 1]) <= 0)
                k--;
            ans[k++] = A[i - 1];
        }

        // Resize the array to desired size
        ans.length = k - 1;

        return ans;
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
