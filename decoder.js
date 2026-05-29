/**
 * decoder.js
 * High-performance binary decoder/encoder for KoGaMa world snapshots.
 *
 * Key design decisions:
 *  - ReadBuffer  wraps the raw Uint8Array with a DataView — zero allocations on reads.
 *  - WriteBuffer pre-allocates and doubles capacity when full — no per-byte push().
 *  - All multi-byte reads/writes use DataView directly (no typed-array reversal dance).
 *  - The format is big-endian (original code reversed bytes before reading).
 *  - No sleep() yields — this runs inside a Worker so the main thread is never blocked.
 */

import { WorldObjectTypes } from './enums.js';

// ─── Read buffer ──────────────────────────────────────────────────────────────
// Wraps an existing Uint8Array. Zero heap allocations during reads.

export class ReadBuffer {
    /** @param {Uint8Array} u8 */
    constructor(u8) {
        this._u8  = u8;
        this._dv  = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        this._pos = 0;
    }

    get pos() { return this._pos; }

    ReadByte()  { return this._u8[this._pos++]; }
    ReadBool()  { return this._u8[this._pos++] !== 0; }

    // The original code stored multi-byte values big-endian (it reversed bytes
    // before feeding them into a little-endian TypedArray).
    ReadShort() { const v = this._dv.getInt16(this._pos, false);  this._pos += 2; return v; }
    ReadInt()   { const v = this._dv.getInt32(this._pos, false);  this._pos += 4; return v; }
    ReadFloat() { const v = this._dv.getFloat32(this._pos, false);this._pos += 4; return v; }
    ReadLong()  { const v = this._dv.getBigInt64(this._pos, false);this._pos += 8; return v; }

    /** Returns a *view* into the underlying buffer — no copy. */
    ReadBytes(n) {
        const view = this._u8.subarray(this._pos, this._pos + n);
        this._pos += n;
        return view;
    }

    ReadByteArray(size = -1) {
        if (size < 0) size = this.ReadInt();
        // Return a real Array so downstream code can spread/index freely
        return Array.from(this.ReadBytes(size));
    }

    ReadString(size = -1) {
        if (size < 0) size = this.ReadShort();
        const bytes = this._u8.subarray(this._pos, this._pos + size);
        this._pos += size;
        return _decoder.decode(bytes);
    }

    ReadCompressedUInt32() {
        let num = 0, shift = 0;
        while (true) {
            const b = this._u8[this._pos++];
            num |= (b & 0x7F) << shift;
            if ((b & 0x80) === 0) return num;
            shift += 7;
        }
    }

    /** Read a length-prefixed sub-buffer (ReadInt bytes) and return a new ReadBuffer. */
    ReadSubBuffer() {
        const len  = this.ReadInt();
        const view = this._u8.subarray(this._pos, this._pos + len);
        this._pos += len;
        return new ReadBuffer(view);
    }
}

// ─── Write buffer ─────────────────────────────────────────────────────────────
// Pre-allocated, doubling-growth strategy. No per-byte allocations.

const INITIAL_CAPACITY = 1 << 20; // 1 MB

export class WriteBuffer {
    constructor(initialCapacity = INITIAL_CAPACITY) {
        this._buf = new ArrayBuffer(initialCapacity);
        this._u8  = new Uint8Array(this._buf);
        this._dv  = new DataView(this._buf);
        this._pos = 0;
    }

