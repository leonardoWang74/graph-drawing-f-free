export function SetGetAny<T>(set: Set<T>): T|undefined {
    for(const v of set) {
        return v;
    }
    return undefined;
}
