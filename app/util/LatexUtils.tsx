export function LatexTypeset(math: string, display = true, em: number = 16, ex: number = 8, width: number = 80*em): undefined | Promise<string> {
    const MathJax = window['MathJax'];
    if(!MathJax) return;
    if(!MathJax.hasOwnProperty('tex2svgPromise')) {
        console.log('Mathjax tex2svgPromise not set. ', MathJax)
        return;
    }

    return MathJax.tex2svgPromise(math, {
        display: display,
        em,
        ex,
        containerWidth: width
    }).then((node) => {
        const adaptor = MathJax.startup.adaptor;
        return(adaptor.serializeXML(adaptor.tags(node, 'svg')[0]));
    }).catch(err => console.error(err));
}

export function ViewBoxGet(svgString: string, ex: number = 8) {
    const widthMatch = svgString.match(
        /\bwidth\s*=\s*["']\s*([0-9.+-]+(?:[a-z%]*)?)\s*["']/i
    );
    const heightMatch = svgString.match(
        /\bheight\s*=\s*["']\s*([0-9.+-]+(?:[a-z%]*)?)\s*["']/i
    );
    const widthString = widthMatch?.[1] ?? '0';
    const heightString = heightMatch?.[1] ?? '0';

    let width = 0;
    let height = 0;

    if(widthString.endsWith('ex')) {
        width = +widthString.substring(0, widthString.length-2) * ex;
    }
    if(heightString.endsWith('ex')) {
        height = +heightString.substring(0, heightString.length-2) * ex;
    }

    return {
        width,
        height,
    };
}