    _ensure(n) {
        if (this._pos + n <= this._u8.length) return;
        let cap = this._u8.length;
        while (cap < this._pos + n) cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this._u8);
        this._buf = next.buffer;
        this._u8  = next;
        this._dv  = new DataView(this._buf);
    }

    WriteByte(v)  { this._ensure(1); this._u8[this._pos++] = v & 0xFF; }
    WriteBool(v)  { this.WriteByte(v ? 1 : 0); }

    WriteShort(v, be = true) {
        this._ensure(2);
        if (be) this._dv.setInt16(this._pos, v, false);
        else    this._dv.setInt16(this._pos, v, true);
        this._pos += 2;
    }

    WriteInt(v, be = true) {
        this._ensure(4);
        if (be) this._dv.setInt32(this._pos, v, false);
        else    this._dv.setInt32(this._pos, v, true);
        this._pos += 4;
    }

    WriteFloat(v, be = true) {
        this._ensure(4);
        if (be) this._dv.setFloat32(this._pos, v, false);
        else    this._dv.setFloat32(this._pos, v, true);
        this._pos += 4;
    }

    WriteLong(v, be = true) {
        this._ensure(8);
        if (be) this._dv.setBigInt64(this._pos, v, false);
        else    this._dv.setBigInt64(this._pos, v, true);
        this._pos += 8;
    }

    WriteBytes(arr) {
        const len = arr.length;
        this._ensure(len);
        if (arr instanceof Uint8Array) {
            this._u8.set(arr, this._pos);
        } else {
            for (let i = 0; i < len; i++) this._u8[this._pos + i] = arr[i];
        }
        this._pos += len;
    }

    WriteString(str, writeLen = true) {
        const len = str.length;
        if (writeLen) this.WriteShort(len);
        this._ensure(len);
        for (let i = 0; i < len; i++) this._u8[this._pos + i] = str.charCodeAt(i);
        this._pos += len;
    }

    WriteByteArray(arr) {
        this.WriteInt(arr.length);
        this.WriteBytes(arr);
    }

    WriteCompressedUInt32(num) {
        while (num >= 128) { this.WriteByte((num | 128) & 0xFF); num >>>= 7; }
        this.WriteByte(num & 0xFF);
    }

    /** Returns a trimmed Uint8Array view of the written data (no copy). */
    toUint8Array() {
        return this._u8.subarray(0, this._pos);
    }

    /**
     * Write a length-prefixed sub-buffer.
     * Calls the provided function with a fresh WriteBuffer, then appends
     * [int32 length][bytes] into this buffer.
     * @param {(wb: WriteBuffer) => void} fn
     */
    writeSubBuffer(fn) {
        const sub = new WriteBuffer(4096);
        fn(sub);
        const data = sub.toUint8Array();
        this.WriteInt(data.length);
        this.WriteBytes(data);
    }
}

// ─── Shared TextDecoder (reused, not recreated per string) ────────────────────
const _decoder = new TextDecoder();

// ─── Decoders ─────────────────────────────────────────────────────────────────

function readCube(buf) {
    const x = buf.ReadShort(), y = buf.ReadShort(), z = buf.ReadShort();
    const flags = buf.ReadByte();
    const cube  = { x, y, z, flags, inRow: false };

    if ((flags & 1) === 0) cube.corners   = buf.ReadByteArray(8);
    if ((flags & 2) === 0) cube.materials = buf.ReadByteArray(6);
    else                   cube.material  = buf.ReadByte();

    return cube;
}

function readWorldCubes(buf) {
    const sub   = buf.ReadSubBuffer();
    const count = sub.ReadInt();
    const chunk = [];

    for (let i = 0; i < count; i++) {
        const cube = readCube(sub);
        chunk.push(cube);
        const rows = cube.flags >> 2;
        for (let j = 1; j < rows; j++) {
            chunk.push({ ...cube, x: cube.x + j, inRow: true });
        }
    }
    return chunk;
}

function readWorldPrototypes(buf) {
    const count = buf.ReadInt();
    const chunk = new Array(count);
    for (let i = 0; i < count; i++) {
        chunk[i] = {
            Id:              buf.ReadInt(),
            Scale:           buf.ReadFloat(),
            AuthorProfileId: buf.ReadInt(),
            Data:            readWorldCubes(buf),
        };
    }
    return chunk;
}

function readWorldObjectData(buf) {
    const count = buf.ReadInt();
    if (count > 1000) throw new Error('Object data param count exceeded 1000');
    const data = Object.create(null);

    for (let i = 0; i < count; i++) {
        const key  = buf.ReadString(buf.ReadCompressedUInt32());
        const type = buf.ReadByte();
        let   value;

        switch (type) {
            case 0:  value = buf.ReadInt();   break;
            case 1:  { const n = buf.ReadInt();   value = new Array(n); for (let j=0;j<n;j++) value[j]=buf.ReadInt();   break; }
            case 2:  value = buf.ReadFloat(); break;
            case 3:  { const n = buf.ReadInt();   value = new Array(n); for (let j=0;j<n;j++) value[j]=buf.ReadFloat(); break; }
            case 5:  value = buf.ReadBool();  break;
            case 6:  { const n = buf.ReadInt();   value = new Array(n); for (let j=0;j<n;j++) value[j]=buf.ReadBool();  break; }
            case 7:  value = buf.ReadString(buf.ReadCompressedUInt32()); break;
            case 8:  value = readWorldObjectData(buf); break;
            case 9:  value = buf.ReadByte();  break;
            case 10: value = buf.ReadLong();  break;
            case 11: { const n = buf.ReadInt(); value = new Array(n); for (let j=0;j<n;j++) value[j]=buf.ReadLong(); break; }
            default: throw new Error(`Unknown object data type: ${type}`);
        }
        data[key] = type === 8 ? value : [value, type];
    }
    return data;
}

