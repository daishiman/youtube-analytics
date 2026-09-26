/** Queue の一括送信上限（1回100通）より小さく区切って送る */
export const QUEUE_SEND_BATCH_SIZE = 50;

export async function sendInBatches<Body>(queue: Queue<Body>, bodies: Body[]): Promise<void> {
  for (let offset = 0; offset < bodies.length; offset += QUEUE_SEND_BATCH_SIZE) {
    await queue.sendBatch(
      bodies.slice(offset, offset + QUEUE_SEND_BATCH_SIZE).map((body) => ({ body })),
    );
  }
}
