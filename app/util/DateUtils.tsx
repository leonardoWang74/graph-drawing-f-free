
export function DateToLocalWithTime(d: Date) {
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}