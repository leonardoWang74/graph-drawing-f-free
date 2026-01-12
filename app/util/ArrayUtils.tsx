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