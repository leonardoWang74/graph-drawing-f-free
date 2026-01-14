export function EventKeyboardCanFire(e: KeyboardEvent, onlyTestTarget: boolean = false) {
    // pressing CTRL means you want some other function
    if(!onlyTestTarget && e.ctrlKey) return true;
    // currently inside an input element - just want to write text
    if(e.target instanceof Element) {
        // console.log('EventKeyboardCanFire = false. Target:', e.target);
        if(e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return false;
    }
    // otherwise fine
    return true;
}
