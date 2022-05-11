const getMemoryRegion = new NativeFunction(NULL, "pointer", ["pointer"], { scheduling: "exclusive", exceptions: "propagate" });
const intBuf = Memory.alloc(4);
let cachedApi: Api | null = null;

class Runtime {
    regs = new RegsView();

    bootrom = new MemoryView("bootrom");
    cram = new MemoryView("cram");
    bram = new MemoryView("bram");
    mem25bitram = new MemoryView("mem25bitram");
    a3000lram = new MemoryView("a3000lram");
    a3000hram = new MemoryView("a3000hram");
}

class RegsView {
    get d0() { return readRegister(0); }
    get d1() { return readRegister(1); }
    get d2() { return readRegister(2); }
    get d3() { return readRegister(3); }
    get d4() { return readRegister(4); }
    get d5() { return readRegister(5); }
    get d6() { return readRegister(6); }
    get d7() { return readRegister(7); }

    get a0() { return readRegister(8); }
    get a1() { return readRegister(9); }
    get a2() { return readRegister(10); }
    get a3() { return readRegister(11); }
    get a4() { return readRegister(12); }
    get a5() { return readRegister(13); }
    get a6() { return readRegister(14); }
    get a7() { return readRegister(15); }

    get pc() { return getApi().regs.add(72).readU32(); }
    get pcPtr() { return getApi().regs.add(76).readPointer(); }
}

function readRegister(index: number): number {
    return getApi().regs.add(index * 4).readU32();
}

class MemoryView {
    #id: MemoryId;

    constructor(id: MemoryId) {
        this.#id = id;
    }

    get base(): NativePointer {
        return getMemoryRegion.call(getApi().memGetters[this.#id], intBuf);
    }

    get size(): number {
        getMemoryRegion.call(getApi().memGetters[this.#id], intBuf);
        return intBuf.readInt();
    }

    get data(): ArrayBuffer {
        const baseAddress = getMemoryRegion.call(getApi().memGetters[this.#id], intBuf);
        return ArrayBuffer.wrap(baseAddress, intBuf.readInt());
    }
}

export = new Runtime();

interface Api {
    regs: NativePointer;
    memGetters: MemoryGetters;
}

type MemoryId = keyof MemoryGetters;

interface MemoryGetters {
    bootrom: NativePointer;
    cram: NativePointer;
    bram: NativePointer;
    mem25bitram: NativePointer;
    a3000lram: NativePointer;
    a3000hram: NativePointer;
}

function getApi(): Api {
    if (cachedApi === null) {
        cachedApi = importApi();
    }
    return cachedApi;
}

function importApi(): Api {
    if (Process.arch !== "arm") {
        throw new Error("Unsupported architecture");
    }

    const amiberry = Process.enumerateModules()[0];
    const codeRanges = amiberry.enumerateRanges("r-x");

    const setStopped = locateCode("m68k_setstopped()", [
        "70 40 2d e9",  // push {r4, r5, r6, lr}
        "?? 4? 0? e3",  // movw r4, #a
        "?? 4? 4? e3",  // movt r4, #b
        "64 30 94 e5",  // ldr  r3, [r4, #100]
        "7f 20 d4 e5",  // ldrb r2, [r4, #0x7f]
    ], codeRanges);
    const movw = Instruction.parse(setStopped.add(4)) as ArmInstruction;
    const movt = Instruction.parse(setStopped.add(8)) as ArmInstruction;
    const regs = ptr(((movt.operands[1].value as number) << 16) | movw.operands[1].value as number);

    const bootrom = locateCode("save_bootrom()", [
        "3? 0? e3",     // movw   r3, #a
        "?? 3? 4? e3",  // movt   r3, #b
        "00 30 93 e5",  // ldr    r3, [r3]
        "00 00 53 e3",  // cmp    r3, #0
        "?? 2? 0? 13",  // movwne r2, #c
        "?? 2? 4? 13",  // movtne r2, #d
    ], codeRanges).sub(1);
    const BX_LR_PATTERN = "1e ff 2f e1";
    const returns = Memory.scanSync(bootrom, 1024, BX_LR_PATTERN).map(m => m.address);
    const cram = returns[0].add(4);
    const bram = returns[1].add(4);
    const mem25bitram = returns[2].add(4);
    const a3000lram = returns[3].add(4);
    const a3000hram = returns[4].add(4);

    return {
        regs,
        memGetters: {
            bootrom,
            cram,
            bram,
            mem25bitram,
            a3000lram,
            a3000hram,
        }
    };
}

function locateCode(name: string, signature: string[], ranges: RangeDetails[]): NativePointer {
    const pattern = new MatchPattern(signature.join(""));
    const candidates: NativePointer[] = [];
    for (const range of ranges) {
        const matches = Memory.scanSync(range.base, range.size, pattern);
        candidates.push(...matches.map(m => m.address));
    }
    if (candidates.length !== 1) {
        throw new Error(`Unable to find ${name} (candidates.length=${candidates.length})`);
    }
    return candidates[0];
}
