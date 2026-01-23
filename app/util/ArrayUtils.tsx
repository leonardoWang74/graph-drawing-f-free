export function ArrayEquals<T>(array: T[], array2: T[]): boolean {
    if(array===undefined || array2===undefined) return false;
    if(array.length !== array2.length) return false;

    for(let i=0; i<array.length; ++i) {
        if(array[i] !== array2[i]) return false;
    }

    return true;
}

/** checks whether `arrayHasElements` contains all elements of `elements` */
export function ArrayContainsAll<T>(arrayHasElements: T[], elements: T[]): boolean {
    for(const v of elements) {
        if(!arrayHasElements.includes(v)) return false;
    }
    return true;
}

export function ArrayLast<T>(array: T[]): T|undefined {
    if(array===undefined || array.length===0) return undefined;
    return array[array.length-1];
}

// Source - https://stackoverflow.com/a/2450976
// Posted by ChristopheD, modified by community. See post 'Timeline' for change history
// Retrieved 2026-01-19, License - CC BY-SA 4.0
/** Fisher–Yates (aka Knuth) Shuffle */
export function ArrayShuffleInPlace(array) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
}

export function ArrayMaxima(iterable: Iterable<number>): { lowest: number, highest: number }|undefined {
    return IterableMaxima(iterable);
}

export function IterableMaxima(iterable: Iterable<number>): { lowest: number, highest: number }|undefined {
    if(iterable===undefined) return undefined;
    let lowest = undefined;
    let highest = undefined;
    for(const v of iterable) {
        if(lowest===undefined || v < lowest) lowest = v;
        if(highest===undefined || v > highest) highest = v;
    }
    if(lowest===undefined || highest===undefined) return undefined;

    return {lowest: lowest, highest: highest};
}