function readWorldObjects(buf) {
    const count = buf.ReadInt();
    const chunk = new Array(count);

    for (let i = 0; i < count; i++) {
        const Id              = buf.ReadInt();
        const GroupId         = buf.ReadInt();
        const ItemId          = buf.ReadInt();
        const WorldObjectTypeId = buf.ReadInt();
        const Position  = { X: buf.ReadFloat(), Y: buf.ReadFloat(), Z: buf.ReadFloat() };
        const Rotation  = { X: buf.ReadFloat(), Y: buf.ReadFloat(), Z: buf.ReadFloat(), W: buf.ReadFloat() };
        const Scale     = { X: buf.ReadFloat(), Y: buf.ReadFloat(), Z: buf.ReadFloat() };
        const Data      = readWorldObjectData(buf);
        const OwnerShipFlag = buf.ReadByte();

        let OwnerActorNumber      = null;
        let PreviewOwnerProfileId = null;
        if (OwnerShipFlag & 1) OwnerActorNumber      = buf.ReadInt();
        if (OwnerShipFlag & 2) PreviewOwnerProfileId = buf.ReadInt();

        const RuntimeData = readWorldObjectData(buf);

        chunk[i] = {
            Id, GroupId, ItemId,
            WorldObjectTypeId,
            WorldObjectType: WorldObjectTypes[WorldObjectTypeId] ?? WorldObjectTypeId,
            Position, Rotation, Scale,
            Data, OwnerShipFlag,
            OwnerActorNumber, PreviewOwnerProfileId,
            RuntimeData,
        };
    }
    return chunk;
}

function readLinks(buf) {
    const count = buf.ReadInt();
    const chunk = new Array(count);
    for (let i = 0; i < count; i++) {
        chunk[i] = { Id: buf.ReadInt(), LinkToID: buf.ReadInt(), LinkFromID: buf.ReadInt() };
    }
    return chunk;
}

// ─── Encoders ─────────────────────────────────────────────────────────────────

function writeWorldCubes(buf, data) {
    buf.writeSubBuffer(sub => {
        const cubesInRow = data.filter(c => !c.inRow);
        sub.WriteInt(cubesInRow.length);
        for (const { x, y, z, flags, materials, corners, material } of cubesInRow) {
            sub.WriteShort(x); sub.WriteShort(y); sub.WriteShort(z);
            sub.WriteByte(flags);
            if ((flags & 1) === 0) sub.WriteBytes(corners);
            if ((flags & 2) === 0) sub.WriteBytes(materials);
            else                   sub.WriteByte(material);
        }
    });
}

function writeWorldPrototypes(buf, data) {
    buf.WriteInt(data.length);
    for (const { Id, Scale, AuthorProfileId, Data } of data) {
        buf.WriteInt(Id);
        buf.WriteFloat(Scale);
        buf.WriteInt(AuthorProfileId);
        writeWorldCubes(buf, Data);
    }
}

function writeWorldObjectData(buf, data) {
    const keys = Object.keys(data);
    buf.WriteInt(keys.length);

    for (const key of keys) {
        const entry    = data[key];
        const isNested = !Array.isArray(entry);
        const type     = isNested ? 8 : entry[1];
        const value    = isNested ? entry : entry[0];

        buf.WriteCompressedUInt32(key.length);
        buf.WriteString(key, false);
        buf.WriteByte(type);

        switch (type) {
            case 0:  buf.WriteInt(value);   break;
            case 1: case 4: {
                const ks = Object.keys(value);
                buf.WriteInt(ks.length);
                for (const k of ks) buf.WriteInt(Number(k));
                break;
            }
            case 2:  buf.WriteFloat(value); break;
            case 3:  buf.WriteInt(value.length); for (const v of value) buf.WriteFloat(v); break;
            case 5:  buf.WriteBool(value);  break;
            case 6:  buf.WriteInt(value.length); for (const v of value) buf.WriteBool(v);  break;
            case 7:  buf.WriteCompressedUInt32(value.length); buf.WriteString(value, false); break;
            case 8:  writeWorldObjectData(buf, value); break;
            case 9:  buf.WriteByte(value);  break;
            case 10: buf.WriteLong(value);  break;
            case 11: buf.WriteInt(value.length); for (const v of value) buf.WriteLong(v);  break;
            default: throw new Error(`Unknown type: ${type}`);
        }
    }
}

