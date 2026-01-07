/** set `transparency` to a `hex` color e.g. hex='#123456ff', transparency='AA' => '#123456AA' */
export function ColorHexSetTransparency(hex: string, transparency: string) {
    if(!hex) return hex;
    if(!hex[0] === '#') return hex;

    // add transparency
    if(hex.length === 7) {
        return hex + transparency;
    }
    // replace transparency
    else if(hex.length === 9) {
        return hex.substring(0, 7) + transparency;
    }

    return hex;
}