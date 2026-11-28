import {
    endDocPos,
    limitsFromBlocks,
    previewSegments,
    resizeReplacement,
    resizedInner,
    snapUnwrappedIndex,
    startDocPos,
    unwrapPos,
    type AnnoOffsets,
} from "../src/annotation-geom";

function assert(cond: boolean, message: string): void {
    if (!cond) {
        throw new Error(message);
    }
}

function span(before: string, inner: string, after: string): { doc: string; ann: AnnoOffsets } {
    const open = "<span>";
    const close = "</span>";
    const from = before.length;
    const innerFrom = from + open.length;
    const innerTo = innerFrom + inner.length;
    const to = innerTo + close.length;
    return {
        doc: before + open + inner + close + after,
        ann: { from, to, innerFrom, innerTo },
    };
}

function run(): void {
    const sample = span("hello ", "world", " tail");
    assert(resizedInner(sample.doc, sample.ann, sample.ann.from, sample.ann.from + 5) === "world", "原范围");
    assert(resizedInner(sample.doc, sample.ann, sample.ann.from, sample.ann.from + 6) === "world ", "向右扩一格");
    assert(resizedInner(sample.doc, sample.ann, sample.ann.from + 1, sample.ann.from + 5) === "orld", "向右收起点");
    assert(resizedInner(sample.doc, sample.ann, sample.ann.from - 1, sample.ann.from + 5) === " world", "向左扩一格");
    assert(resizedInner(sample.doc, sample.ann, 2, 2) === null, "空范围拒绝");

    const apply = (ns: number, ne: number): string => {
        const edit = resizeReplacement(sample.doc, sample.ann, ns, ne);
        assert(edit !== null, "替换区间");
        return sample.doc.slice(0, edit.from) + edit.before + "[" + edit.inner + "]" + edit.after + sample.doc.slice(edit.to);
    };
    assert(apply(sample.ann.from, sample.ann.from + 6) === "hello [world ]tail", "向右扩是移进去，不复制空格");
    assert(apply(sample.ann.from - 1, sample.ann.from + 5) === "hello[ world] tail", "向左扩是移进去");
    assert(apply(sample.ann.from, sample.ann.from + 4) === "hello [worl]d tail", "向右收是移出来");
    assert(apply(sample.ann.from + 1, sample.ann.from + 5) === "hello w[orld] tail", "向左收是移出来");

    const { ann } = sample;
    assert(unwrapPos(ann, 0) === 0, "标签前");
    assert(unwrapPos(ann, ann.from + 1) === ann.from, "开标签内部算起点");
    assert(unwrapPos(ann, ann.innerFrom + 2) === ann.from + 2, "正文内");
    assert(unwrapPos(ann, ann.innerTo) === ann.from + 5, "正文末尾");
    assert(unwrapPos(ann, ann.to + 1) === ann.from + 6, "标签后一格");

    const grown = previewSegments(ann, ann.from - 1, ann.from + 6);
    assert(grown.add.length === 2 && grown.add[0][0] === ann.from - 1 && grown.add[1][0] === ann.to, "两侧新增");
    assert(grown.cut.length === 0, "扩展时不裁");
    const shrunk = previewSegments(ann, ann.from + 1, ann.from + 4);
    assert(shrunk.cut[0][0] === ann.innerFrom && shrunk.cut[0][1] === ann.innerFrom + 1, "左侧裁掉");
    assert(shrunk.cut[1][0] === ann.innerTo - 1 && shrunk.cut[1][1] === ann.innerTo, "右侧裁掉");

    assert(startDocPos(ann, ann.from) === ann.innerFrom, "起点落在正文");
    assert(startDocPos(ann, ann.from - 2) === ann.from - 2, "起点在标签前");
    assert(endDocPos(ann, ann.from + 5) === ann.innerTo, "终点落在正文末");
    assert(endDocPos(ann, ann.from + 7) === ann.to + 2, "终点在标签后");

    const blocked = span("para one\n\nhello ", "SPAN", " world");
    const limits = limitsFromBlocks(blocked.doc, blocked.ann, [[blocked.ann.to, blocked.doc.length]]);
    const afterBlank = "para one\n\n".length;
    assert(limits.minNs === afterBlank, "空行之前不能再往左");
    assert(limits.maxNe === blocked.ann.from + "SPAN".length, "紧挨着的后一段挡住右边界");

    const emoji = span("A", "😀", "B");
    const mid = emoji.ann.from + 1;
    assert(snapUnwrappedIndex(emoji.doc, emoji.ann, mid, "start") === emoji.ann.from, "起点避开半个表情");
    assert(snapUnwrappedIndex(emoji.doc, emoji.ann, mid, "end") === emoji.ann.from + 2, "终点避开半个表情");

    console.log("annotation geom ok");
}

run();
