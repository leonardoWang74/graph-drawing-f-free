
export async function PromiseWait(waitMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, waitMs);
    });
}
