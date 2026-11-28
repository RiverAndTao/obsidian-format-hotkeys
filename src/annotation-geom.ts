/** 高亮范围拖动用的纯偏移计算。文档坐标含 span 标签，展开坐标是拿掉这一对标签之后的位置。 */

export interface AnnoOffsets {
    from: number;
    to: number;
    innerFrom: number;
    innerTo: number;
}

export function openLen(ann: AnnoOffsets): number {
    return ann.innerFrom - ann.from;
}

export function closeLen(ann: AnnoOffsets): number {
    return ann.to - ann.innerTo;
}

export function innerLen(ann: AnnoOffsets): number {
    return ann.innerTo - ann.innerFrom;
}

/** 把当前文档位置换成「去掉这对标签之后」的位置 */
export function unwrapPos(ann: AnnoOffsets, pos: number): number {
    const open = openLen(ann);
    const close = closeLen(ann);
    const inner = innerLen(ann);
    if (pos <= ann.from) {
        return pos;
    }
    if (pos >= ann.to) {
        return pos - open - close;
    }
    if (pos < ann.innerFrom) {
        return ann.from;
    }
    if (pos <= ann.innerTo) {
        return ann.from + (pos - ann.innerFrom);
    }
    return ann.from + inner;
}

/** 展开坐标里的起点，对应回当前文档（可见文字上） */
export function startDocPos(ann: AnnoOffsets, ns: number): number {
    if (ns < ann.from) {
        return ns;
    }
    return ann.innerFrom + (ns - ann.from);
}

/** 展开坐标里的终点（不含），对应回当前文档 */
export function endDocPos(ann: AnnoOffsets, ne: number): number {
    const originNe = ann.from + innerLen(ann);
    if (ne <= originNe) {
        return ann.innerFrom + (ne - ann.from);
    }
    return ann.to + (ne - originNe);
}

export function resizedInner(doc: string, ann: AnnoOffsets, ns: number, ne: number): string | null {
    const edit = resizeReplacement(doc, ann, ns, ne);
    return edit ? edit.inner : null;
}

/**
 * 拖动后要替换的文档区间。
 * 扩进去的文字从原处拿掉，收出去的文字留在高亮外面，不会复制一份。
 */
export function resizeReplacement(
    doc: string,
    ann: AnnoOffsets,
    ns: number,
    ne: number
): { from: number; to: number; before: string; inner: string; after: string } | null {
    if (ann.innerFrom < ann.from || ann.innerTo < ann.innerFrom || ann.to < ann.innerTo) {
        return null;
    }
    const inner = doc.slice(ann.innerFrom, ann.innerTo);
    const originNs = ann.from;
    const originNe = originNs + inner.length;
    const unwrapped = doc.slice(0, ann.from) + inner + doc.slice(ann.to);
    if (ns < 0 || ne > unwrapped.length || ne <= ns) {
        return null;
    }
    const fromU = Math.min(ns, originNs);
    const toU = Math.max(ne, originNe);
    const docFrom = fromU < originNs ? fromU : ann.from;
    const docTo = toU > originNe ? ann.to + (toU - originNe) : ann.to;
    const middle = unwrapped.slice(fromU, toU);
    const relNs = ns - fromU;
    const relNe = ne - fromU;
    return {
        from: docFrom,
        to: docTo,
        before: middle.slice(0, relNs),
        inner: middle.slice(relNs, relNe),
        after: middle.slice(relNe),
    };
}

/** 拖动过程中，相对原高亮多出来和被裁掉的当前文档区间 */
export function previewSegments(
    ann: AnnoOffsets,
    ns: number,
    ne: number
): { add: Array<[number, number]>; cut: Array<[number, number]> } {
    const originNs = ann.from;
    const originNe = ann.from + innerLen(ann);
    const add: Array<[number, number]> = [];
    const cut: Array<[number, number]> = [];
    if (ns < originNs) {
        add.push([ns, originNs]);
    } else if (ns > originNs) {
        cut.push([ann.innerFrom, ann.innerFrom + (ns - originNs)]);
    }
    if (ne > originNe) {
        add.push([ann.to, ann.to + (ne - originNe)]);
    } else if (ne < originNe) {
        cut.push([ann.innerTo - (originNe - ne), ann.innerTo]);
    }
    return { add, cut };
}

function unwrappedIndexToDoc(ann: AnnoOffsets, index: number): number {
    const inner = innerLen(ann);
    if (index < ann.from) {
        return index;
    }
    if (index < ann.from + inner) {
        return ann.innerFrom + (index - ann.from);
    }
    return ann.to + (index - ann.from - inner);
}

/** 避免把一个代理对从中间切开 */
export function snapUnwrappedIndex(doc: string, ann: AnnoOffsets, index: number, edge: "start" | "end"): number {
    const len = doc.length - openLen(ann) - closeLen(ann);
    if (index <= 0 || index >= len) {
        return Math.max(0, Math.min(len, index));
    }
    const curr = doc.charCodeAt(unwrappedIndexToDoc(ann, index));
    const prev = doc.charCodeAt(unwrappedIndexToDoc(ann, index - 1));
    if (prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff) {
        return edge === "start" ? index - 1 : index + 1;
    }
    return index;
}

/**
 * 拖动不能穿过的区间（其它批注、代码块），坐标是当前文档。
 * 另外停在空行处，避免一下扫进下一段。
 */
export function limitsFromBlocks(
    doc: string,
    ann: AnnoOffsets,
    outside: Array<[number, number]>
): { minNs: number; maxNe: number } {
    const open = openLen(ann);
    const close = closeLen(ann);
    const inner = doc.slice(ann.innerFrom, ann.innerTo);
    const originNs = ann.from;
    const originNe = originNs + inner.length;
    const unwrappedLen = doc.length - open - close;
    let minNs = 0;
    let maxNe = unwrappedLen;

    for (const [from, to] of outside) {
        if (to <= ann.from) {
            minNs = Math.max(minNs, to);
        } else if (from >= ann.to) {
            maxNe = Math.min(maxNe, from - open - close);
        }
    }

    const unwrapped = doc.slice(0, ann.from) + inner + doc.slice(ann.to);
    const blank = /\n[ \t]*\n/g;
    let match: RegExpExecArray | null;
    while ((match = blank.exec(unwrapped))) {
        const after = match.index + match[0].length;
        if (after <= originNs) {
            minNs = Math.max(minNs, after);
        } else if (match.index >= originNe) {
            maxNe = Math.min(maxNe, match.index);
            break;
        }
    }

    if (minNs > originNs) {
        minNs = originNs;
    }
    if (maxNe < originNe) {
        maxNe = originNe;
    }
    if (minNs < 0) {
        minNs = 0;
    }
    if (maxNe > unwrappedLen) {
        maxNe = unwrappedLen;
    }
    return { minNs, maxNe };
}
