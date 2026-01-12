export function EventKeyboardCanFire(e: KeyboardEvent) {
    // pressing CTRL means you want some other function
    if(e.ctrlKey) return true;
    // currently inside an input element - just want to write text
    if(e.target instanceof Element && e.target.tagName.toLowerCase() === 'input') {
        // console.log('EventKeyboardCanFire = false. Target:', e.target);
        return false;
    }
    // otherwise fine
    return true;
}