function writeWorldObjects(buf, data) {
    buf.WriteInt(data.length);
    for (const obj of data) {
        const { Id, GroupId, ItemId, WorldObjectTypeId, Data,
                Position: { X, Y, Z },
                Rotation: { X: X1, Y: Y1, Z: Z1, W },
                Scale:    { X: SX, Y: SY, Z: SZ },
                OwnerActorNumber, PreviewOwnerProfileId, RuntimeData } = obj;

        buf.WriteInt(Id); buf.WriteInt(GroupId); buf.WriteInt(ItemId); buf.WriteInt(WorldObjectTypeId);
        buf.WriteFloat(X);  buf.WriteFloat(Y);  buf.WriteFloat(Z);
        buf.WriteFloat(X1); buf.WriteFloat(Y1); buf.WriteFloat(Z1); buf.WriteFloat(W);
        buf.WriteFloat(SX); buf.WriteFloat(SY); buf.WriteFloat(SZ);
        writeWorldObjectData(buf, Data);

        const flag = (OwnerActorNumber  != null ? 1 : 0)
                   | (PreviewOwnerProfileId != null ? 2 : 0);
        buf.WriteByte(flag);
        if (flag & 1) buf.WriteInt(OwnerActorNumber);
        if (flag & 2) buf.WriteInt(PreviewOwnerProfileId);
        writeWorldObjectData(buf, RuntimeData);
    }
}

function writeLinks(buf, data) {
    buf.WriteInt(data.length);
    for (const { Id, LinkFromID, LinkToID } of data) {
        buf.WriteInt(Id); buf.WriteInt(LinkFromID); buf.WriteInt(LinkToID);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decode a full world snapshot.
 * @param {Uint8Array} u8
 * @param {(pct: number) => void} onProgress
 */
export function getWorldData(u8, onProgress) {
    const buf = new ReadBuffer(u8);
    const Prototypes   = readWorldPrototypes(buf);  onProgress(25);
    const WorldObjects = readWorldObjects(buf);     onProgress(50);
    const Links        = readLinks(buf);            onProgress(75);
    const ObjectLinks  = readLinks(buf);            onProgress(100);
    return { Prototypes, WorldObjects, Links, ObjectLinks };
}

/**
 * Encode a world snapshot to a Uint8Array.
 * @param {{ Prototypes, WorldObjects, Links, ObjectLinks }} data
 * @param {(pct: number) => void} onProgress
 * @returns {Uint8Array}
 */
export function setWorldData(data, onProgress) {
    const buf = new WriteBuffer();
    writeWorldPrototypes(buf, data.Prototypes);  onProgress(25);
    writeWorldObjects(buf, data.WorldObjects);   onProgress(50);
    writeLinks(buf, data.Links);                 onProgress(75);
    writeLinks(buf, data.ObjectLinks);           onProgress(100);
    buf.WriteInt(0); // terminator
    return buf.toUint8Array();
}

// ─── Legacy StreamBuffer (kept for modelToKTMODEL in app.js) ─────────────────
// Only used for the small .ktm export, not for world decode/encode.

export class StreamBuffer {
    constructor(array = []) { this.index = 0; this.array = array instanceof Array ? array : [...array]; }
    WriteByte(v)  { this.array.push(v & 0xFF); this.index++; }
    Write(arr)    { for (let i = 0; i < arr.length; i++) this.array.push(arr[i]); this.index += arr.length; }
    WriteShort(v, le = true) {
        const b = new Uint8Array(new Int16Array([v]).buffer);
        this.Write(le ? [b[1], b[0]] : [b[0], b[1]]);
        this.index += 2;
    }
    WriteFloat(v, le = true) {
        const b = new Uint8Array(new Float32Array([v]).buffer);
        this.Write(le ? [b[3],b[2],b[1],b[0]] : [b[0],b[1],b[2],b[3]]);
        this.index += 4;
    }
    WriteString(str, writeLen = true) {
        if (writeLen) this.WriteShort(str.length);
        for (let i = 0; i < str.length; i++) this.array.push(str.charCodeAt(i));
        this.index += str.length;
    }
}
