
// Adapted to TypeScript from:
// Source - https://stackoverflow.com/a/37900542
// Posted by Oriol, modified by community. See post 'Timeline' for change history
// Retrieved 2026-01-05, License - CC BY-SA 3.0
export default function Subsets<T>(set: Set<T>, n: number) {
    if(!Number.isInteger(n) || n < 0 || n > set.size) return function*(){}();
    let subset: (T|intrinsic)[] = new Array(n);
    let iterator: SetIterator<T> = set.values();
    return (function* backtrack(index, remaining) {
        if(index === n) {
            yield subset.slice();
        } else {
            for(var i=0; i<set.size; ++i) {
                subset[index] = iterator.next().value; /* Get first item */
                set.delete(subset[index]); /* Remove it */
                set.add(subset[index]); /* Insert it at the end */
                if(i <= remaining) {
                    yield* backtrack(index+1, remaining-i);
                }
            }
        }
    })(0, set.size-n);
}
