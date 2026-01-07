export function ArrayEquals<T>(array: T[], array2: T[]): boolean {
    if(array===undefined || array2===undefined) return false;
    if(array.length !== array2.length) return false;

    for(let i=0; i<array.length; ++i) {
        if(array[i] !== array2[i]) return false;
    }

    return true;
}