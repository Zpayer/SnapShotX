/**
 * worker.js
 * Runs decode / encode off the main thread.
 *
 * Incoming:
 *   { type: 'decode', id, buffer: ArrayBuffer }   — buffer is transferred (zero-copy)
 *   { type: 'encode', id, data: object }
 *
 * Outgoing:
 *   { type: 'progress', id, pct }
 *   { type: 'done',     id, result }              — result buffer transferred on encode
 *   { type: 'error',    id, message }
 */

import { getWorldData, setWorldData } from './decoder.js';

self.onmessage = ({ data: msg }) => {
    const { type, id } = msg;
    const progress = pct => self.postMessage({ type: 'progress', id, pct });

    try {
        if (type === 'decode') {
            // getWorldData is now synchronous — no await needed
            const result = getWorldData(new Uint8Array(msg.buffer), progress);
            self.postMessage({ type: 'done', id, result });

        } else if (type === 'encode') {
            const bytes = setWorldData(msg.data, progress);
            // Transfer the ArrayBuffer back — zero-copy
            self.postMessage({ type: 'done', id, result: bytes }, [bytes.buffer]);

        } else {
            throw new Error(`Unknown message type: "${type}"`);
        }
    } catch (err) {
        self.postMessage({ type: 'error', id, message: err.message });
    }
};
